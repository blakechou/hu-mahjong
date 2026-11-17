// 3D 牌桌：主場景（透視鏡頭看整張桌子）＋ 手牌層（正交鏡頭固定在畫面下方，手機也好點）
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { faceTexture, FONT } from './tileFaces.js';
import { SKINS, backTexture } from './skins.js';
import { buildScene } from './scenes.js';

export const TW = 1, TH = 1.35, TD = 0.78;
const FRONT_D = 0.5, BACK_D = TD - FRONT_D;
const LIE_Y = TD / 2;
const WIND_CH = '東南西北';
// 版面（每家自己的座標：自己在 +z 那一邊）
const TABLE_HALF = 13;          // 絨布半寬
const HAND_Z = 11.0;            // 對手手牌、副露
const WALL_PITCH = TW + 0.03;   // 牌墩間距
const WALL_D = (18 * WALL_PITCH - TH) / 2;  // 牌墩內緣到中心的距離（四面牌墩排成風車形）
const WALL_X0 = WALL_D + TH - TW / 2;       // 每面牌墩最右邊那墩的 x

// 牌：前半象牙白、後半牌背顏色，都是圓角；牌面與牌背花紋是貼在表面的薄片
const R = 0.09;
const geoFront = new RoundedBoxGeometry(TW, TH, FRONT_D, 2, R);
const geoBack = new RoundedBoxGeometry(TW, TH, BACK_D, 2, R);
const geoFace = new THREE.PlaneGeometry(TW - 2 * R + 0.02, TH - 2 * R + 0.02);
// 牌的材質：象牙白與牌背都有一層亮光漆
const ivoryMat = new THREE.MeshPhysicalMaterial({ color: 0xf3ecd9, roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.22 });
const backMat = new THREE.MeshPhysicalMaterial({ color: 0x1f7a55, roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.15 });
const backFaceMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.15 });
const faceMats = new Map();

function faceMat(t, renderer) {
  if (!faceMats.has(t)) faceMats.set(t, new THREE.MeshPhysicalMaterial({ map: faceTexture(t, renderer), roughness: 0.36, clearcoat: 0.7, clearcoatRoughness: 0.22 }));
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
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    container.appendChild(r.domElement);
    // 柔和的環境反射，讓牌面與木頭有光澤
    const pmrem = new THREE.PMREMGenerator(r);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x2b1d14);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);

    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 0.45;
    this.hud = new THREE.Scene();
    this.hud.environment = this.envMap;
    this.hud.environmentIntensity = 0.2;
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
    this.wallGroup = new THREE.Group();
    this.fx = new THREE.Group();     // 骰子、抓位、抓牌時飛來飛去的牌
    this.scene.add(this.wallGroup, this.fx);
    this.anims = [];
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

    // 開始前桌上就擺好完整的牌墩
    this.renderWall({ dice: null, wallHead: 0, wallTail: 0, dealer: 0 });
    this.bindPointer();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.renderer.setAnimationLoop(now => this.frame(now));
  }

  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xfff3dd, 0x3a2a1e, 0.9);
    this.scene.add(this.hemi);
    // 桌子上方的燈泡（暖色）
    this.warm = new THREE.PointLight(0xffc27a, 60, 40, 1.4);
    this.warm.position.set(0, 13, 0);
    this.scene.add(this.warm);
    const d = new THREE.DirectionalLight(0xffffff, 1.6);
    d.position.set(-7, 20, 11);
    d.castShadow = true;
    d.shadow.mapSize.set(2048, 2048);
    d.shadow.radius = 4;
    const s = d.shadow.camera;
    s.left = -16; s.right = 16; s.top = 16; s.bottom = -16;
    d.shadow.bias = -0.0004;
    d.shadow.normalBias = 0.02;
    this.scene.add(d);
    this.hud.add(new THREE.AmbientLight(0xffffff, 0.55));
    const hd = new THREE.DirectionalLight(0xffffff, 1.25);
    hd.position.set(-0.5, 1, 0.35);
    this.hud.add(hd);
  }

  buildTable() {
    // 絨布：深綠底、細細的織紋，外圈一條金色細框
    const { tex } = canvasTexture(1024, 1024, (ctx, w, h) => {
      ctx.fillStyle = '#1d6644'; ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 0.07;
      for (let y = 0; y < h; y += 3) { ctx.fillStyle = y % 6 ? '#000' : '#fff'; ctx.fillRect(0, y, w, 1); }
      for (let x = 0; x < w; x += 3) { ctx.fillStyle = x % 6 ? '#000' : '#fff'; ctx.fillRect(x, 0, 1, h); }
      ctx.globalAlpha = 1;
      const img = ctx.getImageData(0, 0, w, h);
      for (let i = 0; i < img.data.length; i += 4) {
        const n = (Math.random() - 0.5) * 14;
        img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
      }
      ctx.putImageData(img, 0, 0);
      const g = ctx.createRadialGradient(w / 2, h / 2, w * 0.12, w / 2, h / 2, w * 0.74);
      g.addColorStop(0, 'rgba(255,255,210,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0.38)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(232,190,100,0.55)'; ctx.lineWidth = 3;
      ctx.strokeRect(w * 0.035, h * 0.035, w * 0.93, h * 0.93);
      ctx.strokeStyle = 'rgba(232,190,100,0.25)'; ctx.lineWidth = 1.5;
      ctx.strokeRect(w * 0.05, h * 0.05, w * 0.9, h * 0.9);
    });
    tex.anisotropy = 8;
    const felt = new THREE.Mesh(new THREE.PlaneGeometry(TABLE_HALF * 2, TABLE_HALF * 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.97 }));
    felt.rotation.x = -Math.PI / 2;
    felt.receiveShadow = true;
    this.scene.add(felt);
    // 木框：圓角、木紋、亮光漆
    const grain = canvasTexture(512, 128, (ctx, w, h) => {
      ctx.fillStyle = '#6a3618'; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 60; i++) {
        ctx.strokeStyle = `rgba(${30 + Math.random() * 40},${12 + Math.random() * 15},0,${0.15 + Math.random() * 0.25})`;
        ctx.lineWidth = 1 + Math.random() * 2.5;
        const y = Math.random() * h;
        ctx.beginPath(); ctx.moveTo(0, y);
        for (let x = 0; x <= w; x += 32) ctx.lineTo(x, y + Math.sin(x / 70 + i) * 4);
        ctx.stroke();
      }
    }).tex;
    grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
    grain.repeat.set(3, 1);
    const wood = new THREE.MeshPhysicalMaterial({ map: grain, roughness: 0.45, clearcoat: 0.8, clearcoatRoughness: 0.25 });
    this.woodMat = wood;
    const railLen = TABLE_HALF * 2 + 2.6;
    for (let k = 0; k < 4; k++) {
      const b = new THREE.Mesh(new RoundedBoxGeometry(railLen, 1.0, 1.3, 3, 0.3), wood);
      b.position.set(0, 0.3, TABLE_HALF + 0.65);
      const g = new THREE.Group(); g.rotation.y = k * Math.PI / 2; g.add(b);
      b.castShadow = b.receiveShadow = true;
      this.scene.add(g);
    }
    // 桌板厚度與桌腳
    const slab = new THREE.Mesh(new THREE.BoxGeometry(railLen, 1.0, railLen), wood);
    slab.position.y = -0.52;
    slab.receiveShadow = true;
    this.scene.add(slab);
    const legX = TABLE_HALF - 0.4;
    for (const [x, z] of [[-legX, -legX], [legX, -legX], [-legX, legX], [legX, legX]]) {
      const leg = new THREE.Mesh(new RoundedBoxGeometry(1.4, 5.2, 1.4, 2, 0.15), wood);
      leg.position.set(x, -3.6, z);
      leg.castShadow = true;
      this.scene.add(leg);
    }

    // 中央的風位盤
    const plate = canvasTexture(512, 512, () => {});
    this.plateCanvas = plate.cv;
    this.plateTex = plate.tex;
    const pm = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.25, 4.6), [
      wood, wood, new THREE.MeshPhysicalMaterial({ map: plate.tex, roughness: 0.5, clearcoat: 0.6 }), wood, wood, wood,
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
    const half = w < h ? 12.6 : 14.0;
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
      let x = 11.6;
      const mz = HAND_Z;
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
          if (reveal) { m.rotation.x = -Math.PI / 2; m.position.set(px, LIE_Y, HAND_Z); }
          else m.position.set(px, TH / 2, HAND_Z + 0.1);
          g.add(m);
        }
      }
    });
    this.renderWall(s);
    this.buildHand(s);
  }

  // ---------- 牌墩 ----------
  /**
   * 72 墩排成一圈：從開門那面牌墩（莊家擲骰決定）的右邊數過去，
   * 順時針往下一家（上家）的牌墩接下去。抓牌從開門處往左拿，補花、槓從另一頭拿。
   */
  breakInfo(s) {
    const total = s.dice ? s.dice.reduce((a, b) => a + b, 0) : 0;
    const dealer = s.dealer ?? 0;
    // 從莊家算起逆時針數到第 total 家（莊家自己是 1）
    const ws = total ? (dealer + total - 1) % 4 : 0;
    return { ws, n: total || 0 };
  }

  /** 第 g 墩（0~71）、第 layer 層在世界座標的位置與所屬牌墩 */
  stackPos(g, layer, info) {
    const w = ((info.ws - Math.floor(g / 18)) % 4 + 4) % 4;
    const i = g % 18;
    const v = new THREE.Vector3(WALL_X0 - i * WALL_PITCH, LIE_Y + layer * TD, WALL_D + TH / 2);
    v.applyAxisAngle(new THREE.Vector3(0, 1, 0), w * Math.PI / 2);
    return { pos: v, seat: w };
  }

  /** 第 g 墩還剩幾層（頭尾各被拿了幾張） */
  stackLayers(g, info, head, tail) {
    const fromHead = ((g - info.n) % 72 + 72) % 72;          // 從開門往左數第幾墩
    const fromTail = ((info.n - 1 - g) % 72 + 72) % 72;      // 從開門往右數第幾墩
    let layers = 2;
    const hs = Math.floor(head / 2), ts = Math.floor(tail / 2);
    if (fromHead < hs) return 0;
    if (fromHead === hs && head % 2) layers--;
    if (fromTail < ts) return 0;
    if (fromTail === ts && tail % 2) layers--;
    return layers;
  }

  renderWall(s) {
    const info = this.breakInfo(s);
    const head = s.wallHead || 0, tail = s.wallTail || 0;
    const key = `${info.ws}:${info.n}:${head}:${tail}:${s.dice ? 1 : 0}`;
    if (key === this.wallKey) return;
    this.wallKey = key;
    this.wallGroup.clear();
    for (let g = 0; g < 72; g++) {
      const layers = s.dice || head + tail === 0 ? this.stackLayers(g, info, head, tail) : 2;
      for (let layer = 0; layer < layers; layer++) {
        const { pos, seat } = this.stackPos(g, layer, info);
        const m = makeTile(null, this.renderer);
        m.rotation.set(Math.PI / 2, 0, 0, 'YXZ');
        m.rotation.y = seat * Math.PI / 2;
        m.position.copy(pos);
        this.wallGroup.add(m);
      }
    }
  }

  // ---------- 動畫小工具 ----------
  /** 跑一段 ms 毫秒的動畫，fn(t) 的 t 從 0 到 1 */
  animate(ms, fn, done) {
    this.anims.push({ t0: performance.now(), ms, fn, done });
  }

  wait(ms) { return new Promise(r => setTimeout(r, ms)); }

  /** 一張牌從 from 飛到 to（世界座標），飛完就消失 */
  flyTile(from, to, ms = 260, rotY = 0) {
    const m = makeTile(null, this.renderer);
    m.rotation.set(Math.PI / 2, rotY, 0, 'YXZ');
    m.position.copy(from);
    this.fx.add(m);
    this.animate(ms, t => {
      const e = 1 - Math.pow(1 - t, 3);
      m.position.lerpVectors(from, to, e);
      m.position.y += Math.sin(Math.PI * t) * 1.6;
    }, () => this.fx.remove(m));
  }

  /** 某家手牌那一帶的世界座標（抓牌飛過去的目的地） */
  handPos(seatRel) {
    const v = new THREE.Vector3(0, TH / 2, seatRel === 0 ? TABLE_HALF + 1 : HAND_Z);
    return v.applyAxisAngle(new THREE.Vector3(0, 1, 0), seatRel * Math.PI / 2);
  }

  /** 抓牌：從開門處拿 count 張飛到某家（第 headFrom 張開始） */
  dealGrab(s, headFrom, count, seatRel) {
    const info = this.breakInfo(s);
    for (let j = 0; j < count; j++) {
      const idx = headFrom + j;
      const g = (info.n + Math.floor(idx / 2)) % 72;
      const { pos, seat } = this.stackPos(g, idx % 2 ? 0 : 1, info);
      setTimeout(() => this.flyTile(pos, this.handPos(seatRel), 280, seat * Math.PI / 2), j * 30);
    }
  }

  // ---------- 骰子 ----------
  /** 擲三顆骰子：從 seatRel 那一家丟到桌子中央，最後停在 values */
  rollDice(values, seatRel, onBounce) {
    return new Promise(resolve => {
      this.clearDice();
      const yAxis = new THREE.Vector3(0, 1, 0);
      const dice = values.map((v, i) => {
        const d = makeDie();
        const startLocal = new THREE.Vector3(-1.2 + i * 1.2, 2.6, 8);
        const endLocal = new THREE.Vector3(-1.4 + i * 1.4 + (Math.random() - 0.5) * 0.6, 0.25 + DIE / 2, 1.2 + (Math.random() - 0.5) * 1.2);
        const from = startLocal.applyAxisAngle(yAxis, seatRel * Math.PI / 2);
        const to = endLocal.applyAxisAngle(yAxis, seatRel * Math.PI / 2);
        const final = dieQuaternion(v, Math.random() * Math.PI * 2);
        const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
        const spin = 14 + Math.random() * 8;
        d.position.copy(from);
        this.fx.add(d);
        return { d, from, to, final, axis, spin };
      });
      this.dice = dice.map(x => x.d);
      let bounced = 0;
      this.animate(1300, t => {
        const e = 1 - Math.pow(1 - t, 2.2);
        // 彈跳：三下，一下比一下低
        const hop = Math.abs(Math.sin(Math.PI * 3 * Math.pow(t, 0.8))) * 2.4 * Math.pow(1 - t, 1.6);
        const nb = Math.floor(3 * Math.pow(t, 0.8));
        if (nb > bounced) { bounced = nb; onBounce?.(); }
        for (const x of dice) {
          x.d.position.lerpVectors(x.from, x.to, e);
          x.d.position.y = x.to.y + hop + (1 - e) * (x.from.y - x.to.y) * 0.4;
          const q = new THREE.Quaternion().setFromAxisAngle(x.axis, x.spin * Math.pow(1 - t, 2));
          x.d.quaternion.copy(x.final).multiply(q);
        }
      }, resolve);
    });
  }

  clearDice() { (this.dice || []).forEach(d => this.fx.remove(d)); this.dice = []; }

  // ---------- 抓位 ----------
  /** 四張風牌蓋在桌上，每家輪流抓一張翻開。picks：[{ seatRel, wind }]，依抓的順序 */
  async seatDraw(picks, onPick) {
    this.clearDice();
    const tiles = [0, 1, 2, 3].map(i => {
      const m = makeTile(null, this.renderer);
      m.rotation.set(Math.PI / 2, 0, 0, 'YXZ');
      m.position.set(-1.65 + i * 1.1, 0.25 + LIE_Y, 0);
      this.fx.add(m);
      return m;
    });
    await this.wait(500);
    const yAxis = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < picks.length; i++) {
      const { seatRel, wind } = picks[i];
      const m = tiles[i];
      // 換成有牌面的牌（翻開時才看得到）
      const faced = makeTile(27 + wind, this.renderer);
      faced.position.copy(m.position);
      faced.rotation.copy(m.rotation);
      this.fx.remove(m);
      this.fx.add(faced);
      tiles[i] = faced;
      const from = faced.position.clone();
      const to = new THREE.Vector3(-0.6 + (i % 2) * 1.2, LIE_Y, 6.2).applyAxisAngle(yAxis, seatRel * Math.PI / 2);
      const yaw = seatRel * Math.PI / 2;
      await new Promise(res => this.animate(650, t => {
        const e = 1 - Math.pow(1 - t, 3);
        faced.position.lerpVectors(from, to, e);
        faced.position.y += Math.sin(Math.PI * t) * 2;
        faced.rotation.set(Math.PI / 2 - Math.PI * e, yaw * e, 0, 'YXZ');
      }, res));
      onPick?.(i);
      await this.wait(250);
    }
    await this.wait(1400);
    tiles.forEach(m => this.fx.remove(m));
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
    const local = new THREE.Vector3(0, 1.8, 12.4);
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
    this.anims = this.anims.filter(a => {
      const t = Math.min(1, (now - a.t0) / a.ms);
      a.fn(t);
      if (t >= 1) { a.done?.(); return false; }
      return true;
    });
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
    // 手牌不套用電影色調，牌面顏色才鮮明
    r.toneMapping = THREE.NoToneMapping;
    r.render(this.hud, this.hudCam);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    this.onFrame?.(now);
  }
}

// ---------- 骰子 ----------
const DIE = 0.62;
const dieGeo = new RoundedBoxGeometry(DIE, DIE, DIE, 3, 0.1);
const dieBody = new THREE.MeshPhysicalMaterial({ color: 0xfbf8f1, roughness: 0.3, clearcoat: 0.8 });
const pipGeo = new THREE.PlaneGeometry(DIE * 0.86, DIE * 0.86);
const pipMats = {};
function pipMat(v) {
  if (pipMats[v]) return pipMats[v];
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  const P = { 1: [[.5, .5]], 2: [[.27, .27], [.73, .73]], 3: [[.25, .25], [.5, .5], [.75, .75]], 4: [[.27, .27], [.73, .27], [.27, .73], [.73, .73]],
    5: [[.25, .25], [.75, .25], [.5, .5], [.25, .75], [.75, .75]], 6: [[.27, .22], [.73, .22], [.27, .5], [.73, .5], [.27, .78], [.73, .78]] }[v];
  ctx.fillStyle = v === 1 || v === 4 ? '#c8202a' : '#1b1b1f';
  for (const [x, y] of P) { ctx.beginPath(); ctx.arc(x * 128, y * 128, v === 1 ? 26 : 12, 0, Math.PI * 2); ctx.fill(); }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return (pipMats[v] = new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
}
// 每一面的點數與法向量：+y 1、-y 6、+x 2、-x 5、+z 3、-z 4（對面相加為 7）
const FACES = [[1, [0, 1, 0]], [6, [0, -1, 0]], [2, [1, 0, 0]], [5, [-1, 0, 0]], [3, [0, 0, 1]], [4, [0, 0, -1]]];
function makeDie() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(dieGeo, dieBody);
  body.castShadow = true;
  g.add(body);
  for (const [v, n] of FACES) {
    const p = new THREE.Mesh(pipGeo, pipMat(v));
    const normal = new THREE.Vector3(...n);
    p.position.copy(normal).multiplyScalar(DIE / 2 + 0.002);
    p.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    g.add(p);
  }
  return g;
}
/** 讓點數 v 朝上的旋轉（再繞 y 軸轉 yaw） */
function dieQuaternion(v, yaw) {
  const n = new THREE.Vector3(...FACES.find(f => f[0] === v)[1]);
  const q = new THREE.Quaternion().setFromUnitVectors(n, new THREE.Vector3(0, 1, 0));
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiply(q);
}
