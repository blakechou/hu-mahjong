import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LINES, LinePicker } from '../src/game/lines.js';
import { describeDiscard } from '../src/game/coach.js';
import { parseTiles } from '../src/core/tiles.js';

test('每個角色每種情境都有台詞', () => {
  const need = ['start', 'call', 'tenpai', 'tsumo', 'ron', 'dealIn', 'otherWin', 'draw', 'idle', 'taunted'];
  for (const id of ['abo', 'azhu', 'lin']) for (const s of need) assert.ok(LINES[id][s]?.length >= 3, `${id}.${s}`);
  assert.ok(LINES.lin.danger.length && LINES.lin.praise.length);
});

test('台詞在用完之前不重複', () => {
  const p = new LinePicker();
  const n = LINES.azhu.call.length;
  const got = new Set();
  for (let i = 0; i < n; i++) got.add(p.pick('azhu', 'call'));
  assert.equal(got.size, n);
});

test('提示文字：聽牌時列出聽的牌與剩餘張數', () => {
  const [m3, m6] = parseTiles('36m');
  const s = describeDiscard({ tile: parseTiles('1z')[0], shanten: 0, waits: [{ tile: m3, left: 2 }, { tile: m6, left: 3 }], danger: 0.5 });
  assert.equal(s, '打 東 → 聽 三萬(2)、六萬(3)　⚠️ 危險');
});
