// ---------------------------------------------------------------- Sagas (v0.65)
// Rule 714: a Saga enters with a lore counter; you add another after your draw step (precombat main); chapter abilities trigger as
// the counter total reaches each chapter number; the Saga is sacrificed once the last chapter ability has left the stack.
const SAGA_CH_RE = /^((?:[IVX]+)(?:, [IVX]+)*) \u2014 (.+)$/;
const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 };
function sagaStrip(tx) { return String(tx || '').split('\n').filter(l => !SAGA_CH_RE.test(l.trim())).join('\n'); }
function isSaga(c) { if (!c || c.token) return false; const i = cardInfo(c.name); return !!(i && /\bSaga\b/.test((i.t || '').split(' // ')[0])); }
function sagaChapters(c) {
  const out = [];
  for (const l of String(cardText(c) || '').split('\n')) { const m = l.trim().match(SAGA_CH_RE); if (m) out.push({ nums: m[1].split(', ').map(r => ROMAN[r] || 0), text: m[2], label: m[1] }); }
  return out;
}
function sagaAdvance(c, entering) {
  const chs = sagaChapters(c); if (!chs.length) return;
  c.counters = c.counters || { plus: 0, minus: 0 };
  const before = c.counters.lore || 0;
  let add = 1; if (entering || true) add = adjustCounterAdd(c, 'lore', 1, true);
  c.counters.lore = before + add;
  const n = c.counters.lore, last = Math.max(...chs.flatMap(x => x.nums));
  log(`${c.name}: lore counter added (${n})`);
  for (const ch of chs) if (ch.nums.some(k => k > before && k <= n)) state.pendingTriggers.push({ kind: 'ability', cardId: c.id, cardName: c.name, text: `Chapter ${ch.label} \u2014 ${ch.text}`, effect: ch.text, special: null, optional: /\byou may\b/i.test(ch.text), why: `${c.name} now has ${n} lore counter${n === 1 ? '' : 's'}, so chapter ${ch.label} triggers.` });
  if (n >= last) state.pendingTriggers.push({ kind: 'sagaSac', cardId: c.id });
}
function sagaCheck() {
  if (!state || !state.sagaWait || !state.sagaWait.length) return;
  const keep = [], go = [];
  for (const id of state.sagaWait) { const busy = state.stack.some(o => o.sourceId === id) || state.pendingTriggers.some(t => t.kind === 'ability' && t.cardId === id); (busy ? keep : go).push(id); }
  state.sagaWait = keep;
  for (const id of go) sagaSacrifice(id);
}
function sagaSacrifice(id) {
  const f = findCard(id); if (!f || f.zone !== 'battlefield') return;
  const last = Math.max(...sagaChapters(f.card).flatMap(x => x.nums));
  if ((f.card.counters.lore || 0) < last) return;
  log(`${f.card.name}: final chapter resolved, sacrificed (rule 714.4)`); toast('Saga sacrificed', `${f.card.name} has as many lore counters as its final chapter and its last chapter ability has resolved, so it is sacrificed.`);
  moveCard(f.card.id, 'graveyard'); render();
}

