// 牌的編碼
//   0–8   一萬～九萬
//   9–17  一筒～九筒
//   18–26 一條～九條
//   27–30 東南西北
//   31–33 中發白
//   34–41 春夏秋冬梅蘭竹菊（花牌）
// 一般牌 34 種 × 4 張 + 花牌 8 張 = 144 張

export const KINDS = 34;
export const FLOWER_BASE = 34;
export const ALL_TILE_IDS = 42;

export const EAST = 27, SOUTH = 28, WEST = 29, NORTH = 30;
export const RED = 31, GREEN = 32, WHITE = 33;
export const WINDS = [EAST, SOUTH, WEST, NORTH];
export const DRAGONS = [RED, GREEN, WHITE];

const NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const SUIT = ['萬', '筒', '條'];
const HONOR = ['東', '南', '西', '北', '中', '發', '白'];
const FLOWER = ['春', '夏', '秋', '冬', '梅', '蘭', '竹', '菊'];

export const isFlower = t => t >= FLOWER_BASE;
export const isHonor = t => t >= 27 && t < FLOWER_BASE;
export const isSuited = t => t >= 0 && t < 27;
export const isWind = t => t >= 27 && t <= 30;
export const isDragon = t => t >= 31 && t <= 33;
export const suitOf = t => (t < 27 ? Math.floor(t / 9) : -1);
export const rankOf = t => (t < 27 ? (t % 9) + 1 : 0);

/** 花牌對應的座位風：春梅→東、夏蘭→南、秋竹→西、冬菊→北 */
export const flowerSeat = f => (f - FLOWER_BASE) % 4;

export function tileName(t) {
  if (t < 27) return NUM[t % 9] + SUIT[Math.floor(t / 9)];
  if (t < FLOWER_BASE) return HONOR[t - 27];
  return FLOWER[t - FLOWER_BASE];
}

/** 牌牆：144 張 */
export function fullSet() {
  const w = [];
  for (let t = 0; t < KINDS; t++) for (let k = 0; k < 4; k++) w.push(t);
  for (let f = FLOWER_BASE; f < ALL_TILE_IDS; f++) w.push(f);
  return w;
}

export function toCounts(tiles) {
  const c = new Array(KINDS).fill(0);
  for (const t of tiles) if (t < KINDS) c[t]++;
  return c;
}

export const sortTiles = tiles => tiles.sort((a, b) => a - b);

/**
 * 測試與除錯用的簡寫：
 *   "123m" 萬、"456p" 筒、"789s" 條、"1234567z" 東南西北中發白、"12345678f" 春～菊
 *   例：parseTiles('123m 456p 11z')
 */
export function parseTiles(str) {
  const out = [];
  const base = { m: 0, p: 9, s: 18, z: 27, f: FLOWER_BASE };
  for (const [, digits, suit] of str.replace(/\s+/g, '').matchAll(/(\d+)([mpszf])/g)) {
    for (const d of digits) out.push(base[suit] + Number(d) - 1);
  }
  return out;
}

export const tilesToString = tiles => tiles.map(tileName).join(' ');
