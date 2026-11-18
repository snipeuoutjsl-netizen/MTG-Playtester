// ---- Player-choice clauses read from rules text (v0.99.6)
// "Each player discards a card." "Each player sacrifices a creature." "Target player sacrifices a creature." (CR 701.21, 701.8)
// "Untap up to three lands." (CR 701.26)   "Look at the top card of your library. You may put it into your graveyard / on the bottom." (CR 701.18)
// Only the player's own side is tracked in a goldfish game; the opponent's half is stated in the log, never silently dropped.
const PC_TYPES = { creature: 'creature', artifact: 'artifact', enchantment: 'enchantment', land: 'land', planeswalker: 'planeswalker', permanent: null, 'nonland permanent': 'nonland' };
function pcNum(w) { return MASS_NUM(String(w).toLowerCase()); }
function pcPermIs(c, kind) { if (kind === null) return true; if (kind === 'nonland') return !isLandName(c.name); try { return permTypeInfo(c).types.has(kind); } catch (e) { return false; } }
function pcSingle(s, src, obj) {
  let m;
  if ((m = /^(each player|each opponent|target player|target opponent) sacrifices (a|an|one|two|three|\d+) (creature|artifact|enchantment|land|planeswalker|permanent|nonland permanent)s?$/i.exec(s))) {
    const who = m[1].toLowerCase(), n = pcNum(m[2]), kind = PC_TYPES[m[3].toLowerCase()], word = m[3].toLowerCase();
    const mine = who === 'each player', oppOnly = /opponent/.test(who);
    const doYou = () => { const cands = state.battlefield.filter(c => pcPermIs(c, kind)); const k = Math.min(n, cands.length);
      if (!k) { log(`${src}: you have no ${word} to sacrifice`); render(); return; }
      openPickCards({ title: `${src}: sacrifice ${k} ${word}${k === 1 ? '' : 's'}`, note: `Choose ${k} ${word}${k === 1 ? '' : 's'} you control to sacrifice.`, cards: cands, max: k, min: k, done: picked => { snap(); for (const c of picked) { log(`${src}: you sacrificed ${c.name}`); leaveBattlefield(c, 'graveyard'); } render(); } }); };
    const oppNote = () => log(`${src}: your opponent sacrifices ${n === 1 ? 'a' : n} ${word}${n === 1 ? '' : 's'} (their board is not tracked in a goldfish game)`);
    const full = true;
    if (mine) return [{ full, label: `Each player sacrifices ${n === 1 ? 'a' : n} ${word} — you choose and sacrifice yours; the opponent's is noted in the log`, fn: () => { oppNote(); doYou(); } }];
    if (oppOnly) return [{ full, label: `Your opponent sacrifices ${n === 1 ? 'a' : n} ${word} (their board is not tracked — noted in the log)`, fn: () => { oppNote(); render(); } }];
    return [{ full, label: `Target player sacrifices ${n === 1 ? 'a' : n} ${word} — your opponent (noted in the log)`, fn: () => { oppNote(); render(); } }, { full, label: `Target player sacrifices ${n === 1 ? 'a' : n} ${word} — you`, fn: doYou }];
  }
  if ((m = /^each player discards (a|one|two|three|\d+) cards?$/i.exec(s))) {
    const n = pcNum(m[1]);
    return [{ full: true, label: `Each player discards ${n === 1 ? 'a card' : n + ' cards'} — you choose and discard yours; the opponent's is noted in the log`, fn: () => { log(`${src}: your opponent discards ${n} card${n === 1 ? '' : 's'} (their hand is not tracked in a goldfish game)`);
      const k = Math.min(n, state.hand.length); if (!k) { render(); return; }
      openPickCards({ title: `${src}: discard ${k} card${k === 1 ? '' : 's'}`, note: `Choose ${k} card${k === 1 ? '' : 's'} from your hand to discard.`, cards: state.hand.slice(), max: k, min: k, done: picked => { snap(); for (const c of picked) { moveCard(c.id, 'graveyard'); log(`${src}: you discarded ${c.name}`); } render(); } }); } }];
  }
  if ((m = /^untap up to (a|an|one|two|three|four|five|six|seven|\d+) (lands?|artifacts?|creatures?|permanents?)$/i.exec(s))) {
    const n = pcNum(m[1]), word = m[2].toLowerCase().replace(/s$/, ''), kind = PC_TYPES[word] === undefined ? null : PC_TYPES[word];
    return [{ full: true, label: `Untap up to ${n} ${word}${n === 1 ? '' : 's'} you control`, fn: () => { const cands = state.battlefield.filter(c => c.tapped && pcPermIs(c, kind)); if (!cands.length) { log(`${src}: no tapped ${word}s to untap`); render(); return; }
      openPickCards({ title: `${src}: untap up to ${n} ${word}${n === 1 ? '' : 's'}`, note: `Choose up to ${n} tapped ${word}${n === 1 ? '' : 's'} to untap.`, cards: cands, max: Math.min(n, cands.length), nothing: 'Untap none', done: picked => { snap(); for (const c of picked) { c.tapped = false; delete c.mt; log(`${src}: untapped ${c.name}`); } render(); } }); } }];
  }
  return null;
}
function pcLookOne(sents, src) {
  if (sents.length !== 2 || !/^look at the top card of your library$/i.test(sents[0].replace(/\.$/, ''))) return null;
  const m = /^you may put (?:it|that card) (into your graveyard|on the bottom of your library)$/i.exec(sents[1].replace(/\.$/, '')); if (!m) return null;
  const toGy = /graveyard/i.test(m[1]);
  return [{ full: true, label: `Look at the top card of your library; you may put it ${toGy ? 'into your graveyard' : 'on the bottom of your library'}`, fn: () => { const top = state.library[0]; if (!top) { log(`${src}: library is empty`); render(); return; }
    openPickCards({ title: `${src}: the top card is ${top.name}`, note: `Put it ${toGy ? 'into your graveyard' : 'on the bottom of your library'}, or leave it on top.`, cards: [top], max: 1, nothing: 'Leave it on top', done: picked => { if (!picked.length) { log(`${src}: left the top card where it was`); render(); return; } snap(); moveCard(top.id, toGy ? 'graveyard' : 'library', toGy ? undefined : 'bottom'); log(`${src}: put ${top.name} ${toGy ? 'into the graveyard' : 'on the bottom of the library'}`); render(); } }); } }];
}
function playerChoiceOptions(tx, obj) {
  if (!state) return null; const sents = MASS_SENTS(tx); if (!sents.length) return null; const src = (obj && obj.sourceName) || 'Ability';
  const one = pcLookOne(sents, src); if (one) return one;
  const last = sents[sents.length - 1].replace(/\.$/, '');
  const mine = pcSingle(sents[0].replace(/\.$/, ''), src, obj);
  if (mine) return [...mine, ...massRest(sents, 1, obj)].map((o, i, a) => i === 0 ? Object.assign({}, o, { full: sents.length === 1 }) : o);
  if (sents.length > 1) {   // trailing clause: "Draw two cards, then discard two cards. Untap up to three lands."
    const tail = pcSingle(last, src, obj); if (!tail) return null;
    const head = effectOptionsBase(sents.slice(0, -1).join(' '), obj).filter(o => typeof o.fn === 'function' && !o.hidden); if (!head.length) return null;
    return head.map(o => ({ full: !!o.full, label: o.label + ', then ' + tail[0].label.charAt(0).toLowerCase() + tail[0].label.slice(1), fn: () => { o.fn(); setTimeout(() => tail[0].fn(), 0); } }));
  }
  return null;
}

// ---- Counting from the board (v0.99.7): devotion (CR 700.5), "where X is ...", scaling mana, "you win the game"
const DEV_COLORS = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
function devotionTo(cols) {   // CR 700.5: the number of mana symbols of those colours among the mana costs of permanents you control
  let n = 0; if (!state) return 0;
  for (const c of state.battlefield) { if (c.token) continue; const i = cardInfo(c.name); if (!i) continue; const mc = String(i.mc || '').split(' // ')[0];
    for (const m of mc.matchAll(/\{([^}]+)\}/g)) { const parts = m[1].split('/'); if (parts.some(p => cols.includes(p))) n++; } }
  return n;
}
function applyWhereX(tx, obj) {
  let T = String(tx || ''), m, n = null;
  if ((m = /,? where X is your devotion to (white|blue|black|red|green)(?: and (white|blue|black|red|green))?/i.exec(T))) { n = devotionTo([DEV_COLORS[m[1].toLowerCase()], m[2] && DEV_COLORS[m[2].toLowerCase()]].filter(Boolean)); T = T.replace(m[0], ''); }
  else if ((m = /,? where X is the number of ([a-z' -]+?)(?: you control)?(?=[.,]|$)/i.exec(T))) { const src = obj && obj.sourceId > 0 && findCard(obj.sourceId); n = csCount(m[1].trim() + ' you control', src ? src.card : { id: -1 }) || 0; T = T.replace(m[0], ''); }
  if (n === null) return T;
  T = T.replace(/(?<![{\w])X(?![\w}])/g, String(n));
  T = T.replace(/(?:^|(?<=\. ))If (\d+) is greater than or equal to the number of cards in your library, you win the game\.?/i, (all, v) => (state ? +v >= state.library.length : true) ? 'You win the game.' : '');   // Thassa's Oracle
  return T.replace(/\s+$/, '');
}
function manaCountOptions(tx, obj) {
  if (!state) return null; const sents = MASS_SENTS(tx); if (!sents.length) return null; const src = (obj && obj.sourceName) || 'Ability';
  const s0 = sents[0].replace(/^[^:{]*(?:\{[^}]*\}[^:]*)*?:\s*(?=add\b)/i, '').replace(/\.$/, ''); let m;
  if (sents.length === 1 && (m = /^add ((?:\{[WUBRGC]\})+) for each (.+?)(?: you control)?$/i.exec(s0))) {
    const col = m[1].match(/[WUBRGC]/g), thing = m[2]; const srcC = obj && obj.sourceId > 0 && findCard(obj.sourceId);
    const n = () => csCount(thing + ' you control', srcC ? srcC.card : { id: -1 }) || 0;
    return [{ full: true, label: `Add ${m[1]} for each ${thing} you control (counted when it resolves)`, fn: () => { const k = n(); snap(); for (let i = 0; i < k; i++) for (const c of col) addFloatingMana(c); log(`${src}: added ${k * col.length} mana (${m[1]} × ${k})`); render(); } }];
  }
  if (sents.length === 2 && /^choose a colou?r$/i.test(sents[0].replace(/\.$/, '')) && (m = /^add an amount of mana of that colou?r equal to your devotion to that colou?r$/i.exec(sents[1].replace(/\.$/, '')))) {
    return Object.entries(DEV_COLORS).map(([nm, sym]) => ({ full: true, label: `Choose ${nm}: add mana equal to your devotion to ${nm} (${devotionTo([sym])})`, fn: () => { const k = devotionTo([sym]); snap(); for (let i = 0; i < k; i++) addFloatingMana(sym); log(`${src}: chose ${nm}, added ${k} {${sym}} (devotion ${k})`); render(); } }));
  }
  if (sents.length === 1 && /^you win the game$/i.test(s0)) return [{ full: true, label: 'You win the game', fn: () => { log(`${src}: you win the game!`); toast('You win the game', `${src}: the game is over, and you won.`); render(); } }];
  return null;
}
