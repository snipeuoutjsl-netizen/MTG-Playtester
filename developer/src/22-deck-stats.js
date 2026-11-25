// ---------------------------------------------------------------- deck stats (exact hypergeometric math)
function comb(n, k) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let r = 1;
  for (let i = 1; i <= k; i++) r = r * (n - k + i) / i;
  return r;
}
const pmf = (N, K, n, k) => comb(K, k) * comb(N - K, n - k) / comb(N, n);
function atLeast(N, K, n, t) {
  if (n > N) n = N;
  let s = 0;
  for (let k = t; k <= Math.min(K, n); k++) s += pmf(N, K, n, k);
  return Math.min(1, s);
}
const pct = x => (x * 100).toFixed(1) + '%';

function openStats() {
  const deck = getCurrentDeck();
  if (!deck || !deck.main.length) { appNotice('No deck', 'Import a deck first.'); return; }
  const m = modal(`Deck view: ${deck.name}`, { width: 1240 });
  m.el.classList.add('deckview');
  const N = sum(deck.main);
  const COLS = { W: '#f3ecc3', U: '#9ec8ee', B: '#9a8f99', R: '#ec8f78', G: '#8cc79a' };
  const toCard = ({ qty, name }) => {
    const rec = resolve(name);
    const front = rec && rec.t ? rec.t.split(' // ')[0] : '';
    const isLand = rec ? !!rec.land : BASIC_LANDS.has(norm(name));
    let type = 'Unknown';
    if (isLand) type = 'Land';
    else if (rec) type = ['Creature', 'Planeswalker', 'Battle', 'Instant', 'Sorcery', 'Artifact', 'Enchantment'].find(x => front.includes(x)) || 'Other';
    return { qty, name: rec ? rec.name : name, rec, isLand, type, mv: rec ? rec.cmc : 0 };
  };
  const cards = deck.main.map(toCard), side = (deck.side || []).map(toCard);
  const L = sum(cards.filter(c => c.isLand)), unknown = sum(cards.filter(c => !c.rec));
  const spells = cards.filter(c => !c.isLand && c.rec), spellN = sum(spells);
  const avgMv = spellN ? spells.reduce((a, c) => a + c.mv * c.qty, 0) / spellN : 0;
  const body = m.body;
  if (unknown) body.append(h('p', { class: 'bad small', text: `${unknown} card${unknown === 1 ? '' : 's'} have no card data, so types and costs for them are unknown. Use Tools → Images… or Card data… to fill them in.` }));

  // ---- header: name, counts, colours, curve
  const typeCounts = {}; for (const c of cards) typeCounts[c.type] = (typeCounts[c.type] || 0) + c.qty;
  const pips = { W: 0, U: 0, B: 0, R: 0, G: 0 }, prodSrc = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  for (const c of spells) for (const mm of (c.rec.mc || '').matchAll(/\{([^}]+)\}/g)) for (const ch of mm[1].split('/')) if (ch in pips) pips[ch] += c.qty;
  for (const c of cards) if (c.isLand) for (const col of landManaColors({ name: c.name })) if (col in prodSrc) prodSrc[col] += c.qty;
  const curve = new Array(8).fill(0);
  for (const c of spells) curve[Math.min(7, Math.floor(c.mv))] += c.qty;
  const mx = Math.max(1, ...curve);
  const chip = (txt, cls, tip) => h('span', { class: 'dv-chip ' + (cls || ''), text: txt, title: tip || '' });
  const colourRow = h('div', { class: 'dv-row' }, ...Object.keys(pips).filter(k => pips[k] || prodSrc[k]).map(k => h('span', { class: 'dv-col', style: `background:${COLS[k]}` }, h('b', { text: k }), h('span', { text: ` ${pips[k]} symbols · ${prodSrc[k]} sources` }))));
  const typeRow = h('div', { class: 'dv-row' }, ...['Land', 'Creature', 'Planeswalker', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Battle', 'Other', 'Unknown'].filter(t => typeCounts[t]).map(t => chip(`${t} ${typeCounts[t]}`, t === 'Land' ? 'land' : '')));
  const curveEl = h('div', { class: 'dv-curve', title: 'Mana value of spells (lands excluded)' },
    ...curve.map((n, i) => h('div', { class: 'dv-bar' }, h('span', { class: 'dv-n', text: n || '' }), h('div', { class: 'dv-fill', style: `height:${Math.round(n / mx * 70)}px` }), h('span', { class: 'dv-x', text: i === 7 ? '7+' : String(i) }))));
  body.append(h('div', { class: 'dv-head' },
    h('div', { class: 'dv-title' }, h('div', { class: 'dv-name', text: deck.name }), h('div', { class: 'muted', text: `${N} main · ${sum(side)} sideboard · ${L} lands (${pct(L / N)}) · ${N - L} spells · average spell mana value ${avgMv.toFixed(2)}` }), colourRow, typeRow),
    curveEl));

  // ---- stacks
  const big = h('div', { class: 'dv-big' });
  const showBig = c => { const im = imgFor(c.name); big.replaceChildren(im ? h('img', { src: im.front, alt: c.name }) : h('div', { class: 'dv-bigtxt' }, h('b', { text: c.name }), h('div', { text: (c.rec && c.rec.mc) || '' }), h('div', { class: 'muted', text: (c.rec && c.rec.t) || '' }), h('div', { class: 'small', text: (c.rec && c.rec.tx) || 'No card data' }))); };
  const face = c => {
    const im = showImages ? imgFor(c.name) : null;
    const f = h('div', { class: 'dv-card' + (im ? ' hasimg' : '') });
    if (im) { const img = h('img', { src: im.front, alt: c.name, draggable: 'false' }); img.addEventListener('error', () => { img.remove(); f.classList.remove('hasimg'); f.append(h('span', { class: 'dv-fn', text: c.name })); }); f.append(img); }
    else f.append(h('span', { class: 'dv-fn', text: c.name }), h('span', { class: 'dv-fc', text: (c.rec && c.rec.mc) || '' }), h('span', { class: 'dv-ft', text: (c.rec && c.rec.t) || '' }));
    return f;
  };
  const stack = c => {
    const el = h('div', { class: 'dv-stack', title: `${c.qty} × ${c.name}` });
    for (let i = 0; i < c.qty; i++) { const f = face(c); f.style.top = (i * 22) + 'px'; f.style.zIndex = i + 1; el.append(f); }
    el.style.height = (22 * (c.qty - 1) + 190) + 'px';
    el.append(h('span', { class: 'dv-qty', text: '×' + c.qty }));
    el.addEventListener('mouseenter', () => showBig(c));
    return el;
  };
  const groupDefs = [['Creatures', ['Creature']], ['Planeswalkers & Battles', ['Planeswalker', 'Battle']], ['Instants & Sorceries', ['Instant', 'Sorcery']], ['Artifacts', ['Artifact']], ['Enchantments', ['Enchantment']], ['Other / unknown', ['Other', 'Unknown']], ['Lands', ['Land']]];
  const groupEl = (title, list) => {
    const n = sum(list); if (!n) return null;
    const sorted = [...list].sort((a, b) => a.mv - b.mv || a.name.localeCompare(b.name));
    return h('div', { class: 'dv-group' }, h('div', { class: 'dv-gh', text: `${title} (${n})` }), h('div', { class: 'dv-stacks' }, ...sorted.map(stack)));
  };
  const mainEl = h('div', { class: 'dv-main' }, ...groupDefs.map(([t, types]) => groupEl(t, cards.filter(c => types.includes(c.type)))).filter(Boolean), side.length ? Object.assign(groupEl('Sideboard', side), { className: 'dv-group dv-sidegroup' }) : null);
  const sideEl = side.length ? h('div', { class: 'dv-side' }, h('div', { class: 'dv-gh', text: `Sideboard (${sum(side)})` }), h('div', { class: 'dv-stacks' }, ...[...side].sort((a, b) => a.mv - b.mv || a.name.localeCompare(b.name)).map(stack))) : null;
  body.append(h('div', { class: 'dv-layout' }, h('div', { class: 'dv-left' }, mainEl), big));
  big.append(h('div', { class: 'muted small', text: 'Hover a stack to read the card.' }));

  // ---- odds (collapsed)
  const odds = h('details', { class: 'dv-odds' }, h('summary', { text: 'Draw odds and land counts' }));
  const box = h('div', { class: 'stats' });
  odds.append(box); body.append(odds);
  (function () {
    const body = box;
    const cardsAll = cards;
    const cardsRef = cardsAll;
    const cards2 = cardsRef;
    void cards2;
  // Opening hand land distribution
  const minIn = h('input', { type: 'number', value: 2, min: 0, max: 7 });
  const maxIn = h('input', { type: 'number', value: 5, min: 0, max: 7 });
  const distBox = h('div');
  const keepLine = h('p');
  function drawDist() {
    const lo = parseInt(minIn.value, 10), hi = parseInt(maxIn.value, 10);
    distBox.replaceChildren();
    const rows = [h('tr', null, h('th', { text: 'Lands in opening 7' }), h('th', { text: 'Chance' }), h('th', { text: '' }))];
    let keep = 0;
    for (let k = 0; k <= 7; k++) {
      const p = pmf(N, L, 7, k);
      if (k >= lo && k <= hi) keep += p;
      rows.push(h('tr', null, h('td', { text: String(k) }), h('td', { text: pct(p) }), h('td', null, h('span', { class: 'bar', style: `width:${Math.round(p * 300)}px` }))));
    }
    distBox.append(h('table', { class: 'stats' }, rows));
    keepLine.replaceChildren(`Keepable 7-card hand (${lo}–${hi} lands): `, h('b', { text: pct(keep) }));
  }
  minIn.addEventListener('input', drawDist); maxIn.addEventListener('input', drawDist);
  body.append(h('h4', { text: 'Opening hand' }), h('div', null, 'Keep with ', minIn, ' to ', maxIn, ' lands'), keepLine, distBox);
  drawDist();

  // Land drops
  const ld = [h('tr', null, h('th', { text: 'Turn' }), h('th', { text: 'On the play' }), h('th', { text: 'On the draw' }))];
  for (let t = 1; t <= 7; t++) {
    ld.push(h('tr', null, h('td', { text: `T${t}: ≥ ${t} lands` }), h('td', { text: pct(atLeast(N, L, 7 + t - 1, t)) }), h('td', { text: pct(atLeast(N, L, 7 + t, t)) })));
  }
  body.append(h('h4', { text: 'Hitting land drops (no mulligans)' }), h('table', { class: 'stats' }, ld));

  // Find a card
  const q = h('input', { type: 'text', placeholder: 'e.g. Scion of Draco, Leyline of the Guildpact', style: 'width:100%' });
  const findBox = h('div');
  function drawFind() {
    findBox.replaceChildren();
    const want = q.value.split(',').map(s => norm(s)).filter(Boolean);
    if (!want.length) return;
    let K = 0; const matched = [];
    for (const c of cards) {
      if (want.includes(norm(c.name)) || (c.rec && c.rec.faces && c.rec.faces.some(f => want.includes(norm(f))))) { K += c.qty; matched.push(`${c.qty} ${c.name}`); }
    }
    if (!K) { findBox.append(h('p', { class: 'bad', text: 'None of those names are in your main deck.' })); return; }
    const rows = [h('tr', null, h('th', { text: 'By turn' }), h('th', { text: 'On the play' }), h('th', { text: 'On the draw' }))];
    rows.push(h('tr', null, h('td', { text: 'Opening hand' }), h('td', { text: pct(atLeast(N, K, 7, 1)) }), h('td', { text: pct(atLeast(N, K, 7, 1)) })));
    for (let t = 1; t <= 8; t++) {
      rows.push(h('tr', null, h('td', { text: `Turn ${t}` }), h('td', { text: pct(atLeast(N, K, 7 + t - 1, 1)) }), h('td', { text: pct(atLeast(N, K, 7 + t, 1)) })));
    }
    findBox.append(h('p', { class: 'muted small', text: 'Counting: ' + matched.join(', ') + ` (${K} copies). Chance of seeing at least one.` }), h('table', { class: 'stats' }, rows));
  }
  q.addEventListener('input', drawFind);
  body.append(h('h4', { text: 'Find a card' }), q, findBox);


  // Mana sources
  const src = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  for (const c of cards) if (c.isLand && c.rec && c.rec.prod) for (const col of c.rec.prod) if (col in src) src[col] += c.qty;
  if (Object.values(src).some(Boolean)) {
    body.append(h('h4', { text: 'Land mana sources' }),
      h('p', { class: 'muted small', text: 'Counts lands that list the colour as produced mana. Fetchlands produce no mana, so they are not counted.' }),
      h('table', { class: 'stats' }, h('tr', null, ...Object.keys(src).map(k => h('th', { text: k }))), h('tr', null, ...Object.values(src).map(v => h('td', { text: String(v) })))));
  }

  })();
  m.foot.append(h('button', { text: 'Card art & printings…', title: 'Choose a printing (alternate art) for any card, or your own picture', onclick: () => { m.close(); openCustomArt(deck.name, () => openStats()); } }),
    h('button', { text: 'Buy this deck…', title: 'Open TCGplayer with this list (and your chosen printings) ready to add to the cart', onclick: () => openBuyDeck(deck) }),
    h('button', { class: 'primary', text: 'Close', onclick: () => m.close() }));   // v0.99.37
}

