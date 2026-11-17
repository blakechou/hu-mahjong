// 畫面上的 HTML 介面：名牌、動作按鈕、喊聲泡泡、結算
import { tileName } from '../core/tiles.js';

const $ = sel => document.querySelector(sel);
const WIND = '東南西北';

export class Hud {
  constructor(root, names) {
    this.root = root;
    this.names = names;
    root.innerHTML = `
      <div class="tags">${[0, 1, 2, 3].map(k => `
        <div class="tag seat${k}" data-seat="${k}">
          <span class="wind"></span>
          <span class="who"><b class="name">${names[k]}</b><span class="score">0</span></span>
          <span class="badge"></span>
          <div class="bubble"></div>
        </div>`).join('')}
      </div>
      <div class="topbar"><span class="label"></span></div>
      <div class="tip"></div>
      <div class="actions"></div>
      <div class="modal result hidden"></div>
      <div class="modal title">
        <div class="card">
          <h1>胡麻將</h1>
          <p class="sub">巷仔口的牌桌，三缺一，就等你</p>
          <div class="cast">
            <div><b>柑仔店阿伯</b><span>穩穩仔做大牌</span></div>
            <div><b>檳榔攤阿珠姨</b><span>手腳緊、嘴閣較緊</span></div>
            <div><b>退休林老師</b><span>防守滴水不漏</span></div>
          </div>
          <button class="btn primary start">開始打牌</button>
        </div>
      </div>`;
    this.tags = [...root.querySelectorAll('.tag')];
    this.actionsEl = root.querySelector('.actions');
    this.tipEl = root.querySelector('.tip');
    this.resultEl = root.querySelector('.result');
    this.titleEl = root.querySelector('.title');
  }

  onStart(fn) {
    this.titleEl.querySelector('.start').onclick = () => { this.titleEl.classList.add('hidden'); fn(); };
  }

  /** 每一幀更新名牌位置 */
  placeTags(posFn, hudH) {
    this.tags.forEach((el, k) => {
      if (k === 0) { el.style.left = '12px'; el.style.top = ''; el.style.bottom = `${hudH + 6}px`; return; }
      const p = posFn(k);
      // 不要超出螢幕
      const half = el.offsetWidth / 2 + 6;
      p.x = Math.min(window.innerWidth - half, Math.max(half, p.x));
      p.y = Math.max(el.offsetHeight / 2 + 48, p.y);
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
      el.style.bottom = '';
    });
  }

  update({ dealer, streak, scores, turn, label, phase }) {
    this.root.querySelector('.label').textContent = label;
    this.tags.forEach((el, k) => {
      el.querySelector('.wind').textContent = WIND[(k - dealer + 4) % 4];
      el.querySelector('.score').textContent = scores[k] > 0 ? `+${scores[k]}` : String(scores[k]);
      el.querySelector('.badge').textContent = k === dealer ? (streak ? `莊 連${streak}` : '莊') : '';
      el.classList.toggle('active', turn === k && phase !== 'end');
    });
  }

  /** 某家喊聲：碰！吃！胡！ */
  shout(seat, text, kind = '') {
    const b = this.tags[seat].querySelector('.bubble');
    b.textContent = text;
    b.className = `bubble show ${kind}`;
    clearTimeout(b._t);
    b._t = setTimeout(() => { b.className = 'bubble'; }, kind === 'big' ? 2400 : 1300);
  }

  tip(text) {
    this.tipEl.textContent = text || '';
    this.tipEl.classList.toggle('show', !!text);
  }

  /** 顯示動作按鈕；buttons = [{ label, kind, onClick }] */
  actions(buttons) {
    this.actionsEl.innerHTML = '';
    for (const b of buttons) {
      const el = document.createElement('button');
      el.className = `btn act ${b.kind || ''}`;
      el.innerHTML = b.label;
      el.onclick = () => { this.actionsEl.innerHTML = ''; b.onClick(); };
      this.actionsEl.appendChild(el);
    }
  }

  setHudHeight(h) { this.root.style.setProperty('--hand-h', `${h}px`); }

  /** 一局結束的結算畫面 */
  showResult({ result, label, names, scores, dealer, over, onNext }) {
    const el = this.resultEl;
    let head, body = '';
    if (result.type === 'draw') {
      head = '<h2>流局</h2><p class="sub">海底摸完，無人胡牌</p>';
    } else {
      const w = names[result.winner];
      const how = result.special ? result.special : result.selfDraw ? '自摸' : `胡 ${names[result.from]} 放的槍`;
      head = `<h2>${w} <span class="hu">胡</span></h2>
        <p class="sub">${how}${result.tile != null ? `・${tileName(result.tile)}` : ''}</p>`;
      const winDealer = result.winner === dealer;
      const items = winDealer ? [...result.items, ...result.dealerItems] : result.items;
      const total = result.tai + (winDealer ? result.dealerTai : 0);
      const note = !winDealer && (result.from === dealer || result.from == null) ? `<p class="note">莊家另付 ${result.dealerTai} 台</p>` : '';
      body = `<ul class="tai">${items.map(i => `<li><span>${i.name}</span><b>${i.tai} 台</b></li>`).join('')}</ul>
        <p class="total">共 ${total} 台</p>${note}`;
    }
    const rows = names.map((n, k) => `<tr><td>${n}</td><td class="${result.delta[k] > 0 ? 'up' : result.delta[k] < 0 ? 'down' : ''}">${result.delta[k] > 0 ? '+' : ''}${result.delta[k]}</td><td>${scores[k]}</td></tr>`).join('');
    el.innerHTML = `<div class="card">
      <p class="round">${label}</p>
      ${head}${body}
      <table class="scores"><tr><th></th><th>這局</th><th>總分</th></tr>${rows}</table>
      <button class="btn primary next">${over ? '看總成績' : '下一局'}</button>
    </div>`;
    el.classList.remove('hidden');
    el.querySelector('.next').onclick = () => { el.classList.add('hidden'); onNext(); };
  }

  showFinal({ names, scores, onAgain }) {
    const el = this.resultEl;
    const order = [0, 1, 2, 3].sort((a, b) => scores[b] - scores[a]);
    el.innerHTML = `<div class="card">
      <h2>一將結束</h2>
      <ol class="rank">${order.map((k, i) => `<li class="${i === 0 ? 'first' : ''}"><span>${names[k]}</span><b>${scores[k] > 0 ? '+' : ''}${scores[k]}</b></li>`).join('')}</ol>
      <button class="btn primary again">再一將！</button>
    </div>`;
    el.classList.remove('hidden');
    el.querySelector('.again').onclick = () => { el.classList.add('hidden'); onAgain(); };
  }
}

export { $ };
