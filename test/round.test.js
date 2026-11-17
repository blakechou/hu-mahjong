import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Round, RESERVE } from '../src/core/round.js';
import { Match } from '../src/core/match.js';
import { parseTiles } from '../src/core/tiles.js';
import { createRng } from '../src/core/rng.js';

/** 牌的總數：手牌＋副露＋沒被拿走的牌河＋花＋牌牆剩下的，應該永遠是 144 */
function totalTiles(r) {
  let n = r.remaining;
  for (const P of r.players) {
    n += P.hand.length + P.flowers.length;
    n += P.melds.reduce((a, m) => a + m.tiles.length, 0);
    n += P.discards.filter(d => !d.taken).length;
  }
  // 胡別人的牌時，那張已經算進胡牌者手牌，牌河標成 taken
  return n;
}

function handSizeOk(r, p) {
  const P = r.players[p];
  const slots = P.hand.length + P.melds.length * 3;
  return slots === 16 || slots === 17;
}

/** 隨機打完一局：出牌隨機，吃碰槓胡有一定機率 */
function playRandom(seed, { claimRate = 0.3, huRate = 1 } = {}) {
  const r = new Round({ seed, dealer: seed % 4 });
  const rng = createRng(seed * 7 + 1);
  r.start();
  let steps = 0;
  while (r.phase !== 'end') {
    assert.ok(++steps < 2000, '迴圈太久');
    assert.equal(totalTiles(r), 144);
    if (r.phase === 'turn') {
      const p = r.turn;
      assert.ok(handSizeOk(r, p));
      const acts = r.legalActions(p);
      const tsumo = acts.find(a => a.type === 'tsumo');
      if (tsumo && rng.next() < huRate) { r.act(p, tsumo); continue; }
      const kans = acts.filter(a => a.type === 'ankan' || a.type === 'kakan');
      if (kans.length && rng.next() < claimRate) { r.act(p, kans[0]); continue; }
      const ds = acts.filter(a => a.type === 'discard');
      r.act(p, ds[rng.int(ds.length)]);
    } else {
      // 每個有選項的人依序回應
      for (const q of Object.keys(r.claims.options).map(Number)) {
        if (r.phase !== 'claim' && r.phase !== 'robkan') break;
        const acts = r.legalActions(q);
        if (!acts.length) continue;
        let a = acts.find(x => x.type === 'pass');
        const hu = acts.find(x => x.type === 'hu');
        const call = acts.filter(x => x.type !== 'pass' && x.type !== 'hu');
        if (hu && rng.next() < huRate) a = hu;
        else if (call.length && rng.next() < claimRate) a = call[rng.int(call.length)];
        r.act(q, a);
      }
    }
  }
  return r;
}

test('隨機打 500 局：一定會結束、牌數守恆、分數總和為 0', () => {
  let wins = 0, draws = 0;
  for (let seed = 1; seed <= 500; seed++) {
    const r = playRandom(seed);
    assert.equal(r.phase, 'end');
    assert.equal(r.result.delta.reduce((a, b) => a + b, 0), 0);
    if (r.result.type === 'win') {
      wins++;
      assert.ok(r.result.tai >= 0);
    } else {
      draws++;
      assert.ok(r.remaining <= RESERVE);
    }
  }
  assert.ok(wins > 0 && draws > 0, `wins=${wins} draws=${draws}`);
});

test('同一個種子，發的牌一模一樣（連線同步用）', () => {
  const a = new Round({ seed: 99 }); a.start();
  const b = new Round({ seed: 99 }); b.start();
  assert.deepEqual(a.players.map(p => p.hand), b.players.map(p => p.hand));
});

test('開局：莊家 17 張、閒家 16 張、手上沒有花', () => {
  for (let seed = 1; seed < 50; seed++) {
    const r = new Round({ seed, dealer: 2 });
    r.start();
    if (r.phase === 'end') continue;
    r.players.forEach((P, i) => {
      assert.equal(P.hand.length, i === 2 ? 17 : 16);
      assert.ok(P.hand.every(t => t < 34));
    });
  }
});

/** 直接擺好牌局：座位 0 要出 tile */
function rig(hands, discardTile) {
  const r = new Round({ seed: 5, dealer: 0 });
  r.start();
  r.players.forEach((P, i) => { P.hand = parseTiles(hands[i]); P.melds = []; P.flowers = []; });
  r.players[0].hand.push(...parseTiles(discardTile));
  r.phase = 'turn'; r.turn = 0; r.drawn = parseTiles(discardTile)[0];
  return r;
}

test('碰優先於吃', () => {
  const r = rig([
    '123m 456m 789m 123p 456p 1z',
    '23s 456m 789m 123p 456p 11z',   // 下家可以吃 1s/4s
    '44s 456m 789m 123p 456p 2z 3z', // 對家可以碰 4s
    '135m 2468p 1357s 1234z',
  ], '4s');
  r.act(0, { type: 'discard', tile: parseTiles('4s')[0] });
  assert.equal(r.phase, 'claim');
  r.act(1, { type: 'chi', tile: parseTiles('2s')[0] });
  assert.equal(r.phase, 'claim', '對家還沒表態，不能先讓下家吃');
  r.act(2, { type: 'pon' });
  assert.equal(r.turn, 2);
  assert.equal(r.players[2].melds[0].type, 'pon');
});

test('兩家同時胡：截胡，離放槍者最近的贏', () => {
  const r = rig([
    '123m 456m 789m 123p 456p 1z',
    '135m 2468p 1357s 1234z',
    '123m 456m 789m 123p 456p 9s',   // 對家單吊 9s
    '123s 456m 789m 123p 456p 9s',   // 上家也單吊 9s
  ], '9s');
  r.act(0, { type: 'discard', tile: parseTiles('9s')[0] });
  r.act(3, { type: 'hu' });
  assert.equal(r.phase, 'claim', '對家順位比較前，要等他');
  r.act(2, { type: 'hu' });
  assert.equal(r.phase, 'end');
  assert.equal(r.result.winner, 2);
  assert.equal(r.result.from, 0);
});

test('一將：莊家胡會連莊，閒家胡會下莊', () => {
  const m = new Match({ firstDealer: 0, seedFn: () => 1 });
  m.newRound();
  m.round.result = { type: 'win', winner: 0, delta: [300, -100, -100, -100] };
  assert.deepEqual(m.finishRound(), { keep: true, over: false });
  assert.equal(m.streak, 1);
  m.newRound();
  m.round.result = { type: 'win', winner: 2, delta: [-100, 0, 100, 0] };
  m.finishRound();
  assert.equal(m.dealer, 1);
  assert.equal(m.streak, 0);
  assert.deepEqual(m.scores, [200, -100, 0, -100]);
});

test('打完 16 個閒家胡的局，北風圈結束', () => {
  const m = new Match({ firstDealer: 1, seedFn: () => 1 });
  let r;
  for (let i = 0; i < 16; i++) {
    m.newRound();
    m.round.result = { type: 'win', winner: (m.dealer + 1) % 4, delta: [0, 0, 0, 0] };
    r = m.finishRound();
  }
  assert.equal(r.over, true);
  assert.equal(m.over, true);
});

test('搶槓：加槓的那張被別人胡走', () => {
  const r = rig([
    '123m 456m 789m 123p 4p',
    '123m 456m 789m 123p 456p 5s',   // 下家單吊 5s
    '135m 2468p 1357s 1234z',
    '135m 2468p 1357s 1234z',
  ], '5s');
  r.players[0].melds = [{ type: 'pon', tiles: parseTiles('555s'), from: 2 }];
  const s5 = parseTiles('5s')[0];
  assert.ok(r.legalActions(0).some(a => a.type === 'kakan' && a.tile === s5));
  r.act(0, { type: 'kakan', tile: s5 });
  assert.equal(r.phase, 'robkan');
  r.act(1, { type: 'hu' });
  assert.equal(r.result.winner, 1);
  assert.equal(r.result.from, 0);
  assert.ok(r.result.items.some(i => i.name === '搶槓'));
});
