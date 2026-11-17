// 胡牌時噴出的紅紙屑（像鞭炮炸完的紙屑）
export class Confetti {
  constructor(root) {
    const cv = this.cv = document.createElement('canvas');
    cv.className = 'confetti';
    root.appendChild(cv);
    this.ctx = cv.getContext('2d');
    this.parts = [];
    this.running = false;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.dpr = dpr;
    this.cv.width = window.innerWidth * dpr;
    this.cv.height = window.innerHeight * dpr;
  }

  burst(x, y, n = 90) {
    const colors = ['#d62a1e', '#e8b64a', '#ff5a3c', '#fff1c4', '#b3201a'];
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3;
      const sp = 4 + Math.random() * 9;
      this.parts.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        w: 5 + Math.random() * 7, h: 3 + Math.random() * 5,
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
        c: colors[i % colors.length], life: 1,
      });
    }
    if (!this.running) { this.running = true; requestAnimationFrame(() => this.tick()); }
  }

  tick() {
    const { ctx, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    for (const p of this.parts) {
      p.vy += 0.25; p.vx *= 0.985; p.vy *= 0.985;
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      p.life -= 0.006;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 2)));
      ctx.restore();
    }
    this.parts = this.parts.filter(p => p.life > 0 && p.y < window.innerHeight + 40);
    if (this.parts.length) requestAnimationFrame(() => this.tick());
    else { this.running = false; ctx.clearRect(0, 0, this.cv.width, this.cv.height); }
  }
}
