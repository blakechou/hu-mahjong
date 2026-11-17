// 台數計算（台灣 16 張常見規則）與結算
import { decompose, waits } from './hand.js';
import {
  toCounts, isHonor, isWind, isDragon, suitOf, flowerSeat, FLOWER_BASE,
  WINDS, DRAGONS,
} from './tiles.js';

export const BASE = 100;   // 底
export const PER_TAI = 20; // 每台

/**
 * 計算胡牌的台數。
 * @param w 胡牌資料
 *   hand       手上的牌（含胡的那張）
 *   melds      副露 [{ type:'chi'|'pon'|'minkan'|'kakan'|'ankan', tiles:[...] }]
 *   flowers    花牌
 *   winTile    胡的那張
 *   selfDraw   是否自摸
 *   seatWind   0~3 門風（東南西北）
 *   roundWind  0~3 圈風
 *   flags      { haitei, houtei, rinshan, chankan, tenhou, chihou }
 * @returns { items:[{name, tai}], total }  不含莊家／連莊台（另外在結算時加）
 */
export function scoreHand(w) {
  const melds = w.melds || [];
  const flowers = w.flowers || [];
  const flags = w.flags || {};
  const sets = 5 - melds.length;
  const counts = toCounts(w.hand);
  const decomps = decompose(counts, sets);
  if (!decomps.length) return null;

  // 胡之前的手牌聽幾種牌（判斷獨聽、平胡）
  const before = counts.slice();
  before[w.winTile]--;
  const waitList = waits(before, sets);

  let best = null;
  for (const d of decomps) {
    const r = scoreDecomp(w, d, melds, flowers, flags, waitList);
    if (!best || r.total > best.total) best = r;
  }
  return best;
}

function scoreDecomp(w, d, melds, flowers, flags, waitList) {
  const items = [];
  const add = (name, tai) => items.push({ name, tai });
  const open = melds.filter(m => m.type !== 'ankan');
  const concealed = open.length === 0;

  // 所有組（手牌拆出來的 + 副露）
  const all = [
    ...d.sets.map(s => ({ kind: s.type, tile: s.tile, fromHand: true })),
    ...melds.map(m => ({
      kind: m.type === 'chi' ? 'chow' : 'pung',
      tile: m.type === 'chi' ? Math.min(...m.tiles) : m.tiles[0],
      fromHand: false,
      ankan: m.type === 'ankan',
    })),
  ];
  const allTiles = [...w.hand, ...melds.flatMap(m => m.tiles)];
  const pungTiles = all.filter(s => s.kind === 'pung').map(s => s.tile);

  // 暗刻：手裡的刻子 + 暗槓。胡別人的牌時，若胡的那張只能放進某個刻子，那個刻子就不算暗刻。
  const winInOther = d.pair === w.winTile ||
    d.sets.some(s => s.type === 'chow' && w.winTile >= s.tile && w.winTile <= s.tile + 2);
  let anko = 0;
  for (const s of all) {
    if (s.kind !== 'pung') continue;
    if (s.ankan) { anko++; continue; }
    if (!s.fromHand) continue;
    if (!w.selfDraw && s.tile === w.winTile && !winInOther) continue;
    anko++;
  }

  // ---- 特殊 ----
  if (flags.tenhou) add('天胡', 24);
  if (flags.chihou) add('地胡', 16);

  // ---- 門清、自摸 ----
  if (concealed && w.selfDraw) add('門清自摸', 3);
  else {
    if (concealed) add('門清', 1);
    if (w.selfDraw) add('自摸', 1);
  }

  // ---- 全求人：五組都副露、單吊、胡別人的牌 ----
  if (open.length === 5 && !w.selfDraw) add('全求人', 2);

  // ---- 平胡：無字、無花、全順子、不自摸、不是獨聽 ----
  const noHonor = !allTiles.some(isHonor);
  if (noHonor && flowers.length === 0 && all.every(s => s.kind === 'chow') && !w.selfDraw && waitList.length >= 2) {
    add('平胡', 2);
  }

  // ---- 獨聽（邊張、嵌張、單吊） ----
  if (waitList.length === 1 && !(open.length === 5)) add('獨聽', 1);

  // ---- 刻子類 ----
  if (all.every(s => s.kind === 'pung')) {
    if (!allTiles.every(isHonor)) add('碰碰胡', 4);
  }
  if (anko >= 5) add('五暗刻', 8);
  else if (anko === 4) add('四暗刻', 5);
  else if (anko === 3) add('三暗刻', 2);

  // ---- 三元牌 ----
  const dragonPungs = DRAGONS.filter(t => pungTiles.includes(t)).length;
  if (dragonPungs === 3) add('大三元', 8);
  else if (dragonPungs === 2 && isDragon(d.pair)) add('小三元', 4);
  else for (const t of DRAGONS) if (pungTiles.includes(t)) add(['紅中', '青發', '白板'][t - 31], 1);

  // ---- 風牌 ----
  const windPungs = WINDS.filter(t => pungTiles.includes(t)).length;
  if (windPungs === 4) add('大四喜', 16);
  else if (windPungs === 3 && isWind(d.pair)) add('小四喜', 8);
  else {
    const seat = WINDS[w.seatWind], round = WINDS[w.roundWind];
    if (pungTiles.includes(round)) add('圈風', 1);
    if (pungTiles.includes(seat)) add('門風', 1);
  }

  // ---- 一色 ----
  const suits = new Set(allTiles.filter(t => !isHonor(t)).map(suitOf));
  if (allTiles.every(isHonor)) add('字一色', 16);
  else if (suits.size === 1) add(noHonor ? '清一色' : '混一色', noHonor ? 8 : 4);

  // ---- 花牌 ----
  for (const set of [0, 1]) {
    const group = [0, 1, 2, 3].map(i => FLOWER_BASE + set * 4 + i);
    if (group.every(f => flowers.includes(f))) add(set ? '梅蘭竹菊' : '春夏秋冬', 2);
    else for (const f of group) if (flowers.includes(f) && flowerSeat(f) === w.seatWind) add('正花', 1);
  }

  // ---- 時機 ----
  if (flags.haitei) add('海底撈月', 1);
  if (flags.houtei) add('河底撈魚', 1);
  if (flags.rinshan) add('槓上開花', 1);
  if (flags.chankan) add('搶槓', 1);

  return { items, total: items.reduce((a, b) => a + b.tai, 0) };
}

/** 莊家台：莊家本身 1 台，每連一莊再加 2 台（連一拉一） */
export const dealerTai = streak => 1 + 2 * streak;

/**
 * 結算：回傳每家輸贏分數。
 * res = { winner, from (放槍者；自摸時為 null), tai, dealer, streak }
 * 莊家胡牌、或莊家放槍／被自摸時，該筆加上莊家台。
 */
export function settle(res) {
  const delta = [0, 0, 0, 0];
  const dTai = dealerTai(res.streak || 0);
  const pay = (payer, extraTai) => {
    const amount = BASE + (res.tai + extraTai) * PER_TAI;
    delta[payer] -= amount;
    delta[res.winner] += amount;
  };
  const payers = res.from == null ? [0, 1, 2, 3].filter(p => p !== res.winner) : [res.from];
  for (const p of payers) {
    const dealerInvolved = res.winner === res.dealer || p === res.dealer;
    pay(p, dealerInvolved ? dTai : 0);
  }
  return delta;
}
