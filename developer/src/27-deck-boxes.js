// ---------------------------------------------------------------- deck boxes (v0.57)
// The deck button opens a shelf of 3D deck boxes. Each box shows art cropped from one card of that deck.
const DECKBOX_COL = { W: ['#4b4733', '#d8d1a2'], U: ['#0e2a52', '#3f7fcc'], B: ['#1a1224', '#735a8a'], R: ['#45100a', '#d04a2e'], G: ['#0d2b16', '#43a05b'], '': ['#1d1f23', '#6f747c'] };
function deckColorsOf(deck) {
  const cnt = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const { qty, name } of deck.main) { const i = cardInfo(name); if (!i || !i.mc) continue; for (const m of i.mc.matchAll(/\{([WUBRG])\}|\{([WUBRG])\/[^}]+\}/g)) cnt[m[1] || m[2]] += qty; }
  if (!Object.values(cnt).some(Boolean)) for (const { qty, name } of deck.main) { const t = ((cardInfo(name) || {}).t || '') + ' ' + name; for (const [k, w] of [['W', 'Plains'], ['U', 'Island'], ['B', 'Swamp'], ['R', 'Mountain'], ['G', 'Forest']]) if (new RegExp('\\b' + w + '\\b').test(t)) cnt[k] += qty; }   // no coloured spells: go by the basic land types
  return Object.entries(cnt).filter(e => e[1] > 0).sort((a, b) => b[1] - a[1]).map(e => e[0]);
}
function deckArtName(deckName, deck) {
  const d = loadDecks()[deckName]; if (d && d.art) return d.art;
  for (const { name } of deck.main) if (!isLandName(name)) { const r = resolve(name); return r ? r.name : name; }
  return deck.main[0] ? deck.main[0].name : '';
}
function artStyle(im) { return im && im.front ? `background-image:url("${im.front}")` : ''; }
// v0.99.42 The deck screen is a bookcase of books, ten to a shelf. Each deck is a book standing spine out (its name on the spine); hovering
// pulls it part-way off the shelf and turns it so the front cover (art from the deck) shows. Clicking takes it right off the shelf into the
// middle of the window, where it can be turned with the mouse and played, edited or sideboarded. Double-click (or Enter twice) uses it at once.
const BOOKS_PER_SHELF = 10;
const BOOK_COL = { W: ['#8f8566', '#eee6c4'], U: ['#0d2a57', '#3d82d6'], B: ['#0b090e', '#3c3446'], R: ['#4a0f08', '#d4442a'], G: ['#0b2d16', '#3f9f58'], '': ['#2a2d33', '#8b9099'] };
const strHash = t => { let x = 7; for (const ch of String(t)) x = (x * 31 + ch.charCodeAt(0)) >>> 0; return x; };
let BOOK_SCALE = 1;   // v0.99.50 the Library draws its shelf books smaller (set while bookcaseEl builds a case)
function bookModel(deckName, deck, cols, im, big) {
  const a = BOOK_COL[cols[0] || ''], b = BOOK_COL[cols[1] || cols[0] || ''], hs = strHash(deckName);   // the book is the deck's main colour (the colour with the most mana symbols)
  const q = big ? 1 : BOOK_SCALE, T = Math.round(q * (big ? 70 : 44 + hs % 11)), H = Math.round(q * (big ? 330 : 198 + (hs >> 4) % 26)), D = Math.round(q * (big ? 236 : 146));
  const pips = cols.map(c => h('i', { class: 'dbx-pip', style: `background:${WUBRG_COL['WUBRG'.indexOf(c)]}` }));
  return h('div', { class: 'bk' + (big ? ' big' : ''), 'data-col': cols[0] || 'C', style: `--ca:${a[1]};--cad:${a[0]};--cb:${b[1]};--cbd:${b[0]};--T:${T}px;--H:${H}px;--D:${D}px` },
    h('div', { class: 'bk-face spine' }, h('i', { class: 'bk-band' }), h('span', { class: 'bk-title', text: deckName }), h('span', { class: 'bk-pips' }, ...pips.map(x => x.cloneNode())), h('i', { class: 'bk-band low' })),
    h('div', { class: 'bk-face cover' },
      h('div', { class: 'dbx-art' + (im ? '' : ' none'), style: artStyle(im) }, im ? null : h('span', { text: (deckName.trim()[0] || '?').toUpperCase() })),
      h('div', { class: 'dbx-gloss' }),
      h('div', { class: 'dbx-label' }, h('b', { text: deckName }), h('span', {}, `${sum(deck.main)} cards`, ' ', ...pips))),
    h('div', { class: 'bk-face back' }),
    h('div', { class: 'bk-face top' }), h('div', { class: 'bk-face bottom' }), h('div', { class: 'bk-face fore' }));   // v0.99.51 a closed book: page block on top, bottom and fore-edge
}
const tiltWith = (zone, box) => {
  zone.addEventListener('mousemove', e => { const r = zone.getBoundingClientRect(); box.style.setProperty('--rx', (((e.clientX - r.left) / r.width - 0.5) * 2).toFixed(2)); box.style.setProperty('--ry', (((e.clientY - r.top) / r.height - 0.5) * 2).toFixed(2)); });
  zone.addEventListener('mouseleave', () => { box.style.removeProperty('--rx'); box.style.removeProperty('--ry'); });
};
// A short summary of what is in the box: card types, colours and the most-played non-land cards.
function deckSummary(deck) {
  const types = { Creature: 0, Instant: 0, Sorcery: 0, Artifact: 0, Enchantment: 0, Planeswalker: 0, Land: 0 }, curve = [0, 0, 0, 0, 0, 0, 0];
  for (const { qty, name } of deck.main) { const i = cardInfo(name); const t = (i && i.t) || ''; const k = Object.keys(types).find(x => new RegExp('\\b' + x + '\\b').test(t)); if (k) types[k] += qty; if (i && !/\bLand\b/.test(t)) curve[Math.min(6, Math.round(mvOf(i)) || 0)] += qty; }
  const top = deck.main.filter(x => !isLandName(x.name)).slice().sort((x, y) => y.qty - x.qty).slice(0, 6);
  return { types, curve, top };
}
// v0.99.44 one deck that cannot be drawn (unusual list, missing card data, ...) must never stop the whole deck screen from opening:
// it gets a plain book that still opens, edits and plays the deck, and the reason goes to the log.
function deckBoxEl(deckName, isCur, onPick, onArt, onEdit, onCustom, onSide, onPull) {
  try { return deckBoxEl0(deckName, isCur, onPick, onArt, onEdit, onCustom, onSide, onPull); }
  catch (e) { console.error('deck book', deckName, e); try { log(`Deck screen: could not draw "${deckName}" (${e.message}); shown as a plain book`); } catch (e2) {}
    const plain = h('div', { class: 'bk', 'data-col': 'C', style: '--ca:#8b9099;--cad:#2a2d33;--cb:#8b9099;--cbd:#2a2d33;--T:48px;--H:210px;--D:146px' }, h('div', { class: 'bk-face spine' }, h('i', { class: 'bk-band' }), h('span', { class: 'bk-title', text: deckName }), h('i', { class: 'bk-band low' })));
    const st = h('div', { class: 'dbx-stage bk-stage', role: 'button', tabindex: 0, title: `${deckName} — click to use it, or edit it`, onclick: () => onPick() }, plain);
    return h('div', { class: 'dbx-tile bk-tile' + (isCur ? ' on' : ''), style: 'width:48px' }, st, h('button', { class: 'bk-fixbtn', text: 'Edit', title: 'Edit this deck list', onclick: e => { e.stopPropagation(); onEdit(); } }));
  }
}
function deckBoxEl0(deckName, isCur, onPick, onArt, onEdit, onCustom, onSide, onPull) {
  const dk = loadDecks()[deckName], deck = parseDeck(dk.text), cols = deckColorsOf(deck), art = deckArtName(deckName, deck), im = imgFor(art, deckName);
  const bk = bookModel(deckName, deck, cols, im, false);
  const stage = h('div', { class: 'dbx-stage bk-stage', role: 'button', tabindex: 0, 'aria-label': `${deckName}, ${sum(deck.main)} cards${isCur ? ', in use' : ''}. Press Enter to take it off the shelf.`, title: `${deckName}${isCur ? ' (in use)' : ''} — click to take it off the shelf` }, bk);
  let clickT = 0;
  // v0.99.45 a click takes the book off the shelf at once (no waiting to see whether it becomes a double-click); "Use this deck" is in the view it opens
  stage.addEventListener('click', () => onPull ? onPull(tile, { deckName, deck, cols, im, dk, isCur, onPick, onArt, onEdit, onCustom, onSide }) : onPick());
  stage.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); stage.click(); } });
  // v0.99.44 no tilt on the shelf: hovering only lifts the book
  const tile = h('div', { class: 'dbx-tile bk-tile' + (isCur ? ' on' : ''), 'data-deck': deckName, style: `width:${bk.style.getPropertyValue('--T')}` }, stage, isCur ? h('div', { class: 'bk-ribbon', title: 'In use' }) : null);
  return tile;
}
// Take a book off the shelf: it flies from its place to the middle of the window (FLIP animation), with its details beside it.
// v0.99.71 the deck taken off the shelf stays on the desk while you edit its list, art or sideboard: only "Put it back", another deck, or using it puts it away.
let DESK_DECK = null, DESK_QUIET = false;
function restoreDeskDeck(root) {
  if (!DESK_DECK || !root) return; if (!loadDecks()[DESK_DECK]) { DESK_DECK = null; return; }
  const live = [...root.querySelectorAll('.dbx-pull')].find(x => x._deck === DESK_DECK && x._tile && x._tile.isConnected); if (live) return;
  root.querySelectorAll('.dbx-pull').forEach(x => x.remove());
  const tile = [...root.querySelectorAll('.bk-tile')].find(t => t.dataset.deck === DESK_DECK); const st = tile && tile.querySelector('.bk-stage'); if (!st) return;
  DESK_QUIET = true; try { st.click(); } finally { DESK_QUIET = false; }
}
// v0.99.71 the deck written into the open book: a ledger of what is in it (types with leaders, colours by name, curve drawn in ink, average mana value,
// land share), and on the facing page the key cards, the librarian's notes and the actions as rubricated lines.
function tomeDeckPages(d, sm, acts) {
  const main = d.deck.main, total = sum(main), side = sum(d.deck.side || []);
  let mvSum = 0, mvN = 0; for (const { qty, name } of main) { const i = cardInfo(name); if (i && !/\bLand\b/.test(i.t || '')) { mvSum += (i.cmc || 0) * qty; mvN += qty; } }
  const lands = sm.types.Land || 0, maxC = Math.max(1, ...sm.curve), CN = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };
  const PL = { Creature: 'Creatures', Instant: 'Instants', Sorcery: 'Sorceries', Artifact: 'Artifacts', Enchantment: 'Enchantments', Planeswalker: 'Planeswalkers', Land: 'Lands' };
  const left = h('div', { class: 'ti-page tome-ink left' },
    h('h3', { text: d.deckName }),
    h('div', { class: 'ti-sub', text: `${total} cards${side ? ` · sideboard ${side}` : ''}${d.dk.sb ? ' · sideboarded' : ''}${d.isCur ? ' · in use' : ''}` }),
    h('div', { class: 'ti-cols' }, d.cols.length ? d.cols.map(c => h('span', { class: 'ti-col' }, h('i', { class: 'dbx-pip', style: `background:${WUBRG_COL['WUBRG'.indexOf(c)]}` }), CN[c] || c)) : h('span', { text: 'Colourless' })),
    h('div', { class: 'ti-ledger' }, Object.entries(sm.types).filter(e => e[1]).map(([k, n]) => h('div', { class: 'ti-row' }, h('span', { text: PL[k] || k }), h('i'), h('b', { text: String(n) })))),
    h('div', { class: 'fhead', text: 'Mana curve' }),
    h('div', { class: 'dbx-curve ti-curve', 'aria-label': 'Mana curve: ' + sm.curve.map((n, i) => `${n} at ${i}${i === 6 ? '+' : ''}`).join(', ') }, sm.curve.map((n, i) => h('div', { class: 'dbx-cbar' }, h('b', { text: n ? String(n) : '' }), h('i', { style: `height:${n ? Math.max(6, Math.round(100 * n / maxC)) : 0}%` }), h('span', { text: i === 6 ? '6+' : String(i) })))),
    h('div', { class: 'ti-foot', text: `${mvN ? `Average mana value ${(mvSum / mvN).toFixed(2)}` : 'No spells'} · ${lands} land${lands === 1 ? '' : 's'} (${total ? Math.round(100 * lands / total) : 0}%)` }));
  const right = h('div', { class: 'ti-page tome-ink right' },
    sm.top.length ? h('div', { class: 'ti-key' }, h('div', { class: 'fhead', text: 'Key cards' }), sm.top.map(x => h('div', { class: 'ti-row' }, h('b', { text: x.qty + ' ×' }), h('span', { text: x.name })))) : null,
    typeof libraryNotesEl === 'function' ? libraryNotesEl(d.deckName) : null, acts);
  return [left, right];
}
function pullDeckBox(m, tile, d) {
  if (tile.classList.contains('out')) return;
  // v0.99.49 clicking another book swaps them: the one on the desk floats back to its slot while the new one comes down.
  if (m.el._dbxPut) m.el._dbxPut();
  const src = tile.querySelector('.bk-stage'), sr = src.getBoundingClientRect();
  const big = bookModel(d.deckName, d.deck, d.cols, d.im, true);
  const shadow = h('i', { class: 'dbx-shadow', 'aria-hidden': 'true' });
  const turn = h('div', { class: 'dbx-turn', title: 'Move the mouse over the box to turn it' }, big, shadow); tiltWith(turn, big);
  const sm = deckSummary(d.deck), maxC = Math.max(1, ...sm.curve);
  const btn = (text, fn, cls, title) => h('button', { class: cls || '', text, title: title || '', onclick: () => { putBack(true); fn(); } });
  const keep = (text, fn, cls, title) => h('button', { class: cls || '', text, title: title || '', onclick: () => fn() });   // the book stays on the desk
  const info = h('div', { class: 'dbx-info' },
    h('h3', { text: d.deckName }), h('div', { class: 'muted small', text: `${sum(d.deck.main)} cards${d.deck.side.length ? ` · sideboard ${sum(d.deck.side)}` : ''}${d.dk.sb ? ' · sideboarded list in use' : ''}${d.isCur ? ' · the deck in use' : ''}` }),
    h('div', { class: 'dbx-pips' }, d.cols.length ? d.cols.map(c => h('i', { class: 'dbx-pip', style: `background:${WUBRG_COL['WUBRG'.indexOf(c)]}`, title: c })) : h('span', { class: 'muted small', text: 'Colourless' })),
    h('div', { class: 'dbx-types' }, Object.entries(sm.types).filter(e => e[1]).map(([k, n]) => h('span', { text: `${n} ${n === 1 ? k : k === 'Sorcery' ? 'Sorceries' : k + 's'}` }))),
    h('div', { class: 'dbx-curve', 'aria-label': 'Mana curve: ' + sm.curve.map((n, i) => `${n} at ${i}${i === 6 ? '+' : ''}`).join(', ') }, sm.curve.map((n, i) => h('div', { class: 'dbx-cbar' }, h('i', { style: `height:${Math.round(100 * n / maxC)}%` }), h('b', { text: n || '' }), h('span', { text: i === 6 ? '6+' : String(i) })))),
    libraryNotesEl(d.deckName),
    sm.top.length ? h('div', { class: 'dbx-top' }, h('div', { class: 'fhead', text: 'Key cards' }), sm.top.map(x => h('div', { text: `${x.qty} × ${x.name}` }))) : null,
    h('div', { class: 'dbx-acts' },
      btn(d.beginLabel || (d.isCur ? 'Keep using this deck' : 'Use this deck'), d.onPick, 'primary'),
      keep('Edit list', d.onEdit), d.onSide ? keep('Sideboard' + (d.deck.side.length ? ` (${sum(d.deck.side)})` : ''), d.onSide, d.dk.sb ? 'sbon' : '', 'Swap cards between your main deck and sideboard. The original list can always be restored.') : null,
      keep('Box art…', d.onArt, '', 'Choose which card’s art is on this box'), keep('Card art & printings…', d.onCustom, '', 'Pick printings or use your own pictures for the cards in this deck'),
      btn('Buy this deck…', () => openBuyDeck(Object.assign({}, d.deck, { name: d.deckName })), '', 'Open TCGplayer with this list (and your chosen printings) ready to add to the cart'),
      h('button', { text: 'Put it back', onclick: () => putBack() }),
      h('button', { class: 'danger', text: 'Delete deck\u2026', title: 'Remove this deck from your library', onclick: () => confirmDeleteDeck(d.deckName, () => { putBack(true); if (d.redraw) d.redraw(); }) })));
  const sc3 = d.scene || null;   // v0.99.50 the Library: one 3D room; the book stands on the desk and its details fill the pages of the open book
  const ov = h('div', { class: 'dbx-pull', role: 'dialog', 'aria-label': `${d.deckName}, taken off the shelf` }, h('div', { class: 'dbx-pull-in' }, turn, sc3 ? null : info));
  ov.addEventListener('mousedown', e => { if (e.target === ov) putBack(); });
  m.el.append(ov); tile.classList.add('out');
  let inked = null;
  if (sc3) {   // v0.99.71 two pages written straight onto the book's own pages (they bend into the spine with them): the deck on the left, key cards, notes and what to do on the right
    const pl = sc3.tome.querySelector('.hall-page.left'), pr = sc3.tome.querySelector('.hall-page.right'), acts = info.querySelector('.dbx-acts');
    if (pl && pr && acts) { inked = tomeDeckPages(d, sm, acts); pl.append(inked[0]); pr.append(inked[1]); info.replaceChildren(); if (typeof fitBookPages === 'function') { requestAnimationFrame(() => fitBookPages(sc3.tome.parentNode || document)); setTimeout(() => fitBookPages(sc3.tome.parentNode || document), 1200); } }
    else { const R = [...info.children].filter(x => x.classList.contains('dbx-top') || x.classList.contains('dbx-acts')), Lp = [...info.children].filter(x => !R.includes(x));
      info.replaceChildren(h('div', { class: 'ti-page' }, ...Lp), h('div', { class: 'ti-page' }, ...R)); }
    info.classList.add('tome-info'); sc3.tome.append(info); sc3.tome.classList.add('deck-open'); }
  const spread = sc3 && sc3.spread && sc3.layer ? sc3.spread(d.deck, d.deckName) : null; if (spread) sc3.layer.append(spread);
  ov._deck = d.deckName; ov._tile = tile; DESK_DECK = d.deckName;
  const motion = !DESK_QUIET && animOn('ui') !== false && !document.body.classList.contains('a11y-calm') && !reducedMotion();
  // v0.99.49 one continuous float: the book slides forward out of its slot, then travels along a gentle arc to the desk,
  // turning to show its cover on the way, and settles onto its shadow. Putting it back plays the same path in reverse.
  const posIn = (el, root) => { let x = 0, y = 0; for (let e = el; e && e !== root; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; } return [x, y]; };
  // In the 3D room the flight is worked out in room coordinates, so the camera keeps it in perspective the whole way:
  // out of its slot towards you, up and over in an arc, and down onto the desk, scaled from shelf size to desk size.
  const fly3 = (rev) => {
    const [sx, sy] = posIn(src, m.el), [bx, by] = posIn(big, m.el), [tx, ty] = posIn(turn, m.el);
    const bw = big.offsetWidth, bh = big.offsetHeight, bcx = bx + bw / 2, bcy = by + bh / 2;
    turn.style.transformOrigin = `${bcx - tx}px ${bcy - ty}px`;
    const SZ = sc3.shelfZ, TZ = sc3.deskZ, k = Math.max(0.2, src.offsetHeight / (bh || 1));
    const dx = sx + src.offsetWidth / 2 - bcx, dy = sy + src.offsetHeight / 2 - bcy, out = 0.22, N = 16;
    const p0 = [dx, dy - 6, SZ + 80], p2 = [0, 0, TZ], p1 = [dx * 0.45, Math.min(dy, 0) - 110, (SZ + TZ) / 2 + 160];
    const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const T3 = (x, y, z, q) => `translate3d(${x}px, ${y}px, ${z}px) scale3d(${q}, ${q}, ${q})`;
    const moveK = [{ offset: 0, transform: T3(dx, dy, SZ, k) }, { offset: out, transform: T3(p0[0], p0[1], p0[2], k) }];
    for (let i = 1; i <= N; i++) { const u = ease(i / N), b = j => (1 - u) * (1 - u) * p0[j] + 2 * (1 - u) * u * p1[j] + u * u * p2[j];
      moveK.push({ offset: out + (1 - out) * i / N, transform: T3(b(0), b(1), b(2), k + (1 - k) * u) }); }
    const endT = getComputedStyle(big).transform, endR = endT === 'none' ? 'rotateY(62deg)' : endT;
    const turnK = [{ offset: 0, transform: 'rotateY(0deg)' }, { offset: 0.35, transform: 'rotateY(0deg)', easing: 'cubic-bezier(.45,0,.25,1)' }, { offset: 0.92, transform: endR }, { offset: 1, transform: endR }];
    const shK = [{ offset: 0, opacity: 0 }, { offset: 0.7, opacity: 0 }, { offset: 1, opacity: 1 }];
    const flip = fr => fr.slice().reverse().map(f => ({ ...f, offset: 1 - f.offset }));
    const o = { duration: rev ? 700 : 1000, fill: 'both' };
    fwd.forEach(x => { try { x.cancel(); } catch (e) {} }); fwd = [];
    const set = [wa(big, rev ? flip(turnK) : turnK, o), wa(shadow, rev ? flip(shK) : shK, o)], a = wa(turn, rev ? flip(moveK) : moveK, o); set.push(a);
    if (!rev) { fwd = set; a.onfinish = () => { set.forEach(x => { try { x.cancel(); } catch (e) {} }); fwd = []; }; }
    return a; };
  const fly = (rev) => {
    if (sc3) return fly3(rev);
    const tr = turn.getBoundingClientRect();
    const dx = sr.left + sr.width / 2 - (tr.left + tr.width / 2), dy = sr.top + sr.height / 2 - (tr.top + tr.height / 2), k = Math.max(0.2, sr.height / (big.offsetHeight || 330));
    const lift = Math.min(40, sr.height * 0.2), out = 0.2, N = 14;
    const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const p0 = [dx, dy - lift], p2 = [0, 0], p1 = [dx * 0.35, Math.min(p0[1], 0) - 90];
    const moveK = [{ offset: 0, transform: `translate(${dx}px, ${dy}px) scale(${k})` }, { offset: out, transform: `translate(${p0[0]}px, ${p0[1]}px) scale(${k * 1.1})` }];
    for (let i = 1; i <= N; i++) { const u = ease(i / N), x = (1 - u) * (1 - u) * p0[0] + 2 * (1 - u) * u * p1[0] + u * u * p2[0], y = (1 - u) * (1 - u) * p0[1] + 2 * (1 - u) * u * p1[1] + u * u * p2[1], sc = k * 1.1 + (1 - k * 1.1) * u;
      moveK.push({ offset: out + (1 - out) * i / N, transform: i === N ? 'none' : `translate(${x}px, ${y}px) scale(${sc})` }); }
    const endT = getComputedStyle(big).transform, turnK = [{ offset: 0, transform: 'rotateY(0deg)' }, { offset: 0.3, transform: 'rotateY(0deg)', easing: 'cubic-bezier(.45,0,.25,1)' }, { offset: 0.9, transform: endT === 'none' ? 'rotateY(62deg)' : endT }, { offset: 1, transform: endT === 'none' ? 'rotateY(62deg)' : endT }];
    const shK = [{ offset: 0, opacity: 0, transform: 'scale(.5)' }, { offset: 0.6, opacity: 0, transform: 'scale(.5)' }, { offset: 1, opacity: 1, transform: 'none' }];
    const flip = fr => fr.slice().reverse().map(f => ({ ...f, offset: 1 - f.offset }));
    const o = { duration: rev ? 640 : 900, fill: 'both' };
    fwd.forEach(x => { try { x.cancel(); } catch (e) {} }); fwd = [];   // a put-back starting mid-flight takes over from the take-off
    const set = [wa(big, rev ? flip(turnK) : turnK, o), wa(shadow, rev ? flip(shK) : shK, o)], a = wa(turn, rev ? flip(moveK) : moveK, o); set.push(a);
    if (!rev) { fwd = set; a.onfinish = () => { set.forEach(x => { try { x.cancel(); } catch (e) {} }); fwd = []; }; }   // hand the book back to the mouse-turn styles
    return a; };
  let fwd = [];
  if (motion) { fly(false); wa(info, [{ opacity: 0, transform: 'translateX(28px)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: 420, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' }); wa(ov, [{ backgroundColor: 'rgba(0,0,0,0)' }, { backgroundColor: getComputedStyle(ov).backgroundColor }], { duration: 300 }); }
  const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); putBack(); } };
  document.addEventListener('keydown', esc, true);
  setTimeout(() => { const f = (inked && inked[1].querySelector('button.primary')) || info.querySelector('button.primary'); if (f) f.focus(); }, 30);
  let gone = false;
  m.el._dbxPut = () => putBack(); m.el._dbxPutOv = ov;
  function putBack(now) {
    if (gone) return; gone = true; document.removeEventListener('keydown', esc, true); if (DESK_DECK === d.deckName) DESK_DECK = null;
    ov.style.pointerEvents = 'none'; ov.classList.add('leaving'); if (m.el._dbxPut && m.el._dbxPutOv === ov) { m.el._dbxPut = null; m.el._dbxPutOv = null; }
    if (sc3) { info.remove(); if (inked) inked.forEach(x => x.remove()); if (spread) spread.remove(); sc3.tome.querySelectorAll('.tome-card, .tome-leaf').forEach(x => x.remove()); sc3.tome.classList.remove('card-open'); sc3.tome._card = null; if (!sc3.tome.querySelector('.tome-info')) sc3.tome.classList.remove('deck-open'); }
    const done = () => { ov.remove(); tile.classList.remove('out'); const st = tile.querySelector('.dbx-stage'); if (st && !now) st.focus(); };
    if (now || !motion || !tile.isConnected) { done(); return; }
    info.style.transition = 'opacity .15s'; info.style.opacity = '0'; const a = fly(true); a.onfinish = done; wa(ov, [{}, { backgroundColor: 'rgba(0,0,0,0)' }], { duration: 520, fill: 'forwards' });
  }
}
// v0.90.2 Sideboarding lives on the deck screen. The saved decklist is never changed: swaps are stored as a separate "sideboarded" list that the
// game uses, and "Restore original" simply deletes it.
function openSideboarding(deckName, after) {
  const all = loadDecks(), dk = all[deckName]; if (!dk) return;
  const orig = parseDeck(dk.text), clone = l => l.map(x => ({ qty: x.qty, name: x.name }));
  let cur = dk.sb && dk.sb.main && dk.sb.main.length ? { main: clone(dk.sb.main), side: clone(dk.sb.side || []) } : { main: clone(orig.main), side: clone(orig.side) };
  const key = n => (resolve(n) ? resolve(n).name : n).toLowerCase();
  const m = modal(`Sideboarding: ${deckName}`, { width: 900, onClose: after });
  const move = (from, to, name) => {
    const a = cur[from].find(x => x.name === name); if (!a) return;
    a.qty--; if (a.qty <= 0) cur[from].splice(cur[from].indexOf(a), 1);
    const b = cur[to].find(x => key(x.name) === key(name)); if (b) b.qty++; else cur[to].push({ qty: 1, name });
    draw();
  };
  const changed = () => JSON.stringify([cur.main, cur.side].map(l => l.map(x => [key(x.name), x.qty]).sort())) !== JSON.stringify([orig.main, orig.side].map(l => l.map(x => [key(x.name), x.qty]).sort()));
  const col = (title, list, from, to, arrow) => h('div', { class: 'sbd-col' }, h('div', { class: 'sbd-h', text: `${title} (${sum(list)})` }),
    h('div', { class: 'sbd-list' }, list.length ? [...list].sort((x, y) => x.name.localeCompare(y.name)).map(x => h('div', { class: 'sbd-row' }, h('span', { class: 'sbd-q', text: x.qty }), h('span', { class: 'sbd-n', text: x.name }),
      h('button', { text: arrow, title: from === 'main' ? 'Move one copy to the sideboard' : 'Move one copy into the main deck', onclick: () => move(from, to, x.name) }))) : h('div', { class: 'muted small', text: 'Nothing here.' })));
  const draw = () => {
    const mn = sum(cur.main), on = sum(orig.main);
    m.body.replaceChildren(
      h('div', { class: 'small muted', text: 'Click an arrow to swap one copy at a time. Your saved decklist is never changed; Restore original puts everything back.' }),
      h('div', { class: 'sbd-wrap' }, col('Main deck', cur.main, 'main', 'side', 'Side ▸'), col('Sideboard', cur.side, 'side', 'main', '◂ Main')),
      h('div', { class: 'sbd-foot small', style: mn === on ? '' : 'color:var(--gold)', text: `Main deck: ${mn} cards${mn === on ? '' : ` (the original had ${on})`}${changed() ? ' · changed from the original' : ' · same as the original'}` }));
    reset.disabled = !changed() && !dk.sb;
  };
  const reset = h('button', { text: 'Restore original', title: 'Go back to the decklist exactly as you saved it', onclick: () => { cur = { main: clone(orig.main), side: clone(orig.side) }; draw(); } });
  m.foot.append(reset, h('button', { text: 'Cancel', onclick: () => m.close() }), h('button', { class: 'primary', text: 'Use this list', onclick: () => {
    const a2 = loadDecks(); if (!a2[deckName]) { m.close(); return; }
    if (changed()) a2[deckName].sb = { main: clone(cur.main), side: clone(cur.side) }; else delete a2[deckName].sb;
    saveDecks(a2); lsSet('mtgpt.current', deckName); refreshDeckSelect(); prepareImages(); m.close(); toast(changed() ? 'Sideboarded' : 'Original list', changed() ? 'New games use this list. Open Sideboard again and choose Restore original to undo.' : 'New games use the original list.'); render();
  } }));
  draw();
}
function openDeckPicker() {   // v0.99.44 if the bookcase itself fails, a plain list still lets you pick, edit and import decks
  try { return openDeckPicker0(); } catch (e) {
    console.error('deck screen', e); try { log(`Deck screen error: ${e.message}`); } catch (e2) {}
    document.querySelectorAll('.dbx-modal').forEach(x => { const b = x.closest('.backdrop'); if (b) b.remove(); });
    const m = modal('Your decks', { width: 520 }); const names = Object.keys(loadDecks()).sort((a, b) => a.localeCompare(b));
    m.body.append(h('div', { class: 'muted small', text: `The deck shelf could not be drawn (${e.message}). Your decks are safe; here they are as a list.` }),
      ...names.map(n => h('div', { class: 'setrow' }, h('label', { text: n }), h('button', { class: 'primary', text: 'Use', onclick: () => { lsSet('mtgpt.current', n); refreshDeckSelect(); prepareImages(); m.close(); render(); } }), h('button', { text: 'Edit', onclick: () => { lsSet('mtgpt.current', n); refreshDeckSelect(); m.close(); openDeckEditor(); } }))));
    m.foot.append(h('button', { text: 'Import / new deck…', onclick: () => { m.close(); openDeckEditor(); } }), h('button', { text: 'Close', onclick: () => m.close() }));
  }
}
// v0.99.48 the shelves are shared by the deck window and the Library hall: cb.pick(name), cb.edit(name), cb.redraw(), cb.host ({ el }: where a pulled book lands), cb.beginLabel
function bookcaseEl(names, cur, mode, cb) {
  if (!names.length) return h('div', { class: 'muted bk-empty', text: mode === 'commander' ? 'No Commander decks yet. Use “Import / new deck” and put your commander under a “Commander” heading.' : 'No decks yet. Use “Import / new deck” to paste a decklist.' });
  BOOK_SCALE = cb.scale || 1;
  try { return h('div', { class: 'bk-case' }, Array.from({ length: Math.max(cb.minShelves || 0, Math.ceil(names.length / BOOKS_PER_SHELF)) }, (_, r) => h('div', { class: 'bk-shelf', style: `--sk:${r}` }, h('div', { class: 'bk-row' }, names.slice(r * BOOKS_PER_SHELF, (r + 1) * BOOKS_PER_SHELF).map(n => deckBoxEl(n, n === cur,
    () => cb.pick(n), () => openDeckArtPicker(n, cb.redraw), () => cb.edit(n), () => openCustomArt(n, cb.redraw), () => openSideboarding(n, cb.redraw),
    (tile, d) => pullDeckBox(cb.host, tile, Object.assign(d, { redraw: cb.redraw, beginLabel: cb.beginLabel, scene: cb.scene }))))), h('div', { class: 'bk-plank' })))); } finally { BOOK_SCALE = 1; }
}
function openDeckPicker0() {
  const m = modal('Your decks', { width: 940 }); m.el.classList.add('dbx-modal');
  const draw = () => {
    const decks = loadDecks(), mode = gameMode(), names = decksInMode(decks, mode).sort((x, y) => x.localeCompare(y)), cur = currentDeckName();
    const pick = md => { if (md === gameMode()) return; setGameMode(md); const first = decksInMode(loadDecks(), md).sort((x, y) => x.localeCompare(y))[0]; lsSet('mtgpt.current', first || ''); refreshDeckSelect(); prepareImages(); render(); draw(); };
    const seg = FEATURES.commander ? h('div', { class: 'modeseg', role: 'tablist', 'aria-label': 'Game mode' },
      ...[['standard', 'Decks', 'Normal goldfish games'], ['commander', 'Commander', 'Commander decks and Commander rules (40 life, command zone, commander tax)']].map(([k, lab, tip]) => h('button', { class: 'modetab' + (mode === k ? ' on' : ''), role: 'tab', 'aria-selected': String(mode === k), title: tip, text: lab, onclick: () => pick(k) }))) : null;
    m.body.replaceChildren(seg, bookcaseEl(names, cur, mode, {
      pick: n => { lsSet('mtgpt.current', n); refreshDeckSelect(); prepareImages(); m.close(); render(); },
      edit: n => { lsSet('mtgpt.current', n); refreshDeckSelect(); m.close(); openDeckEditor(); },
      redraw: draw, host: m }));
  };
  draw();
  m.foot.append(h('button', { text: 'Import / new deck…', onclick: () => { m.close(); openDeckEditor(gameMode() === 'commander' ? { blank: true, text: 'Commander\n1 \n\nDeck\n' } : { blank: true }); } }), h('button', { text: 'Scan decks & save report', title: 'Reads every card in every saved deck and saves a text file you can send for review', onclick: saveDeckScanReport }), h('button', { class: 'primary', text: 'Close', onclick: () => m.close() }));
  const decks = loadDecks(); loadCachedImages(Object.keys(decks).map(n => deckArtName(n, parseDeck(decks[n].text)))).then(n => { if (n) draw(); });
}
// ---- Deck scan report (v0.63): reads every card of every saved deck and writes one text file to send for review.
function deckScanReportText() {
  const decks = loadDecks(), names = Object.keys(decks).sort((a, b) => a.localeCompare(b));
  const L = [`Library of Alexandria deck scan report (v${APP_VERSION})`, `Created ${new Date().toISOString()}`, `Card data loaded: ${CARDS.size ? CARDS.size.toLocaleString() + ' cards' : 'NONE (import the Oracle file first, otherwise nothing can be read)'}`, `Decks scanned: ${names.length}`, ''];
  const agg = new Map(), tot = { ok: 0, part: 0, unk: 0 }, missingAll = new Set(); const seenCard = new Set();
  for (const n of names) {
    const deck = parseDeck(decks[n].text), list = deckNameList(deck), cards = [];
    const miss = [], rows = [];
    for (const nm of list) { const cc = compileCard({ name: nm }); if (!cc) { miss.push(nm); missingAll.add(nm); continue; } cards.push(cc); }
    const t = { ok: 0, part: 0, unk: 0 }; for (const c of cards) for (const k of ['ok', 'part', 'unk']) t[k] += c.counts[k];
    L.push('='.repeat(70), `DECK: ${n}  (${deck.main.reduce((a, x) => a + (x.qty || x.n || 0), 0) || deck.main.length} main entries, ${list.length} different cards)`);
    L.push(`Lines understood ${t.ok}, partly ${t.part}, not understood ${t.unk}. Cards with no card data: ${miss.length}${miss.length ? ' -> ' + miss.join('; ') : ''}`);
    for (const c of cards.slice().sort((a, b) => b.counts.unk - a.counts.unk || b.counts.part - a.counts.part)) {
      const bad = c.lines.filter(l => l.status === 'unk' || l.status === 'part'); if (!bad.length) continue;
      L.push('', `  ${c.name}  [${c.mc || '-'}] ${c.type}`);
      for (const l of bad) {
        L.push(`    ${l.status === 'unk' ? 'NOT UNDERSTOOD' : 'partly'} (${l.kind}): ${l.text.replace(/\n/g, ' ')}`, `      note: ${l.note}`);
        if (!seenCard.has(c.name + l.text)) { seenCard.add(c.name + l.text); const sh = covShape(covCore(l), c.name); if (sh) { const k = l.kind + ' | ' + l.status + ' | ' + sh; const e = agg.get(k) || { n: 0, ex: [] }; e.n++; if (e.ex.length < 3) e.ex.push(c.name); agg.set(k, e); } }
      }
    }
    for (const k of ['ok', 'part', 'unk']) tot[k] += t[k];
    L.push('');
  }
  const all = tot.ok + tot.part + tot.unk || 1;
  L.splice(5, 0, `ALL DECKS: ${tot.ok} lines understood (${Math.round(100 * tot.ok / all)}%), ${tot.part} partly (${Math.round(100 * tot.part / all)}%), ${tot.unk} not understood (${Math.round(100 * tot.unk / all)}%).`, `Cards missing from card data: ${missingAll.size}${missingAll.size ? ' -> ' + [...missingAll].join('; ') : ''}`, '');
  L.push('='.repeat(70), 'MOST COMMON PHRASES THE APP DOES NOT FULLY HANDLE (kind | status | phrase | count | example cards)');
  for (const [k, e] of [...agg.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 120)) L.push(`  ${k} | ${e.n} | ${e.ex.join('; ')}`);
  // v0.99.46 the full lists too, so the decks can be rebuilt exactly for testing (main deck, sideboard, and the sideboarded list in use)
  L.push('', '='.repeat(70), 'FULL DECK LISTS');
  for (const n of names) { const dk = decks[n] || {}; L.push('', `----- ${n}${dk.sb ? ' (a sideboarded list is in use; the original is below it)' : ''}`, (dk.sb && dk.sb.main ? [...dk.sb.main.map(x => `${x.qty} ${x.name}`), '', 'Sideboard', ...(dk.sb.side || []).map(x => `${x.qty} ${x.name}`)].join('\n') : String(dk.text || '').trim())); if (dk.sb) L.push('-- original list --', String(dk.text || '').trim()); }
  return L.join('\n');
}
function saveDeckScanReport() {
  const names = Object.keys(loadDecks());
  if (!names.length) { toast('No decks', 'Import a deck first.'); return; }
  const txt = deckScanReportText();
  const a = h('a', { href: URL.createObjectURL(new Blob([txt], { type: 'text/plain' })), download: 'mtg-playtester-deck-report.txt' });
  document.body.append(a); a.click(); a.remove();
  toast('Report saved', `Scanned ${names.length} deck${names.length === 1 ? '' : 's'}. Upload mtg-playtester-deck-report.txt to Claude.`);
}
async function loadCustomArt() {
  let n = 0;
  try {
    const keys = await idbKeys('cart:'); if (!keys.length) return 0;
    const rec = await idbGetMany(keys);
    for (const k of keys) { const b = rec[k]; if (!b) continue; const mk = k.slice(5); const old = CUSTOM.get(mk); if (old) URL.revokeObjectURL(old.front); CUSTOM.set(mk, { front: URL.createObjectURL(b), back: null, remote: false, custom: true }); n++; }
  } catch (e) { /* storage unavailable: custom art simply is not loaded */ }
  return n;
}
// Scale an image down to card size (long side 1040 px) and store it as a JPEG, so big pictures do not slow the table down.
async function fitArt(file) {
  const bmp = await createImageBitmap(file);
  const sc = Math.min(1, 1040 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(bmp.width * sc)); cv.height = Math.max(1, Math.round(bmp.height * sc));
  const cx = cv.getContext('2d'); cx.fillStyle = '#000'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(bmp, 0, 0, cv.width, cv.height); if (bmp.close) bmp.close();
  return await new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('Could not read that picture.')), 'image/jpeg', 0.92));
}
async function setCustomArt(deck, name, file, print) {   // v0.99.37 print: the Scryfall printing this picture is (from the printing picker); your own picture clears it
  const blob = await fitArt(file), mk = customMapKey(deck, name), old = CUSTOM.get(mk);
  setPrintMeta(deck, name, print || null);
  try { await idbSet('cart:' + mk, blob); } catch (e) { toast('Not saved', 'This picture is used for now, but the browser would not store it, so it will be gone next time.'); }
  if (old) URL.revokeObjectURL(old.front);
  CUSTOM.set(mk, { front: URL.createObjectURL(blob), back: null, remote: false, custom: true });
}
async function resetCustomArt(deck, name, _face) {
  const mk = customMapKey(deck, name), old = CUSTOM.get(mk); if (old) URL.revokeObjectURL(old.front); CUSTOM.delete(mk); setPrintMeta(deck, name, null);
  if (!_face) { const inf = cardInfo(name); for (const f of (inf && inf.fc) || []) if (f && f.name && f.name !== name && CUSTOM.has(customMapKey(deck, f.name))) await resetCustomArt(deck, f.name, true); }   // and the back face's picture of that printing
  try { await idbDelete(['cart:' + mk]); } catch (e) { /* ignore */ }
}
function clearDeckArt(deck) {
  forgetDeckPrints(deck);
  const ks = [...CUSTOM.keys()].filter(k => k.startsWith(deck + '|'));
  for (const k of ks) { URL.revokeObjectURL(CUSTOM.get(k).front); CUSTOM.delete(k); }
  if (ks.length) idbDelete(ks.map(k => 'cart:' + k)).catch(() => {});
}
function openCustomArt(deckName, after) {
  const dk = loadDecks()[deckName]; if (!dk) return; const deck = parseDeck(dk.text);
  const qty = new Map(); for (const x of deck.main.concat(deck.side)) { const r = resolve(x.name), n = r ? r.name : x.name; qty.set(n, (qty.get(n) || 0) + (x.qty || x.n || 1)); }
  const names = [...qty.keys()].sort((a, b) => a.localeCompare(b));
  const m = modal(`Card art & printings: ${deckName}`, { width: 900, onClose: after });
  const grid = h('div', { class: 'cart-grid' }), note = h('div', { class: 'small', style: 'color:var(--gold);min-height:18px;margin:4px 0' });
  const customCount = () => names.filter(n => CUSTOM.has(customMapKey(deckName, n))).length;
  const pick = (accept, multiple, cb) => { const inp = h('input', { type: 'file', accept, style: 'display:none' }); if (multiple) inp.multiple = true; inp.addEventListener('change', () => { const fs = [...inp.files]; inp.remove(); if (fs.length) cb(fs); }); document.body.append(inp); inp.click(); };
  const draw = () => {
    grid.replaceChildren(...names.map(n => {
      const has = CUSTOM.has(customMapKey(deckName, n)), im = imgFor(n, deckName);
      const thumb = h('div', { class: 'cart-thumb' + (im ? '' : ' none') + (has ? ' mine' : ''), style: im ? `background-image:url("${im.front}")` : '' }, im ? null : h('span', { text: n }), has ? h('i', { class: 'cart-mine', text: 'custom' }) : null);
      const pr = printFor(deckName, n);
      return h('div', { class: 'cart-cell' }, thumb, h('div', { class: 'cart-name', title: n, text: `${qty.get(n)}× ${n}` }), h('div', { class: 'cart-print small muted', text: pr ? printLabel(pr) : '\u00a0', title: pr ? printLabel(pr) : '' }),   // always one line, so every card's buttons line up
        h('div', { class: 'cart-btns' },
          h('button', { text: 'Printing…', title: 'Choose one of the card\u2019s real printings (alternate art) from Scryfall', onclick: () => openPrintPicker(deckName, n, () => { draw(); render(); }) }),
          h('button', { text: has ? 'Change…' : 'Choose image…', onclick: () => pick('image/*', false, async fs => { try { note.textContent = 'Saving…'; await setCustomArt(deckName, n, fs[0]); note.textContent = `Saved art for ${n}.`; } catch (e) { note.textContent = 'Could not use that file: ' + e.message; } draw(); render(); }) }),
          has ? h('button', { text: 'Reset', title: 'Go back to the normal card art', onclick: async () => { await resetCustomArt(deckName, n); note.textContent = `${n} is back to its normal art.`; draw(); render(); } }) : null));
    }));
    count.textContent = `${customCount()} of ${names.length} cards have custom art`;
  };
  const count = h('span', { class: 'small muted' });
  const batch = () => pick('image/*', true, async fs => {
    const look = new Map(); for (const n of names) { look.set(imgKey(n), n); look.set(imgKey(frontName(n)), n); }
    let ok = 0; const miss = [];
    for (const f of fs) {
      const base = f.name.replace(/\.[^.]+$/, '').replace(/\s*\(\d+\)\s*$/, ''), n = look.get(imgKey(base));
      if (!n) { miss.push(f.name); continue; }
      try { await setCustomArt(deckName, n, f); ok++; } catch (e) { miss.push(f.name); }
    }
    note.textContent = `${ok} picture${ok === 1 ? '' : 's'} matched and saved.` + (miss.length ? ` Not matched (rename the file to the card's name): ${miss.slice(0, 6).join(', ')}${miss.length > 6 ? '…' : ''}` : '');
    draw(); render();
  });
  m.body.append(
    h('p', { class: 'small muted', text: 'Pick your own picture for any card in this deck. The picture is used on the table, in your hand and in the card preview. Choose one card at a time, or import many at once if the files are named after the cards (for example “Lightning Bolt.png”). Pictures stay on this computer and only apply to this deck.' }),
    h('div', { class: 'cart-bar' }, h('button', { class: 'primary', text: 'Import several images…', title: 'Files are matched to cards by file name', onclick: batch }), count,
      h('button', { class: 'danger', text: 'Reset all', onclick: () => { if (!customCount() || !confirm(`Remove all custom art from "${deckName}"?`)) return; clearDeckArt(deckName); note.textContent = 'All custom art removed.'; draw(); render(); } })),
    note, grid);
  m.foot.append(h('button', { class: 'primary', text: 'Done', onclick: () => m.close() }));
  draw();
}
function openDeckArtPicker(deckName, after) {
  const dk = loadDecks()[deckName]; if (!dk) return; const deck = parseDeck(dk.text);
  const names = [...new Set(deck.main.concat(deck.side).map(x => { const r = resolve(x.name); return r ? r.name : x.name; }))].filter(n => !isLandName(n));
  const cur = deckArtName(deckName, deck);
  const m = modal(`Box art for ${deckName}`, { width: 760 });
  const draw = () => m.body.replaceChildren(
    h('div', { class: 'small muted', text: 'Pick the card whose art goes on this deck box. (Card pictures appear once they are downloaded in Settings → Card images.)' }),
    h('div', { class: 'dbx-artgrid' }, names.map(n => { const im = imgFor(n);
      return h('button', { class: 'dbx-artopt' + (n === cur ? ' on' : ''), title: n, onclick: () => { const all = loadDecks(); if (all[deckName]) { all[deckName].art = n; saveDecks(all); } m.close(); if (after) after(); } },
        h('span', { class: 'dbx-art mini' + (im ? '' : ' none'), style: artStyle(im) }), h('span', { class: 'artlbl', text: n })); })));
  draw(); loadCachedImages(names).then(n => { if (n) draw(); });
}

// v0.99.45 Delete a deck from the deck screen: asks first (inside the app), then removes the list, its sideboard, box art and chosen printings.
function confirmDeleteDeck(name, after) {
  const c = modal(`Delete "${name}"?`, { width: 440 });
  c.body.append(h('div', { class: 'psub', text: 'This removes the deck list, its sideboard, its box art and the printings you chose for it. It cannot be undone.' }));
  c.foot.append(h('button', { text: 'Keep it', onclick: () => c.close() }), h('button', { class: 'danger', text: 'Delete deck', onclick: () => {
    const all = loadDecks(); if (!all[name]) { c.close(); return; } delete all[name]; saveDecks(all);
    try { clearDeckArt(name); } catch (e) {} try { forgetDeckPrints(name); } catch (e) {}
    if (lsGet('mtgpt.current', '') === name) { const rest = Object.keys(all).sort((x, y) => x.localeCompare(y)); lsSet('mtgpt.current', rest[0] || null); prepareImages(); }
    refreshDeckSelect(); c.close(); toast('Deck deleted', `"${name}" was removed from your library.`); render(); if (after) after(); } }));
}
