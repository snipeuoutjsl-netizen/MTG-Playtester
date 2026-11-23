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
function bookModel(deckName, deck, cols, im, big) {
  const a = BOOK_COL[cols[0] || ''], b = BOOK_COL[cols[1] || cols[0] || ''], hs = strHash(deckName);   // the book is the deck's main colour (the colour with the most mana symbols)
  const T = big ? 70 : 44 + hs % 11, H = big ? 330 : 198 + (hs >> 4) % 26, D = big ? 236 : 146;
  const pips = cols.map(c => h('i', { class: 'dbx-pip', style: `background:${WUBRG_COL['WUBRG'.indexOf(c)]}` }));
  return h('div', { class: 'bk' + (big ? ' big' : ''), 'data-col': cols[0] || 'C', style: `--ca:${a[1]};--cad:${a[0]};--cb:${b[1]};--cbd:${b[0]};--T:${T}px;--H:${H}px;--D:${D}px` },
    h('div', { class: 'bk-face spine' }, h('i', { class: 'bk-band' }), h('span', { class: 'bk-title', text: deckName }), h('span', { class: 'bk-pips' }, ...pips.map(x => x.cloneNode())), h('i', { class: 'bk-band low' })),
    h('div', { class: 'bk-face cover' },
      h('div', { class: 'dbx-art' + (im ? '' : ' none'), style: artStyle(im) }, im ? null : h('span', { text: (deckName.trim()[0] || '?').toUpperCase() })),
      h('div', { class: 'dbx-gloss' }),
      h('div', { class: 'dbx-label' }, h('b', { text: deckName }), h('span', {}, `${sum(deck.main)} cards`, ' ', ...pips))),
    h('div', { class: 'bk-face back' }),
    h('div', { class: 'bk-face top' }));
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
  const stage = h('div', { class: 'dbx-stage bk-stage', role: 'button', tabindex: 0, 'aria-label': `${deckName}, ${sum(deck.main)} cards${isCur ? ', in use' : ''}. Press Enter to take it off the shelf.`, title: `${deckName}${isCur ? ' (in use)' : ''} — click to take it off the shelf, double-click to use it` }, bk);
  let clickT = 0;
  stage.addEventListener('click', () => { clearTimeout(clickT); clickT = setTimeout(() => onPull ? onPull(tile, { deckName, deck, cols, im, dk, isCur, onPick, onArt, onEdit, onCustom, onSide }) : onPick(), 230); });
  stage.addEventListener('dblclick', () => { clearTimeout(clickT); onPick(); });
  stage.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); stage.click(); } });
  // v0.99.44 no tilt on the shelf: hovering only lifts the book
  const tile = h('div', { class: 'dbx-tile bk-tile' + (isCur ? ' on' : ''), style: `width:${bk.style.getPropertyValue('--T')}` }, stage, isCur ? h('div', { class: 'bk-ribbon', title: 'In use' }) : null);
  return tile;
}
// Take a book off the shelf: it flies from its place to the middle of the window (FLIP animation), with its details beside it.
function pullDeckBox(m, tile, d) {
  if (m.el.querySelector('.dbx-pull')) return;
  const src = tile.querySelector('.bk-stage'), sr = src.getBoundingClientRect();
  const big = bookModel(d.deckName, d.deck, d.cols, d.im, true);
  const turn = h('div', { class: 'dbx-turn', title: 'Move the mouse over the box to turn it' }, big); tiltWith(turn, big);
  const sm = deckSummary(d.deck), maxC = Math.max(1, ...sm.curve);
  const btn = (text, fn, cls, title) => h('button', { class: cls || '', text, title: title || '', onclick: () => { putBack(true); fn(); } });
  const info = h('div', { class: 'dbx-info' },
    h('h3', { text: d.deckName }), h('div', { class: 'muted small', text: `${sum(d.deck.main)} cards${d.deck.side.length ? ` · sideboard ${sum(d.deck.side)}` : ''}${d.dk.sb ? ' · sideboarded list in use' : ''}${d.isCur ? ' · the deck in use' : ''}` }),
    h('div', { class: 'dbx-pips' }, d.cols.length ? d.cols.map(c => h('i', { class: 'dbx-pip', style: `background:${WUBRG_COL['WUBRG'.indexOf(c)]}`, title: c })) : h('span', { class: 'muted small', text: 'Colourless' })),
    h('div', { class: 'dbx-types' }, Object.entries(sm.types).filter(e => e[1]).map(([k, n]) => h('span', { text: `${n} ${n === 1 ? k : k === 'Sorcery' ? 'Sorceries' : k + 's'}` }))),
    h('div', { class: 'dbx-curve', 'aria-label': 'Mana curve: ' + sm.curve.map((n, i) => `${n} at ${i}${i === 6 ? '+' : ''}`).join(', ') }, sm.curve.map((n, i) => h('div', { class: 'dbx-cbar' }, h('i', { style: `height:${Math.round(100 * n / maxC)}%` }), h('b', { text: n || '' }), h('span', { text: i === 6 ? '6+' : String(i) })))),
    sm.top.length ? h('div', { class: 'dbx-top' }, h('div', { class: 'fhead', text: 'Key cards' }), sm.top.map(x => h('div', { text: `${x.qty} × ${x.name}` }))) : null,
    h('div', { class: 'dbx-acts' },
      btn(d.isCur ? 'Keep using this deck' : 'Use this deck', d.onPick, 'primary'),
      btn('Edit list', d.onEdit), d.onSide ? btn('Sideboard' + (d.deck.side.length ? ` (${sum(d.deck.side)})` : ''), d.onSide, d.dk.sb ? 'sbon' : '', 'Swap cards between your main deck and sideboard. The original list can always be restored.') : null,
      btn('Box art…', d.onArt, '', 'Choose which card’s art is on this box'), btn('Card art & printings…', d.onCustom, '', 'Pick printings or use your own pictures for the cards in this deck'),
      h('button', { text: 'Put it back', onclick: () => putBack() })));
  const ov = h('div', { class: 'dbx-pull', role: 'dialog', 'aria-label': `${d.deckName}, taken off the shelf` }, h('div', { class: 'dbx-pull-in' }, turn, info));
  ov.addEventListener('mousedown', e => { if (e.target === ov) putBack(); });
  m.el.append(ov); tile.classList.add('out');
  const motion = animOn('ui') !== false && !document.body.classList.contains('a11y-calm') && !reducedMotion();
  const fly = (rev) => { const br = big.getBoundingClientRect(); const dx = sr.left + sr.width / 2 - (br.left + br.width / 2), dy = sr.top + sr.height / 2 - (br.top + br.height / 2), k = sr.width / br.width;
    const from = { transform: `translate(${dx}px, ${dy}px) scale(${k})` }, to = { transform: 'none' };
    return wa(turn, rev ? [to, from] : [from, to], { duration: 460, easing: 'cubic-bezier(.2,.8,.25,1)' }); };
  if (motion) { fly(false); wa(info, [{ opacity: 0, transform: 'translateX(24px)' }, { opacity: 1, transform: 'none' }], { duration: 360, delay: 140, easing: 'ease-out', fill: 'backwards' }); wa(ov, [{ backgroundColor: 'rgba(0,0,0,0)' }, { backgroundColor: getComputedStyle(ov).backgroundColor }], { duration: 300 }); }
  const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); putBack(); } };
  document.addEventListener('keydown', esc, true);
  setTimeout(() => { const f = info.querySelector('button.primary'); if (f) f.focus(); }, 30);
  let gone = false;
  function putBack(now) {
    if (gone) return; gone = true; document.removeEventListener('keydown', esc, true);
    const done = () => { ov.remove(); tile.classList.remove('out'); const st = tile.querySelector('.dbx-stage'); if (st && !now) st.focus(); };
    if (now || !motion || !tile.isConnected) { done(); return; }
    info.style.opacity = '0'; const a = fly(true); a.onfinish = done; wa(ov, [{}, { backgroundColor: 'rgba(0,0,0,0)' }], { duration: 400, fill: 'forwards' });
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
function openDeckPicker0() {
  const m = modal('Your decks', { width: 940 }); m.el.classList.add('dbx-modal');
  const draw = () => {
    const decks = loadDecks(), mode = gameMode(), names = decksInMode(decks, mode).sort((x, y) => x.localeCompare(y)), cur = currentDeckName();
    const pick = md => { if (md === gameMode()) return; setGameMode(md); const first = decksInMode(loadDecks(), md).sort((x, y) => x.localeCompare(y))[0]; lsSet('mtgpt.current', first || ''); refreshDeckSelect(); prepareImages(); render(); draw(); };
    const seg = FEATURES.commander ? h('div', { class: 'modeseg', role: 'tablist', 'aria-label': 'Game mode' },
      ...[['standard', 'Decks', 'Normal goldfish games'], ['commander', 'Commander', 'Commander decks and Commander rules (40 life, command zone, commander tax)']].map(([k, lab, tip]) => h('button', { class: 'modetab' + (mode === k ? ' on' : ''), role: 'tab', 'aria-selected': String(mode === k), title: tip, text: lab, onclick: () => pick(k) }))) : null;
    m.body.replaceChildren(seg, names.length
      ? h('div', { class: 'bk-case' }, Array.from({ length: Math.ceil(names.length / BOOKS_PER_SHELF) }, (_, r) => h('div', { class: 'bk-shelf' }, h('div', { class: 'bk-row' }, names.slice(r * BOOKS_PER_SHELF, (r + 1) * BOOKS_PER_SHELF).map(n => deckBoxEl(n, n === cur,
        () => { lsSet('mtgpt.current', n); refreshDeckSelect(); prepareImages(); m.close(); render(); },
        () => openDeckArtPicker(n, draw),
        () => { lsSet('mtgpt.current', n); refreshDeckSelect(); m.close(); openDeckEditor(); },
        () => openCustomArt(n, draw),
        () => openSideboarding(n, draw),
        (tile, d) => pullDeckBox(m, tile, d)))), h('div', { class: 'bk-plank' }))))
      : h('div', { class: 'muted', text: mode === 'commander' ? 'No Commander decks yet. Use “Import / new deck” and put your commander under a “Commander” heading.' : 'No decks yet. Use “Import / new deck” to paste a decklist.' }));
  };
  draw();
  m.foot.append(h('button', { text: 'Import / new deck…', onclick: () => { m.close(); openDeckEditor(gameMode() === 'commander' ? { blank: true, text: 'Commander\n1 \n\nDeck\n' } : { blank: true }); } }), h('button', { text: 'Scan decks & save report', title: 'Reads every card in every saved deck and saves a text file you can send for review', onclick: saveDeckScanReport }), h('button', { class: 'primary', text: 'Close', onclick: () => m.close() }));
  const decks = loadDecks(); loadCachedImages(Object.keys(decks).map(n => deckArtName(n, parseDeck(decks[n].text)))).then(n => { if (n) draw(); });
}
// ---- Deck scan report (v0.63): reads every card of every saved deck and writes one text file to send for review.
function deckScanReportText() {
  const decks = loadDecks(), names = Object.keys(decks).sort((a, b) => a.localeCompare(b));
  const L = [`MTG Playtester deck scan report (v${APP_VERSION})`, `Created ${new Date().toISOString()}`, `Card data loaded: ${cardCount ? cardCount.toLocaleString() + ' cards' : 'NONE (import the Oracle file first, otherwise nothing can be read)'}`, `Decks scanned: ${names.length}`, ''];
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
