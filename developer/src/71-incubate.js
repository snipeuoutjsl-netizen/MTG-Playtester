// ---- Incubate (CR 701.53) and the Incubator token's transform (CR 701.28, 111.10)
// "Incubate N." creates an Incubator token (a colorless artifact) with N +1/+1 counters on it and "{2}: Transform this artifact."
// A transformed Incubator is a 0/0 colorless Phyrexian artifact creature token; its counters stay on it.
function incubateOptions(tx, obj) {
  const t = String(tx || '').replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  let m = /^Incubate (\d+)\.?$/i.exec(t);
  if (m) {
    const n = +m[1], src = obj && obj.sourceName ? obj.sourceName : 'Incubate';
    return [{ label: `Incubate ${n}: create an Incubator token with ${n} +1/+1 counter${n === 1 ? '' : 's'}`, full: true, fn: () => {
      makeTokensFromDef({ name: 'Incubator', pt: '', col: [], types: ['Artifact'], subs: [], type: 'Token Artifact', tx: '{2}: Transform this artifact.', startPlus: n }, 1, src);
    } }];
  }
  if (/^Transform this (?:artifact|token|permanent)\.?$/i.test(t) && obj && obj.sourceId != null) {
    const f = findCard(obj.sourceId);
    if (f && f.card.token && f.card.tk && /^incubator$/i.test(f.card.name)) {
      return [{ label: 'Transform the Incubator into a 0/0 Phyrexian artifact creature', full: true, fn: () => {
        const c = f.card; snap();
        c.name = 'Phyrexian'; c.tk = Object.assign({}, c.tk, { pt: '0/0', types: ['Artifact', 'Creature'], subs: ['Phyrexian'], type: 'Token Artifact Creature — Phyrexian', tx: '' });
        log(`Incubator transformed into a 0/0 Phyrexian artifact creature (its counters stay on it)`); render();
      } }];
    }
  }
  return null;
}
