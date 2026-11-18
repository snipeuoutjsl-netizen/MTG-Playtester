// ---- More static abilities read from rules text (v0.99.7)
//  CR 502.3 + 614 "As long as ~ is untapped, players can't untap more than one land during their untap steps."  (Winter Orb, Static Orb)
//  CR 119.7 + 614.1 "If a player would gain life, that player gains no life instead."  (Sulfuric Vortex)
//  CR 614.6 "If a nontoken creature would enter and it wasn't cast, exile it instead."  (Containment Priest)
//  CR 508.1c/509.1b "~ can't attack or block unless you control another creature with power 4 or greater."  (Rhonas the Indomitable)
//  CR 613.1f/613.4b "All creatures lose all abilities and have base power and toughness 1/1."  (Humility) — layer effects from any permanent's static line
//  Opponent-side statics (Propaganda, Leyline of the Void) are recognised and stated, because a goldfish game has no opposing attackers or graveyard.
GLOBAL_STATIC_RES.push(
  /^As long as ~ is untapped, players can't untap more than (?:one|two|three|four|\d+) (?:lands?|permanents|artifacts|creatures) during their untap steps\.?$/i,
  /^If a player would gain life, that player gains no life instead\.?$/i,
  /^If a nontoken creature would enter and it wasn't cast, exile it instead\.?$/i,
  /^~ can't (?:attack|block|attack or block) unless you control (?:another|an?) [a-z ]+? with (?:power|toughness) \d+ or greater\.?$/i,
  /^All (?:creatures|lands|artifacts|enchantments|permanents) (?:lose all abilities|are|have base power and toughness)\b.*$/i);
const OPP_STATIC_RES = [/^Creatures can't attack you unless their controller pays \{\d+\} for each creature they control that's attacking you\.?$/i,
  /^If a card would be put into an opponent's graveyard from anywhere, exile it instead\.?$/i];
const oppOnlyStatic = line => OPP_STATIC_RES.some(re => re.test(String(line || '').trim().replace(/’/g, "'")));
const selfLn = (g, ln) => ln.replace(selfNameRe(g.name), '~');
const USW_NUM = { one: 1, two: 2, three: 3, four: 4 };
function untapWithLimits(pend, held) {
  if (!pend.length) return;
  const rules = [];
  for (const g of state.battlefield) { if (g.token || g.tapped) continue; const i = cardInfo(g.name); if (!i || !i.tx) continue;
    for (const ln of i.tx.replace(/\([^)]*\)/g, '').replace(/’/g, "'").split('\n')) { const m = selfLn(g, ln.trim()).match(/^As long as ~ is untapped, players can't untap more than (one|two|three|four|\d+) (lands?|permanents|artifacts|creatures) during their untap steps\.?$/i);
      if (m) rules.push({ g, n: USW_NUM[m[1].toLowerCase()] || +m[1], word: m[2].toLowerCase().replace(/s$/, '') }); } }
  let free = pend.slice();
  for (const r of rules) {
    const kind = r.word === 'permanent' ? null : r.word, set = free.filter(c => pcPermIs(c, kind));
    if (set.length <= r.n) continue;
    free = free.filter(c => !set.includes(c));
    held.push(`${set.length - r.n} ${r.word}${set.length - r.n === 1 ? '' : 's'} (${r.g.name})`);
    const keepOpts = set;
    setTimeout(() => openPickCards({ title: `${r.g.name}: untap only ${r.n}`, note: `${r.g.name} says players can't untap more than ${r.n} ${r.word}${r.n === 1 ? '' : 's'} during their untap steps. Choose which ${r.n} to untap; the rest stay tapped.`, cards: keepOpts, max: r.n, min: r.n, done: picked => { snap(); for (const c of picked) { c.tapped = false; delete c.mt; log(`${r.g.name}: untapped ${c.name}`); } render(); } }), 0);
  }
  for (const c of free) { c.tapped = false; delete c.mt; }
}
const lifeGainBlocked = () => globalHas(/^If a player would gain life, that player gains no life instead\.?$/i);
function priestExiles(c, from) {
  if (!c || c.token || from === 'stack' || !/\bCreature\b/.test(frontType(c) || '')) return null;
  const g = globalHas(/^If a nontoken creature would enter and it wasn't cast, exile it instead\.?$/i); return g ? g.g : null;
}
function selfCantUnless(c, kind) {   // why this creature can't attack/block right now, from its own "can't attack or block unless ..." line
  const info = c.token ? null : cardInfo(c.name); if (!info || !info.tx) return '';
  for (const ln of info.tx.replace(/\([^)]*\)/g, '').replace(/’/g, "'").split('\n')) {
    const m = selfLn(c, ln.trim()).match(/^~ can't (attack|block|attack or block) unless you control (another|an?) ([a-z ]+?) with (power|toughness) (\d+) or greater\.?$/i); if (!m) continue;
    if (!new RegExp('\\b' + kind + '\\b').test(m[1])) continue;
    const word = m[3].toLowerCase(), ok = state.battlefield.some(x => (m[2].toLowerCase() !== 'another' || x.id !== c.id) && pcPermIs(x, PC_TYPES[word] === undefined ? null : PC_TYPES[word]) && (() => { const r = ptCalc(x); return !r.unknown && (m[4].toLowerCase() === 'power' ? r.p : r.t) >= +m[5]; })());
    if (!ok) return `${c.name} can't ${kind} unless you control ${m[2].toLowerCase()} ${word} with ${m[4].toLowerCase()} ${m[5]} or greater.`;
  }
  return '';
}
const GLOBAL_OVR_PARSED = new Map(); let inGlobalOvr = false;
function globalOvrFor(c) {   // layer 4-7 effects from any permanent's "All creatures lose all abilities and have base power and toughness 1/1"
  if (!state || inGlobalOvr || !c) return [];
  const out = [];
  for (const g of state.battlefield) { if (g.token) continue; const i = cardInfo(g.name); if (!i || !i.tx || !/\b(?:All|Each) (?:creatures|lands|artifacts|enchantments|permanents) (?:lose|are|have)\b/.test(i.tx)) continue;
    for (const ln of i.tx.replace(/\([^)]*\)/g, '').replace(/’/g, "'").split('\n')) {
      const m = ln.trim().match(/^(?:All|Each) ([a-z]+) ((?:lose all abilities|are|have base power and toughness) .+)$/i); if (!m) continue;
      let ent = GLOBAL_OVR_PARSED.get(m[0]); if (ent === undefined) { ent = parseCharChange(m[2]); GLOBAL_OVR_PARSED.set(m[0], ent); } if (!ent) continue;
      inGlobalOvr = true; let hit = false; try { const S = parseMassSet(m[1], { sourceId: g.id }); hit = !!S && massMatch(c, S, g.id); } finally { inGlobalOvr = false; }
      if (hit) out.push(ent);
    } }
  return out;
}

// CR 401.5 + 305.2: "Play with the top card of your library revealed." and "You may play lands from the top of your library." (Courser of Kruphix, Oracle of Mul Daya)
GLOBAL_STATIC_RES.push(/^Play with the top card of your library revealed\.?$/i, /^You may play lands from the top of your library\.?$/i);
const topRevealSource = () => state ? globalHas(/^Play with the top card of your library revealed\.?$/i) : null;
const topLandSource = () => state ? globalHas(/^You may play lands from the top of your library\.?$/i) : null;
function topLandPlayable() {
  if (!state || state.phase !== 'play' || !topLandSource() || !state.library.length) return false;
  const c = state.library[0]; return !c.token && isLandName(c.name) && canPlayLandNow();
}
function playTopLand() {
  if (!topLandSource()) return;
  if (!state.library.length || !isLandName(state.library[0].name)) { toast('No land on top', 'The top card of your library is not a land.'); return; }
  if (!canPlayLandNow()) { toast(landDropUsed() ? 'Land already played' : 'Wrong phase', landDropUsed() ? 'You have already used all your land plays this turn.' : 'Lands can only be played during your main phase when the stack is empty.'); return; }
  snap(); const [c] = state.library.splice(0, 1); state.landsPlayed = (state.landsPlayed || 0) + 1; state.landPlayedThisTurn = state.landsPlayed >= landDropsAllowed();
  enterBattlefield(c, { from: 'library', logMsg: `Played land from the top of your library: ${c.name} (${topLandSource().g.name})` });
  render(); if (state.pendingTriggers.length) resolvePendingTrigger();
}
function renderTopReveal() {   // a small label under the library showing the revealed top card
  const ls = $('#libstack'); if (!ls) return; let el = $('#libTop');
  const src = topRevealSource(), c = src && state.library[0];
  if (!src) { if (el) el.remove(); return; }
  if (!el) { el = h('div', { id: 'libTop', class: 'libtop' }); ls.parentElement.append(el); }
  const info = c && !c.token ? cardInfo(c.name) : null;
  el.textContent = c ? `Top: ${c.name}` : 'Top: (empty)'; el.title = `${src.g.name}: you play with the top card of your library revealed.` + (info && info.t ? ` ${info.t}` : '');
  el.classList.toggle('land', !!c && isLandName(c.name));
}

// ---- Vehicles: Crew (CR 702.122, 301.7)
const crewCands = (vehicle) => state.battlefield.filter(x => x.id !== vehicle.id && !x.tapped && permTypeInfo(x).types.has('creature'));
const crewPow = x => { const r = ptCalc(x); return r && !r.unknown ? Math.max(0, r.p) : 0; };
const crewPower = vehicle => crewCands(vehicle).reduce((n, x) => n + crewPow(x), 0);
function crewPick(vehicle, n, cb) {
  const cands = crewCands(vehicle);
  if (crewPower(vehicle) < n) { toast('Cannot crew', `${vehicle.name} needs untapped creatures with total power ${n} or more (you have ${crewPower(vehicle)}).`); return; }
  openPickCards({ title: `${vehicle.name}: Crew ${n}`, note: `Tap any number of untapped creatures you control with total power ${n} or more. Summoning-sick creatures can crew. Their powers are shown on the cards.`, cards: cands, min: 1, max: cands.length,
    done: picked => { const sum = picked.reduce((a, x) => a + crewPow(x), 0);
      if (sum < n) { toast('Not enough power', `Those creatures have total power ${sum}; ${vehicle.name} needs ${n}.`); crewPick(vehicle, n, cb); return; }
      snap(); for (const x of picked) { x.tapped = true; } log(`${vehicle.name}: crewed by tapping ${picked.map(x => x.name).join(', ')} (total power ${sum})`); cb(); } });
}
function vehicleOptions(tx, obj) {
  if (!state || !/^~ becomes an artifact creature until end of turn\.?$/i.test(String(tx || '').replace(selfNameRe((obj && obj.sourceName) || ''), '~').trim())) return null;
  const nm = (obj && obj.sourceName) || 'Vehicle';
  return [{ full: true, label: `${nm} becomes an artifact creature until end of turn`, fn: () => { const f = obj && obj.sourceId ? findCard(obj.sourceId) : null, c = f && f.zone === 'battlefield' ? f.card : state.battlefield.find(x => x.name === nm); if (!c) { log(`${nm} is no longer on the battlefield`); render(); return; }
    const i = cardInfo(c.name); snap(); c.becomes = { pt: (i && i.pt) || '0/0', types: ['artifact', 'creature'], subs: ['vehicle'], kws: [] };
    addFx({ kind: 'delayed', when: 'end', action: 'unbecome', targetId: c.id, targetName: c.name, text: `${c.name}: it stops being a creature.`, srcName: nm }); log(`${nm} becomes an artifact creature until end of turn (${c.becomes.pt})`); render(); } }];
}
