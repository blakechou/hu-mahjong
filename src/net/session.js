// 連線對局：房主端（HostSession）與玩家端（ClientSession）
import { openRoom, joinRoom, randomCode, cleanCode } from './room.js';
import { TableHost } from '../game/host.js';
import { SEAT_PERSONAS } from '../ai/personas.js';

const PING_MS = 4000;
const LOST_MS = 15000;

export const cleanName = s => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯﻿<>]/g, '').trim().slice(0, 8) || '雀友';

/** 本機玩家的接收端 */
export function localSink(ui) {
  return {
    state: (v, m) => ui.state(v, m),
    event: e => ui.event(e),
    say: (k, text, expr, sticky) => ui.say(k, text, expr, sticky),
    expr: (k, e, ms) => ui.expr(k, e, ms),
    sticker: (f, t, id) => ui.sticker(f, t, id),
    result: p => ui.result(p),
    final: p => ui.final(p),
    roundStart: () => ui.roundStart(),
  };
}

/** 連線玩家的接收端：全部轉成訊息送出去 */
function remoteSink(conn) {
  const send = m => { if (conn.open) conn.send(m); };
  return {
    state: (v, m) => send({ t: 'state', v, m }),
    event: e => send({ t: 'event', e }),
    say: (k, text, expr, sticky) => send({ t: 'say', k, text, expr, sticky }),
    expr: (k, e, ms) => send({ t: 'expr', k, e, ms }),
    sticker: (f, to, id) => send({ t: 'sticker', f, to, id }),
    result: p => send({ t: 'result', p }),
    final: p => send({ t: 'final', p }),
    roundStart: () => send({ t: 'roundStart' }),
  };
}

const cleanAction = a => (a && typeof a === 'object'
  ? { type: String(a.type), ...(a.tile != null ? { tile: Number(a.tile) } : {}) }
  : null);

// ======================= 房主 =======================
export class HostSession {
  constructor({ hud, name }) {
    this.hud = hud;
    this.name = name;
    this.seats = [{ kind: 'host', name }, null, null, null];
    this.started = false;
  }

  async open() {
    const { peer, code } = await openRoom();
    this.peer = peer;
    this.code = code;
    peer.on('connection', conn => this.onConn(conn));
    peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
    this.ping = setInterval(() => this.heartbeat(), PING_MS);
    this.showLobby();
    return code;
  }

  /** 房主自己的玩家介面 */
  attach(ui) { this.ui = ui; }

  onConn(conn) {
    conn.lastSeen = Date.now();
    conn.on('data', m => { conn.lastSeen = Date.now(); this.onMsg(conn, m); });
    conn.on('close', () => this.onClose(conn));
    conn.on('error', () => this.onClose(conn));
  }

  onMsg(conn, m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'hello') return this.hello(conn, m);
    const k = conn.seat;
    if (k == null || this.seats[k]?.conn !== conn) return;
    if (m.t === 'act') this.host?.act(k, cleanAction(m.a));
    else if (m.t === 'sticker') this.host?.sticker(k, Number(m.to), String(m.id));
    else if (m.t === 'leave') conn.close();
  }

  hello(conn, m) {
    const name = cleanName(m.name);
    const token = typeof m.token === 'string' ? m.token.slice(0, 40) : '';
    // 斷線重連：用之前拿到的通行碼回到原本座位
    const back = token ? this.seats.findIndex(s => s && s.token === token) : -1;
    if (back > 0) {
      const s = this.seats[back];
      if (s.conn && s.conn !== conn) s.conn.close();
      s.conn = conn; s.connected = true;
      conn.seat = back;
      conn.send({ t: 'welcome', seat: back, token, code: this.code });
      if (this.started) {
        conn.send({ t: 'start' });
        this.host.rejoin(back, remoteSink(conn));
      } else this.showLobby();
      return;
    }
    if (this.started) { conn.send({ t: 'reject', why: '這桌已經開打了' }); setTimeout(() => conn.close(), 300); return; }
    const free = [1, 2, 3].find(i => !this.seats[i]);
    if (free == null) { conn.send({ t: 'reject', why: '房間已經滿了' }); setTimeout(() => conn.close(), 300); return; }
    const t = randomCode(16);
    this.seats[free] = { kind: 'human', name, token: t, conn, connected: true };
    conn.seat = free;
    conn.send({ t: 'welcome', seat: free, token: t, code: this.code });
    this.showLobby();
  }

  onClose(conn) {
    const k = conn.seat;
    if (k == null) return;
    const s = this.seats[k];
    if (!s || s.conn !== conn) return;
    s.conn = null;
    s.connected = false;
    if (this.started) {
      this.host.takeover(k);
    } else {
      this.seats[k] = null;
      this.showLobby();
    }
  }

  heartbeat() {
    const now = Date.now();
    for (const s of this.seats) {
      if (!s?.conn) continue;
      if (now - s.conn.lastSeen > LOST_MS) { s.conn.close(); this.onClose(s.conn); continue; }
      if (s.conn.open) s.conn.send({ t: 'ping' });
    }
  }

  lobbyInfo() {
    return this.seats.map((s, i) => (s
      ? { name: s.name, kind: s.kind === 'host' ? 'host' : s.connected ? 'human' : 'away' }
      : { name: SEAT_PERSONAS[i].short, kind: 'ai' }));
  }

  showLobby() {
    if (this.started) return;
    const seats = this.lobbyInfo();
    this.hud.showLobby({ code: this.code, seats, isHost: true, onStart: () => this.start(), onLeave: () => this.leave() });
    for (const s of this.seats) if (s?.conn?.open) s.conn.send({ t: 'lobby', code: this.code, seats });
  }

  start() {
    this.started = true;
    this.hud.hideLobby();
    const seats = this.seats.map((s, k) => {
      if (k === 0) return { kind: 'local', name: this.name, sink: localSink(this.ui) };
      if (s && s.conn) return { kind: 'remote', name: s.name, sink: remoteSink(s.conn) };
      if (s) return { kind: 'ai', name: s.name };  // 開始前就斷線的人
      return { kind: 'ai', name: SEAT_PERSONAS[k].short };
    });
    // 開始前就斷線的人由電腦代打，回來還能接手
    this.host = new TableHost({ seats, timed: seats.some(s => s.kind === 'remote') });
    seats.forEach((s, k) => { if (k > 0 && this.seats[k] && s.kind === 'ai') this.host.seats[k].takeover = true; });
    for (const s of this.seats) if (s?.conn?.open) s.conn.send({ t: 'start' });
    this.host.newMatch();
  }

  leave() {
    clearInterval(this.ping);
    for (const s of this.seats) s?.conn?.close();
    this.peer?.destroy();
    location.href = location.pathname;
  }
}

// ======================= 玩家 =======================
export class ClientSession {
  constructor({ hud }) {
    this.hud = hud;
    this.leaving = false;
  }

  async join(code, name, ui) {
    this.code = cleanCode(code);
    this.ui = ui;
    const { peer, conn } = await joinRoom(this.code);
    this.peer = peer;
    this.conn = conn;
    let token = '';
    try { token = sessionStorage.getItem(`hu-mahjong-token-${this.code}`) || ''; } catch (e) { /* 無痕模式 */ }
    conn.on('data', m => { this.lastSeen = Date.now(); this.onMsg(m); });
    conn.on('close', () => this.lost());
    this.lastSeen = Date.now();
    this.watch = setInterval(() => { if (Date.now() - this.lastSeen > LOST_MS) this.lost(); }, 2000);
    conn.send({ t: 'hello', name, token });
  }

  send(m) { if (this.conn?.open) this.conn.send(m); }

  onMsg(m) {
    if (!m || typeof m !== 'object') return;
    const ui = this.ui;
    switch (m.t) {
      case 'ping': this.send({ t: 'pong' }); break;
      case 'welcome':
        try { sessionStorage.setItem(`hu-mahjong-token-${this.code}`, m.token); } catch (e) { /* 無痕模式 */ }
        break;
      case 'lobby':
        this.hud.showLobby({ code: m.code, seats: m.seats, isHost: false, onLeave: () => this.leave() });
        break;
      case 'reject':
        this.leaving = true;
        this.hud.notice(m.why, '回首頁', () => { location.href = location.pathname; });
        break;
      case 'start': this.hud.hideLobby(); this.hud.hideTitle(); break;
      case 'state': this.hud.hideLobby(); this.hud.hideTitle(); ui.state(m.v, m.m); break;
      case 'event': ui.event(m.e); break;
      case 'say': ui.say(m.k, m.text, m.expr, m.sticky); break;
      case 'expr': ui.expr(m.k, m.e, m.ms); break;
      case 'sticker': ui.sticker(m.f, m.to, m.id); break;
      case 'result': ui.result(m.p); break;
      case 'final': ui.final(m.p); break;
      case 'roundStart': ui.roundStart(); break;
    }
  }

  lost() {
    if (this.leaving) return;
    this.leaving = true;
    clearInterval(this.watch);
    this.peer?.destroy();
    this.hud.notice('和房主的連線斷了。<br>房主還在的話，重新用同一個房號加入就能回到原本的座位。', '回首頁', () => {
      location.href = `${location.pathname}?room=${this.code}`;
    });
  }

  leave() {
    this.leaving = true;
    this.send({ t: 'leave' });
    this.peer?.destroy();
    location.href = location.pathname;
  }
}
