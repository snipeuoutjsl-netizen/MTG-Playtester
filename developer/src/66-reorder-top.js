// v0.99.1 "Look at the top N cards of your library, then put them back in any order. You may shuffle. Draw a card." (CR 401.4, 701.20). Read by the rules text:
// a look-and-reorder sentence, an optional "You may shuffle" sentence, and whatever else the effect says afterwards (read by the usual effect reader).
const REORDER_RE = /^look at the top (a|one|two|three|four|five|six|seven|\d+) cards? of your library(?:,? then|\.|, and|;)?\s*(?:then )?put (?:them|those cards|it|that card) back (?:on top of your library )?in any order\.?$/i;
function openReorderTop(n, src, mayShuffle, onDone) {
  if (!state) return; const k = Math.min(n, state.library.length);
  if (!k) { log(`${src}: your library is empty, so there is nothing to look at`); if (onDone) onDone(); return; }
  const cards = state.library.slice(0, k), order = cards.map((c, i) => i); let shuf = false;
  const m = modal(`${src}: look at the top ${k === 1 ? 'card' : k + ' cards'}`, { width: 520, sticky: true, noClose: true });
  const confirm = h('button', { class: 'primary', text: 'Put them back' });
  function draw() {
    m.body.replaceChildren(h('div', { class: 'psub', text: 'Put them back in any order. The first card in the list will be on top.' }));
    order.forEach((ci, pos) => {
      const c = cards[ci], info = cardInfo(c.name);
      const row = h('div', { class: 'row' }, h('span', { class: 'muted small', text: pos === 0 ? 'Top' : String(pos + 1) }), h('span', { class: 'nm' }, c.name, ' ', info && info.mc ? symbols(info.mc) : ''), h('span', { class: 'muted small', text: info ? info.t.split(' // ')[0] : '' }),
        h('button', { text: '▲', disabled: pos === 0 || shuf, onclick: () => { [order[pos - 1], order[pos]] = [order[pos], order[pos - 1]]; draw(); } }),
        h('button', { text: '▼', disabled: pos === order.length - 1 || shuf, onclick: () => { [order[pos + 1], order[pos]] = [order[pos], order[pos + 1]]; draw(); } }));
      row.addEventListener('mouseenter', () => showPreview(c)); m.body.append(row);
    });
    if (mayShuffle) { const cb = h('input', { type: 'checkbox', checked: shuf, onchange: e => { shuf = e.target.checked; draw(); } }); m.body.append(h('label', { class: 'chk' }, cb, ' Then shuffle your library (the order above no longer matters)')); }
  }
  confirm.addEventListener('click', () => {
    snap(); state.library.splice(0, k, ...order.map(i => cards[i]));
    if (shuf) { shuffleLib(); log(`${src}: looked at the top ${k}, put them back, then shuffled`); } else log(`${src}: looked at the top ${k} and put them back in the order: ${order.map(i => cards[i].name).join(', ')}`);
    m.close(); render(); if (onDone) onDone();
  });
  m.foot.append(confirm); draw(); showPreview(cards[0]);
}
function lookReorderOptions(tx, obj) {
  if (!state) return null;
  const clean = String(tx || '').replace(/’/g, "'").replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim(), sents = clean.split(/(?<=[.!?])\s+/).map(x => x.trim()).filter(Boolean); if (!sents.length) return null;
  let i = 0, n = null;
  const a = REORDER_RE.exec(sents[0]); if (a) { n = numOf(a[1]); i = 1; }
  else { const b = /^look at the top (a|one|two|three|four|five|six|seven|\d+) cards? of your library\.?$/i.exec(sents[0]); if (b && sents[1] && /^put (?:them|those cards|it|that card) back (?:on top of your library )?in any order\.?$/i.test(sents[1])) { n = numOf(b[1]); i = 2; } }
  if (n === null) return null;
  let mayShuffle = false; if (sents[i] && /^you may shuffle(?: your library)?\.?$/i.test(sents[i])) { mayShuffle = true; i++; }
  const rest = sents.slice(i).join(' '), src = (obj && obj.sourceName) || 'Ability';
  const restOpts = rest ? effectOptionsBase(rest, obj).filter(o => typeof o.fn === 'function' && !o.hidden) : [];
  return [{ full: true, label: `Look at the top ${n === 1 ? 'card' : n + ' cards'}, put them back in any order${mayShuffle ? ', you may shuffle' : ''}${rest ? ', then ' + (restOpts[0] ? restOpts[0].label.toLowerCase() : rest) : ''}`, fn: () => openReorderTop(n, src, mayShuffle, () => { for (const o of restOpts.slice(0, 1)) o.fn(); }) }];
}
