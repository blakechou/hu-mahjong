// 一局牌的流程引擎（純邏輯，不碰畫面）
//
// 用法：
//   const r = new Round({ seed, dealer, roundWind, streak });
//   r.start();
//   r.legalActions(seat)   // 這一家現在能做什麼
//   r.act(seat, action)    // 執行動作
//   r.on(ev => ...)        // 收事件（畫面、音效、連線都靠這個）
//
// 階段 phase：
//   'idle'    尚未開始
//   'turn'    輪到 turn 這家：出牌／自摸／暗槓／加槓
//   'claim'   有人打出牌，其他家可以 胡／碰／槓／吃／過
//   'robkan'  有人加槓，其他家可以搶槓胡
//   'end'     結束，結果在 result
//
// 動作 action：
//   { type:'discard', tile }  { type:'tsumo' }  { type:'ankan', tile }  { type:'kakan', tile }
//   { type:'hu' }  { type:'pon' }  { type:'kan' }  { type:'chi', tile:順子最小那張 }  { type:'pass' }

import { fullSet, toCounts, isFlower, isSuited, FLOWER_BASE } from './tiles.js';
import { isComplete, waits } from './hand.js';
import { scoreHand, settle, dealerTai } from './scoring.js';
import { createRng } from './rng.js';

export const RESERVE = 16; // 留 16 張不摸（海底）

const PRIORITY = { hu: 3, kan: 2, pon: 2, chi: 1, pass: 0 };

export class Round {
  constructor({ seed = 1, dealer = 0, roundWind = 0, streak = 0 } = {}) {
    this.seed = seed;
    this.dealer = dealer;
    this.roundWind = roundWind;
    this.streak = streak;
    this.rng = createRng(seed);
    this.listeners = [];
    this.phase = 'idle';
    this.players = [0, 1, 2, 3].map(() => ({
      hand: [], melds: [], discards: [], flowers: [], draws: 0,
    }));
    this.turn = dealer;
    this.drawn = null;        // 這回合摸進來的牌（吃碰後為 null）
    this.lastDiscard = null;  // { seat, tile, index }
    this.claims = null;       // { tile, from, options:{seat:[actions]}, responses:{seat:action}, kind }
    this.anyCall = false;     // 有沒有人吃碰槓過（天胡、地胡用）
    this.afterKan = false;    // 這次摸牌是不是槓後補牌
    this.result = null;
  }

  // ---------- 事件 ----------
  on(fn) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter(f => f !== fn); }; }
  emit(type, data = {}) { const ev = { type, ...data }; for (const f of this.listeners) f(ev); }

  // ---------- 工具 ----------
  seatWind(p) { return (p - this.dealer + 4) % 4; }
  get remaining() { return this.tail - this.head; }
  setsNeeded(p) { return 5 - this.players[p].melds.length; }
  counts(p) { return toCounts(this.players[p].hand); }
  removeTiles(p, tile, n) {
    const h = this.players[p].hand;
    for (let k = 0; k < n; k++) {
      const i = h.indexOf(tile);
      if (i < 0) throw new Error(`座位 ${p} 手上沒有 ${tile}`);
      h.splice(i, 1);
    }
  }
  sortHand(p) { this.players[p].hand.sort((a, b) => a - b); }

  // ---------- 開局 ----------
  start() {
    this.wall = this.rng.shuffle(fullSet());
    this.head = 0;
    this.tail = this.wall.length;
    // 莊家擲三顆骰子決定從哪裡開門（只影響畫面上從牌墩哪裡開始抓）
    this.dice = [0, 0, 0].map(() => 1 + this.rng.int(6));
    // 每人輪流抓 4 張、抓 4 輪
    for (let r = 0; r < 4; r++) {
      for (let q = 0; q < 4; q++) {
        const p = (this.dealer + q) % 4;
        for (let k = 0; k < 4; k++) this.players[p].hand.push(this.wall[this.head++]);
      }
    }
    this.emit('deal', { hands: this.players.map(P => P.hand.slice()) });
    // 從莊家開始輪流補花，直到沒人手上有花
    let again = true;
    while (again && this.phase !== 'end') {
      again = false;
      for (let q = 0; q < 4 && this.phase !== 'end'; q++) {
        const p = (this.dealer + q) % 4;
        const P = this.players[p];
        const fl = P.hand.filter(isFlower);
        if (!fl.length) continue;
        again = true;
        P.hand = P.hand.filter(t => !isFlower(t));
        for (const f of fl) {
          P.flowers.push(f);
          this.emit('flower', { seat: p, tile: f });
          if (this.checkFlowerWin(p)) return;
          const t = this.takeTile(true);
          if (t == null) return this.exhausted();
          P.hand.push(t);
          this.emit('replace', { seat: p, tile: t });
        }
      }
    }
    for (let p = 0; p < 4; p++) this.sortHand(p);
    this.phase = 'turn';
    this.drawFor(this.dealer, false);
  }

  /** 從牌牆拿一張；fromTail = 補花／槓的補牌。到海底回傳 null */
  takeTile(fromTail) {
    if (this.remaining <= RESERVE) return null;
    return fromTail ? this.wall[--this.tail] : this.wall[this.head++];
  }

  drawFor(p, fromTail, isKan = false) {
    const P = this.players[p];
    this.turn = p;
    let t = this.takeTile(fromTail);
    if (t == null) return this.exhausted();
    while (isFlower(t)) {
      P.flowers.push(t);
      this.emit('draw', { seat: p, tile: t, fromTail });
      this.emit('flower', { seat: p, tile: t });
      if (this.checkFlowerWin(p)) return;
      t = this.takeTile(true);
      fromTail = true;
      if (t == null) return this.exhausted();
    }
    P.hand.push(t);
    P.draws++;
    this.drawn = t;
    this.afterKan = isKan;
    this.phase = 'turn';
    this.claims = null;
    this.emit('draw', { seat: p, tile: t, fromTail });
    this.emit('turn', { seat: p });
  }

  /** 八仙過海、七搶一 */
  checkFlowerWin(p) {
    const P = this.players[p];
    if (P.flowers.length === 8) {
      this.finishWin(p, null, { special: '八仙過海' });
      return true;
    }
    const total = this.players.reduce((a, b) => a + b.flowers.length, 0);
    if (total === 8) {
      const seven = this.players.findIndex(x => x.flowers.length === 7);
      const one = this.players.findIndex(x => x.flowers.length === 1);
      if (seven >= 0 && one >= 0) {
        this.finishWin(seven, one, { special: '七搶一' });
        return true;
      }
    }
    return false;
  }

  // ---------- 合法動作 ----------
  legalActions(p) {
    if (this.phase === 'turn' && p === this.turn) return this.turnActions(p);
    if ((this.phase === 'claim' || this.phase === 'robkan') && this.claims.options[p] && !(p in this.claims.responses)) {
      return this.claims.options[p];
    }
    return [];
  }

  turnActions(p) {
    const P = this.players[p];
    const acts = [];
    const c = this.counts(p);
    if (this.drawn != null && isComplete(c, this.setsNeeded(p))) acts.push({ type: 'tsumo' });
    if (this.drawn != null && this.remaining > RESERVE) {
      for (let t = 0; t < 34; t++) if (c[t] === 4) acts.push({ type: 'ankan', tile: t });
      for (const m of P.melds) if (m.type === 'pon' && c[m.tiles[0]] >= 1) acts.push({ type: 'kakan', tile: m.tiles[0] });
    }
    for (const t of new Set(P.hand)) acts.push({ type: 'discard', tile: t });
    return acts;
  }

  /** 別人打出 tile 時，座位 p 可以做什麼 */
  claimOptions(p, tile, from) {
    const P = this.players[p];
    const c = this.counts(p);
    const opts = [];
    c[tile]++;
    if (isComplete(c, this.setsNeeded(p))) opts.push({ type: 'hu' });
    c[tile]--;
    const last = this.remaining <= RESERVE; // 河底的牌只能胡
    if (!last) {
      if (c[tile] >= 3) opts.push({ type: 'kan' });
      if (c[tile] >= 2) opts.push({ type: 'pon' });
      if (p === (from + 1) % 4 && isSuited(tile)) {
        const r = tile % 9;
        for (let s = tile - 2; s <= tile; s++) {
          const sr = r - (tile - s);
          if (sr < 0 || sr > 6) continue;
          const need = [s, s + 1, s + 2].filter(x => x !== tile);
          if (need.every(x => c[x] > 0)) opts.push({ type: 'chi', tile: s });
        }
      }
    }
    if (opts.length) opts.push({ type: 'pass' });
    return opts;
  }

  // ---------- 執行動作 ----------
  act(p, a) {
    const legal = this.legalActions(p);
    const ok = legal.some(x => x.type === a.type && (x.tile === undefined || x.tile === a.tile));
    if (!ok) throw new Error(`不合法的動作：座位 ${p} ${JSON.stringify(a)}（phase=${this.phase}）`);
    if (this.phase === 'turn') return this.doTurn(p, a);
    return this.respond(p, a);
  }

  doTurn(p, a) {
    const P = this.players[p];
    switch (a.type) {
      case 'tsumo': {
        const flags = { rinshan: this.afterKan, haitei: this.remaining <= RESERVE };
        if (!this.anyCall && P.draws === 1 && P.discards.length === 0) {
          if (p === this.dealer) flags.tenhou = true; else flags.chihou = true;
        }
        return this.finishWin(p, null, { tile: this.drawn, flags });
      }
      case 'ankan': {
        this.removeTiles(p, a.tile, 4);
        P.melds.push({ type: 'ankan', tiles: [a.tile, a.tile, a.tile, a.tile], from: p });
        this.anyCall = true;
        this.emit('meld', { seat: p, meld: P.melds.at(-1) });
        return this.drawFor(p, true, true);
      }
      case 'kakan': {
        // 先讓別人有機會搶槓
        const opts = {};
        for (let q = 0; q < 4; q++) {
          if (q === p) continue;
          const c = this.counts(q);
          c[a.tile]++;
          if (isComplete(c, this.setsNeeded(q))) opts[q] = [{ type: 'hu' }, { type: 'pass' }];
        }
        this.emit('kakanDeclare', { seat: p, tile: a.tile });
        if (Object.keys(opts).length) {
          this.phase = 'robkan';
          this.claims = { tile: a.tile, from: p, options: opts, responses: {}, kind: 'robkan' };
          this.emit('claimWindow', { tile: a.tile, from: p, seats: Object.keys(opts).map(Number), kind: 'robkan' });
          return;
        }
        return this.completeKakan(p, a.tile);
      }
      case 'discard': {
        this.removeTiles(p, a.tile, 1);
        this.sortHand(p);
        P.discards.push({ tile: a.tile, taken: false, tsumogiri: a.tile === this.drawn });
        this.drawn = null;
        this.afterKan = false;
        this.lastDiscard = { seat: p, tile: a.tile, index: P.discards.length - 1 };
        this.emit('discard', { seat: p, tile: a.tile });
        const opts = {};
        for (let q = 0; q < 4; q++) {
          if (q === p) continue;
          const o = this.claimOptions(q, a.tile, p);
          if (o.length) opts[q] = o;
        }
        if (!Object.keys(opts).length) return this.nextDraw();
        this.phase = 'claim';
        this.claims = { tile: a.tile, from: p, options: opts, responses: {}, kind: 'discard' };
        this.emit('claimWindow', { tile: a.tile, from: p, seats: Object.keys(opts).map(Number), kind: 'discard' });
        return;
      }
    }
  }

  completeKakan(p, tile) {
    const P = this.players[p];
    this.removeTiles(p, tile, 1);
    const m = P.melds.find(x => x.type === 'pon' && x.tiles[0] === tile);
    m.type = 'kakan';
    m.tiles.push(tile);
    this.anyCall = true;
    this.emit('meld', { seat: p, meld: m });
    return this.drawFor(p, true, true);
  }

  nextDraw() {
    const next = (this.lastDiscard.seat + 1) % 4;
    return this.drawFor(next, false);
  }

  respond(p, a) {
    const cl = this.claims;
    cl.responses[p] = a;
    this.emit('respond', { seat: p, action: a.type });
    this.tryResolve();
  }

  /** 等到能確定結果就處理：更高優先的人都表態了才決定 */
  tryResolve() {
    const cl = this.claims;
    const seats = Object.keys(cl.options).map(Number);
    // 從放槍者下家開始的順序（截胡：最近的人優先）
    const order = [1, 2, 3].map(k => (cl.from + k) % 4).filter(q => seats.includes(q));
    let best = null;
    for (const q of order) {
      const r = cl.responses[q];
      if (r && r.type !== 'pass' && (!best || PRIORITY[r.type] > PRIORITY[best.a.type])) best = { q, a: r };
    }
    const bestPr = best ? PRIORITY[best.a.type] : 0;
    const bestIdx = best ? order.indexOf(best.q) : Infinity;
    // 還沒表態的人，如果可能做出更高優先（或同級但順位更前）的動作，就要等他
    for (const [i, q] of order.entries()) {
      if (q in cl.responses) continue;
      const mp = Math.max(...cl.options[q].map(o => PRIORITY[o.type]));
      if (mp > bestPr || (mp === bestPr && i < bestIdx)) return;
    }
    if (!best) {
      if (cl.kind === 'robkan') return this.completeKakan(cl.from, cl.tile);
      return this.nextDraw();
    }
    return this.execClaim(best.q, best.a);
  }

  execClaim(p, a) {
    const cl = this.claims;
    const P = this.players[p];
    const tile = cl.tile;
    if (a.type === 'hu') {
      const flags = cl.kind === 'robkan'
        ? { chankan: true }
        : { houtei: this.remaining <= RESERVE };
      return this.finishWin(p, cl.from, { tile, flags, robkan: cl.kind === 'robkan' });
    }
    // 牌河那張被拿走
    const D = this.players[cl.from].discards;
    D[D.length - 1].taken = true;
    this.anyCall = true;
    if (a.type === 'pon') {
      this.removeTiles(p, tile, 2);
      P.melds.push({ type: 'pon', tiles: [tile, tile, tile], from: cl.from });
    } else if (a.type === 'kan') {
      this.removeTiles(p, tile, 3);
      P.melds.push({ type: 'minkan', tiles: [tile, tile, tile, tile], from: cl.from });
    } else if (a.type === 'chi') {
      const seq = [a.tile, a.tile + 1, a.tile + 2];
      for (const t of seq) if (t !== tile) this.removeTiles(p, t, 1);
      P.melds.push({ type: 'chi', tiles: seq, from: cl.from, claimed: tile });
    }
    this.emit('meld', { seat: p, meld: P.melds.at(-1), from: cl.from });
    this.claims = null;
    if (a.type === 'kan') return this.drawFor(p, true, true);
    this.turn = p;
    this.drawn = null;
    this.phase = 'turn';
    this.emit('turn', { seat: p });
  }

  // ---------- 結束 ----------
  finishWin(p, from, { tile, flags = {}, special, robkan } = {}) {
    const P = this.players[p];
    let score;
    if (special) {
      score = { items: [{ name: special, tai: 8 }], total: 8 };
    } else {
      const hand = from == null ? P.hand.slice() : [...P.hand, tile];
      if (robkan) {
        // 被搶槓的那張從加槓者手上拿走
        this.removeTiles(from, tile, 1);
      }
      score = scoreHand({
        hand, melds: P.melds, flowers: P.flowers, winTile: tile,
        selfDraw: from == null, seatWind: this.seatWind(p), roundWind: this.roundWind, flags,
      });
      if (from == null) P.hand = hand; else P.hand.push(tile);
      if (from != null && !robkan) {
        const D = this.players[from].discards;
        D[D.length - 1].taken = true;
      }
    }
    const isDealerInvolved = p === this.dealer;
    const dealerItems = isDealerInvolved
      ? [{ name: '莊家', tai: 1 }, ...(this.streak ? [{ name: `連${this.streak}拉${this.streak}`, tai: 2 * this.streak }] : [])]
      : [];
    const delta = settle({ winner: p, from, tai: score.total, dealer: this.dealer, streak: this.streak });
    this.result = {
      type: 'win', winner: p, from, selfDraw: from == null, tile, special: special || null,
      items: score.items, tai: score.total, dealerItems, dealerTai: dealerTai(this.streak),
      delta, hands: this.players.map(x => x.hand.slice()),
    };
    this.phase = 'end';
    this.claims = null;
    this.emit('end', { result: this.result });
  }

  exhausted() {
    this.result = { type: 'draw', delta: [0, 0, 0, 0], hands: this.players.map(x => x.hand.slice()) };
    this.phase = 'end';
    this.claims = null;
    this.emit('end', { result: this.result });
  }

  /** 給某一家看的狀態（連線時別人的手牌要藏起來） */
  viewFor(seat) {
    return {
      phase: this.phase, turn: this.turn, dealer: this.dealer, roundWind: this.roundWind, streak: this.streak,
      remaining: this.remaining - RESERVE,
      drawn: seat === this.turn ? this.drawn : null,
      lastDiscard: this.lastDiscard,
      players: this.players.map((P, i) => ({
        hand: i === seat || this.phase === 'end' ? P.hand.slice() : null,
        handCount: P.hand.length,
        melds: P.melds.map(m => (m.type === 'ankan' && i !== seat && this.phase !== 'end' ? { type: 'ankan', tiles: [null, null, null, null] } : { ...m, tiles: m.tiles.slice() })),
        discards: P.discards.slice(),
        flowers: P.flowers.slice(),
      })),
      actions: this.legalActions(seat),
      dice: this.dice || null,
      wallHead: this.wall ? this.head : 0,
      wallTail: this.wall ? this.wall.length - this.tail : 0,
      claim: this.claims ? { tile: this.claims.tile, from: this.claims.from, kind: this.claims.kind } : null,
      result: this.result,
    };
  }

  /** 聽牌提示 */
  waitsOf(p) {
    return waits(this.counts(p), this.setsNeeded(p));
  }
}

export { FLOWER_BASE };
