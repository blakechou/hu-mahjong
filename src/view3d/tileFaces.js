// 用 canvas 畫牌面（不需要任何圖檔）
import * as THREE from 'three';
import { FLOWER_BASE } from '../core/tiles.js';

const W = 256, H = 346;
const PAD = 20;
const IW = W - PAD * 2, IH = H - PAD * 2;
const C = {
  ivory: '#f6f1e3', edge: '#e2d9c2',
  blue: '#1446b8', green: '#0b8a46', red: '#d8141f', ink: '#121530', gold: '#c48a06',
  greenDark: '#05592b', greenLight: '#3fc27a',
};
export const FONT = "'Noto Serif TC', 'Songti TC', 'PMingLiU', 'MingLiU', serif";
const NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

function base(ctx) {
  ctx.fillStyle = C.ivory;
  ctx.fillRect(0, 0, W, H);
  // 微微的內陰影讓牌面有立體感
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.75);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(150,130,90,0.08)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

const P = (x, y) => [PAD + x * IW, PAD + y * IH];

function text(ctx, s, x, y, size, color, weight = 900) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}

// ---- 筒 ----
const PIN_POS = {
  1: [[.5, .5]],
  2: [[.5, .25], [.5, .75]],
  3: [[.22, .18], [.5, .5], [.78, .82]],
  4: [[.28, .27], [.72, .27], [.28, .73], [.72, .73]],
  5: [[.26, .22], [.74, .22], [.5, .5], [.26, .78], [.74, .78]],
  6: [[.28, .16], [.72, .16], [.28, .54], [.72, .54], [.28, .86], [.72, .86]],
  7: [[.2, .13], [.5, .25], [.8, .37], [.28, .62], [.72, .62], [.28, .87], [.72, .87]],
  8: [[.28, .12], [.72, .12], [.28, .37], [.72, .37], [.28, .63], [.72, .63], [.28, .88], [.72, .88]],
  9: [[.18, .17], [.5, .17], [.82, .17], [.18, .5], [.5, .5], [.82, .5], [.18, .83], [.5, .83], [.82, .83]],
};
function pinColor(n, i) {
  if (n === 1) return C.red;
  if (n === 2) return [C.green, C.blue][i];
  if (n === 3) return [C.blue, C.red, C.green][i];
  if (n === 4 || n === 8) return i % 3 === 0 || i === 3 || i === 4 ? C.blue : C.green;
  if (n === 5) return i === 2 ? C.red : i % 3 === 0 ? C.blue : C.green;
  if (n === 6) return i < 2 ? C.green : C.red;
  if (n === 7) return i < 3 ? C.green : C.red;
  if (n === 9) return [C.blue, C.red, C.green][Math.floor(i / 3)];
  return C.blue;
}
function circle(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.ivory;
  ctx.beginPath(); ctx.arc(x, y, r * 0.72, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.ivory;
  ctx.beginPath(); ctx.arc(x, y, r * 0.2, 0, Math.PI * 2); ctx.fill();
}
function drawPin(ctx, n) {
  const r = n === 1 ? 82 : n === 2 ? 48 : n <= 4 ? 40 : n <= 6 ? 33 : n === 7 ? 30 : 29;
  PIN_POS[n].forEach(([x, y], i) => { const [px, py] = P(x, y); circle(ctx, px, py, r, pinColor(n, i)); });
  if (n === 1) {
    // 一筒外圈花紋
    const [cx, cy] = P(.5, .5);
    ctx.strokeStyle = C.green; ctx.lineWidth = 6;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * 96, cy + Math.sin(a) * 96, 8, 0, Math.PI * 2); ctx.stroke();
    }
  }
}

// ---- 條 ----
const SOU_POS = {
  2: [[.5, .27], [.5, .73]],
  3: [[.5, .27], [.28, .73], [.72, .73]],
  4: [[.3, .27], [.7, .27], [.3, .73], [.7, .73]],
  5: [[.2, .27], [.8, .27], [.5, .5], [.2, .73], [.8, .73]],
  6: [[.2, .27], [.5, .27], [.8, .27], [.2, .73], [.5, .73], [.8, .73]],
  7: [[.5, .16], [.2, .5], [.5, .5], [.8, .5], [.2, .84], [.5, .84], [.8, .84]],
  8: [[.14, .27], [.38, .27], [.62, .27], [.86, .27], [.14, .73], [.38, .73], [.62, .73], [.86, .73]],
  9: [[.18, .17], [.5, .17], [.82, .17], [.18, .5], [.5, .5], [.82, .5], [.18, .83], [.5, .83], [.82, .83]],
};
/** 一根竹子：立體的漸層、深色外框、三個竹節；angle 是往右傾斜的弧度 */
function stick(ctx, x, y, h, color, angle = 0) {
  const w = 26;
  const dark = color === C.green ? C.greenDark : shade(color, -0.35);
  const light = color === C.green ? C.greenLight : shade(color, 0.35);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  g.addColorStop(0, dark); g.addColorStop(0.35, light); g.addColorStop(0.6, color); g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.strokeStyle = dark;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, w / 2);
  ctx.fill();
  ctx.stroke();
  // 竹節：稍微凸出來的深色環
  for (const t of [-0.5, 0, 0.5]) {
    const ny = t * h * 0.62;
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.roundRect(-w / 2 - 2, ny - 3, w + 4, 6, 3); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(-w / 2 + 2, ny - 1, w - 4, 1.5);
  }
  ctx.restore();
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = c => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function drawSou(ctx, n) {
  if (n === 1) return drawBird(ctx);
  if (n === 8) {
    // 八條：上面四根排成 M，下面四根排成 W
    const a = 0.42;
    [[.15, a], [.38, -a], [.62, a], [.85, -a]].forEach(([x, ang]) => { const [px, py] = P(x, .27); stick(ctx, px, py, 112, C.green, ang); });
    [[.15, -a], [.38, a], [.62, -a], [.85, a]].forEach(([x, ang]) => { const [px, py] = P(x, .73); stick(ctx, px, py, 112, C.green, ang); });
    return;
  }
  const h = n <= 4 ? 120 : n <= 6 ? 108 : 86;
  SOU_POS[n].forEach(([x, y], i) => {
    const [px, py] = P(x, y);
    const red = (n === 5 && i === 2) || (n === 7 && i === 0) || (n === 9 && i % 3 === 1);
    stick(ctx, px, py, h, red ? C.red : n === 8 && (i === 1 || i === 2 || i === 5 || i === 6) ? C.blue : C.green);
  });
}
function drawBird(ctx) {
  // 一條：簡化的孔雀
  const [cx, cy] = P(.5, .52);
  ctx.save();
  ctx.translate(cx, cy);
  // 尾羽
  for (let k = -3; k <= 3; k++) {
    ctx.save();
    ctx.rotate(k * 0.22 + Math.PI);
    ctx.fillStyle = k % 2 ? C.blue : C.green;
    ctx.beginPath(); ctx.ellipse(0, -95, 16, 58, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.red;
    ctx.beginPath(); ctx.arc(0, -135, 9, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // 身體
  ctx.fillStyle = C.green;
  ctx.beginPath(); ctx.ellipse(0, -10, 42, 56, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.red;
  ctx.beginPath(); ctx.ellipse(6, -6, 18, 34, 0.2, 0, Math.PI * 2); ctx.fill();
  // 頭
  ctx.fillStyle = C.blue;
  ctx.beginPath(); ctx.arc(-6, -80, 22, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.ivory;
  ctx.beginPath(); ctx.arc(-12, -84, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.ink;
  ctx.beginPath(); ctx.arc(-12, -84, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.gold;
  ctx.beginPath(); ctx.moveTo(-26, -80); ctx.lineTo(-44, -74); ctx.lineTo(-26, -70); ctx.fill();
  // 冠羽
  ctx.strokeStyle = C.red; ctx.lineWidth = 4;
  for (const a of [-0.4, 0, 0.4]) {
    ctx.beginPath(); ctx.moveTo(-4, -100); ctx.lineTo(-4 + Math.sin(a) * 26, -100 - Math.cos(a) * 26); ctx.stroke();
  }
  ctx.restore();
}

// ---- 萬 ----
function drawMan(ctx, n) {
  text(ctx, NUM[n - 1], W / 2, H * 0.3, 120, C.ink);
  text(ctx, '萬', W / 2, H * 0.7, 132, C.red);
}

// ---- 字 ----
function drawHonor(ctx, i) {
  if (i === 6) {
    // 白板：藍色框
    ctx.strokeStyle = C.blue; ctx.lineWidth = 12;
    ctx.strokeRect(PAD + 26, PAD + 30, IW - 52, IH - 60);
    ctx.lineWidth = 4;
    ctx.strokeRect(PAD + 44, PAD + 48, IW - 88, IH - 96);
    return;
  }
  const ch = '東南西北中發白'[i];
  const color = i === 4 ? C.red : i === 5 ? C.green : C.ink;
  text(ctx, ch, W / 2, H / 2 + 6, 200, color);
}

// ---- 花 ----
function drawFlower(ctx, f) {
  const i = f - FLOWER_BASE;
  const ch = '春夏秋冬梅蘭竹菊'[i];
  const color = [C.green, C.red, C.gold, C.blue, C.red, C.blue, C.green, C.gold][i];
  // 角落數字：1~4 代表東南西北
  text(ctx, String((i % 4) + 1), PAD + 26, PAD + 30, 46, C.red, 700);
  text(ctx, '東南西北'[i % 4], W - PAD - 28, H - PAD - 32, 40, C.ink, 700);
  text(ctx, ch, W / 2, H / 2 + 4, 168, color);
  ctx.strokeStyle = color; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(PAD + 6, PAD + 6, IW - 12, IH - 12, 18); ctx.stroke();
}

export function drawFace(ctx, t) {
  base(ctx);
  if (t == null) return;
  if (t < 9) drawMan(ctx, t + 1);
  else if (t < 18) drawPin(ctx, t - 8);
  else if (t < 27) drawSou(ctx, t - 17);
  else if (t < FLOWER_BASE) drawHonor(ctx, t - 27);
  else drawFlower(ctx, t);
}

const cache = new Map();
/** 取得某張牌的牌面貼圖（快取） */
export function faceTexture(t, renderer) {
  const key = t == null ? 'blank' : t;
  if (cache.has(key)) return cache.get(key);
  // 用兩倍解析度畫，牌面比較銳利
  const cv = document.createElement('canvas');
  cv.width = W * 2; cv.height = H * 2;
  const ctx = cv.getContext('2d');
  ctx.scale(2, 2);
  drawFace(ctx, t);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 4;
  cache.set(key, tex);
  return tex;
}

export const FACE_ASPECT = H / W;
