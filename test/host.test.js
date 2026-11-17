import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TableHost } from '../src/game/host.js';
import { decideTurn, decideClaim } from '../src/ai/ai.js';
import { PERSONAS } from '../src/ai/personas.js';
import { roundFromView } from '../src/game/coach.js';

/** 假的連線玩家：只看得到 sink 收到的東西，用 AI 依自己的視角做決定 */
function fakeRemote(k, log) {
  const me = { k, views: 0, leaks: [] };
  me.sink = {
    state(v, m) {
      me.views++;
      me.last = v;
      v.players.forEach((P, j) => {
        if (j !== k && v.phase !== 'end' && P.hand) me.leaks.push(`看到座位 ${j} 的手牌`);
        if (j !== k && v.phase !== 'end') for (const md of P.melds) if (md.type === 'ankan' && md.tiles.some(t => t != null)) me.leaks.push('看到別人的暗槓');
      });
      if (v.drawn != null && v.turn !== k) me.leaks.push('看到別人摸的牌');
      assert.equal(m.mySeat, k);
    },
    event(e) { if (e.type === 'draw' && e.seat !== k && e.tile != null) me.leaks.push('事件洩漏摸牌'); log.push(e.type); },
    say() {}, expr() {}, sticker() {}, roundStart() {},
    result(p) { me.result = p; }, final() {},
  };
  return me;
}

test('房主引擎：連線玩家只收到自己看得到的資訊，整局能打完', async () => {
  const log = [];
  const players = [0, 1].map(k => fakeRemote(k, log));
  const host = new TableHost({
    seats: [
      { kind: 'remote', name: 'A', sink: players[0].sink },
      { kind: 'remote', name: 'B', sink: players[1].sink },
      { kind: 'ai' }, { kind: 'ai' },
    ],
  });
  // 電腦不用等思考時間
  host.later = (fn) => { const id = setTimeout(fn, 0); host.timers.add(id); return id; };
  host.newMatch();
  for (let i = 0; i < 4000 && !players[0].result; i++) {
    await new Promise(r => setTimeout(r, 0));
    for (const p of players) {
      const v = p.last;
      if (!v || !v.actions.length || v.phase === 'end') continue;
      const rl = roundFromView(v);
      if (v.phase === 'turn') {
        // 用玩家自己的視角做決定（模擬真人只看得到自己的牌）
        const fakeRound = { ...rl, legalActions: () => v.actions, players: rl.players, setsNeeded: rl.setsNeeded, seatWind: rl.seatWind, roundWind: rl.roundWind };
        host.act(p.k, decideTurn(fakeRound, p.k, PERSONAS.lin));
      } else {
        host.act(p.k, v.actions.find(a => a.type === 'hu') || { type: 'pass' });
      }
    }
  }
  assert.ok(players[0].result, '一局應該要結束');
  assert.ok(players[1].result);
  for (const p of players) assert.deepEqual(p.leaks, []);
  assert.ok(log.includes('discard'));
  host.stop();
});

test('斷線代打：連線玩家斷線後電腦接手，回來可以接回', () => {
  const p = fakeRemote(1, []);
  const host = new TableHost({ seats: [{ kind: 'local', name: '我', sink: fakeRemote(0, []).sink }, { kind: 'remote', name: '朋友', sink: p.sink }, { kind: 'ai' }, { kind: 'ai' }] });
  host.newMatch();
  host.takeover(1);
  assert.equal(host.isAI(1), true);
  assert.equal(host.names()[1], '朋友(代打)');
  assert.equal(host.isCharacter(1), false);
  host.rejoin(1, p.sink);
  assert.equal(host.isAI(1), false);
  assert.equal(host.names()[1], '朋友');
  host.stop();
});
