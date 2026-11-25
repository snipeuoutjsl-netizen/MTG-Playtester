// ---- v0.99.99 The Library, redesigned: a clean screen instead of the 3D room.
// A top bar (title, tools, settings), a sidebar with your collection (add a deck, all decks / favourites, Standard / Commander,
// recently opened, every deck with its colours) and the selected deck's page: its profile, mana curve, featured cards, the
// librarian's notes and everything you can do with it. The 3D room is kept in the code (drawHall) but switched off; set
// localStorage 'mtgpt.libClassic' to true to see it again.
const LIB_FAV_KEY = 'mtgpt.favDecks', LIB_RECENT_KEY = 'mtgpt.recentDecks';
let libSel = null, libFilter = 'all', libQuery = '';
function libClassic() { return lsGet('mtgpt.libClassic', false) === true; }
function libFavs() { return lsGet(LIB_FAV_KEY, []) || []; }
function libToggleFav(n) { const f = libFavs(), i = f.indexOf(n); if (i >= 0) f.splice(i, 1); else f.push(n); lsSet(LIB_FAV_KEY, f); }
function libRecent() { return (lsGet(LIB_RECENT_KEY, []) || []).filter(n => loadDecks()[n]); }
function libTouch(n) { if (!n) return; const r = (lsGet(LIB_RECENT_KEY, []) || []).filter(x => x !== n); r.unshift(n); lsSet(LIB_RECENT_KEY, r.slice(0, 8)); }
const LIB_COLN = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };
function libColorName(cols) { if (!cols.length) return 'Colorless'; if (cols.length === 1) return 'Mono ' + LIB_COLN[cols[0]]; if (cols.length >= 4) return cols.length === 5 ? 'Five color' : 'Four color';
  const g = { 'WU': 'Azorius', 'UB': 'Dimir', 'BR': 'Rakdos', 'RG': 'Gruul', 'WG': 'Selesnya', 'WB': 'Orzhov', 'UR': 'Izzet', 'BG': 'Golgari', 'WR': 'Boros', 'UG': 'Simic',
    'WUB': 'Esper', 'UBR': 'Grixis', 'BRG': 'Jund', 'WRG': 'Naya', 'WUG': 'Bant', 'WBG': 'Abzan', 'WUR': 'Jeskai', 'UBG': 'Sultai', 'WBR': 'Mardu', 'URG': 'Temur' };
  const k = 'WUBRG'.split('').filter(c => cols.includes(c)).join(''); return g[k] || cols.join('');
}
function libPips(cols, cls) { return h('span', { class: 'lib-pips ' + (cls || '') }, (cols.length ? cols : ['C']).map(c => h('i', { class: 'lib-pip', style: `background:${c === 'C' ? '#b9b0a0' : WUBRG_COL['WUBRG'.indexOf(c)]}`, title: LIB_COLN[c] || 'Colorless' }))); }
function libAgo(t) { if (!t) return null; const d = Math.max(0, Math.round((Date.now() - t) / 86400000)); return d === 0 ? 'Today' : d === 1 ? 'Yesterday' : `${d} days ago`; }
function drawLibraryScreen(el) {
  const decks = loadDecks(), mode = gameMode(), inMode = decksInMode(decks, mode).sort((x, y) => x.localeCompare(y)), favs = libFavs(), cur = currentDeckName();
  if (!libSel || !decks[libSel] || !inMode.includes(libSel)) libSel = inMode.includes(cur) ? cur : inMode[0] || null;
  const shown = inMode.filter(n => (libFilter !== 'fav' || favs.includes(n)) && (!libQuery || n.toLowerCase().includes(libQuery.toLowerCase())));
  const inGame = !!(state && state.deckName), redraw = () => drawLibraryScreen(el);
  el.classList.remove('v2', 'v3', 'portrait'); el.classList.add('lib2');
  const btn = (text, fn, cls, title) => h('button', { class: 'lib-btn ' + (cls || ''), text, title: title || '', onclick: fn });
  // top bar
  const helpMenu = () => { const m = modal('Help', { width: 380 }); m.el.classList.add('lib-menu');
    for (const [t, fn] of [['Rules & help', () => openWelcome()], ['How cards are read', () => { try { $('#btnReading').click(); } catch (e) {} }], [`What’s new (v${APP_VERSION})`, () => { try { $('#btnVersion').click(); } catch (e) {} }], ['Accessibility', () => { openSettings(); setTimeout(() => { const b = document.querySelector('.settabbtn[data-k=a11y]'); if (b) b.click(); }, 30); }], ['Scan all decks (report)', () => saveDeckScanReport()]])
      m.body.append(h('button', { class: 'lib-menu-row', text: t, onclick: () => { m.close(); fn(); } })); };
  const top = h('header', { class: 'lib-top' },
    h('div', { class: 'lib-brand' }, (() => { const x = h('span', { class: 'lib-logo', 'aria-hidden': 'true' }); x.innerHTML = '<svg viewBox="0 0 40 38" width="34" height="32"><g fill="none" stroke="currentColor" stroke-width="2"><path d="M2 13 20 2l18 11M7 14h26M10 16v17m8-17v17m8-17v17m8-17v17M5 35h30"/></g></svg>'; return x; })(),
      h('span', { class: 'lib-title', text: 'Library of Alexandria' }), h('span', { class: 'lib-sub', text: 'Goldfishing archive' })),
    h('nav', { class: 'lib-nav', 'aria-label': 'Library tools' },
      btn('Puzzles', () => openPuzzles(), 'link', 'Win-this-turn puzzles, and moments saved from your games'),
      btn('Hand lab', () => openHandLab(libSel || cur), 'link', 'Draw thousands of opening hands for a deck'),
      btn('Wishlist', () => openWishlist(), 'link', 'Cards you want, with the art you want'),
      btn('Help', helpMenu, 'link'),
      btn('Settings', () => openSettings(), 'link'),
      window.desktop && window.__updAvail ? btn(`Update to v${window.__updAvail.latest}`, () => openUpdate(window.__updAvail), 'gold small lib-upd', 'Read what changed and install it') : null,
      inGame ? btn('Back to the table', () => closeHall(true), 'ghost lib-close', 'Return to the game in progress (Esc)') : null));
  // sidebar
  const modeTab = (k, lab, n) => h('button', { class: 'lib-side-row' + (mode === k ? ' on' : ''), onclick: () => { if (mode === k) return; setGameMode(k); libSel = null; const first = decksInMode(loadDecks(), k).sort((x, y) => x.localeCompare(y))[0]; lsSet('mtgpt.current', first || ''); refreshDeckSelect(); redraw(); } }, h('span', { text: lab }), h('em', { text: String(n) }));
  const deckRow = n => { let cols = []; try { cols = deckColorsOf(parseDeck(decks[n].text)); } catch (e) { cols = []; }
    return h('button', { class: 'lib-deck-row' + (n === libSel ? ' on' : '') + (n === cur ? ' cur' : ''), title: n, onclick: () => { libSel = n; redraw(); } }, libPips(cols, 'sm'), h('span', { class: 'lib-deck-nm', text: n }), favs.includes(n) ? h('i', { class: 'lib-star', text: '★' }) : null); };
  const recent = libRecent().filter(n => inMode.includes(n)).slice(0, 3);
  const search = h('input', { class: 'lib-search', type: 'search', placeholder: `Search ${inMode.length} deck${inMode.length === 1 ? '' : 's'}`, value: libQuery, 'aria-label': 'Search your decks' });
  search.addEventListener('input', () => { libQuery = search.value; const list = el.querySelector('.lib-decklist'); if (list) { const sh = inMode.filter(n => (libFilter !== 'fav' || favs.includes(n)) && (!libQuery || n.toLowerCase().includes(libQuery.toLowerCase()))); list.replaceChildren(...(sh.length ? sh.map(deckRow) : [h('div', { class: 'lib-empty-s', text: 'No deck matches.' })])); } });
  const startChk = h('label', { class: 'lib-chk' }, h('input', { type: 'checkbox', checked: lsGet(HALL_KEY, true) !== false, onchange: e => lsSet(HALL_KEY, e.target.checked) }), h('span', { text: 'Open the Library when the app starts' }));
  const side = h('aside', { class: 'lib-side', 'aria-label': 'Your collection' },
    h('div', { class: 'lib-cap', text: 'Your collection' }),
    btn('＋  Add a deck', () => openDeckEditor(mode === 'commander' ? { blank: true, text: 'Commander\n1 \n\nDeck\n' } : { blank: true }), 'add', 'Paste a list or load a file'),
    h('button', { class: 'lib-side-row' + (libFilter === 'all' ? ' on' : ''), onclick: () => { libFilter = 'all'; redraw(); } }, h('span', { text: '◈  All decks' }), h('em', { text: String(inMode.length) })),
    h('button', { class: 'lib-side-row' + (libFilter === 'fav' ? ' on' : ''), onclick: () => { libFilter = 'fav'; redraw(); } }, h('span', { text: '★  Favorites' }), h('em', { text: String(inMode.filter(n => favs.includes(n)).length) })),
    FEATURES.commander ? h('div', { class: 'lib-cap', text: 'Formats' }) : null,
    FEATURES.commander ? modeTab('standard', '◌  Decks', decksInMode(decks, 'standard').length) : null,
    FEATURES.commander ? modeTab('commander', '◌  Commander', decksInMode(decks, 'commander').length) : null,
    recent.length ? h('div', { class: 'lib-cap', text: 'Recently opened' }) : null,
    ...recent.map(deckRow).map(x => { x.classList.add('recent'); return x; }),
    h('div', { class: 'lib-cap', text: libFilter === 'fav' ? 'Favorites' : 'Decks' }), search,
    h('div', { class: 'lib-decklist' }, ...(shown.length ? shown.map(deckRow) : [h('div', { class: 'lib-empty-s', text: inMode.length ? (libFilter === 'fav' ? 'No favorites yet: star a deck on its page.' : 'No deck matches.') : 'No decks yet.' })])),
    h('div', { class: 'lib-local' }, h('b', { text: 'Local library' }), h('span', { text: `${Object.keys(decks).length} deck${Object.keys(decks).length === 1 ? '' : 's'} · ${archiveLine().replace(/^The Archive holds /, 'card data: ').replace(/\.$/, '')}` }), startChk));
  // main: the selected deck
  const main = h('main', { class: 'lib-main' });
  if (!libSel) {
    main.append(h('div', { class: 'lib-emptystate' }, h('div', { class: 'lib-crumb', text: mode === 'commander' ? 'Commander' : 'Decks' }),
      h('h1', { class: 'lib-h1', text: 'Your library is empty' }), h('p', { class: 'lib-tag', text: mode === 'commander' ? 'Import a Commander deck: put your commander under a “Commander” heading.' : 'Import a deck list to start goldfishing.' }),
      btn('＋  Add a deck', () => openDeckEditor(mode === 'commander' ? { blank: true, text: 'Commander\n1 \n\nDeck\n' } : { blank: true }), 'gold big')));
  } else {
    const dk = decks[libSel], deck = parseDeck(dk.text), cols = deckColorsOf(deck), sm = deckSummary(deck), notes = deckNotes(libSel) || {};
    const mainN = sum(deck.main), sideN = sum(deck.side), lands = sm.types.Land || 0, nonland = deck.main.filter(x => !isLandName(x.name));
    const mvSum = nonland.reduce((a, x) => { const i = cardInfo(x.name); return a + (i ? mvOf(i) : 0) * x.qty; }, 0), mvN = nonland.reduce((a, x) => a + x.qty, 0);
    const avg = mvN ? (mvSum / mvN).toFixed(2) : '–', idx = inMode.indexOf(libSel) + 1;
    const peak = sm.curve.indexOf(Math.max(...sm.curve)), curveNote = mvN ? `Most spells cost ${peak === 6 ? '6 or more' : peak} mana.` : 'No spells with a mana cost yet.';
    const typeLine = Object.entries(sm.types).filter(e => e[1] && e[0] !== 'Land').map(([k, n]) => `${n} ${n === 1 ? k.toLowerCase() : k === 'Sorcery' ? 'sorceries' : k.toLowerCase() + 's'}`).join(', ');
    const fav = favs.includes(libSel), isCur = libSel === cur;
    const playChk = document.getElementById('chkPlay'), onPlay = playChk ? playChk.checked : true;
    main.append(
      h('div', { class: 'lib-head' },
        h('div', { class: 'lib-head-t' },
          h('div', { class: 'lib-crumb', text: `${mode === 'commander' ? 'Commander' : 'Decks'}  /  Deck ${String(idx).padStart(2, '0')} of ${inMode.length}${isCur ? '  ·  in use' : ''}` }),
          h('h1', { class: 'lib-h1' }, h('span', { text: libSel }), h('button', { class: 'lib-fav' + (fav ? ' on' : ''), text: fav ? '★' : '☆', title: fav ? 'Remove from favorites' : 'Add to favorites', 'aria-pressed': String(fav), onclick: () => { libToggleFav(libSel); redraw(); } })),
          h('p', { class: 'lib-tag', text: `${libColorName(cols)}${typeLine ? ' · ' + typeLine : ''}.` })),
        h('div', { class: 'lib-head-go' },
          btn('▶  Begin goldfish', () => { libTouch(libSel); beginWith(libSel); }, 'gold big', 'Shuffle up and draw an opening hand with this deck'),
          h('label', { class: 'lib-chk small' }, h('input', { type: 'checkbox', checked: onPlay, onchange: e => { if (playChk) { playChk.checked = e.target.checked; playChk.dispatchEvent(new Event('change')); } } }), h('span', { text: 'I go first (on the play)' })),
          inGame ? btn(`Continue: ${state.deckName}`, () => closeHall(true), 'ghost', 'Back to the game in progress (Esc)') : null)),
      h('section', { class: 'lib-panel lib-profile', 'aria-label': 'Deck profile' },
        h('div', { class: 'lib-cap', text: 'Deck profile' }),
        h('div', { class: 'lib-stats' },
          h('div', { class: 'lib-stat' }, h('b', { text: `${mainN} cards` }), h('span', { text: 'Main' })),
          h('div', { class: 'lib-stat' }, h('b', { text: String(sideN) }), h('span', { text: dk.sb ? 'Sideboard (swapped in)' : 'Sideboard' })),
          h('div', { class: 'lib-stat' }, h('b', { text: avg }), h('span', { text: 'Avg. mana value' })),
          h('div', { class: 'lib-stat' }, h('b', { text: String(lands) }), h('span', { text: 'Lands' })),
          h('div', { class: 'lib-stat col' }, h('div', { class: 'lib-stat-c' }, libPips(cols), h('span', { text: libColorName(cols).toUpperCase() })), h('span', { class: 'lib-muted', text: notes.last ? `Last played · ${libAgo(notes.last)}` : 'Not played yet' })))),
      h('div', { class: 'lib-row-h' }, h('div', { class: 'lib-cap', text: 'Deck at a glance' }), btn('Edit deck list  ↗', () => { lsSet('mtgpt.current', libSel); refreshDeckSelect(); openDeckEditor(); }, 'link small')),
      h('div', { class: 'lib-grid' },
        h('section', { class: 'lib-panel lib-curve' }, h('div', { class: 'lib-ph' }, h('h2', { text: 'Mana curve' }), h('span', { class: 'lib-muted small', text: `${mainN} CARDS` })),
          h('div', { class: 'lib-bars', role: 'img', 'aria-label': 'Mana curve: ' + sm.curve.map((n, i) => `${n} at ${i === 6 ? '6+' : i}`).join(', ') },
            ...sm.curve.map((n, i) => h('div', { class: 'lib-bar' }, h('b', { text: n ? String(n) : '' }), h('i', { style: `height:${Math.round(100 * n / Math.max(1, ...sm.curve))}%` }), h('span', { text: i === 6 ? '6+' : String(i) })))),
          h('p', { class: 'lib-note-i', text: curveNote })),
        h('section', { class: 'lib-panel lib-feat' }, h('div', { class: 'lib-ph' }, h('h2', { text: 'Featured entries' })), h('div', { class: 'lib-cap sub', text: 'The cards that shape the plan' }),
          sm.top.length ? h('div', { class: 'lib-feat-list' }, ...sm.top.slice(0, 5).map(x => { const i = cardInfo(x.name), ty = ((i && i.t) || '').split(' // ')[0].replace(/ —.*$/, '');
            return h('div', { class: 'lib-feat-row' }, h('i', { class: 'lib-feat-ic', text: '✦' }), h('span', { class: 'lib-feat-nm' }, h('b', { text: x.name }), ty ? h('em', { text: ty }) : null), h('span', { class: 'lib-feat-q', text: x.qty + '×' })); }))
            : h('p', { class: 'lib-muted', text: 'No spells in this list yet.' }))),
      h('section', { class: 'lib-callout' }, h('div', { class: 'lib-callout-t' }, h('div', { class: 'lib-cap', text: 'Librarian’s note' }), libraryNotesEl(libSel)),
        h('div', { class: 'lib-actions' },
          btn('Sideboard' + (sideN ? ` (${sideN})` : ''), () => openSideboarding(libSel, redraw), 'ghost small', 'Swap cards between your main deck and sideboard'),
          btn('Hand lab', () => openHandLab(libSel), 'ghost small', 'Opening hands for this deck'),
          btn('Card art & printings', () => openCustomArt(libSel, redraw), 'ghost small'),
          btn('Box art', () => openDeckArtPicker(libSel, redraw), 'ghost small'),
          btn('Buy this deck', () => openBuyDeck(Object.assign({}, deck, { name: libSel })), 'ghost small', 'Open TCGplayer with this list ready'),
          btn('Delete', () => confirmDeleteDeck(libSel, () => { libSel = null; redraw(); }), 'ghost small danger', 'Remove this deck from your library')))
    );
  }
  el.replaceChildren(h('div', { class: 'lib-app' }, top, h('div', { class: 'lib-body' }, side, main)));
  try { const on = el.querySelector('.lib-decklist .lib-deck-row.on'); if (on) on.scrollIntoView({ block: 'nearest' }); } catch (e) { /* scrolling only */ }
}
