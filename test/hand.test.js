import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTiles, toCounts, fullSet, isFlower } from '../src/core/tiles.js';
import { shanten, isComplete, waits, decompose } from '../src/core/hand.js';
import { createRng } from '../src/core/rng.js';

const C = s => toCounts(parseTiles(s));

test('17 張胡牌：5 組 + 1 對', () => {
  assert.equal(isComplete(C('123m 456m 789m 123p 456p 11z'), 5), true);
  assert.equal(shanten(C('123m 456m 789m 123p 456p 11z'), 5), -1);
  assert.equal(isComplete(C('123m 456m 789m 123p 456p 12z'), 5), false);
});

test('聽牌與聽哪幾張', () => {
  const h = C('123m 456m 789m 123p 45p 11z');
  assert.equal(shanten(h, 5), 0);
  assert.deepEqual(waits(h, 5), parseTiles('36p'));
  // 單吊
  assert.deepEqual(waits(C('123m 456m 789m 123p 456p 1z'), 5), parseTiles('1z'));
  // 對碰
  assert.deepEqual(waits(C('123m 456m 789m 123p 55s 11z'), 5), parseTiles('5s 1z'));
});

test('有副露時需要的組數變少', () => {
  assert.equal(isComplete(C('123m 456m 789p 11z'), 3), true);
  assert.equal(shanten(C('123m 456m 78p 11z'), 3), 0);
});

test('一向聽、二向聽', () => {
  assert.equal(shanten(C('123m 456m 789m 13p 45p 1z 5z'), 5), 2);
  assert.equal(shanten(C('123m 456m 789m 123p 45p 1z 5z'), 5), 1);
});

test('拆牌會列出不同的拆法', () => {
  // 111222333m 可以是三個刻子，也可以是三個順子
  const d = decompose(C('111m 222m 333m 456p 789p 11z'), 5);
  assert.ok(d.length >= 2);
});

function randomHand(rng, n) {
  const wall = rng.shuffle(fullSet().filter(t => !isFlower(t)));
  return toCounts(wall.slice(0, n));
}

test('向聽數 -1 與 isComplete 一致（隨機）', () => {
  const rng = createRng(42);
  for (let i = 0; i < 2000; i++) {
    const c = randomHand(rng, 17);
    assert.equal(shanten(c, 5) === -1, isComplete(c, 5));
  }
});

test('向聽數一致性：摸一張打一張，最多只能前進一步，且向聽>0 時一定有牌能前進', () => {
  const rng = createRng(7);
  for (let i = 0; i < 60; i++) {
    const c = randomHand(rng, 16);
    const s = shanten(c, 5);
    let bestAfter = Infinity;
    for (let d = 0; d < 34; d++) {
      if (c[d] >= 4) continue;
      c[d]++;
      for (let x = 0; x < 34; x++) {
        if (!c[x]) continue;
        c[x]--;
        bestAfter = Math.min(bestAfter, shanten(c, 5));
        c[x]++;
      }
      c[d]--;
    }
    assert.equal(bestAfter, s - 1, `hand ${c.join('')} shanten ${s}`);
  }
});

test('從胡牌拿掉一張一定是聽牌', () => {
  const hands = ['111m 234m 456m 678m 999m 55m', '123m 123m 123m 789s 789s 77z', '111z 222z 333z 444z 555z 66z'];
  for (const s of hands) {
    const c = C(s);
    assert.equal(isComplete(c, 5), true, s);
    for (let t = 0; t < 34; t++) {
      if (!c[t]) continue;
      c[t]--;
      assert.equal(shanten(c, 5), 0, `${s} -${t}`);
      assert.ok(waits(c, 5).length > 0 || c[t] >= 3);
      c[t]++;
    }
  }
});
