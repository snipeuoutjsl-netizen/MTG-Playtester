// ---------------------------------------------------------------- v0.96.9 keyword batch 4 (rules text): Decayed, Exert, Monstrosity, Populate (Boast and Devoid are read in 19 and 02)
// CR 702.147a Decayed: "This creature can't block" and "When this creature attacks, sacrifice it at end of combat."
// CR 701.43a  To exert a permanent, you choose to have it not untap during your next untap step. (701.43d: "You may exert [this creature] as it attacks" is an optional cost to attack.)
// CR 701.37a  "Monstrosity N" means "If this permanent isn't monstrous, put N +1/+1 counters on it and it becomes monstrous." (701.37b: monstrous lasts until it leaves the battlefield.)
// CR 701.36a  To populate means to choose a creature token you control and create a token that's a copy of that creature token. (701.36b: no creature token, no token.)
// CR 702.142a Boast — [Cost]: [Effect]  means  "[Cost]: [Effect]. Activate only if this creature attacked this turn and only once each turn."
// CR 702.114a Devoid: "This object is colorless."
KW_TRIGGERS.push({ cr: '702.147', kw: 'decayed', ev: 'attack-self', cond: 'Decayed: whenever this creature attacks', text: 'When this creature attacks, sacrifice it at end of combat.' });
KW_EFFECTS['decayed'] = obj => [{ full: true, label: `Sacrifice ${obj.sourceName} at end of combat (decayed)`, fn: () => {
  const f = findCard(obj.sourceId); if (!f) return;
  addFx({ kind: 'delayed', when: 'endcombat', action: 'sacrifice', targetId: f.card.id, targetName: f.card.name, text: `Sacrifice ${f.card.name} (decayed).`, srcName: f.card.name }); log(`${f.card.name}: decayed, it will be sacrificed at end of combat`); render(); } }];
KW_EFFECTS['exert'] = obj => {
  const f = findCard(obj.sourceId); if (!f || f.zone !== 'battlefield') return [];
  return [{ full: true, label: `Exert ${obj.sourceName}: it won't untap during your next untap step`, fn: () => {
    f.card.exerted = state.turn; log(`${obj.sourceName}: exerted, it won't untap during your next untap step`);
    if (obj.arg) state.pendingTriggers.push({ kind: 'ability', cardId: obj.sourceId, cardName: obj.sourceName, text: 'When you do, ' + obj.arg, effect: obj.arg, special: null, optional: false, why: `You exerted ${obj.sourceName} as it attacked, so its linked "when you do" ability triggers (CR 701.43d).` });
    render(); } },
    { full: true, label: `Don't exert ${obj.sourceName}`, fn: () => log(`${obj.sourceName}: not exerted`) }];
};
function kwActionOptions2(tx, obj, opts) {
  let m; const t = String(tx || '').replace(/\([^)]*\)/g, ' ');
  if ((m = t.match(/\bmonstrosity (\d+)\b/i)) && obj && obj.sourceId) {
    const n = +m[1], f = findCard(obj.sourceId), name = obj.sourceName || (f && f.card.name) || 'it';
    if (f && f.zone === 'battlefield') opts.push(f.card.monstrous
      ? { full: true, label: `${name} is already monstrous: nothing happens`, fn: () => log(`${name}: already monstrous, monstrosity does nothing`) }
      : { full: true, label: `Monstrosity ${n}: put ${n} +1/+1 counter${n === 1 ? '' : 's'} on ${name}; it becomes monstrous`, fn: () => { f.card.monstrous = true; addCounter(f.card.id, n, 'plus'); log(`${name}: became monstrous (${n} +1/+1 counters)`); fireTrigger('monstrous', { card: f.card }); render(); flushTriggers(); } });
  }
  if (/\bpopulate\b/i.test(t) && !/\bpopulated\b/i.test(t)) {
    const toks = state.battlefield.filter(c => c.token && permTypeInfo(c).types.has('creature')), seen = new Set(), uniq = [];
    for (const c of toks) { const k = c.name + '|' + JSON.stringify(c.tk); if (!seen.has(k)) { seen.add(k); uniq.push(c); } }
    if (!uniq.length) opts.push({ full: true, label: 'You control no creature token: populate does nothing', fn: () => log('Populate: you control no creature token, so nothing is created') });
    for (const c of uniq) opts.push({ full: true, label: `Populate: create a token that's a copy of ${c.name}${c.tk && c.tk.pt ? ' ' + c.tk.pt : ''}`, fn: () => {
      snap(); const cp = newCard(c.name, { token: true, tk: JSON.parse(JSON.stringify(c.tk || {})) }); cp.id = state.nextId++;   // a copy has the copiable values only: no counters, damage or other changes
      enterBattlefield(cp, { from: 'effect', tapped: false, logMsg: `Populate: created a copy of ${c.name}` }); render(); flushTriggers(); } });
  }
}
