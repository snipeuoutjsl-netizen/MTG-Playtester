// ---- v0.99.88 Opening-hand lab: thousands of opening hands drawn from a deck, so a land count or a curve can be judged in seconds.
// Pure simulation (no game state): London mulligan (CR 103.5) with a simple keep rule you set, then the draws of each turn.
// A card counts as castable on a turn when it is in hand and the lands played so far (one a turn) can pay its mana cost,
// colored symbols matched to lands that make that color. Mana rocks and cost reducers are not counted (the estimate is cautious).
const HL_COLORS = ['W', 'U', 'B', 'R', 'G'];
function hlLandColors(name) {
  const i = cardInfo(name); if (!i) return [];
  const p = (i.prod && i.prod.length) ? i.prod : (typeof BASIC_PRODUCES !== 'undefined' && BASIC_PRODUCES[norm(name)]) || [];
  if (p.length) return p.filter(c => HL_COLORS.includes(c) || c === 'C');
  if (/search your library for an? .*land/i.test(i.tx || '')) return HL_COLORS.slice();   // a fetch land: treated as the colors it can find
  return ['C'];
}
function hlPips(mc) {   // colored symbols a cost needs; hybrid symbols are satisfied by either half
  const pips = []; let generic = 0;
  for (const m of String(mc || '').matchAll(/\{([^}]+)\}/g)) { const s = m[1].toUpperCase();
    if (/^\d+$/.test(s)) generic += +s; else if (s === 'X') continue; else if (HL_COLORS.includes(s)) pips.push([s]); else if (s.includes('/')) { const opts = s.split('/').filter(x => HL_COLORS.includes(x)); if (opts.length) pips.push(opts); else generic += 1; } else if (s === 'C') pips.push(['C']); else generic += 1; }
  return { pips, total: generic + pips.length };
}
// can these lands (each an array of colors) pay this cost? colored symbols first, the scarcest lands used first
function hlCanPay(lands, cost) {
  if (lands.length < cost.total) return false;
  const used = new Array(lands.length).fill(false);
  const pips = cost.pips.slice().sort((a, b) => a.length - b.length);
  for (const opts of pips) {
    let best = -1, bestN = 99;
    for (let i = 0; i < lands.length; i++) if (!used[i] && lands[i].some(c => opts.includes(c)) && lands[i].length < bestN) { best = i; bestN = lands[i].length; }
    if (best < 0) return false; used[best] = true;
  }
  return true;
}
function hlDeckCards(deck) {
  const cards = []; for (const x of deck.main) { const r = resolve(x.name), n = r ? r.name : x.name, i = cardInfo(n); for (let k = 0; k < (x.qty || 1); k++) cards.push({ name: n, land: !!(i && i.land), cmc: i ? i.cmc || 0 : 0, mc: i ? i.mc || '' : '', rock: hlRock(i) }); }
  return cards;
}
// a mana rock: an artifact (not a creature) with a plain "{T}: Add" ability, no sacrifice (Mind Stone, Signets, Arcane Signet)
function hlRock(i) {
  if (!i || i.land || !/\bArtifact\b/.test(i.t || '') || /\bCreature\b/.test(i.t || '')) return null;
  const m = /^\{T\}: Add ([^.\n]+)\./im.exec(i.tx || ''); if (!m) return null;
  const cols = [...m[1].matchAll(/\{([WUBRGC])\}/g)].map(x => x[1]); const any = /one mana of any color/i.test(m[1]);
  return any ? HL_COLORS.slice() : cols.length ? [...new Set(cols)] : ['C'];
}
function hlShuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
// one game's opening: returns { hand, library, mulls } after the London mulligan with keep range [lo, hi] lands in a 7-card hand
function hlOpen(cards, lo, hi) {
  for (let mulls = 0; mulls <= 3; mulls++) {
    const lib = hlShuffle(cards.slice()), hand = lib.splice(0, 7), lands = hand.filter(c => c.land).length;
    const keep = mulls === 3 || (mulls === 0 ? lands >= lo && lands <= hi : lands >= Math.max(1, lo - 1) && lands <= hi);
    if (!keep) continue;
    // put `mulls` cards on the bottom: extra lands above what you want, otherwise the most expensive spells
    for (let k = 0; k < mulls; k++) { const nl = hand.filter(c => c.land).length; let ix;
      if (nl > Math.ceil((lo + hi) / 2) - (mulls > 1 ? 1 : 0)) ix = hand.findIndex(c => c.land); else { ix = -1; let m = -1; hand.forEach((c, i) => { if (!c.land && c.cmc > m) { m = c.cmc; ix = i; } }); if (ix < 0) ix = 0; }
      lib.push(hand.splice(ix, 1)[0]); }
    return { hand, library: lib, mulls };
  }
}
// N games: land counts of the first 7, keep rates, land drops made, and for one card: in hand / castable by each turn
function hlRun(deck, o) {
  const cards = hlDeckCards(deck), N = o.n || 10000, T = 7, onPlay = o.onPlay !== false;
  const target = o.card || null, tCost = target ? hlPips((cardInfo(target) || {}).mc) : null;
  const res = { n: N, size: cards.length, lands: cards.filter(c => c.land).length, first7: new Array(8).fill(0), mulls: [0, 0, 0, 0], drops: new Array(T + 1).fill(0), inHand: new Array(T + 1).fill(0), castable: new Array(T + 1).fill(0), keptLands: 0 };
  for (let g = 0; g < N; g++) {
    { const lib = hlShuffle(cards.slice()); res.first7[lib.slice(0, 7).filter(c => c.land).length]++; }
    const op = hlOpen(cards, o.lo, o.hi); res.mulls[op.mulls]++; res.keptLands += op.hand.filter(c => c.land).length;
    const hand = op.hand.slice(), lib = op.library; let played = [], rocks = []; let seen = false;
    for (let t = 1; t <= T; t++) {
      if (t > 1 || !onPlay) hand.push(lib.shift());
      const li = hand.findIndex(c => c.land); if (li >= 0) played.push(hlLandColors(hand.splice(li, 1)[0].name));
      if (played.length >= t) res.drops[t]++;
      if (target) { if (!seen && hand.some(c => c.name === target)) seen = true; if (seen) { res.inHand[t]++; if (hlCanPay(played.concat(rocks), tCost)) res.castable[t]++; } }
      if (o.rocks) { const ri = hand.reduce((b, c, i) => c.rock && c.name !== target && c.cmc <= played.length + rocks.length && (b < 0 || c.cmc < hand[b].cmc) ? i : b, -1); if (ri >= 0) rocks.push(hand.splice(ri, 1)[0].rock); }   // cast the cheapest rock you can; it makes mana from next turn
    }
  }
  return res;
}
const hlPct = (a, n) => n ? Math.round(a / n * 1000) / 10 : 0;
function openHandLab(deckName0) {
  const decks = loadDecks(), names = Object.keys(decks).sort((a, b) => a.localeCompare(b)); if (!names.length) { appNotice('No decks', 'Import a deck first.'); return; }
  let deckName = deckName0 && decks[deckName0] ? deckName0 : (currentDeckName() && decks[currentDeckName()] ? currentDeckName() : names[0]);
  const m = modal('Opening-hand lab', { width: 760 });
  const deckSel = h('select', null, ...names.map(n => h('option', { value: n, text: n, selected: n === deckName })));
  const play = h('select', null, h('option', { value: 'play', text: 'On the play' }), h('option', { value: 'draw', text: 'On the draw' }));
  const lo = h('input', { type: 'number', min: 0, max: 7, value: 2, style: 'width:52px' }), hi = h('input', { type: 'number', min: 0, max: 7, value: 5, style: 'width:52px' });
  const rocksChk = h('input', { type: 'checkbox', checked: true });
  const cardSel = h('select', { style: 'min-width:0;flex:1' }); const out = h('div', { class: 'hl-out' }), sample = h('div', { class: 'hl-sample' });
  const fillCards = () => { const d = getDeckByName(deckName); const nonland = [...new Set(hlDeckCards(d).filter(c => !c.land).map(c => c.name))].sort((a, b) => ((cardInfo(a) || {}).cmc || 0) - ((cardInfo(b) || {}).cmc || 0) || a.localeCompare(b));
    cardSel.replaceChildren(h('option', { value: '', text: '(no card: lands and mulligans only)' }), ...nonland.map(n => h('option', { value: n, text: `${n} ${(cardInfo(n) || {}).mc || ''}` }))); };
  const bar = (label, v, tip) => h('div', { class: 'hl-bar', title: tip || '' }, h('span', { class: 'hl-bl', text: label }), h('span', { class: 'hl-bt' }, h('i', { style: `width:${Math.min(100, v)}%` })), h('b', { text: v + '%' }));
  const run = () => {
    const d = getDeckByName(deckName); if (!d || !d.main.length) { out.replaceChildren(h('div', { class: 'muted', text: 'This deck has no cards.' })); return; }
    out.replaceChildren(h('div', { class: 'muted', text: 'Drawing 10,000 opening hands…' }));
    setTimeout(() => {
      const r = hlRun(d, { n: 10000, onPlay: play.value === 'play', lo: +lo.value || 0, hi: +hi.value || 7, card: cardSel.value || null, rocks: rocksChk.checked }), n = r.n;
      const kept = hlPct(r.mulls[0], n), avg = (r.keptLands / n).toFixed(2);
      const parts = [
        h('div', { class: 'hl-head', text: `${d.name}: ${r.size} cards, ${r.lands} lands (${hlPct(r.lands, r.size)}%) · ${play.value === 'play' ? 'on the play' : 'on the draw'}` }),
        h('div', { class: 'hl-cols' },
          h('div', null, h('div', { class: 'fhead', text: 'Lands in the first seven' }), ...r.first7.map((v, k) => bar(`${k} land${k === 1 ? '' : 's'}`, hlPct(v, n)))),
          h('div', null, h('div', { class: 'fhead', text: 'Mulligans (London)' }),
            bar('Keep 7', kept, `Keep a 7 with ${lo.value}–${hi.value} lands`), bar('Keep 6', hlPct(r.mulls[1], n)), bar('Keep 5', hlPct(r.mulls[2], n)), bar('Down to 4', hlPct(r.mulls[3], n)),
            h('div', { class: 'small muted', text: `Kept hands hold ${avg} lands on average.` }),
            h('div', { class: 'fhead', style: 'margin-top:10px', text: 'Land drop made every turn' }), ...[1, 2, 3, 4, 5].map(t => bar(`Turn ${t}`, hlPct(r.drops[t], n), `A land to play on every turn up to turn ${t}`)))) ];
      if (cardSel.value) { const i = cardInfo(cardSel.value) || {};
        parts.push(h('div', { class: 'fhead', style: 'margin-top:12px', text: `${cardSel.value} ${i.mc || ''}` }),
          h('div', { class: 'hl-turns' }, h('div', { class: 'hl-tr hl-th' }, h('span', { text: 'Turn' }), h('span', { text: 'In hand' }), h('span', { text: 'Castable' })),
            ...[1, 2, 3, 4, 5, 6, 7].map(t => h('div', { class: 'hl-tr' + (t === Math.max(1, i.cmc || 0) ? ' curve' : '') }, h('span', { text: String(t) + (t === Math.max(1, i.cmc || 0) ? ' (on curve)' : '') }), h('span', { text: hlPct(r.inHand[t], n) + '%' }), h('span', { text: hlPct(r.castable[t], n) + '%' })))),
          h('div', { class: 'small muted', text: `Castable: in hand and the lands played so far (one a turn)${rocksChk.checked ? ', plus mana rocks cast on earlier turns,' : ''} make its colors. Cost reductions and alternative costs are not counted.` }));
      }
      out.replaceChildren(...parts);
    }, 20);
  };
  const drawSample = () => { const d = getDeckByName(deckName); if (!d) return; const op = hlOpen(hlDeckCards(d), +lo.value || 0, +hi.value || 7);
    sample.replaceChildren(h('div', { class: 'small muted', text: op.mulls ? `Mulliganed to ${7 - op.mulls}.` : 'Kept seven.' }), h('div', { class: 'hl-hand' }, ...op.hand.map(c => { const im = (() => { try { return imgFor(c.name, deckName); } catch (e) { return null; } })(); return im ? h('img', { src: im.front, alt: c.name, title: c.name }) : h('div', { class: 'hl-txtcard', text: c.name }); }))); };
  deckSel.onchange = () => { deckName = deckSel.value; fillCards(); out.replaceChildren(); sample.replaceChildren(); };
  m.body.append(h('p', { class: 'small muted', text: 'Draws thousands of opening hands from a deck and plays out the land drops, so you can see how often a hand is keepable and when a card can be cast.' }),
    h('div', { class: 'hl-ctrl' }, deckSel, play, h('label', { class: 'small' }, 'Keep 7 with ', lo, ' to ', hi, ' lands')),
    h('div', { class: 'hl-ctrl' }, h('span', { class: 'small', text: 'Check a card:' }), cardSel, h('label', { class: 'small', title: 'Artifacts with a plain {T}: Add ability (Mind Stone, Signets) are cast when you can and make mana from the next turn' }, rocksChk, ' count mana rocks')), out, sample);
  m.foot.append(h('button', { text: 'Sample hand', onclick: drawSample }), h('button', { class: 'primary', text: 'Draw 10,000 hands', onclick: run }), h('button', { text: 'Close', onclick: () => m.close() }));
  fillCards(); run();
}
function getDeckByName(n) { const all = loadDecks(); if (!all[n]) return null; const sb = all[n].sb; if (sb && Array.isArray(sb.main) && sb.main.length) return { name: n, main: sb.main.map(x => ({ ...x })), side: [] }; return { name: n, ...parseDeck(all[n].text) }; }
