import { TableView, setSkin } from './view3d/tableView.js';
import { sfx } from './ui/audio.js';
import { Hud } from './ui/hud.js';
import { PlayerUI } from './game/playerUI.js';
import { TableHost } from './game/host.js';
import { HostSession, ClientSession, localSink } from './net/session.js';

const DEFAULT_NAMES = ['你', '阿伯', '阿珠姨', '林老師'];
const DEFAULT_FACES = [null, 'abo', 'azhu', 'lin'];

async function boot() {
  // 等牌面字型載入，牌面才不會用到預設字型
  try {
    await Promise.race([
      Promise.all([document.fonts.load('900 100px "Noto Serif TC"', '一二三四五六七八九萬東南西北中發春夏秋冬梅蘭竹菊'), document.fonts.ready]),
      new Promise(r => setTimeout(r, 3000)),
    ]);
  } catch (e) { /* 字型載不到就用系統字 */ }

  const view = new TableView(document.getElementById('stage'));
  const hud = new Hud(document.getElementById('hud'), DEFAULT_NAMES, DEFAULT_FACES);

  // 設定：場景、牌背、音效
  const apply = st => {
    view.setScene(st.scene);
    setSkin(st.skin);
    sfx.enabled = st.sound;
    if (ui?.v) ui.state(ui.v, ui.meta);
  };
  let ui = null;
  const hookSettings = () => {
    const coach = hud.onSettings;
    hud.onSettings = st => { apply(st); coach?.(st); };
  };
  apply(hud.settings);
  hud.onUi = kind => sfx[kind]?.();
  document.addEventListener('pointerdown', () => sfx.unlock(), { capture: true });
  view.onFrame = () => hud.placeTags(k => view.seatScreenPos(k), view.hudH);
  hud.setHudHeight(view.hudH);
  window.addEventListener('resize', () => hud.setHudHeight(view.hudH));

  hud.onMenu({
    // 單機：自己＋三位電腦街坊
    solo(name) {
      let host;
      ui = new PlayerUI(view, hud, {
        send: a => host.act(0, a),
        sendSticker: (to, id) => host.sticker(0, to, id),
        next: () => host.next(),
        again: () => host.again(),
        roll: () => host.roll(0),
      });
      hookSettings();
      host = new TableHost({
        seats: [
          { kind: 'local', name: name === '雀友' ? '你' : name, sink: localSink(ui) },
          { kind: 'ai' }, { kind: 'ai' }, { kind: 'ai' },
        ],
      });
      window.__host = host;
      window.__ui = ui;
      host.newMatch();
    },
    // 開房間
    async host(name) {
      const session = new HostSession({ hud, name });
      ui = new PlayerUI(view, hud, {
        send: a => session.host?.act(0, a),
        sendSticker: (to, id) => session.host?.sticker(0, to, id),
        next: () => session.host?.next(),
        again: () => session.host?.again(),
        roll: () => session.host?.roll(0),
      });
      hookSettings();
      session.attach(ui);
      hud.notice('開房間中…', '取消', () => session.leave());
      try {
        await session.open();
        hud.hideNotice();
      } catch (e) {
        hud.notice(`開房失敗：${e.message || e}`, '好');
      }
      window.__session = session;
    },
    // 加入房間
    async join(code, name) {
      const session = new ClientSession({ hud });
      ui = new PlayerUI(view, hud, {
        send: a => session.send({ t: 'act', a }),
        sendSticker: (to, id) => session.send({ t: 'sticker', to, id }),
        roll: () => session.send({ t: 'roll' }),
      });
      hookSettings();
      hud.notice('連線中…', '取消', () => { location.href = location.pathname; });
      try {
        await session.join(code, name, ui);
        hud.hideNotice();
      } catch (e) {
        hud.notice(`加入失敗：${e.message || e}`, '好');
      }
      window.__session = session;
    },
  });
}

boot();
