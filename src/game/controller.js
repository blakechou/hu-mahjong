// 單機遊戲流程：玩家（座位 0）＋三位電腦街坊
import { Match } from '../core/match.js';
import { tileName, toCounts } from '../core/tiles.js';
import { shanten } from '../core/hand.js';
import { decideTurn, decideClaim } from '../ai/ai.js';
import { SEAT_PERSONAS } from '../ai/personas.js';
import { LinePicker, STICKERS } from './lines.js';
import { discardAdvice, describeDiscard, currentWaits, shantenAfterCall, shantenText } from './coach.js';

export const NAMES = ['你', '阿伯', '阿珠姨', '林老師'];
const ME = 0;
const AI_SEATS = [1, 2, 3];
const CLAIM_DELAY = 380;
const AFTER_CALL_DELAY = 650;
const TALK_GAP = 2500;          // 兩句台詞之間至少隔多久
const IDLE_FIRST = 15000;       // 玩家想多久，對手開始催
const IDLE_SECOND = 35000;
const DANGER_COOLDOWN = 12000;

const MELD_SHOUT = { chi: '吃！', pon: '碰！', minkan: '槓！', kakan: '槓！', ankan: '暗槓！' };
const pickOne = arr => arr[Math.floor(Math.random() * arr.length)];

export class Game {
  constructor(view, hud) {
    this.view = view;
    this.hud = hud;
    this.token = 0;
    this.lines = new LinePicker();
    this.talkBusyUntil = 0;
    this.dangerAt = 0;
    this.idleTimers = [];
    view.onTileClick = t => this.humanDiscard(t);
    view.onHover = t => this.onHover(t);
    hud.onSticker = (to, st) => this.onSticker(to, st);
    hud.onSettings = () => this.refreshCoach();
  }

  get settings() { return this.hud.settings; }

  newMatch() {
    this.match = new Match({ firstDealer: Math.floor(Math.random() * 4) });
    this.startRound();
  }

  startRound() {
    const token = ++this.token;
    this.round = this.match.newRound();
    this.round.on(ev => { if (token === this.token) this.onEvent(ev); });
    this.view.lastKey = '';
    this.lines.reset();
    this.aiTenpai = [false, false, false, false];
    this.praised = false;
    this.round.start();
    this.refresh();
    const first = this.match.history.length === 0;
    this.talk(pickOne(AI_SEATS), 'start', { prob: first ? 1 : 0.4, delay: 600 });
    this.pump();
  }

  later(fn, ms) {
    const token = this.token;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { if (token === this.token) fn(); }, ms);
  }

  // ---------- 台詞 ----------
  talk(seat, situation, { prob = 1, delay = 0, force = false } = {}) {
    if (!this.settings.talk || seat === ME) return;
    if (Math.random() > prob) return;
    const now = performance.now();
    if (!force && now < this.talkBusyUntil) return;
    const line = this.lines.pick(SEAT_PERSONAS[seat].id, situation);
    if (!line) return;
    this.talkBusyUntil = now + delay + TALK_GAP;
    const token = this.token;
    setTimeout(() => { if (token === this.token || situation === 'taunted') this.hud.say(seat, line); }, delay);
  }

  onSticker(to) {
    this.talk(to, 'taunted', { force: true, delay: 900 });
  }

  onEvent(ev) {
    switch (ev.type) {
      case 'meld':
        this.hud.shout(ev.seat, MELD_SHOUT[ev.meld.type]);
        this.pauseUntil = performance.now() + AFTER_CALL_DELAY;
        if (ev.seat !== ME) this.talk(ev.seat, 'call', { prob: SEAT_PERSONAS[ev.seat].id === 'azhu' ? 0.85 : 0.45, delay: 250 });
        break;
      case 'flower':
        this.hud.shout(ev.seat, '補花');
        break;
      case 'kakanDeclare':
        this.hud.shout(ev.seat, '槓！');
        break;
      case 'end':
        this.onRoundEnd(ev.result);
        break;
    }
  }

  onRoundEnd(r) {
    if (r.type !== 'win') {
      for (let k = 0; k < 4; k++) this.hud.shout(k, '流局');
      this.talk(pickOne(AI_SEATS), 'draw', { force: true, delay: 500 });
      return;
    }
    this.hud.shout(r.winner, r.special || (r.selfDraw ? '自摸！' : '胡！'), 'big');
    if (r.winner !== ME) this.talk(r.winner, r.selfDraw ? 'tsumo' : 'ron', { force: true, delay: 300 });
    if (r.from != null && r.from !== ME) {
      this.talk(r.from, 'dealIn', { force: true, delay: 1400 });
    } else {
      const others = AI_SEATS.filter(k => k !== r.winner);
      this.talk(pickOne(others), 'otherWin', { force: true, delay: 1400 });
    }
  }

  // ---------- 畫面 ----------
  refresh() {
    const r = this.round;
    const s = { ...r.viewFor(ME), label: this.match.label };
    this.view.render(s);
    this.hud.update({ dealer: r.dealer, streak: r.streak, scores: this.match.scores, turn: r.turn, label: `${this.match.label}　剩 ${Math.max(0, s.remaining)} 張`, phase: r.phase });
  }

  /** 看現在輪到誰，安排下一步 */
  pump() {
    const r = this.round;
    this.view.setInteractive(false);
    this.hud.actions([]);
    this.clearIdle();
    this.advice = null;
    this.refreshCoach();
    if (r.phase === 'end') return this.later(() => this.showResult(), 1800);

    const wait = Math.max(0, (this.pauseUntil || 0) - performance.now());

    if (r.phase === 'turn') {
      if (r.turn === ME) return this.humanTurn();
      const p = r.turn;
      return this.later(() => this.doAct(p, decideTurn(r, p, SEAT_PERSONAS[p])), wait + SEAT_PERSONAS[p].think);
    }

    // 吃碰槓胡的時機：先讓電腦一家一家決定，玩家有選項就顯示按鈕
    const pending = Object.keys(r.claims.options).map(Number).filter(q => !(q in r.claims.responses));
    const ai = pending.find(q => q !== ME);
    if (pending.includes(ME)) this.humanClaim();
    if (ai !== undefined) {
      this.later(() => this.doAct(ai, decideClaim(r, ai, SEAT_PERSONAS[ai])), CLAIM_DELAY);
    }
  }

  doAct(p, a) {
    const r = this.round;
    r.act(p, a);
    if (a.type === 'discard') this.afterDiscard(p);
    this.refresh();
    this.pump();
  }

  afterDiscard(p) {
    const r = this.round;
    if (r.phase === 'end') return;
    const P = r.players[p];
    const sh = shanten(toCounts(P.hand), r.setsNeeded(p));
    if (p !== ME && sh === 0 && !this.aiTenpai[p]) {
      this.aiTenpai[p] = true;
      this.talk(p, 'tenpai', { prob: 0.6, delay: 300 });
    }
    if (p === ME && sh === 0 && !this.praised && this.settings.coach) {
      this.praised = true;
      this.talk(3, 'praise', { delay: 400 });
    }
  }

  // ---------- 玩家 ----------
  humanTurn() {
    const r = this.round;
    const acts = r.legalActions(ME);
    const buttons = [];
    for (const a of acts) {
      if (a.type === 'tsumo') buttons.push({ label: '自摸', kind: 'hu', onClick: () => this.doAct(ME, a) });
      if (a.type === 'ankan') buttons.push({ label: `暗槓 ${tileName(a.tile)}`, kind: 'call', onClick: () => this.doAct(ME, a) });
      if (a.type === 'kakan') buttons.push({ label: `加槓 ${tileName(a.tile)}`, kind: 'call', onClick: () => this.doAct(ME, a) });
    }
    this.hud.actions(buttons);
    this.view.setInteractive(true, acts.filter(a => a.type === 'discard').map(a => a.tile));
    this.hud.tip(buttons.length ? '' : '輪到你出牌');
    this.canTsumo = acts.some(a => a.type === 'tsumo');
    this.advice = discardAdvice(r, ME);
    this.refreshCoach();
    this.startIdle();
  }

  humanDiscard(t) {
    const r = this.round;
    if (r.phase !== 'turn' || r.turn !== ME) return;
    this.hud.tip('');
    this.doAct(ME, { type: 'discard', tile: t });
  }

  humanClaim() {
    const r = this.round;
    const acts = r.legalActions(ME);
    const tile = r.claims.tile;
    const coach = this.settings.coach;
    const now = coach ? shantenAfterCall(r, ME, { type: 'pass' }) : 0;
    const hint = a => {
      if (!coach || a.type === 'hu' || a.type === 'pass') return '';
      const after = shantenAfterCall(r, ME, a);
      const better = after < now;
      return `<small class="${better ? 'good' : 'meh'}">→ ${shantenText(after)}</small>`;
    };
    const label = {
      hu: () => '胡', pon: a => `碰${hint(a)}`, kan: a => `槓${hint(a)}`, pass: () => '過',
      chi: a => `吃 <small>${[a.tile, a.tile + 1, a.tile + 2].map(tileName).join('')}</small>${hint(a)}`,
    };
    const kind = { hu: 'hu', pass: 'pass' };
    this.hud.actions(acts.map(a => ({
      label: label[a.type](a), kind: kind[a.type] || 'call',
      onClick: () => this.doAct(ME, a),
    })));
    this.hud.tip(`${NAMES[r.claims.from]} 打出 ${tileName(tile)}${r.claims.kind === 'robkan' ? '（加槓）' : ''}`);
    if (coach && !acts.some(a => a.type === 'hu')) this.hud.coach(`現在 ${shantenText(now)}，吃碰之後手牌會變小，想清楚再決定`);
  }

  // ---------- 教學提示 ----------
  refreshCoach() {
    const r = this.round;
    if (!r || !this.settings.coach || r.phase === 'end') {
      this.view.setHint(null);
      this.hud.coach('');
      return;
    }
    if (this.advice) {
      const best = this.advice[0];
      this.view.setHint(best.tile);
      this.hud.coach(this.canTsumo ? '可以<b>自摸</b>了！' : `建議 ${describeDiscard(best).replace(/^打 (\S+)/, '打 <b>$1</b>')}`);
      return;
    }
    this.view.setHint(null);
    const w = currentWaits(r, ME);
    if (!w) return this.hud.coach('');
    if (w.shanten === 0) {
      const list = w.waits.map(x => `${tileName(x.tile)}(${x.left})`).join('、');
      this.hud.coach(`聽牌中：<b>${list || '已經沒牌可等了'}</b>`);
    } else this.hud.coach(`目前 ${shantenText(w.shanten)}`);
  }

  onHover(t) {
    this.hud.tip(t != null ? tileName(t) : '');
    if (!this.advice || !this.settings.coach) return;
    if (t == null) return this.refreshCoach();
    const info = this.advice.find(x => x.tile === t);
    if (!info) return;
    const isBest = info.tile === this.advice[0].tile;
    const text = describeDiscard(info).replace(/⚠️ 危險/, '<span class="warn">⚠️ 危險</span>');
    this.hud.coach(`${isBest ? '建議 ' : ''}${text}`);
    const now = performance.now();
    if (info.danger >= 0.35 && now - this.dangerAt > DANGER_COOLDOWN) {
      this.dangerAt = now;
      this.talk(3, 'danger', { force: true });
    }
  }

  // ---------- 玩家想太久 ----------
  startIdle() {
    this.clearIdle();
    const nag = () => {
      const seat = pickOne(AI_SEATS);
      if (this.settings.stickers && SEAT_PERSONAS[seat].id === 'azhu' && Math.random() < 0.6) {
        this.hud.throwSticker(seat, ME, STICKERS.find(s => s.id === 'hurry'));
      } else this.talk(seat, 'idle', { force: true });
    };
    this.idleTimers = [setTimeout(nag, IDLE_FIRST), setTimeout(nag, IDLE_SECOND)];
  }

  clearIdle() {
    this.idleTimers.forEach(clearTimeout);
    this.idleTimers = [];
  }

  // ---------- 結算 ----------
  showResult() {
    const res = this.round.result;
    const label = this.match.label;
    const dealer = this.round.dealer;
    const st = this.match.finishRound();
    this.hud.update({ dealer: this.match.dealer, streak: this.match.streak, scores: this.match.scores, turn: -1, label, phase: 'end' });
    this.hud.showResult({
      result: res, label, names: NAMES, scores: this.match.scores, dealer, over: st.over,
      onNext: () => {
        if (st.over) this.hud.showFinal({ names: NAMES, scores: this.match.scores, onAgain: () => this.newMatch() });
        else this.startRound();
      },
    });
  }
}
