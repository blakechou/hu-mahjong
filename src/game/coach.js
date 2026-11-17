// 教學提示：建議打哪張、打了會怎樣、聽哪幾張、危險度、吃碰值不值得
import { rankDiscards, visibleCounts } from '../ai/ai.js';
import { shanten, ukeire } from '../core/hand.js';
import { toCounts, tileName } from '../core/tiles.js';

const COACH = { bigHand: 0.3, call: 0.5, defense: 0.75 };

export const shantenText = s => (s < 0 ? '胡牌' : s === 0 ? '聽牌' : `${s} 向聽`);

/** 每張可以打的牌的分析，第一個是建議 */
export function discardAdvice(round, seat) {
  return rankDiscards(round, seat, COACH);
}

/** 一張牌打掉之後的說明 */
export function describeDiscard(info) {
  if (!info) return '';
  const name = tileName(info.tile);
  let s;
  if (info.shanten === 0) {
    const w = info.waits.map(x => `${tileName(x.tile)}(${x.left})`).join('、');
    s = `打 ${name} → 聽 ${w || '（已經沒牌了）'}`;
  } else {
    s = `打 ${name} → ${shantenText(info.shanten)}，進張 ${info.ukeire} 張`;
  }
  if (info.danger >= 0.35) s += '　⚠️ 危險';
  return s;
}

/** 手上是 16 張（沒輪到自己）時聽哪幾張 */
export function currentWaits(round, seat) {
  const sets = round.setsNeeded(seat);
  const counts = toCounts(round.players[seat].hand);
  const total = counts.reduce((a, b) => a + b, 0);
  if (total !== sets * 3 + 1) return null;
  const u = ukeire(counts, sets, visibleCounts(round, seat));
  if (u.shanten !== 0) return { shanten: u.shanten };
  return { shanten: 0, waits: u.tiles };
}

/** 吃碰槓之後的向聽數 */
export function shantenAfterCall(round, seat, action) {
  const tile = round.claims.tile;
  const counts = toCounts(round.players[seat].hand);
  const sets = round.setsNeeded(seat);
  if (action.type === 'hu') return -1;
  if (action.type === 'pass') return shanten(counts, sets);
  if (action.type === 'kan') { counts[tile] -= 3; return shanten(counts, sets - 1); }
  if (action.type === 'pon') counts[tile] -= 2;
  else if (action.type === 'chi') for (const t of [action.tile, action.tile + 1, action.tile + 2]) if (t !== tile) counts[t]--;
  // 吃碰後還要打一張
  let best = Infinity;
  for (let t = 0; t < 34; t++) {
    if (!counts[t]) continue;
    counts[t]--;
    best = Math.min(best, shanten(counts, sets - 1));
    counts[t]++;
  }
  return best;
}
