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
  const tome = h('div', { class: 'hall-tome' + (mode === 'commander' ? ' ch-cmd' : '') }, left, h('div', { class: 'hall-spine' }), right, ribbons, h('i', { class: 'tm-edges', 'aria-hidden': 'true' }));
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
