// ---- v0.99.29 keywords that bring a permanent back, make it pay to stay, or make you pay or lose it: Echo, Persist, Undying, and "Sacrifice ~ unless you ..." (rules text, any card)
// CR 702.30a Echo [cost]: "At the beginning of your upkeep, if this permanent came under your control since the beginning of your last upkeep, sacrifice it unless you pay its echo cost."
// CR 702.79a Persist: "When this permanent is put into a graveyard from the battlefield, if it had no -1/-1 counters on it, return it to the battlefield under its owner's control with a -1/-1 counter on it."
// CR 702.93a Undying: the same with +1/+1 counters.      Both look at the permanent as it last existed on the battlefield (CR 603.10a): `c.lki` holds the counters it had.
KW_TRIGGERS.push(
  { cr: '702.30', kw: 'echo', ev: 'step:upkeep', cond: 'Echo: at the beginning of your upkeep, if it came under your control since your last upkeep', text: 'At the beginning of your upkeep, if this permanent came under your control since the beginning of your last upkeep, sacrifice it unless you pay its echo cost.', test: c => !!c.echoDue },
  { cr: '702.79', kw: 'persist', ev: 'dies-self', cond: 'Persist: when this creature dies, if it had no -1/-1 counters on it', text: 'When this creature dies, if it had no -1/-1 counters on it, return it to the battlefield under its owner\'s control with a -1/-1 counter on it.', test: c => ((c.lki || {}).minus || 0) === 0 },
  { cr: '702.93', kw: 'undying', ev: 'dies-self', cond: 'Undying: when this creature dies, if it had no +1/+1 counters on it', text: 'When this creature dies, if it had no +1/+1 counters on it, return it to the battlefield under its owner\'s control with a +1/+1 counter on it.', test: c => ((c.lki || {}).plus || 0) === 0 }
);
KW_EFFECTS['echo'] = obj => {
  const f = findCard(obj.sourceId); if (!f || f.zone !== 'battlefield') return [];
  const name = obj.sourceName, cost = String(obj.arg || '').replace(/\.$/, '').trim(), keep = () => { const g = findCard(obj.sourceId); if (g) delete g.card.echoDue; };
  if (!f.card.echoDue) return [{ full: true, label: `${name} has been under your control since your last upkeep: echo does nothing`, fn: () => {} }];
  const out = [];
  if (/^(?:\{[^}]+\})+$/.test(cost)) out.push({ full: true, label: `Pay ${cost}: keep ${name}`, fn: () => { payManaThen(f.card, cost, `Echo ${cost}`, () => { keep(); log(`${name}: echo paid (${cost}), it stays`); }); } });
  else out.push({ full: true, label: `I paid the echo cost (${cost}) by hand: keep ${name}`, fn: () => { keep(); log(`${name}: echo paid by hand (${cost}), it stays`); } });
  out.push({ full: true, label: `Don't pay: sacrifice ${name}`, fn: () => { keep(); sacrificeIt(obj, 'echo not paid'); } });
  return out;
};
const returnWithCounter = kind => obj => {
  const name = obj.sourceName, sign = kind === 'minus' ? '-1/-1' : '+1/+1', where = () => state.graveyard.findIndex(x => x.id === obj.sourceId);
  if (where() < 0) return [{ full: true, label: `${name} is no longer in the graveyard: it cannot return`, fn: () => log(`${name}: ${kind === 'minus' ? 'persist' : 'undying'} does nothing, the card is not in the graveyard any more`) }];
  return [{ full: true, label: `Return ${name} to the battlefield with a ${sign} counter on it`, fn: () => {
    const i = where(); if (i < 0) return; const [c] = state.graveyard.splice(i, 1);
    enterBattlefield(c, { from: 'graveyard', logMsg: `${name}: returned to the battlefield with a ${sign} counter (${kind === 'minus' ? 'persist' : 'undying'})`, afterPlace: x => { x.counters = x.counters || { plus: 0, minus: 0 }; x.counters[kind] = (x.counters[kind] || 0) + 1; } });
    render(); flushTriggers(); } }];
};
KW_EFFECTS['persist'] = returnWithCounter('minus');
KW_EFFECTS['undying'] = returnWithCounter('plus');

// ---- "Sacrifice ~ unless you <cost>." (Glint Hawk: "sacrifice it unless you return an artifact you control to its owner's hand")
// The ability is a choice: do the cost (the app helps you pick the cards and does it) or let the permanent be sacrificed. Costs read: return, discard, pay {mana}, pay N life, sacrifice, tap.
const SU_NUM = w => ({ a: 1, an: 1, one: 1, two: 2, three: 3, four: 4 }[String(w).toLowerCase()] || parseInt(w, 10) || 1);
const SU_TYPES = /^(?:artifact|creature|land|enchantment|planeswalker|permanent|nonland permanent|nonland|token|artifact creature|basic land|untapped (?:artifact|creature|land|permanent))$/i;
function sacUnlessOptions(tx, obj) {
  if (!state || !obj) return null; const src = obj.sourceName || 'Ability'; if (obj.sourceId == null) return null;
  const sents = MASS_SENTS(tx).map(s => s.replace(/\.$/, '').replace(selfNameRe(src), '~')); if (sents.length !== 1) return null;
  const m = /^sacrifice (?:~|it|this [a-z]+) unless you (.+)$/i.exec(sents[0]); if (!m) return null;
  const cost = m[1].trim(); if (obj.sourceId === -1) return [{ full: true, label: `sacrifice it unless you ${cost}` }];
  const sac = () => { const f = findCard(obj.sourceId); if (f && f.zone === 'battlefield') { log(`${src}: not paid, so it is sacrificed`); moveCard(f.card.id, 'graveyard'); } else log(`${src}: already gone`); };
  const no = { full: true, label: `Don't: sacrifice ${src}`, fn: sac };
  const pickPerm = (title, intro, n, filt, then) => { const cands = state.battlefield.filter(c => c.id !== obj.sourceId && filt(c)); if (cands.length < n) { toast('Cannot', `You do not control enough ${title.toLowerCase()} for this.`); return; } pickCardsModal(`${src}: ${title}`, intro, cands, n, then); };
  let q, yes = null;
  if ((q = /^return (an?|one|two|three|\d+) ([a-z ]+?)(?: you control)? to (?:its owner's|their owners'|your) hands?$/i.exec(cost)) && SU_TYPES.test(q[2])) {
    const n = SU_NUM(q[1]), w = q[2].toLowerCase().replace(/^untapped /, '');
    yes = { full: true, label: `Return ${n === 1 ? 'a' : n} ${q[2]}${n === 1 ? '' : 's'} you control to hand: keep ${src}`, fn: () => pickPerm(q[2], `Choose ${n} ${q[2]}${n === 1 ? '' : 's'} you control to return to its owner's hand. ${src} is sacrificed if you don't.`, n, c => w.split(' ').every(x => x === 'nonland' ? !isLandName(c.name) : pcPermIsCard(c, x === 'permanent' ? (permTypeInfo(c).types.values().next().value || x) : x) || x === 'permanent'), ids => { for (const id of ids) moveCard(id, 'hand'); log(`${src}: returned ${ids.length} permanent${ids.length === 1 ? '' : 's'} to hand, so it stays`); render(); }) };
  } else if ((q = /^discard (an?|one|two|three|\d+) cards?$/i.exec(cost))) {
    const n = SU_NUM(q[1]); yes = { full: true, label: `Discard ${n} card${n === 1 ? '' : 's'}: keep ${src}`, fn: () => pickFromHand({ n, title: src, verb: 'discard', note: `Discard ${n} or ${src} is sacrificed.`, ok: () => true, choose: true, cancel: true, done: ids => { for (const id of ids) moveCard(id, 'graveyard'); log(`${src}: discarded ${ids.length}, so it stays`); render(); } }) };
  } else if ((q = /^pay ((?:\{[^}]+\})+)$/i.exec(cost))) {
    yes = { full: true, label: `Pay ${q[1]}: keep ${src}`, fn: () => { const f = findCard(obj.sourceId); payManaThen(f ? f.card : null, q[1], `${src}: ${q[1]}`, () => log(`${src}: paid ${q[1]}, so it stays`)); } };
  } else if ((q = /^pay (\d+) life$/i.exec(cost))) {
    yes = { full: true, label: `Pay ${q[1]} life: keep ${src}`, fn: () => { if (state.life < +q[1]) { toast('Not enough life', `You cannot pay ${q[1]} life.`); return; } changeLife(-q[1], true); log(`${src}: paid ${q[1]} life, so it stays`); } };
  } else if ((q = /^sacrifice (an?|one|two|\d+) (?:other |another )?([a-z ]+)$/i.exec(cost)) && SU_TYPES.test(q[2])) {
    const n = SU_NUM(q[1]); yes = { full: true, label: `Sacrifice ${n === 1 ? 'a' : n} ${q[2]}: keep ${src}`, fn: () => pickPerm(q[2], `Choose ${n} ${q[2]} to sacrifice. ${src} is sacrificed if you don't.`, n, c => pcPermIsCard(c, q[2].split(' ').pop()), ids => { for (const id of ids) moveCard(id, 'graveyard'); log(`${src}: sacrificed ${ids.length} permanent${ids.length === 1 ? '' : 's'}, so it stays`); render(); }) };
  } else if ((q = /^tap (an?|one|two|\d+) untapped ([a-z ]+?)(?: you control)?$/i.exec(cost)) && SU_TYPES.test(q[2])) {
    const n = SU_NUM(q[1]); yes = { full: true, label: `Tap ${n === 1 ? 'an' : n} untapped ${q[2]}: keep ${src}`, fn: () => pickPerm(q[2], `Choose ${n} untapped ${q[2]} you control to tap. ${src} is sacrificed if you don't.`, n, c => !c.tapped && pcPermIsCard(c, q[2].split(' ').pop()), ids => { for (const id of ids) toggleTap(id); log(`${src}: tapped ${ids.length}, so it stays`); render(); }) };
  }
  if (!yes) yes = { full: true, label: `I did it by hand (${cost}): keep ${src}`, fn: () => log(`${src}: "${cost}" done by hand, so it stays`) };
  return [yes, no];
}
