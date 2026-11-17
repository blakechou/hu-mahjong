import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTiles } from '../src/core/tiles.js';
import { scoreHand, settle } from '../src/core/scoring.js';

const T = s => parseTiles(s);
const names = r => r.items.map(i => i.name).sort();
const base = { melds: [], flowers: [], seatWind: 1, roundWind: 0, flags: {} };

test('平胡＋門清', () => {
  const r = scoreHand({ ...base, hand: T('123m 456m 789m 234p 567p 55s'), winTile: T('5p')[0], selfDraw: false });
  assert.deepEqual(names(r), ['平胡', '門清'].sort());
  assert.equal(r.total, 3);
});

test('自摸就沒有平胡；門清自摸 3 台', () => {
  const r = scoreHand({ ...base, hand: T('123m 456m 789m 234p 567p 55s'), winTile: T('5p')[0], selfDraw: true });
  assert.deepEqual(names(r), ['門清自摸']);
});

test('清一色', () => {
  const r = scoreHand({ ...base, hand: T('111m 234m 456m 678m 999m 55m'), winTile: T('3m')[0], selfDraw: true });
  assert.ok(names(r).includes('清一色'));
  assert.ok(names(r).includes('門清自摸'));
});

test('碰碰胡＋四暗刻（胡別人那張做成的刻子不算暗刻）', () => {
  const r = scoreHand({ ...base, hand: T('111m 999p 555s 777s 22z 333z'), winTile: T('3z')[0], selfDraw: false });
  assert.deepEqual(names(r), ['四暗刻', '碰碰胡', '門清'].sort());
  assert.equal(r.total, 10);
});

test('自摸對碰：五暗刻', () => {
  const r = scoreHand({ ...base, hand: T('111m 999p 555s 777s 22z 333z'), winTile: T('3z')[0], selfDraw: true });
  assert.ok(names(r).includes('五暗刻'));
});

test('大三元不再另算三元牌', () => {
  const r = scoreHand({ ...base, hand: T('555z 666z 777z 123m 456m 99p'), winTile: T('9p')[0], selfDraw: false });
  assert.ok(names(r).includes('大三元'));
  assert.ok(!names(r).includes('紅中'));
});

test('小三元', () => {
  const r = scoreHand({ ...base, hand: T('555z 666z 77z 123m 456m 789p'), winTile: T('7p')[0], selfDraw: false });
  assert.ok(names(r).includes('小三元'));
});

test('圈風、門風、正花、花槓', () => {
  // 門風＝南（seatWind 1）、圈風＝東
  const r = scoreHand({
    ...base, hand: T('111z 222z 123m 456m 789m 99p'), winTile: T('9p')[0], selfDraw: false,
    flowers: T('2f 1234f').slice(0, 1).concat(T('5678f')),
  });
  const n = names(r);
  assert.ok(n.includes('圈風'));
  assert.ok(n.includes('門風'));
  assert.ok(n.includes('正花'));      // 夏 = 南
  assert.ok(n.includes('梅蘭竹菊'));
});

test('獨聽（嵌張）不算平胡', () => {
  const r = scoreHand({ ...base, hand: T('123m 456m 789m 123p 456p 99s'), winTile: T('2p')[0], selfDraw: false });
  assert.deepEqual(names(r), ['獨聽', '門清'].sort());
});

test('全求人', () => {
  const melds = [
    { type: 'pon', tiles: T('111m') }, { type: 'chi', tiles: T('234p') }, { type: 'chi', tiles: T('567s') },
    { type: 'pon', tiles: T('999s') }, { type: 'chi', tiles: T('789m') },
  ];
  const r = scoreHand({ ...base, melds, hand: T('55p'), winTile: T('5p')[0], selfDraw: false });
  assert.ok(names(r).includes('全求人'));
});

test('結算：閒家自摸，莊家多付莊家台', () => {
  const d = settle({ winner: 1, from: null, tai: 3, dealer: 0, streak: 1 });
  // 閒家付 100+3*20=160；莊家付 100+(3+3)*20=220
  assert.deepEqual(d, [-220, 540, -160, -160]);
});

test('結算：放槍只有放槍的人付', () => {
  const d = settle({ winner: 2, from: 3, tai: 5, dealer: 0, streak: 0 });
  assert.deepEqual(d, [0, 0, 200, -200]);
});
