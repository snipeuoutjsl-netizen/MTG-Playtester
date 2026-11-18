// ---- Assimilate (CR 701.72; card text of Borg Cube): "Assimilate a creature card exiled with it. If you can't, exile up to one target creature."
// Reminder text on the card: "To assimilate a card, put it onto the battlefield under your control with a +1/+1 counter. It's a Borg artifact creature and loses all other creature types."
// A permanent remembers the cards exiled with it (c.exiledWith); the first sentence uses that list, the second fills it.
function assimilateOptions(tx, obj) {
  if (!state || !obj) return null; const src = obj.sourceName || 'Ability';
  const sents = MASS_SENTS(tx).map(s => s.replace(/\.$/, '').replace(selfNameRe(src), '~').trim());
  if (!sents.length || !/^assimilate an? creature card exiled with (?:~|it|this \w+)$/i.test(sents[0])) return null;
  const orElse = sents[1] && /^if you can'?t, exile up to one target creature$/i.test(sents[1]); if (sents.length > (orElse ? 2 : 1)) return null;
  if (obj.sourceId === -1) return [{ full: true, label: 'assimilate a creature card exiled with it' + (orElse ? ', otherwise exile up to one target creature' : '') }];
  const f = findCard(obj.sourceId), mine = f && f.card.exiledWith ? f.card.exiledWith.filter(e => state.exile.some(x => x.id === e.id)) : [];
  const out = [];
  for (const e of mine) { const card = state.exile.find(x => x.id === e.id); if (!card || !/\bCreature\b/.test(((cardInfo(card.name) || {}).t || '').split(' // ')[0])) continue;
    out.push({ full: true, label: `Assimilate ${card.name}: put it onto the battlefield under your control with a +1/+1 counter (a Borg artifact creature)`, fn: () => {
      const i = state.exile.findIndex(x => x.id === card.id); if (i < 0) return; const [c] = state.exile.splice(i, 1); f.card.exiledWith = f.card.exiledWith.filter(x => x.id !== c.id);
      enterBattlefield(c, { from: 'exile', logMsg: `${src}: assimilated ${c.name} (+1/+1 counter, a Borg artifact creature)`, afterPlace: x => { x.counters = x.counters || { plus: 0, minus: 0 }; x.counters.plus = (x.counters.plus || 0) + 1; x.becomes = { pt: ((cardInfo(x.name) || {}).pt) || '0/0', types: ['artifact', 'creature'], subs: ['borg'], onlySubs: true, kws: [] }; x.addSubs = []; x.borg = true; } });
      render(); flushTriggers(); } }); }
  if (!out.length && orElse) {   // "If you can't": nothing exiled with it that can be assimilated
    const cands = state.battlefield.filter(c => c.id !== obj.sourceId && permTypeInfo(c).types.has('creature'));
    out.push({ full: true, label: 'No creature card is exiled with it: exile up to one target creature', fn: () => {
      if (!cands.length) { log(`${src}: no target creature to exile`); return; }
      openPickCards({ title: `${src}: exile up to one target creature`, note: 'Choose a creature, or none. It is exiled and remembered as exiled with this permanent, so a later assimilate can use it.', cards: cands, min: 0, max: 1, done: picked => { const t = picked[0]; if (!t) { log(`${src}: no creature exiled`); return; } const nm = t.name, tok = t.token, id = t.id; moveCard(id, 'exile'); const g = findCard(obj.sourceId); if (g && !tok) { g.card.exiledWith = (g.card.exiledWith || []).concat([{ id, name: nm }]); } log(`${src}: exiled ${nm}${tok ? ' (a token ceases to exist)' : ' (exiled with ' + src + ')'}`); render(); } }); } });
  }
  if (!out.length) out.push({ full: true, label: 'Nothing to assimilate and no creature to exile', fn: () => log(`${src}: nothing happened`) });
  return out;
}
