// 單機遊戲流程：玩家（座位 0）＋三位電腦街坊
import { Match } from '../core/match.js';
import { tileName } from '../core/tiles.js';
import { decideTurn, decideClaim } from '../ai/ai.js';
import { SEAT_PERSONAS } from '../ai/personas.js';

export const NAMES = ['你', '阿伯', '阿珠姨', '林老師'];
const ME = 0;
const CLAIM_DELAY = 380;
const AFTER_CALL_DELAY = 650;

const MELD_SHOUT = { chi: '吃！', pon: '碰！', minkan: '槓！', kakan: '槓！', ankan: '暗槓！' };

export class Game {
  constructor(view, hud) {
    this.view = view;
    this.hud = hud;
    this.token = 0;
    view.onTileClick = t => this.humanDiscard(t);
    view.onHover = t => this.hud.tip(t != null ? tileName(t) : '');
  }

  newMatch() {
    this.match = new Match({ firstDealer: Math.floor(Math.random() * 4) });
    this.startRound();
  }

  startRound() {
    const token = ++this.token;
    this.round = this.match.newRound();
    this.round.on(ev => { if (token === this.token) this.onEvent(ev); });
    this.view.lastKey = '';
    this.round.start();
    this.refresh();
    this.pump();
  }

  later(fn, ms) {
    const token = this.token;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { if (token === this.token) fn(); }, ms);
  }

  onEvent(ev) {
    switch (ev.type) {
      case 'meld':
        this.hud.shout(ev.seat, MELD_SHOUT[ev.meld.type]);
        this.pauseUntil = performance.now() + AFTER_CALL_DELAY;
        break;
      case 'flower':
        this.hud.shout(ev.seat, '補花');
        break;
      case 'kakanDeclare':
        this.hud.shout(ev.seat, '槓！');
        break;
      case 'end':
        if (ev.result.type === 'win') {
          const r = ev.result;
          this.hud.shout(r.winner, r.special || (r.selfDraw ? '自摸！' : '胡！'), 'big');
        } else {
          for (let k = 0; k < 4; k++) this.hud.shout(k, '流局');
        }
        break;
    }
  }

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
    if (r.phase === 'end') return this.later(() => this.showResult(), 1600);

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
    this.round.act(p, a);
    this.refresh();
    this.pump();
  }

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
    const label = {
      hu: () => '胡', pon: () => '碰', kan: () => '槓', pass: () => '過',
      chi: a => `吃 <small>${[a.tile, a.tile + 1, a.tile + 2].map(tileName).join('')}</small>`,
    };
    const kind = { hu: 'hu', pass: 'pass' };
    // 只回應玩家自己的選擇；回應後可能要等其他家
    this.hud.actions(acts.map(a => ({
      label: label[a.type](a), kind: kind[a.type] || 'call',
      onClick: () => this.doAct(ME, a),
    })));
    this.hud.tip(`${NAMES[r.claims.from]} 打出 ${tileName(tile)}${r.claims.kind === 'robkan' ? '（加槓）' : ''}`);
  }

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
