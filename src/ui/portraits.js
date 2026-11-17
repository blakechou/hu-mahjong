// 三位街坊的扁平插畫頭像（SVG），五種表情：normal 平常、proud 得意、upset 懊惱、nervous 緊張、laugh 大笑
export const EXPRESSIONS = ['normal', 'proud', 'upset', 'nervous', 'laugh'];

const SKIN = '#f2c49c';
const INK = '#2a1a10';

function eyes(expr, y = 53) {
  const L = 41, R = 59;
  switch (expr) {
    case 'proud':
      // 瞇眼、一邊眉毛挑高
      return `<path d="M${L - 4} ${y} q4 -3 8 0" stroke="${INK}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
        <path d="M${R - 4} ${y} q4 -3 8 0" stroke="${INK}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
        <path d="M${L - 5} ${y - 9} l9 1" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M${R - 4} ${y - 8} q5 -5 9 -2" stroke="${INK}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
    case 'laugh':
      return `<path d="M${L - 4} ${y + 1} q4 -6 8 0" stroke="${INK}" stroke-width="2.8" fill="none" stroke-linecap="round"/>
        <path d="M${R - 4} ${y + 1} q4 -6 8 0" stroke="${INK}" stroke-width="2.8" fill="none" stroke-linecap="round"/>
        <ellipse cx="${L - 4}" cy="${y + 9}" rx="4.5" ry="2.5" fill="#ff8a8a" opacity=".55"/>
        <ellipse cx="${R + 4}" cy="${y + 9}" rx="4.5" ry="2.5" fill="#ff8a8a" opacity=".55"/>`;
    case 'upset':
      // 眉頭往下皺、眼睛小
      return `<circle cx="${L}" cy="${y + 1}" r="2" fill="${INK}"/><circle cx="${R}" cy="${y + 1}" r="2" fill="${INK}"/>
        <path d="M${L - 5} ${y - 9} l9 4" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M${R + 5} ${y - 9} l-9 4" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`;
    case 'nervous':
      // 眼睛睜大、冒汗
      return `<circle cx="${L}" cy="${y}" r="4.2" fill="#fff" stroke="${INK}" stroke-width="1.4"/><circle cx="${L}" cy="${y}" r="1.8" fill="${INK}"/>
        <circle cx="${R}" cy="${y}" r="4.2" fill="#fff" stroke="${INK}" stroke-width="1.4"/><circle cx="${R}" cy="${y}" r="1.8" fill="${INK}"/>
        <path d="M${L - 5} ${y - 9} l9 -2" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
        <path d="M${R + 5} ${y - 9} l-9 -2" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
        <path d="M74 40 q-4 7 0 10 q4 -3 0 -10z" fill="#7cc6ff" stroke="#3b8fd0" stroke-width="1"/>`;
    default:
      return `<ellipse cx="${L}" cy="${y}" rx="2.3" ry="3" fill="${INK}"/><ellipse cx="${R}" cy="${y}" rx="2.3" ry="3" fill="${INK}"/>
        <path d="M${L - 5} ${y - 8} l9 -1" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
        <path d="M${R + 5} ${y - 8} l-9 -1" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`;
  }
}

function mouth(expr, lip = '#a5452f', y = 70) {
  switch (expr) {
    case 'proud': return `<path d="M43 ${y} q8 4 14 -3" stroke="${lip}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
    case 'laugh': return `<path d="M41 ${y - 3} q9 15 18 0 z" fill="#7a1f1f" stroke="${lip}" stroke-width="1.6"/><path d="M45 ${y + 3} q5 4 10 0" fill="#e86a6a"/>`;
    case 'upset': return `<path d="M44 ${y + 2} q6 -6 12 0" stroke="${lip}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
    case 'nervous': return `<path d="M42 ${y} q2.5 -3 5 0 t5 0 t5 0" stroke="${lip}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
    default: return `<path d="M44 ${y - 1} q6 4 12 0" stroke="${lip}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
  }
}

const face = (extra = '') => `
  <ellipse cx="26" cy="56" rx="4" ry="6" fill="${SKIN}"/><ellipse cx="74" cy="56" rx="4" ry="6" fill="${SKIN}"/>
  <ellipse cx="50" cy="55" rx="24" ry="27" fill="${SKIN}"/>${extra}`;

const CHARS = {
  // 柑仔店阿伯：白汗衫、禿頭兩側白髮、老花眼鏡掛胸前、耳朵夾一支筆
  abo: expr => `
    <rect width="100" height="100" fill="#f0dfb0"/>
    <path d="M14 100 q4 -20 22 -22 l28 0 q18 2 22 22z" fill="${SKIN}"/>
    <path d="M26 100 q2 -18 14 -21 l20 0 q12 3 14 21z" fill="#fbfbf6"/>
    <path d="M38 79 q12 9 24 0" stroke="#e1ded2" stroke-width="2" fill="none"/>
    <g fill="none" stroke="#5a4a3a" stroke-width="1.6"><circle cx="45" cy="90" r="4"/><circle cx="55" cy="90" r="4"/><path d="M49 90 h2"/></g>
    ${face()}
    <path d="M26 48 q-2 -14 6 -18 q-6 10 -1 20z M74 48 q2 -14 -6 -18 q6 10 1 20z" fill="#d8d8d0"/>
    <path d="M38 36 q12 -4 24 0" stroke="#d9a982" stroke-width="1.4" fill="none"/>
    <path d="M40 40 q10 -3 20 0" stroke="#d9a982" stroke-width="1.2" fill="none"/>
    <rect x="72" y="40" width="3" height="18" rx="1.5" fill="#f2c12e" transform="rotate(20 73 49)"/>
    ${eyes(expr)}${mouth(expr)}
    <path d="M47 61 q3 3 6 0" stroke="#c9946e" stroke-width="1.6" fill="none"/>`,

  // 檳榔攤阿珠姨：燙捲髮、大紅花襯衫、金項鍊、口紅、耳環
  azhu: expr => `
    <rect width="100" height="100" fill="#ffd0c8"/>
    <path d="M12 100 q4 -21 24 -23 l28 0 q20 2 24 23z" fill="#d6242c"/>
    <g fill="#fff3a0"><circle cx="24" cy="92" r="4"/><circle cx="76" cy="90" r="4.5"/><circle cx="62" cy="98" r="3.5"/><circle cx="36" cy="99" r="3"/></g>
    <g fill="#ffffff" opacity=".85"><circle cx="20" cy="92" r="2.5"/><circle cx="80" cy="92" r="2.5"/></g>
    <path d="M38 80 q12 10 24 0" stroke="#e8b64a" stroke-width="2.6" fill="none"/>
    <circle cx="50" cy="86" r="2.6" fill="#e8b64a"/>
    ${face()}
    <g fill="#4a2338">${[[30, 34], [38, 27], [48, 24], [58, 25], [67, 30], [73, 38], [26, 44], [76, 48], [24, 54], [78, 58], [42, 30], [55, 29], [63, 35], [35, 37]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="7"/>`).join('')}</g>
    <circle cx="25" cy="65" r="3" fill="#e8b64a"/><circle cx="75" cy="65" r="3" fill="#e8b64a"/>
    ${eyes(expr)}${mouth(expr, '#d0213a')}
    <path d="M48 61 q2 2 4 0" stroke="#c9946e" stroke-width="1.6" fill="none"/>`,

  // 退休林老師：灰白旁分頭、細框眼鏡、灰背心、白襯衫、紅領帶
  lin: expr => `
    <rect width="100" height="100" fill="#d3dde8"/>
    <path d="M14 100 q4 -20 22 -22 l28 0 q18 2 22 22z" fill="#6d737c"/>
    <path d="M40 78 l10 10 l10 -10 l-4 22 h-12z" fill="#ffffff"/>
    <path d="M48 84 h4 l2 16 h-8z" fill="#b3241e"/>
    ${face()}
    <path d="M25 50 q-2 -24 22 -26 q24 -2 28 24 q-6 -12 -18 -14 q-14 -2 -26 8 q-4 4 -6 8z" fill="#a8adb4"/>
    <path d="M44 26 q-8 4 -12 12" stroke="#8c9198" stroke-width="2" fill="none"/>
    ${eyes(expr)}
    <g fill="none" stroke="#3a3f47" stroke-width="1.6"><rect x="33" y="47" width="15" height="11" rx="2"/><rect x="52" y="47" width="15" height="11" rx="2"/><path d="M48 51 h4 M33 51 l-7 -2 M67 51 l7 -2"/></g>
    ${mouth(expr)}
    <path d="M47 62 q3 2 6 0" stroke="#c9946e" stroke-width="1.6" fill="none"/>`,
};

export function portraitSVG(id, expr = 'normal') {
  const draw = CHARS[id];
  if (!draw) return '';
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><clipPath id="c-${id}"><circle cx="50" cy="50" r="50"/></clipPath></defs><g clip-path="url(#c-${id})">${draw(expr)}</g></svg>`;
}
