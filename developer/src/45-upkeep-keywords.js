// ---------------------------------------------------------------- v0.96.7 upkeep keywords: Cumulative upkeep, Vanishing, Fading (rules text)
// CR 702.24a Cumulative upkeep [cost]: "At the beginning of your upkeep, if this permanent is on the battlefield, put an age counter on this permanent. Then you may pay [cost] for each age counter on it. If you don't, sacrifice it."
//   If [cost] has choices, each choice is made separately for each age counter; either the whole set is paid or none of it (partial payments aren't allowed).
// CR 702.63a Vanishing N: "This permanent enters with N time counters on it", "At the beginning of your upkeep, if this permanent has a time counter on it, remove a time counter from it", and "When the last time counter is removed from this permanent, sacrifice it."
// CR 702.32a Fading N: "This permanent enters with N fade counters on it" and "At the beginning of your upkeep, remove a fade counter from this permanent. If you can't, sacrifice the permanent."
// (The "enters with N counters" halves are read by etbCounters.)
const kwCtr = (c, k) => counterCount(c, k);
KW_TRIGGERS.push(
  { cr: '702.24', kw: 'cumulative upkeep', ev: 'step:upkeep', cond: 'Cumulative upkeep: at the beginning of your upkeep', text: 'At the beginning of your upkeep, put an age counter on this permanent. Then you may pay its cumulative upkeep cost for each age counter on it. If you don\'t, sacrifice it.' },
  { cr: '702.63', kw: 'vanishing', ev: 'step:upkeep', cond: 'Vanishing: at the beginning of your upkeep, if it has a time counter', text: 'At the beginning of your upkeep, if this permanent has a time counter on it, remove a time counter from it.', test: c => kwCtr(c, 'time') > 0 },
  { cr: '702.32', kw: 'fading', ev: 'step:upkeep', cond: 'Fading: at the beginning of your upkeep', text: 'At the beginning of your upkeep, remove a fade counter from this permanent. If you can\'t, sacrifice the permanent.' }
);
// A cumulative upkeep cost split into its choices. Returns { kind: 'mana'|'life'|'other', alts: [string] } where each alt is the cost for ONE age counter.
function cumulativeCost(arg) {
  const a = String(arg || '').replace(/\.$/, '').trim(); let m;
  if (/^(?:\{[^}]+\})+(?:\s+or\s+(?:\{[^}]+\})+)*$/i.test(a)) return { kind: 'mana', alts: a.split(/\s+or\s+/i) };
  if ((m = a.match(/^Pay (\d+) life$/i))) return { kind: 'life', alts: [m[1]] };
  return { kind: 'other', alts: [a] };
}
// Every way to pay N copies of the choices: multisets of size N (CR 702.24a example: {W} or {U} with two counters).
function multisets(alts, n) { if (alts.length === 1) return [Array(n).fill(alts[0])]; const out = []; const rec = (i, left, cur) => { if (i === alts.length - 1) { out.push(cur.concat(Array(left).fill(alts[i]))); return; } for (let k = left; k >= 0; k--) rec(i + 1, left - k, cur.concat(Array(k).fill(alts[i]))); }; rec(0, n, []); return out; }
const sacrificeIt = (obj, why) => { const f = findCard(obj.sourceId); if (f && f.zone === 'battlefield') { log(`${obj.sourceName}: sacrificed (${why})`); moveCard(f.card.id, 'graveyard'); } else toast('Already gone', `${obj.sourceName} is no longer on the battlefield.`); };
KW_EFFECTS['cumulative upkeep'] = obj => {
  const f = findCard(obj.sourceId); if (!f || f.zone !== 'battlefield') return [];
  const cc = cumulativeCost(obj.arg), name = obj.sourceName; let aged = false;
  const age = () => { if (!aged) { aged = true; addCounter(obj.sourceId, 1, 'age'); } return kwCtr((findCard(obj.sourceId) || { card: null }).card, 'age'); };
  const out = [];
  const payOpt = (label, fn) => out.push({ full: true, label, fn: () => { const n = age(); fn(n); } });
  const refuse = { full: true, label: `Don't pay: put an age counter on ${name}, then sacrifice it`, fn: () => { age(); sacrificeIt(obj, 'cumulative upkeep not paid'); } };
  const n0 = kwCtr(f.card, 'age') + 1;   // the age counter is put on first, so the cost is for one more than it has now
  if (cc.kind === 'mana') {
    for (const combo of multisets(cc.alts, n0)) { const cost = combo.join(''); out.push({ full: true, label: `Put an age counter on ${name} (${n0}) and pay ${cost}`, fn: () => { const n = age(); payManaThen(f.card, cost, `Cumulative upkeep ${cost}`, () => log(`${name}: cumulative upkeep paid (${cost}, ${n} age counter${n === 1 ? '' : 's'})`)); } }); }
  } else if (cc.kind === 'life') {
    const L = +cc.alts[0] * n0; out.push({ full: true, label: `Put an age counter on ${name} (${n0}) and pay ${L} life`, fn: () => { if (state.life < L) { toast('Not enough life', `You cannot pay ${L} life.`); return; } const n = age(); changeLife(-L, true); log(`${name}: cumulative upkeep paid (${L} life, ${n} age counter${n === 1 ? '' : 's'})`); } });
  } else out.push({ full: true, label: `Put an age counter on ${name} (${n0}) and I paid "${cc.alts[0]}" ${n0} time${n0 === 1 ? '' : 's'} by hand`, fn: () => { const n = age(); log(`${name}: cumulative upkeep paid by hand (${cc.alts[0]} × ${n}, ${n} age counter${n === 1 ? '' : 's'})`); } });
  out.push(refuse); return out;
};
KW_EFFECTS['vanishing'] = obj => {
  const f = findCard(obj.sourceId); if (!f || f.zone !== 'battlefield' || kwCtr(f.card, 'time') < 1) return [];   // intervening "if" (CR 603.4): rechecked as it resolves
  return [{ full: true, label: `Remove a time counter from ${obj.sourceName} (${kwCtr(f.card, 'time')} now)`, fn: () => {
    addCounter(obj.sourceId, -1, 'time'); const g = findCard(obj.sourceId);
    if (g && g.zone === 'battlefield' && kwCtr(g.card, 'time') === 0) state.pendingTriggers.push({ kind: 'ability', cardId: obj.sourceId, cardName: obj.sourceName, text: 'Vanishing (keyword, CR 702.63a): when the last time counter is removed from this permanent, sacrifice it.', effect: 'Sacrifice this permanent.', special: 'kw', kw: 'vanishing-sac', optional: false, why: 'The last time counter was removed.' });
  } }];
};
KW_EFFECTS['vanishing-sac'] = obj => [{ full: true, label: `Sacrifice ${obj.sourceName}`, fn: () => sacrificeIt(obj, 'vanishing: the last time counter was removed') }];
KW_EFFECTS['fading'] = obj => {
  const f = findCard(obj.sourceId); if (!f || f.zone !== 'battlefield') return [];
  if (kwCtr(f.card, 'fade') < 1) return [{ full: true, label: `${obj.sourceName} has no fade counter to remove: sacrifice it`, fn: () => sacrificeIt(obj, 'fading: no fade counter') }];
  return [{ full: true, label: `Remove a fade counter from ${obj.sourceName} (${kwCtr(f.card, 'fade')} now)`, fn: () => addCounter(obj.sourceId, -1, 'fade') }];
};
