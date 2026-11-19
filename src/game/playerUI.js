// 玩家介面：把房主送來的牌局畫出來、處理點牌與按鈕、教學提示。
// 單機與連線共用。收到的座位都是「絕對座位」，畫面上一律把自己轉到下方（相對座位 0）。
import { tileName } from '../core/tiles.js';
import { sfx } from '../ui/audio.js';
import { INTRO } from './host.js';
import { STICKERS, LinePicker } from './lines.js';
import { discardAdvice, describeDiscard, currentWaits, shantenAfterCall, shantenText, roundFromView } from './coach.js';

const MELD_SHOUT = { chi: '吃！', pon: '碰！', minkan: '槓！', kakan: '槓！', ankan: '暗槓！' };
const DANGER_COOLDOWN = 12000;
// 每家聲音的左右位置（相對座位）：自己正前方、下家右邊、對家正前方、上家左邊
const PAN = [0, 0.55, 0, -0.55];

export class PlayerUI {
  /**
   * send(action)：送出動作；sendSticker(toAbs, id)；next()／again()：房主才有
   */
  constructor(view, hud, { send, sendSticker, next, again, roll }) {
    this.view = view;
    this.hud = hud;
    this.send = send;
    this.roll = roll;
    this.busy = false;     // 正在播開局動畫（抓位、擲骰、抓牌）
    this.next = next;
    this.again = again;
    this.mySeat = 0;
    this.localLines = new LinePicker();
    this.dangerAt = 0;
    view.onTileClick = t => this.discard(t);
    view.onHover = t => this.onHover(t);
    hud.onSticker = (toRel, st) => sendSticker?.(this.abs(toRel), st.id);
    hud.onSettings = () => this.refreshCoach();
    this.countdown = setInterval(() => this.tickTimer(), 250);
  }

  get settings() { return this.hud.settings; }
  rel(k) { return (k - this.mySeat + 4) % 4; }
  abs(r) { return (r + this.mySeat) % 4; }
  rotArr(a) { return [0, 1, 2, 3].map(r => a[this.abs(r)]); }

  /** 把絕對座位的牌局轉成「自己在下方」 */
  rotateView(v) {
    const R = k => (k == null || k < 0 ? k : this.rel(k));
    return {
      ...v,
      turn: R(v.turn), dealer: R(v.dealer),
      lastDiscard: v.lastDiscard ? { ...v.lastDiscard, seat: R(v.lastDiscard.seat) } : null,
      players: this.rotArr(v.players),
    };
  }

  // ---------- 開局：抓位、擲骰、抓牌 ----------
  /** 還沒抓牌的桌面：牌墩完整、大家手上沒牌 */
  preDeal(v, step = 0) {
    const counts = [0, 0, 0, 0];
    for (let j = 0; j < Math.min(step, 16); j++) counts[(v.dealer + (j % 4)) % 4] += 4;
    if (step >= 17) counts[v.dealer] += 1;
    const mine = (v.players[this.mySeat].hand || []).slice(0, counts[this.mySeat]).sort((a, b) => a - b);
    return {
      ...v,
      phase: 'deal', drawn: null, lastDiscard: null, actions: [], turn: -1,
      wallHead: step ? Math.min(step, 16) * 4 + (step >= 17 ? 1 : 0) : 0,
      wallTail: 0,
      dice: step || this.diceShown ? v.dice : null,
      remaining: v.remaining,
      players: v.players.map((P, k) => ({
        hand: k === this.mySeat ? mine : null, handCount: counts[k], melds: [], discards: [], flowers: [],
      })),
    };
  }

  renderRaw(v, meta) {
    const rv = this.rotateView(v);
    this.view.render({ ...rv, label: meta.label });
    this.hud.update({
      dealer: rv.dealer, streak: v.streak, scores: this.rotArr(meta.scores), turn: rv.turn,
      label: `${meta.label}　剩 ${Math.max(0, v.remaining)} 張`, phase: v.phase,
    });
  }

  showIntro(v, meta) {
    const key = `${meta.names}|${meta.faces}|${this.mySeat}`;
    if (key !== this.playersKey) {
      this.playersKey = key;
      this.hud.setPlayers(this.rotArr(meta.names), this.rotArr(meta.faces));
    }
    this.view.setInteractive(false);
    this.view.setHint(null);
    this.hud.coach('');
    // 抓牌動畫已經播完、房主還在等：直接畫抓好的牌
    if (meta.intro === 'deal' && this.diceShown) {
      this.hud.actions([]);
      return this.renderRaw({ ...v, actions: [] }, meta);
    }
    this.renderRaw(this.preDeal(v), meta);
    if (meta.intro === 'roll') {
      if (v.dealer === this.mySeat && this.roll) {
        this.hud.tip('你是莊家，擲骰子決定從哪裡開門');
        this.hud.actions([{ label: '🎲 擲骰子', kind: 'hu', onClick: () => this.roll() }]);
      } else {
        this.hud.actions([]);
        this.hud.tip(`等 ${meta.names[v.dealer]} 擲骰子…`);
      }
    }
  }

  /** 抓位動畫 */
  async seatDraw(ev) {
    this.busy = true;
    this.hud.hideResult();
    this.hud.actions([]);
    this.hud.coach('');
    this.view.clearDice();
    this.diceShown = false;
    this.v = null;
    this.mySeat = ev.you;
    this.playersKey = '';
    this.hud.setPlayers(this.rotArr(ev.names), this.rotArr(ev.faces));
    this.hud.resetExpr();
    // 空桌：清掉上一將的牌
    this.view.render({
      phase: 'deal', turn: -1, dealer: 0, players: [0, 1, 2, 3].map(() => ({ hand: [], handCount: 0, melds: [], discards: [], flowers: [] })),
      remaining: 0, label: '抓位', lastDiscard: null, dice: null, wallHead: 0, wallTail: 0,
    });
    this.hud.tip('抓位：每人抓一張風牌，抓到「東」的先當莊');
    const W = '東南西北';
    const picks = ev.picks.map(p => ({ seatRel: this.rel(p.oldSeat), wind: p.wind }));
    await this.view.seatDraw(picks, i => {
      const p = ev.picks[i];
      this.hud.shout(this.rel(p.oldSeat), `抓到${W[p.wind]}`, p.wind === 0 ? 'big' : '');
      sfx.flower();
    });
    this.hud.tip('');
    this.busy = false;
    if (this.v) this.state(this.v, this.meta);
  }

  /** 擲骰子＋抓牌動畫 */
  async dealIntro(ev) {
    this.busy = true;
    this.hud.actions([]);
    this.hud.tip('');
    const v = this.v;
    const dealerRel = this.rel(ev.seat);
    await this.view.rollDice(ev.dice, dealerRel, () => sfx.diceHit());
    this.diceShown = true;
    const total = ev.dice.reduce((a, b) => a + b, 0);
    this.hud.shout(dealerRel, `${total} 點`, 'big');
    await this.view.wait(Math.max(0, INTRO.dice - 1300));
    // 抓牌：從莊家開始，每人一次抓四張，抓四輪；最後莊家再跳一張
    const meta = this.meta;
    const base = this.preDeal(v, 0);
    for (let step = 1; step <= 17; step++) {
      const j = step - 1;
      const who = step === 17 ? v.dealer : (v.dealer + (j % 4)) % 4;
      const rv = this.rotateView(base);
      this.view.dealGrab(rv, j * 4, step === 17 ? 1 : 4, this.rel(who));
      sfx.draw(PAN[this.rel(who)], 0.8);
      await this.view.wait(INTRO.dealStep);
      this.renderRaw(this.preDeal(v, step), meta);
    }
    await this.view.wait(200);
    this.busy = false;
    // 補花
    const latest = this.v;
    latest.players.forEach((P, k) => { if (P.flowers.length) { this.hud.shout(this.rel(k), `補花 ×${P.flowers.length}`); } });
    if (latest.players.some(P => P.flowers.length)) sfx.flower();
    this.state(this.v, this.meta);
  }

  roundStart() {
    this.view.sortHand();
    this.view.meldCounts = [0, 0, 0, 0];
    this.diceShown = false;
    this.view.clearDice();
    this.hud.hideResult();
    this.localLines.reset();
    this.praised = false;
    this.hud.resetExpr();
    this.view.lastKey = '';
    sfx.shuffle();
  }

  // ---------- 收到牌局 ----------
  state(v, meta) {
    this.v = v;
    this.meta = meta;
    this.extraHead = 0;
    this.extraTail = 0;
    // 動畫播放中：先存起來，播完再畫
    if (this.busy) return;
    this.mySeat = meta.mySeat;
    if (meta.intro) return this.showIntro(v, meta);
    this.deadline = meta.deadlineIn != null ? performance.now() + meta.deadlineIn : null;
    const key = `${meta.names}|${meta.faces}|${this.mySeat}`;
    if (key !== this.playersKey) {
      this.playersKey = key;
      this.hud.setPlayers(this.rotArr(meta.names), this.rotArr(meta.faces));
    }
    const rv = this.rotateView(v);
    this.view.render({ ...rv, label: meta.label });
    this.hud.update({
      dealer: rv.dealer, streak: v.streak, scores: this.rotArr(meta.scores), turn: rv.turn,
      label: `${meta.label}　剩 ${Math.max(0, v.remaining)} 張`, phase: v.phase,
    });

    const acts = v.actions || [];
    const myTurn = v.phase === 'turn' && v.turn === this.mySeat && acts.length > 0;
    const myClaim = (v.phase === 'claim' || v.phase === 'robkan') && acts.length > 0;
    const stepKey = `${v.phase}:${v.turn}:${v.remaining}:${v.lastDiscard?.index}:${v.lastDiscard?.seat}`;
    const fresh = stepKey !== this.stepKey;
    this.stepKey = stepKey;

    this.advice = null;
    if (myTurn) this.myTurn(acts, fresh);
    else if (myClaim) this.myClaim(acts);
    else {
      this.view.setInteractive(false);
      this.hud.actions([]);
      if (fresh) this.hud.tip('');
    }
    this.refreshCoach();
    this.checkPraise();
  }

  myTurn(acts, fresh) {
    const buttons = [];
    for (const a of acts) {
      if (a.type === 'tsumo') buttons.push({ label: '自摸', kind: 'hu', onClick: () => this.send(a) });
      if (a.type === 'ankan') buttons.push({ label: `暗槓 ${tileName(a.tile)}`, kind: 'call', onClick: () => this.send(a) });
      if (a.type === 'kakan') buttons.push({ label: `加槓 ${tileName(a.tile)}`, kind: 'call', onClick: () => this.send(a) });
    }
    this.hud.actions(buttons);
    this.view.setInteractive(true, acts.filter(a => a.type === 'discard').map(a => a.tile));
    if (fresh) this.hud.tip(buttons.length ? '' : '輪到你出牌');
    this.canTsumo = acts.some(a => a.type === 'tsumo');
    this.advice = discardAdvice(roundFromView(this.v), this.mySeat);
    if (fresh) sfx.yourTurn();
  }

  discard(t) {
    const v = this.v;
    if (!v || v.phase !== 'turn' || v.turn !== this.mySeat) return;
    if (!v.actions.some(a => a.type === 'discard' && a.tile === t)) return;
    this.hud.tip('');
    this.view.setInteractive(false);
    this.send({ type: 'discard', tile: t });
  }

  myClaim(acts) {
    const v = this.v;
    const coach = this.settings.coach;
    const rl = roundFromView(v);
    const now = coach ? shantenAfterCall(rl, this.mySeat, { type: 'pass' }) : 0;
    const hint = a => {
      if (!coach || a.type === 'hu' || a.type === 'pass') return '';
      const after = shantenAfterCall(rl, this.mySeat, a);
      return `<small class="${after < now ? 'good' : 'meh'}">→ ${shantenText(after)}</small>`;
    };
    const label = {
      hu: () => '胡', pon: a => `碰${hint(a)}`, kan: a => `槓${hint(a)}`, pass: () => '過',
      chi: a => `吃 <small>${[a.tile, a.tile + 1, a.tile + 2].map(tileName).join('')}</small>${hint(a)}`,
    };
    const kind = { hu: 'hu', pass: 'pass' };
    this.view.setInteractive(false);
    this.hud.actions(acts.map(a => ({ label: label[a.type](a), kind: kind[a.type] || 'call', onClick: () => this.send(a) })));
    const from = this.meta.names[v.claim.from];
    this.hud.tip(`${from} 打出 ${tileName(v.claim.tile)}${v.claim.kind === 'robkan' ? '（加槓）' : ''}`);
    this.claimCoach = coach && !acts.some(a => a.type === 'hu') ? `現在 ${shantenText(now)}，吃碰之後手牌會變小，想清楚再決定` : '';
  }

  // ---------- 教學提示 ----------
  refreshCoach() {
    const v = this.v;
    if (!v || !this.settings.coach || v.phase === 'end') {
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
    if ((v.phase === 'claim' || v.phase === 'robkan') && v.actions.length && this.claimCoach) return this.hud.coach(this.claimCoach);
    const w = currentWaits(roundFromView(v), this.mySeat);
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
    this.hud.coach(`${isBest ? '建議 ' : ''}${describeDiscard(info).replace(/⚠️ 危險/, '<span class="warn">⚠️ 危險</span>')}`);
    const now = performance.now();
    const lin = this.linSeat();
    if (info.danger >= 0.35 && lin != null && now - this.dangerAt > DANGER_COOLDOWN) {
      this.dangerAt = now;
      this.localSay(lin, 'danger', 'nervous');
    }
  }

  /** 林老師在桌上（是電腦）的話，他的相對座位 */
  linSeat() {
    const i = this.meta?.faces.indexOf('lin');
    return i >= 0 ? i : null;
  }

  localSay(absSeat, situation, expr) {
    const text = this.localLines.pick('lin', situation);
    this.say(absSeat, text, expr, false);
  }

  checkPraise() {
    const v = this.v;
    if (this.praised || !this.settings.coach || v.phase === 'end' || v.turn === this.mySeat && v.phase === 'turn') return;
    const lin = this.linSeat();
    if (lin == null) return;
    const w = currentWaits(roundFromView(v), this.mySeat);
    if (w && w.shanten === 0) {
      this.praised = true;
      setTimeout(() => this.localSay(lin, 'praise', 'proud'), 400);
    }
  }

  // ---------- 倒數 ----------
  tickTimer() {
    const v = this.v;
    const mine = v && v.actions && v.actions.length && this.deadline && v.phase !== 'end';
    this.hud.timer(mine ? Math.ceil((this.deadline - performance.now()) / 1000) : null);
  }

  // ---------- 事件 ----------
  event(ev) {
    const R = k => this.rel(k);
    // 開局動畫依序排隊播放，前一段還沒播完就先等
    if (ev.type === 'seatDraw' || ev.type === 'dice') {
      this.busy = true;
      this.chain = (this.chain || Promise.resolve())
        .then(() => (ev.type === 'seatDraw' ? this.seatDraw(ev) : this.dealIntro(ev)))
        .catch(e => { console.error(e); this.busy = false; });
      return;
    }
    if (this.busy) return;
    switch (ev.type) {
      case 'discard': sfx.discard(0.28, PAN[R(ev.seat)]); break;
      case 'draw': {
        if (ev.seat === this.mySeat) sfx.draw(0, 1); else sfx.draw(PAN[R(ev.seat)], 0.45);
        // 從牌墩飛一張到那家手上；連續補花時自己累加已經拿走的張數
        const v = this.v;
        if (v && v.dice) {
          const head = v.wallHead + (this.extraHead || 0), tail = v.wallTail + (this.extraTail || 0);
          this.view.drawFly(this.rotateView(v), R(ev.seat), ev.fromTail, head, tail);
          if (ev.fromTail) this.extraTail = (this.extraTail || 0) + 1; else this.extraHead = (this.extraHead || 0) + 1;
        }
        break;
      }
      case 'meld':
        this.hud.shout(R(ev.seat), MELD_SHOUT[ev.meldType]);
        sfx.call(ev.n, PAN[R(ev.seat)]);
        break;
      case 'flower': this.hud.shout(R(ev.seat), '補花'); sfx.flower(PAN[R(ev.seat)]); break;
      case 'kakanDeclare': this.hud.shout(R(ev.seat), '槓！'); break;
      case 'end': {
        const r = ev.result;
        this.view.setInteractive(false);
        this.hud.actions([]);
        if (r.type !== 'win') {
          for (let k = 0; k < 4; k++) this.hud.shout(k, '流局');
          sfx.drawGame();
          break;
        }
        const w = R(r.winner);
        this.hud.shout(w, r.special || (r.selfDraw ? '自摸！' : '胡！'), 'big');
        this.hud.celebrate(w, w === 0);
        if (w === 0) sfx.win(true);
        else if (r.from === this.mySeat) { sfx.win(false); setTimeout(() => sfx.lose(), 900); }
        else sfx.win(false);
        break;
      }
    }
  }

  say(k, text, expr, sticky) {
    const r = this.rel(k);
    if (expr) this.hud.setExpr(r, expr, sticky ? 0 : 3200);
    if (text && this.settings.talk) this.hud.say(r, text);
  }

  expr(k, expr, ms) { this.hud.setExpr(this.rel(k), expr, ms); }

  sticker(from, to, id) {
    if (!this.settings.stickers) return;
    const st = STICKERS.find(s => s.id === id);
    if (st) this.hud.throwSticker(this.rel(from), this.rel(to), st);
  }

  result(p) {
    this.view.setInteractive(false);
    this.hud.actions([]);
    this.hud.coach('');
    this.hud.showResult({ ...p, onNext: this.next ? () => this.next() : null });
  }

  final(p) {
    this.hud.showFinal({ ...p, onAgain: this.again ? () => this.again() : null });
  }
}
