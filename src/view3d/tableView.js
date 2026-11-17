// 3D 牌桌：主場景（透視鏡頭看整張桌子）＋ 手牌層（正交鏡頭固定在畫面下方，手機也好點）
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { faceTexture, FONT } from './tileFaces.js';
import { SKINS, backTexture } from './skins.js';
import { buildScene } from './scenes.js';

export const TW = 1, TH = 1.35, TD = 0.78;
const FRONT_D = 0.5, BACK_D = TD - FRONT_D;
const LIE_Y = TD / 2;
const WIND_CH = '東南西北';

// 牌：前半象牙白、後半牌背顏色，都是圓角；牌面與牌背花紋是貼在表面的薄片
const R = 0.09;
const geoFront = new RoundedBoxGeometry(TW, TH, FRONT_D, 2, R);
const geoBack = new RoundedBoxGeometry(TW, TH, BACK_D, 2, R);
const geoFace = new THREE.PlaneGeometry(TW - 2 * R + 0.02, TH - 2 * R + 0.02);
const ivoryMat = new THREE.MeshStandardMaterial({ color: 0xf1e9d2, roughness: 0.42 });
const backMat = new THREE.MeshStandardMaterial({ color: 0x1f7a55, roughness: 0.35 });
const backFaceMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 });
const faceMats = new Map();

function faceMat(t, renderer) {
  if (!faceMats.has(t)) faceMats.set(t, new THREE.MeshStandardMaterial({ map: faceTexture(t, renderer), roughness: 0.4 }));
  return faceMats.get(t);
}

export function makeTile(t, renderer) {
  const g = new THREE.Group();
  const front = new THREE.Mesh(geoFront, ivoryMat);
  front.position.z = TD / 2 - FRONT_D / 2;
  const back = new THREE.Mesh(geoBack, backMat);
  back.position.z = -TD / 2 + BACK_D / 2;
  const bf = new THREE.Mesh(geoFace, backFaceMat);
  bf.position.z = -TD / 2 - 0.002;
  bf.rotation.y = Math.PI;
  front.castShadow = back.castShadow = true;
  front.receiveShadow = back.receiveShadow = true;
  g.add(front, back, bf);
  if (t != null) {
    const face = new THREE.Mesh(geoFace, faceMat(t, renderer));
    face.position.z = TD / 2 + 0.002;
    g.add(face);
  }
  g.userData.tile = t;
  return g;
}

/** 換牌背 */
export function setSkin(id) {
  const s = SKINS.find(x => x.id === id) || SKINS[0];
  backMat.color.set(s.color);
  backFaceMat.map = backTexture(s.id);
  backFaceMat.needsUpdate = true;
}
setSkin('jade');

function canvasTexture(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, cv };
}

export class TableView {
  constructor(container) {
    this.container = container;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.autoClear = false;
    r.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x2b1d14);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);

    this.hud = new THREE.Scene();
    this.hudCam = new THREE.OrthographicCamera(0, 1, 1, 0, -2000, 2000);
    this.hudCam.position.z = 1000; // 點擊用的射線要從手牌前方射出

    this.buildLights();
    this.buildTable();
    this.setScene('shop');
    this.seatGroups = [0, 1, 2, 3].map(k => {
      const g = new THREE.Group();
      g.rotation.y = k * Math.PI / 2;
      this.scene.add(g);
      return g;
    });
    this.handGroup = new THREE.Group();
    this.hud.add(this.handGroup);
    // 教學提示：建議打的那張上方的金色小箭頭
    this.hintMarker = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.34, 3), new THREE.MeshBasicMaterial({ color: 0xffc23d }));
    this.hintMarker.rotation.x = Math.PI;
    this.hintMarker.visible = false;
    this.hud.add(this.hintMarker);
    this.hintTile = null;

    // 最後打出的牌上方的小指標
    this.marker = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 4), new THREE.MeshBasicMaterial({ color: 0xff4a3d }));
    this.marker.rotation.x = Math.PI;
    this.marker.visible = false;
    this.scene.add(this.marker);

    this.tweens = [];
    this.handTiles = [];
    this.hover = -1;
    this.selected = -1;
    this.interactive = false;
    this.allowed = null;
    this.onTileClick = null;
    this.lastKey = '';
    this.raycaster = new THREE.Raycaster();

    this.bindPointer();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.renderer.setAnimationLoop(now => this.frame(now));
  }

  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xfff3dd, 0x3a2a1e, 1.1);
    this.scene.add(this.hemi);
    // 桌子上方的燈泡（暖色）
    this.warm = new THREE.PointLight(0xffc27a, 60, 40, 1.4);
    this.warm.position.set(0, 13, 0);
    this.scene.add(this.warm);
    const d = new THREE.DirectionalLight(0xffffff, 1.6);
    d.position.set(-6, 18, 10);
    d.castShadow = true;
    d.shadow.mapSize.set(2048, 2048);
    const s = d.shadow.camera;
    s.left = -13; s.right = 13; s.top = 13; s.bottom = -13;
    d.shadow.bias = -0.0005;
    this.scene.add(d);
    this.hud.add(new THREE.AmbientLight(0xffffff, 1.4));
    const hd = new THREE.DirectionalLight(0xffffff, 1.4);
    hd.position.set(0.3, 1, 1.4);
    this.hud.add(hd);
  }

  buildTable() {
    // 綠色絨布
    const { tex } = canvasTexture(512, 512, (ctx, w, h) => {
      ctx.fillStyle = '#1f6a45'; ctx.fillRect(0, 0, w, h);
      const img = ctx.getImageData(0, 0, w, h);
      for (let i = 0; i < img.data.length; i += 4) {
        const n = (Math.random() - 0.5) * 18;
        img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
      }
      ctx.putImageData(img, 0, 0);
      const g = ctx.createRadialGradient(w / 2, h / 2, w * 0.15, w / 2, h / 2, w * 0.72);
      g.addColorStop(0, 'rgba(255,255,220,0.08)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    });
    const felt = new THREE.Mesh(new THREE.PlaneGeometry(22, 22), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    felt.rotation.x = -Math.PI / 2;
    felt.receiveShadow = true;
    this.scene.add(felt);
    // 木框
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b3a1f, roughness: 0.55 });
    for (let k = 0; k < 4; k++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(23.6, 0.8, 0.8), wood);
      b.position.set(0, 0.25, 11.4);
      const g = new THREE.Group(); g.rotation.y = k * Math.PI / 2; g.add(b);
      b.castShadow = b.receiveShadow = true;
      this.scene.add(g);
    }
    // 桌板厚度與桌腳
    const slab = new THREE.Mesh(new THREE.BoxGeometry(23.6, 0.9, 23.6), wood);
    slab.position.y = -0.46;
    slab.receiveShadow = true;
    this.scene.add(slab);
    for (const [x, z] of [[-10.5, -10.5], [10.5, -10.5], [-10.5, 10.5], [10.5, 10.5]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(1.2, 5.2, 1.2), wood);
      leg.position.set(x, -3.5, z);
      leg.castShadow = true;
      this.scene.add(leg);
    }

    // 中央的風位盤
    const plate = canvasTexture(512, 512, () => {});
    this.plateCanvas = plate.cv;
    this.plateTex = plate.tex;
    const pm = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.25, 4.6), [
      wood, wood, new THREE.MeshStandardMaterial({ map: plate.tex, roughness: 0.6 }), wood, wood, wood,
    ]);
    pm.position.y = 0.125;
    pm.receiveShadow = true;
    this.scene.add(pm);
  }

  /** 換場景：柑仔店、騎樓、廟口夜市 */
  setScene(id) {
    if (id === this.sceneId) return;
    this.sceneId = id;
    if (this.sceneGroup) this.scene.remove(this.sceneGroup);
    const sc = buildScene(id);
    this.sceneGroup = sc.group;
    this.scene.add(sc.group);
    this.scene.background = new THREE.Color(sc.background);
    this.hemi.color.set(sc.hemi[0]);
    this.hemi.groundColor.set(sc.hemi[1]);
    this.hemi.intensity = sc.hemi[2];
    this.warm.intensity = 60 * sc.warm;
  }

  drawPlate(s) {
    const ctx = this.plateCanvas.getContext('2d');
    const w = 512;
    ctx.fillStyle = '#4a2814'; ctx.fillRect(0, 0, w, w);
    ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 6; ctx.strokeRect(14, 14, w - 28, w - 28);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // 每家的門風，寫在靠近那家的那一邊；座位 0 在下方
    for (let k = 0; k < 4; k++) {
      ctx.save();
      ctx.translate(w / 2, w / 2);
      ctx.rotate(-k * Math.PI / 2);
      const active = s.turn === k && s.phase !== 'end';
      if (active) {
        ctx.fillStyle = 'rgba(255,190,60,0.9)';
        ctx.beginPath(); ctx.roundRect(-70, 140, 140, 92, 16); ctx.fill();
      }
      ctx.fillStyle = active ? '#3a1a08' : (k === s.dealer ? '#ff6b4a' : '#f3e2b8');
      ctx.font = `900 76px ${FONT}`;
      ctx.fillText(WIND_CH[(k - s.dealer + 4) % 4], 0, 188);
      ctx.restore();
    }
    ctx.fillStyle = '#f3e2b8';
    ctx.font = `900 40px ${FONT}`;
    ctx.fillText(s.label || '', w / 2, w / 2 - 34);
    ctx.font = `700 56px ${FONT}`;
    ctx.fillStyle = '#ffd36b';
    ctx.fillText(String(Math.max(0, s.remaining)), w / 2, w / 2 + 34);
    this.plateTex.needsUpdate = true;
  }

  // ---------- 版面 ----------
  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.W = w; this.H = h;
    this.renderer.setSize(w, h);
    // 手牌大小：直向螢幕排成兩排，牌才不會太小
    this.rows = w < h * 0.8 ? 2 : 1;
    this.tw = this.rows === 2
      ? Math.max(20, Math.min((w - 16) / 9.6, h * 0.075, 64))
      : Math.max(20, Math.min(w / 19.2, h * 0.11, 64));
    this.hudH = this.rows * this.tw * TH * 0.92 + this.tw * 0.9;
    this.hudCam.left = 0; this.hudCam.right = w; this.hudCam.top = h; this.hudCam.bottom = 0;
    this.hudCam.updateProjectionMatrix();
    // 主鏡頭：讓整張桌子落在手牌上方的區域
    const availH = Math.max(100, h - this.hudH);
    const cam = this.camera;
    cam.aspect = w / h;
    const vfov = THREE.MathUtils.degToRad(cam.fov);
    const tanV = Math.tan(vfov / 2) * (availH / h);
    const tanH = Math.tan(vfov / 2) * (w / h);
    const half = w < h ? 11.2 : 12.4;
    const dist = Math.max(half / tanH, (half * 0.82) / tanV);
    const elev = THREE.MathUtils.degToRad(w < h ? 68 : 56);
    const target = new THREE.Vector3(0, 0, w < h ? 0.4 : 1.2);
    cam.position.set(0, Math.sin(elev) * dist, Math.cos(elev) * dist).add(target);
    cam.lookAt(target);
    cam.setViewOffset(w, h, 0, this.hudH / 2, w, h);
    cam.updateProjectionMatrix();
    this.layoutHand();
  }

  // ---------- 畫面更新 ----------
  /**
   * s：給座位 0 看的牌局狀態（Round.viewFor(0) 加上 label）
   */
  render(s) {
    this.state = s;
    this.drawPlate(s);
    for (const g of this.seatGroups) g.clear();
    const key = s.lastDiscard ? `${s.lastDiscard.seat}:${s.lastDiscard.index}` : '';
    const fresh = key !== this.lastKey;
    this.lastKey = key;
    this.marker.visible = false;

    s.players.forEach((P, k) => {
      const g = this.seatGroups[k];
      // 牌河：每排 6 張
      P.discards.forEach((d, i) => {
        if (d.taken) return;
        const m = makeTile(d.tile, this.renderer);
        const col = i % 6, row = Math.floor(i / 6);
        m.rotation.x = -Math.PI / 2;
        m.position.set(-2.6 + col * TW * 1.04, LIE_Y, 3.1 + row * TH * 1.04);
        g.add(m);
        const isLast = s.lastDiscard && s.lastDiscard.seat === k && s.lastDiscard.index === i && s.phase !== 'end';
        if (isLast) {
          this.lastDiscardMesh = m;
          this.marker.visible = true;
          if (fresh) this.tween(m.position, 'y', LIE_Y + 2.2, LIE_Y, 220);
        }
      });
      // 副露：從右邊往左排
      let x = 9.6;
      const mz = k === 0 ? 8.7 : 9.4;
      for (let mi = P.melds.length - 1; mi >= 0; mi--) {
        const meld = P.melds[mi];
        const tiles = meld.tiles;
        for (let j = tiles.length - 1; j >= 0; j--) {
          const hidden = meld.type === 'ankan' && (j === 0 || j === 3);
          const m = makeTile(hidden ? null : tiles[j], this.renderer);
          m.rotation.x = hidden ? Math.PI / 2 : -Math.PI / 2;
          x -= TW / 2;
          m.position.set(x, LIE_Y, mz);
          x -= TW / 2;
          g.add(m);
        }
        x -= 0.25;
      }
      const meldLeft = x;
      // 花牌：放在自己牌河右手邊的角落
      P.flowers.forEach((f, i) => {
        const m = makeTile(f, this.renderer);
        m.rotation.x = -Math.PI / 2;
        m.scale.setScalar(0.75);
        m.position.set(4.0 + (i % 4) * 0.8, LIE_Y * 0.75, 4.4 + Math.floor(i / 4) * 1.1);
        g.add(m);
      });
      // 對手的手牌（立著，背面朝桌子中央）；結束時攤開
      if (k !== 0) {
        const n = P.handCount;
        const reveal = s.phase === 'end' && P.hand;
        const width = n * TW * 1.03;
        const right = Math.min(meldLeft - 0.4, width / 2);
        for (let i = 0; i < n; i++) {
          const m = makeTile(reveal ? P.hand[i] : null, this.renderer);
          const px = right - width + i * TW * 1.03 + TW / 2;
          if (reveal) { m.rotation.x = -Math.PI / 2; m.position.set(px, LIE_Y, 9.6); }
          else m.position.set(px, TH / 2, 9.8);
          g.add(m);
        }
      }
    });
    this.buildHand(s);
  }

  buildHand(s) {
    this.handGroup.clear();
    this.handTiles = [];
    const me = s.players[0];
    if (!me.hand) return;
    let tiles = me.hand.slice();
    let drawn = null;
    if (s.drawn != null && s.phase === 'turn' && s.turn === 0) {
      // 摸進來的牌放最右邊，其他排好
      const i = tiles.lastIndexOf(s.drawn);
      tiles.splice(i, 1);
      drawn = s.drawn;
    }
    tiles.sort((a, b) => a - b);
    const list = tiles.map(t => ({ t, drawn: false }));
    if (drawn != null) list.push({ t: drawn, drawn: true });
    // 新摸進來的牌從上面滑下來
    const dk = drawn != null ? `${s.remaining}:${drawn}` : '';
    if (dk && dk !== this.drawKey) this.tween(this, 'drawOffset', 1, 0, 260, () => this.layoutHand());
    this.drawKey = dk;
    list.forEach(({ t, drawn: d }) => {
      const m = makeTile(t, this.renderer);
      m.rotation.x = -0.32;
      m.userData.drawn = d;
      this.handGroup.add(m);
      this.handTiles.push(m);
    });
    if (this.selected >= this.handTiles.length) this.selected = -1;
    this.layoutHand();
  }

  layoutHand() {
    if (!this.handTiles) return;
    const tw = this.tw;
    const n = this.handTiles.length;
    const hasDrawn = this.handTiles.some(m => m.userData.drawn);
    const gap = hasDrawn ? tw * 0.4 : 0;
    const rowH = TH * tw * 0.92;
    const y0 = tw * 0.45 + (TH * tw) / 2;
    // 兩排時：上排放前半，下排放後半（摸進來的牌在下排最右邊）
    const rows = [];
    if (this.rows === 2) {
      const plain = n - (hasDrawn ? 1 : 0);
      const top = Math.ceil(plain / 2);
      rows.push(this.handTiles.slice(0, top), this.handTiles.slice(top));
    } else rows.push(this.handTiles);
    const widest = Math.max(...rows.map(r => r.length * tw + (r.some(m => m.userData.drawn) ? gap : 0)));
    const left = (this.W - widest) / 2 + tw / 2;
    rows.forEach((row, ri) => {
      let x = left;
      const y = y0 + (rows.length - 1 - ri) * rowH;
      row.forEach(m => {
        const i = this.handTiles.indexOf(m);
        if (m.userData.drawn) x += gap;
        m.scale.setScalar(tw);
        let up = i === this.selected ? 0.34 : i === this.hover && this.canClick(i) ? 0.2 : 0;
        if (m.userData.drawn) up += (this.drawOffset || 0) * 1.6;
        m.position.set(x, y + up * tw, ri * 10);
        x += tw;
      });
    });
    // 建議打的牌：同一種牌有好幾張時，指最右邊那張
    const hm = this.hintTile == null ? null : [...this.handTiles].reverse().find(m => m.userData.tile === this.hintTile);
    this.hintMarker.visible = !!hm && this.interactive;
    if (hm) {
      this.hintMarker.scale.setScalar(tw);
      this.hintMarker.position.set(hm.position.x, hm.position.y + TH * tw * 0.5 + tw * 0.32, 100);
    }
  }

  setHint(tile) { this.hintTile = tile; this.layoutHand(); }

  /** 讓玩家可以點牌（allowedTiles：可以打的牌，null 表示都可以） */
  setInteractive(on, allowedTiles = null) {
    this.interactive = on;
    this.allowed = allowedTiles ? new Set(allowedTiles) : null;
    if (!on) this.selected = -1;
    this.layoutHand();
  }

  canClick(i) {
    if (!this.interactive) return false;
    const t = this.handTiles[i]?.userData.tile;
    return !this.allowed || this.allowed.has(t);
  }

  bindPointer() {
    const el = this.renderer.domElement;
    const pick = e => {
      const rect = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.hudCam);
      const hits = this.raycaster.intersectObjects(this.handTiles, true);
      if (!hits.length) return -1;
      let o = hits[0].object;
      while (o.parent && !this.handTiles.includes(o)) o = o.parent;
      return this.handTiles.indexOf(o);
    };
    el.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch') return;
      const i = pick(e);
      if (i !== this.hover) {
        this.hover = i;
        el.style.cursor = i >= 0 && this.canClick(i) ? 'pointer' : 'default';
        this.layoutHand();
        this.onHover?.(i >= 0 ? this.handTiles[i].userData.tile : null);
      }
    });
    el.addEventListener('pointerleave', () => { this.hover = -1; this.layoutHand(); this.onHover?.(null); });
    el.addEventListener('pointerup', e => {
      const i = pick(e);
      if (i < 0) { this.selected = -1; this.layoutHand(); return; }
      if (!this.canClick(i)) return;
      const tile = this.handTiles[i].userData.tile;
      // 手機：第一下選起來，第二下打出去；滑鼠：直接打出去
      if (e.pointerType === 'touch' && this.selected !== i) {
        this.selected = i;
        this.layoutHand();
        this.onHover?.(tile);
        return;
      }
      this.selected = -1;
      this.onTileClick?.(tile);
    });
  }

  /** 某家名牌在畫面上的位置（像素） */
  seatScreenPos(k) {
    const local = new THREE.Vector3(0, 1.8, 10.6);
    const v = local.applyAxisAngle(new THREE.Vector3(0, 1, 0), k * Math.PI / 2);
    v.project(this.camera);
    return { x: (v.x + 1) / 2 * this.W, y: (1 - v.y) / 2 * this.H };
  }

  // ---------- 動畫 ----------
  tween(obj, prop, from, to, ms, onUpdate) {
    obj[prop] = from;
    this.tweens = this.tweens.filter(t => !(t.obj === obj && t.prop === prop));
    this.tweens.push({ obj, prop, from, to, ms, t0: performance.now(), onUpdate });
  }

  frame(now) {
    this.tweens = this.tweens.filter(tw => {
      const k = Math.min(1, (now - tw.t0) / tw.ms);
      const e = 1 - Math.pow(1 - k, 3);
      tw.obj[tw.prop] = tw.from + (tw.to - tw.from) * e;
      tw.onUpdate?.();
      return k < 1;
    });
    if (this.marker.visible && this.lastDiscardMesh) {
      const p = new THREE.Vector3();
      this.lastDiscardMesh.getWorldPosition(p);
      this.marker.position.set(p.x, p.y + 1.1 + Math.sin(now / 220) * 0.15, p.z);
    }
    if (this.hintMarker.visible) this.hintMarker.rotation.y = now / 500;
    const r = this.renderer;
    r.clear();
    r.render(this.scene, this.camera);
    r.clearDepth();
    r.render(this.hud, this.hudCam);
    this.onFrame?.(now);
  }
}
