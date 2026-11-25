// ---- v0.99.94 Rules batch 5, from the 1.0 meta deck sample (tests/meta/sample-2026-11.txt, read by tests/meta-audit.js).
// Each piece is read from the card's words, so every card worded the same way works, not only the card that showed the gap.
//  1. "Its controller creates …" / "Its controller gains N life" / "That creature's controller gains life equal to its power"
//     after a destroy or exile (Get Lost, Beast Within, Generous Gift, Nature's Claim, Solitude): done for you when the target was
//     yours; a note for the real table when it was your opponent's.
//  2. "Destroy those creatures." after "Each creature with mana value N or less …" (Day of Black Sun): your creatures are destroyed.
//  3. "Add {B} or {G} for each permanent destroyed this way." (Culling Ritual): the mana, counted from what the wipe destroyed.
//  4. "If you control a Demon, … Otherwise, …" (Unholy Annex): the app checks and does the right half.
//  5. "If you controlled that permanent, draw a card." (Boomerang Basics).
//  6. "Then put an instant, sorcery, or Faerie card from among the milled cards into your hand." (Picklock Prankster).
//  7. "create a Treasure token and exile the top card of that player's library" (Ragavan): your Treasure, and a note for their card.
//  8. "You lose life equal to that permanent's mana value." (Feed the Swarm).
//  9. Static rules: "Players can't gain life." (Sunspine Lynx), "Each player can't cast more than one spell each turn." (High Noon,
//     Archon of Emeria), "Artifacts and creatures entering don't cause abilities to trigger." (Doorkeeper Thrull),
//     "As long as you have one or fewer cards in hand, if you would draw one or more cards, you draw that many cards plus one instead."
//     (Quantum Riddler), and the opponent-only statics a goldfish game has nothing to do for (ward, "Creatures your opponents control
//     enter tapped", "Your opponents can't cast spells during your turn", …).
function b5Mine(obj) { return (obj.targets || []).filter(x => !x.gone && x.kind === 'perm'); }
function b5Card(id) { const f = id != null ? findCard(id) : null; return f ? f.card : null; }
function b5YouVersion(rest) {   // "creates two Map tokens" -> "Create two Map tokens."   "gains 4 life" -> "You gain 4 life."
  const r = rest.replace(/\.$/, '');
  if (/^creates? /i.test(r)) return 'Create ' + r.replace(/^creates? /i, '') + '.';
  if (/^gains? /i.test(r)) return 'You gain ' + r.replace(/^gains? /i, '') + '.';
  if (/^draws? /i.test(r)) return 'Draw ' + r.replace(/^draws? /i, '') + '.';
  return null;
}
function batch5Options(t, sents, obj, src, out, drop) {
  if (!state) return;
  const n0 = out.length; try { b5Read(t, sents, obj, src, out, drop); } finally { for (const o of out.slice(n0)) if (typeof o.then === 'function') { const th = o.then; o.fn = () => th(() => {}); } }
}
function b5Read(t, sents, obj, src, out, drop) {
  const esc = x => x.slice(0, 24).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const remDrop = s => drop.push(new RegExp('^Remember \\([^)]*\\): ' + esc(s), 'i'));
  const tgtWasMine = () => b5Mine(obj).length > 0;
  const oppTarget = () => (obj.targets || []).some(x => x.kind === 'opp' || x.kind === 'player' && x.id === 'opp') || (!tgtWasMine() && (obj.targets || []).length > 0);
  for (let i = 0; i < sents.length; i++) {
    const s = sents[i], prev = sents[i - 1] || ''; let m;
    // 1. its controller …
    if ((m = /^its controller ((?:creates?|gains?) [^.]+)\.?$/i.exec(s)) && i > 0) {
      if (Array.isArray(obj.targets)) { remDrop(s); continue; }   // with the target chosen (or none chosen), the destroy/exile reader does it with the target (src/09 targetedOptions)
      const you = b5YouVersion(m[1]);
      out.push({ covers: [s], label: tgtWasMine() || !oppTarget() && !(obj.targets || []).length ? `You (its controller): ${you ? you.replace(/\.$/, '') : m[1]}` : `Its controller (your opponent) ${m[1]}: at the real table`, fn: () => {
        if (tgtWasMine() && you) { log(`${src}: the target was yours, so you ${m[1].replace(/^(\w+?)s\b/, '$1')}`); b4RunSentence(you, obj, src); }
        else log(`${src}: its controller (your opponent) ${m[1]} — do this at the real table`); render(); } });
      remDrop(s); if (/^creates? /i.test(m[1])) drop.push(/^Create (?:\d+|an?) [^]*tokens?$/i);   // the plain token reader would make it yours whoever the target was
      continue;
    }
    if (/^that creature's controller gains life equal to its power\.?$/i.test(s) && i > 0) {
      out.push({ covers: [s], label: tgtWasMine() ? 'You gain life equal to its power' : "That creature's controller (your opponent) gains life equal to its power: at the real table", fn: () => {
        const tg = b5Mine(obj)[0], c = tg && b5Card(tg.id);
        if (c) { const n = Math.max(0, (() => { try { return powerOf(c).n; } catch (e) { const i2 = cardInfo(c.name); return parseInt(String(i2 && i2.pt || '0'), 10) || 0; } })()); if (n) { if (lifeGainBlocked()) { log(`${src}: no life gained (${lifeGainBlocked().g.name})`); } else { state.life += n; log(`${src}: you gain ${n} life → ${state.life}`); fireTrigger('lifegain', { amount: n }); } } }
        else log(`${src}: your opponent gains life equal to that creature's power — do this at the real table`); render(); } });
      remDrop(s); continue;
    }
    // 2. Day of Black Sun
    if (/^destroy those creatures\.?$/i.test(s) && (m = /^(?:each|all) creatures? with mana value (\d+|X) or less\b/i.exec(prev))) {
      const n = m[1] === 'X' ? (obj.xValue != null ? +obj.xValue : 0) : +m[1];
      out.push({ covers: [s], label: `Destroy each creature with mana value ${m[1] === 'X' && obj.xValue == null ? 'X' : n} or less (yours here; your opponent's at the real table)`, fn: () => { snap();
        const hit = state.battlefield.filter(c => permZone(c) === 'creatures' && mvOf(cardInfo(c.name)) <= n); for (const c of hit) destroyPerm(c, src);
        log(`${src}: destroyed ${hit.length ? hit.map(c => c.name).join(', ') : 'none of your creatures'}`); render(); } });
      remDrop(s); continue;
    }
    // 3. Culling Ritual
    if ((m = /^add \{([WUBRGC])\} or \{([WUBRGC])\} for each permanent destroyed this way\.?$/i.exec(s))) {
      const a = m[1].toUpperCase(), b = m[2].toUpperCase();
      out.push({ covers: [s], label: `Add {${a}} or {${b}} for each permanent destroyed this way`, then: done => {
        appAskNumber(`${src}: how many permanents were destroyed?`, 'Count both sides of the table (your opponent\'s permanents are not tracked here).', 0).then(n => {
          n = Math.max(0, +n || 0); if (!n) { done(); return; }
          appChoose(src, `Add ${n} mana: each one {${a}} or {${b}}. Choose how many are {${a}}.`, Array.from({ length: n + 1 }, (_, k) => `${k} {${a}}, ${n - k} {${b}}`)).then(k => {
            if (k === null) k = n; addFloatingMana(a, k); if (n - k) addFloatingMana(b, n - k); log(`${src}: added ${k ? k + ' {' + a + '}' : ''}${k && n - k ? ' and ' : ''}${n - k ? (n - k) + ' {' + b + '}' : ''}`); render(); done(); }); }); }
        });
      remDrop(s); continue;
    }
    // 4. If you control a <type>, X. Otherwise, Y.
    if ((m = /^if you control an? ([A-Za-z]+), (.+)$/i.exec(s)) && /^otherwise, /i.test(sents[i + 1] || '')) {
      const typ = m[1], yes = m[2].replace(/^./, ch => ch.toUpperCase()), no = sents[i + 1].replace(/^otherwise, /i, '').replace(/^./, ch => ch.toUpperCase());
      out.push({ covers: [s, sents[i + 1]], label: `If you control a ${typ}: ${yes.replace(/\.$/, '')} — otherwise: ${no.replace(/\.$/, '')}`, fn: () => {
        const have = state.battlefield.some(c => new RegExp('\\b' + typ + '\\b', 'i').test(frontType(c) || '') || (c.becomes && (c.becomes.subs || []).some(x => x.toLowerCase() === typ.toLowerCase())));
        log(`${src}: you ${have ? 'control' : "don't control"} a ${typ}`); b4RunSentence(have ? yes : no, obj, src); } });
      remDrop(s); remDrop(sents[i + 1]); i++; continue;
    }
    // 5. Boomerang Basics
    if (/^if you controlled that permanent, draw a card\.?$/i.test(s)) {
      drop.push(/^Draw (?:1|a) card$/i);
      out.push({ covers: [s], label: tgtWasMine() ? 'You controlled it: draw a card' : 'It was your opponent\'s: no card', fn: () => { if (tgtWasMine()) { const d = drawCards(1); log(`${src}: you controlled it, drew ${d}`); } else log(`${src}: the permanent was your opponent's, so no card`); render(); } });
      remDrop(s); continue;
    }
    // 6. Picklock Prankster
    if ((m = /^then put an? ([a-z, ]+?) card from among the milled cards into your hand\.?$/i.exec(s)) && (m = [m[0], m[1]]) && /\bmill (\w+) cards?\b/i.test(prev)) {
      const kinds = m[1].split(/,\s*|\s+or\s+/).map(x => x.trim()).filter(x => x && x !== 'or'), n = wordN((/\bmill (\w+) cards?\b/i.exec(prev) || [])[1]) || 0;
      out.push({ covers: [s], label: `Put ${/^[aeiou]/i.test(kinds[0]) ? 'an' : 'a'} ${m[1]} card from among the milled cards into your hand`, then: done => {
        const milled = state.graveyard.slice(-n), okC = milled.filter(c => kinds.some(k => new RegExp('\\b' + k + '\\b', 'i').test(frontType(c) || '') || new RegExp('\\b' + k + '\\b', 'i').test((cardInfo(c.name) || {}).t || '')));
        if (!okC.length) { log(`${src}: no ${m[1]} card among the milled cards`); toast(src, `No ${m[1]} card was milled.`); done(); return; }
        appChoose(src, `Put one of these into your hand (milled: ${milled.map(c => c.name).join(', ')}).`, okC.map(c => c.name)).then(k => { if (k !== null && okC[k]) { snap(); moveCard(okC[k].id, 'hand'); log(`${src}: put ${okC[k].name} into your hand`); } render(); done(); }); }
        });
      remDrop(s); continue;
    }
    // 7. Ragavan
    if (/^create a treasure token and exile the top card of that player's library\.?$/i.test(s)) {
      drop.push(/^Create (?:1|a) Treasure tokens?$/i);
      out.push({ covers: [s], label: 'Create a Treasure token (and exile the top card of their library at the real table)', fn: () => { b4RunSentence('Create a Treasure token.', obj, src); log(`${src}: exile the top card of your opponent's library at the real table (until end of turn you may cast it)`); } });
      remDrop(s); continue;
    }
    // 8. Feed the Swarm
    if (/^you lose life equal to that permanent's mana value\.?$/i.test(s)) {
      out.push({ covers: [s], label: 'You lose life equal to that permanent\'s mana value', then: done => {
        const tg = b5Mine(obj)[0], c = tg && b5Card(tg.id), mv = c ? mvOf(cardInfo(c.name)) : null;
        const go = n => { n = Math.max(0, +n || 0); if (n) { snap(); state.life -= n; log(`${src}: you lose ${n} life → ${state.life}`); } render(); done(); };
        if (mv !== null) go(mv); else appAskNumber(`${src}: its mana value?`, 'The permanent was your opponent\'s: enter its mana value.', 0).then(go); } });
      remDrop(s); continue;
    }
  }
}
// ---- 9. static rules
GLOBAL_STATIC_RES.push(/^(?:Players|You) can't gain life\.?$/i, /^Each player can't cast more than one spell each turn\.?$/i, /^Artifacts and creatures entering(?: the battlefield)? don't cause abilities to trigger\.?$/i,
  /^As long as you have one or fewer cards in hand, if you would draw one or more cards, you draw that many cards plus one instead\.?$/i);
OPP_STATIC_RES.push(/^Ward(?:\s*[—-]|\s+\{)/i, /^(?:Creatures|Nonbasic lands|Artifacts|Lands|Permanents) your opponents control enter tapped\.?$/i, /^Your opponents can't cast spells during your turn\.?$/i,
  /^Each opponent can cast spells only any time they could cast a sorcery\.?$/i, /^Spells and abilities your opponents control can't cause their controller to search their library\.?$/i,
  /^(?:[A-Z][^—]* — )?Creatures your opponents control get -\d+\/-\d+\.?$/i, /^If a source you control would deal noncombat damage to a creature an opponent controls, put that many -1\/-1 counters on that creature instead\.?$/i);
function b5NoGain() { const g = globalHas(/^(?:Players|You) can't gain life\.?$/i); return g ? { g: g.g } : null; }
function b5OneSpellHit() { if (!state) return null; const g = globalHas(/^Each player can't cast more than one spell each turn\.?$/i); const sc = state.spellsCast; return g && sc && sc.turn === state.turn && sc.n >= 1 ? g : null; }
function b5Riddler(n) {
  if (!state || n <= 0 || state.phase === 'mull') return n; const g = globalHas(/^As long as you have one or fewer cards in hand, if you would draw one or more cards, you draw that many cards plus one instead\.?$/i);
  if (!g || state.hand.length > 1) return n; log(`${g.g.name}: you have ${state.hand.length} card${state.hand.length === 1 ? '' : 's'} in hand, so you draw ${n + 1} instead of ${n} (rule 614)`); return n + 1;
}
