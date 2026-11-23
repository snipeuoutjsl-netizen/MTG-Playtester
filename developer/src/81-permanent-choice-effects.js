// ---- v0.99.44 effects that pick permanents you control as they resolve (no targets), and effects on the object that caused a trigger.
// "Return a land you control to its owner's hand." (bounce lands)   "Sacrifice two lands." (Lotus Field)   CR 608.2c / 701.21a: the choice is made
// on resolution, it is not targeted, and you must choose as many as you can (the permanent itself counts if it matches).
// "Untap it." / "Tap that creature." in a triggered ability means the object the trigger event was about (CR 603.2 + 608.2c), kept as obj.otherId.
const PCHOICE_TYPES = ['land', 'creature', 'artifact', 'enchantment', 'planeswalker', 'permanent', 'nonland permanent', 'battle'];
function pcMatches(desc, c) {
  const d = String(desc).toLowerCase().replace(/s$/, '').trim(); if (d === 'permanent') return true;
  if (d === 'nonland permanent') return !isLandName(c.name);
  return filterMatches(d, c);
}
function permChoiceOptions(tx, obj) {   // one sentence is read here; the sentences after it are read as usual (massRest)
  const sents = MASS_SENTS(tx); if (!sents.length) return null;
  const sc = scapeshiftOptions(sents, obj); if (sc) return sc;
  const po = payOrElseOptions(sents, obj); if (po) return po;
  const gz = graveyardSelfOptions(sents.join(' '), obj); if (gz) return gz;
  if (sents.length > 1 && /^If you (?:do|don't)\b/i.test(sents[1])) return null;   // "Sacrifice X. If you do, ..." is read by the if-you-do reader (CR 608.2c)
  const one = permChoiceOne(sents[0], obj); if (!one) return null;
  if (sents.length === 1) return one; return [...one.map(o => ({ ...o, full: false })), ...massRest(sents, 1, obj)];
}
// Scapeshift: "Sacrifice any number of lands. Search your library for up to that many land cards, put them onto the battlefield tapped, then shuffle."
// Genesis Device: "Sacrifice any number of lands you control, then search your library for up to that many land cards, ..." (CR 608.2c: "that many" is how many were sacrificed)
function scapeshiftOptions(sents, obj) {
  const all = sents.join(' '), m = all.match(/^sacrifice any number of ([a-z ]+?)(?: you control)?(?:\.|, then) (search your library for up to that many .+)$/i); if (!m) return null;
  const desc = m[1], rest = m[2].replace(/^search/, 'Search'), src = (obj && obj.sourceName) || 'It';
  return [{ full: true, label: `Sacrifice any number of ${desc}, then search for that many land cards`, fn: () => {
    const cands = state.battlefield.filter(c => !c.opp && pcMatches(desc, c));
    openPickCards({ title: `${src}: sacrifice any number of ${desc}`, note: 'Then you search your library for up to that many land cards.', cards: cands, max: cands.length, nothing: 'Sacrifice none', done: picked => {
      snap(); simultaneously(() => { for (const p of picked) { const f = findCard(p.id); if (f && f.zone === 'battlefield') { log(`${src}: sacrificed ${f.card.name}`); leaveBattlefield(f.card, 'graveyard'); } } });
      const n = picked.length; render(); if (!n) { log(`${src}: no lands sacrificed, so it searches for none`); shuffleLib && shuffleLib(); return; }
      const se = searchEffect(rest.replace(/up to that many/i, `up to ${n}`), src, obj); if (se && se.fn) se.fn(); else toast('Search', `Search your library for up to ${n} land cards by hand.`); } });
  } }];
}
// Summoner's Pact's delayed trigger: "Pay {2}{G}{G}. If you don't, you lose the game." (CR 117.3 + 104.3a)
function payOrElseOptions(sents, obj) {
  if (sents.length !== 2) return null; const a = sents[0].match(/^pay ((?:\{[^}]+\})+)\.?$/i), b = sents[1].match(/^If you don't, (.+?)\.?$/i); if (!a || !b) return null;
  const cost = a[1], src = (obj && obj.sourceName) || 'It', lose = /^you lose the game$/i.test(b[1]);
  const fail = () => { if (lose) { log(`${src}: you did not pay ${cost}, so you lose the game (CR 104.3a)`); state.lossShown = 'pact'; lethalFx('you', `${src}: did not pay ${cost}`, 'In a real game you would lose here.'); } else { log(`${src}: you did not pay ${cost}: ${b[1]}`); toast('Not paid', `${src}: ${b[1]}. Carry it out by hand.`); } render(); };
  return [{ full: false, label: `Pay ${cost}`, fn: () => { const card = obj && obj.sourceId ? (findCard(obj.sourceId) || {}).card || { name: src } : { name: src }; if (!payManaThen(card, cost, `${src}: pay ${cost}`, () => log(`${src}: paid ${cost}`))) {} } },
    { full: false, label: `Don't pay (${lose ? 'you lose the game' : b[1]})`, fn: fail }];
}
function permChoiceOne(tx, obj) {
  const t = String(tx || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim(); let m;
  if (obj && obj.sourceName && selfShuffleRe(obj.sourceName).test(t) && /^shuffle /i.test(t)) return [{ full: true, label: `${obj.sourceName} is shuffled into your library as it finishes resolving (CR 608.2n)`, fn: () => {} }];
  // CR 707.2 + 613.2: "This land becomes a copy of target nontoken artifact you control with mana value X." (The Mycosynth Gardens)
  // "This land becomes a copy of target permanent card in your graveyard until end of turn." (Shifting Woodland). It keeps its tapped state and counters.
  if (obj && obj.sourceId && (m = t.match(/^(?:~|this \w+) becomes a copy of target (.+?)(?: you control)?( in your graveyard)?( with mana value X)?( until end of turn)?\.?$/i)) && !/land, except it has this ability/i.test(t)) {
    const desc = m[1].toLowerCase(), gy = !!m[2], wantX = !!m[3], eot = !!m[4], src = obj.sourceName || 'It';
    return [{ full: true, label: `${src} becomes a copy of ${gy ? 'a permanent card in your graveyard' : 'a ' + desc + ' you control'}${eot ? ' until end of turn' : ''}`, fn: () => {
      const f = findCard(obj.sourceId); if (!f || f.zone !== 'battlefield') { toast('Not on the battlefield', `${src} is no longer on the battlefield.`); return; }
      const c = f.card, x = obj.xValue !== undefined ? +obj.xValue : null;
      const ok = k => { const ty = (cardInfo(k.name) || {}).t || ''; if (gy) return !/\b(?:Instant|Sorcery)\b/.test(ty) && !!ty; if (/nontoken/.test(desc) && k.token) return false; const core = desc.replace(/^nontoken\s+/, ''); return k.id !== c.id && filterMatches(core, k) && (!wantX || x === null || mvOf(cardInfo(k.name)) === x); };
      const doCopy = k => { snap(); if (!c.origName) c.origName = c.name; c.name = k.name; if (eot) c.copyEot = true; log(`${c.origName} became a copy of ${k.name}${eot ? ' until end of turn' : ''}`); render(); };
      const tg = (obj.targets || []).find(q => !q.gone && q.id !== undefined); if (tg) { const g = findCard(tg.id); if (g && (gy ? g.zone === 'graveyard' : g.zone === 'battlefield')) { doCopy(g.card); return; } toast('Target gone', `${tg.name || 'The target'} is no longer there, so ${src} does not change.`); return; }   // the target chosen as it was activated (CR 601.2c)
      const cands = (gy ? state.graveyard : state.battlefield.filter(k => !k.opp)).filter(ok); const seen = new Set(), list = cands.filter(k => !seen.has(k.name) && seen.add(k.name));
      if (!list.length) { toast('No target', gy ? 'There is no permanent card in your graveyard.' : `You control no ${desc}${wantX && x !== null ? ' with mana value ' + x : ''}.`); return; }
      openPickCards({ title: `${src}: copy which card?`, note: `${src} becomes a copy of it${eot ? ' until end of turn' : ''}. It stays tapped or untapped and keeps its counters; it does not enter the battlefield again, so no enters abilities trigger.${wantX ? ' Its mana value must equal the X you paid.' : ''}`, cards: list, max: 1, done: picked => {
        const k = picked[0]; if (k) doCopy(k); } }); } }];
  }
  const src = (obj && obj.sourceName) || 'It';
  if (obj && (obj.otherId !== undefined || obj.sourceId === -1) && (m = t.match(/^(?:then )?(?:you may )?(untap|tap) (?:it|that (?:permanent|creature|land|artifact))\.?$/i))) {
    const up = m[1].toLowerCase() === 'untap', may = /\byou may\b/i.test(t);
    return [{ full: !may, label: `${up ? 'Untap' : 'Tap'} the permanent that triggered ${src}`, fn: () => {
      const f = findCard(obj.otherId); if (!f || f.zone !== 'battlefield') { log(`${src}: that permanent is no longer on the battlefield`); return; }
      snap(); f.card.tapped = !up; log(`${src}: ${up ? 'untapped' : 'tapped'} ${f.card.name}`); render(); } }];
  }
  // Explore: "You may play an additional land this turn." (CR 305.2: an allowance for this turn)
  if ((m = t.match(/^(?:you may )?play (an|one|two|three|\d+) additional lands? this turn\.?$/i))) { const n = wordN(m[1]);
    return [{ full: true, label: `You may play ${n === 1 ? 'an additional land' : n + ' additional lands'} this turn`, fn: () => { snap(); state.extraLandDrops = (state.extraLandDrops || 0) + n; log(`${src}: you may play ${n === 1 ? 'an additional land' : n + ' additional lands'} this turn (${landDropsAllowed()} in all)`); render(); } }];
  }
  const verb = (m = t.match(/^(?:then )?(return|sacrifice) (a|an|one|two|three|four|five|\d+) ([a-z ,-]+?)(?: you control)?(?: to (?:its|their) owner'?s'? hands?)?\.?$/i));
  if (verb && PCHOICE_TYPES.includes(m[3].toLowerCase().replace(/s$/, '')) && (m[1].toLowerCase() === 'sacrifice' || /to (?:its|their) owner/i.test(t))) {
    const back = m[1].toLowerCase() === 'return', n = wordN(m[2]), desc = m[3];
    return [{ full: true, label: `${back ? 'Return' : 'Sacrifice'} ${m[2]} ${desc} you control${back ? ' to your hand' : ''} (you choose as it resolves)`, fn: () => {
      const cands = state.battlefield.filter(c => !c.opp && pcMatches(desc, c));
      if (!cands.length) { log(`${src}: you control no ${desc}, so nothing is ${back ? 'returned' : 'sacrificed'}`); return; }
      const need = Math.min(n, cands.length);
      const act = picked => { if (!picked.length) return; snap(); simultaneously(() => { for (const p of picked) { const f = findCard(p.id); if (!f || f.zone !== 'battlefield') continue; log(`${src}: ${back ? 'returned' : 'sacrificed'} ${f.card.name}${back ? ' to your hand' : ''}`); leaveBattlefield(f.card, back ? 'hand' : 'graveyard'); } });
        render(); if (state.pendingTriggers.length) flushTriggers(); };
      if (cands.length <= need && new Set(cands.map(c => c.name)).size <= 1 && cands.length === need) { act(cands); return; }   // no real choice
      openPickCards({ title: `${src}: ${back ? 'return' : 'sacrifice'} ${need === 1 ? `a ${desc.replace(/s$/, '')}` : `${need} ${desc}`}`, cards: cands, min: need, max: need,
        note: `${back ? 'Choose' : 'Choose'} ${need} you control (it can be ${src} itself if it qualifies). This is not targeted, and you must choose ${need === 1 ? 'one' : 'that many'} if you can.`, done: act });
    } }];
  }
  return null;
}

// CR 608.2n: "Shuffle Green Sun's Zenith into its owner's library." The spell's last instruction puts it into the library instead of the graveyard.
const selfShuffleRe = name => new RegExp("\\bshuffle (?:~|this card|" + String(name || '~').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ") into its owner's library\\b", 'i');
function shuffleSelfOnResolve(c) {
  if (!c || c.copy || c.token || !selfShuffleRe(c.name).test(cardText(c) || '')) return null;
  state.library.push(c); try { shuffleLib(); } catch (e) { /* no animation */ } return 'library (shuffled in, CR 608.2n)';
}

// ---- v0.99.45 graveyard creatures (manaless dredge). "~"/"this card" is the card itself (obj.sourceId).
function graveyardSelfOptions(t, obj) {
  if (!obj) return null; const src = obj.sourceName || 'It', me = () => { const f = obj.sourceId !== undefined ? findCard(obj.sourceId) : null; return f; };
  const SELF = "(?:~|this card|this creature|it|" + String(src).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ")";
  t = String(t).replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim(); let m;
  // Prized Amalgam: "if it entered from your graveyard or you cast it from your graveyard, return this card from your graveyard to the battlefield tapped at the beginning of the next end step."
  if ((m = t.match(new RegExp('^(?:if it entered from your graveyard or you cast it from your graveyard, )?return ' + SELF + ' from your graveyard to the battlefield( tapped)? at the beginning of the next end step\\.?$', 'i'))))
    return [{ full: true, label: `Return ${src} from your graveyard to the battlefield${m[1] ? ' tapped' : ''} at the beginning of the next end step`, fn: () => { const f = me(); if (!f || f.zone !== 'graveyard') { log(`${src}: not in your graveyard, so nothing will return`); return; }
      if (state.fx.some(e => e.kind === 'delayed' && e.action === 'returnBf' && e.targetId === f.card.id)) { log(`${src}: already returning at the next end step`); return; }   // several triggers: it can only return once (CR 400.7)
      addFx({ kind: 'delayed', when: 'end', action: 'returnBf', fromGy: true, tapped: !!m[1], targetId: f.card.id, targetName: src, srcName: src, text: `Return ${src} to the battlefield${m[1] ? ' tapped' : ''}.` }); log(`${src}: it will return to the battlefield${m[1] ? ' tapped' : ''} at the beginning of the next end step`); render(); } }];
  // Bloodghast: "you may return this card from your graveyard to the battlefield."
  if ((m = t.match(new RegExp('^(?:you may )?return ' + SELF + ' from your graveyard to the battlefield( tapped)?\\.?$', 'i'))))
    return [{ full: !/^you may/i.test(t), label: `Return ${src} from your graveyard to the battlefield${m[1] ? ' tapped' : ''}`, fn: () => { const f = me(); if (!f || f.zone !== 'graveyard') { log(`${src}: no longer in your graveyard`); return; } snap(); const gi = state.graveyard.findIndex(x => x.id === f.card.id); state.graveyard.splice(gi, 1); enterBattlefield(f.card, { from: 'graveyard', tapped: m[1] ? true : undefined, logMsg: `${src} returned from your graveyard to the battlefield` }); render(); flushTriggers(); } }];
  // Ichorid: "if this card is in your graveyard, you may exile a black creature card other than this card from your graveyard. If you do, return this card to the battlefield."
  if ((m = t.match(new RegExp('^(?:if ' + SELF + ' is in your graveyard, )?you may exile an? (.+?) card other than ' + SELF + ' from your graveyard\\. If you do, return ' + SELF + ' to the battlefield\\.?$', 'i')))) {
    const desc = m[1];
    return [{ full: false, label: `Exile ${/^[aeiou]/i.test(desc) ? 'an' : 'a'} ${desc} card from your graveyard to return ${src} to the battlefield`, fn: () => {
      const f = me(); if (!f || f.zone !== 'graveyard') { log(`${src}: no longer in your graveyard`); return; }
      const cands = state.graveyard.filter(x => x.id !== f.card.id && filterMatches(desc.replace(/\bcard\b/, '').trim() || desc, x)); if (!cands.length) { toast('Nothing to exile', `There is no other ${desc} card in your graveyard.`); return; }
      openPickCards({ title: `${src}: exile ${desc} card`, cards: cands, max: 1, done: picked => { const k = picked[0]; if (!k) return; snap(); simultaneously(() => { moveCardQuiet(k.id, 'exile'); const g = findCard(f.card.id); if (g && g.zone === 'graveyard') { const gi = state.graveyard.findIndex(x => x.id === g.card.id); state.graveyard.splice(gi, 1); enterBattlefield(g.card, { from: 'graveyard', logMsg: `${src}: exiled ${k.name}, so ${src} returns to the battlefield` }); } }); render(); } }); } }];
  }
  // Golgari Thug: "put target creature card from your graveyard on top of your library."
  if ((m = t.match(/^put target (.+?) card from your graveyard on top of your library\.?$/i))) { const desc = m[1];
    return [{ full: true, label: `Put ${/^[aeiou]/i.test(desc) ? 'an' : 'a'} ${desc} card from your graveyard on top of your library`, fn: () => {
      const tg = (obj.targets || []).find(q => q.id !== undefined); const go = k => { const i = state.graveyard.findIndex(x => x.id === k.id); if (i < 0) { toast('Target gone', `${k.name} is no longer in your graveyard.`); return; } snap(); const [x] = state.graveyard.splice(i, 1); state.library.unshift(x); log(`${src}: put ${x.name} on top of your library`); render(); };
      if (tg) { const g = findCard(tg.id); if (g && g.zone === 'graveyard') go(g.card); else toast('Target gone', 'The target is no longer in your graveyard.'); return; }
      const cands = state.graveyard.filter(x => filterMatches(desc, x)); if (!cands.length) { toast('No target', `There is no ${desc} card in your graveyard.`); return; }
      openPickCards({ title: `${src}: put a ${desc} card on top of your library`, cards: cands, max: 1, done: p => { if (p[0]) go(p[0]); } }); } }];
  }
  // Flayer of the Hatebound: "that creature deals damage equal to its power to any target." In a goldfish game the target is the opponent.
  if (/^that creature deals damage equal to its power to any target\.?$/i.test(t)) {
    const who = obj.otherId !== undefined ? obj.otherId : obj.sourceId;
    return [{ full: false, label: 'That creature deals damage equal to its power to the opponent', fn: () => { const f = findCard(who); if (!f) { toast('Gone', 'That creature is no longer on the battlefield; use its last known power by hand.'); return; } const p = (ptCalc(f.card) || {}).p || 0; snap(); changeOppLife(-p); log(`${src}: ${f.card.name} dealt ${p} damage to the opponent`); render(); } }];
  }
  return null;
}
