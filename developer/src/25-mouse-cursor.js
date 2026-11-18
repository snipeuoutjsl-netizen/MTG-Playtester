// ---------------------------------------------------------------- mouse cursor (v0.53)
// Cursors are small SVG pictures made here (no files). Each style has a normal and a "hover" picture for clickable things.
const MANA_ORB = { W: ['#fffbe0', '#e8dfa8'], U: ['#8ec5ff', '#2f6fc4'], B: ['#a58cc0', '#3e2c52'], R: ['#ff9a7a', '#c23a22'], G: ['#8fe0a0', '#2f8a48'] };
const CURSOR_STYLES = [['default', 'Standard arrow'], ['gold', 'Gold arrow'], ['wand', 'Magic wand'], ['sword', 'Sword'], ['orb-W', 'Mana orb — white'], ['orb-U', 'Mana orb — blue'], ['orb-B', 'Mana orb — black'], ['orb-R', 'Mana orb — red'], ['orb-G', 'Mana orb — green'], ['custom', 'My own image…']];
function cursorSvg(style, hover) {   // returns { body, hx, hy } on a 32×32 canvas
  if (style === 'gold') return { hx: 4, hy: 3, body: `<path d="M4 3 L4 24 L10 18.5 L14.5 28 L18 26.5 L13.5 17.5 L21 17 Z" fill="${hover ? '#fff3c4' : '#e3b95c'}" stroke="${hover ? '#b88a1e' : '#3a2b0a'}" stroke-width="1.8" stroke-linejoin="round"/>${hover ? '<circle cx="26" cy="6" r="2.4" fill="#ffe27a"/>' : ''}` };
  if (style === 'wand') return { hx: 8, hy: 8, body: `<g transform="translate(3 3) scale(.9)"><circle cx="5" cy="5" r="${hover ? 7 : 6}" fill="rgba(255,226,122,${hover ? .45 : .28})"/><line x1="9" y1="9" x2="28" y2="28" stroke="#2a1a0a" stroke-width="5.2" stroke-linecap="round"/><line x1="9" y1="9" x2="28" y2="28" stroke="#7a4e22" stroke-width="3.4" stroke-linecap="round"/><line x1="12" y1="12" x2="14.5" y2="14.5" stroke="#e3b95c" stroke-width="3.4"/><g transform="translate(5 5) scale(${hover ? 1.15 : .9}) translate(-5 -5)"><path d="M5 -2 L6.7 3.3 L12 5 L6.7 6.7 L5 12 L3.3 6.7 L-2 5 L3.3 3.3 Z" fill="#ffe27a" stroke="#fff" stroke-width=".8"/></g></g>` };
  if (style === 'sword') return { hx: 3, hy: 3, body: `${hover ? '<line x1="3" y1="3" x2="19" y2="19" stroke="rgba(150,210,255,.55)" stroke-width="8" stroke-linecap="round"/>' : ''}<line x1="3" y1="3" x2="19" y2="19" stroke="#1b2026" stroke-width="5.4" stroke-linecap="round"/><line x1="3.6" y1="3.6" x2="19" y2="19" stroke="${hover ? '#ffffff' : '#dfe6ee'}" stroke-width="3" stroke-linecap="round"/><line x1="15" y1="24" x2="24" y2="15" stroke="#1b2026" stroke-width="5" stroke-linecap="round"/><line x1="15" y1="24" x2="24" y2="15" stroke="#e3b95c" stroke-width="3" stroke-linecap="round"/><line x1="21.5" y1="21.5" x2="27" y2="27" stroke="#2a1a0a" stroke-width="5" stroke-linecap="round"/><line x1="21.5" y1="21.5" x2="27" y2="27" stroke="#7a4e22" stroke-width="3" stroke-linecap="round"/><circle cx="28.5" cy="28.5" r="2.2" fill="#e3b95c"/>` };
  const m = /^orb-([WUBRG])$/.exec(style);
  if (m) { const [c1, c2] = MANA_ORB[m[1]], r = hover ? 9.5 : 7.5; return { hx: 16, hy: 16, body: `<defs><radialGradient id="g${m[1]}" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient></defs>${hover ? `<circle cx="16" cy="16" r="13.5" fill="${c2}" opacity=".35"/>` : ''}<circle cx="16" cy="16" r="${r}" fill="url(#g${m[1]})" stroke="rgba(0,0,0,.65)" stroke-width="1.6"/><circle cx="13.5" cy="13" r="2" fill="rgba(255,255,255,.6)"/>` }; }
  { const pc = typeof pixCursor === 'function' && pixCursor(style, hover); if (pc) return pc; }
  return null;
}
let cursorStyleEl = null;
function applyCursor() {
  if (!cursorStyleEl) { cursorStyleEl = document.createElement('style'); cursorStyleEl.id = 'cursorStyle'; document.head.appendChild(cursorStyleEl); }
  const st = settings.cursor || 'default', sz = settings.cursorSize || 32; let css = '';
  const mk = (hover) => {
    if (st === 'custom') { if (!settings.cursorImg) return null; const k = settings.cursorHot === 'center' ? 0.5 : 0; return `url("${settings.cursorImg}") ${Math.round(k * sz)} ${Math.round(k * sz)}`; }
    const d = cursorSvg(st, hover); if (!d) return null; const k = sz / 32;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sz}" height="${sz}" viewBox="0 0 32 32">${d.body}</svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${Math.round(d.hx * k)} ${Math.round(d.hy * k)}`;
  };
  const n = mk(false), hv = mk(true) || n;
  if (n) css = `html, body, body * { cursor: ${n}, default; }
button:not(:disabled), a, select, summary, label, .stack, .card, .swatch, .teachopt, .pimg, .frow, .verbadge, .hudbtn, .playtoggle, .mode-row, .rd-row, .lm-item:not(:disabled), .tgl, .pile, input[type=checkbox], input[type=radio], input[type=range], [role=button] { cursor: ${hv}, pointer !important; }
input[type=text], input[type=number], input[type=search], textarea { cursor: text !important; }`;
  cursorStyleEl.textContent = css;
}
