// ---- v0.99.48 The Library hall: the start screen. Shown at every launch unless switched off.
// v0.99.50 drawn as one room seen through one camera (CSS 3D, a fixed 1600 x 900 stage scaled to the window): you sit at a desk facing a wall;
// four floating shelves (ten books each) hang on the wall, the two upper ones above your eye line (you see their undersides), the lower ones
// near it; the open menu book leans on a stand in the middle of the desk. Pulling a book brings it down onto the desk and its details
// fill the pages of the open book.
const HALL_KEY = 'mtgpt.hallStart', NOTES_KEY = 'mtgpt.deckNotes';
// Librarian's notes: real numbers from games played in the app (never invented).
function deckNotes(name) { const a = lsGet(NOTES_KEY, {}) || {}; return a[name] || null; }
function updateNotes(name, fn) { if (!name) return; const a = lsGet(NOTES_KEY, {}) || {}; const n = a[name] || { games: 0, keeps: 0, mulls: 0, lands: 0, wins: [] }; fn(n); a[name] = n; lsSet(NOTES_KEY, a); }
function libraryNotesTick() {   // called from render: records a kept hand once, and the turn the opponent first reaches 0 life
  if (!state || !state.deckName) return;
  if (state.phase === 'play' && !state.notedKeep) { state.notedKeep = true; const lands = state.hand.filter(c => isLandName(c.name)).length, mu = state.mulls || 0; updateNotes(state.deckName, n => { n.keeps++; n.mulls += mu; n.lands += lands; }); }
  if (!state.notedWin && state.oppLife !== undefined && state.oppLife <= 0) { state.notedWin = true; const t = state.turn; updateNotes(state.deckName, n => { n.wins.push(t); if (n.wins.length > 50) n.wins.shift(); }); }
}
function noteGameStarted(name) { updateNotes(name, n => { n.games++; n.last = Date.now(); }); }
function libraryNotesEl(name) {
  const n = deckNotes(name); if (!n || !n.games) return h('div', { class: 'lib-notes empty', text: 'Librarian’s notes: not opened yet. Notes appear here as you play.' });
  const ago = n.last ? Math.max(0, Math.round((Date.now() - n.last) / 86400000)) : null, avg = (a, b) => b ? (a / b).toFixed(1) : '–';
  const w = n.wins || [], wt = w.length ? (w.reduce((a, b) => a + b, 0) / w.length).toFixed(1) : null;
  return h('div', { class: 'lib-notes' }, h('div', { class: 'fhead', text: 'Librarian’s notes' }),
    h('div', { text: `Opened ${n.games} time${n.games === 1 ? '' : 's'}${ago === null ? '' : ago === 0 ? ', last today' : `, last ${ago} day${ago === 1 ? '' : 's'} ago`}.` }),
    n.keeps ? h('div', { text: `Kept hands: ${avg(n.lands, n.keeps)} lands on average; ${avg(n.mulls, n.keeps)} mulligans per game.` }) : null,
    wt ? h('div', { text: `Goldfish kills: ${w.length}, on turn ${wt} on average (fastest turn ${Math.min(...w)}).` }) : null);
}
// ---- the hall itself
let hallHost = null;
const TM_WARP_SVG = '<svg class="tm-warp" width="0" height="0" style="position:absolute;width:0;height:0" aria-hidden="true"><defs><filter id="pgWarpL" x="0" y="0" width="1" height="1" primitiveUnits="objectBoundingBox" color-interpolation-filters="sRGB"><feImage href="data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22100%22%20height%3D%22100%22%20preserveAspectRatio%3D%22none%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22rgb%28128%2C128%2C0%29%22/%3E%3Cstop%20offset%3D%220.5%22%20stop-color%3D%22rgb%28128%2C128%2C0%29%22/%3E%3Cstop%20offset%3D%220.6%22%20stop-color%3D%22rgb%28128%2C124%2C0%29%22/%3E%3Cstop%20offset%3D%220.7%22%20stop-color%3D%22rgb%28128%2C113%2C0%29%22/%3E%3Cstop%20offset%3D%220.8%22%20stop-color%3D%22rgb%28128%2C95%2C0%29%22/%3E%3Cstop%20offset%3D%220.9%22%20stop-color%3D%22rgb%28128%2C70%2C0%29%22/%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22rgb%28128%2C38%2C0%29%22/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect%20width%3D%22100%22%20height%3D%22100%22%20fill%3D%22url%28%23g%29%22/%3E%3C/svg%3E" x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="m"/><feDisplacementMap in="SourceGraphic" in2="m" scale="0.075" xChannelSelector="R" yChannelSelector="G"/></filter><filter id="pgWarpR" x="0" y="0" width="1" height="1" primitiveUnits="objectBoundingBox" color-interpolation-filters="sRGB"><feImage href="data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22100%22%20height%3D%22100%22%20preserveAspectRatio%3D%22none%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22rgb%28128%2C38%2C0%29%22/%3E%3Cstop%20offset%3D%220.1%22%20stop-color%3D%22rgb%28128%2C70%2C0%29%22/%3E%3Cstop%20offset%3D%220.2%22%20stop-color%3D%22rgb%28128%2C95%2C0%29%22/%3E%3Cstop%20offset%3D%220.3%22%20stop-color%3D%22rgb%28128%2C113%2C0%29%22/%3E%3Cstop%20offset%3D%220.4%22%20stop-color%3D%22rgb%28128%2C124%2C0%29%22/%3E%3Cstop%20offset%3D%220.5%22%20stop-color%3D%22rgb%28128%2C128%2C0%29%22/%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22rgb%28128%2C128%2C0%29%22/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect%20width%3D%22100%22%20height%3D%22100%22%20fill%3D%22url%28%23g%29%22/%3E%3C/svg%3E" x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="m"/><feDisplacementMap in="SourceGraphic" in2="m" scale="0.075" xChannelSelector="R" yChannelSelector="G"/></filter></defs></svg>';   // v0.99.73 the writing bends with the page: a displacement filter lowers it towards the spine, the way lines sag into the gutter of a real book
// v0.99.73 the writing always fits its page: if the lowest line would fall past the page's bottom edge (larger system text, a long deck name,
// a small window), that page's writing is scaled down a little at a time until it fits
function fitBookPages(root) {
  if (!root) return;
  for (const pg of root.querySelectorAll('.hall-tome .hall-page')) {
    const box = pg.querySelector(':scope > .ti-page') || pg; const kids = box === pg ? [...pg.children].filter(x => getComputedStyle(x).visibility !== 'hidden' && !x.classList.contains('tm-folio')) : [box];
    for (const k of kids) k.style.zoom = '';
    const limit = () => { const r = pg.getBoundingClientRect(); return r.bottom - r.height * 0.06; };
    const low = () => { let m = -1e9; for (const x of (box === pg ? kids : [box]).flatMap(k => [k, ...k.querySelectorAll('*')])) { if (x.children.length || !x.textContent.trim()) continue; const b = x.getBoundingClientRect().bottom; if (b > m) m = b; } return m; };
    let z = 1; for (let i = 0; i < 10 && low() > limit(); i++) { z -= 0.03; for (const k of (box === pg ? kids : [box.firstElementChild ? box : box])) k.style.zoom = z.toFixed(2); }
  }
}
const TM_BLOCK_SVG = '<svg class="tm-block" viewBox="0 0 100 109" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="tmShadeL" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".6" stop-color="#000" stop-opacity=".04"/><stop offset="1" stop-color="#2a1606" stop-opacity=".55"/></linearGradient><linearGradient id="tmShadeR" x1="1" x2="0"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".6" stop-color="#000" stop-opacity=".04"/><stop offset="1" stop-color="#2a1606" stop-opacity=".55"/></linearGradient></defs><path d="M45.5,105.69 Q50,100.6 54.5,105.69 L54.5,108.5 Q50,107.5 45.5,108.5 Z" fill="#160a03"/><path d="M0,95.8 L1,95.8 L2,95.8 L3,95.8 L4,95.8 L5,95.8 L6,95.8 L7,95.8 L8,95.8 L9,95.8 L10,95.8 L11,95.8 L12,95.8 L13,95.8 L14,95.8 L15,95.8 L16,95.8 L17,95.8 L18,95.8 L19,95.8 L20,95.8 L21,95.8 L22,95.8 L23,95.8 L24,95.81 L25,95.83 L26,95.86 L27,95.89 L28,95.94 L29,95.99 L30,96.05 L31,96.12 L32,96.21 L33,96.3 L34,96.39 L35,96.5 L36,96.62 L37,96.75 L38,96.88 L39,97.02 L40,97.18 L41,97.34 L42,97.51 L43,97.69 L44,97.88 L45,98.08 L46,98.28 L47,98.5 L48,98.72 L49,98.96 L50,99.2 L50,107.6 L49,107.15 L48,106.72 L47,106.3 L46,105.89 L45,105.5 L44,105.12 L43,104.76 L42,104.41 L41,104.07 L40,103.75 L39,103.44 L38,103.14 L37,102.86 L36,102.6 L35,102.35 L34,102.11 L33,101.88 L32,101.67 L31,101.48 L30,101.29 L29,101.13 L28,100.97 L27,100.83 L26,100.71 L25,100.59 L24,100.5 L23,100.41 L22,100.34 L21,100.29 L20,100.24 L19,100.22 L18,100.2 L17,100.2 L16,100.2 L15,100.2 L14,100.2 L13,100.2 L12,100.2 L11,100.2 L10,100.2 L9,100.2 L8,100.2 L7,100.2 L6,100.2 L5,100.2 L4,100.2 L3,100.2 L2,100.2 L1,100.2 L0,100.2 Z" fill="#e3cf9f"/><path d="M0,96.93 L1,96.93 L2,96.93 L3,96.93 L4,96.93 L5,96.93 L6,96.93 L7,96.93 L8,96.93 L9,96.93 L10,96.93 L11,96.93 L12,96.93 L13,96.93 L14,96.93 L15,96.93 L16,96.93 L17,96.93 L18,96.93 L19,96.93 L20,96.93 L21,96.94 L22,96.94 L23,96.95 L24,96.96 L25,96.99 L26,97.02 L27,97.07 L28,97.12 L29,97.18 L30,97.26 L31,97.34 L32,97.43 L33,97.53 L34,97.64 L35,97.76 L36,97.89 L37,98.03 L38,98.18 L39,98.33 L40,98.5 L41,98.68 L42,98.86 L43,99.06 L44,99.26 L45,99.48 L46,99.7 L47,99.93 L48,100.18 L49,100.43 L50,100.69" fill="none" stroke="#cdb27e" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M0,97.25 L1,97.25 L2,97.25 L3,97.25 L4,97.25 L5,97.25 L6,97.25 L7,97.25 L8,97.25 L9,97.25 L10,97.25 L11,97.25 L12,97.25 L13,97.25 L14,97.25 L15,97.25 L16,97.25 L17,97.25 L18,97.25 L19,97.26 L20,97.26 L21,97.27 L22,97.28 L23,97.29 L24,97.32 L25,97.35 L26,97.39 L27,97.44 L28,97.51 L29,97.58 L30,97.66 L31,97.75 L32,97.85 L33,97.97 L34,98.09 L35,98.22 L36,98.36 L37,98.51 L38,98.67 L39,98.84 L40,99.03 L41,99.22 L42,99.42 L43,99.63 L44,99.85 L45,100.08 L46,100.32 L47,100.57 L48,100.83 L49,101.1 L50,101.38" fill="none" stroke="#ecdcb0" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M0,97.58 L1,97.58 L2,97.58 L3,97.58 L4,97.58 L5,97.58 L6,97.58 L7,97.58 L8,97.58 L9,97.58 L10,97.58 L11,97.58 L12,97.58 L13,97.58 L14,97.58 L15,97.58 L16,97.58 L17,97.58 L18,97.58 L19,97.59 L20,97.59 L21,97.61 L22,97.62 L23,97.64 L24,97.67 L25,97.71 L26,97.76 L27,97.82 L28,97.89 L29,97.97 L30,98.06 L31,98.17 L32,98.28 L33,98.4 L34,98.53 L35,98.68 L36,98.83 L37,99 L38,99.17 L39,99.36 L40,99.55 L41,99.76 L42,99.97 L43,100.2 L44,100.44 L45,100.68 L46,100.94 L47,101.21 L48,101.49 L49,101.77 L50,102.07" fill="none" stroke="#b8995f" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M0,97.91 L1,97.91 L2,97.91 L3,97.91 L4,97.91 L5,97.91 L6,97.91 L7,97.91 L8,97.91 L9,97.91 L10,97.91 L11,97.91 L12,97.91 L13,97.91 L14,97.91 L15,97.91 L16,97.91 L17,97.91 L18,97.91 L19,97.91 L20,97.93 L21,97.94 L22,97.96 L23,97.99 L24,98.02 L25,98.07 L26,98.13 L27,98.2 L28,98.28 L29,98.37 L30,98.47 L31,98.58 L32,98.7 L33,98.84 L34,98.98 L35,99.14 L36,99.3 L37,99.48 L38,99.67 L39,99.87 L40,100.07 L41,100.3 L42,100.53 L43,100.77 L44,101.02 L45,101.28 L46,101.56 L47,101.84 L48,102.14 L49,102.45 L50,102.76" fill="none" stroke="#e2cd9b" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M0,98.24 L1,98.24 L2,98.24 L3,98.24 L4,98.24 L5,98.24 L6,98.24 L7,98.24 L8,98.24 L9,98.24 L10,98.24 L11,98.24 L12,98.24 L13,98.24 L14,98.24 L15,98.24 L16,98.24 L17,98.24 L18,98.24 L19,98.24 L20,98.26 L21,98.28 L22,98.3 L23,98.33 L24,98.38 L25,98.43 L26,98.5 L27,98.57 L28,98.66 L29,98.76 L30,98.87 L31,98.99 L32,99.13 L33,99.27 L34,99.43 L35,99.59 L36,99.77 L37,99.96 L38,100.16 L39,100.38 L40,100.6 L41,100.83 L42,101.08 L43,101.34 L44,101.61 L45,101.89 L46,102.18 L47,102.48 L48,102.79 L49,103.12 L50,103.45" fill="none" stroke="#c6a970" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M0,98.56 L1,98.56 L2,98.56 L3,98.56 L4,98.56 L5,98.56 L6,98.56 L7,98.56 L8,98.56 L9,98.56 L10,98.56 L11,98.56 L12,98.56 L13,98.56 L14,98.56 L15,98.56 L16,98.56 L17,98.56 L18,98.56 L19,98.57 L20,98.59 L21,98.61 L22,98.64 L23,98.68 L24,98.73 L25,98.79 L26,98.86 L27,98.95 L28,99.05 L29,99.16 L30,99.28 L31,99.41 L32,99.55 L33,99.71 L34,99.87 L35,100.05 L36,100.24 L37,100.45 L38,100.66 L39,100.89 L40,101.12 L41,101.37 L42,101.63 L43,101.91 L44,102.19 L45,102.49 L46,102.8 L47,103.12 L48,103.45 L49,103.79 L50,104.15" fill="none" stroke="#ead9ae" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M0,98.89 L1,98.89 L2,98.89 L3,98.89 L4,98.89 L5,98.89 L6,98.89 L7,98.89 L8,98.89 L9,98.89 L10,98.89 L11,98.89 L12,98.89 L13,98.89 L14,98.89 L15,98.89 L16,98.89 L17,98.89 L18,98.89 L19,98.9 L20,98.92 L21,98.95 L22,98.98 L23,99.03 L24,99.08 L25,99.15 L26,99.23 L27,99.33 L28,99.43 L29,99.55 L30,99.68 L31,99.82 L32,99.98 L33,100.14 L34,100.32 L35,100.51 L36,100.71 L37,100.93 L38,101.16 L39,101.4 L40,101.65 L41,101.91 L42,102.19 L43,102.48 L44,102.78 L45,103.09 L46,103.42 L47,103.75 L48,104.1 L49,104.46 L50,104.84" fill="none" stroke="#a8884f" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M0,99.22 L1,99.22 L2,99.22 L3,99.22 L4,99.22 L5,99.22 L6,99.22 L7,99.22 L8,99.22 L9,99.22 L10,99.22 L11,99.22 L12,99.22 L13,99.22 L14,99.22 L15,99.22 L16,99.22 L17,99.22 L18,99.22 L19,99.23 L20,99.25 L21,99.28 L22,99.32 L23,99.37 L24,99.44 L25,99.51 L26,99.6 L27,99.7 L28,99.82 L29,99.94 L30,100.08 L31,100.24 L32,100.4 L33,100.58 L34,100.77 L35,100.97 L36,101.19 L37,101.41 L38,101.65 L39,101.91 L40,102.17 L41,102.45 L42,102.74 L43,103.05 L44,103.36 L45,103.69 L46,104.03 L47,104.39 L48,104.76 L49,105.13 L50,105.53" fill="none" stroke="#dcc590" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M0,99.55 L1,99.55 L2,99.55 L3,99.55 L4,99.55 L5,99.55 L6,99.55 L7,99.55 L8,99.55 L9,99.55 L10,99.55 L11,99.55 L12,99.55 L13,99.55 L14,99.55 L15,99.55 L16,99.55 L17,99.55 L18,99.55 L19,99.56 L20,99.58 L21,99.62 L22,99.66 L23,99.72 L24,99.79 L25,99.87 L26,99.97 L27,100.08 L28,100.2 L29,100.34 L30,100.49 L31,100.65 L32,100.82 L33,101.01 L34,101.21 L35,101.43 L36,101.66 L37,101.9 L38,102.15 L39,102.42 L40,102.7 L41,102.99 L42,103.3 L43,103.62 L44,103.95 L45,104.29 L46,104.65 L47,105.02 L48,105.41 L49,105.81 L50,106.22" fill="none" stroke="#bfa067" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M0,99.87 L1,99.87 L2,99.87 L3,99.87 L4,99.87 L5,99.87 L6,99.87 L7,99.87 L8,99.87 L9,99.87 L10,99.87 L11,99.87 L12,99.87 L13,99.87 L14,99.87 L15,99.87 L16,99.87 L17,99.87 L18,99.87 L19,99.89 L20,99.91 L21,99.95 L22,100 L23,100.07 L24,100.14 L25,100.23 L26,100.34 L27,100.46 L28,100.59 L29,100.73 L30,100.89 L31,101.06 L32,101.25 L33,101.45 L34,101.66 L35,101.89 L36,102.13 L37,102.38 L38,102.65 L39,102.93 L40,103.22 L41,103.53 L42,103.85 L43,104.19 L44,104.53 L45,104.9 L46,105.27 L47,105.66 L48,106.06 L49,106.48 L50,106.91" fill="none" stroke="#e6d3a4" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M0,100.2 L1,100.2 L2,100.2 L3,100.2 L4,100.2 L5,100.2 L6,100.2 L7,100.2 L8,100.2 L9,100.2 L10,100.2 L11,100.2 L12,100.2 L13,100.2 L14,100.2 L15,100.2 L16,100.2 L17,100.2 L18,100.2 L19,100.22 L20,100.24 L21,100.29 L22,100.34 L23,100.41 L24,100.5 L25,100.59 L26,100.71 L27,100.83 L28,100.97 L29,101.13 L30,101.29 L31,101.48 L32,101.67 L33,101.88 L34,102.11 L35,102.35 L36,102.6 L37,102.86 L38,103.14 L39,103.44 L40,103.75 L41,104.07 L42,104.41 L43,104.76 L44,105.12 L45,105.5 L46,105.89 L47,106.3 L48,106.72 L49,107.15 L50,107.6" fill="none" stroke="#9c7c45" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M0,95.8 L1,95.8 L2,95.8 L3,95.8 L4,95.8 L5,95.8 L6,95.8 L7,95.8 L8,95.8 L9,95.8 L10,95.8 L11,95.8 L12,95.8 L13,95.8 L14,95.8 L15,95.8 L16,95.8 L17,95.8 L18,95.8 L19,95.8 L20,95.8 L21,95.8 L22,95.8 L23,95.8 L24,95.81 L25,95.83 L26,95.86 L27,95.89 L28,95.94 L29,95.99 L30,96.05 L31,96.12 L32,96.21 L33,96.3 L34,96.39 L35,96.5 L36,96.62 L37,96.75 L38,96.88 L39,97.02 L40,97.18 L41,97.34 L42,97.51 L43,97.69 L44,97.88 L45,98.08 L46,98.28 L47,98.5 L48,98.72 L49,98.96 L50,99.2 L50,107.6 L49,107.15 L48,106.72 L47,106.3 L46,105.89 L45,105.5 L44,105.12 L43,104.76 L42,104.41 L41,104.07 L40,103.75 L39,103.44 L38,103.14 L37,102.86 L36,102.6 L35,102.35 L34,102.11 L33,101.88 L32,101.67 L31,101.48 L30,101.29 L29,101.13 L28,100.97 L27,100.83 L26,100.71 L25,100.59 L24,100.5 L23,100.41 L22,100.34 L21,100.29 L20,100.24 L19,100.22 L18,100.2 L17,100.2 L16,100.2 L15,100.2 L14,100.2 L13,100.2 L12,100.2 L11,100.2 L10,100.2 L9,100.2 L8,100.2 L7,100.2 L6,100.2 L5,100.2 L4,100.2 L3,100.2 L2,100.2 L1,100.2 L0,100.2 Z" fill="url(#tmShadeL)"/><path d="M100,95.8 L99,95.8 L98,95.8 L97,95.8 L96,95.8 L95,95.8 L94,95.8 L93,95.8 L92,95.8 L91,95.8 L90,95.8 L89,95.8 L88,95.8 L87,95.8 L86,95.8 L85,95.8 L84,95.8 L83,95.8 L82,95.8 L81,95.8 L80,95.8 L79,95.8 L78,95.8 L77,95.8 L76,95.81 L75,95.83 L74,95.86 L73,95.89 L72,95.94 L71,95.99 L70,96.05 L69,96.12 L68,96.21 L67,96.3 L66,96.39 L65,96.5 L64,96.62 L63,96.75 L62,96.88 L61,97.02 L60,97.18 L59,97.34 L58,97.51 L57,97.69 L56,97.88 L55,98.08 L54,98.28 L53,98.5 L52,98.72 L51,98.96 L50,99.2 L50,107.6 L51,107.15 L52,106.72 L53,106.3 L54,105.89 L55,105.5 L56,105.12 L57,104.76 L58,104.41 L59,104.07 L60,103.75 L61,103.44 L62,103.14 L63,102.86 L64,102.6 L65,102.35 L66,102.11 L67,101.88 L68,101.67 L69,101.48 L70,101.29 L71,101.13 L72,100.97 L73,100.83 L74,100.71 L75,100.59 L76,100.5 L77,100.41 L78,100.34 L79,100.29 L80,100.24 L81,100.22 L82,100.2 L83,100.2 L84,100.2 L85,100.2 L86,100.2 L87,100.2 L88,100.2 L89,100.2 L90,100.2 L91,100.2 L92,100.2 L93,100.2 L94,100.2 L95,100.2 L96,100.2 L97,100.2 L98,100.2 L99,100.2 L100,100.2 Z" fill="#e3cf9f"/><path d="M100,96.93 L99,96.93 L98,96.93 L97,96.93 L96,96.93 L95,96.93 L94,96.93 L93,96.93 L92,96.93 L91,96.93 L90,96.93 L89,96.93 L88,96.93 L87,96.93 L86,96.93 L85,96.93 L84,96.93 L83,96.93 L82,96.93 L81,96.93 L80,96.93 L79,96.94 L78,96.94 L77,96.95 L76,96.96 L75,96.99 L74,97.02 L73,97.07 L72,97.12 L71,97.18 L70,97.26 L69,97.34 L68,97.43 L67,97.53 L66,97.64 L65,97.76 L64,97.89 L63,98.03 L62,98.18 L61,98.33 L60,98.5 L59,98.68 L58,98.86 L57,99.06 L56,99.26 L55,99.48 L54,99.7 L53,99.93 L52,100.18 L51,100.43 L50,100.69" fill="none" stroke="#cdb27e" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M100,97.25 L99,97.25 L98,97.25 L97,97.25 L96,97.25 L95,97.25 L94,97.25 L93,97.25 L92,97.25 L91,97.25 L90,97.25 L89,97.25 L88,97.25 L87,97.25 L86,97.25 L85,97.25 L84,97.25 L83,97.25 L82,97.25 L81,97.26 L80,97.26 L79,97.27 L78,97.28 L77,97.29 L76,97.32 L75,97.35 L74,97.39 L73,97.44 L72,97.51 L71,97.58 L70,97.66 L69,97.75 L68,97.85 L67,97.97 L66,98.09 L65,98.22 L64,98.36 L63,98.51 L62,98.67 L61,98.84 L60,99.03 L59,99.22 L58,99.42 L57,99.63 L56,99.85 L55,100.08 L54,100.32 L53,100.57 L52,100.83 L51,101.1 L50,101.38" fill="none" stroke="#ecdcb0" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M100,97.58 L99,97.58 L98,97.58 L97,97.58 L96,97.58 L95,97.58 L94,97.58 L93,97.58 L92,97.58 L91,97.58 L90,97.58 L89,97.58 L88,97.58 L87,97.58 L86,97.58 L85,97.58 L84,97.58 L83,97.58 L82,97.58 L81,97.59 L80,97.59 L79,97.61 L78,97.62 L77,97.64 L76,97.67 L75,97.71 L74,97.76 L73,97.82 L72,97.89 L71,97.97 L70,98.06 L69,98.17 L68,98.28 L67,98.4 L66,98.53 L65,98.68 L64,98.83 L63,99 L62,99.17 L61,99.36 L60,99.55 L59,99.76 L58,99.97 L57,100.2 L56,100.44 L55,100.68 L54,100.94 L53,101.21 L52,101.49 L51,101.77 L50,102.07" fill="none" stroke="#b8995f" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M100,97.91 L99,97.91 L98,97.91 L97,97.91 L96,97.91 L95,97.91 L94,97.91 L93,97.91 L92,97.91 L91,97.91 L90,97.91 L89,97.91 L88,97.91 L87,97.91 L86,97.91 L85,97.91 L84,97.91 L83,97.91 L82,97.91 L81,97.91 L80,97.93 L79,97.94 L78,97.96 L77,97.99 L76,98.02 L75,98.07 L74,98.13 L73,98.2 L72,98.28 L71,98.37 L70,98.47 L69,98.58 L68,98.7 L67,98.84 L66,98.98 L65,99.14 L64,99.3 L63,99.48 L62,99.67 L61,99.87 L60,100.07 L59,100.3 L58,100.53 L57,100.77 L56,101.02 L55,101.28 L54,101.56 L53,101.84 L52,102.14 L51,102.45 L50,102.76" fill="none" stroke="#e2cd9b" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M100,98.24 L99,98.24 L98,98.24 L97,98.24 L96,98.24 L95,98.24 L94,98.24 L93,98.24 L92,98.24 L91,98.24 L90,98.24 L89,98.24 L88,98.24 L87,98.24 L86,98.24 L85,98.24 L84,98.24 L83,98.24 L82,98.24 L81,98.24 L80,98.26 L79,98.28 L78,98.3 L77,98.33 L76,98.38 L75,98.43 L74,98.5 L73,98.57 L72,98.66 L71,98.76 L70,98.87 L69,98.99 L68,99.13 L67,99.27 L66,99.43 L65,99.59 L64,99.77 L63,99.96 L62,100.16 L61,100.38 L60,100.6 L59,100.83 L58,101.08 L57,101.34 L56,101.61 L55,101.89 L54,102.18 L53,102.48 L52,102.79 L51,103.12 L50,103.45" fill="none" stroke="#c6a970" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M100,98.56 L99,98.56 L98,98.56 L97,98.56 L96,98.56 L95,98.56 L94,98.56 L93,98.56 L92,98.56 L91,98.56 L90,98.56 L89,98.56 L88,98.56 L87,98.56 L86,98.56 L85,98.56 L84,98.56 L83,98.56 L82,98.56 L81,98.57 L80,98.59 L79,98.61 L78,98.64 L77,98.68 L76,98.73 L75,98.79 L74,98.86 L73,98.95 L72,99.05 L71,99.16 L70,99.28 L69,99.41 L68,99.55 L67,99.71 L66,99.87 L65,100.05 L64,100.24 L63,100.45 L62,100.66 L61,100.89 L60,101.12 L59,101.37 L58,101.63 L57,101.91 L56,102.19 L55,102.49 L54,102.8 L53,103.12 L52,103.45 L51,103.79 L50,104.15" fill="none" stroke="#ead9ae" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M100,98.89 L99,98.89 L98,98.89 L97,98.89 L96,98.89 L95,98.89 L94,98.89 L93,98.89 L92,98.89 L91,98.89 L90,98.89 L89,98.89 L88,98.89 L87,98.89 L86,98.89 L85,98.89 L84,98.89 L83,98.89 L82,98.89 L81,98.9 L80,98.92 L79,98.95 L78,98.98 L77,99.03 L76,99.08 L75,99.15 L74,99.23 L73,99.33 L72,99.43 L71,99.55 L70,99.68 L69,99.82 L68,99.98 L67,100.14 L66,100.32 L65,100.51 L64,100.71 L63,100.93 L62,101.16 L61,101.4 L60,101.65 L59,101.91 L58,102.19 L57,102.48 L56,102.78 L55,103.09 L54,103.42 L53,103.75 L52,104.1 L51,104.46 L50,104.84" fill="none" stroke="#a8884f" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M100,99.22 L99,99.22 L98,99.22 L97,99.22 L96,99.22 L95,99.22 L94,99.22 L93,99.22 L92,99.22 L91,99.22 L90,99.22 L89,99.22 L88,99.22 L87,99.22 L86,99.22 L85,99.22 L84,99.22 L83,99.22 L82,99.22 L81,99.23 L80,99.25 L79,99.28 L78,99.32 L77,99.37 L76,99.44 L75,99.51 L74,99.6 L73,99.7 L72,99.82 L71,99.94 L70,100.08 L69,100.24 L68,100.4 L67,100.58 L66,100.77 L65,100.97 L64,101.19 L63,101.41 L62,101.65 L61,101.91 L60,102.17 L59,102.45 L58,102.74 L57,103.05 L56,103.36 L55,103.69 L54,104.03 L53,104.39 L52,104.76 L51,105.13 L50,105.53" fill="none" stroke="#dcc590" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M100,99.55 L99,99.55 L98,99.55 L97,99.55 L96,99.55 L95,99.55 L94,99.55 L93,99.55 L92,99.55 L91,99.55 L90,99.55 L89,99.55 L88,99.55 L87,99.55 L86,99.55 L85,99.55 L84,99.55 L83,99.55 L82,99.55 L81,99.56 L80,99.58 L79,99.62 L78,99.66 L77,99.72 L76,99.79 L75,99.87 L74,99.97 L73,100.08 L72,100.2 L71,100.34 L70,100.49 L69,100.65 L68,100.82 L67,101.01 L66,101.21 L65,101.43 L64,101.66 L63,101.9 L62,102.15 L61,102.42 L60,102.7 L59,102.99 L58,103.3 L57,103.62 L56,103.95 L55,104.29 L54,104.65 L53,105.02 L52,105.41 L51,105.81 L50,106.22" fill="none" stroke="#bfa067" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M100,99.87 L99,99.87 L98,99.87 L97,99.87 L96,99.87 L95,99.87 L94,99.87 L93,99.87 L92,99.87 L91,99.87 L90,99.87 L89,99.87 L88,99.87 L87,99.87 L86,99.87 L85,99.87 L84,99.87 L83,99.87 L82,99.87 L81,99.89 L80,99.91 L79,99.95 L78,100 L77,100.07 L76,100.14 L75,100.23 L74,100.34 L73,100.46 L72,100.59 L71,100.73 L70,100.89 L69,101.06 L68,101.25 L67,101.45 L66,101.66 L65,101.89 L64,102.13 L63,102.38 L62,102.65 L61,102.93 L60,103.22 L59,103.53 L58,103.85 L57,104.19 L56,104.53 L55,104.9 L54,105.27 L53,105.66 L52,106.06 L51,106.48 L50,106.91" fill="none" stroke="#e6d3a4" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M100,100.2 L99,100.2 L98,100.2 L97,100.2 L96,100.2 L95,100.2 L94,100.2 L93,100.2 L92,100.2 L91,100.2 L90,100.2 L89,100.2 L88,100.2 L87,100.2 L86,100.2 L85,100.2 L84,100.2 L83,100.2 L82,100.2 L81,100.22 L80,100.24 L79,100.29 L78,100.34 L77,100.41 L76,100.5 L75,100.59 L74,100.71 L73,100.83 L72,100.97 L71,101.13 L70,101.29 L69,101.48 L68,101.67 L67,101.88 L66,102.11 L65,102.35 L64,102.6 L63,102.86 L62,103.14 L61,103.44 L60,103.75 L59,104.07 L58,104.41 L57,104.76 L56,105.12 L55,105.5 L54,105.89 L53,106.3 L52,106.72 L51,107.15 L50,107.6" fill="none" stroke="#9c7c45" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M100,95.8 L99,95.8 L98,95.8 L97,95.8 L96,95.8 L95,95.8 L94,95.8 L93,95.8 L92,95.8 L91,95.8 L90,95.8 L89,95.8 L88,95.8 L87,95.8 L86,95.8 L85,95.8 L84,95.8 L83,95.8 L82,95.8 L81,95.8 L80,95.8 L79,95.8 L78,95.8 L77,95.8 L76,95.81 L75,95.83 L74,95.86 L73,95.89 L72,95.94 L71,95.99 L70,96.05 L69,96.12 L68,96.21 L67,96.3 L66,96.39 L65,96.5 L64,96.62 L63,96.75 L62,96.88 L61,97.02 L60,97.18 L59,97.34 L58,97.51 L57,97.69 L56,97.88 L55,98.08 L54,98.28 L53,98.5 L52,98.72 L51,98.96 L50,99.2 L50,107.6 L51,107.15 L52,106.72 L53,106.3 L54,105.89 L55,105.5 L56,105.12 L57,104.76 L58,104.41 L59,104.07 L60,103.75 L61,103.44 L62,103.14 L63,102.86 L64,102.6 L65,102.35 L66,102.11 L67,101.88 L68,101.67 L69,101.48 L70,101.29 L71,101.13 L72,100.97 L73,100.83 L74,100.71 L75,100.59 L76,100.5 L77,100.41 L78,100.34 L79,100.29 L80,100.24 L81,100.22 L82,100.2 L83,100.2 L84,100.2 L85,100.2 L86,100.2 L87,100.2 L88,100.2 L89,100.2 L90,100.2 L91,100.2 L92,100.2 L93,100.2 L94,100.2 L95,100.2 L96,100.2 L97,100.2 L98,100.2 L99,100.2 L100,100.2 Z" fill="url(#tmShadeR)"/></svg>';   // v0.99.72 the page block bending into the spine (generated: curved page-edge lines, spine hollow)
function hallOpen() { return document.body.classList.contains('hall-on'); }
function openHall() {
  let el = document.getElementById('hall'); if (!el) { el = h('section', { id: 'hall', 'aria-label': 'The Library' }); document.body.insertBefore(el, document.getElementById('modalRoot') || null); }
  try { el.getAnimations().forEach(x => x.cancel()); } catch (e) {}   // v0.99.52 a finished fade-out (fill: forwards) kept the reopened Library invisible
  document.body.classList.add('hall-on'); el.hidden = false; drawHall();
  const decks = loadDecks(); try { loadCachedImages(Object.keys(decks).map(n => deckArtName(n, parseDeck(decks[n].text)))).then(k => { if (k && hallOpen()) drawHall(); }); } catch (e) {}
  setTimeout(() => { const f = el.querySelector('.bk-stage, .hall-page button'); if (f) f.focus(); }, 60);
}
function closeHall(anim) {
  const el = document.getElementById('hall'); if (!el || !hallOpen()) return;
  const done = () => { document.body.classList.remove('hall-on'); el.hidden = true; el.replaceChildren(); try { el.getAnimations().forEach(x => x.cancel()); } catch (e) {} render(); };
  if (anim && animOn('ui') !== false && !reducedMotion() && !document.body.classList.contains('a11y-calm')) { const a = wa(el, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(1.04)' }], { duration: 420, easing: 'ease-in', fill: 'forwards' }); a.onfinish = () => { done(); const t = document.getElementById('table'); if (t) wa(t, [{ opacity: 0, transform: 'scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)' }); }; }
  else done();
}
function beginWith(name) {
  lsSet('mtgpt.current', name); refreshDeckSelect(); prepareImages(); closeHall(true);
  // v0.99.51 a new game from the Library while one is in progress: windows left open by the old game (a trigger, the stack, a search)
  // belong to it, so they are cleared before the new game is dealt; if starting fails, the table is shown with a message, not a blank screen.
  setTimeout(() => { try { const mr = document.getElementById('modalRoot'); if (mr) [...mr.children].forEach(x => { if (!x.classList.contains('keep')) x.remove(); }); try { hideMenu(); } catch (e) {} startGame(); }
    catch (err) { console.error(err); toast('Could not start the game', String(err && err.message || err)); try { render(); } catch (e) {} } }, reducedMotion() ? 0 : 200);
}
// v0.99.51 the deck taken down is laid out on the desk: one column per mana value (lands last), each card once with its count,
// fanned so every name shows; hovering a card lifts it to full size.
// v0.99.63 what the Archive (card data) holds: the full Oracle file, or the cards looked up for your decks (the app's usual source when no full file was loaded)
function archiveLine() {
  const full = (typeof cardCount === 'number' && cardCount) || 0, looked = typeof deckMetaCount === 'function' ? deckMetaCount() : 0;
  if (full) return `The Archive holds every card: ${full.toLocaleString()} in all.`;
  if (looked) return `The Archive holds the ${looked.toLocaleString()} cards in your decks. Load the full card data (Settings → Card data) to cover every card.`;
  return 'The Archive is empty: no card data yet. Open Settings → Card data to fill it.';
}
function deckSpreadEl(deck, deckName, onCard) {
  // v0.99.63 the desk shows the deck the way the Deck stats window does: grouped by card type, mana-value order, one stack per card
  // (its copies stacked straight down). Stacks never overlap one another and nothing on the desk moves, grows or glows on hover:
  // resting the pointer on a stack only turns the book to that card. (Overlapping, turned cards made the browser flip between two
  // cards under the pointer, which was the flicker.) Card size is chosen so the whole deck fits the desk.
  const el = h('div', { class: 'hall-spread dk', 'aria-label': 'Main deck by card type and mana value' });
  let hoverName = null;
  const want = c => { if (!onCard) return; const nm = c ? c.name : null; if (nm === hoverName) return; hoverName = nm; clearTimeout(el._t); el._t = setTimeout(() => onCard(c), c ? 160 : 600); };
  const build = () => {
    const tot = new Map();
    for (const x of deck.main) { const rec = resolve(x.name), nm = rec ? rec.name : x.name, o = tot.get(nm) || { name: nm, rec, qty: 0 }; o.qty += (x.qty || x.n || 1); tot.set(nm, o); }
    const typeOf = c => { const rec = c.rec; if (rec ? rec.land : BASIC_LANDS.has(norm(c.name))) return 'Land'; if (!rec) return 'Unknown'; const front = String(rec.t || '').split(' // ')[0]; return ['Creature', 'Planeswalker', 'Battle', 'Instant', 'Sorcery', 'Artifact', 'Enchantment'].find(x => front.includes(x)) || 'Other'; };
    const all = [...tot.values()].map(c => Object.assign(c, { type: typeOf(c), mv: (c.rec && +c.rec.cmc) || 0 }));
    const groups = [['Creatures', ['Creature']], ['Planeswalkers & Battles', ['Planeswalker', 'Battle']], ['Instants & Sorceries', ['Instant', 'Sorcery']], ['Artifacts', ['Artifact']], ['Enchantments', ['Enchantment']], ['Other', ['Other', 'Unknown']], ['Lands', ['Land']]];
    const stackEl = c => {
      const show = Math.min(c.qty, 4), im = imgFor(c.name, deckName);
      const st = h('div', { class: 'dk-stack', style: `--n:${show}`, title: `${c.qty} × ${c.name}`, tabindex: 0 });
      for (let i = 0; i < show; i++) {
        const f = h('div', { class: 'dk-card' + (im ? ' img' : ''), style: `--i:${i}` });
        if (im) { const img = h('img', { src: im.front, alt: i === show - 1 ? c.name : '', draggable: 'false' }); img.addEventListener('error', () => { img.remove(); f.classList.remove('img'); f.append(h('b', { text: c.name })); }); f.append(img); }
        else f.append(h('b', { text: c.name }), h('span', { text: (c.rec && c.rec.mc) || '' }), h('i', { text: (c.rec && c.rec.t) || '' }));
        st.append(f);
      }
      st.append(h('em', { class: 'dk-qty', text: '×' + c.qty }));
      st.addEventListener('pointerenter', () => want(c)); st.addEventListener('focus', () => want(c));
      return st;
    };
    const wrap = h('div', { class: 'dk-wrap' });
    for (const [title, types] of groups) {
      const list = all.filter(c => types.includes(c.type)).sort((a, b) => a.mv - b.mv || a.name.localeCompare(b.name)); if (!list.length) continue;
      wrap.append(h('div', { class: 'dk-group' }, h('div', { class: 'dk-gh', text: `${title} · ${list.reduce((n, c) => n + c.qty, 0)}` }), h('div', { class: 'dk-stacks' }, ...list.map(stackEl))));
    }
    el.replaceChildren(wrap);
    // the biggest card size at which every group fits the desk AND is fully inside the window. The desk is nearer the camera than the
    // wall, so perspective draws it larger than its stage size: the fit is checked against what is really on screen.
    el._fit = () => {
      if (!el.isConnected) return;
      const W = hallPortrait() ? 860 : 1520, H = 2000, vp = el.closest('.hall-view') || document.documentElement, v = vp.getBoundingClientRect();
      wrap.style.width = W + 'px'; wrap.style.transform = '';
      const inView = () => { const r = wrap.getBoundingClientRect(); return r.left >= v.left + 6 && r.right <= v.right - 6 && r.bottom <= v.bottom - 6; };
      let cw = 150; for (; cw > 30; cw -= 3) { el.style.setProperty('--cw', cw + 'px'); if (wrap.scrollHeight <= H && wrap.scrollWidth <= W && inView()) break; }
      // still too big at the smallest size (a 100-card singleton list, a tiny window): shrink the whole layout
      let k = 1; wrap.style.transformOrigin = '50% 0'; wrap.style.transform = k < 1 ? `scale(${k.toFixed(3)})` : '';
      for (let i = 0; i < 12 && !inView(); i++) { k *= 0.92; wrap.style.transform = `scale(${k.toFixed(3)})`; }
    };
    requestAnimationFrame(() => { el._fit(); setTimeout(() => el._fit(), 700); });   // again once the desk has finished coming down
  };
  if (onCard) { el.addEventListener('pointerleave', () => want(null)); el.addEventListener('focusout', e => { if (!el.contains(e.relatedTarget)) want(null); }); }
  build();
  try { loadCachedImages(deck.main.map(x => x.name)).then(n => { if (n && el.isConnected) build(); }); } catch (e) {}
  return el;
}
// v0.99.52 hovering a card on the desk turns the open book to a page about that card (picture on the left, its text on the right);
// leaving the cards turns back to the deck's pages.
function tomeCard(tome, c, deckName) {
  if (!tome || !tome.isConnected || !tome.classList.contains('deck-open')) return;
  if (tome._busy) { tome._pending = [c, deckName]; return; }   // v0.99.60 one page turn at a time; the latest request waits for it
  const cur = tome._card || null; if ((c && c.name) === (cur && cur.name) || (!c && !cur)) return;
  tome._card = c;
  const calm = reducedMotion() || document.body.classList.contains('a11y-calm') || animOn('ui') === false;
  // a leaf turns over the spine: forwards (right to left) to a card, backwards (left to right) back to the deck's pages;
  // the new page is swapped in under the leaf, half way through the turn
  // v0.99.65 the leaf is printed on both sides like a real page: turning to a card, its back carries the card's picture, so the left page is never
  // blank while it lands; turning back, its front carries the picture that is lifting away
  const picFace = () => { const src = tome.querySelector('.tome-card .tc-pic img'); return src ? src.cloneNode(true) : null; };
  const turn = (swap, back, faces) => {
    if (calm) { swap(); return; }
    tome.querySelectorAll('.tome-leaf').forEach(x => x.remove());
    const f = faces || {};
    const leaf = h('div', { class: 'tome-leaf ' + (back ? 'from-left' : 'from-right') }, h('div', { class: 'tl-face tl-front' }, f.front || null), h('div', { class: 'tl-face tl-back' }, f.back || null)); tome.append(leaf); tome._busy = true;
    const a = wa(leaf, back ? [{ transform: 'perspective(1400px) rotateY(0deg)' }, { transform: 'perspective(1400px) rotateY(180deg)' }] : [{ transform: 'perspective(1400px) rotateY(0deg)' }, { transform: 'perspective(1400px) rotateY(-180deg)' }], { duration: 420, easing: 'cubic-bezier(.45,.05,.35,1)' });
    setTimeout(swap, 210 / aspd());
    a.onfinish = () => { leaf.remove(); tome._busy = false; const p = tome._pending; tome._pending = null; if (p) setTimeout(() => tomeCard(tome, p[0], p[1]), 120); };
  };
  if (!c) { turn(() => { if (tome._card) return; const pg = tome.querySelector('.tome-card'); if (pg) pg.remove(); tome.classList.remove('card-open'); }, true, { front: picFace() }); return; }
  const rec = c.rec || resolve(c.name) || {}, im = imgFor(c.name, deckName);
  const sym = mc => { try { return mc ? symbols(mc) : ''; } catch (e) { return mc || ''; } };
  const faceEl = f => h('div', { class: 'tc-face' },
    h('div', { class: 'tc-title' }, h('b', { text: f.name || c.name }), h('span', { class: 'tc-mc' }, sym(f.mc))),
    h('div', { class: 'tc-type', text: f.t || '' }),
    ...String(f.tx || '').split('\n').filter(Boolean).map(line => h('p', { text: line })),
    f.pt ? h('div', { class: 'tc-pt', text: f.pt }) : null);
  const put = pic => { if (tome._card !== c || !tome.isConnected) return;
    let pg = tome.querySelector('.tome-card'); if (!pg) { pg = h('div', { class: 'tome-card' }); tome.append(pg); }
    pg.replaceChildren(
      h('div', { class: 'tc-page tc-pic' }, pic || h('div', { class: 'tc-noimg', text: c.name })),
      h('div', { class: 'tc-page tc-txt' }, faceEl(rec), h('div', { class: 'tc-foot', text: `${c.qty} in this deck · mana value ${(+rec.cmc || 0)}` })));
    tome.classList.add('card-open'); };
  // the picture is decoded first, so the page never shows an empty frame
  if (!im) { turn(() => put(null), false, { back: h('div', { class: 'tc-noimg', text: c.name }) }); return; }
  const pre = new Image(); pre.alt = c.name; pre.draggable = false; pre.src = im.front;
  const ready = pre.complete && pre.naturalWidth ? Promise.resolve() : (pre.decode ? pre.decode() : new Promise(r => { pre.onload = r; pre.onerror = r; }));
  ready.catch(() => {}).then(() => { if (tome._card === c) turn(() => put(pre.naturalWidth ? pre : null), false, { back: pre.naturalWidth ? pre.cloneNode(true) : h('div', { class: 'tc-noimg', text: c.name }) }); });
}
// v0.99.53 Library look: the wall and the desk top, kept in 'mtgpt.hallLook'
const HALL_WALLS = [['plaster', 'Warm plaster', ''], ['sage', 'Sage plaster', 'hue-rotate(58deg) saturate(.75) brightness(.95)'], ['midnight', 'Midnight', 'hue-rotate(190deg) saturate(.85) brightness(.78)'], ['oxblood', 'Oxblood', 'hue-rotate(-22deg) saturate(1.7) brightness(.8)'], ['ash', 'Ash grey', 'saturate(.15) brightness(1.05)'], ['boards', 'Wood boards', '']];
const HALL_DESKS = [['walnut', 'Walnut', ''], ['oak', 'Oak', 'brightness(1.28) saturate(.85) sepia(.12)'], ['mahogany', 'Mahogany', 'hue-rotate(-14deg) saturate(1.45) brightness(.8)'], ['ebony', 'Ebony', 'brightness(.42) saturate(.7)'], ['baize', 'Green baize', '']];
function hallLook() { const v = lsGet('mtgpt.hallLook', null) || {}; return { wall: HALL_WALLS.some(w => w[0] === v.wall) ? v.wall : 'plaster', desk: HALL_DESKS.some(w => w[0] === v.desk) ? v.desk : 'walnut' }; }
function applyHallLook() { const el = document.getElementById('hall'); if (!el) return; const L = hallLook();
  [...el.classList].filter(c => /^(wall|desk)-/.test(c)).forEach(c => el.classList.remove(c)); el.classList.add('wall-' + L.wall, 'desk-' + L.desk); }
function openHallLook() {
  const m = modal('Library look', { width: 560 });
  const sw = (kind, [k, label, f]) => { const L = hallLook(), on = L[kind] === k;
    const prev = kind === 'wall' ? (k === 'boards' ? 'repeating-linear-gradient(90deg, rgba(0,0,0,.5) 0 2px, transparent 2px 40px), var(--wood-panel) 0 0 / 200px 200px' : 'var(--wall-plaster) 0 0 / 128px 128px')
      : (k === 'baize' ? '#1f5a3a' : 'var(--wood-desk) 0 0 / 260px 130px');
    return h('button', { class: 'look-sw' + (on ? ' on' : ''), 'aria-pressed': String(on), onclick: () => { const v = hallLook(); v[kind] = k; lsSet('mtgpt.hallLook', v); applyHallLook(); draw(); } },
      h('i', { style: `background:${prev};filter:${f || 'none'}` }), h('span', { text: label })); };
  const draw = () => m.body.replaceChildren(buildHallLook());
  draw();
}
// v0.99.70 the Library look choices, also shown in Settings → Library
function buildHallLook() {
  const box = h('div', { class: 'hall-look' });
  const sw = (kind, [k, label, f]) => { const L = hallLook(), on = L[kind] === k;
    const prev = kind === 'wall' ? (k === 'boards' ? 'repeating-linear-gradient(90deg, rgba(0,0,0,.5) 0 2px, transparent 2px 40px), var(--wood-panel) 0 0 / 200px 200px' : 'var(--wall-plaster) 0 0 / 128px 128px')
      : (k === 'baize' ? '#1f5a3a' : 'var(--wood-desk) 0 0 / 260px 130px');
    return h('button', { class: 'look-sw' + (on ? ' on' : ''), 'aria-pressed': String(on), onclick: () => { const v = hallLook(); v[kind] = k; lsSet('mtgpt.hallLook', v); applyHallLook(); draw(); } },
      h('i', { style: `background:${prev};filter:${f || 'none'}` }), h('span', { text: label })); };
  const draw = () => box.replaceChildren(
    h('div', { class: 'fhead', text: 'Wall' }), h('div', { class: 'look-grid' }, HALL_WALLS.map(w => sw('wall', w))),
    h('div', { class: 'fhead', text: 'Desk' }), h('div', { class: 'look-grid' }, HALL_DESKS.map(w => sw('desk', w))));
  draw(); return box;
}
// v0.99.53 the logo: a temple front (the Library) on an open book; the same drawing as the top bar and the app icon
const HALL_LOGO = '<svg class="lg" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="lgGoldP" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1bd"/><stop offset=".45" stop-color="#e9c26a"/><stop offset="1" stop-color="#a8761f"/></linearGradient></defs><g fill="url(#lgGoldP)"><path d="M7 22.5 32 9l25 13.5z"/><path fill="var(--lg-bg, #1b130d)" d="M15.5 20.6 32 12.2l16.5 8.4z"/><rect x="8.5" y="23.8" width="47" height="3.6" rx=".6"/>\n<rect x="11.2" y="29" width="4" height="16.5" rx=".8"/><rect x="19.1" y="29" width="4" height="16.5" rx=".8"/><rect x="27" y="29" width="4" height="16.5" rx=".8"/><rect x="33" y="29" width="4" height="16.5" rx=".8"/><rect x="40.9" y="29" width="4" height="16.5" rx=".8"/><rect x="48.8" y="29" width="4" height="16.5" rx=".8"/>\n<rect x="9.5" y="27.6" width="45" height="1.6" rx=".5"/>\n<path d="M5 48.2c9.2-2.6 19-2.1 27 2.6v5.4c-8-4.4-17.8-4.9-27-2.4z"/><path d="M59 48.2c-9.2-2.6-19-2.1-27 2.6v5.4c8-4.4 17.8-4.9 27-2.4z"/></g></svg>';
const HALL_W = 1600, HALL_H = 900, HALL_PER_PAGE = 40;
let hallPage = 0;
// v0.99.55 a tall window (a phone held upright) gets the room arranged for portrait: a 900 x 1600 stage, three shelves above
// the open book, which is drawn large across the desk, and the deck's piles below it
function hallPortrait() { const el = document.getElementById('hall'); return !!(el && el.classList.contains('portrait')); }
function hallWantsPortrait() { const el = document.getElementById('hall'); return !!el && el.clientHeight > el.clientWidth * 1.1; }
function hallFit() {   // scale the fixed stage to fit the window (letterboxed on the plastered wall)
  const vp = document.querySelector('#hall .hall-view'), st = vp && vp.querySelector('.hall-stage'); if (!st) return;
  const W = hallPortrait() ? 900 : HALL_W, H = hallPortrait() ? 1600 : HALL_H;
  const k = Math.min(vp.clientWidth / W, vp.clientHeight / H) || 1; st.style.setProperty('--hs', String(Math.max(0.2, Math.min(1.6, k))));
  const sp = vp.querySelector('.hall-spread.dk'); if (sp && sp._fit) requestAnimationFrame(() => sp._fit());   // v0.99.63 refit the desk cards to the new window
}
window.addEventListener('resize', () => { if (!hallOpen()) return; if (hallWantsPortrait() !== hallPortrait()) drawHall(); else hallFit(); });
// v0.99.61 turning to the other chapter: the leaf goes up on the old book, the room is redrawn for the new game mode while the leaf
// stands on its edge, and the turn finishes on the new book
function hallTurnTo(k) {
  if (gameMode() === k) return;
  const apply = () => { setGameMode(k); hallPage = 0; const first = decksInMode(loadDecks(), k).sort((x, y) => x.localeCompare(y))[0]; lsSet('mtgpt.current', first || ''); refreshDeckSelect(); drawHall(); };
  const calm = reducedMotion() || document.body.classList.contains('a11y-calm') || animOn('ui') === false;
  const tome = document.querySelector('#hall .hall-tome');
  if (calm || !tome || tome.classList.contains('deck-open')) { apply(); return; }
  const back = k === 'standard', cls = 'tome-leaf ' + (back ? 'from-left' : 'from-right'), D = 230;
  const leaf = h('div', { class: cls }); tome.append(leaf);
  const a = wa(leaf, [{ transform: 'perspective(1400px) rotateY(0deg)' }, { transform: `perspective(1400px) rotateY(${back ? 90 : -90}deg)` }], { duration: D, easing: 'cubic-bezier(.5,0,.9,.6)', fill: 'forwards' });
  a.onfinish = () => {
    apply();
    const t2 = document.querySelector('#hall .hall-tome'); if (!t2) return;
    const l2 = h('div', { class: cls }); t2.append(l2);
    wa(l2, [{ transform: `perspective(1400px) rotateY(${back ? 90 : -90}deg)` }, { transform: `perspective(1400px) rotateY(${back ? 180 : -180}deg)` }], { duration: D, easing: 'cubic-bezier(.1,.4,.5,1)' }).onfinish = () => l2.remove();
  };
}
function drawHall() {
  const el = document.getElementById('hall'); if (!el) return;
  const decks = loadDecks(), mode = gameMode(), all = decksInMode(decks, mode).sort((x, y) => x.localeCompare(y)), cur = currentDeckName();
  const portrait = hallWantsPortrait(); el.classList.toggle('portrait', portrait);
  const PER = portrait ? 30 : HALL_PER_PAGE;
  const pages = Math.max(1, Math.ceil(all.length / PER)); hallPage = Math.min(hallPage, pages - 1);
  const names = all.slice(hallPage * PER, (hallPage + 1) * PER);
  const world = h('div', { class: 'hall-world' }); hallHost = { el: world };
  const btn = (text, fn, cls, title) => h('button', { class: 'hall-btn ' + (cls || ''), text, title: title || '', onclick: fn });
  const inGame = !!(state && state.deckName);
  const playChk = document.getElementById('chkPlay'); const onPlay = playChk ? playChk.checked : true;
  // v0.99.61 the menu book as a book: the left page opens a chapter (Standard or Commander: two chapters you turn between with the
  // ribbons on top), the right page is its table of contents. Everything is set as print and ink, not as buttons.
  const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii'];
  const ink = (text, fn, cls, title) => h('button', { class: 'hall-btn hall-ink ' + (cls || ''), text, title: title || '', onclick: fn });
  const cmd = mode === 'commander';
  const chk = (label, checked, onchange, cls) => h('label', { class: 'hall-chk ink-chk ' + (cls || '') }, h('input', { type: 'checkbox', checked, onchange }), h('i', { class: 'ink-box', 'aria-hidden': 'true' }), h('span', { text: label }));
  const left = h('div', { class: 'hall-page left' },
    h('div', { class: 'tm-chap', text: cmd ? 'Chapter II' : 'Chapter I' }),
    h('div', { class: 'tm-title', text: cmd ? 'The Commander Game' : 'The Standard Game' }),
    h('div', { class: 'tm-orn', 'aria-hidden': 'true', text: '\u2767' }),
    inGame ? h('div', { class: 'tm-para tm-cont' }, ink(`Continue: ${state.deckName}`, () => closeHall(true), 'primary', 'Back to the game in progress (Esc)'), h('span', { class: 'tm-aside', text: ` — turn ${state.turn || 1}, the game waits for you.` })) : null,
    h('div', { class: 'tm-para' }, h('span', { class: 'bk-lead', text: 'The deck in hand is ' }), h('b', { class: 'tm-deck', text: cur || 'none yet' }), h('span', { class: 'bk-lead', text: '.' })),
    h('div', { class: 'tm-aside', text: all.length ? 'Take another book from the shelves to choose a different deck.' : (cmd ? 'Import a Commander deck to fill these shelves.' : 'Import a deck to fill the shelves.') }),
    chk('I go first (on the play)', onPlay, e => { if (playChk) { playChk.checked = e.target.checked; playChk.dispatchEvent(new Event('change')); } }),
    h('div', { class: 'tm-begin' }, ink(inGame ? 'Begin a new game' : `Begin with ${cur || 'a deck'}`, () => { if (cur) beginWith(cur); else toast('Choose a deck', 'Take a book from the shelves first.'); }, 'tm-go' + (inGame ? '' : ' primary'), 'Shuffle up and deal with the deck in hand')),
    h('div', { class: 'tm-folio', text: cmd ? 'iii' : 'i' }));
  const entries = [
    ['Import a deck…', () => openDeckEditor(cmd ? { blank: true, text: 'Commander\n1 \n\nDeck\n' } : { blank: true }), 'Paste a list or load a file'],
    ['Scan all decks', () => saveDeckScanReport(), 'Reads every card in every deck and saves a report'],
    ['Settings', () => openSettings()],
    ['Accessibility', () => { openSettings(); setTimeout(() => { const b = document.querySelector('.settabbtn[data-k=a11y]'); if (b) b.click(); }, 30); }],
    ['Library look…', () => openHallLook(), 'Choose the wall and the desk'],
    ['Rules & help', () => openWelcome()],
    ['How cards are read', () => { try { $('#btnReading').click(); } catch (e) {} }],
    [`What’s new (v${APP_VERSION})`, () => { try { $('#btnVersion').click(); } catch (e) {} }],
    window.desktop ? [window.__updAvail ? `Update to v${window.__updAvail.latest} ●` : 'Check for updates', () => openUpdate(window.__updAvail || undefined), 'Download and install the newest version from GitHub'] : null].filter(Boolean);
  const right = h('div', { class: 'hall-page right' },
    h('div', { class: 'tm-chap', text: 'Contents' }),
    h('div', { class: 'tm-toc' }, entries.map(([t, fn, ti], i) => h('div', { class: 'tm-toc-row' }, h('button', { class: 'hall-btn hall-link', text: t, title: ti || '', onclick: fn }), h('i', { class: 'tm-dots', 'aria-hidden': 'true' }), h('span', { class: 'tm-num', text: ROMAN[i + 2] || '' })))),
    h('div', { class: 'tm-foot' },
      h('div', { class: 'tm-aside hall-archive', text: archiveLine() }),
      chk('Open the Library when the app starts', lsGet(HALL_KEY, true) !== false, e => lsSet(HALL_KEY, e.target.checked), 'small')),
    h('div', { class: 'tm-folio', text: cmd ? 'iv' : 'ii' }));
  // silk ribbons on the top edge: one per chapter; the other chapter's ribbon turns the page to it
  const ribbons = FEATURES.commander ? h('div', { class: 'tm-ribbons', role: 'tablist', 'aria-label': 'Game mode' }, [['standard', 'Standard'], ['commander', 'Commander']].map(([k, lab]) =>
    h('button', { class: 'tm-ribbon ' + k + (mode === k ? ' on' : ''), role: 'tab', 'aria-selected': String(mode === k), title: mode === k ? `You are in the ${lab} chapter` : `Turn to the ${lab} chapter`, onclick: () => hallTurnTo(k) }, h('span', { text: lab })))) : null;
  const tome = h('div', { class: 'hall-tome' + (mode === 'commander' ? ' ch-cmd' : '') }, left, h('div', { class: 'hall-spine' }), right, ribbons, h('i', { class: 'tm-edges', 'aria-hidden': 'true' }), (() => { const w = h('div'); w.innerHTML = TM_BLOCK_SVG; return w.firstChild; })(), (() => { const w = h('div'); w.innerHTML = TM_WARP_SVG; return w.firstChild; })());
  const hallScene = { tome, shelfZ: 62, deskZ: 200, spread: (deck, name) => deckSpreadEl(deck, name, c => tomeCard(tome, c, name)), layer: null };
  const shelf = bookcaseEl(names, cur, mode, { pick: n => beginWith(n), edit: n => { lsSet('mtgpt.current', n); refreshDeckSelect(); openDeckEditor(); }, redraw: drawHall, host: hallHost, beginLabel: 'Begin a game with this deck', minShelves: portrait ? 3 : 4, scale: 0.8, scene: hallScene });
  const pager = pages > 1 ? h('div', { class: 'hall-pager' },
    h('button', { text: '‹', title: 'Previous shelves', disabled: hallPage === 0, onclick: () => { hallPage--; drawHall(); } }),
    h('span', { text: `Shelves ${hallPage + 1} of ${pages}` }),
    h('button', { text: '›', title: 'More shelves', disabled: hallPage >= pages - 1, onclick: () => { hallPage++; drawHall(); } })) : null;
  world.append(
    h('div', { class: 'hall-plaque' }, h('div', { class: 'hall-plaque-row' }, (() => { const x = h('span', { class: 'hall-logo' }); x.innerHTML = HALL_LOGO; return x; })(), h('div', { class: 'hall-plaque-t' }, h('b', { text: 'Library' }), h('span', { text: 'of Alexandria' }))), pager),
    shelf,
    h('div', { class: 'hall-desktop', 'aria-hidden': 'true' }), h('div', { class: 'hall-deskfront', 'aria-hidden': 'true' }),
    h('div', { class: 'hall-stand', 'aria-hidden': 'true' }), h('div', { class: 'hall-tome-shadow', 'aria-hidden': 'true' }),
    tome);
  const stage = h('div', { class: 'hall-stage' }, world, h('div', { class: 'hall-hint', text: all.length ? ((window.matchMedia && matchMedia('(pointer: coarse)').matches) ? 'Tap a book to take it down to the desk.' : 'Click a book to take it down to the desk.') : '' }));
  hallScene.layer = stage;
  el.replaceChildren(h('div', { class: 'hall-view' }, stage),
    h('div', { class: 'hall-corner' },
      window.desktop && window.__updAvail ? h('button', { class: 'hall-upd primary', text: `Update available: v${window.__updAvail.latest}`, title: 'Read what changed and install it', onclick: () => openUpdate(window.__updAvail) }) : null,
      inGame ? h('button', { class: 'hall-close', text: 'Back to the table', title: 'Return to the game in progress (Esc)', onclick: () => closeHall(true) }) : null,
      h('button', { class: 'hall-gear iconbtn', title: 'Settings', 'aria-label': 'Settings', onclick: () => openSettings(), html: null }, (() => { const x = h('span'); x.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'; return x; })())));
  applyHallLook(); hallFit(); requestAnimationFrame(hallFit);
  requestAnimationFrame(() => fitBookPages(world)); setTimeout(() => fitBookPages(world), 400);
  restoreDeskDeck(world);   // v0.99.71 a deck you were editing stays on the desk after the redraw
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && hallOpen() && state && state.deckName && !document.querySelector('#modalRoot .backdrop') && !document.querySelector('#hall .dbx-pull')) { e.preventDefault(); closeHall(true); } });
