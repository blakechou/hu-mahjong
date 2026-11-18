// 復古台味場景：柑仔店、騎樓、廟口夜市（貼圖全部用 canvas 畫）
import * as THREE from 'three';
import { FONT } from './tileFaces.js';

export const SCENES = [
  { id: 'plain', name: '素雅茶室' },
  { id: 'shop', name: '柑仔店' },
  { id: 'arcade', name: '騎樓' },
  { id: 'temple', name: '廟口夜市' },
];

const FLOOR_Y = -6;

function tex(w, h, drawFn, repeat) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  drawFn(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  t.anisotropy = 8;
  return t;
}

function noise(ctx, w, h, amt) {
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * amt;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function label(ctx, text, x, y, size, color, stroke) {
  ctx.font = `900 ${size}px ${FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (stroke) { ctx.lineWidth = size / 8; ctx.strokeStyle = stroke; ctx.strokeText(text, x, y); }
  ctx.fillStyle = color; ctx.fillText(text, x, y);
}

// ---------- 地板 ----------
const terrazzo = () => tex(512, 512, (ctx, w, h) => {
  ctx.fillStyle = '#8c857a'; ctx.fillRect(0, 0, w, h);
  const colors = ['#7f786e', '#958e83', '#867f74', '#8e7a6c'];
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = colors[i % colors.length];
    const r = 1 + Math.random() * 2.5;
    ctx.beginPath(); ctx.ellipse(Math.random() * w, Math.random() * h, r, r * (0.5 + Math.random() * 0.6), Math.random() * 3, 0, Math.PI * 2); ctx.fill();
  }
  // 磨石子的銅條分隔線
  ctx.strokeStyle = 'rgba(160,120,60,0.6)'; ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, w, h);
}, 8);

const checker = () => tex(256, 256, (ctx, w, h) => {
  const n = 4, c = w / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    ctx.fillStyle = (x + y) % 2 ? '#a99d89' : '#8d5b50';
    ctx.fillRect(x * c, y * c, c, c);
  }
  ctx.strokeStyle = 'rgba(80,60,50,0.35)'; ctx.lineWidth = 2;
  for (let i = 0; i <= n; i++) { ctx.beginPath(); ctx.moveTo(i * c, 0); ctx.lineTo(i * c, h); ctx.moveTo(0, i * c); ctx.lineTo(w, i * c); ctx.stroke(); }
  noise(ctx, w, h, 8);
}, 7);

const asphalt = () => tex(512, 512, (ctx, w, h) => {
  ctx.fillStyle = '#3a2f2c'; ctx.fillRect(0, 0, w, h);
  noise(ctx, w, h, 30);
  ctx.strokeStyle = 'rgba(230,200,90,0.5)'; ctx.lineWidth = 10;
  ctx.setLineDash([60, 40]);
  ctx.beginPath(); ctx.moveTo(0, h * 0.8); ctx.lineTo(w, h * 0.8); ctx.stroke();
}, 4);

// 深色木地板（素雅）
const woodFloor = () => tex(512, 512, (ctx, w, h) => {
  const plank = 64;
  for (let y = 0; y < h; y += plank) {
    ctx.fillStyle = (y / plank) % 2 ? '#3b2a1f' : '#36261c';
    ctx.fillRect(0, y, w, plank);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, y, w, 2);
    const off = ((y / plank) % 3) * 170;
    ctx.fillRect((off + 200) % w, y, 2, plank);
  }
  noise(ctx, w, h, 6);
}, 6);

const plainWall = () => tex(512, 256, (ctx, w, h) => {
  ctx.fillStyle = '#5a4a3c'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#3e3026'; ctx.fillRect(0, h * 0.62, w, h * 0.38);
  ctx.fillStyle = '#2e231b'; ctx.fillRect(0, h * 0.62, w, 6);
  noise(ctx, w, h, 5);
}, 0);

// ---------- 牆 ----------
const shopWall = () => tex(1024, 512, (ctx, w, h) => {
  // 木板牆
  for (let x = 0; x < w; x += 64) {
    ctx.fillStyle = x % 128 ? '#7a4a2a' : '#6e4224';
    ctx.fillRect(x, 0, 64, h);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x, 0, 2, h);
  }
  noise(ctx, w, h, 16);
  // 招牌
  ctx.fillStyle = '#b3241e'; ctx.fillRect(300, 26, 424, 96);
  ctx.strokeStyle = '#f1c453'; ctx.lineWidth = 6; ctx.strokeRect(308, 34, 408, 80);
  label(ctx, '巷仔口柑仔店', 512, 76, 58, '#ffe28a');
  // 層架與零食罐
  const jarColors = ['#e8483b', '#f2c12e', '#4cae5b', '#3b7fd1', '#ef7fb0', '#f08a2c'];
  for (const sy of [200, 320, 440]) {
    ctx.fillStyle = '#4a2a14'; ctx.fillRect(40, sy, w - 80, 14);
    for (let x = 60; x < w - 90; x += 74) {
      const c = jarColors[Math.floor(Math.random() * jarColors.length)];
      if (Math.random() < 0.55) {
        // 玻璃罐
        ctx.fillStyle = 'rgba(220,240,255,0.55)';
        ctx.beginPath(); ctx.roundRect(x, sy - 88, 56, 86, 10); ctx.fill();
        ctx.fillStyle = '#d33'; ctx.fillRect(x + 4, sy - 98, 48, 14);
        for (let k = 0; k < 9; k++) {
          ctx.fillStyle = jarColors[(k + x) % jarColors.length];
          ctx.beginPath(); ctx.arc(x + 12 + (k % 3) * 16, sy - 18 - Math.floor(k / 3) * 18, 7, 0, Math.PI * 2); ctx.fill();
        }
      } else {
        // 紙盒
        const bh = 40 + Math.random() * 40;
        ctx.fillStyle = c; ctx.fillRect(x, sy - bh, 58, bh);
        ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillRect(x + 8, sy - bh + 10, 42, 10);
      }
    }
  }
  // 撕日曆
  ctx.fillStyle = '#fbf7ec'; ctx.fillRect(70, 30, 120, 150);
  ctx.fillStyle = '#c62828'; ctx.fillRect(70, 30, 120, 34);
  label(ctx, '十一月', 130, 48, 22, '#fff');
  label(ctx, '18', 130, 120, 72, '#c62828');
}, 0);

const arcadeWall = () => tex(1024, 512, (ctx, w, h) => {
  ctx.fillStyle = '#e9e1cf'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#8fb8c2'; ctx.fillRect(0, h * 0.55, w, h * 0.45);
  ctx.fillStyle = '#6d98a3'; ctx.fillRect(0, h * 0.55, w, 10);
  noise(ctx, w, h, 12);
  // 木門＋春聯
  ctx.fillStyle = '#7b3f1d'; ctx.fillRect(420, 150, 184, 362);
  ctx.strokeStyle = '#4a240f'; ctx.lineWidth = 6; ctx.strokeRect(426, 156, 172, 356); ctx.beginPath(); ctx.moveTo(512, 156); ctx.lineTo(512, 512); ctx.stroke();
  ctx.fillStyle = '#c8202f'; ctx.fillRect(372, 160, 40, 300); ctx.fillRect(612, 160, 40, 300); ctx.fillRect(430, 110, 164, 36);
  const couplet = (s, x) => [...s].forEach((ch, i) => label(ctx, ch, x, 190 + i * 38, 30, '#1a1a1a'));
  couplet('天增歲月人增壽', 392); couplet('春滿乾坤福滿門', 632);
  label(ctx, '恭喜發財', 512, 128, 28, '#1a1a1a');
  // 鐵窗花
  for (const wx of [110, 760]) {
    ctx.fillStyle = '#334a52'; ctx.fillRect(wx, 120, 170, 170);
    ctx.strokeStyle = '#f2f2ec'; ctx.lineWidth = 6; ctx.strokeRect(wx, 120, 170, 170);
    ctx.lineWidth = 4;
    for (let k = 1; k < 3; k++) { ctx.beginPath(); ctx.moveTo(wx + k * 57, 120); ctx.lineTo(wx + k * 57, 290); ctx.stroke(); }
    for (const [cx, cy] of [[wx + 85, 160], [wx + 85, 250], [wx + 28, 205], [wx + 142, 205]]) {
      ctx.beginPath(); ctx.arc(cx, cy, 20, 0, Math.PI * 2); ctx.stroke();
    }
  }
  // 理髮廳招牌
  ctx.fillStyle = '#1d3f8f'; ctx.fillRect(40, 20, 260, 70);
  label(ctx, '美美理髮廳', 170, 56, 40, '#fff');
  ctx.fillStyle = '#f2c12e'; ctx.fillRect(724, 20, 260, 70);
  label(ctx, '阿嬤的冰果室', 854, 56, 36, '#8a1c14');
}, 0);

const templeWall = () => tex(1024, 512, (ctx, w, h) => {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0b1230'); g.addColorStop(1, '#2a1630');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 80; i++) { ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(Math.random() * w, Math.random() * h * 0.35, 2, 2); }
  // 廟的屋頂（燕尾）
  ctx.fillStyle = '#8f1d1d';
  ctx.beginPath();
  ctx.moveTo(180, 230); ctx.quadraticCurveTo(300, 200, 512, 190); ctx.quadraticCurveTo(724, 200, 844, 230);
  ctx.lineTo(880, 170); ctx.lineTo(820, 250); ctx.lineTo(204, 250); ctx.lineTo(144, 170); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#e8b64a'; ctx.lineWidth = 6; ctx.stroke();
  ctx.fillStyle = '#b3241e'; ctx.fillRect(230, 250, 564, 262);
  ctx.fillStyle = '#5a1010'; ctx.fillRect(440, 330, 144, 182);
  ctx.fillStyle = '#1b2a6b'; ctx.fillRect(430, 262, 164, 54);
  ctx.strokeStyle = '#e8b64a'; ctx.lineWidth = 4; ctx.strokeRect(430, 262, 164, 54);
  label(ctx, '福德宮', 512, 290, 40, '#ffd36b');
  // 夜市攤位
  const stalls = [['大腸包小腸', '#f2c12e'], ['蚵仔煎', '#e8483b'], ['射氣球', '#3b7fd1'], ['珍珠奶茶', '#ef7fb0']];
  stalls.forEach(([name, c], i) => {
    const x = i < 2 ? 10 + i * 110 : 794 + (i - 2) * 110;
    ctx.fillStyle = c; ctx.fillRect(x, 340, 104, 50);
    label(ctx, name, x + 52, 365, name.length > 4 ? 18 : 24, '#1a1a1a');
    ctx.fillStyle = 'rgba(255,230,160,0.9)'; ctx.fillRect(x, 390, 104, 122);
  });
  // 一串一串的燈泡
  for (let x = 0; x < w; x += 26) {
    const y = 120 + Math.sin(x / 90) * 18;
    ctx.fillStyle = ['#ffd36b', '#ff6b4a', '#7ee0ff'][Math.floor(x / 26) % 3];
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
  }
}, 0);

// ---------- 組合 ----------
function walls(group, map, tint = 0x9a9a9a) {
  const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.9, color: tint });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(72, 36), mat);
  back.position.set(0, FLOOR_Y + 18, -17);
  group.add(back);
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(60, 36), mat);
    side.position.set(sx * 30, FLOOR_Y + 18, 10);
    side.rotation.y = -sx * Math.PI / 2;
    group.add(side);
  }
}

function floor(group, map) {
  const f = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), new THREE.MeshStandardMaterial({ map, roughness: 0.9, color: 0x8a8a8a }));
  f.rotation.x = -Math.PI / 2;
  f.position.y = FLOOR_Y;
  f.receiveShadow = true;
  group.add(f);
}

function lantern(group, x, y, z, s = 1) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshStandardMaterial({ color: 0xd42a1e, emissive: 0xff3b1a, emissiveIntensity: 0.9 }));
  body.scale.set(1, 1.15, 1);
  const capMat = new THREE.MeshStandardMaterial({ color: 0xe8b64a, metalness: 0.4, roughness: 0.4 });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 16), capMat);
  top.position.y = 1.2;
  const bot = top.clone(); bot.position.y = -1.2;
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 8, 4), new THREE.MeshBasicMaterial({ color: 0x222222 }));
  string.position.y = 5.2;
  g.add(body, top, bot, string);
  g.position.set(x, y, z);
  g.scale.setScalar(s);
  group.add(g);
}

/** 建立場景，回傳 { group, background, hemi:[天空色, 地面色, 強度], warm:暖色燈強度 } */
export function buildScene(id) {
  const group = new THREE.Group();
  if (id === 'arcade') {
    floor(group, checker());
    walls(group, arcadeWall());
    // 騎樓柱子
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0xd8cbb3, roughness: 0.8 });
    for (const x of [-21, 21]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(2.4, 36, 2.4), pillarMat);
      p.position.set(x, FLOOR_Y + 18, -13);
      p.castShadow = true;
      group.add(p);
    }
    return { group, background: 0xcdbfa3, hemi: [0xfff6e6, 0x8a6a50, 1.25], warm: 0.6 };
  }
  if (id === 'temple') {
    floor(group, asphalt());
    walls(group, templeWall(), 0x8a8a99);
    for (const [x, z] of [[-14, -14], [-7, -15], [0, -15.5], [7, -15], [14, -14], [-24, -2], [24, -2]]) lantern(group, x, 10, z, 0.9);
    for (const x of [-12, 12]) {
      const l = new THREE.PointLight(0xff5a2a, 40, 40, 1.6);
      l.position.set(x, 9, -12);
      group.add(l);
    }
    return { group, background: 0x0b1230, hemi: [0x8090c0, 0x402020, 0.75], warm: 1.6 };
  }
  if (id === 'plain') {
    floor(group, woodFloor());
    walls(group, plainWall(), 0xffffff);
    return { group, background: 0x1c1410, hemi: [0xfff3dd, 0x3a2a1e, 0.95], warm: 0.9 };
  }
  floor(group, terrazzo());
  walls(group, shopWall());
  return { group, background: 0x3a2618, hemi: [0xfff3dd, 0x5a3a26, 1.0], warm: 0.9 };
}
