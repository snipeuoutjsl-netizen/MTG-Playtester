// ---------------------------------------------------------------- casting keywords that change how or when a spell is cast (v0.96.3)
// Overload, Bestow (chosen BEFORE targets: CR 601.2b), Escalate (cost per extra mode), Replicate (copies per payment), Emerge (sacrifice reduces the cost),
// Prowl, Miracle, Plot and Foretell (cast later from exile). Lines are read by altKwLine (42) and the helpers here.
const PRE_ALT = ['overload', 'bestow', 'mutate'];
function preAltKinds(c) { return altCostsFor(c).filter(a => PRE_ALT.includes(a.kind)); }
// Overload: every "target" in the spell's text becomes "each" (CR 702.96a).
function overloadText(tx) { return String(tx || '').replace(/^Overload\b.*$/gim, '').replace(/\btarget\b/gi, 'each'); }
function openPreAlt(c, alts, cb) {
  const m = modal(`Cast ${c.name}: how?`, { width: 560, sticky: true, onCancel: () => { delete c.preAlt; } });
  const pick = k => { c.preAlt = k; m.close(); cb(); };
  m.body.append(h('div', { class: 'psub', text: 'Overload, bestow and mutate are alternative costs, so you choose them before you choose targets (CR 601.2b).' }),
    h('div', { class: 'row' }, h('span', { class: 'nm', text: 'Cast it normally' }), h('button', { class: 'primary', text: 'Normal', onclick: () => pick('') })),
    ...alts.map(a => h('div', { class: 'row' }, h('span', { class: 'nm' }, a.label + ' ', a.mana ? symbols(a.mana) : ''), h('span', { class: 'muted small', text: a.kind === 'overload' ? 'Each instead of target' : a.kind === 'mutate' ? 'Merge with a non-Human creature you own' : 'Cast as an Aura with enchant creature' }), h('button', { class: 'primary', text: a.label, onclick: () => pick(a.kind) }))));
  m.foot.append(h('button', { text: 'Cancel', onclick: () => { delete c.preAlt; m.close(); } }));
}
// Bestow (CR 702.103): the permanent resolves attached to its target; if the target is gone it enters as a creature. If the host leaves, it stays as a creature.
function bestowResolved(c) {
  const t = c.targets && c.targets[0], f = t && findCard(t.id);
  if (f && f.zone === 'battlefield' && f.card.id !== c.id && attachTo(c.id, f.card.id, 'Bestow')) { c.bestowAura = true; log(`${c.name}: bestowed on ${f.card.name}. It is an Aura while attached; if ${f.card.name} leaves it becomes a creature`); }
  else log(`${c.name}: its bestow target is gone, so it enters as a creature (CR 702.103e)`);
  delete c.bestowed;
}
function bestowHostLeft(x) { if (!x.bestowAura) return false; delete x.att; delete x.bestowAura; log(`${x.name} stays on the battlefield and becomes a creature (its bestow host left, CR 702.103f)`); return true; }
// Replicate (CR 702.56): an optional cost payable any number of times; copy the spell that many times.
function replicateOnCast(c) {
  if (!c.replicateN || c.copy) return; const n = c.replicateN; delete c.replicateN;
  state.stack.push({ ability: true, trigger: true, special: 'storm', id: state.nextId++, name: `${c.name} — replicate`, sourceId: c.id, sourceName: c.name, spellId: c.id, n, text: `Replicate — when you cast this spell, copy it for each time its replicate cost was paid (${n}).` });
  log(`${c.name}: replicate paid ${n} time${n === 1 ? '' : 's'}, so ${n} cop${n === 1 ? 'y is' : 'ies are'} created`);
}
// Emerge (CR 702.119): sacrifice a creature, then pay the emerge cost reduced by that creature's mana value.
function reduceGenericBy(mana, n) { return reduceCost(mana, 'improvise', Array(Math.max(0, n)).fill({})); }
function bestSacMV() { return Math.max(0, ...state.battlefield.filter(c => /\bCreature\b/.test(permTypeLine(c))).map(c => (c.token ? 0 : (cardInfo(c.name) || {}).cmc || 0))); }
// Prowl (CR 702.76): an opponent was dealt combat damage this turn by a creature you controlled that shares a creature type with this card.
function noteCombatDealers(dealers) {
  const subs = new Set(); for (const d of dealers) { for (const s of permTypeInfo(d).subs) subs.add(s); if (/\bchangeling\b/i.test(cardText(d))) subs.add('*'); }
  state.dealtTypes = { turn: state.turn, subs };
}
function prowlWhy(c) {
  const d = state.dealtTypes; if (!d || d.turn !== state.turn) return 'no creature you controlled has dealt combat damage to an opponent this turn';
  const mine = permTypeInfo(c).subs, ch = /\bchangeling\b/i.test(cardText(c));
  return ch || d.subs.has('*') || [...mine].some(s => d.subs.has(s)) ? '' : 'none of the creatures that dealt combat damage shares a creature type with this card';
}
// Miracle (CR 702.94): the first card you draw each turn can be revealed and cast for its miracle cost.
function noteMiracleDraw(card) {
  const t = state.drawsTurn && state.drawsTurn.turn === state.turn ? state.drawsTurn : (state.drawsTurn = { turn: state.turn, n: 0 }); t.n++;
  if (t.n !== 1) return;
  if (!String(cardText(card)).split('\n').some(l => /^Miracle\s+\{/i.test(l.trim()))) return;
  state.pendingTriggers.push({ kind: 'ability', cardId: card.id, cardName: card.name, text: `Miracle (keyword, CR 702.94): when you draw ${card.name} as the first card you draw this turn, you may reveal it and cast it by paying its miracle cost.`, effect: 'You may cast it for its miracle cost.', special: 'kw', kw: 'miracle', n: 0, optional: true, why: `${card.name} was the first card you drew this turn.` });
}
// Plot (CR 702.170) and Foretell (CR 702.143): pay now, exile it, cast it from exile on a later turn.
function plotFor(c) { const tx = cardText(c).replace(/\([^)]*\)/g, ''); let m; for (const raw of tx.split('\n')) if ((m = raw.trim().match(/^Plot\s+((?:\{[^}]+\})+)/i))) return { cost: m[1] }; return null; }
function foretellFor(c) { const tx = cardText(c).replace(/\([^)]*\)/g, ''); let m; for (const raw of tx.split('\n')) if ((m = raw.trim().match(/^Foretell\s+((?:\{[^}]+\})+)/i))) return { castCost: m[1], cost: '{2}' }; return null; }
function stashCard(id, kind) {
  const f = findCard(id); if (!f || f.zone !== 'hand') return; const c = f.card, info = kind === 'plot' ? plotFor(c) : foretellFor(c); if (!info) return;
  if (kind === 'plot' ? !canPlaySorcerySpeedNow() : !(state.phase === 'play' && !state.stack.length && state.step !== 0 && state.step !== CLEANUP)) { toast('Cannot ' + kind + ' now', kind === 'plot' ? 'You may plot a card any time you could cast a sorcery: your main phase with an empty stack.' : 'You may foretell a card during your turn any time you have priority.'); return; }
  if (!manaPaymentAllocation(manaCostParts(info.cost), state.manaPool || {}, manaSources(), null).ok) { toast('Cannot ' + kind, `Not enough mana for the ${kind} cost.`); return; }
  const finish = ids => {
    if (!findCard(id)) return; snap(); tapManaIds(ids || []); snapMuted = true; try { moveCard(id, 'exile'); } finally { snapMuted = false; }
    const g = findCard(id); if (g) { g.card[kind === 'plot' ? 'plotted' : 'foretold'] = state.turn; }
    log(`${c.name}: ${kind === 'plot' ? 'plotted' : 'foretold'} (paid ${info.cost}). ${kind === 'plot' ? 'You may cast it from exile without paying its mana cost on a later turn, any time you could cast a sorcery' : 'You may cast it from exile on a later turn for ' + info.castCost}`); render();
  };
  if (teach('stackGuidance')) { openManaPayment(c, finish, info.cost, 'Pay and ' + kind); return; }
  const plan = manaPaymentAllocation(manaCostParts(info.cost), state.manaPool || {}, manaSources(), null); state.manaPool = plan.pool; finish(plan.used.map(i => manaSources()[i].card.id));
}
const stashReady = c => !!c && !!state && ((c.plotted && state.turn > c.plotted && canPlaySorcerySpeedNow()) || (c.foretold && state.turn > c.foretold));
// Alternative routes that only exist for a card cast from exile after plot / foretell, and routes a card must NOT use.
function altKwExtra(c) {
  const out = [];
  if (c.fromExile && c.plotted && state.turn > c.plotted) out.push({ kind: 'plotfree', cr: '702.170', label: 'Cast without paying its mana cost (plotted)', mana: '', comps: [], cond: '', test: null, note: '' });
  return out;
}
function routeLimits(c, routes) {
  if (c.preAlt) return routes.filter(r => r.alt && r.alt.kind === c.preAlt);
  if (c.preAlt === '') return routes.filter(r => !(r.alt && PRE_ALT.includes(r.alt.kind)));
  if (c.miracleNow) return routes.filter(r => r.alt && r.alt.kind === 'miracle');
  if (c.fromExile && c.plotted) return routes.filter(r => r.alt && r.alt.kind === 'plotfree');
  if (c.fromExile && c.foretold) return routes.filter(r => r.alt && r.alt.kind === 'foretell');
  return routes.filter(r => !(r.alt && (r.alt.kind === 'miracle' || r.alt.kind === 'foretell') && !r.ok && false));
}
