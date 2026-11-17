// 手牌分析：向聽數、胡牌判定、拆牌、聽牌
// 台灣 16 張：胡牌 = 5 組（順子或刻子）+ 1 對；每有一組副露，手裡需要的組數就少一組。
import { KINDS, toCounts } from './tiles.js';

// ---------- 向聽數 ----------
// 把手牌依花色拆成四段（萬、筒、條、字），每段各自算出可能的
// (面子數 m, 搭子數 t, 有沒有對子當眼 p)，再組合起來。每段結果會快取。

const suitCache = new Map();

/** 回傳這段牌所有不被其他結果支配的 [m, t, p] */
function analyzeGroup(c, honor) {
  const key = (honor ? 'z' : 's') + c.join('');
  const hit = suitCache.get(key);
  if (hit) return hit;
  const n = c.length;
  const found = new Set();
  const rec = (i, m, t, p) => {
    while (i < n && c[i] === 0) i++;
    if (i === n) { found.add(m * 100 + t * 10 + p); return; }
    // 刻子
    if (c[i] >= 3) { c[i] -= 3; rec(i, m + 1, t, p); c[i] += 3; }
    // 順子
    if (!honor && i + 2 < n && c[i + 1] && c[i + 2]) {
      c[i]--; c[i + 1]--; c[i + 2]--; rec(i, m + 1, t, p); c[i]++; c[i + 1]++; c[i + 2]++;
    }
    if (c[i] >= 2) {
      // 對子當眼
      if (!p) { c[i] -= 2; rec(i, m, t, 1); c[i] += 2; }
      // 對子當搭子
      c[i] -= 2; rec(i, m, t + 1, p); c[i] += 2;
    }
    if (!honor) {
      // 兩面／邊張搭子
      if (i + 1 < n && c[i + 1]) { c[i]--; c[i + 1]--; rec(i, m, t + 1, p); c[i]++; c[i + 1]++; }
      // 嵌張搭子
      if (i + 2 < n && c[i + 2]) { c[i]--; c[i + 2]--; rec(i, m, t + 1, p); c[i]++; c[i + 2]++; }
    }
    // 孤張
    c[i]--; rec(i, m, t, p); c[i]++;
  };
  rec(0, 0, 0, 0);
  const all = [...found].map(v => [Math.floor(v / 100), Math.floor(v / 10) % 10, v % 10]);
  // 去掉被支配的結果（每一項都不比別人好的）
  const res = all.filter(a => !all.some(b => b !== a && b[0] >= a[0] && b[1] >= a[1] && b[2] >= a[2] && (b[0] > a[0] || b[1] > a[1] || b[2] > a[2])));
  suitCache.set(key, res);
  return res;
}

/**
 * 向聽數：-1 = 已胡、0 = 聽牌、1 = 一向聽…
 * @param counts 長度 34 的計數陣列（只算手裡的牌，不含副露）
 * @param sets   還需要的組數（5 - 副露數）
 */
export function shanten(counts, sets) {
  const groups = [
    analyzeGroup(counts.slice(0, 9), false),
    analyzeGroup(counts.slice(9, 18), false),
    analyzeGroup(counts.slice(18, 27), false),
    analyzeGroup(counts.slice(27, 34), true),
  ];
  let states = [[0, 0, 0]];
  for (const g of groups) {
    const next = new Map();
    for (const [m, t, p] of states) {
      for (const [m2, t2, p2] of g) {
        if (p && p2) continue;
        const s = [m + m2, t + t2, p | p2];
        next.set(s.join(','), s);
      }
    }
    states = [...next.values()];
  }
  let best = 2 * sets;
  for (const [m, t, p] of states) {
    const mm = Math.min(m, sets);
    const tt = Math.min(t, sets - mm);
    const v = 2 * sets - 2 * mm - tt - p;
    if (v < best) best = v;
  }
  return best;
}

// ---------- 胡牌判定與拆牌 ----------

/** 把手牌拆成 1 對 + n 組的所有方式。回傳 [{ pair, sets:[{type:'pung'|'chow', tile}] }] */
export function decompose(counts, sets, limit = 200) {
  const c = counts.slice();
  const out = [];
  const cur = [];
  const rec = i => {
    if (out.length >= limit) return;
    while (i < KINDS && c[i] === 0) i++;
    if (i === KINDS) { if (cur.length === sets) out.push(cur.slice()); return; }
    if (cur.length >= sets) return;
    if (c[i] >= 3) { c[i] -= 3; cur.push({ type: 'pung', tile: i }); rec(i); cur.pop(); c[i] += 3; }
    if (i < 27 && i % 9 <= 6 && c[i + 1] && c[i + 2]) {
      c[i]--; c[i + 1]--; c[i + 2]--; cur.push({ type: 'chow', tile: i }); rec(i); cur.pop(); c[i]++; c[i + 1]++; c[i + 2]++;
    }
  };
  const res = [];
  for (let p = 0; p < KINDS; p++) {
    if (c[p] < 2) continue;
    c[p] -= 2;
    out.length = 0;
    rec(0);
    for (const s of out) res.push({ pair: p, sets: s });
    c[p] += 2;
  }
  return res;
}

export function isComplete(counts, sets) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total !== sets * 3 + 2) return false;
  return decompose(counts, sets, 1).length > 0;
}

/** 聽哪些牌（不管場上還剩幾張，但手上已有 4 張的不算） */
export function waits(counts, sets) {
  const res = [];
  for (let t = 0; t < KINDS; t++) {
    if (counts[t] >= 4) continue;
    counts[t]++;
    if (isComplete(counts, sets)) res.push(t);
    counts[t]--;
  }
  return res;
}

/** 方便用：直接丟牌陣列進來 */
export const handShanten = (tiles, meldCount = 0) => shanten(toCounts(tiles), 5 - meldCount);
export const handWaits = (tiles, meldCount = 0) => waits(toCounts(tiles), 5 - meldCount);

/**
 * 有效牌：打掉 discard 之後（或不打，手牌是 16 張時），摸到哪些牌會讓向聽數下降，以及剩幾張。
 * visible：已經看得到的各種牌張數（自己手牌、所有牌河、副露），用來算剩餘張數。
 */
export function ukeire(counts, sets, visible) {
  const base = shanten(counts, sets);
  const tiles = [];
  let total = 0;
  for (let t = 0; t < KINDS; t++) {
    if (counts[t] >= 4) continue;
    counts[t]++;
    const s = shanten(counts, sets);
    counts[t]--;
    if (s < base) {
      const left = Math.max(0, 4 - (visible ? visible[t] : counts[t]));
      tiles.push({ tile: t, left });
      total += left;
    }
  }
  return { shanten: base, tiles, total };
}
