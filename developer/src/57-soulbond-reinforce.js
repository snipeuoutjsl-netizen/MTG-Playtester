// ---------------------------------------------------------------- v0.97.2 rules text: Soulbond (CR 702.95) and Reinforce (CR 702.77)
// 702.95a Soulbond = two triggered abilities: "When this creature enters, you may pair this creature with another unpaired creature you control" and
//   "Whenever another creature enters under your control, if you control both this creature and the other creature and both are unpaired, you may pair this creature with the other creature."
// 702.95c/d  Paired creatures stay paired while you control both and both are creatures; the card's own "as long as ~ is paired with another creature, each of those creatures has ..." gives both the ability.
const soulbondText = c => /^\s*soulbond\b/im.test(cardText(c) || '');
const isCreaturePerm = c => c && /\bCreature\b/.test(permTypeLine(c));
const unpaired = c => c && !c.pairedWith;
function pairedPartner(c) { return c && c.pairedWith ? (state.battlefield.find(x => x.id === c.pairedWith && x.pairedWith === c.id) || null) : null; }
function unpairCard(c) { const p = c && c.pairedWith ? state.battlefield.find(x => x.id === c.pairedWith) : null; if (c) delete c.pairedWith; if (p && p.pairedWith === (c && c.id)) { delete p.pairedWith; log(`${c.name} and ${p.name} are no longer paired`); } }
const PAIR_LINE_RE = /as long as (?:~|this creature) is paired with another creature,? (?:each of those creatures|both creatures|both of them) (?:has|have|gains?) ([a-z ,]+?)\.?$/i;
const PAIR_PT_RE = /as long as (?:~|this creature) is paired with another creature,? (?:each of those creatures|both creatures|both of them) gets? ([+-]\d+)\/([+-]\d+)\.?$/i;
function pairedPT(c) {
  const p = pairedPartner(c); if (!p) return null; let a = 0, b = 0;
  for (const x of [c, p]) { const tx = String(cardText(x) || '').replace(/\([^)]*\)/g, ''), re = selfNameRe(x.name); for (const raw of tx.split('\n')) { const m = raw.trim().replace(re, '~').match(PAIR_PT_RE); if (m) { a += +m[1]; b += +m[2]; } } }
  return a || b ? { p: a, t: b } : null;
}
function pairedKeywords(c) {
  const p = pairedPartner(c); if (!p) return [];
  const out = [];
  for (const x of [c, p]) {
    const tx = String(cardText(x) || '').replace(/\([^)]*\)/g, ''), re = selfNameRe(x.name);
    for (const raw of tx.split('\n')) { const m = raw.trim().replace(re, '~').match(PAIR_LINE_RE); if (m) out.push(...m[1].split(/,\s*|\s+and\s+/).map(k => k.trim().toLowerCase()).filter(k => GRANTABLE.includes(k))); }
  }
  return out;
}
function soulbondOnEnter(e) {
  if (!state || !isCreaturePerm(e) || !state.battlefield.includes(e)) return;
  const bf = state.battlefield;
  if (soulbondText(e) && unpaired(e) && bf.some(x => x !== e && isCreaturePerm(x) && unpaired(x)))
    state.pendingTriggers.push({ kind: 'ability', cardId: e.id, cardName: e.name, special: 'soulbondSelf', optional: true, text: 'Soulbond — When this creature enters, you may pair it with another unpaired creature you control.', effect: 'Pair this creature with another unpaired creature you control.', why: `${e.name} has soulbond and entered while another unpaired creature is on your side.` });
  for (const c of bf) if (c !== e && isCreaturePerm(c) && soulbondText(c) && unpaired(c) && unpaired(e))
    state.pendingTriggers.push({ kind: 'ability', cardId: c.id, cardName: c.name, otherId: e.id, special: 'soulbondOther', optional: true, text: `Soulbond — Whenever another creature enters under your control, you may pair ${c.name} with it (both unpaired).`, effect: `Pair ${c.name} with ${e.name}.`, why: `${e.name} entered while ${c.name} (soulbond) was unpaired.` });
}
function soulbondResolve(obj, done) {
  const a = findCard(obj.sourceId), card = a && a.zone === 'battlefield' ? a.card : null;
  const finish = (x, y) => { if (!x || !y || x.pairedWith || y.pairedWith || !state.battlefield.includes(x) || !state.battlefield.includes(y)) { log(`${obj.sourceName}: soulbond, no pair made`); render(); if (done) done(); return; } snap(); x.pairedWith = y.id; y.pairedWith = x.id; log(`${x.name} and ${y.name} are now paired`); toast('Paired', `${x.name} and ${y.name} are paired while you control both.`); render(); if (done) done(); };
  if (!card) { if (done) done(); return; }
  if (obj.special === 'soulbondOther') { const o = findCard(obj.otherId); finish(card, o && o.zone === 'battlefield' ? o.card : null); return; }
  const cands = state.battlefield.filter(x => x !== card && isCreaturePerm(x) && unpaired(x));
  if (!cands.length) { if (done) done(); return; }
  if (cands.length === 1) { finish(card, cands[0]); return; }
  openPickCards({ title: `${card.name}: soulbond`, note: 'Choose an unpaired creature to pair with.', cards: cands, max: 1, min: 0, nothing: 'Do not pair', done: p => finish(card, p && p[0]) });
}
// ---- Reinforce N—{cost} ({cost}, Discard this card: Put N +1/+1 counters on target creature.) Activated from hand at any time you have priority.
function reinforceFor(c) {
  const tx = cardText(c).replace(/\([^)]*\)/g, ''); let m;
  for (const raw of tx.split('\n')) if ((m = raw.trim().match(/^Reinforce (\d+)\s*[—-]\s*((?:\{[^}]+\})+)\s*$/i))) return { n: +m[1], cost: m[2] };
  return null;
}
function reinforceCard(id) {
  const f = findCard(id); if (!f || f.zone !== 'hand') return; const rf = reinforceFor(f.card); if (!rf) return;
  if (!state || state.phase !== 'play' || holdForTriggers() || state.discarding || state.step === 0 || state.step === CLEANUP) { toast('Cannot reinforce now', 'You can reinforce when you have priority.'); return; }
  if (!manaPaymentAllocation(manaCostParts(rf.cost), state.manaPool || {}, manaSources(), null).ok) { toast('Cannot reinforce', 'Not enough mana.'); return; }
  const c = f.card, specs = parseTargetSpecs('Put counters on target creature.');
  chooseTargets(c.name, specs, picked => {
    const finish = ids => {
      if (!findCard(id)) return; snap(); tapManaIds(ids || []);
      snapMuted = true; costHold = true; discardHow = 'reinforce'; try { log(`${c.name}: reinforced (${rf.cost}, discarded)`); moveCard(id, 'graveyard'); } finally { snapMuted = false; costHold = false; discardHow = null; }
      state.stack.push({ ability: true, id: state.nextId++, name: `${c.name} — reinforce`, sourceId: null, sourceName: c.name, cost: 'Reinforce ' + rf.n + '—' + rf.cost, text: `Put ${rf.n} +1/+1 counter${rf.n === 1 ? '' : 's'} on target creature.`, targets: picked, _tgtAsked: true });
      state.priority = { active: true, passed: false }; render(); openStack();
    };
    if (teach('stackGuidance')) { openManaPayment(c, finish, rf.cost, 'Pay and reinforce'); return; }
    const plan = manaPaymentAllocation(manaCostParts(rf.cost), state.manaPool || {}, manaSources(), null);
    state.manaPool = plan.pool; finish(plan.used.map(i => manaSources()[i].card.id));
  }, { srcId: null, onCancel: () => {} });
}
