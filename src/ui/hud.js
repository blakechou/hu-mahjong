// 畫面上的 HTML 介面：名牌、動作按鈕、喊聲泡泡、結算
import { tileName } from '../core/tiles.js';
import { STICKERS } from '../game/lines.js';
import { portraitSVG } from './portraits.js';
import { SCENES } from '../view3d/scenes.js';
import { SKINS } from '../view3d/skins.js';
import { Confetti } from './effects.js';

const SETTINGS_KEY = 'hu-mahjong-settings';
export function loadSettings() {
  const def = { coach: true, talk: true, stickers: true, sound: true, scene: 'shop', skin: 'jade' };
  try { return { ...def, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch (e) { return def; }
}
function saveSettings(v) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(v)); } catch (e) { /* 無痕模式存不了就算了 */ } }

const $ = sel => document.querySelector(sel);
const WIND = '東南西北';

export class Hud {
  constructor(root, names, faces = []) {
    this.root = root;
    this.names = names;
    this.faces = faces;
    root.innerHTML = `
      <div class="tags">${[0, 1, 2, 3].map(k => `
        <div class="tag seat${k}${faces[k] ? ' has-face' : ''}" data-seat="${k}">
          ${faces[k] ? `<span class="face">${portraitSVG(faces[k])}</span>` : ''}
          <span class="wind"></span>
          <span class="who"><b class="name">${names[k]}</b><span class="score">0</span></span>
          <span class="badge"></span>
          <div class="bubble"></div>
          <div class="say"></div>
        </div>`).join('')}
      </div>
      <div class="topbar"><span class="label"></span></div>
      <button class="iconbtn gear" title="設定">⚙</button>
      <div class="panel settings hidden">
        <h3>設定</h3>
        <label><input type="checkbox" data-k="coach"> 教學提示 <small>建議打哪張、聽哪幾張、危險牌</small></label>
        <label><input type="checkbox" data-k="talk"> 角色台詞</label>
        <label><input type="checkbox" data-k="stickers"> 嗆聲貼圖</label>
        <label><input type="checkbox" data-k="sound"> 音效</label>
        <div class="pick"><span>場景</span>${SCENES.map(x => `<button data-k="scene" data-v="${x.id}">${x.name}</button>`).join('')}</div>
        <div class="pick"><span>牌背</span>${SKINS.map(x => `<button data-k="skin" data-v="${x.id}"><i style="background:${x.color}"></i>${x.name}</button>`).join('')}</div>
        <button class="btn close">好</button>
      </div>
      <button class="iconbtn sticker-btn" title="嗆聲">💬</button>
      <div class="panel stickers hidden">
        <div class="grid">${STICKERS.map(st => `<button class="stk" data-id="${st.id}"><span>${st.icon}</span>${st.text}</button>`).join('')}</div>
        <div class="targets hidden"><span>丟給：</span>${[1, 2, 3].map(k => `<button class="btn tgt" data-seat="${k}">${names[k]}</button>`).join('')}</div>
      </div>
      <div class="coachbar"></div>
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
    this.coachEl = root.querySelector('.coachbar');
    this.settings = loadSettings();
    this.bindSettings();
    this.bindStickers();
  }

  bindSettings() {
    const panel = this.root.querySelector('.settings');
    const boxes = [...panel.querySelectorAll('input')];
    boxes.forEach(b => { b.checked = !!this.settings[b.dataset.k]; });
    this.root.querySelector('.gear').onclick = () => panel.classList.toggle('hidden');
    panel.querySelector('.close').onclick = () => panel.classList.add('hidden');
    const commit = () => {
      saveSettings(this.settings);
      this.applySettings();
      this.onSettings?.(this.settings);
    };
    boxes.forEach(b => b.onchange = () => { this.settings[b.dataset.k] = b.checked; commit(); });
    const picks = [...panel.querySelectorAll('.pick button')];
    const mark = () => picks.forEach(b => b.classList.toggle('on', this.settings[b.dataset.k] === b.dataset.v));
    picks.forEach(b => b.onclick = () => { this.settings[b.dataset.k] = b.dataset.v; mark(); commit(); });
    mark();
    this.applySettings();
    // 所有按鈕都有點擊聲
    this.root.addEventListener('click', e => { if (e.target.closest('button')) this.onUi?.('click'); });
  }

  applySettings() {
    this.root.querySelector('.sticker-btn').classList.toggle('hidden', !this.settings.stickers);
    if (!this.settings.coach) this.coach('');
  }

  bindStickers() {
    const btn = this.root.querySelector('.sticker-btn');
    const panel = this.root.querySelector('.stickers');
    const targets = panel.querySelector('.targets');
    let chosen = null;
    btn.onclick = () => {
      if (btn.disabled) return;
      chosen = null;
      targets.classList.add('hidden');
      panel.querySelectorAll('.stk').forEach(b => b.classList.remove('on'));
      panel.classList.toggle('hidden');
    };
    panel.querySelectorAll('.stk').forEach(b => b.onclick = () => {
      chosen = STICKERS.find(x => x.id === b.dataset.id);
      panel.querySelectorAll('.stk').forEach(x => x.classList.toggle('on', x === b));
      targets.classList.remove('hidden');
    });
    panel.querySelectorAll('.tgt').forEach(b => b.onclick = () => {
      if (!chosen) return;
      panel.classList.add('hidden');
      const to = Number(b.dataset.seat);
      this.throwSticker(0, to, chosen);
      this.onSticker?.(to, chosen);
      // 冷卻 5 秒
      btn.disabled = true;
      btn.classList.add('cool');
      setTimeout(() => { btn.disabled = false; btn.classList.remove('cool'); }, 5000);
    });
  }

  /** 貼圖從 from 的名牌飛到 to 的名牌 */
  throwSticker(from, to, st) {
    const a = this.tags[from].getBoundingClientRect();
    const b = this.tags[to].getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'flying';
    el.innerHTML = `<span>${st.icon}</span>${st.text}`;
    el.style.left = `${a.left + a.width / 2}px`;
    el.style.top = `${a.top + a.height / 2}px`;
    this.root.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.left = `${b.left + b.width / 2}px`;
      el.style.top = `${b.top + b.height / 2}px`;
      el.classList.add('go');
    }));
    this.onUi?.('whoosh');
    setTimeout(() => { el.classList.add('land'); this.onUi?.('pop'); }, 620);
    setTimeout(() => el.remove(), 2400);
  }

  /** 換表情；ms 之後回到平常（0 表示不回復） */
  setExpr(seat, expr, ms = 3200) {
    const id = this.faces[seat];
    if (!id) return;
    const el = this.tags[seat].querySelector('.face');
    if (el.dataset.expr !== expr) { el.innerHTML = portraitSVG(id, expr); el.dataset.expr = expr; }
    el.classList.remove('bounce'); void el.offsetWidth; el.classList.add('bounce');
    clearTimeout(el._t);
    if (ms) el._t = setTimeout(() => this.setExpr(seat, 'normal', 0), ms);
  }

  resetExpr() { [1, 2, 3].forEach(k => this.setExpr(k, 'normal', 0)); }

  /** 在某家名牌的位置噴紙屑 */
  celebrate(seat, big) {
    if (!this.confetti) this.confetti = new Confetti(this.root);
    const r = this.tags[seat].getBoundingClientRect();
    this.confetti.burst(r.left + r.width / 2, r.top + r.height / 2, big ? 160 : 90);
    if (big) setTimeout(() => this.confetti.burst(window.innerWidth / 2, window.innerHeight * 0.45, 120), 250);
  }

  /** 角色說話（名牌下方的對話框） */
  say(seat, text) {
    const b = this.tags[seat].querySelector('.say');
    b.textContent = text;
    b.classList.add('show');
    clearTimeout(b._t);
    b._t = setTimeout(() => b.classList.remove('show'), 1600 + text.length * 120);
  }

  /** 教學提示列（手牌上方，常駐） */
  coach(html) {
    this.coachEl.innerHTML = html || '';
    this.coachEl.classList.toggle('show', !!html);
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
