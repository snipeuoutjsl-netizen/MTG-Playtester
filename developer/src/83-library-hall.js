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
const TM_BLOCK_SVG = '<svg class="tm-block" viewBox="0 0 100 108" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="tmShadeL" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".6" stop-color="#000" stop-opacity=".04"/><stop offset="1" stop-color="#2a1606" stop-opacity=".55"/></linearGradient><linearGradient id="tmShadeR" x1="1" x2="0"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".6" stop-color="#000" stop-opacity=".04"/><stop offset="1" stop-color="#2a1606" stop-opacity=".55"/></linearGradient></defs><path d="M45.5,103.52 Q50,99.2 54.5,103.52 L54.5,107.5 Q50,106.5 45.5,107.5 Z" fill="#160a03"/><path d="M0,89.7 L1,89.7 L2,89.7 L3,89.7 L4,89.7 L5,89.7 L6,89.7 L7,89.7 L8,89.7 L9,89.7 L10,89.7 L11,89.7 L12,89.7 L13,89.7 L14,89.7 L15,89.7 L16,89.7 L17,89.7 L18,89.7 L19,89.7 L20,89.7 L21,89.7 L22,89.7 L23,89.7 L24,89.72 L25,89.76 L26,89.81 L27,89.89 L28,89.98 L29,90.09 L30,90.22 L31,90.37 L32,90.54 L33,90.72 L34,90.92 L35,91.15 L36,91.39 L37,91.65 L38,91.92 L39,92.22 L40,92.53 L41,92.87 L42,93.22 L43,93.59 L44,93.98 L45,94.39 L46,94.81 L47,95.26 L48,95.72 L49,96.2 L50,96.7 L50,106.2 L49,105.57 L48,104.96 L47,104.37 L46,103.8 L45,103.25 L44,102.71 L43,102.2 L42,101.71 L41,101.24 L40,100.78 L39,100.35 L38,99.94 L37,99.54 L36,99.17 L35,98.82 L34,98.48 L33,98.17 L32,97.87 L31,97.59 L30,97.34 L29,97.1 L28,96.89 L27,96.69 L26,96.51 L25,96.35 L24,96.22 L23,96.1 L22,96 L21,95.92 L20,95.86 L19,95.82 L18,95.8 L17,95.8 L16,95.8 L15,95.8 L14,95.8 L13,95.8 L12,95.8 L11,95.8 L10,95.8 L9,95.8 L8,95.8 L7,95.8 L6,95.8 L5,95.8 L4,95.8 L3,95.8 L2,95.8 L1,95.8 L0,95.8 Z" fill="#e3cf9f"/><path d="M0,90.98 L1,90.98 L2,90.98 L3,90.98 L4,90.98 L5,90.98 L6,90.98 L7,90.98 L8,90.98 L9,90.98 L10,90.98 L11,90.98 L12,90.98 L13,90.98 L14,90.98 L15,90.98 L16,90.98 L17,90.98 L18,90.98 L19,90.98 L20,90.99 L21,90.99 L22,91 L23,91.01 L24,91.04 L25,91.08 L26,91.15 L27,91.23 L28,91.34 L29,91.46 L30,91.6 L31,91.75 L32,91.93 L33,92.12 L34,92.34 L35,92.57 L36,92.82 L37,93.09 L38,93.38 L39,93.69 L40,94.01 L41,94.36 L42,94.72 L43,95.1 L44,95.5 L45,95.92 L46,96.36 L47,96.81 L48,97.29 L49,97.78 L50,98.29" fill="none" stroke="#cdb27e" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M0,91.46 L1,91.46 L2,91.46 L3,91.46 L4,91.46 L5,91.46 L6,91.46 L7,91.46 L8,91.46 L9,91.46 L10,91.46 L11,91.46 L12,91.46 L13,91.46 L14,91.46 L15,91.46 L16,91.46 L17,91.46 L18,91.46 L19,91.47 L20,91.47 L21,91.49 L22,91.5 L23,91.52 L24,91.56 L25,91.61 L26,91.69 L27,91.78 L28,91.89 L29,92.02 L30,92.17 L31,92.34 L32,92.52 L33,92.73 L34,92.95 L35,93.2 L36,93.46 L37,93.74 L38,94.04 L39,94.35 L40,94.69 L41,95.04 L42,95.42 L43,95.81 L44,96.22 L45,96.65 L46,97.1 L47,97.57 L48,98.05 L49,98.56 L50,99.08" fill="none" stroke="#ecdcb0" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M0,91.95 L1,91.95 L2,91.95 L3,91.95 L4,91.95 L5,91.95 L6,91.95 L7,91.95 L8,91.95 L9,91.95 L10,91.95 L11,91.95 L12,91.95 L13,91.95 L14,91.95 L15,91.95 L16,91.95 L17,91.95 L18,91.95 L19,91.95 L20,91.96 L21,91.98 L22,92 L23,92.03 L24,92.07 L25,92.14 L26,92.22 L27,92.32 L28,92.45 L29,92.59 L30,92.74 L31,92.92 L32,93.12 L33,93.33 L34,93.57 L35,93.82 L36,94.09 L37,94.38 L38,94.69 L39,95.02 L40,95.37 L41,95.73 L42,96.12 L43,96.52 L44,96.94 L45,97.38 L46,97.84 L47,98.32 L48,98.82 L49,99.34 L50,99.87" fill="none" stroke="#b8995f" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M0,92.43 L1,92.43 L2,92.43 L3,92.43 L4,92.43 L5,92.43 L6,92.43 L7,92.43 L8,92.43 L9,92.43 L10,92.43 L11,92.43 L12,92.43 L13,92.43 L14,92.43 L15,92.43 L16,92.43 L17,92.43 L18,92.43 L19,92.44 L20,92.45 L21,92.47 L22,92.5 L23,92.54 L24,92.59 L25,92.67 L26,92.76 L27,92.87 L28,93 L29,93.15 L30,93.32 L31,93.51 L32,93.71 L33,93.94 L34,94.18 L35,94.44 L36,94.73 L37,95.03 L38,95.35 L39,95.69 L40,96.04 L41,96.42 L42,96.82 L43,97.23 L44,97.66 L45,98.12 L46,98.59 L47,99.08 L48,99.59 L49,100.12 L50,100.66" fill="none" stroke="#e2cd9b" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M0,92.91 L1,92.91 L2,92.91 L3,92.91 L4,92.91 L5,92.91 L6,92.91 L7,92.91 L8,92.91 L9,92.91 L10,92.91 L11,92.91 L12,92.91 L13,92.91 L14,92.91 L15,92.91 L16,92.91 L17,92.91 L18,92.91 L19,92.92 L20,92.94 L21,92.96 L22,93 L23,93.05 L24,93.11 L25,93.19 L26,93.29 L27,93.42 L28,93.56 L29,93.71 L30,93.89 L31,94.09 L32,94.31 L33,94.54 L34,94.8 L35,95.07 L36,95.36 L37,95.67 L38,96 L39,96.35 L40,96.72 L41,97.11 L42,97.52 L43,97.94 L44,98.39 L45,98.85 L46,99.33 L47,99.83 L48,100.36 L49,100.9 L50,101.45" fill="none" stroke="#c6a970" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M0,93.39 L1,93.39 L2,93.39 L3,93.39 L4,93.39 L5,93.39 L6,93.39 L7,93.39 L8,93.39 L9,93.39 L10,93.39 L11,93.39 L12,93.39 L13,93.39 L14,93.39 L15,93.39 L16,93.39 L17,93.39 L18,93.39 L19,93.4 L20,93.42 L21,93.46 L22,93.5 L23,93.55 L24,93.63 L25,93.72 L26,93.83 L27,93.96 L28,94.11 L29,94.28 L30,94.47 L31,94.67 L32,94.9 L33,95.15 L34,95.41 L35,95.69 L36,96 L37,96.32 L38,96.66 L39,97.02 L40,97.4 L41,97.8 L42,98.21 L43,98.65 L44,99.11 L45,99.58 L46,100.08 L47,100.59 L48,101.12 L49,101.67 L50,102.25" fill="none" stroke="#ead9ae" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M0,93.87 L1,93.87 L2,93.87 L3,93.87 L4,93.87 L5,93.87 L6,93.87 L7,93.87 L8,93.87 L9,93.87 L10,93.87 L11,93.87 L12,93.87 L13,93.87 L14,93.87 L15,93.87 L16,93.87 L17,93.87 L18,93.87 L19,93.89 L20,93.91 L21,93.95 L22,94 L23,94.06 L24,94.15 L25,94.25 L26,94.37 L27,94.51 L28,94.67 L29,94.84 L30,95.04 L31,95.26 L32,95.49 L33,95.75 L34,96.02 L35,96.32 L36,96.63 L37,96.96 L38,97.31 L39,97.69 L40,98.08 L41,98.48 L42,98.91 L43,99.36 L44,99.83 L45,100.32 L46,100.82 L47,101.35 L48,101.89 L49,102.45 L50,103.04" fill="none" stroke="#a8884f" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M0,94.35 L1,94.35 L2,94.35 L3,94.35 L4,94.35 L5,94.35 L6,94.35 L7,94.35 L8,94.35 L9,94.35 L10,94.35 L11,94.35 L12,94.35 L13,94.35 L14,94.35 L15,94.35 L16,94.35 L17,94.35 L18,94.36 L19,94.37 L20,94.4 L21,94.44 L22,94.5 L23,94.57 L24,94.66 L25,94.77 L26,94.9 L27,95.05 L28,95.22 L29,95.41 L30,95.62 L31,95.84 L32,96.09 L33,96.35 L34,96.64 L35,96.94 L36,97.27 L37,97.61 L38,97.97 L39,98.35 L40,98.75 L41,99.17 L42,99.61 L43,100.07 L44,100.55 L45,101.05 L46,101.57 L47,102.1 L48,102.66 L49,103.23 L50,103.83" fill="none" stroke="#dcc590" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M0,94.84 L1,94.84 L2,94.84 L3,94.84 L4,94.84 L5,94.84 L6,94.84 L7,94.84 L8,94.84 L9,94.84 L10,94.84 L11,94.84 L12,94.84 L13,94.84 L14,94.84 L15,94.84 L16,94.84 L17,94.84 L18,94.84 L19,94.85 L20,94.89 L21,94.94 L22,95 L23,95.08 L24,95.18 L25,95.3 L26,95.44 L27,95.6 L28,95.78 L29,95.97 L30,96.19 L31,96.43 L32,96.68 L33,96.96 L34,97.25 L35,97.57 L36,97.9 L37,98.25 L38,98.63 L39,99.02 L40,99.43 L41,99.86 L42,100.31 L43,100.78 L44,101.27 L45,101.78 L46,102.31 L47,102.86 L48,103.42 L49,104.01 L50,104.62" fill="none" stroke="#bfa067" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M0,95.32 L1,95.32 L2,95.32 L3,95.32 L4,95.32 L5,95.32 L6,95.32 L7,95.32 L8,95.32 L9,95.32 L10,95.32 L11,95.32 L12,95.32 L13,95.32 L14,95.32 L15,95.32 L16,95.32 L17,95.32 L18,95.32 L19,95.34 L20,95.37 L21,95.43 L22,95.5 L23,95.59 L24,95.7 L25,95.83 L26,95.98 L27,96.14 L28,96.33 L29,96.54 L30,96.76 L31,97.01 L32,97.28 L33,97.56 L34,97.87 L35,98.19 L36,98.54 L37,98.9 L38,99.28 L39,99.68 L40,100.11 L41,100.55 L42,101.01 L43,101.49 L44,101.99 L45,102.51 L46,103.05 L47,103.61 L48,104.19 L49,104.79 L50,105.41" fill="none" stroke="#e6d3a4" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M0,95.8 L1,95.8 L2,95.8 L3,95.8 L4,95.8 L5,95.8 L6,95.8 L7,95.8 L8,95.8 L9,95.8 L10,95.8 L11,95.8 L12,95.8 L13,95.8 L14,95.8 L15,95.8 L16,95.8 L17,95.8 L18,95.8 L19,95.82 L20,95.86 L21,95.92 L22,96 L23,96.1 L24,96.22 L25,96.35 L26,96.51 L27,96.69 L28,96.89 L29,97.1 L30,97.34 L31,97.59 L32,97.87 L33,98.17 L34,98.48 L35,98.82 L36,99.17 L37,99.54 L38,99.94 L39,100.35 L40,100.78 L41,101.24 L42,101.71 L43,102.2 L44,102.71 L45,103.25 L46,103.8 L47,104.37 L48,104.96 L49,105.57 L50,106.2" fill="none" stroke="#9c7c45" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M0,89.7 L1,89.7 L2,89.7 L3,89.7 L4,89.7 L5,89.7 L6,89.7 L7,89.7 L8,89.7 L9,89.7 L10,89.7 L11,89.7 L12,89.7 L13,89.7 L14,89.7 L15,89.7 L16,89.7 L17,89.7 L18,89.7 L19,89.7 L20,89.7 L21,89.7 L22,89.7 L23,89.7 L24,89.72 L25,89.76 L26,89.81 L27,89.89 L28,89.98 L29,90.09 L30,90.22 L31,90.37 L32,90.54 L33,90.72 L34,90.92 L35,91.15 L36,91.39 L37,91.65 L38,91.92 L39,92.22 L40,92.53 L41,92.87 L42,93.22 L43,93.59 L44,93.98 L45,94.39 L46,94.81 L47,95.26 L48,95.72 L49,96.2 L50,96.7 L50,106.2 L49,105.57 L48,104.96 L47,104.37 L46,103.8 L45,103.25 L44,102.71 L43,102.2 L42,101.71 L41,101.24 L40,100.78 L39,100.35 L38,99.94 L37,99.54 L36,99.17 L35,98.82 L34,98.48 L33,98.17 L32,97.87 L31,97.59 L30,97.34 L29,97.1 L28,96.89 L27,96.69 L26,96.51 L25,96.35 L24,96.22 L23,96.1 L22,96 L21,95.92 L20,95.86 L19,95.82 L18,95.8 L17,95.8 L16,95.8 L15,95.8 L14,95.8 L13,95.8 L12,95.8 L11,95.8 L10,95.8 L9,95.8 L8,95.8 L7,95.8 L6,95.8 L5,95.8 L4,95.8 L3,95.8 L2,95.8 L1,95.8 L0,95.8 Z" fill="url(#tmShadeL)"/><path d="M100,89.7 L99,89.7 L98,89.7 L97,89.7 L96,89.7 L95,89.7 L94,89.7 L93,89.7 L92,89.7 L91,89.7 L90,89.7 L89,89.7 L88,89.7 L87,89.7 L86,89.7 L85,89.7 L84,89.7 L83,89.7 L82,89.7 L81,89.7 L80,89.7 L79,89.7 L78,89.7 L77,89.7 L76,89.72 L75,89.76 L74,89.81 L73,89.89 L72,89.98 L71,90.09 L70,90.22 L69,90.37 L68,90.54 L67,90.72 L66,90.92 L65,91.15 L64,91.39 L63,91.65 L62,91.92 L61,92.22 L60,92.53 L59,92.87 L58,93.22 L57,93.59 L56,93.98 L55,94.39 L54,94.81 L53,95.26 L52,95.72 L51,96.2 L50,96.7 L50,106.2 L51,105.57 L52,104.96 L53,104.37 L54,103.8 L55,103.25 L56,102.71 L57,102.2 L58,101.71 L59,101.24 L60,100.78 L61,100.35 L62,99.94 L63,99.54 L64,99.17 L65,98.82 L66,98.48 L67,98.17 L68,97.87 L69,97.59 L70,97.34 L71,97.1 L72,96.89 L73,96.69 L74,96.51 L75,96.35 L76,96.22 L77,96.1 L78,96 L79,95.92 L80,95.86 L81,95.82 L82,95.8 L83,95.8 L84,95.8 L85,95.8 L86,95.8 L87,95.8 L88,95.8 L89,95.8 L90,95.8 L91,95.8 L92,95.8 L93,95.8 L94,95.8 L95,95.8 L96,95.8 L97,95.8 L98,95.8 L99,95.8 L100,95.8 Z" fill="#e3cf9f"/><path d="M100,90.98 L99,90.98 L98,90.98 L97,90.98 L96,90.98 L95,90.98 L94,90.98 L93,90.98 L92,90.98 L91,90.98 L90,90.98 L89,90.98 L88,90.98 L87,90.98 L86,90.98 L85,90.98 L84,90.98 L83,90.98 L82,90.98 L81,90.98 L80,90.99 L79,90.99 L78,91 L77,91.01 L76,91.04 L75,91.08 L74,91.15 L73,91.23 L72,91.34 L71,91.46 L70,91.6 L69,91.75 L68,91.93 L67,92.12 L66,92.34 L65,92.57 L64,92.82 L63,93.09 L62,93.38 L61,93.69 L60,94.01 L59,94.36 L58,94.72 L57,95.1 L56,95.5 L55,95.92 L54,96.36 L53,96.81 L52,97.29 L51,97.78 L50,98.29" fill="none" stroke="#cdb27e" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M100,91.46 L99,91.46 L98,91.46 L97,91.46 L96,91.46 L95,91.46 L94,91.46 L93,91.46 L92,91.46 L91,91.46 L90,91.46 L89,91.46 L88,91.46 L87,91.46 L86,91.46 L85,91.46 L84,91.46 L83,91.46 L82,91.46 L81,91.47 L80,91.47 L79,91.49 L78,91.5 L77,91.52 L76,91.56 L75,91.61 L74,91.69 L73,91.78 L72,91.89 L71,92.02 L70,92.17 L69,92.34 L68,92.52 L67,92.73 L66,92.95 L65,93.2 L64,93.46 L63,93.74 L62,94.04 L61,94.35 L60,94.69 L59,95.04 L58,95.42 L57,95.81 L56,96.22 L55,96.65 L54,97.1 L53,97.57 L52,98.05 L51,98.56 L50,99.08" fill="none" stroke="#ecdcb0" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M100,91.95 L99,91.95 L98,91.95 L97,91.95 L96,91.95 L95,91.95 L94,91.95 L93,91.95 L92,91.95 L91,91.95 L90,91.95 L89,91.95 L88,91.95 L87,91.95 L86,91.95 L85,91.95 L84,91.95 L83,91.95 L82,91.95 L81,91.95 L80,91.96 L79,91.98 L78,92 L77,92.03 L76,92.07 L75,92.14 L74,92.22 L73,92.32 L72,92.45 L71,92.59 L70,92.74 L69,92.92 L68,93.12 L67,93.33 L66,93.57 L65,93.82 L64,94.09 L63,94.38 L62,94.69 L61,95.02 L60,95.37 L59,95.73 L58,96.12 L57,96.52 L56,96.94 L55,97.38 L54,97.84 L53,98.32 L52,98.82 L51,99.34 L50,99.87" fill="none" stroke="#b8995f" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M100,92.43 L99,92.43 L98,92.43 L97,92.43 L96,92.43 L95,92.43 L94,92.43 L93,92.43 L92,92.43 L91,92.43 L90,92.43 L89,92.43 L88,92.43 L87,92.43 L86,92.43 L85,92.43 L84,92.43 L83,92.43 L82,92.43 L81,92.44 L80,92.45 L79,92.47 L78,92.5 L77,92.54 L76,92.59 L75,92.67 L74,92.76 L73,92.87 L72,93 L71,93.15 L70,93.32 L69,93.51 L68,93.71 L67,93.94 L66,94.18 L65,94.44 L64,94.73 L63,95.03 L62,95.35 L61,95.69 L60,96.04 L59,96.42 L58,96.82 L57,97.23 L56,97.66 L55,98.12 L54,98.59 L53,99.08 L52,99.59 L51,100.12 L50,100.66" fill="none" stroke="#e2cd9b" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M100,92.91 L99,92.91 L98,92.91 L97,92.91 L96,92.91 L95,92.91 L94,92.91 L93,92.91 L92,92.91 L91,92.91 L90,92.91 L89,92.91 L88,92.91 L87,92.91 L86,92.91 L85,92.91 L84,92.91 L83,92.91 L82,92.91 L81,92.92 L80,92.94 L79,92.96 L78,93 L77,93.05 L76,93.11 L75,93.19 L74,93.29 L73,93.42 L72,93.56 L71,93.71 L70,93.89 L69,94.09 L68,94.31 L67,94.54 L66,94.8 L65,95.07 L64,95.36 L63,95.67 L62,96 L61,96.35 L60,96.72 L59,97.11 L58,97.52 L57,97.94 L56,98.39 L55,98.85 L54,99.33 L53,99.83 L52,100.36 L51,100.9 L50,101.45" fill="none" stroke="#c6a970" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M100,93.39 L99,93.39 L98,93.39 L97,93.39 L96,93.39 L95,93.39 L94,93.39 L93,93.39 L92,93.39 L91,93.39 L90,93.39 L89,93.39 L88,93.39 L87,93.39 L86,93.39 L85,93.39 L84,93.39 L83,93.39 L82,93.39 L81,93.4 L80,93.42 L79,93.46 L78,93.5 L77,93.55 L76,93.63 L75,93.72 L74,93.83 L73,93.96 L72,94.11 L71,94.28 L70,94.47 L69,94.67 L68,94.9 L67,95.15 L66,95.41 L65,95.69 L64,96 L63,96.32 L62,96.66 L61,97.02 L60,97.4 L59,97.8 L58,98.21 L57,98.65 L56,99.11 L55,99.58 L54,100.08 L53,100.59 L52,101.12 L51,101.67 L50,102.25" fill="none" stroke="#ead9ae" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M100,93.87 L99,93.87 L98,93.87 L97,93.87 L96,93.87 L95,93.87 L94,93.87 L93,93.87 L92,93.87 L91,93.87 L90,93.87 L89,93.87 L88,93.87 L87,93.87 L86,93.87 L85,93.87 L84,93.87 L83,93.87 L82,93.87 L81,93.89 L80,93.91 L79,93.95 L78,94 L77,94.06 L76,94.15 L75,94.25 L74,94.37 L73,94.51 L72,94.67 L71,94.84 L70,95.04 L69,95.26 L68,95.49 L67,95.75 L66,96.02 L65,96.32 L64,96.63 L63,96.96 L62,97.31 L61,97.69 L60,98.08 L59,98.48 L58,98.91 L57,99.36 L56,99.83 L55,100.32 L54,100.82 L53,101.35 L52,101.89 L51,102.45 L50,103.04" fill="none" stroke="#a8884f" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M100,94.35 L99,94.35 L98,94.35 L97,94.35 L96,94.35 L95,94.35 L94,94.35 L93,94.35 L92,94.35 L91,94.35 L90,94.35 L89,94.35 L88,94.35 L87,94.35 L86,94.35 L85,94.35 L84,94.35 L83,94.35 L82,94.36 L81,94.37 L80,94.4 L79,94.44 L78,94.5 L77,94.57 L76,94.66 L75,94.77 L74,94.9 L73,95.05 L72,95.22 L71,95.41 L70,95.62 L69,95.84 L68,96.09 L67,96.35 L66,96.64 L65,96.94 L64,97.27 L63,97.61 L62,97.97 L61,98.35 L60,98.75 L59,99.17 L58,99.61 L57,100.07 L56,100.55 L55,101.05 L54,101.57 L53,102.1 L52,102.66 L51,103.23 L50,103.83" fill="none" stroke="#dcc590" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M100,94.84 L99,94.84 L98,94.84 L97,94.84 L96,94.84 L95,94.84 L94,94.84 L93,94.84 L92,94.84 L91,94.84 L90,94.84 L89,94.84 L88,94.84 L87,94.84 L86,94.84 L85,94.84 L84,94.84 L83,94.84 L82,94.84 L81,94.85 L80,94.89 L79,94.94 L78,95 L77,95.08 L76,95.18 L75,95.3 L74,95.44 L73,95.6 L72,95.78 L71,95.97 L70,96.19 L69,96.43 L68,96.68 L67,96.96 L66,97.25 L65,97.57 L64,97.9 L63,98.25 L62,98.63 L61,99.02 L60,99.43 L59,99.86 L58,100.31 L57,100.78 L56,101.27 L55,101.78 L54,102.31 L53,102.86 L52,103.42 L51,104.01 L50,104.62" fill="none" stroke="#bfa067" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M100,95.32 L99,95.32 L98,95.32 L97,95.32 L96,95.32 L95,95.32 L94,95.32 L93,95.32 L92,95.32 L91,95.32 L90,95.32 L89,95.32 L88,95.32 L87,95.32 L86,95.32 L85,95.32 L84,95.32 L83,95.32 L82,95.32 L81,95.34 L80,95.37 L79,95.43 L78,95.5 L77,95.59 L76,95.7 L75,95.83 L74,95.98 L73,96.14 L72,96.33 L71,96.54 L70,96.76 L69,97.01 L68,97.28 L67,97.56 L66,97.87 L65,98.19 L64,98.54 L63,98.9 L62,99.28 L61,99.68 L60,100.11 L59,100.55 L58,101.01 L57,101.49 L56,101.99 L55,102.51 L54,103.05 L53,103.61 L52,104.19 L51,104.79 L50,105.41" fill="none" stroke="#e6d3a4" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M100,95.8 L99,95.8 L98,95.8 L97,95.8 L96,95.8 L95,95.8 L94,95.8 L93,95.8 L92,95.8 L91,95.8 L90,95.8 L89,95.8 L88,95.8 L87,95.8 L86,95.8 L85,95.8 L84,95.8 L83,95.8 L82,95.8 L81,95.82 L80,95.86 L79,95.92 L78,96 L77,96.1 L76,96.22 L75,96.35 L74,96.51 L73,96.69 L72,96.89 L71,97.1 L70,97.34 L69,97.59 L68,97.87 L67,98.17 L66,98.48 L65,98.82 L64,99.17 L63,99.54 L62,99.94 L61,100.35 L60,100.78 L59,101.24 L58,101.71 L57,102.2 L56,102.71 L55,103.25 L54,103.8 L53,104.37 L52,104.96 L51,105.57 L50,106.2" fill="none" stroke="#9c7c45" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M100,89.7 L99,89.7 L98,89.7 L97,89.7 L96,89.7 L95,89.7 L94,89.7 L93,89.7 L92,89.7 L91,89.7 L90,89.7 L89,89.7 L88,89.7 L87,89.7 L86,89.7 L85,89.7 L84,89.7 L83,89.7 L82,89.7 L81,89.7 L80,89.7 L79,89.7 L78,89.7 L77,89.7 L76,89.72 L75,89.76 L74,89.81 L73,89.89 L72,89.98 L71,90.09 L70,90.22 L69,90.37 L68,90.54 L67,90.72 L66,90.92 L65,91.15 L64,91.39 L63,91.65 L62,91.92 L61,92.22 L60,92.53 L59,92.87 L58,93.22 L57,93.59 L56,93.98 L55,94.39 L54,94.81 L53,95.26 L52,95.72 L51,96.2 L50,96.7 L50,106.2 L51,105.57 L52,104.96 L53,104.37 L54,103.8 L55,103.25 L56,102.71 L57,102.2 L58,101.71 L59,101.24 L60,100.78 L61,100.35 L62,99.94 L63,99.54 L64,99.17 L65,98.82 L66,98.48 L67,98.17 L68,97.87 L69,97.59 L70,97.34 L71,97.1 L72,96.89 L73,96.69 L74,96.51 L75,96.35 L76,96.22 L77,96.1 L78,96 L79,95.92 L80,95.86 L81,95.82 L82,95.8 L83,95.8 L84,95.8 L85,95.8 L86,95.8 L87,95.8 L88,95.8 L89,95.8 L90,95.8 L91,95.8 L92,95.8 L93,95.8 L94,95.8 L95,95.8 L96,95.8 L97,95.8 L98,95.8 L99,95.8 L100,95.8 Z" fill="url(#tmShadeR)"/></svg>';   // v0.99.72 the page block bending into the spine (generated: curved page-edge lines, spine hollow)
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
      let hs = 0; for (const ch of c.name) hs = (hs * 31 + ch.charCodeAt(0)) >>> 0;   // v0.99.72 laid out by hand: each pile a little turned and nudged (the same way every time)
      const rot = ((hs % 900) / 100 - 4.5).toFixed(2), dy = ((hs >> 10) % 13) - 6;
      const st = h('div', { class: 'dk-stack', style: `--n:${show};--rot:${rot}deg;--dy:${dy}px`, title: `${c.qty} × ${c.name}`, tabindex: 0 });
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
      let cw = 200; for (; cw > 30; cw -= 3) { el.style.setProperty('--cw', cw + 'px'); if (wrap.scrollHeight <= H && wrap.scrollWidth <= W && inView()) break; }
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
  const tome = h('div', { class: 'hall-tome' + (mode === 'commander' ? ' ch-cmd' : '') }, left, h('div', { class: 'hall-spine' }), right, ribbons, h('i', { class: 'tm-edges', 'aria-hidden': 'true' }), (() => { const w = h('div'); w.innerHTML = TM_BLOCK_SVG; return w.firstChild; })());
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
  restoreDeskDeck(world);   // v0.99.71 a deck you were editing stays on the desk after the redraw
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && hallOpen() && state && state.deckName && !document.querySelector('#modalRoot .backdrop') && !document.querySelector('#hall .dbx-pull')) { e.preventDefault(); closeHall(true); } });
