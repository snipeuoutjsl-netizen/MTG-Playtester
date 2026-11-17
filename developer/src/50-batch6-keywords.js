// ---------------------------------------------------------------- v0.96.22 keyword batch 6 (rules text): Squad, Offspring, Impending
// CR 702.157a Squad [cost]: "As an additional cost to cast this spell, you may pay [cost] any number of times." and "When this creature enters, if its squad cost was paid, create a token that's a copy of it for each time its squad cost was paid."
// CR 702.175a Offspring [cost]: "You may pay an additional [cost] as you cast this spell." and "When this permanent enters, if its offspring cost was paid, create a 1/1 token copy of it. The token has 'When this token enters, ...' (the copy is 1/1 in every other way it is a copy)."
// CR 702.176a Impending N—[cost]: "You may choose to pay [cost] rather than pay this spell's mana cost." "If you chose to pay this permanent's impending cost, it enters with N time counters on it."
//             "As long as a permanent's impending cost was paid and it has a time counter on it, it's not a creature." "At the beginning of your end step, if this permanent's impending cost was paid and it has a time counter on it, remove a time counter from it."
// A token that is a copy of a card: the copiable values only (CR 707.2), no counters or other changes.
function copyOfCardDef(info, o) {
  o = o || {}; const front = String(info.t || '').split(' // ')[0], parts = front.split('—'), types = (parts[0].match(/\b(Artifact|Creature|Enchantment|Land|Planeswalker|Battle|Kindred)\b/g) || []),
    subs = ((parts[1] || '').trim().split(/\s+/).filter(Boolean)), pt = o.pt || info.pt || '';
  return { name: String(info.n || info.name || '').split(' // ')[0], pt, subs: subs.map(x => x.toLowerCase()), col: [...(info.col || [])], types, type: 'Token ' + parts[0].trim() + (subs.length ? ' — ' + subs.join(' ') : ''), tx: String(info.tx || '') };
}
function kwCopyTokens(srcId, srcName, n, o) {
  const f = findCard(srcId), info = (f && cardInfo(f.card.name)) || cardInfo(srcName); if (!info) { log(`${srcName}: could not read its card data, create the token copies by hand`); return; }
  const d = copyOfCardDef(Object.assign({ n: srcName }, info), o); makeTokensFromDef(d, n, `${srcName} (${o && o.pt ? 'offspring' : 'squad'})`);
}
KW_TRIGGERS.push(
  { cr: '702.157', kw: 'squad', ev: 'etb-self', cond: 'Squad: when this creature enters, if its squad cost was paid', text: 'When this creature enters, if its squad cost was paid, create a token that\'s a copy of it for each time the cost was paid.', test: c => (c.squadN || 0) > 0 },
  { cr: '702.175', kw: 'offspring', ev: 'etb-self', cond: 'Offspring: when this permanent enters, if its offspring cost was paid', text: 'When this permanent enters, if its offspring cost was paid, create a 1/1 token copy of it.', test: c => !!c.offspringPaid },
  { cr: '702.176', kw: 'impending', ev: 'step:end', cond: 'Impending: at the beginning of your end step, if its impending cost was paid and it has a time counter', text: 'At the beginning of your end step, if this permanent\'s impending cost was paid and it has a time counter on it, remove a time counter from it.', test: c => !!c.impended && kwCtr(c, 'time') > 0 }
);
KW_EFFECTS['squad'] = obj => { const f = findCard(obj.sourceId), n = (f && f.card.squadN) || 0; return n ? [{ full: true, label: `Create ${n} token cop${n === 1 ? 'y' : 'ies'} of ${obj.sourceName} (squad paid ${n} time${n === 1 ? '' : 's'})`, fn: () => { kwCopyTokens(obj.sourceId, obj.sourceName, n); } }] : []; };
KW_EFFECTS['offspring'] = obj => [{ full: true, label: `Create a 1/1 token copy of ${obj.sourceName} (offspring paid)`, fn: () => { kwCopyTokens(obj.sourceId, obj.sourceName, 1, { pt: '1/1' }); } }];
KW_EFFECTS['impending'] = obj => {
  const f = findCard(obj.sourceId); if (!f || f.zone !== 'battlefield' || !f.card.impended || kwCtr(f.card, 'time') < 1) return [];   // intervening "if" (CR 603.4), rechecked as it resolves
  return [{ full: true, label: `Remove a time counter from ${obj.sourceName} (${kwCtr(f.card, 'time')} now)`, fn: () => {
    addCounter(obj.sourceId, -1, 'time'); const g = findCard(obj.sourceId);
    if (g && g.zone === 'battlefield' && kwCtr(g.card, 'time') === 0) { log(`${obj.sourceName}: the last time counter is gone, it is a creature now`); render(); } } }];
};
// Cast for the impending cost: it enters with N time counters (CR 702.176a). While it has one it is not a creature (frontType hides the Creature type).
function impendingEnter(c) {
  if (!c.impended) return; const m = String(cardText(c)).replace(/\([^)]*\)/g, '').match(/^Impending (\d+)/im), n = m ? +m[1] : 0;
  c.counters = c.counters && typeof c.counters === 'object' ? c.counters : { plus: 0, minus: 0 }; c.counters.time = n;
  log(`${c.name}: cast for its impending cost, it enters with ${n} time counter${n === 1 ? '' : 's'} and is not a creature until the last is removed`);
}
