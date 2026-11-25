// ---- v0.99.106 The Archive: the cards you have. Three views:
//  - Everything: every card from your decks and your packs, one tile per card name;
//  - In your decks: every card across all your decks (both formats), with how many decks use it and the most copies one deck needs;
//  - From packs: every printing you opened, with how many you have (foils apart) and its rarity; cards from your latest pack are New
//    until you have looked at the Archive.
// It is a page of the Library (the "Archive" row in the sidebar); the Packs button in the Library's top bar opens packs.
let collSrc = 'all', collSet = 'all', collRar = 'all', collType = 'all', collDeck = 'all', collQuery = '';
function openCollection() {
  try { libFilter = 'collection'; if (typeof hallOpen === 'function' && hallOpen()) drawHall(); else openHall(); } catch (e) { console.error(e); }
}
function collStats() { const c = collState(), all = Object.values(c.cards); return { unique: all.length, total: all.reduce((n, e) => n + e.c + e.f, 0), foils: all.reduce((n, e) => n + e.f, 0) }; }
const COLL_RORDER = { mythic: 0, rare: 1, uncommon: 2, common: 3 };
const COLL_TYPES = [['Creature', 'Creatures'], ['Planeswalker', 'Planeswalkers'], ['Instant', 'Instants'], ['Sorcery', 'Sorceries'], ['Artifact', 'Artifacts'], ['Enchantment', 'Enchantments'], ['Land', 'Lands']];
function collTypeOf(name) { const i = cardInfo(name) || resolve(name); const t = String((i && i.t) || '').split(' // ')[0]; return (COLL_TYPES.find(([k]) => new RegExp('\\b' + k + '\\b').test(t)) || ['Other'])[0]; }
// every card in your decks: name -> { n, decks: Set, need (most copies in one deck), copies (all decks together) }
function deckCardIndex() {
  const decks = loadDecks(), out = new Map();
  for (const [dn, dk] of Object.entries(decks)) { let d; try { d = parseDeck(dk.text); } catch (e) { continue; }
    const here = new Map(); for (const x of [...(d.main || []), ...(d.side || []), ...(d.commander || [])]) { const r = resolve(x.name), nm = r ? r.name : x.name; here.set(nm, (here.get(nm) || 0) + (x.qty || 1)); }
    for (const [nm, q] of here) { const e = out.get(nm) || { n: nm, decks: new Set(), need: 0, copies: 0 }; e.decks.add(dn); e.need = Math.max(e.need, q); e.copies += q; out.set(nm, e); } }
  return out;
}
function collectionPage(redraw) {
  const c = collState(), packCards = Object.values(c.cards), st = collStats(), ps = packState(), di = deckCardIndex(), seen = c.seen || 0;
  // pictures of deck cards come from the app's image cache
  if (!collectionPage._asked) { collectionPage._asked = true; try { loadCachedImages([...di.keys()]).then(n => { if (n && libFilter === 'collection') redraw(); }); } catch (e) {} }
  const zoom = h('div', { class: 'coll-zoom' }); zoom.addEventListener('click', () => zoom.classList.remove('on'));
  const showZoom = (img, name, cap) => { zoom.replaceChildren(img ? h('img', { src: img, alt: name }) : h('div', { class: 'coll-txt big' }, h('b', { text: name })), h('div', { class: 'coll-zcap', text: cap })); zoom.classList.add('on'); };
  const pic = (img, name) => { if (!img) return h('div', { class: 'coll-txt' }, h('b', { text: name })); const im = h('img', { src: img, alt: name, loading: 'lazy', draggable: 'false' }); im.addEventListener('error', () => im.replaceWith(h('div', { class: 'coll-txt' }, h('b', { text: name })))); return im; };
  const deckImg = n => { const im = imgFor(n, null); return im ? im.front : ''; };
  // ---- the tiles of each view
  let items = [];
  if (collSrc === 'packs') {
    items = packCards.filter(e => (collSet === 'all' || e.set === collSet) && (collRar === 'all' || e.r === collRar || (collRar === 'foil' && e.f > 0)))
      .sort((a, b) => (b.last || 0) - (a.last || 0) || (COLL_RORDER[a.r] ?? 9) - (COLL_RORDER[b.r] ?? 9) || a.n.localeCompare(b.n))
      .map(e => ({ key: e.set + '#' + e.cn, n: e.n, img: e.img, cls: 'r-' + e.r + (e.f ? ' has-foil' : ''), foil: e.f > 0, count: `×${e.c + e.f}`, isNew: (e.t || 0) > seen,
        title: `${e.n} · ${e.sn} #${e.cn} · ${PK_RARITY[e.r] || e.r}${e.f ? ` · ${e.f} foil` : ''}`, cap: `${e.n} · ${e.sn} · ${PK_RARITY[e.r] || e.r} · you have ${e.c}${e.f ? ` + ${e.f} foil` : ''}` }));
  } else {
    const byName = new Map();
    for (const e of packCards) { const x = byName.get(e.n) || { n: e.n, owned: 0, foil: 0, img: e.img, r: e.r, decks: null, last: 0, isNew: false }; x.owned += e.c + e.f; x.foil += e.f; x.last = Math.max(x.last, e.last || 0); x.isNew = x.isNew || (e.t || 0) > seen; if ((COLL_RORDER[e.r] ?? 9) < (COLL_RORDER[x.r] ?? 9)) x.r = e.r; byName.set(e.n, x); }
    if (collSrc === 'decks') for (const k of [...byName.keys()]) if (!di.has(k)) byName.delete(k);
    for (const [nm, d] of di) { const x = byName.get(nm) || { n: nm, owned: 0, foil: 0, img: '', r: '', last: 0, isNew: false }; x.deck = d; if (!x.img) x.img = deckImg(nm); byName.set(nm, x); }
    if (collSrc === 'decks') for (const [k, x] of [...byName]) if (!x.deck) byName.delete(k);
    items = [...byName.values()].filter(x => (collType === 'all' || collTypeOf(x.n) === collType) && (collDeck === 'all' || (x.deck && x.deck.decks.has(collDeck))))
      .sort((a, b) => (b.deck ? b.deck.decks.size : 0) - (a.deck ? a.deck.decks.size : 0) || (b.owned - a.owned) || a.n.localeCompare(b.n))
      .map(x => { const nd = x.deck ? x.deck.decks.size : 0;
        const parts = [nd ? `in ${nd} deck${nd === 1 ? '' : 's'} (up to ${x.deck.need} in one)` : '', x.owned ? `${x.owned} from packs${x.foil ? `, ${x.foil} foil` : ''}` : ''].filter(Boolean);
        return { key: x.n, n: x.n, img: x.img, cls: x.r ? 'r-' + x.r : '', foil: x.foil > 0, count: x.owned ? `×${x.owned}` : '', decksN: nd, isNew: x.isNew,
          title: `${x.n}${parts.length ? ' · ' + parts.join(' · ') : ''}${nd ? '\n' + [...x.deck.decks].join(', ') : ''}`, cap: `${x.n} · ${parts.join(' · ')}` }; });
  }
  const tile = it => { const t = h('button', { class: 'coll-tile ' + it.cls, type: 'button', title: it.title }, pic(it.img, it.n), it.foil ? h('i', { class: 'pk-foil' }) : null,
      it.count ? h('span', { class: 'coll-n', text: it.count }) : null, it.decksN ? h('span', { class: 'coll-dk', text: `${it.decksN} deck${it.decksN === 1 ? '' : 's'}` }) : null, it.isNew ? h('em', { class: 'coll-new', text: 'New' }) : null);
    t.addEventListener('click', () => showZoom(it.img, it.n, it.cap)); t.addEventListener('mouseenter', () => { try { showPreview({ name: it.n }); } catch (er) {} }); return t; };
  // ---- controls
  const tab = (k, lab, n) => h('button', { class: 'coll-tab' + (collSrc === k ? ' on' : ''), type: 'button', onclick: () => { collSrc = k; redraw(); } }, lab, h('em', { text: String(n) }));
  const allNames = new Set([...di.keys(), ...packCards.map(e => e.n)]);
  const chip = (cur, set, k, lab) => h('button', { class: 'coll-chip' + (cur === k ? ' on' : ''), type: 'button', onclick: () => { set(k); redraw(); } }, lab);
  const sel = (opts, cur, set, aria) => { const s = h('select', { class: 'coll-sel', 'aria-label': aria }, ...opts.map(([v, l]) => h('option', { value: v, text: l }))); s.value = opts.some(o => o[0] === cur) ? cur : 'all'; s.addEventListener('change', () => { set(s.value); redraw(); }); return s; };
  const search = h('input', { class: 'lib-search coll-search', type: 'search', placeholder: 'Search the Archive', value: collQuery, 'aria-label': 'Search the Archive' });
  const applySearch = () => { const g = document.querySelector('#hall .coll-grid'); if (!g) return; const q = collQuery.toLowerCase(); for (const t of g.children) t.hidden = !!q && !t.title.toLowerCase().includes(q); };
  search.addEventListener('input', () => { collQuery = search.value; applySearch(); }); setTimeout(applySearch, 0);
  const filters = collSrc === 'packs'
    ? [sel([['all', 'All sets'], ...[...new Map(packCards.map(e => [e.set, e.sn])).entries()].sort((a, b) => a[1].localeCompare(b[1]))], collSet, v => collSet = v, 'Set'),
       h('div', { class: 'coll-chips' }, ...[['all', 'All'], ['mythic', 'Mythic'], ['rare', 'Rare'], ['uncommon', 'Uncommon'], ['common', 'Common'], ['foil', 'Foil']].map(([k, l]) => chip(collRar, v => collRar = v, k, l)))]
    : [sel([['all', 'All decks'], ...Object.keys(loadDecks()).sort((a, b) => a.localeCompare(b)).map(n => [n, n])], collDeck, v => collDeck = v, 'Deck'),
       h('div', { class: 'coll-chips' }, chip(collType, v => collType = v, 'all', 'All'), ...COLL_TYPES.map(([k, l]) => chip(collType, v => collType = v, k, l)))];
  // looking at the Archive marks the pack cards seen (their New marks stay until you leave this page)
  setTimeout(() => { const v = collState(); const last = Math.max(0, ...Object.values(v.cards).map(e => e.last || 0)); if (last > (v.seen || 0)) { const raw = lsGet(COLL_KEY, {}) || {}; raw.seen = last; lsSet(COLL_KEY, raw); } }, 0);
  const tag = collSrc === 'packs' ? (st.unique ? `${st.total} card${st.total === 1 ? '' : 's'} from packs, ${st.unique} different${st.foils ? `, ${st.foils} foil` : ''} · ${ps.opened} pack${ps.opened === 1 ? '' : 's'} opened.` : 'Cards you open from packs are kept here.')
    : collSrc === 'decks' ? `${di.size} different cards across ${Object.keys(loadDecks()).length} deck${Object.keys(loadDecks()).length === 1 ? '' : 's'}.`
    : `${allNames.size} different cards: ${di.size} in your decks, ${new Set(packCards.map(e => e.n)).size} from packs.`;
  const empty = collSrc === 'packs' && !st.unique ? h('section', { class: 'lib-panel coll-empty' }, h('div', { class: 'lib-cap', text: 'Nothing here yet' }), h('p', { text: 'Win a game: the Victory screen offers a pack to tear open. Solving a puzzle for the first time earns one too. Every card you open lands here, with how many you have.' }))
    : !items.length ? h('div', { class: 'lib-empty-s', text: allNames.size ? 'No card matches.' : 'No cards yet: add a deck or open a pack.' }) : null;
  return [
    h('div', { class: 'lib-head' },
      h('div', { class: 'lib-head-t' }, h('div', { class: 'lib-crumb', text: 'Archive' }), h('h1', { class: 'lib-h1', text: 'The Archive' }), h('p', { class: 'lib-tag', text: tag })),
      h('div', { class: 'lib-head-go' },
        h('button', { class: 'lib-btn gold big', text: ps.bank ? `Open a pack (${ps.bank})` : 'Open a pack', title: ps.bank ? 'Tear open a pack you earned' : 'Win a game or solve a puzzle for the first time to earn a pack', onclick: () => openPackScreen() }),
        h('span', { class: 'lib-muted small', text: 'Earn packs by winning games and by solving each puzzle the first time.' }))),
    h('div', { class: 'coll-tabs', role: 'tablist' }, tab('all', 'Everything', allNames.size), tab('decks', 'In your decks', di.size), tab('packs', 'From packs', st.unique)),
    h('div', { class: 'coll-bar' }, ...filters, search),
    empty || h('div', { class: 'coll-grid' }, items.map(tile)),
    zoom];
}
