// ---------------------------------------------------------------- v0.98.3 Mutate (CR 702.140, 729)
// Cast for its mutate cost, the spell targets a non-Human creature you own. As it resolves it merges with that creature: put it over (it becomes
// the top card: name, types and P/T) or under (the creature keeps them). The merged permanent is ONE object, has the abilities of every card in it,
// keeps its counters, auras and tapped state, and when it leaves the battlefield every card goes with it. If the target is gone the spell resolves
// as an ordinary creature spell (CR 702.140b).
function mutPartsOf(c) { return c.mutParts && c.mutParts.length ? c.mutParts : null; }
function mutateTargetOk(c) { return c && c.zone !== 'x' && !c.token && /\bCreature\b/.test(frontType(c) || '') && !/\bHuman\b/.test(frontType(c) || ''); }
function mutateMerge(spell) {
  const t = spell.targets && spell.targets[0], f = t && findCard(t.id);
  delete spell.mutating;
  if (!f || f.zone !== 'battlefield' || !mutateTargetOk(f.card) || f.card.id === spell.id) { log(`${spell.name}: its mutate target is gone or illegal, so it resolves as a creature spell and enters the battlefield (CR 702.140b)`); return false; }
  const host = f.card, parts = mutPartsOf(host) || [{ name: host.name }];
  const done = over => {
    const topName = over ? spell.name : host.name, np = over ? [{ name: spell.name }].concat(parts) : parts.concat([{ name: spell.name }]);
    host.mutParts = np; host.name = np[0].name; host.mutCount = np.length;
    log(`${spell.name} mutates ${over ? 'over' : 'under'} ${over ? parts[0].name : host.name}: one permanent of ${np.length} cards, shown as ${host.name} (CR 702.140c)`);
    sfx('resolve'); render();
    fireTrigger('mutates', { card: host }); flushTriggers();
    if (state.pendingTriggers.length) resolvePendingTrigger();
  };
  const m = modal(`${spell.name}: mutate`, { width: 480, sticky: true, noClose: true });
  m.body.append(h('div', { class: 'psub', text: `${spell.name} merges with ${host.name}. Put it over or under?` }), h('div', { class: 'muted small', text: 'Over: it becomes the top card, so you use its name, types and power/toughness. Under: the creature keeps its own. Either way the merged creature has the abilities of every card in it.' }));
  m.foot.append(h('button', { text: `Under ${host.name}`, onclick: () => { m.close(); done(false); } }), h('button', { class: 'primary', text: `Over ${host.name}`, onclick: () => { m.close(); done(true); } }));
  return true;
}
// The text of the cards below the top one is added to the permanent's text; their own name reads as the merged creature's name.
function mutExtraText(c) {
  const parts = mutPartsOf(c); if (!parts) return '';
  const out = [];
  for (const p of parts.slice(1)) { const i = cardInfo(p.name); if (i && i.tx) out.push(String(i.tx).replace(selfNameRe(p.name), c.name)); }
  return out.join('\n');
}
// Leaving the battlefield: every card of a merged permanent goes to the same place (CR 729.? / 702.140d). The top card is the object itself.
function mutSpawnParts(c, dest) {
  const parts = mutPartsOf(c); if (!parts) return;
  delete c.mutParts; delete c.mutCount;
  for (const p of parts.slice(1)) {
    const nc = newCard(p.name); nc.id = state.nextId++;
    if (dest === 'exile') state.exile.push(nc); else if (dest === 'hand') state.hand.push(nc); else if (dest === 'library') state.library.unshift(nc); else gyPush(nc, 'battlefield');
  }
  log(`${c.name}: the other ${parts.length - 1} card${parts.length > 2 ? 's' : ''} of the merged permanent go${parts.length > 2 ? '' : 'es'} to the ${dest} too`);
}

// ---------------------------------------------------------------- v0.98.3 Splice onto [subtype] (CR 702.47)
// As you cast an instant or sorcery spell of that subtype you may reveal a card with splice from your hand and pay its splice cost. The spell gains the
// rules text of the revealed card (not its splice line) and the revealed card stays in your hand. Offered as optional extras in the cost step.
const SPLICE_RE = /^Splice onto ([A-Za-z]+)\s*(.+?)\.?\s*$/i;
function spliceLine(card) { for (const raw of String(cardText(card) || '').replace(/\([^)]*\)/g, '').split('\n')) { const m = raw.trim().match(SPLICE_RE); if (m) return m; } return null; }
function spliceOffers(c) {
  if (!state || c.token || c.ability || !/\b(?:Instant|Sorcery)\b/.test(frontType(c) || '')) return [];
  const out = [], ty = frontType(c) || '';
  for (const x of state.hand) {
    if (x.id === c.id) continue; const m = spliceLine(x); if (!m || !new RegExp('\\b' + m[1] + '\\b', 'i').test(ty)) continue;
    const cs = parseCostComps(m[2].replace(/^[\u2014-]\s*/, ''), x.name);
    out.push({ label: `Splice ${x.name} onto this spell`, mana: manaOf(cs), comps: cs.filter(k => k.k !== 'mana'), splice: x.id });
  }
  return out;
}
function spliceApply(c, ids) {
  const parts = [];
  for (const id of ids) { const x = state.hand.find(y => y.id === id); if (!x) continue;
    const tx = String(cardText(x) || '').replace(/\([^)]*\)/g, '').split('\n').map(l => l.trim()).filter(l => l && !SPLICE_RE.test(l)).join('\n');
    if (tx) parts.push(tx.replace(selfNameRe(x.name), c.name));
    log(`${c.name}: spliced ${x.name} onto it (revealed from your hand; it stays in your hand). Its effect is added after this spell's own (CR 702.47)`); }
  if (parts.length) c.splicedTx = (c.splicedTx ? c.splicedTx + '\n' : '') + parts.join('\n');
}
