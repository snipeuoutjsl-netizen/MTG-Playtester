// v0.99.3 Rules-text readers found by the 1.0 rules dive (each is a RULE, not a card):
//  - mass effects:  "Destroy all creatures." "Destroy all lands." "Destroy each artifact, creature, and enchantment with mana value X or less." "Exile all ..." "Return all ... to their owners' hands." "Tap/Untap all ..."   (CR 701.7, 701.8, 406, 400.7)
//  - hands:         "Each player discards their hand, then draws seven cards." "Draw three cards, then put two cards from your hand on top of your library in any order." "You may put a land card from your hand onto the battlefield."
//  - this card:     "Return ~ to its owner's hand." "Put this artifact on top of its owner's library."
//  - players:       "Target player draws two cards and loses 2 life." "Target player mills two cards." "Target player discards two cards."
//  - kicker:        "... deals 2 damage ... If this spell was kicked, it deals 4 damage instead."
const MASS_SENTS = tx => String(tx || '').replace(/’/g, "'").replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/).map(x => x.trim()).filter(Boolean);
const MASS_NUM = w => /^x$/i.test(w) ? 'X' : (NUMW[String(w).toLowerCase()] || parseInt(w, 10));
const MASS_COLORS = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
// "nonland permanents", "other creatures", "artifacts, creatures, and enchantments", "creatures with power 4 or greater", "nonblack creatures" -> a predicate, or null if any word is not understood
function parseMassSet(phrase, obj) {
  let p = String(phrase || '').toLowerCase().trim().replace(/[.]$/, ''), none = false, qual = null;
  if (/\b(?:you don't control|an opponent controls|your opponents control|opponents control|each opponent controls)\b/.test(p)) { none = true; p = p.replace(/\b(?:you don't control|an opponent controls|your opponents control|opponents control|each opponent controls)\b/, '').trim(); }
  p = p.replace(/\byou control\b/, '').trim();
  let colorful = false; { const cm = / that(?:'s| is| are) one or more colors$/.exec(p); if (cm) { colorful = true; p = p.slice(0, cm.index).trim(); } }   // "...with mana value X or less that's one or more colors" (Ugin, the Spirit Dragon)
  const qm = p.match(/\s+(with|without) (.+)$/); if (qm) { qual = { without: qm[1] === 'without', text: qm[2].trim() }; p = p.slice(0, qm.index).trim(); }
  const toks = p.split(/\s*,\s*(?:and |or )?|\s+(?:and|or)\s+/).map(x => x.trim()).filter(Boolean); if (!toks.length) return null;
  const types = [], mods = []; let other = false, colors = [];
  for (const tk of toks) {
    const ws = tk.split(/\s+/); const typeWord = singularWord(ws[ws.length - 1]); if (!MASS_TYPES.includes(typeWord) && !(typeWord === 'permanent')) return null; if (!types.includes(typeWord)) types.push(typeWord);
    for (const w of ws.slice(0, -1)) {
      if (w === 'other' || w === 'another') other = true; else if (/^non-?(land|creature|artifact|enchantment|basic|legendary|token|snow)$/.test(w)) mods.push(w.replace('-', '')); else if (MASS_COLORS[w] && !colors.includes(MASS_COLORS[w])) colors.push(MASS_COLORS[w]);
      else if (/^non-?(white|blue|black|red|green)$/.test(w)) mods.push(w.replace('-', '')); else if (w === 'tapped' || w === 'untapped' || w === 'attacking' || w === 'legendary' || w === 'basic' || w === 'token') mods.push(w); else return null;
    }
  }
  let q = null;
  if (qual) {
    let m;
    if ((m = qual.text.match(/^mana value (x|\d+)(?: or (less|greater|more))?$/))) q = { kind: 'mv', n: m[1] === 'x' ? (obj && obj.xValue !== undefined ? +obj.xValue : (obj && obj.x !== undefined ? +obj.x : null)) : +m[1], op: m[2] ? (m[2] === 'less' ? 'le' : 'ge') : 'eq' };
    else if ((m = qual.text.match(/^(power|toughness) (\d+) or (less|greater|more)$/))) q = { kind: m[1], n: +m[2], op: m[3] === 'less' ? 'le' : 'ge' };
    else if ((m = qual.text.match(/^(flying|reach|first strike|trample|haste|vigilance|deathtouch|lifelink|menace|defender|indestructible)$/))) q = { kind: 'kw', k: m[1] };
    else return null;
    if (q.kind === 'mv' && (q.n === null || isNaN(q.n))) { if (obj && obj.sourceId === -1) q.n = 0; else return null; }   // while the app only reads the card (no X chosen yet) the wording is understood
    q.without = qual.without;
  }
  return { none, types, mods, other, colors, q, colorful };
}
function massMatch(c, S, srcId) {
  const tl = permTypeLine(c);
  if (!(S.types.includes('permanent') || S.types.some(w => new RegExp('\\b' + w + '\\b', 'i').test(tl)))) return false;
  if (S.other && c.id === srcId) return false;
  if (S.colorful && !effColors(c).length) return false;
  if (S.colors.length && !S.colors.some(k => cardColorSet(c).includes(k))) return false;
  for (const md of S.mods) {
    if (md === 'nonland' && /\bLand\b/.test(tl)) return false; if (md === 'noncreature' && /\bCreature\b/.test(tl)) return false; if (md === 'nonartifact' && /\bArtifact\b/.test(tl)) return false; if (md === 'nonenchantment' && /\bEnchantment\b/.test(tl)) return false;
    if (md === 'nonbasic' && /\bBasic\b/.test(tl)) return false; if (md === 'nonlegendary' && /\bLegendary\b/.test(tl)) return false; if (md === 'nontoken' && c.token) return false; if (md === 'nonsnow' && /\bSnow\b/.test(tl)) return false;
    if (md === 'legendary' && !/\bLegendary\b/.test(tl)) return false; if (md === 'basic' && !/\bBasic\b/.test(tl)) return false; if (md === 'token' && !c.token) return false;
    if (md === 'tapped' && !c.tapped) return false; if (md === 'untapped' && c.tapped) return false; if (md === 'attacking' && !(state.combat && (state.combat.attackers || []).includes(c.id))) return false;
    const nc = /^non(white|blue|black|red|green)$/.exec(md); if (nc && cardColorSet(c).includes(MASS_COLORS[nc[1]])) return false;
  }
  if (S.q) {
    let ok = true;
    if (S.q.kind === 'mv') { const v = c.token ? 0 : ((cardInfo(c.name) || {}).cmc || 0); ok = S.q.op === 'le' ? v <= S.q.n : S.q.op === 'ge' ? v >= S.q.n : v === S.q.n; }
    else if (S.q.kind === 'power' || S.q.kind === 'toughness') { const r = ptCalc(c), v = S.q.kind === 'power' ? r.p : r.t; ok = S.q.op === 'le' ? v <= S.q.n : v >= S.q.n; }
    else if (S.q.kind === 'kw') ok = hasKw(c, S.q.k);
    if (S.q.without ? ok : !ok) return false;
  }
  return true;
}
const MASS_TYPES = ['artifact', 'creature', 'enchantment', 'land', 'planeswalker', 'battle', 'permanent'];
// ---- shared helpers
function massRest(sents, from, obj) { const rest = sents.slice(from).join(' '); return rest ? effectOptionsBase(rest, obj).filter(o => typeof o.fn === 'function' && !o.hidden) : []; }
function askNumber(title, note, def, cb) {
  const m = modal(title, { width: 420, sticky: true, noClose: true }); const inp = h('input', { type: 'number', min: 0, value: def, style: 'width:80px' });
  m.body.append(h('div', { class: 'psub', text: note }), inp); m.foot.append(h('button', { class: 'primary', text: 'OK', onclick: () => { const v = Math.max(0, parseInt(inp.value, 10) || 0); m.close(); cb(v); } }));
}
function openOrderList(title, cards, onDone) {   // put these cards back in the order you want; the first one ends up on top
  const order = cards.map((c, i) => i); if (cards.length < 2) { onDone(cards.slice()); return; }
  const m = modal(title, { width: 480, sticky: true, noClose: true }); const confirm = h('button', { class: 'primary', text: 'Put them there' });
  const draw = () => { m.body.replaceChildren(h('div', { class: 'psub', text: 'Choose the order. The first card in the list is on top.' })); order.forEach((ci, pos) => m.body.append(h('div', { class: 'row' }, h('span', { class: 'muted small', text: pos === 0 ? 'Top' : String(pos + 1) }), h('span', { class: 'nm', text: cards[ci].name }), h('button', { text: '▲', disabled: pos === 0, onclick: () => { [order[pos - 1], order[pos]] = [order[pos], order[pos - 1]]; draw(); } }), h('button', { text: '▼', disabled: pos === order.length - 1, onclick: () => { [order[pos + 1], order[pos]] = [order[pos], order[pos + 1]]; draw(); } })))); };
  confirm.addEventListener('click', () => { m.close(); onDone(order.map(i => cards[i])); }); m.foot.append(confirm); draw();
}
function discardFromHand(cards, src) { for (const c of cards) { const f = findCard(c.id); if (f && f.zone === 'hand') moveCard(c.id, 'graveyard'); } if (cards.length) log(`${src}: discarded ${cards.map(c => c.name).join(', ')}`); }
function discardRandom(n, src) { const out = []; for (let i = 0; i < n && state.hand.length; i++) { const c = state.hand[rnd(state.hand.length)]; moveCard(c.id, 'graveyard'); out.push(c); } log(`${src}: discarded ${out.length ? out.map(c => c.name).join(', ') : 'nothing (your hand is empty)'} at random`); return out.length; }
// ---- mass effects
function massEffectOptions(tx, obj) {
  if (!state) return null; const sents = MASS_SENTS(tx); if (!sents.length) return null; const src = (obj && obj.sourceName) || 'Ability', srcId = obj && obj.sourceId;
  let m = /^(destroy|exile) (?:all|each) (.+)$/i.exec(sents[0].replace(/\.$/, '')), verb = m && m[1].toLowerCase(), set = m && m[2];
  if (!m) { m = /^return (?:all|each) (.+?) to their owners' hands$/i.exec(sents[0].replace(/\.$/, '')); if (m) { verb = 'bounce'; set = m[1]; } }
  if (!m) { m = /^(tap|untap) (?:all|each) (.+)$/i.exec(sents[0].replace(/\.$/, '')); if (m) { verb = m[1].toLowerCase(); set = m[2]; } }
  if (!m) return null;
  const S = parseMassSet(set, obj); if (!S) return null;
  let i = 1; while (sents[i] && /^(?:they|it|those \w+) can'?t be regenerated\.?$/i.test(sents[i])) i++;   // CR 701.15 regeneration is not tracked as a shield here, so the rider changes nothing
  const word = { destroy: 'Destroy', exile: 'Exile', bounce: 'Return to their owners\' hands', tap: 'Tap', untap: 'Untap' }[verb];
  const full = { full: !sents[i], label: `${word} all ${set.replace(/\.$/, '')}`, fn: () => {
    snap(); const hit = S.none ? [] : state.battlefield.filter(c => massMatch(c, S, srcId)); let n = 0;
    if (S.none) log(`${src}: affects only permanents you do not control; the opponent's board is not tracked here, so apply it at the table`);
    for (const c of hit) {
      if (verb === 'destroy') { if (hasKw(c, 'indestructible')) { log(`${src}: ${c.name} is indestructible`); continue; } log(`${src}: destroyed ${c.name}`); leaveBattlefield(c, 'graveyard'); n++; }
      else if (verb === 'exile') { moveCard(c.id, 'exile'); n++; } else if (verb === 'bounce') { moveCard(c.id, 'hand'); n++; }
      else if (verb === 'tap') { if (!c.tapped) { toggleTap(c.id); n++; } } else if (verb === 'untap') { if (c.tapped) { untapByEffect(c.id); n++; } }
    }
    log(`${src}: ${word.toLowerCase()} ${n} permanent${n === 1 ? '' : 's'} (${set})`); render(); flushTriggers();
  } };
  return [full, ...massRest(sents, i, obj)];
}
// ---- hands: "Each player discards their hand, then draws seven cards." / "Each player shuffles their hand and graveyard into their library, then draws seven cards." / Windfall
function handRefillOptions(tx, obj) {
  if (!state) return null; const sents = MASS_SENTS(tx); const s0 = (sents[0] || '').replace(/\.$/, ''); const src = (obj && obj.sourceName) || 'Ability'; let m;
  const draw = (cnt, extra) => { const n = drawCards(cnt); log(`${src}: drew ${n}${extra || ''}`); render(); };
  if ((m = /^each player discards (?:their|his or her) hand, then draws (seven|six|five|four|three|\d+(?= cards?)|cards equal to the greatest number of cards a player discarded this way)(?: cards?)?$/i.exec(s0))) {
    const greatest = /^cards equal/i.test(m[1]), k = greatest ? 0 : MASS_NUM(m[1]);
    return [{ full: sents.length === 1, label: greatest ? 'You discard your hand, then draw cards equal to the greatest number discarded' : `You discard your hand, then draw ${k}`, fn: () => { snap(); const hand = state.hand.slice(), mine = hand.length; discardFromHand(hand, src);
      if (!greatest) { log(`${src}: your opponent also discards and draws (their hand is not tracked)`); draw(k); return; }
      askNumber(`${src}: opponent's discard`, `Your opponent's hand is not tracked. How many cards did your opponent discard? (You discarded ${mine}; you draw the greater number.)`, 0, o => { draw(Math.max(mine, o), ` (you discarded ${mine}, your opponent ${o})`); }); } }, ...massRest(sents, 1, obj)];
  }
  if ((m = /^each player shuffles (?:their|his or her) hand and graveyard into (?:their|his or her) library, then draws (seven|six|five|four|three|\d+) cards?$/i.exec(s0))) {
    const k = MASS_NUM(m[1]);
    return [{ full: sents.length === 1, label: `You shuffle your hand and graveyard into your library, then draw ${k}`, fn: () => { snap(); let n = 0; for (const z of ['hand', 'graveyard']) { const cs = state[z].splice(0); n += cs.length; for (const c of cs) if (!c.token) state.library.push(c); } shuffleLib(); log(`${src}: ${n} card${n === 1 ? '' : 's'} shuffled into your library; your opponent does the same (not tracked)`); draw(k); } }, ...massRest(sents, 1, obj)];
  }
  // Brainstorm: "Draw three cards, then put two cards from your hand on top of your library in any order."
  if ((m = /^draw (a|one|two|three|four|\d+) cards?,? then put (a|one|two|three|four|\d+) cards? from your hand (on top of|on the bottom of) your library(?: in any order)?$/i.exec(s0))) {
    const nd = MASS_NUM(m[1]), np = MASS_NUM(m[2]), top = /top/i.test(m[3]);
    return [{ full: sents.length === 1, label: `Draw ${nd}, then put ${np} card${np === 1 ? '' : 's'} from your hand ${top ? 'on top of' : 'on the bottom of'} your library`, fn: () => { drawCards(nd); const k = Math.min(np, state.hand.length); if (!k) { render(); return; }
      openPickCards({ title: `${src}: put ${k} card${k === 1 ? '' : 's'} back`, note: `Choose ${k} card${k === 1 ? '' : 's'} from your hand to put ${top ? 'on top of' : 'on the bottom of'} your library.`, cards: state.hand.slice(), max: k, min: k, done: picked => {
        openOrderList(`${src}: order the cards`, picked, ordered => { snap(); for (const c of ordered) { const i = state.hand.findIndex(x => x.id === c.id); if (i >= 0) state.hand.splice(i, 1); }
          if (top) state.library.unshift(...ordered); else state.library.push(...ordered); log(`${src}: drew ${nd}, put ${ordered.map(c => c.name).join(', ')} ${top ? 'on top of' : 'on the bottom of'} the library`); render(); }); } }); } }, ...massRest(sents, 1, obj)];
  }
  // Growth Spiral: "You may put a land card from your hand onto the battlefield."
  if ((m = /^you may put (?:a|an|one) (.+?) cards? from your hand onto the battlefield( tapped)?$/i.exec(s0))) {
    const kind = m[1].toLowerCase(), tapped = !!m[2];
    return [{ full: sents.length === 1, label: `You may put a ${kind} card from your hand onto the battlefield${tapped ? ' tapped' : ''}`, fn: () => { const ok = c => { const tl = (cardInfo(c.name) || {}).t || ''; return kind.split(/\s+/).every(w => w === 'nonland' ? !/\bLand\b/.test(tl) : w === 'permanent' ? !/Instant|Sorcery/.test(tl) : new RegExp('\\b' + singularWord(w) + '\\b', 'i').test(tl)); };
      const cands = state.hand.filter(ok); if (!cands.length) { toast('Nothing to put', `You have no ${kind} card in your hand.`); return; }
      openPickCards({ title: `${src}: put a ${kind} card onto the battlefield`, note: 'Choose a card, or none.', cards: cands, max: 1, nothing: 'Put none', done: picked => { for (const c of picked) { const i = state.hand.findIndex(x => x.id === c.id); if (i < 0) continue; snap(); const [x] = state.hand.splice(i, 1); enterBattlefield(x, { from: 'hand', logMsg: `${src}: ${x.name} put onto the battlefield${tapped ? ' tapped' : ''}`, tapped }); if (tapped) x.tapped = true; } render(); } }); } }, ...massRest(sents, 1, obj)];
  }
  // an earlier sentence is something else ("Draw a card. You may put a land card from your hand onto the battlefield."): read it, then this one
  for (let j = 1; j < sents.length; j++) { const tail = handRefillOptions(sents.slice(j).join(' '), obj); if (tail) { const head = effectOptionsBase(sents.slice(0, j).join(' '), obj).filter(o => typeof o.fn === 'function' && !o.hidden); return [...head, ...tail]; } }
  return null;
}
// ---- the card itself moves: "Return ~ to its owner's hand." "Put this artifact on top of its owner's library." (Rancor, Sensei's Divining Top)
function selfMoveOptions(tx, obj) {
  if (!state || !obj || !obj.sourceId) return null; const sents = MASS_SENTS(tx); const src = obj.sourceName || 'Ability'; const self = '(?:~|this [a-z]+|it|that card|' + String(src).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')';
  const move = (to) => () => { const f = findCard(obj.sourceId); if (!f) { log(`${src} is not in a zone it can move from`); return; } snap(); if (f.card.token) { moveCard(f.card.id, 'graveyard'); return; } if (to === 'hand') moveCard(f.card.id, 'hand'); else { moveCard(f.card.id, 'library'); } log(`${src}: ${to === 'hand' ? 'returned to its owner\'s hand' : 'put on top of its owner\'s library'}`); render(); };
  let m;
  if ((m = new RegExp('^return ' + self + ' to its owner\'s hand$', 'i').exec(sents[0].replace(/\.$/, '')))) return [{ full: sents.length === 1, label: `Return ${src} to its owner's hand`, fn: move('hand') }, ...massRest(sents, 1, obj)];
  if ((m = new RegExp('^(?:you may )?put ' + self + ' on top of (?:its owner\'s|your) library$', 'i').exec(sents[0].replace(/\.$/, '')))) return [{ full: sents.length === 1, label: `Put ${src} on top of its owner's library`, fn: move('top') }, ...massRest(sents, 1, obj)];
  if ((m = new RegExp('^(.+?), then put ' + self + ' on top of (?:its owner\'s|your) library$', 'i').exec(sents[0].replace(/\.$/, '')))) { const first = effectOptionsBase(m[1] + '.', obj).filter(o => typeof o.fn === 'function' && !o.hidden); if (first.length === 1) return [{ full: sents.length === 1, label: `${first[0].label}, then put ${src} on top of its owner's library`, fn: () => { first[0].fn(); afterSettled(() => move('top')()); } }, ...massRest(sents, 1, obj)]; }
  return null;
}
// ---- "Target player draws two cards and loses 2 life." "Target player mills two cards." "Target player discards two cards (at random)."
function playerClauseOptions(tx, obj) {
  if (!state) return null; const sents = MASS_SENTS(tx); const s0 = (sents[0] || '').replace(/\.$/, ''); const m = /^target (player|opponent) (.+)$/i.exec(s0); if (!m) return null; const src = (obj && obj.sourceName) || 'Ability';
  const parts = m[2].split(/,? and (?=(?:loses?|gains?|draws?|mills?|discards?)\b)/i).map(x => x.trim()); const acts = [];
  for (const p of parts) { let q;
    if ((q = /^draws? (a|one|two|three|four|five|\d+) cards?$/i.exec(p))) acts.push({ k: 'draw', n: MASS_NUM(q[1]) }); else if ((q = /^loses? (\d+) life$/i.exec(p))) acts.push({ k: 'lose', n: +q[1] }); else if ((q = /^gains? (\d+) life$/i.exec(p))) acts.push({ k: 'gain', n: +q[1] });
    else if ((q = /^mills? (a|one|two|three|four|five|six|seven|\d+) cards?$/i.exec(p))) acts.push({ k: 'mill', n: MASS_NUM(q[1]) }); else if ((q = /^discards? (a|one|two|three|four|five|\d+) cards?( at random)?$/i.exec(p))) acts.push({ k: 'discard', n: MASS_NUM(q[1]), rnd: !!q[2] });
    else return null; }
  const run = who => () => { snap(); const lines = [];
    const doDiscards = () => { const d = acts.find(a => a.k === 'discard'); if (!d || who !== 'you') return; if (d.rnd) discardRandom(d.n, src); else { const k = Math.min(d.n, state.hand.length); if (k) openPickCards({ title: `${src}: discard ${k} card${k === 1 ? '' : 's'}`, note: `Choose ${k} card${k === 1 ? '' : 's'} from your hand to discard.`, cards: state.hand.slice(), max: k, min: k, done: p => { discardFromHand(p, src); render(); } }); } };
    for (const a of acts) { if (who === 'you') { if (a.k === 'draw') lines.push(`drew ${drawCards(a.n)}`); else if (a.k === 'lose') { changeLife(-a.n, true); lines.push(`lost ${a.n} life`); } else if (a.k === 'gain') { changeLife(a.n, true); lines.push(`gained ${a.n} life`); } else if (a.k === 'mill') { millCards(a.n); lines.push(`milled ${a.n}`); } }
      else { if (a.k === 'lose') { changeOppLife(-a.n); lines.push(`opponent lost ${a.n} life`); } else if (a.k === 'gain') { changeOppLife(a.n); lines.push(`opponent gained ${a.n} life`); } else lines.push(`opponent ${a.k === 'draw' ? 'draws' : a.k === 'mill' ? 'mills' : 'discards'} ${a.n} (their library and hand are not tracked)`); } }
    if (lines.length) log(`${src}: ${lines.join(', ')}`); doDiscards(); render(); };
  const descOf = third => acts.map(a => a.k === 'draw' ? `${third ? 'draws' : 'draw'} ${a.n}` : a.k === 'lose' ? `${third ? 'loses' : 'lose'} ${a.n} life` : a.k === 'gain' ? `${third ? 'gains' : 'gain'} ${a.n} life` : a.k === 'mill' ? `${third ? 'mills' : 'mill'} ${a.n}` : `${third ? 'discards' : 'discard'} ${a.n}${a.rnd ? ' at random' : ''}`).join(' and '), desc = descOf(true);
  const t = (obj && obj.targets || [])[0], who = t && t.kind === 'player' ? t.id : null; const full = sents.length === 1;
  if (who) return [{ full, label: `${who === 'you' ? 'You ' + descOf(false) : 'Your opponent ' + desc}`, fn: run(who) }, ...massRest(sents, 1, obj)];
  return [{ full, label: `You ${descOf(false)}`, fn: run('you') }, { full, label: `Your opponent ${desc}`, fn: run('opp') }, ...massRest(sents, 1, obj)];
}
// ---- the opponent's hand is not tracked in a goldfish game: say so instead of silently skipping ("Target opponent reveals their hand. You choose a nonland card from it. That player discards that card.")
function oppHandOptions(tx, obj) {
  if (!state) return null; const sents = MASS_SENTS(tx); if (!sents.length) return null; const src = (obj && obj.sourceName) || 'Ability';
  if (!/^target (?:player|opponent) reveals (?:their|his or her) hand$/i.test(sents[0].replace(/\.$/, ''))) return null;
  const rest = sents.slice(1); if (!rest.every(s => /^you choose (?:a|an) .+ card from it\b|^that player discards (?:that card|it)$/i.test(s.replace(/\.$/, '')))) return null;
  return [{ full: true, label: `${src}: the opponent reveals their hand and discards the card you choose (their hand is not tracked in a goldfish game)`, fn: () => { log(`${src}: opponent's hand is not tracked here, so look at it and make them discard at the table`); toast(`${src}`, "Your opponent's hand is not tracked in a goldfish game. Do this part at the table."); } }];
}
// ---- kicker: "... deals 2 damage ... If this spell was kicked, it deals 4 damage instead." -> the right number is substituted before the effect is read (CR 702.33)
function applyKickedInstead(tx, kicked) {
  let t = String(tx || '');
  const km = /\s*If (?:this spell|it|that spell|~) was kicked, (?:it|~|this spell) deals? (\d+) damage instead\.?/i.exec(t);
  if (km) { t = t.replace(km[0], ''); if (kicked) t = t.replace(/\bdeals? (\d+) damage/i, a => a.replace(/\d+/, km[1])); }
  t = t.replace(/\s*If (?:this spell|it|that spell|~) was kicked, ([^.]+\.)/i, (all, rest) => kicked ? ' ' + rest.charAt(0).toUpperCase() + rest.slice(1) : '');
  return t;
}

// "When this leaves the battlefield, return the exiled card to the battlefield under its owner's control." (Oblivion Ring): the exile was recorded when it happened (CR 610.3), so the card comes back by itself.
function exiledReturnOptions(tx, obj) {
  if (!/^return the exiled cards? to the battlefield under (?:its|their) owner'?s? control\.?$/i.test(String(tx || '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim())) return null; const src = (obj && obj.sourceName) || 'Ability';
  return [{ full: true, label: `The exiled card returns to the battlefield (the app already did this when ${src} left)`, fn: () => log(`${src}: the card it exiled returns to the battlefield under its owner's control (done automatically)`) }];
}
