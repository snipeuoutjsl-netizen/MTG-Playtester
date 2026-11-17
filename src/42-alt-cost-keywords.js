// ---------------------------------------------------------------- alternative-cost and other casting keywords (v0.96.2)
// ALT_KW: "Keyword {cost}" / "Keyword - cost" lines that give an alternative way to cast a spell. `test(c)` returns '' when the condition
// is met, else the reason it cannot be used (shown on the route). `cond` is the rules condition in plain words.
const ALT_KW = [
  { cr: '702.152', kw: 'blitz', cond: '', note: 'It gains haste. When it dies, draw a card. Sacrifice it at the beginning of the next end step.' },
  { cr: '702.109', kw: 'dash', cond: '', note: 'It gains haste. Return it to its owner\'s hand at the beginning of the next end step.' },
  { cr: '702.137', kw: 'spectacle', cond: 'If an opponent lost life this turn', test: () => (state.oppLifeLostTurn === state.turn ? '' : 'no opponent has lost life this turn') },
  { cr: '702.96', kw: 'overload', cond: '', note: 'Each instead of target.' },
  { cr: '702.103', kw: 'bestow', cond: '', note: 'Cast as an Aura with enchant creature.' },
  { cr: '702.119', kw: 'emerge', cond: 'Sacrifice a creature; the cost is reduced by its mana value', reduceBySac: true },
  { cr: '702.76', kw: 'prowl', cond: 'If an opponent was dealt combat damage by a creature you controlled that shares a type with this card', test: c => prowlWhy(c) },
  { cr: '702.94', kw: 'miracle', cond: 'As you draw it, if it is the first card you drew this turn', test: c => (c.miracleNow ? '' : 'miracle only works right after you draw this card as the first card you draw this turn') },
  { cr: '702.143', kw: 'foretell', cond: 'It was foretold on an earlier turn', test: c => (c.fromExile && c.foretold && state.turn > c.foretold ? '' : 'it has not been foretold on an earlier turn') },
  { cr: '702.117', kw: 'surge', cond: 'If you or a teammate has cast another spell this turn', test: () => (spellsCastNow() > 0 ? '' : 'you have not cast another spell this turn') }
];
function altKwLine(line, c) {
  for (const k of ALT_KW) {
    let m = line.match(new RegExp('^' + k.kw + '\\s+((?:\\{[^}]+\\})+)\\s*$', 'i'));
    if (m) return { kind: k.kw, cr: k.cr, label: k.kw[0].toUpperCase() + k.kw.slice(1), mana: m[1], comps: [], cond: k.cond, test: k.test || null, note: k.note || '', reduceBySac: !!k.reduceBySac, comps: k.reduceBySac ? parseCostComps('Sacrifice a creature', c.name).map(x => Object.assign(x, { emerge: true })) : [] };
    m = line.match(new RegExp('^' + k.kw + '\\s*[\\u2014-]\\s*(.+?)\\.?$', 'i'));
    if (m) { const cs = parseCostComps(m[1], c.name); return { kind: k.kw, cr: k.cr, label: k.kw[0].toUpperCase() + k.kw.slice(1) + ' — ' + m[1].replace(/\.$/, ''), mana: manaOf(cs), comps: cs.filter(x => x.k !== 'mana'), cond: k.cond, test: k.test || null, note: k.note || '' }; }
  }
  return null;
}
// Casualty N (CR 702.153): you may sacrifice a creature with power N or greater as you cast the spell; if you did, copy it.
function casualtyOptional(line, c) {
  const m = line.match(/^Casualty (\d+)\s*$/i); if (!m) return null;
  const cs = parseCostComps(`Sacrifice a creature with power ${m[1]} or greater`, c.name);
  return { label: `Casualty ${m[1]}`, mana: '', comps: cs, casualty: +m[1] };
}
function casualtyOnCast(c) {
  if (!c.casualtyPaid || c.copy) return; delete c.casualtyPaid;
  state.stack.push({ ability: true, trigger: true, special: 'storm', id: state.nextId++, name: `${c.name} — casualty`, sourceId: c.id, sourceName: c.name, spellId: c.id, n: 1, text: `Casualty — when you cast this spell, if a casualty cost was paid, copy it. You may choose new targets for the copy.` });
  log(`${c.name}: casualty was paid, so a copy is created`);
}
// The permanent resolves after being cast with blitz or dash (CR 702.152, 702.109).
function altKwResolved(c) {
  const gain = () => addKwFx(c.id, 'haste', { until: 'manual' });
  if (c.blitzed) { delete c.blitzed; c.blitzBody = true; gain(); addFx({ kind: 'delayed', when: 'end', action: 'sacrifice', targetId: c.id, targetName: c.name, text: `Sacrifice ${c.name} (blitz).`, srcName: c.name }); log(`${c.name}: blitzed. It has haste, is sacrificed at the beginning of the next end step, and draws you a card when it dies`); }
  if (c.dashed) { delete c.dashed; gain(); addFx({ kind: 'delayed', when: 'end', action: 'returnHand', targetId: c.id, targetName: c.name, text: `Return ${c.name} to its owner's hand (dash).`, srcName: c.name }); log(`${c.name}: dashed. It has haste and returns to your hand at the beginning of the next end step`); }
}
