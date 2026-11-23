// ---- v0.99.48 The Library hall: the start screen. Your decks are books on the shelves (left); the reading desk (right) holds an open book
// whose pages are the menu. Pulling a book lays it on the desk with its details and "Begin". Shown at every launch unless switched off.
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
function hallOpen() { return document.body.classList.contains('hall-on'); }
function openHall() {
  let el = document.getElementById('hall'); if (!el) { el = h('section', { id: 'hall', 'aria-label': 'The Library' }); document.body.insertBefore(el, document.getElementById('modalRoot') || null); }
  document.body.classList.add('hall-on'); el.hidden = false; drawHall();
  const decks = loadDecks(); try { loadCachedImages(Object.keys(decks).map(n => deckArtName(n, parseDeck(decks[n].text)))).then(k => { if (k && hallOpen()) drawHall(); }); } catch (e) {}
  setTimeout(() => { const f = el.querySelector('.bk-stage, .hall-page button'); if (f) f.focus(); }, 60);
}
function closeHall(anim) {
  const el = document.getElementById('hall'); if (!el || !hallOpen()) return;
  const done = () => { document.body.classList.remove('hall-on'); el.hidden = true; el.replaceChildren(); render(); };
  if (anim && animOn('ui') !== false && !reducedMotion() && !document.body.classList.contains('a11y-calm')) { const a = wa(el, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(1.04)' }], { duration: 420, easing: 'ease-in', fill: 'forwards' }); a.onfinish = () => { done(); const t = document.getElementById('table'); if (t) wa(t, [{ opacity: 0, transform: 'scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)' }); }; }
  else done();
}
function beginWith(name) { lsSet('mtgpt.current', name); refreshDeckSelect(); prepareImages(); closeHall(true); setTimeout(() => startGame(), reducedMotion() ? 0 : 200); }
function drawHall() {
  const el = document.getElementById('hall'); if (!el) return;
  const decks = loadDecks(), mode = gameMode(), names = decksInMode(decks, mode).sort((x, y) => x.localeCompare(y)), cur = currentDeckName();
  const desk = h('div', { class: 'hall-desk' }); hallHost = { el: desk };
  const shelf = bookcaseEl(names, cur, mode, { pick: n => beginWith(n), edit: n => { lsSet('mtgpt.current', n); refreshDeckSelect(); openDeckEditor(); }, redraw: drawHall, host: hallHost, beginLabel: 'Begin a game with this deck', minShelves: 3 });
  const btn = (text, fn, cls, title) => h('button', { class: 'hall-btn ' + (cls || ''), text, title: title || '', onclick: fn });
  const inGame = !!(state && state.deckName);
  const modeSeg = FEATURES.commander ? h('div', { class: 'modeseg hall-mode', role: 'tablist', 'aria-label': 'Game mode' }, ...[['standard', 'Standard'], ['commander', 'Commander']].map(([k, lab]) => h('button', { class: 'modetab' + (mode === k ? ' on' : ''), role: 'tab', 'aria-selected': String(mode === k), text: lab, onclick: () => { if (mode === k) return; setGameMode(k); const first = decksInMode(loadDecks(), k).sort((x, y) => x.localeCompare(y))[0]; lsSet('mtgpt.current', first || ''); refreshDeckSelect(); drawHall(); } }))) : null;
  const playChk = document.getElementById('chkPlay'); const onPlay = playChk ? playChk.checked : true;
  const left = h('div', { class: 'hall-page left' }, h('div', { class: 'hall-h', text: 'Play' }),
    inGame ? btn(`Continue: ${state.deckName} (turn ${state.turn || 1})`, () => closeHall(true), 'primary', 'Back to the game in progress') : null,
    btn(cur ? `New game with ${cur}` : 'New game', () => { if (cur) beginWith(cur); else toast('Choose a deck', 'Pull a book from the shelves first.'); }, inGame ? '' : 'primary', 'Start a new game with the selected deck'),
    modeSeg,
    h('label', { class: 'hall-chk' }, h('input', { type: 'checkbox', checked: onPlay, onchange: e => { if (playChk) { playChk.checked = e.target.checked; playChk.dispatchEvent(new Event('change')); } } }), ' I go first (on the play)'),
    btn('Import a new deck…', () => openDeckEditor(mode === 'commander' ? { blank: true, text: 'Commander\n1 \n\nDeck\n' } : { blank: true })),
    btn('Scan decks & save report', () => saveDeckScanReport(), '', 'Reads every card in every deck and saves a report'));
  const right = h('div', { class: 'hall-page right' }, h('div', { class: 'hall-h', text: 'The Library' }),
    btn('Settings', () => openSettings()),
    btn('Accessibility', () => { openSettings(); setTimeout(() => { const b = document.querySelector('.settabbtn[data-k=a11y]'); if (b) b.click(); }, 30); }),
    btn('Rules & help', () => openWelcome()),
    btn('How the app reads cards', () => { try { $('#btnReading').click(); } catch (e) {} }),
    btn(`What’s new (v${APP_VERSION})`, () => { try { $('#btnVersion').click(); } catch (e) {} }),
    h('div', { class: 'hall-archive', text: `The Archive: ${CARDS.size ? CARDS.size.toLocaleString() + ' cards catalogued' : 'no card data yet'}` }),
    h('label', { class: 'hall-chk small' }, h('input', { type: 'checkbox', checked: lsGet(HALL_KEY, true) !== false, onchange: e => lsSet(HALL_KEY, e.target.checked) }), ' Open the Library when the app starts'));
  desk.append(h('div', { class: 'hall-tome' }, left, h('div', { class: 'hall-spine' }), right), h('div', { class: 'hall-hint', text: names.length ? 'Pull a book from the shelves to lay it on the desk.' : '' }));
  el.replaceChildren(
    h('header', { class: 'hall-top' }, h('div', { class: 'hall-title' }, h('b', { text: 'Library' }), h('span', { text: 'of Alexandria' })), inGame ? h('button', { class: 'hall-close', text: 'Back to the table', title: 'Return to the game in progress (Esc)', onclick: () => closeHall(true) }) : null),
    h('div', { class: 'hall-room' }, h('div', { class: 'hall-shelves' }, shelf), desk));
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && hallOpen() && state && state.deckName && !document.querySelector('#modalRoot .backdrop') && !document.querySelector('#hall .dbx-pull')) { e.preventDefault(); closeHall(true); } });
