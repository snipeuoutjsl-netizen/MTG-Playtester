// ---------------------------------------------------------------- keyword abilities and actions from the Comprehensive Rules (v0.96.1)
// One table drives every triggered keyword: KW_TRIGGERS says which keyword (CR number), when it triggers, an optional test (a rules condition
// checked as it triggers), and the printed effect. KW_EFFECTS turns a resolving keyword trigger into the options in the effect window.
// Keyword ACTIONS written inside card text ("Bolster 2", "Adapt 3", "Connive", "Discover 4") are read by kwActionOptions.
const kwPow = c => { const r = ptCalc(c); return r.p; };
// CR 702.1 + Oracle style: a keyword whose cost is not mana is written "Keyword\u2014Cost." with no spaces round the dash (Cumulative upkeep\u2014Pay 1 life., Echo\u2014Discard a card.),
// so that line is one keyword item even though it ends in a period. An ability word (CR 207.2c) is written with spaces ("Landfall \u2014 Whenever ...") and is not a keyword.
const kwItems = tx => { const out = []; for (const line of String(tx || '').replace(/\([^)]*\)/g, ' ').split('\n')) { const dash = line.trim().match(/^([A-Z][a-z]+(?: [a-z]+){0,2})\u2014(\S.*?)\.?$/); if (dash) { out.push(dash[1] + '\u2014' + dash[2]); continue; } if (/[.:]/.test(line.replace(/\d+\.\d/g, ''))) continue; for (const it of line.split(/[,;]/)) { const s = it.trim(); if (s) out.push(s); } } return out; };
const KW_TRIGGERS = [
  { cr: '702.83', kw: 'exalted', ev: 'attack-any', cond: 'Exalted: whenever a creature you control attacks alone', text: 'Whenever a creature you control attacks alone, that creature gets +1/+1 until end of turn.', test: (c, atk) => atk.length === 1 },
  { cr: '702.91', kw: 'battle cry', ev: 'attack-self', cond: 'Battle cry: whenever this creature attacks', text: 'Whenever this creature attacks, each other attacking creature gets +1/+0 until end of turn.' },
  { cr: '702.86', kw: 'annihilator', ev: 'attack-self', cond: 'Annihilator: whenever this creature attacks', text: 'Whenever this creature attacks, defending player sacrifices N permanents.' },
  { cr: '702.100', kw: 'evolve', ev: 'etb-other', filter: 'creature', cond: 'Evolve: whenever a creature you control enters', text: 'Whenever a creature you control enters, if that creature has greater power or toughness than this creature, put a +1/+1 counter on this creature.',
    test: (c, e) => { if (!/\bCreature\b/.test(permTypeLine(e))) return false; const a = ptCalc(c), b = ptCalc(e); return b.p > a.p || b.t > a.t; } },
  { cr: '702.112', kw: 'renown', ev: 'combat-damage-self', cond: 'Renown: whenever this creature deals combat damage to a player', text: 'Whenever this creature deals combat damage to a player, if it is not renowned, put N +1/+1 counters on it and it becomes renowned.', test: c => !c.renowned },
  { cr: '702.134', kw: 'mentor', ev: 'attack-self', cond: 'Mentor: whenever this creature attacks', text: 'Whenever this creature attacks, put a +1/+1 counter on target attacking creature with lesser power.', test: (c, atk) => atk.some(x => x.id !== c.id && kwPow(x) < kwPow(c)) },
  { cr: '702.149', kw: 'training', ev: 'attack-self', cond: 'Training: whenever this creature attacks with another creature with greater power', text: 'Whenever this creature and at least one other creature with greater power attack, put a +1/+1 counter on this creature.', test: (c, atk) => atk.some(x => x.id !== c.id && kwPow(x) > kwPow(c)) },
  { cr: '702.104', kw: 'dethrone', ev: 'attack-self', cond: 'Dethrone: whenever this creature attacks the player with the most life', text: 'Whenever this creature attacks the player with the most life or tied for most life, put a +1/+1 counter on this creature.', test: () => (state.oppLife ?? 20) >= state.life },
  { cr: '702.121', kw: 'melee', ev: 'attack-self', cond: 'Melee: whenever this creature attacks', text: 'Whenever this creature attacks, it gets +1/+1 until end of turn for each opponent you attacked this combat.' },
  { cr: '702.123', kw: 'fabricate', ev: 'etb-self', cond: 'Fabricate: when this permanent enters', text: 'When this permanent enters, you may put N +1/+1 counters on it. If you don\'t, create N 1/1 colorless Servo artifact creature tokens.' },
  { cr: '702.43', kw: 'modular', ev: 'dies-self', cond: 'Modular: when this creature dies', text: 'When this creature dies, you may put its +1/+1 counters on target artifact creature.' },
  { cr: '702.54', kw: 'bloodthirst', ev: 'etb-self', cond: 'Bloodthirst: as this creature enters', text: 'If an opponent was dealt damage this turn, this creature enters with N +1/+1 counters on it.' },
  { cr: '702.101', kw: 'extort', ev: 'cast', filter: '', cond: 'Extort: whenever you cast a spell', text: 'Whenever you cast a spell, you may pay {W/B}. If you do, each opponent loses 1 life and you gain that much life.' },
  { cr: '702.136', kw: 'riot', ev: 'etb-self', cond: 'Riot: as this creature enters', text: 'This creature enters with your choice of a +1/+1 counter or haste.' }
];
// The triggers a card's keyword line gives it (appended to parseTriggers' result).
function kwTriggersFor(info) {
  const out = []; if (!info || !info.tx) return out;
  const items = kwItems(info.tx);
  for (const k of KW_TRIGGERS) for (const it of items) {
    const m = it.match(new RegExp('^' + k.kw + '(?:(?:\\s+|\\s*[\\u2014-]\\s*)(.+))?$', 'i')); if (!m) continue;   // v0.96.7 the argument can be a number, a mana cost or a whole cost ("Cumulative upkeep\u2014Pay 1 life")
    const n = m[1] && /^\d+$/.test(m[1]) ? +m[1] : (k.kw === 'modular' || k.kw === 'mobilize' || k.kw === 'frenzy' || k.kw === 'devour' || k.kw === 'fabricate' || k.kw === 'renown' || k.kw === 'bloodthirst' || k.kw === 'annihilator' ? 1 : 0);
    const arg = m[1] || ''; out.push({ arg, ev: k.ev, cond: k.cond, effect: k.text.replace(/\bN\b/g, String(n)), line: `${it} (keyword, CR ${k.cr}): ${k.text.replace(/\bN\b/g, String(n))}`, filter: k.filter || '', optional: false, special: 'kw', kw: k.kw, n, arg, test: k.test || null });
    break;
  }
  for (const raw of String(info.tx).replace(/\([^)]*\)/g, ' ').split('\n')) {   // CR 701.43d "You may exert ~ as it attacks. When you do, ..."
    const em = raw.trim().match(/^You may exert (?:~|this \w+|[^.]*?) as it attacks\.(?:\s*When you do,\s*(.*))?$/i); if (!em && !/^You may exert .* as it attacks/i.test(raw.trim())) continue;
    const rest = em && em[1] ? em[1] : '';
    out.push({ ev: 'attack-self', cond: 'You may exert it as it attacks', effect: 'You may exert it as it attacks. It won\'t untap during your next untap step.' + (rest ? ' When you do, ' + rest : ''), line: raw.trim() + ' (exert, CR 701.43)', filter: '', optional: true, special: 'kw', kw: 'exert', n: 0, arg: rest, test: null });
  }
  return out;
}
const KW_EFFECTS = {
  'exalted': obj => { const a = state.combat.attackers || []; const id = a[0]; const f = id && findCard(id); return [{ full: true, label: f ? `${f.card.name} gets +1/+1 until end of turn (exalted)` : 'The lone attacker gets +1/+1 until end of turn', fn: () => { if (f) addTempPT(f.card.id, 1, 1); } }]; },
  'battle cry': obj => { const o = (state.combat.attackers || []).filter(i => i !== obj.sourceId); return [{ full: true, label: o.length ? `Each other attacking creature gets +1/+0 until end of turn (${o.length})` : 'No other attacking creature', fn: () => o.forEach(i => addTempPT(i, 1, 0)) }]; },
  'annihilator': obj => [{ full: true, label: `Defending player sacrifices ${obj.n || 1} permanent${(obj.n || 1) === 1 ? '' : 's'} (nothing to do: the opponent's board is not tracked)`, fn: () => log(`${obj.sourceName}: annihilator ${obj.n || 1}, the defending player sacrifices that many permanents`) }],
  'evolve': obj => [{ full: true, label: `Put a +1/+1 counter on ${obj.sourceName}`, fn: () => addCounter(obj.sourceId, 1, 'plus') }],
  'renown': obj => [{ full: true, label: `Put ${obj.n || 1} +1/+1 counter${(obj.n || 1) === 1 ? '' : 's'} on ${obj.sourceName}; it becomes renowned`, fn: () => { const f = findCard(obj.sourceId); if (!f || f.card.renowned) return; f.card.renowned = true; addCounter(obj.sourceId, obj.n || 1, 'plus'); } }],
  'mentor': obj => { const f = findCard(obj.sourceId), cands = f ? (state.combat.attackers || []).map(findCard).filter(x => x && x.card.id !== f.card.id && kwPow(x.card) < kwPow(f.card)) : []; return cands.map(x => ({ full: true, label: `Put a +1/+1 counter on ${x.card.name}`, fn: () => addCounter(x.card.id, 1, 'plus') })); },
  'training': obj => [{ full: true, label: `Put a +1/+1 counter on ${obj.sourceName}`, fn: () => addCounter(obj.sourceId, 1, 'plus') }],
  'dethrone': obj => [{ full: true, label: `Put a +1/+1 counter on ${obj.sourceName}`, fn: () => addCounter(obj.sourceId, 1, 'plus') }],
  'melee': obj => [{ full: true, label: `${obj.sourceName} gets +1/+1 until end of turn`, fn: () => addTempPT(obj.sourceId, 1, 1) }],
  'fabricate': obj => { const n = obj.n || 1; return [
    { full: true, label: `Put ${n} +1/+1 counter${n === 1 ? '' : 's'} on ${obj.sourceName}`, fn: () => addCounter(obj.sourceId, n, 'plus') },
    { full: true, label: `Create ${n} 1/1 colorless Servo artifact creature token${n === 1 ? '' : 's'}`, fn: () => { for (let i = 0; i < n; i++) makeToken('Servo', '1/1'); } }]; },
  'modular': obj => { const f = findCard(obj.sourceId) || { card: { counters: {} } }, k = (typeof f.card.counters === 'object' && f.card.counters && f.card.counters.plus) || (obj.lastCounters || 0); return state.battlefield.filter(c => /\bArtifact\b/.test(permTypeLine(c)) && /\bCreature\b/.test(permTypeLine(c))).map(c => ({ full: true, label: `Put ${k || 'its'} +1/+1 counter${k === 1 ? '' : 's'} on ${c.name}`, fn: () => { if (k) addCounter(c.id, k, 'plus'); } })); },
  'bloodthirst': obj => [{ full: true, label: `An opponent was dealt damage this turn: put ${obj.n || 1} +1/+1 counter${(obj.n || 1) === 1 ? '' : 's'} on ${obj.sourceName}`, fn: () => addCounter(obj.sourceId, obj.n || 1, 'plus') }],
  'miracle': obj => { const f = findCard(obj.sourceId); return f && f.zone === 'hand' ? [{ full: true, label: `Reveal ${f.card.name} and cast it for its miracle cost`, fn: () => { f.card.miracleNow = true; castSpell(f.card.id); } }] : []; },
  'extort': obj => [{ full: true, label: 'I paid {W/B} (tap the mana first): each opponent loses 1 life and you gain 1', fn: () => { changeOppLife(-1); changeLife(1, true); } }],
  'riot': obj => [{ full: true, label: `Put a +1/+1 counter on ${obj.sourceName}`, fn: () => addCounter(obj.sourceId, 1, 'plus') }, { full: true, label: `${obj.sourceName} gains haste`, fn: () => addKwFx(obj.sourceId, 'haste', { until: 'permanent' }) }]
};
// Keyword actions inside effect text (CR 701): bolster, adapt, connive, discover.
function kwActionOptions(tx, obj, opts) {
  kwActionOptions2(tx, obj, opts);   // v0.96.9 monstrosity, populate
  let m; const t = String(tx || '').replace(/\([^)]*\)/g, ' ');
  if ((m = t.match(/\bbolster (\d+|X)\b/i)) && m[1] !== 'X') {   // CR 701.39: the creature with the least toughness among creatures you control gets the counters
    const n = +m[1], lab = `Bolster ${n}: put ${n} +1/+1 counter${n === 1 ? '' : 's'} on your creature with the least toughness`;
    opts.push({ full: true, label: lab, fn: () => {
      const cr = state.battlefield.filter(c => /\bCreature\b/.test(permTypeLine(c))); if (!cr.length) { log('Bolster: you control no creatures'); return; }
      const low = Math.min(...cr.map(c => ptCalc(c).t)), tied = cr.filter(c => ptCalc(c).t === low);
      if (tied.length === 1) { addCounter(tied[0].id, n, 'plus'); return; }
      openPickCards({ title: 'Bolster: choose among the tied creatures', cards: tied, max: 1, min: 1, note: `These creatures are tied for the least toughness (${low}). You choose which gets the counters.`, done: picked => { const c = picked[0]; if (c) addCounter(c.id ?? c, n, 'plus'); } });   // openPickCards hands back the chosen cards
    } });
  }
  if ((m = t.match(/\badapt (\d+)\b/i)) && obj && obj.sourceId) {   // CR 701.46: only if it has no +1/+1 counters on it
    const n = +m[1];
    opts.push({ full: true, label: `Adapt ${n}: if ${obj.sourceName} has no +1/+1 counters, put ${n} on it`, fn: () => { const f = findCard(obj.sourceId); if (!f) return; const cc = f.card.counters; const has = typeof cc === 'number' ? cc > 0 : !!(cc && cc.plus > 0); if (has) { log(`${f.card.name}: adapt does nothing, it already has +1/+1 counters`); return; } addCounter(f.card.id, n, 'plus'); } });
  }
  if (/\bconnive\b/i.test(t) && obj && obj.sourceId && !/\bconnives?\s+(?:to|with)\b/i.test(t)) {   // CR 701.50: draw, then discard; a nonland discard gives a +1/+1 counter
    opts.push({ full: true, label: `${obj.sourceName} connives (draw a card, discard a card; a nonland card discarded gives it a +1/+1 counter)`, fn: () => {
      snap(); const d = drawCards(1); log(`${obj.sourceName}: connive, drew ${d}`); render();
      if (!state.hand.length) return;
      pickFromHand({ n: 1, title: obj.sourceName, verb: 'discard', choose: true, note: 'Connive: discard a card. If it is not a land card, put a +1/+1 counter on the creature that connived.', done: ids => { const c = state.hand.find(x => x.id === ids[0]); if (!c) return; const land = isLandName(c.name); moveCard(c.id, 'graveyard'); log(`${obj.sourceName}: discarded ${c.name}`); if (!land) addCounter(obj.sourceId, 1, 'plus'); render(); } });
    } });
  }
  if ((m = t.match(/\bdiscover (\d+)\b/i))) {   // CR 701.57: exile until a nonland card with mana value N or less; cast it free or put it in hand; the rest go to the bottom at random
    const n = +m[1];
    opts.push({ full: true, label: `Discover ${n}`, fn: () => openDiscover(n, obj && obj.sourceName) });
  }
}
function openDiscover(n, srcName) {
  snap(); const seen = []; let hit = null;
  while (state.library.length) { const c = state.library.shift(); seen.push(c); const i = cardInfo(c.name); if (i && !i.land && !isLandName(c.name) && i.cmc <= n) { hit = c; break; } }
  const m = modal(`Discover ${n}`, { width: 560, sticky: true, noClose: true });
  m.body.append(h('div', { class: 'psub', text: hit ? `Exiled ${seen.length} card${seen.length === 1 ? '' : 's'}. The first nonland card with mana value ${n} or less is ${hit.name}. Cast it without paying its mana cost, or put it into your hand. The other exiled cards go to the bottom of your library in a random order.` : `No nonland card with mana value ${n} or less was found. All ${seen.length} exiled cards go to the bottom of your library in a random order.` }),
    h('div', { class: 'prelist' }, seen.map(c => h('div', { class: 'row' }, h('span', { class: 'nm', text: c.name }), c === hit ? h('span', { class: 'ok', text: 'hit' }) : h('span', { class: 'muted small', text: 'bottom' })))));
  const finish = how => {
    m.close(); const rest = seen.filter(c => c !== hit || !how); state.library.push(...shuffle([...rest]));
    if (how === 'cast') { noteCast(hit); state.stack.push(hit); state.priority = { active: true, passed: false }; log(`Discover: cast ${hit.name} without paying its mana cost`); fireTrigger('cast', { card: hit }); }
    else if (how === 'hand') { state.hand.push(hit); log(`Discover: put ${hit.name} into your hand`); }
    else log(`Discover: nothing found, ${seen.length} cards on the bottom`);
    render(); if (how === 'cast') { if (state.pendingTriggers.length) resolvePendingTrigger(); else openStack(); }
  };
  if (hit) m.foot.append(h('button', { text: 'Put into hand', onclick: () => finish('hand') }), h('button', { class: 'primary', text: `Cast ${hit.name} free`, onclick: () => finish('cast') }));
  else m.foot.append(h('button', { class: 'primary', text: 'OK', onclick: () => finish(null) }));
}
