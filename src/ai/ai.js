// 電腦對手：出牌與吃碰槓判斷
// 出牌的核心：向聽數越小越好 → 有效牌越多越好 → 依個性加上做大牌、防守的考量
import { shanten, ukeire } from '../core/hand.js';
import { toCounts, isHonor, suitOf, rankOf, WINDS, DRAGONS } from '../core/tiles.js';

/** 場上看得到的每種牌張數（從 seat 的角度） */
export function visibleCounts(round, seat) {
  const v = toCounts(round.players[seat].hand);
  for (const P of round.players) {
    for (const d of P.discards) if (!d.taken) v[d.tile]++;
    for (const m of P.melds) for (const t of m.tiles) if (t != null && (m.type !== 'ankan' || P === round.players[seat])) v[t]++;
  }
  // 別人的暗槓雖然蓋著，但一定是四張同樣的，算在 v 外不影響判斷
  return v;
}

/** 某家看起來多接近聽牌（0~1） */
export function threatOf(round, j) {
  const P = round.players[j];
  const open = P.melds.filter(m => m.type !== 'ankan').length;
  let x = open * 0.2 + Math.min(1, P.discards.length / 14) * 0.45;
  if (open >= 3) x += 0.2;
  return Math.min(1, x);
}

/** 打 t 有多危險（0 安全 ~ 1 很危險），綜合每個對手 */
export function dangerOf(round, seat, t, vis) {
  let total = 0;
  for (let j = 0; j < 4; j++) {
    if (j === seat) continue;
    const P = round.players[j];
    const threat = threatOf(round, j);
    if (threat < 0.15) continue;
    let d;
    if (P.discards.some(x => x.tile === t)) d = 0; // 現物
    else if (isHonor(t)) d = vis[t] >= 3 ? 0.05 : vis[t] === 2 ? 0.3 : 0.6;
    else {
      const r = rankOf(t);
      d = r === 1 || r === 9 ? 0.45 : r === 2 || r === 8 ? 0.6 : 0.8;
      // 筋：打過 t±3 的，兩面聽的機會較小
      const sujiSafe = [t - 3, t + 3].filter(x => x >= 0 && suitOf(x) === suitOf(t) && P.discards.some(y => y.tile === x));
      if (sujiSafe.length) d *= 0.55;
      if (vis[t] >= 3) d *= 0.6;
    }
    total = Math.max(total, d * threat);
  }
  return total;
}

/** 手牌最多的花色，以及它占所有數牌的比例（做一色用） */
function flushPlan(round, seat) {
  const P = round.players[seat];
  const tiles = [...P.hand, ...P.melds.flatMap(m => m.tiles)];
  const n = [0, 0, 0];
  let suited = 0;
  for (const t of tiles) if (!isHonor(t)) { n[suitOf(t)]++; suited++; }
  const best = n.indexOf(Math.max(...n));
  // 副露裡如果已經有兩種花色，就不可能做一色了
  const meldSuits = new Set(P.melds.flatMap(m => m.tiles).filter(t => !isHonor(t)).map(suitOf));
  const possible = meldSuits.size <= 1 && (meldSuits.size === 0 || meldSuits.has(best));
  return { suit: best, ratio: suited ? n[best] / tiles.length : 0, possible };
}

const valueHonor = (round, seat, t) =>
  DRAGONS.includes(t) || t === WINDS[round.seatWind(seat)] || t === WINDS[round.roundWind];

/** 評估每張可以打的牌，回傳由好到壞排序的清單（教學提示也會用到） */
export function rankDiscards(round, seat, persona) {
  const P = round.players[seat];
  const sets = round.setsNeeded(seat);
  const counts = toCounts(P.hand);
  const vis = visibleCounts(round, seat);
  const cur = shanten(counts, sets);
  const plan = flushPlan(round, seat);
  const goFlush = plan.possible && plan.ratio >= 0.6 - persona.bigHand * 0.15 && persona.bigHand > 0.3;
  // 自己離胡牌還遠、別人又很危險時，防守優先
  const maxThreat = Math.max(...[0, 1, 2, 3].filter(j => j !== seat).map(j => threatOf(round, j)));
  const defendMode = maxThreat * persona.defense > 0.35 && cur >= 2;

  const out = [];
  for (const t of new Set(P.hand)) {
    counts[t]--;
    const u = ukeire(counts, sets, vis);
    counts[t]++;
    let score = -u.shanten * 1000 + u.total * 8;
    // 孤張的字牌、邊張先打
    if (isHonor(t)) {
      const keep = counts[t] >= 2 && valueHonor(round, seat, t);
      score += keep ? -30 : 6;
    } else {
      const r = rankOf(t);
      if (r === 1 || r === 9) score += 3;
      if (goFlush && suitOf(t) !== plan.suit) score += 120 * persona.bigHand;
      if (goFlush && suitOf(t) === plan.suit) score -= 40 * persona.bigHand;
    }
    const danger = dangerOf(round, seat, t, vis);
    score -= danger * persona.defense * (defendMode ? 2500 : 250);
    out.push({ tile: t, score, shanten: u.shanten, ukeire: u.total, waits: u.tiles, danger });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

/** 輪到自己時要做什麼 */
export function decideTurn(round, seat, persona) {
  const acts = round.legalActions(seat);
  const tsumo = acts.find(a => a.type === 'tsumo');
  if (tsumo) return tsumo;
  const counts = toCounts(round.players[seat].hand);
  const sets = round.setsNeeded(seat);
  const before = minShantenAfterDiscard(counts, sets);
  for (const a of acts) {
    if (a.type !== 'ankan' && a.type !== 'kakan') continue;
    const c = counts.slice();
    c[a.tile] -= a.type === 'ankan' ? 4 : 1;
    const after = shanten(c, a.type === 'ankan' ? sets - 1 : sets);
    if (after <= before) return a;
  }
  const best = rankDiscards(round, seat, persona)[0];
  return { type: 'discard', tile: best.tile };
}

function minShantenAfterDiscard(counts, sets) {
  let best = Infinity;
  for (let t = 0; t < 34; t++) {
    if (!counts[t]) continue;
    counts[t]--;
    best = Math.min(best, shanten(counts, sets));
    counts[t]++;
  }
  return best;
}

/** 別人打牌時要不要吃碰槓胡 */
export function decideClaim(round, seat, persona, rng = Math.random) {
  const opts = round.legalActions(seat);
  const hu = opts.find(a => a.type === 'hu');
  if (hu) return hu;
  const tile = round.claims.tile;
  const P = round.players[seat];
  const counts = toCounts(P.hand);
  const sets = round.setsNeeded(seat);
  const cur = shanten(counts, sets);
  const plan = flushPlan(round, seat);

  let best = null;
  for (const a of opts) {
    if (a.type === 'pass' || a.type === 'hu') continue;
    const c = counts.slice();
    let after;
    if (a.type === 'kan') {
      c[tile] -= 3;
      after = shanten(c, sets - 1);
    } else {
      if (a.type === 'pon') c[tile] -= 2;
      else for (const t of [a.tile, a.tile + 1, a.tile + 2]) if (t !== tile) c[t]--;
      after = minShantenAfterDiscard(c, sets - 1);
    }
    const improves = after < cur;
    let want = 0;
    if (a.type === 'kan') want = after <= cur ? 0.4 + persona.call * 0.5 : 0;
    else if (improves) {
      want = persona.call;
      // 值錢的字牌一定碰
      if (a.type === 'pon' && isHonor(tile) && valueHonor(round, seat, tile)) want = Math.max(want, 0.9);
      // 做一色的人，同花色的吃碰比較願意
      if (persona.bigHand > 0.5 && !isHonor(tile)) want = suitOf(tile) === plan.suit && plan.ratio >= 0.55 ? 0.7 : want * 0.4;
      // 離胡牌還很遠，吃碰只會把手牌弄小
      if (after >= 3) want *= 0.4;
      // 防守型：快聽牌才吃碰
      if (persona.defense > 0.8 && after > 1) want *= 0.6;
    }
    if (want > 0 && (!best || want > best.want)) best = { a, want };
  }
  if (best && rng() < best.want) return best.a;
  return { type: 'pass' };
}
