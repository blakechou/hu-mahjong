import { TableView } from './view3d/tableView.js';
import { Hud } from './ui/hud.js';
import { Game, NAMES } from './game/controller.js';

async function boot() {
  // 等牌面字型載入，牌面才不會用到預設字型
  try {
    await Promise.race([
      Promise.all([document.fonts.load('900 100px "Noto Serif TC"', '一二三四五六七八九萬東南西北中發春夏秋冬梅蘭竹菊'), document.fonts.ready]),
      new Promise(r => setTimeout(r, 3000)),
    ]);
  } catch (e) { /* 字型載不到就用系統字 */ }

  const view = new TableView(document.getElementById('stage'));
  const hud = new Hud(document.getElementById('hud'), NAMES);
  const game = new Game(view, hud);
  view.onFrame = () => {
    hud.placeTags(k => view.seatScreenPos(k), view.hudH);
  };
  hud.setHudHeight(view.hudH);
  window.addEventListener('resize', () => hud.setHudHeight(view.hudH));
  hud.onStart(() => game.newMatch());
  window.__game = game; // 除錯用
}

boot();
