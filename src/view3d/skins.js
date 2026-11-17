// 台式牌背花紋（全部用 canvas 畫）
import * as THREE from 'three';

const W = 128, H = 172;

function draw(id, ctx) {
  const s = SKINS.find(x => x.id === id);
  ctx.fillStyle = s.color;
  ctx.fillRect(0, 0, W, H);
  if (id === 'tatung') {
    // 大同電鍋綠：素面，中間一圈淺色細框
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(14, 14, W - 28, H - 28, 14); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 14, 0, Math.PI * 2); ctx.fill();
  } else if (id === 'tiles') {
    // 紅白磁磚：小方塊交錯
    const n = 8, cw = W / n;
    for (let y = 0; y * cw < H; y++) {
      for (let x = 0; x < n; x++) {
        ctx.fillStyle = (x + y) % 2 ? '#f4efe6' : '#c0302c';
        ctx.fillRect(x * cw + 1, y * cw + 1, cw - 2, cw - 2);
      }
    }
  } else if (id === 'hakka') {
    // 客家花布：紅底牡丹
    const flower = (cx, cy, r, c) => {
      ctx.fillStyle = c;
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55, r * 0.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#ffd34d';
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.32, 0, Math.PI * 2); ctx.fill();
    };
    const leaf = (cx, cy, a) => {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
      ctx.fillStyle = '#2f8a4a';
      ctx.beginPath(); ctx.ellipse(0, 0, 13, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    };
    leaf(30, 62, 0.6); leaf(98, 120, -0.6); leaf(70, 30, 2.2); leaf(40, 150, -2.4);
    flower(36, 38, 24, '#ff8fb1');
    flower(94, 92, 28, '#ffffff');
    flower(30, 130, 20, '#ffd1dc');
    flower(104, 158, 16, '#ff8fb1');
  } else if (id === 'grille') {
    // 鐵窗花：藍綠底白色鐵窗
    ctx.strokeStyle = '#f2f2ec'; ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, W - 20, H - 20);
    for (const y of [10 + (H - 20) / 3, 10 + (H - 20) * 2 / 3]) { ctx.beginPath(); ctx.moveTo(10, y); ctx.lineTo(W - 10, y); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(W / 2, 10); ctx.lineTo(W / 2, H - 10); ctx.stroke();
    ctx.lineWidth = 3;
    for (const [cx, cy] of [[W / 2, H / 2], [W / 2, 10 + (H - 20) / 6], [W / 2, H - 10 - (H - 20) / 6]]) {
      ctx.beginPath(); ctx.arc(cx, cy, 16, 0, Math.PI * 2); ctx.stroke();
      // 捲曲花紋
      for (const sx of [-1, 1]) {
        ctx.beginPath(); ctx.arc(cx + sx * 30, cy, 10, sx > 0 ? Math.PI : 0, sx > 0 ? Math.PI * 2.6 : Math.PI * 1.6); ctx.stroke();
      }
    }
  } else {
    // 翡翠綠：淡淡的光澤
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, 'rgba(255,255,255,0.18)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
}

export const SKINS = [
  { id: 'jade', name: '翡翠綠', color: '#1f7a55' },
  { id: 'tatung', name: '電鍋綠', color: '#5fae8e' },
  { id: 'tiles', name: '紅白磁磚', color: '#c0302c' },
  { id: 'hakka', name: '客家花布', color: '#c8202f' },
  { id: 'grille', name: '鐵窗花', color: '#2f7d8c' },
];

const cache = new Map();
export function backTexture(id) {
  if (cache.has(id)) return cache.get(id);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  draw(id, cv.getContext('2d'));
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(id, tex);
  return tex;
}
