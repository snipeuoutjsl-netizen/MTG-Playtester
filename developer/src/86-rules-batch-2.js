// ---- v0.99.69 rules batch 2: common sentences that were read as "understood" but had no effect behind them
// Each reader returns options { label, fn, full?, covers? } and may name labels of other options it replaces (supersedes).
const B2_NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
const b2n = w => /^\d+$/.test(w) ? +w : (B2_NUM[String(w).toLowerCase()] || 1);
// does permanent c match a phrase like "creature", "other Dragon creature", "artifact creature", "Elf"? (types by current type, other words as subtypes)
function b2Matches(c, phrase) {
  const words = String(phrase).toLowerCase().replace(/s\b/g, '').split(/\s+/).filter(w => w && !/^(?:other|and|or)$/.test(w));
  const ti = (() => { try { return permTypeInfo(c); } catch (e) { return null; } })(), line = (c.token ? permTypeLine(c) : ((cardInfo(c.name) || {}).t || '')).toLowerCase();
  const sub = (line.split('—')[1] || '');
  return words.every(w => /^(?:creature|artifact|enchantment|land|planeswalker|battle)$/.test(w) ? (ti ? ti.types.has(w) : line.includes(w)) : w === 'permanent' ? true : w === 'token' ? !!c.token : w === 'nontoken' ? !c.token : new RegExp('\\b' + w + 's?\\b').test(sub) || (/\bchangeling\b/i.test(cardText(c) || '') && ti && ti.types.has('creature')));
}
function batch2Options(txs, obj) {
  const out = [], drop = []; if (!state) return { out, drop };
  const t = String(txs || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim(), src = obj.sourceName || '~', sents = t.split(/(?<=\.)\s+/);
  let m;
  // 1. "Put a +1/+1 counter on each [other] [<subtype>] creature you control [with a +1/+1 counter on it]." (CR 122.1)
  if ((m = /\bput (a|an|one|two|three|four|\d+) \+1\/\+1 counters? on each (other )?([a-z][a-z' -]*?) you control( with (?:a|an) \+1\/\+1 counter on it)?\.?(?=\s|$)/i.exec(t)) && !/\btarget\b/i.test(m[0])) {
    const n = b2n(m[1]), other = !!m[2], ph = m[3], withC = !!m[4];
    out.push({ full: sents.length === 1, covers: [sents.find(x => x.includes(m[0].slice(0, 30))) || m[0]], label: `Put ${n === 1 ? 'a' : n} +1/+1 counter${n === 1 ? '' : 's'} on each ${other ? 'other ' : ''}${ph} you control${withC ? ' with a +1/+1 counter on it' : ''}`, fn: () => {
      const ids = state.battlefield.filter(c => !c.opp && (!other || c.id !== obj.sourceId) && b2Matches(c, ph) && (!withC || ((c.counters && c.counters.plus) || 0) > 0)).map(c => c.id);
      for (const id of ids) addCounter(id, n, 'plus'); log(`${src}: put ${n} +1/+1 counter${n === 1 ? '' : 's'} on ${ids.length} permanent${ids.length === 1 ? '' : 's'}`); render(); } });
  }
  // 2. "Each opponent loses N life. You gain life equal to the life lost this way." / "Target player loses N life and you gain life equal to the life lost this way." (CR 119.3)
  if ((m = /\b(each opponent|target opponent|an opponent|target player|each player) loses (\d+|x) life(?:\.\s*| and )you gain life equal to the life lost this way\.?/i.exec(t))) {
    const raw = m[2].toLowerCase(), n = raw === 'x' ? (obj.xValue || 0) : +raw, who = m[1].toLowerCase(), self = who === 'target player' && obj.target === 'you', each = who === 'each player';
    out.push({ full: m[0].length >= t.length - 1, covers: m[0].split(/(?<=\.)\s+/), label: self ? `You lose ${n} life and gain ${n} life` : `Opponent loses ${n} life; you gain ${n} life${each ? ' (and you lose ' + n + ')' : ''}`, fn: () => {
      if (self) { changeLife(-n, true); changeLife(n, true); } else { changeOppLife(-n); if (each) changeLife(-n, true); changeLife(each ? 2 * n : n, true); }
      log(`${src}: ${self ? 'you' : 'the opponent'} lost ${n} life${each ? ' (you too)' : ''}; you gained life equal to the life lost (${each ? 2 * n : n})`); render(); } });
    drop.push(new RegExp('^(?:opponent|each opponent) loses ' + n + ' life$', 'i'));
  }
  // 3. "~ deals N damage to that creature's / permanent's / land's / artifact's controller." The controller of the chosen target (CR 109.4)
  if ((m = /(?<![\w])(?:~|it) deals (\d+) damage to that (creature|permanent|land|artifact|enchantment|planeswalker)'s controller\.?/i.exec(t))) {
    const n = +m[1], tgt = (obj.targets || []).find(x => x.kind === 'perm'), f = tgt && findCard(tgt.id), mine = !!(f && !f.card.opp);
    out.push({ covers: [m[0]], label: `${src} deals ${n} damage to that ${m[2]}'s controller (${tgt ? (mine ? 'you' : 'your opponent') : 'its controller'})`, fn: () => { if (mine) changeLife(-n, true); else changeOppLife(-n); log(`${src}: ${n} damage to ${mine ? 'you' : 'the opponent'} (the controller of ${tgt ? tgt.name : 'that ' + m[2]})`); render(); } });
  }
  // 4. "You gain life equal to <amount>": the number of <things>, the greatest power among creatures you control, its/~'s power or toughness
  if ((m = /^you gain life equal to (?:the number of ([^.]+?)|(the greatest power among creatures you control)|(?:its|~'s) (power|toughness))\.?$/i.exec(sents.find(x => /^you gain life equal to /i.test(x)) || ''))) {
    let amt = null, what = '';
    if (m[1] && /^cards in your hand$/i.test(m[1].trim())) { what = 'the number of cards in your hand'; amt = () => state.hand.length; }
    else if (m[1] && countPhraseKnown(m[1])) { const q0 = eachQty(m[1], obj); if (q0 !== null && q0 !== undefined) { what = 'the number of ' + m[1]; amt = () => eachQty(m[1], obj) || 0; } }
    else if (m[2]) { what = m[2]; amt = () => Math.max(0, ...state.battlefield.filter(c => !c.opp && permTypeInfo(c).types.has('creature')).map(c => ptCalc(c).p)); }
    else if (m[3] && obj.sourceId) { what = `${src}'s ${m[3]}`; amt = () => { const f = findCard(obj.sourceId); return f ? Math.max(0, ptCalc(f.card)[m[3] === 'power' ? 'p' : 't']) : 0; }; }
    if (amt) out.push({ full: sents.length === 1, covers: [m[0]], label: `Gain life equal to ${what} (now ${amt()})`, fn: () => { const v = amt(); changeLife(v, true); log(`${src}: you gained ${v} life (${what})`); render(); } });
  }
  // ---- v0.99.70 batch 3
  // 5. "Create a token that's a copy of target creature / ~ / it / that creature / enchanted or equipped creature [, except it has haste]" (CR 707.2: the copiable values)
  if ((m = /\bcreate (a|an|one|two|three|x|\d+) tokens? that(?:'s| are) (?:a )?cop(?:y|ies) of (target [^.,]+?|~|it|that creature|that permanent|enchanted creature|equipped creature|the exiled card)(?:, except (?:it has|they have) haste)?\.?(?=\s|$)/i.exec(t))) {
    const n = /^x$/i.test(m[1]) ? (obj.xValue || 0) : b2n(m[1]), what = m[2], haste = /except (?:it has|they have) haste/i.test(m[0]);
    const tgt = (obj.targets || []).find(x => x.kind === 'perm');
    const srcId = /^target |^it$|^that /i.test(what) && tgt ? tgt.id : /^(?:enchanted|equipped) creature$/i.test(what) ? (() => { const f = findCard(obj.sourceId); return f && f.card.att; })() : /^~$/.test(what) ? obj.sourceId : null;
    out.push({ covers: [m[0]], full: sents.length === 1, label: `Create ${n === 1 ? 'a token' : n + ' tokens'} that ${n === 1 ? "is a copy" : 'are copies'} of ${srcId ? ((findCard(srcId) || {}).card || {}).name || what : what}${haste ? ', with haste' : ''}`, fn: () => {
      const f = srcId && findCard(srcId); if (!f) { toast('Copy what?', 'Choose the permanent to copy first (its target), or make the copy by hand with Create a token.'); return; }
      const c = f.card, def = c.token && c.tk ? Object.assign({}, c.tk) : (() => { const info = cardInfo(c.name); return info ? copyOfCardDef(Object.assign({ n: c.name }, info)) : null; })();
      if (!def) { log(`${src}: could not read ${c.name}'s card data, make the copy by hand`); return; }
      if (haste) def.haste = 'perm'; makeTokensFromDef(def, n, src); log(`${src}: created ${n} token cop${n === 1 ? 'y' : 'ies'} of ${c.name}`); render(); } });
  }
  // 6. "You draw a card and lose 1 life." / "You draw N cards and you lose N life." (one instruction, both parts happen)
  if ((m = /^you draw (a|an|one|two|three|\d+) cards? and (?:you )?lose (\d+) life\.?$/i.exec(sents.find(x => /^you draw .* and (?:you )?lose \d+ life/i.test(x)) || ''))) {
    const n = b2n(m[1]), l = +m[2];
    out.push({ covers: [m[0]], full: sents.length === 1, label: `Draw ${n} card${n === 1 ? '' : 's'} and lose ${l} life`, fn: () => { drawCards(n); changeLife(-l, true); log(`${src}: you drew ${n} and lost ${l} life`); render(); } });
    drop.push(new RegExp('^draw ' + n + ' cards?$', 'i'));
  }
  // 7. "Target creature's controller / Its controller / That creature's controller loses N life." (the controller of the chosen permanent)
  if ((m = /(?:^|\.\s+)((?:target|that) (?:creature|permanent|artifact|land|enchantment)'s|its) controller loses (\d+) life\.?/i.exec(t))) {
    const n = +m[2], tgt = (obj.targets || []).find(x => x.kind === 'perm' || x.kind === 'opp'), f = tgt && tgt.kind === 'perm' && findCard(tgt.id), mine = !!(f && !f.card.opp);
    out.push({ covers: [m[0].replace(/^\.\s+/, '')], full: sents.length === 1, label: `${tgt ? (mine ? 'You lose' : 'Opponent loses') : 'Its controller loses'} ${n} life (the controller of ${tgt ? tgt.name : 'that permanent'})`, fn: () => { if (mine) changeLife(-n, true); else changeOppLife(-n); log(`${src}: ${mine ? 'you' : 'the opponent'} lost ${n} life`); render(); } });
  }
  // v0.99.72 follow-ups that act on the permanents chosen as targets earlier in the same ability (CR 608.2c "those creatures" / "it" refer back to them)
  {
    const tg = () => (obj.targets || []).filter(x => x.kind === 'perm' && !x.gone).map(x => findCard(x.id)).filter(f => f && f.zone === 'battlefield').map(f => f.card);
    const hasT = /\btarget\b/i.test(t) && !/\b(?:spell|player|opponent) target/i.test(t);
    // "Untap those creatures." / "Untap it." / "Untap that creature." (Colossal Heroics, Triton Tactics, Twist Allegiance)
    const us = sents.find(x => /^untap (?:those creatures|those permanents|it|that creature|that permanent|them)\.?$/i.test(x));
    if (us && hasT) out.push({ covers: [us], label: 'Untap the chosen creature' + (tg().length === 1 ? '' : 's'), fn: () => { const cs = tg(); snap(); for (const c of cs) { c.tapped = false; delete c.mt; } log(`${src}: untapped ${cs.map(c => c.name).join(', ') || 'nothing (no target left)'}`); render(); } });
    // "It gains vigilance until end of turn." / "That creature gains indestructible and lifelink until end of turn." (one reader, so the sentence is also counted as read)
    const gs = sents.map(x => [x, /^(?:it|that creature|that permanent|they|those creatures|each of them) gains? ((?:[a-z ]+?)(?:,? and [a-z ]+?)?) until end of turn\.?$/i.exec(x)]).find(p => p[1]);
    if (gs && hasT) { const kws = gs[1][1].toLowerCase().split(/\s*(?:,\s*(?:and\s+)?|\band\b)\s*/).map(x => x.trim()).filter(Boolean);
      if (kws.length && kws.every(k => GRANTABLE.includes(k))) { const kr = kws.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
        drop.push(new RegExp('^(?!The chosen creature).* gains? .*' + kr + '.* until end of turn$', 'i'));
        out.push({ covers: [gs[0]], label: `The chosen creature${tg().length === 1 ? '' : 's'} gain${tg().length === 1 ? 's' : ''} ${kws.join(' and ')} until end of turn`, fn: () => { const cs = tg(); for (const c of cs) for (const k of kws) addKwFx(c.id, k, { srcName: src }); if (!cs.length) log(`${src}: no target left to gain ${kws.join(' and ')}`); render(); } }); } }
  }
  return { out, drop };
}
