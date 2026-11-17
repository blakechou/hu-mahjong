// 音效：全部用 Web Audio 即時合成，不需要音檔
export class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.7;
  }

  /** 瀏覽器規定要在使用者點擊後才能發聲 */
  unlock() {
    if (!this.ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      this.ctx = new C();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  get ready() { return this.enabled && this.ctx && this.ctx.state === 'running'; }

  // ---------- 基本元件 ----------
  noise(t, dur, { freq = 2000, q = 1, type = 'bandpass', vol = 0.5, freqEnd } = {}) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }

  tone(t, dur, freq, { type = 'sine', vol = 0.3, freqEnd, attack = 0.004 } = {}) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** 牌碰到桌面的「喀」 */
  knock(t, vol = 1) {
    const v = 0.85 + Math.random() * 0.3;
    this.noise(t, 0.05, { freq: 2600 * v, q: 3, vol: 0.55 * vol });
    this.tone(t, 0.07, 1100 * v, { type: 'triangle', vol: 0.18 * vol, freqEnd: 700 * v });
    this.tone(t, 0.09, 180, { vol: 0.22 * vol, freqEnd: 90 });
  }

  // ---------- 遊戲音效 ----------
  discard(delay = 0.15) { if (!this.ready) return; this.knock(this.ctx.currentTime + delay); }

  draw() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.noise(t, 0.06, { freq: 3500, q: 2, vol: 0.18 });
    this.knock(t + 0.05, 0.35);
  }

  /** 吃碰槓：亮牌「喀喀喀」＋木魚聲 */
  call(count = 3) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < count; i++) this.knock(t + i * 0.06, 0.8);
    this.tone(t + 0.02, 0.18, 620, { type: 'sine', vol: 0.25, freqEnd: 480 });
  }

  flower() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    [988, 1319].forEach((f, i) => this.tone(t + i * 0.07, 0.25, f, { type: 'triangle', vol: 0.12 }));
  }

  /** 洗牌：一陣嘩啦啦 */
  shuffle() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 40; i++) this.knock(t + Math.random() * 1.1, 0.12 + Math.random() * 0.2);
    this.noise(t, 1.1, { freq: 1800, q: 0.6, vol: 0.06, type: 'bandpass' });
  }

  /** 胡牌：鞭炮＋喜氣的五聲音階 */
  win(big = false) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const notes = [523, 587, 659, 784, 880, 1047];
    notes.forEach((f, i) => this.tone(t + i * 0.08, 0.4, f, { type: 'triangle', vol: 0.16 }));
    this.tone(t + 0.5, 0.9, 1047, { type: 'sine', vol: 0.12 });
    const n = big ? 60 : 32;
    for (let i = 0; i < n; i++) {
      const tt = t + 0.25 + Math.random() * (big ? 2.2 : 1.4);
      this.noise(tt, 0.05 + Math.random() * 0.04, { freq: 900 + Math.random() * 2500, q: 0.7, vol: 0.35 + Math.random() * 0.3, type: 'bandpass' });
      this.tone(tt, 0.05, 120, { vol: 0.15, freqEnd: 60 });
    }
  }

  lose() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    [392, 330, 262].forEach((f, i) => this.tone(t + i * 0.16, 0.35, f, { type: 'triangle', vol: 0.14 }));
  }

  drawGame() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    [440, 392].forEach((f, i) => this.tone(t + i * 0.22, 0.4, f, { type: 'sine', vol: 0.14 }));
  }

  /** 骰子落在桌上 */
  diceHit() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.025 + Math.random() * 0.02;
      this.noise(tt, 0.04, { freq: 3800 + Math.random() * 1500, q: 4, vol: 0.35 });
      this.tone(tt, 0.05, 1800 + Math.random() * 600, { type: 'triangle', vol: 0.08 });
    }
  }

  click() { if (!this.ready) return; this.tone(this.ctx.currentTime, 0.06, 1500, { type: 'sine', vol: 0.08, freqEnd: 900 }); }

  whoosh() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.noise(t, 0.55, { freq: 400, freqEnd: 3000, q: 1.2, vol: 0.25 });
  }

  pop() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.tone(t, 0.12, 300, { type: 'sine', vol: 0.3, freqEnd: 900 });
    this.noise(t, 0.08, { freq: 1500, q: 1, vol: 0.2 });
  }

  /** 輪到你：輕輕的提示音 */
  yourTurn() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.tone(t, 0.15, 880, { type: 'sine', vol: 0.07 });
    this.tone(t + 0.09, 0.2, 1175, { type: 'sine', vol: 0.06 });
  }
}

export const sfx = new Sfx();
