// 音效：用 Web Audio 即時合成，不需要音檔。
// 牌的聲音用「模態合成」：真實的牌碰撞時，牌身會在幾個固定頻率共振、很快衰減，
// 再加上一瞬間的撞擊聲與桌板的低頻悶響。每次都隨機微調，聽起來才不會一模一樣。
// 另外加了小房間的殘響，以及依座位左右分聲道。

const rand = (a, b) => a + Math.random() * (b - a);

// 材質預設：modes = [[頻率倍數, 衰減秒數, 音量], ...]
const MATERIAL = {
  // 牌打在絨布桌面：被布吸掉高頻，偏「托」的悶聲
  felt: {
    f0: [1700, 2300], modes: [[1, 0.032, 0.5], [2.71, 0.018, 0.22], [5.2, 0.01, 0.08]],
    click: { freq: 2200, q: 0.8, dur: 0.012, vol: 0.35 },
    body: { freq: [130, 170], decay: 0.075, vol: 0.42 },
  },
  // 牌碰牌：清脆的「喀」
  tile: {
    f0: [2700, 3500], modes: [[1, 0.055, 0.55], [1.47, 0.042, 0.38], [2.09, 0.03, 0.26], [2.93, 0.02, 0.14]],
    click: { freq: 4500, q: 0.7, dur: 0.006, vol: 0.4 },
    body: { freq: [260, 320], decay: 0.03, vol: 0.12 },
  },
  // 骰子（樹脂）落在木盤上
  dice: {
    f0: [4300, 6200], modes: [[1, 0.022, 0.4], [1.62, 0.016, 0.25], [2.31, 0.012, 0.15]],
    click: { freq: 6000, q: 0.9, dur: 0.004, vol: 0.35 },
    body: { freq: [380, 460], decay: 0.035, vol: 0.18 },
  },
};

export class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.8;
  }

  /** 瀏覽器規定要在使用者點擊後才能發聲 */
  unlock() {
    if (!this.ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      const c = this.ctx = new C();
      // 壓縮器：聲音疊在一起時不會爆音
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 4;
      comp.attack.value = 0.002; comp.release.value = 0.15;
      comp.connect(c.destination);
      this.master = c.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(comp);
      // 小房間殘響
      this.reverb = c.createConvolver();
      this.reverb.buffer = this.makeImpulse(0.55, 3.2);
      this.wet = c.createGain();
      this.wet.gain.value = 0.16;
      this.reverb.connect(this.wet).connect(this.master);
      const len = c.sampleRate;
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  get ready() { return this.enabled && this.ctx && this.ctx.state === 'running'; }

  makeImpulse(seconds, decay) {
    const c = this.ctx;
    const n = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        // 低通過的雜訊，越後面越小聲：像木頭房間的悶殘響
        lp += (Math.random() * 2 - 1 - lp) * 0.35;
        d[i] = lp * Math.pow(1 - i / n, decay);
      }
    }
    return buf;
  }

  /** 一個聲音的出口：左右聲道＋乾聲＋殘響 */
  bus(pan = 0) {
    const c = this.ctx;
    const g = c.createGain();
    const p = c.createStereoPanner ? c.createStereoPanner() : null;
    if (p) { p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); p.connect(this.master); p.connect(this.reverb); }
    else { g.connect(this.master); g.connect(this.reverb); }
    return g;
  }

  // ---------- 基本元件 ----------
  noise(t, dur, { freq = 2000, q = 1, type = 'bandpass', vol = 0.5, freqEnd, out, attack = 0 } = {}) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = c.createGain();
    if (attack) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); }
    else g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out || this.bus());
    src.start(t, Math.random() * 0.8, dur + 0.05);
  }

  tone(t, dur, freq, { type = 'sine', vol = 0.3, freqEnd, attack = 0.002, out } = {}) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out || this.bus());
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** 一次撞擊：撞擊聲＋共振＋桌板悶響 */
  impact(t, material, vol = 1, pan = 0) {
    const m = MATERIAL[material];
    const out = this.bus(pan);
    const f0 = rand(m.f0[0], m.f0[1]);
    const hard = rand(0.8, 1.15);
    this.noise(t, m.click.dur, { freq: m.click.freq * hard, q: m.click.q, vol: m.click.vol * vol, type: 'bandpass', out });
    for (const [ratio, decay, amp] of m.modes) {
      this.tone(t, decay * rand(0.85, 1.2), f0 * ratio * rand(0.985, 1.015), { vol: amp * vol * hard, attack: 0.0008, out });
    }
    const bf = rand(m.body.freq[0], m.body.freq[1]);
    this.tone(t, m.body.decay, bf, { vol: m.body.vol * vol, freqEnd: bf * 0.6, attack: 0.001, out });
  }

  // ---------- 遊戲音效 ----------
  /** 打牌：牌拍在絨布上，再輕輕彈一下 */
  discard(delay = 0.15, pan = 0) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + delay;
    this.noise(t - 0.03, 0.04, { freq: 700, q: 0.6, vol: 0.05, type: 'lowpass', attack: 0.02, out: this.bus(pan) });
    this.impact(t, 'felt', 1, pan);
    this.impact(t + rand(0.028, 0.04), 'felt', 0.18, pan);
  }

  /** 摸牌：從牌墩拿起來時牌跟牌輕輕碰到 */
  draw(pan = 0, vol = 1) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.impact(t, 'tile', 0.32 * vol, pan);
    this.noise(t + 0.01, 0.07, { freq: 2600, q: 0.5, vol: 0.04 * vol, attack: 0.02, out: this.bus(pan) });
  }

  /** 吃碰槓：把牌一張張亮在桌上，「喀、喀、喀」 */
  call(count = 3, pan = 0) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < count; i++) {
      const tt = t + 0.08 + i * rand(0.06, 0.085);
      this.impact(tt, 'felt', 0.75, pan);
      this.impact(tt + 0.004, 'tile', 0.45, pan);
    }
  }

  /** 補花：把花牌亮在桌上 */
  flower(pan = 0) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.impact(t, 'felt', 0.55, pan);
    this.impact(t + 0.05, 'tile', 0.25, pan);
  }

  /** 洗牌：一大把牌在絨布上翻攪，嘩啦嘩啦 */
  shuffle(seconds = 1.8) {
    if (!this.ready) return;
    const c = this.ctx;
    const t = c.currentTime;
    // 牌在布上滑動的沙沙聲，忽大忽小
    const out = this.bus(0);
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.5;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    for (let k = 0; k <= 12; k++) {
      const tt = t + (k / 12) * seconds;
      g.gain.linearRampToValueAtTime(k === 12 ? 0.0001 : rand(0.03, 0.09), tt);
    }
    src.connect(f).connect(g).connect(out);
    src.start(t);
    src.stop(t + seconds + 0.1);
    // 牌互相撞擊
    const n = Math.round(seconds * 70);
    for (let i = 0; i < n; i++) {
      const tt = t + Math.random() * seconds;
      const loud = Math.pow(Math.random(), 2.2);
      this.impact(tt, Math.random() < 0.8 ? 'tile' : 'felt', 0.06 + loud * 0.3, rand(-0.7, 0.7));
    }
  }

  /** 骰子在木盤上彈跳 */
  diceHit() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const tt = t + i * rand(0.012, 0.03);
      this.impact(tt, 'dice', rand(0.6, 1), rand(-0.3, 0.3));
      if (Math.random() < 0.6) this.impact(tt + rand(0.02, 0.05), 'dice', 0.25, rand(-0.3, 0.3));
    }
  }

  /** 鞭炮：一連串不規則的爆裂聲，左右都有 */
  firecrackers(t, seconds, density) {
    let tt = t;
    while (tt < t + seconds) {
      const pan = rand(-0.9, 0.9);
      const out = this.bus(pan);
      const v = rand(0.25, 0.6);
      this.noise(tt, rand(0.02, 0.05), { freq: rand(1200, 3500), q: 0.5, vol: v, type: 'bandpass', out });
      this.noise(tt, 0.012, { freq: 5000, q: 0.4, vol: v * 0.7, type: 'highpass', out });
      this.tone(tt, 0.06, rand(90, 140), { vol: v * 0.45, freqEnd: 50, out });
      tt += rand(0.02, 1 / density);
    }
  }

  /** 胡牌：鞭炮＋喜氣的五聲音階 */
  win(big = false) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    [523, 587, 659, 784, 880, 1047].forEach((f, i) => this.tone(t + i * 0.08, 0.45, f, { type: 'triangle', vol: 0.11 }));
    this.tone(t + 0.5, 1.0, 1047, { type: 'sine', vol: 0.08 });
    this.firecrackers(t + 0.3, big ? 2.4 : 1.4, big ? 28 : 18);
  }

  lose() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    [392, 330, 262].forEach((f, i) => this.tone(t + i * 0.16, 0.35, f, { type: 'triangle', vol: 0.1 }));
  }

  drawGame() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    [440, 392].forEach((f, i) => this.tone(t + i * 0.22, 0.4, f, { type: 'sine', vol: 0.1 }));
  }

  /** 介面按鈕：輕輕的木頭「篤」 */
  click() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.tone(t, 0.05, 1250, { vol: 0.07, attack: 0.001 });
    this.tone(t, 0.035, 2600, { vol: 0.025, attack: 0.001 });
  }

  whoosh() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.noise(t, 0.5, { freq: 400, freqEnd: 3000, q: 1.2, vol: 0.18, attack: 0.15 });
  }

  pop() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.tone(t, 0.12, 300, { vol: 0.25, freqEnd: 900 });
    this.noise(t, 0.06, { freq: 1500, q: 1, vol: 0.15 });
  }

  /** 輪到你：兩下輕輕的木魚聲 */
  yourTurn() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    for (const [dt, f] of [[0, 880], [0.11, 1175]]) {
      this.tone(t + dt, 0.12, f, { vol: 0.06, attack: 0.001 });
      this.tone(t + dt, 0.05, f * 2.6, { vol: 0.015, attack: 0.001 });
    }
  }
}

export const sfx = new Sfx();
