// ---------------------------------------------------------------- v0.96.16 keyword batch 5 (rules text): Exploit, Enlist, Mobilize, Unleash, Devour, Ravenous
// CR 702.110a Exploit: "When this creature enters, you may sacrifice a creature." (702.110b: it "exploits" a creature when it sacrifices one this way; "when this creature exploits a creature" is a linked ability.)
//             Wizards ruling: the exploiting creature may sacrifice itself, and its linked ability still happens.
// CR 702.154a Enlist: "As this creature attacks, you may tap up to one untapped nonattacking creature you control that either has haste or has been under your control continuously since this turn began. When you do, this creature gets +X/+0 until end of turn, where X is the tapped creature's power."
// CR 702.181a Mobilize N: "Whenever this creature attacks, create N tapped and attacking 1/1 red Warrior creature tokens. Sacrifice them at the beginning of the next end step." (508.4: they were never declared as attackers, so "whenever attacks" abilities do not trigger for them.)
// CR 702.98a  Unleash: "You may have this permanent enter with a +1/+1 counter on it. It can't block as long as it has a +1/+1 counter on it."
// CR 702.82a  Devour N: "As this object enters, you may sacrifice any number of creatures. This permanent enters with N +1/+1 counters on it for each creature sacrificed this way."  (702.82b: it "devours" those creatures.)
// CR 702.156a Ravenous: "This permanent enters with X +1/+1 counters on it. When it enters, if X is 5 or more, draw a card."
KW_TRIGGERS.push(
  { cr: '702.110', kw: 'exploit', ev: 'etb-self', cond: 'Exploit: when this creature enters', text: 'When this creature enters, you may sacrifice a creature.' },
  { cr: '702.154', kw: 'enlist', ev: 'attack-self', cond: 'Enlist: as this creature attacks', text: 'As this creature attacks, you may tap up to one untapped nonattacking creature you control (with haste, or controlled since the turn began). This creature gets +X/+0, X being that creature\'s power.', test: (c, atk) => kwEnlistCandidates(c, atk).length > 0 },
  { cr: '702.181', kw: 'mobilize', ev: 'attack-self', cond: 'Mobilize: whenever this creature attacks', text: 'Whenever this creature attacks, create N tapped and attacking 1/1 red Warrior creature tokens. Sacrifice them at the beginning of the next end step.' },
  { cr: '702.98', kw: 'unleash', ev: 'etb-self', cond: 'Unleash: as this creature enters', text: 'You may have this permanent enter with a +1/+1 counter on it. It can\'t block as long as it has a +1/+1 counter on it.' },
  { cr: '702.82', kw: 'devour', ev: 'etb-self', cond: 'Devour: as this permanent enters', text: 'As this object enters, you may sacrifice any number of creatures. It enters with N +1/+1 counters for each creature sacrificed.' },
  { cr: '702.156', kw: 'ravenous', ev: 'etb-self', cond: 'Ravenous: this permanent enters with X +1/+1 counters', text: 'This permanent enters with X +1/+1 counters on it. When it enters, if X is 5 or more, draw a card.' }
);
const kwIsCreature = c => permTypeInfo(c).types.has('creature');
function kwEnlistCandidates(c, atk) {
  const ids = new Set((atk || state.combat.attackers || []).map(a => a.id ?? a));
  return state.battlefield.filter(x => x.id !== c.id && kwIsCreature(x) && !x.tapped && !ids.has(x.id) && !isSick(x));
}
function kwSacrifice(card, why) { const f = findCard(card.id); if (!f || f.zone !== 'battlefield') return false; log(`${why}: sacrificed ${card.name}`); leaveBattlefield(f.card, 'graveyard'); return true; }
KW_EFFECTS['exploit'] = obj => {
  const src = findCard(obj.sourceId), name = obj.sourceName || 'It';
  const linked = (() => { const tx = src ? cardText(src.card) : ''; const m = String(tx).replace(/\([^)]*\)/g, ' ').match(/When (?:~|this creature|[^,.]*?) exploits a creature,\s*([^\n]*)/i); return m ? m[1].trim() : ''; })();
  const opts = state.battlefield.filter(kwIsCreature).map(c => ({ full: true, label: `Sacrifice ${c.id === obj.sourceId ? name + ' itself' : c.name} (exploit)`, fn: () => {
    if (!kwSacrifice(c, `${name}: exploit`)) return;
    if (linked) state.pendingTriggers.push({ kind: 'ability', cardId: obj.sourceId, cardName: name, text: 'When this creature exploits a creature, ' + linked, effect: linked, special: null, optional: false, why: `${name} exploited ${c.name}.` });
    render(); } }));
  opts.push({ full: true, label: `Don't sacrifice a creature`, fn: () => log(`${name}: exploit, no creature sacrificed`) });
  return opts;
};
KW_EFFECTS['enlist'] = obj => {
  const f = findCard(obj.sourceId); if (!f) return [];
  const opts = kwEnlistCandidates(f.card).map(c => { const p = Math.max(0, ptCalc(c).p || 0); return { full: true, label: `Tap ${c.name}: ${f.card.name} gets +${p}/+0 until end of turn (enlist)`, fn: () => { c.tapped = true; addTempPT(f.card.id, p, 0); log(`${f.card.name}: enlisted ${c.name}, +${p}/+0 until end of turn`); render(); } }; });
  opts.push({ full: true, label: `Don't enlist`, fn: () => log(`${f.card.name}: no creature enlisted`) });
  return opts;
};
KW_EFFECTS['mobilize'] = obj => { const n = obj.n || 1, f = findCard(obj.sourceId); return [{ full: true, label: `Create ${n} tapped and attacking 1/1 red Warrior token${n === 1 ? '' : 's'}; sacrifice them at the next end step`, fn: () => {
  snap();
  for (let i = 0; i < n; i++) {
    const t = newCard('Warrior', { token: true, tk: { pt: '1/1', col: ['R'], subs: ['Warrior'], types: ['Creature'], type: 'Token Creature — Warrior' } }); t.id = state.nextId++;
    enterBattlefield(t, { from: 'effect', tapped: true, logMsg: `${obj.sourceName}: mobilize created a tapped and attacking Warrior` });
    state.combat.attackers = (state.combat.attackers || []).concat([t.id]);   // CR 508.4: never declared, so no attack triggers
    addFx({ kind: 'delayed', when: 'end', action: 'sacrifice', targetId: t.id, targetName: 'Warrior token', text: 'Sacrifice the Warrior token (mobilize).', srcName: obj.sourceName });
  }
  render(); flushTriggers(); } }]; };
KW_EFFECTS['unleash'] = obj => [
  { full: true, label: `${obj.sourceName} enters with a +1/+1 counter (it can't block while it has one)`, fn: () => { addCounter(obj.sourceId, 1, 'plus'); const f = findCard(obj.sourceId); if (f) f.card.unleashed = true; log(`${obj.sourceName}: unleashed, it can't block while it has a +1/+1 counter`); } },
  { full: true, label: `Don't put a +1/+1 counter on ${obj.sourceName}`, fn: () => log(`${obj.sourceName}: not unleashed`) }];
KW_EFFECTS['devour'] = obj => {
  const n = obj.n || 1, name = obj.sourceName, others = state.battlefield.filter(c => c.id !== obj.sourceId && kwIsCreature(c));
  const finish = picked => { let k = 0; for (const x of picked) { const f = findCard(x.id ?? x); if (f && kwSacrifice(f.card, `${name}: devour`)) k++; } if (k) { addCounter(obj.sourceId, n * k, 'plus'); log(`${name}: devoured ${k} creature${k === 1 ? '' : 's'}, enters with ${n * k} +1/+1 counter${n * k === 1 ? '' : 's'}`); } render(); };
  return [{ full: true, label: `Devour ${n}: sacrifice any number of other creatures (${others.length} available)`, fn: () => {
    if (!others.length) { log(`${name}: devour, no other creatures to sacrifice`); return; }
    openPickCards({ title: `Devour ${n}: choose creatures to sacrifice`, cards: others, max: others.length, min: 0, note: `${name} enters with ${n} +1/+1 counter${n === 1 ? '' : 's'} for each creature sacrificed.`, done: finish }); } },
    { full: true, label: `Don't devour anything`, fn: () => log(`${name}: devoured nothing`) }];
};
KW_EFFECTS['ravenous'] = obj => { const f = findCard(obj.sourceId), x = (f && f.card.xValue) || 0; return [{ full: true, label: x ? `Enters with X = ${x} +1/+1 counter${x === 1 ? '' : 's'}${x >= 5 ? ' and draw a card (X is 5 or more)' : ''}` : 'X is 0: no counters', fn: () => { if (x) addCounter(obj.sourceId, x, 'plus'); if (x >= 5) { drawCards(1); log(`${obj.sourceName}: ravenous, X was ${x}, drew a card`); } } }]; };
// CR 702.147a Decayed and CR 702.98a Unleash (while it has a +1/+1 counter): this creature can't block.
function kwCantBlock(c) {
  const items = kwItems(cardText(c) || ''), has = k => items.some(i => new RegExp('^' + k + '\\b', 'i').test(i));
  if (has('decayed')) return true;
  const plus = c.counters && typeof c.counters === 'object' ? (c.counters.plus || 0) - (c.counters.minus || 0) : 0;
  return has('unleash') && plus > 0;
}
