// ---------------------------------------------------------------- replacement effects (v0.64)
// A replacement effect (rule 614) changes HOW an event happens instead of adding a new one. They are applied as the event happens:
//  - counters: "that many plus one" (Hardened Scales, Winding Constrictor) and "twice that many" (Doubling Season, for effects)
//  - "If ~ would enter the battlefield, you may discard a land card instead" (Mox Diamond)
//  - "As ~ enters the battlefield, choose a ..." (Cavern of Souls, Phyrexian Revoker, Pithing Needle)
//  - "If you would draw a card, you may instead ..." (dredge)
// v0.92.0 Replacement-effect engine (rules 614, 616). Each applicable effect is a small step { src, label, f }. When more than one applies to the
// same event, the affected player chooses the order (616.1); every effect applies once (614.5). If the order cannot change the result nothing is asked.
// The app applies the order that gives the most counters, remembers your choice for that set of cards, and offers the other order right away.
function replPerms(a) { if (a.length <= 1) return [a.slice()]; const out = []; a.forEach((x, i) => replPerms(a.filter((_, j) => j !== i)).forEach(p => out.push([x, ...p]))); return out; }
function replRun(order, n) { let v = n; for (const e of order) v = e.f(v); return v; }
function applyReplacements(effects, n, host, kindKey, kindTxt) {
  if (!effects.length) return { value: n, order: [] };
  const perms = replPerms(effects), results = perms.map(p => replRun(p, n)), same = results.every(r => r === results[0]);
  let pick = 0;
  const key = effects.map(e => e.src.name).sort().join('|'); state.replPref = state.replPref || {};
  if (!same) {
    const pref = state.replPref[key];
    const pi = pref ? perms.findIndex(p => p.map(e => e.src.name).join('|') === pref) : -1;
    pick = pi >= 0 ? pi : results.indexOf(Math.max(...results));
  }
  const order = perms[pick], value = results[pick];
  if (!same && host) replOfferOther(host, kindKey, kindTxt, n, perms, results, pick, key);
  return { value, order };
}
function replOfferOther(host, kindKey, kindTxt, n, perms, results, pick, key) {
  if (state.replPref && state.replPref[key] && !state.replAsk) return;   // you already chose for this set of cards
  const names = p => p.map(e => `${e.src.name} (${e.label})`).join(' then ');
  const m = modal('Order of replacement effects (rule 616.1)', { width: 480, dock: true, noClose: true });
  m.body.append(h('div', { class: 'psub', text: `${n} ${kindTxt} counter${n === 1 ? '' : 's'} would be put on ${host.name}. Two or more replacement effects apply and the order changes the result. You choose the order.` }));
  perms.forEach((p, i) => { if (results.findIndex((r, j) => r === results[i] && perms[j].map(e => e.src.name).join('|') === p.map(e => e.src.name).join('|')) !== i) return;
    m.body.append(h('div', { class: 'pbtns' }, h('button', { class: i === pick ? 'primary' : '', text: `${names(p)} → ${results[i]}${i === pick ? '  (applied)' : ''}`, onclick: () => {
      const delta = results[i] - results[pick]; if (delta && host.counters && typeof host.counters === 'object') host.counters[kindKey] = Math.max(0, (host.counters[kindKey] || 0) + delta);
      state.replPref = state.replPref || {}; state.replPref[key] = p.map(e => e.src.name).join('|'); pick = i;
      log(`Replacement effects: you chose ${names(p)} (${results[i]} ${kindTxt} counters on ${host.name})`); m.close(); render(); } })));
  });
  m.foot.append(h('button', { text: 'Keep as applied', onclick: () => { state.replPref = state.replPref || {}; state.replPref[key] = perms[pick].map(e => e.src.name).join('|'); m.close(); } }));
}
function adjustCounterAdd(host, kindKey, n, viaEffect) {
  if (!state || !host || n <= 0) return n;
  const kindTxt = kindKey === 'plus' ? '+1/+1' : kindKey === 'minus' ? '-1/-1' : String(kindKey).toLowerCase();
  const types = permTypeInfo(host).types; const effects = [];
  for (const g of state.battlefield) {
    if (g.token) continue; const tx = (cardText(g) || '').replace(/\u2212/g, '-');
    if (!/counters? would be put on/i.test(tx) && !/would put one or more counters/i.test(tx)) continue;
    for (const ln of tx.split('\n')) {
      let m;
      if ((m = ln.match(/^If one or more ([+\-0-9\/]+|[a-z]+) counters would be put on an? ([a-z]+)(?: or ([a-z]+))? you control, that many plus (one|two|\d+)[^.]*instead\.?$/i))) {
        if (m[1].toLowerCase() !== kindTxt) continue;
        if (!(types.has(m[2].toLowerCase()) || (m[3] && types.has(m[3].toLowerCase())))) continue;
        const add = wordN(m[4]); effects.push({ src: g, label: `+${add}`, f: v => v + add });
      } else if ((m = ln.match(/^If one or more counters would be put on an? ([a-z]+) or ([a-z]+) you control, that many plus one of each of those kinds of counters are put on it instead/i))) {
        if (!(types.has(m[1].toLowerCase()) || types.has(m[2].toLowerCase()))) continue;
        effects.push({ src: g, label: '+1', f: v => v + 1 });
      } else if (viaEffect && (m = ln.match(/^If an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead/i))) {
        effects.push({ src: g, label: '\u00d72', f: v => v * 2 });
      }
    }
  }
  const r = applyReplacements(effects, n, host, kindKey, kindTxt), out = r.value;
  if (effects.length && teach('replaceNotes')) log(`Replacement effect${effects.length > 1 ? 's' : ''} (rule 614): ${n} ${kindTxt} counter${n === 1 ? '' : 's'} would be put on ${host.name}; ${r.order.map(e => `${e.src.name}: ${e.label}`).join(', then ')} \u2192 ${out}`);
  return out;
}
// Mox Diamond: "If ~ would enter the battlefield, you may discard a land card instead. If you do, put ~ onto the battlefield. If you don't, put it into its owner's graveyard."
function openDiscardInstead(cardId, what) {
  const f = findCard(cardId); if (!f || f.zone !== 'battlefield') return; const c = f.card;
  const opts = state.hand.filter(x => descMatchesCard(what, x.name));
  const done = () => { render(); if (state.pendingTriggers.length) resolvePendingTrigger(); };
  const toGy = () => { snap(); log(`${c.name}: you did not discard, so it is put into the graveyard instead of entering`); leaveBattlefield(c, 'graveyard'); done(); };
  if (!opts.length) { toast(`${c.name}`, `You have no ${what} card to discard, so it is put into the graveyard instead of entering the battlefield.`); toGy(); return; }
  const m = modal(`${c.name}: discard a ${what} card?`, { width: 520, sticky: true, noClose: true });
  m.body.append(h('div', { class: 'psub', text: `If ${c.name} would enter the battlefield, you may discard a ${what} card instead. If you do, it enters; if you don’t, it goes to the graveyard (rule 614.1).` }));
  for (const x of opts) m.body.append(h('div', { class: 'row' }, h('span', { class: 'nm', text: x.name }), h('button', { class: 'primary', text: 'Discard it', onclick: () => { m.close(); snap(); const i = state.hand.findIndex(y => y.id === x.id); if (i >= 0) { const [d] = state.hand.splice(i, 1); gyPush(d, 'hand'); } log(`${c.name}: discarded ${x.name} so it can enter the battlefield`); done(); } })));
  m.foot.append(h('button', { text: 'Don’t discard: put it in the graveyard', onclick: () => { m.close(); toGy(); } }));
}
// "As ~ enters the battlefield, choose a creature type / nonland card name / color ..." The choice is stored on the permanent (c.chosen).
let _typePool = null, _namePool = null;
function choicePool(kind) {
  if (/color/.test(kind)) return ['White', 'Blue', 'Black', 'Red', 'Green'];
  if (/basic land type/.test(kind)) return ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'];
  if (/creature type/.test(kind)) { if (!_typePool) { const st = new Set(); for (const v of CARDS.values()) { if (!v || !/\bCreature\b/.test((v.t || '').split(' // ')[0])) continue; const sub = ((v.t || '').split(' // ')[0].split('—')[1] || '').trim(); for (const w of sub.split(/\s+/)) if (w) st.add(w); } _typePool = [...st].sort(); } return _typePool; }
  if (!_namePool) { const nm = new Set(); for (const v of CARDS.values()) if (v && v.name) nm.add(v.name); _namePool = [...nm].sort(); }
  return /nonland/.test(kind) ? _namePool.filter(n => !isLandName(n)) : _namePool;
}
function openChoose(cardId, kind) {
  const f = findCard(cardId); if (!f || f.zone !== 'battlefield') return; const c = f.card;
  const m = modal(`${c.name}: choose a ${kind}`, { width: 560, sticky: true, noClose: true });
  m.body.append(h('div', { class: 'psub', text: `As ${c.name} enters the battlefield you choose a ${kind}. The choice is remembered on the card.` }));
  const pool = choicePool(kind), fixed = pool.length <= 8, isType = /creature type/.test(kind);
  const done = v => { m.close(); snap(); c.chosen = v; log(`${c.name}: chose ${v}`); render(); if (state.pendingTriggers.length) resolvePendingTrigger(); };
  const inPlay = [], inDeck = [], seen = new Set();   // creature types: first the ones on the battlefield, then the ones in your deck, then anything typed
  const subsOf = t => (String(t || '').split(' // ')[0].split('\u2014')[1] || '').trim().split(/\s+/).filter(Boolean);
  if (isType) {
    const poolLc = new Map(pool.map(x => [x.toLowerCase(), x]));
    for (const p of state.battlefield) for (const w of permTypeInfo(p).subs) { const nm = poolLc.get(w) || (w === '*' ? null : w[0].toUpperCase() + w.slice(1)); if (nm && poolLc.has(nm.toLowerCase()) && !seen.has(nm)) { seen.add(nm); inPlay.push(nm); } }
    for (const z of ['library', 'hand', 'graveyard', 'exile']) for (const p of state[z]) { const info = cardInfo(p.name); if (!info || !/\bCreature\b|\bKindred\b|\bTribal\b/.test((info.t || '').split(' // ')[0])) continue; for (const w of subsOf(info.t)) if (poolLc.has(w.toLowerCase()) && !seen.has(poolLc.get(w.toLowerCase()))) { const nm = poolLc.get(w.toLowerCase()); seen.add(nm); inDeck.push(nm); } }
    inPlay.sort(); inDeck.sort();
  }
  if (fixed) { const row = h('div', { class: 'mana-choice' }); for (const v of pool) row.append(h('button', { class: 'mana-choice-btn', text: v, onclick: () => done(v) })); m.body.append(row); }
  else {
    const inp = h('input', { type: 'text', placeholder: `Type a ${kind}…`, style: 'width:100%;margin:6px 0', 'aria-label': `Type a ${kind}` }), list = h('div', { class: 'fetchgrid' }), msg = h('div', { class: 'muted small', text: '' });
    const grp = (title, arr) => { if (!arr.length) return; m.body.append(h('div', { class: 'psub', style: 'margin-top:8px', text: title })); const row = h('div', { class: 'mana-choice' }); for (const v of arr.slice(0, 24)) row.append(h('button', { class: 'mana-choice-btn', text: v, onclick: () => done(v) })); m.body.append(row); };
    if (isType) { grp('On the battlefield', inPlay); grp('In your deck', inDeck.filter(x => !inPlay.includes(x))); }
    const draw = () => { list.replaceChildren(); const q = inp.value.trim().toLowerCase(); if (isType && !q) { list.append(h('div', { class: 'muted', text: 'Not listed above? Type any creature type.' })); return; } const hits = pool.filter(n => !q || n.toLowerCase().includes(q)).sort((x, y) => (x.toLowerCase().startsWith(q) ? 0 : 1) - (y.toLowerCase().startsWith(q) ? 0 : 1)).slice(0, 14); for (const n of hits) list.append(h('div', { class: 'frow on', onclick: () => done(n) }, h('span', { class: 'nm', text: n }))); if (!hits.length) list.append(h('div', { class: 'muted', text: isType ? 'No creature type like that. Check the spelling.' : 'No match. Press Enter to use exactly what you typed.' })); };
    inp.addEventListener('input', draw);
    inp.addEventListener('keydown', e => { if (e.key !== 'Enter' || !inp.value.trim()) return; const q = inp.value.trim().toLowerCase(); if (!isType) { done(inp.value.trim()); return; }
      const ex = pool.find(n => n.toLowerCase() === q) || pool.find(n => singularWord(n) === singularWord(q)) || pool.filter(n => n.toLowerCase().startsWith(q))[0];   // CR 205.3m: only real creature types are legal choices
      if (ex) done(ex); else msg.textContent = `"${inp.value.trim()}" is not a creature type.`; });
    draw(); m.body.append(inp, msg, list); setTimeout(() => inp.focus(), 50);
  }
}
// Phyrexian Revoker / Pithing Needle: activated abilities of sources with the chosen name can't be activated (Needle: unless they are mana abilities).
function abilityLockedBy(card, isMana) {
  if (!state || !card) return null;
  for (const g of state.battlefield) {
    if (!g.chosen) continue; const tx = (cardText(g) || '').replace(/’/g, "'");
    const m = tx.match(/activated abilities of sources with the chosen name can't be activated( unless they're mana abilities)?/i);
    if (m && norm(g.chosen) === norm(card.name) && !(m[1] && isMana)) return g;
  }
  return null;
}
// Dredge N (rule 702.52): "If you would draw a card, you may instead mill N cards and return this card from your graveyard to your hand."
function dredgeOptions() {
  if (!state) return [];
  const out = [];
  for (const c of state.graveyard) { const m = (cardText(c) || '').match(/\bDredge (\d+)/i); if (m && state.library.length >= +m[1]) out.push({ card: c, n: +m[1] }); }
  return out;
}
const drawNoDredge = n => { state.inDredge = true; try { return drawCards(n); } finally { state.inDredge = false; } };
function askDredge(n, after) {
  const opts = teach('dredgePrompts') ? dredgeOptions() : [];
  if (n <= 0) { if (after) after(); return; }
  if (!opts.length) { const d = drawNoDredge(n); log(`Drew ${d}`); render(); if (after) after(); return; }
  const m = modal(`Draw ${n > 1 ? '(' + n + ' left)' : 'a card'}: dredge instead?`, { width: 560, sticky: true, noClose: true });
  m.body.append(h('div', { class: 'psub', text: 'If you would draw a card, you may instead mill that many cards and return the dredge card from your graveyard to your hand (rule 702.52). It replaces the draw, so “whenever you draw” abilities do not trigger. You need at least that many cards in your library.' }));
  const next = () => { m.close(); render(); askDredge(n - 1, after); };
  for (const o of opts) m.body.append(h('div', { class: 'row' }, h('span', { class: 'nm', text: `${o.card.name} - Dredge ${o.n}` }), h('button', { class: 'primary', text: `Dredge (mill ${o.n})`, onclick: () => { snap(); const id = o.card.id; millCards(o.n); const i = state.graveyard.findIndex(x => x.id === id); if (i >= 0) { const [d] = state.graveyard.splice(i, 1); state.hand.push(d); } log(`Dredged ${o.card.name}: milled ${o.n} and returned it to your hand instead of drawing`); next(); } })));
  m.foot.append(h('button', { class: 'primary', text: 'Draw normally', onclick: () => { snap(); const d = drawNoDredge(1); log(`Drew ${d}`); next(); } }));
}

