// 房主引擎：負責跑牌局、電腦對手、台詞、計時。
// 單機時也是它（只有一個本機玩家，其他三家是電腦）。
// 每個座位有一個 sink（接收端）：本機玩家介面或連線玩家，房主只把那一家看得到的東西送過去。
import { Match } from '../core/match.js';
import { toCounts } from '../core/tiles.js';
import { shanten } from '../core/hand.js';
import { decideTurn, decideClaim } from '../ai/ai.js';
import { SEAT_PERSONAS, PERSONAS } from '../ai/personas.js';
import { LinePicker, STICKERS } from './lines.js';

const CLAIM_DELAY = 380;
const AFTER_CALL_DELAY = 650;
const TALK_GAP = 2500;
const IDLE_FIRST = 15000, IDLE_SECOND = 35000;
const RESULT_DELAY = 1800;
// 連線對局的思考時間
export const LIMITS = { turn: 40000, firstTurn: 60000, claim: 15000, roll: 15000 };
// 開局動畫的時間（房主等這麼久才開始打，畫面那邊照這個時間播）
export const INTRO = { seatDraw: 5600, dice: 1700, dealStep: 170, dealSteps: 17, tail: 700 };
export const DEAL_MS = INTRO.dice + INTRO.dealStep * INTRO.dealSteps + INTRO.tail;

const EXPR = {
  start: 'normal', call: 'proud', tenpai: 'proud', tsumo: 'laugh', ron: 'laugh', dealIn: 'upset',
  otherWin: 'upset', draw: 'normal', idle: 'normal', taunted: 'upset',
};
const STICKY = new Set(['tsumo', 'ron', 'dealIn', 'otherWin']);
const pickOne = arr => arr[Math.floor(Math.random() * arr.length)];

export class TableHost {
  /**
   * seats: [{ kind:'local'|'remote'|'ai', name, sink }]
   * timed: 是否限制思考時間（連線時開啟）
   */
  constructor({ seats, timed = false }) {
    // pid：玩家編號（不會變）；抓位之後座位會重排
    this.seats = seats.map((s, k) => ({ ...s, pid: k, persona: SEAT_PERSONAS[k], takeover: false }));
    this.timed = timed;
    this.token = 0;
    this.lines = new LinePicker();
    this.talkBusyUntil = 0;
    this.timers = new Set();
    this.waitingNext = false;
  }

  // ---------- 座位 ----------
  seatOf(pid) { return this.seats.findIndex(s => s.pid === pid); }
  all() { return [0, 1, 2, 3]; }
  isAI(k) { return this.seats[k].kind === 'ai'; }
  /** 有角色個性、會講話的電腦（不是斷線代打） */
  isCharacter(k) { return this.isAI(k) && !this.seats[k].takeover; }
  personaOf(k) { return this.isCharacter(k) ? this.seats[k].persona : (this.seats[k].persona || PERSONAS.lin); }
  names() {
    return this.seats.map(s => (s.kind === 'ai' && !s.takeover ? s.persona.short : s.takeover ? `${s.name}(代打)` : s.name));
  }
  faces() { return this.seats.map((s, k) => (this.isCharacter(k) ? s.persona.id : null)); }
  sinks() { return this.seats.map((s, k) => ({ k, sink: s.sink })).filter(x => x.sink); }
  each(fn) { for (const { k, sink } of this.sinks()) fn(sink, k); }

  /** 連線玩家斷線：改由電腦代打 */
  takeover(pid) {
    const k = this.seatOf(pid);
    const s = this.seats[k];
    if (s.kind !== 'remote') return;
    s.kind = 'ai'; s.takeover = true; s.sink = null;
    // 正好輪到他擲骰子：電腦幫他擲
    if (this.intro === 'roll' && this.round?.dealer === k) this.later(() => this.doRoll(), 800);
    this.broadcast();
    this.pump();
  }

  /** 斷線的玩家回來了 */
  rejoin(pid, sink) {
    const k = this.seatOf(pid);
    const s = this.seats[k];
    s.kind = 'remote'; s.takeover = false; s.sink = sink;
    this.broadcast();
    if (this.lastResult) sink.result(this.lastResult);
    this.pump();
  }

  // ---------- 計時器（換局時全部清掉） ----------
  later(fn, ms) {
    const token = this.token;
    const id = setTimeout(() => { this.timers.delete(id); if (token === this.token) fn(); }, ms);
    this.timers.add(id);
    return id;
  }
  clearTimers() { this.timers.forEach(clearTimeout); this.timers.clear(); }

  // ---------- 流程 ----------
  /** 新的一將：先抓位（四張風牌決定座位，抓到東的當第一個莊），再開打 */
  newMatch() {
    this.token++;
    this.clearTimers();
    this.round = null;
    this.intro = null;
    this.deadline = null;
    this.lastResult = null;
    this.waitingNext = false;
    const winds = [0, 1, 2, 3];
    for (let i = 3; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [winds[i], winds[j]] = [winds[j], winds[i]]; }
    const picks = this.seats.map((s, k) => ({ oldSeat: k, wind: winds[k] }));
    const names = this.names(), faces = this.faces();
    this.each((sink, k) => sink.event({ type: 'seatDraw', you: k, picks, names, faces }));
    const next = [];
    this.seats.forEach((s, k) => { next[winds[k]] = s; });
    this.seats = next;
    this.match = new Match({ firstDealer: 0 });
    this.later(() => this.startRound(), INTRO.seatDraw);
  }

  startRound() {
    this.token++;
    this.clearTimers();
    this.lastResult = null;
    this.waitingNext = false;
    const token = this.token;
    this.round = this.match.newRound();
    this.round.on(ev => { if (token === this.token) this.onRoundEvent(ev); });
    this.lines.reset();
    this.aiTenpai = [false, false, false, false];
    this.each(s => s.roundStart?.());
    // 洗牌、抓牌在引擎裡一次做完，畫面那邊再照順序播動畫；這段時間的事件不送出去
    this.starting = true;
    this.round.start();
    this.starting = false;
    const chars = this.all().filter(k => this.isCharacter(k));
    if (chars.length) this.talk(pickOne(chars), 'start', { prob: this.match.history.length === 0 ? 1 : 0.4, delay: 600 });
    // 等莊家擲骰子
    this.intro = 'roll';
    const d = this.round.dealer;
    if (this.isAI(d)) this.later(() => this.doRoll(), 1200);
    else if (this.timed) this.setDeadline(LIMITS.roll, () => this.doRoll());
    this.broadcast();
  }

  /** 莊家擲骰（玩家按按鈕，或電腦自動） */
  roll(pid) {
    if (this.intro === 'roll' && this.round && this.seatOf(pid) === this.round.dealer) this.doRoll();
  }

  doRoll() {
    if (this.intro !== 'roll') return;
    this.clearTimers();
    this.deadline = null;
    this.intro = 'deal';
    this.each(s => s.event({ type: 'dice', dice: this.round.dice, seat: this.round.dealer }));
    this.broadcast();
    this.later(() => { this.intro = null; this.pump(); }, DEAL_MS);
  }

  /** 某家做了動作（本機或連線玩家都走這裡）；不合法就回傳 false */
  act(pid, a) {
    const k = this.seatOf(pid);
    const r = this.round;
    if (!r || this.intro || r.phase === 'end' || k < 0 || this.isAI(k)) return false;
    try { r.act(k, a); } catch (e) { return false; }
    if (a.type === 'discard') this.afterDiscard(k);
    this.pump();
    return true;
  }

  aiAct(k, a) {
    this.round.act(k, a);
    if (a.type === 'discard') this.afterDiscard(k);
    this.pump();
  }

  pump() {
    const r = this.round;
    if (!r) return;
    if (this.intro) { this.broadcast(); return; }
    this.clearTimers();
    this.deadline = null;
    if (r.phase === 'end') {
      this.broadcast();
      if (!this.lastResult) this.later(() => this.finishRound(), RESULT_DELAY);
      return;
    }
    const wait = Math.max(0, (this.pauseUntil || 0) - performance.now());
    if (r.phase === 'turn') {
      const k = r.turn;
      if (this.isAI(k)) {
        this.later(() => this.aiAct(k, decideTurn(r, k, this.personaOf(k))), wait + this.personaOf(k).think);
      } else {
        this.startIdle(k);
        if (this.timed) {
          const first = r.players[k].discards.length === 0;
          this.setDeadline(first ? LIMITS.firstTurn : LIMITS.turn, () => this.aiAct(k, decideTurn(r, k, PERSONAS.lin)));
        }
      }
    } else {
      const pending = Object.keys(r.claims.options).map(Number).filter(q => !(q in r.claims.responses));
      const ai = pending.find(q => this.isAI(q));
      if (ai !== undefined) this.later(() => this.aiAct(ai, decideClaim(r, ai, this.personaOf(ai))), CLAIM_DELAY);
      if (this.timed && pending.some(q => !this.isAI(q))) {
        this.setDeadline(LIMITS.claim, () => {
          for (const q of pending) if (!this.isAI(q) && !(q in r.claims.responses) && (r.phase === 'claim' || r.phase === 'robkan')) {
            try { r.act(q, { type: 'pass' }); } catch (e) { /* 已經結束了 */ }
          }
          this.pump();
        });
      }
    }
    this.broadcast();
  }

  setDeadline(ms, onTimeout) {
    this.deadline = Date.now() + ms;
    this.later(onTimeout, ms);
  }

  afterDiscard(k) {
    const r = this.round;
    if (r.phase === 'end' || !this.isCharacter(k)) return;
    const sh = shanten(toCounts(r.players[k].hand), r.setsNeeded(k));
    if (sh === 0 && !this.aiTenpai[k]) {
      this.aiTenpai[k] = true;
      this.talk(k, 'tenpai', { prob: 0.6, delay: 300 });
    }
  }

  // ---------- 送資料給每一家 ----------
  meta(k) {
    const m = this.match;
    return {
      mySeat: k,
      label: m.label,
      scores: m.scores.slice(),
      names: this.names(),
      faces: this.faces(),
      deadlineIn: this.deadline ? Math.max(0, this.deadline - Date.now()) : null,
      intro: this.intro || null,
      timed: this.timed,
    };
  }

  broadcast() {
    if (!this.round) return;
    this.each((sink, k) => sink.state(this.round.viewFor(k), this.meta(k)));
  }

  onRoundEvent(ev) {
    if (this.starting) return;
    switch (ev.type) {
      case 'discard':
      case 'flower':
      case 'kakanDeclare':
        this.each(s => s.event({ type: ev.type, seat: ev.seat, tile: ev.tile }));
        break;
      case 'draw':
        // 摸到什麼只有自己知道
        this.each((s, k) => s.event({ type: 'draw', seat: ev.seat, fromTail: !!ev.fromTail, tile: k === ev.seat ? ev.tile : null }));
        break;
      case 'meld': {
        this.pauseUntil = performance.now() + AFTER_CALL_DELAY;
        this.each(s => s.event({ type: 'meld', seat: ev.seat, meldType: ev.meld.type, n: ev.meld.tiles.length }));
        if (this.isCharacter(ev.seat)) this.talk(ev.seat, 'call', { prob: this.seats[ev.seat].persona.id === 'azhu' ? 0.85 : 0.45, delay: 250 });
        // 有人副露到 3 組以上，其他街坊會緊張
        const open = this.round.players[ev.seat].melds.filter(m => m.type !== 'ankan').length;
        if (open >= 3) for (const k of this.all()) if (k !== ev.seat && this.isCharacter(k) && !this.aiTenpai[k]) this.expr(k, 'nervous', 3200);
        break;
      }
      case 'end':
        this.each(s => s.event({ type: 'end', result: ev.result }));
        this.reactToEnd(ev.result);
        break;
    }
  }

  reactToEnd(r) {
    const chars = this.all().filter(k => this.isCharacter(k));
    if (r.type !== 'win') {
      if (chars.length) this.talk(pickOne(chars), 'draw', { force: true, delay: 500 });
      return;
    }
    if (this.isCharacter(r.winner)) this.talk(r.winner, r.selfDraw ? 'tsumo' : 'ron', { force: true, delay: 300 });
    if (r.from != null && this.isCharacter(r.from)) this.talk(r.from, 'dealIn', { force: true, delay: 1400 });
    else {
      const others = chars.filter(k => k !== r.winner);
      if (others.length) this.talk(pickOne(others), 'otherWin', { force: true, delay: 1400 });
    }
  }

  // ---------- 台詞、表情、貼圖 ----------
  talk(k, situation, { prob = 1, delay = 0, force = false } = {}) {
    if (!this.isCharacter(k) || Math.random() > prob) return;
    const persona = this.seats[k].persona;
    const sticky = STICKY.has(situation);
    const expr = situation === 'taunted' && persona.id !== 'azhu' ? (Math.random() < 0.5 ? 'proud' : 'upset') : EXPR[situation];
    const now = performance.now();
    const busy = !force && now < this.talkBusyUntil;
    const text = busy ? null : this.lines.pick(persona.id, situation);
    if (text) this.talkBusyUntil = now + delay + TALK_GAP;
    const send = () => this.each(s => s.say(k, text, expr, sticky));
    if (delay) setTimeout(send, delay); else send();
  }

  expr(k, expr, ms) { this.each(s => s.expr(k, expr, ms)); }

  /** 玩家丟貼圖（from 自己那邊已經播過動畫，不用再送） */
  sticker(fromPid, to, id) {
    const from = this.seatOf(fromPid);
    if (!STICKERS.some(s => s.id === id) || from === to || to < 0 || to > 3) return;
    const now = Date.now();
    const s = this.seats[from];
    if (s.lastSticker && now - s.lastSticker < 4500) return; // 防洗版
    s.lastSticker = now;
    this.each((sink, k) => { if (k !== from) sink.sticker(from, to, id); });
    if (this.isCharacter(to)) this.talk(to, 'taunted', { force: true, delay: 900 });
  }

  startIdle(k) {
    const chars = this.all().filter(q => this.isCharacter(q) && q !== k);
    if (!chars.length) return;
    const nag = () => {
      const q = pickOne(chars);
      if (this.seats[q].persona.id === 'azhu' && Math.random() < 0.6) this.each(s => s.sticker(q, k, 'hurry'));
      else this.talk(q, 'idle', { force: true });
    };
    this.later(nag, IDLE_FIRST);
    this.later(nag, IDLE_SECOND);
  }

  // ---------- 結算 ----------
  finishRound() {
    const res = this.round.result;
    const label = this.match.label;
    const dealer = this.round.dealer;
    const st = this.match.finishRound();
    this.over = st.over;
    this.lastResult = { result: res, label, names: this.names(), scores: this.match.scores.slice(), dealer, over: st.over };
    this.waitingNext = true;
    this.each(s => s.result(this.lastResult));
  }

  /** 房主按「下一局」 */
  next() {
    if (!this.waitingNext) return;
    this.waitingNext = false;
    if (this.over) {
      this.each(s => s.final({ names: this.names(), scores: this.match.scores.slice() }));
      this.finalShown = true;
    } else this.startRound();
  }

  /** 房主按「再一將」 */
  again() {
    this.finalShown = false;
    this.newMatch();
  }

  stop() {
    this.token++;
    this.clearTimers();
    this.round = null;
  }
}
