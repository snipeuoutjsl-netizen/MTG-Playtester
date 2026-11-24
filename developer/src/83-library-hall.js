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
  setTimeout(() => { try { const mr = document.getElementById('modalRoot'); if (mr) mr.replaceChildren(); try { hideMenu(); } catch (e) {} startGame(); }
    catch (err) { console.error(err); toast('Could not start the game', String(err && err.message || err)); try { render(); } catch (e) {} } }, reducedMotion() ? 0 : 200);
}
// v0.99.51 the deck taken down is laid out on the desk: one column per mana value (lands last), each card once with its count,
// fanned so every name shows; hovering a card lifts it to full size.
function deckSpreadEl(deck, deckName, onCard) {
  const el = h('div', { class: 'hall-spread', 'aria-label': 'Main deck by mana value' });
  const build = () => {
    // v0.99.54 one pile per card: its copies lie on top of each other (a pile of four Thoughtseize is four cards deep), and the piles
    // are dealt out in mana-value order (lands last) on a grid sized to fill the desk without any two piles overlapping.
    const tot = new Map();
    for (const x of deck.main) { const rec = resolve(x.name), nm = rec ? rec.name : x.name, o = tot.get(nm) || { name: nm, rec, qty: 0 }; o.qty += (x.qty || x.n || 1); tot.set(nm, o); }
    const all = [...tot.values()], isLand = c => c.rec ? !!c.rec.land : BASIC_LANDS.has(norm(c.name)), isBasic = c => BASIC_LANDS.has(norm(c.name)) || /^Snow-Covered (Plains|Island|Swamp|Mountain|Forest)$/i.test(c.name);
    const mv = c => (c.rec && +c.rec.cmc) || 0, byName = (a, b) => a.name.localeCompare(b.name);
    const piles = [...all.filter(c => !isLand(c)).sort((a, b) => mv(a) - mv(b) || byName(a, b)), ...all.filter(c => isLand(c) && !isBasic(c)).sort(byName), ...all.filter(isBasic).sort(byName)];
    const W = hallPortrait() ? 860 : 1520, H = hallPortrait() ? 290 : 290, GAP = 14, N = Math.max(1, piles.length);
    let best = { r: 1, cw: 0, ch: 0 };
    for (let r = 1; r <= 4; r++) { const cols = Math.ceil(N / r), cw0 = (W - GAP * (cols - 1)) / cols - 6, ch = Math.min(cw0 * 1.395, (H - GAP * (r - 1)) / r - 6), cw = ch / 1.395; if (cw > best.cw) best = { r, cw, ch, cols }; }
    const cw = Math.min(150, Math.floor(best.cw)), ch = Math.round(cw * 1.395);
    el.style.setProperty('--cw', cw + 'px'); el.style.setProperty('--ch', ch + 'px'); el.style.setProperty('--cols', String(Math.ceil(N / best.r)));
    const cards = piles.map(c => {
      const im = imgFor(c.name, deckName), layers = Math.min(4, c.qty) - 1;
      const card = h('div', { class: 'ds-card' + (im ? ' img' : ''), title: `${c.qty} × ${c.name}`, tabindex: 0 },
        im ? h('img', { src: im.front, alt: c.name, draggable: 'false' }) : [h('b', { text: c.name }), h('span', { text: (c.rec && c.rec.mc) || '' }), h('i', { text: (c.rec && c.rec.t) || '' })],
        h('em', { class: 'ds-qty', text: '×' + c.qty }));
      const img = card.querySelector('img'); if (img) img.addEventListener('error', () => { img.remove(); card.classList.remove('img'); card.prepend(h('b', { text: c.name })); });
      const pile = h('div', { class: 'ds-pile', style: `--layers:${layers}` }, Array.from({ length: layers }, (_, i) => h('i', { class: 'ds-under', style: `--k:${layers - i}` })), card);
      if (onCard) { const go = () => { clearTimeout(el._t); el._t = setTimeout(() => onCard(c), 220); }; card.addEventListener('mouseenter', go); card.addEventListener('focus', go); }
      return pile; });
    el.replaceChildren(...cards);
    el.style.removeProperty('--dsk');
  };
  if (onCard) { const off = () => { clearTimeout(el._t); el._t = setTimeout(() => onCard(null), 600); }; el.addEventListener('mouseleave', off); el.addEventListener('focusout', e => { if (!el.contains(e.relatedTarget)) off(); }); }
  build();
  try { loadCachedImages(deck.main.map(x => x.name)).then(n => { if (n && el.isConnected) build(); }); } catch (e) {}
  return el;
}
// v0.99.52 hovering a card on the desk turns the open book to a page about that card (picture on the left, its text on the right);
// leaving the cards turns back to the deck's pages.
function tomeCard(tome, c, deckName) {
  if (!tome || !tome.isConnected || !tome.classList.contains('deck-open')) return;
  const cur = tome._card || null; if ((c && c.name) === (cur && cur.name) || (!c && !cur)) return;
  tome._card = c;
  const fill = () => {
    let pg = tome.querySelector('.tome-card');
    if (!c) { if (pg) pg.remove(); tome.classList.remove('card-open'); return; }
    if (!pg) { pg = h('div', { class: 'tome-card' }); tome.append(pg); }
    const rec = c.rec || resolve(c.name) || {}, im = imgFor(c.name, deckName);
    const sym = mc => { try { return mc ? symbols(mc) : ''; } catch (e) { return mc || ''; } };
    const faceEl = f => h('div', { class: 'tc-face' },
      h('div', { class: 'tc-title' }, h('b', { text: f.name || c.name }), h('span', { class: 'tc-mc' }, sym(f.mc))),
      h('div', { class: 'tc-type', text: f.t || '' }),
      ...String(f.tx || '').split('\n').filter(Boolean).map(line => h('p', { text: line })),
      f.pt ? h('div', { class: 'tc-pt', text: f.pt }) : null);
    const faces = [rec];
    // v0.99.57 the picture is decoded before it replaces the old one, so the page never shows an empty frame (that was the flicker)
    const put = pic => { if (tome._card !== c || !pg.isConnected) return;
      pg.replaceChildren(
        h('div', { class: 'tc-page tc-pic' }, pic || h('div', { class: 'tc-noimg', text: c.name })),
        h('div', { class: 'tc-page tc-txt' }, ...faces.map(faceEl),
          h('div', { class: 'tc-foot', text: `${c.qty} in this deck · mana value ${(+rec.cmc || 0)}` })));
      tome.classList.add('card-open'); };
    if (!im) { put(null); return; }
    const pre = new Image(); pre.alt = c.name; pre.draggable = false; pre.src = im.front;
    const ready = pre.complete && pre.naturalWidth ? Promise.resolve() : (pre.decode ? pre.decode() : new Promise(r => { pre.onload = r; pre.onerror = r; }));
    ready.catch(() => {}).then(() => put(pre.naturalWidth ? pre : null));
  };
  const calm = reducedMotion() || document.body.classList.contains('a11y-calm') || animOn('ui') === false;
  if (calm) { fill(); return; }
  if (c && cur) { fill(); return; }   // card to card: same page, new picture (no flicker of turning leaves)
  // a leaf turns over the spine: forwards (right to left) to a card, backwards (left to right) back to the deck
  tome.querySelectorAll('.tome-leaf').forEach(x => x.remove());
  const back = !c, leaf = h('div', { class: 'tome-leaf ' + (back ? 'from-left' : 'from-right') }); tome.append(leaf);
  const a = wa(leaf, back ? [{ transform: 'perspective(1400px) rotateY(0deg)' }, { transform: 'perspective(1400px) rotateY(180deg)' }] : [{ transform: 'perspective(1400px) rotateY(0deg)' }, { transform: 'perspective(1400px) rotateY(-180deg)' }], { duration: 420, easing: 'cubic-bezier(.45,.05,.35,1)' });
  setTimeout(fill, 210 / aspd()); a.onfinish = () => leaf.remove();
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
  const draw = () => m.body.replaceChildren(
    h('div', { class: 'fhead', text: 'Wall' }), h('div', { class: 'look-grid' }, HALL_WALLS.map(w => sw('wall', w))),
    h('div', { class: 'fhead', text: 'Desk' }), h('div', { class: 'look-grid' }, HALL_DESKS.map(w => sw('desk', w))));
  draw();
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
}
window.addEventListener('resize', () => { if (!hallOpen()) return; if (hallWantsPortrait() !== hallPortrait()) drawHall(); else hallFit(); });
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
  const modeSeg = FEATURES.commander ? h('div', { class: 'modeseg hall-mode', role: 'tablist', 'aria-label': 'Game mode' }, ...[['standard', 'Standard'], ['commander', 'Commander']].map(([k, lab]) => h('button', { class: 'modetab' + (mode === k ? ' on' : ''), role: 'tab', 'aria-selected': String(mode === k), text: lab, onclick: () => { if (mode === k) return; setGameMode(k); hallPage = 0; const first = decksInMode(loadDecks(), k).sort((x, y) => x.localeCompare(y))[0]; lsSet('mtgpt.current', first || ''); refreshDeckSelect(); drawHall(); } }))) : null;
  const playChk = document.getElementById('chkPlay'); const onPlay = playChk ? playChk.checked : true;
  // v0.99.53 the menu book, regrouped: the left page is for playing (your game, the deck in hand, how to start), the right page for
  // the library itself (decks, options, help), each under a small heading.
  const sec = (title, ...kids) => h('div', { class: 'hall-sec' }, h('div', { class: 'hall-h', text: title }), ...kids);
  const left = h('div', { class: 'hall-page left' },
    inGame ? sec('Your game', btn(`Continue: ${state.deckName}`, () => closeHall(true), 'primary', 'Back to the game in progress (Esc)'), h('div', { class: 'hall-sub', text: `Turn ${state.turn || 1} · the game waits for you` })) : null,
    sec('New game',
      h('div', { class: 'hall-deck' }, h('span', { class: 'hall-sub', text: 'Deck in hand' }), h('b', { text: cur || 'none yet' }), h('span', { class: 'hall-sub', text: all.length ? 'Take a book from the shelves to choose another.' : 'Import a deck to fill the shelves.' })),
      modeSeg,
      h('label', { class: 'hall-chk' }, h('input', { type: 'checkbox', checked: onPlay, onchange: e => { if (playChk) { playChk.checked = e.target.checked; playChk.dispatchEvent(new Event('change')); } } }), ' I go first (on the play)'),
      btn(inGame ? 'Start a new game' : `New game with ${cur || 'a deck'}`, () => { if (cur) beginWith(cur); else toast('Choose a deck', 'Take a book from the shelves first.'); }, inGame ? '' : 'primary', 'Shuffle up and deal with the deck in hand')));
  const link = (text, fn, title) => h('button', { class: 'hall-btn hall-link', text, title: title || '', onclick: fn });
  const right = h('div', { class: 'hall-page right' },
    sec('Decks', h('div', { class: 'hall-links' },
      link('Import a deck…', () => openDeckEditor(mode === 'commander' ? { blank: true, text: 'Commander\n1 \n\nDeck\n' } : { blank: true }), 'Paste a list or load a file'),
      link('Scan all decks', () => saveDeckScanReport(), 'Reads every card in every deck and saves a report'))),
    sec('Options', h('div', { class: 'hall-links' },
      link('Settings', () => openSettings()),
      link('Accessibility', () => { openSettings(); setTimeout(() => { const b = document.querySelector('.settabbtn[data-k=a11y]'); if (b) b.click(); }, 30); }),
      link('Library look…', () => openHallLook(), 'Choose the wall and the desk'))),
    sec('Help', h('div', { class: 'hall-links' },
      link('Rules & help', () => openWelcome()),
      link('How cards are read', () => { try { $('#btnReading').click(); } catch (e) {} }),
      link(`What’s new (v${APP_VERSION})`, () => { try { $('#btnVersion').click(); } catch (e) {} }))),
    h('div', { class: 'hall-foot' },
      h('div', { class: 'hall-archive', text: `The Archive: ${CARDS.size ? CARDS.size.toLocaleString() + ' cards catalogued' : 'no card data yet'}` }),
      h('label', { class: 'hall-chk small' }, h('input', { type: 'checkbox', checked: lsGet(HALL_KEY, true) !== false, onchange: e => lsSet(HALL_KEY, e.target.checked) }), ' Open the Library when the app starts')));
  const tome = h('div', { class: 'hall-tome' }, left, h('div', { class: 'hall-spine' }), right);
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
  const stage = h('div', { class: 'hall-stage' }, world, h('div', { class: 'hall-hint', text: all.length ? 'Click a book to take it down to the desk.' : '' }));
  hallScene.layer = stage;
  el.replaceChildren(h('div', { class: 'hall-view' }, stage),
    h('div', { class: 'hall-corner' },
      inGame ? h('button', { class: 'hall-close', text: 'Back to the table', title: 'Return to the game in progress (Esc)', onclick: () => closeHall(true) }) : null,
      h('button', { class: 'hall-gear iconbtn', title: 'Settings', 'aria-label': 'Settings', onclick: () => openSettings(), html: null }, (() => { const x = h('span'); x.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'; return x; })())));
  applyHallLook(); hallFit(); requestAnimationFrame(hallFit);
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && hallOpen() && state && state.deckName && !document.querySelector('#modalRoot .backdrop') && !document.querySelector('#hall .dbx-pull')) { e.preventDefault(); closeHall(true); } });
