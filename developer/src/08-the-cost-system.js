// ---------------------------------------------------------------- the cost system (v0.46)
// One model for what it costs to cast a spell or activate an ability (rules 601.2b-h):
//   1. choose HOW to pay: the normal cost, an alternative cost (evoke, "exile a blue card from your hand"...), optional extras (kicker)
//   2. work out the total: printed cost + increases (Thalia) - reductions (Goblin Electromancer, "costs {2} less for each...")
//   3. choose what pays the non-mana parts (which creature to sacrifice, which card to discard...)
//   4. Delve / Convoke / Improvise: cards that pay part of the mana
//   5. pay the mana (floating mana first, then lands)
// Nothing changes in the game until every choice is made; cancelling at any window leaves the game untouched.
const numw = w => (String(w).toLowerCase() === 'another' ? 1 : numOf(w));
const PICK_KINDS = ['sac', 'discard', 'exile', 'tapOther', 'bounce', 'blight', 'reveal'];

function splitCostParts(t) {
  return String(t || '').replace(/’/g, "'").replace(/\.$/, '')
    .split(/,\s*(?![^{]*\})|\s+and\s+(?=(?:exile|discard|sacrifice|tap|return|pay|remove)\b)/i)
    .map(x => (x || '').trim().replace(/^and\s+/i, '')).filter(Boolean);
}
// "blue card", "creature or artifact", "another creature", "untapped Elf", "land card" -> a filter object
function parseCostFilter(phrase) {
  let s = String(phrase || '').toLowerCase().replace(/\b(?:you control|from your hand|from your graveyard|in your graveyard|on the battlefield)\b/g, ' ').replace(/\bcards?\b/g, ' ').trim();
  const f = { alts: [], other: false, untapped: false, text: String(phrase || '').trim() };
  { const pw = s.match(/\bwith power (\d+) or greater\b/); if (pw) { f.minPower = +pw[1]; s = s.replace(pw[0], ' ').trim(); } }   // v0.96.2 casualty
  if (/\b(?:another|other)\b/.test(s)) { f.other = true; s = s.replace(/\b(?:another|other)\b/g, ' '); }
  if (/\buntapped\b/.test(s)) { f.untapped = true; s = s.replace(/\buntapped\b/g, ' '); }
  for (const part of s.split(/\s+or\s+|,\s*/)) {
    const a = { types: [], colors: [], subs: [], nonland: false };
    for (const w0 of part.trim().split(/\s+/)) {
      if (!w0 || w0 === 'a' || w0 === 'an') continue;
      const w = singularWord(w0);
      if (w === 'nonland') a.nonland = true;
      else if (COLOR_LETTER[w]) a.colors.push(COLOR_LETTER[w]);
      else if (TYPE_WORDS.includes(w) || w === 'instant' || w === 'sorcery' || w === 'legendary') a.types.push(w);
      else a.subs.push(w);
    }
    f.alts.push(a);
  }
  if (!f.alts.length) f.alts.push({ types: [], colors: [], subs: [], nonland: false });
  return f;
}
function cardMatchesFilter(c, f, srcId) {
  if (f.other && c.id === srcId) return false;
  if (f.untapped && c.tapped) return false;
  if (f.minPower && ptCalc(c).p < f.minPower) return false;
  const p = permTypeInfo(c), cols = c.token ? [] : (onBattlefield(c) ? effColors(c) : printedColors(c));
  return f.alts.some(a => (!a.types.length || a.types.some(t => p.types.has(t))) && (!a.colors.length || a.colors.some(x => cols.includes(x)))
    && (!a.subs.length || a.subs.some(sb => p.subs.has(sb))) && (!a.nonland || !p.types.has('land')));
}
// Parse a cost string ("{2}, {T}, Sacrifice a creature") into components.
function parseCostComps(text, short) {
  const nameRe = String(short || '~').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const out = [];
  for (const part of splitCostParts(text)) {
    let m;
    if (/^\{T\}$/i.test(part)) out.push({ k: 'tap' });
    else if (/^(?:\{[^}]+\})+$/.test(part)) out.push({ k: 'mana', mana: part });
    else if (new RegExp('^Sacrifice (?:' + nameRe + '|this \\w+|~|it)$', 'i').test(part)) out.push({ k: 'sacSelf' });
    else if ((m = part.match(new RegExp('^Remove (a|an|one|two|three|\\d+) (\\+1/\\+1|[\\u2212-]1/[\\u2212-]1) counters? from (?:' + nameRe + '|this \\w+|~|it)$', 'i')))) out.push({ k: 'removeCounter', n: numw(m[1]), kind: /^\+/.test(m[2]) ? 'plus' : 'minus' });
    else if ((m = part.match(/^Pay (\d+) life$/i))) out.push({ k: 'life', n: +m[1] });
    else if ((m = part.match(/^Sacrifice (a|an|another|one|two|three|\d+) (.+)$/i))) out.push({ k: 'sac', n: numw(m[1]), f: parseCostFilter((/^another$/i.test(m[1]) ? 'another ' : '') + m[2]), text: part });
    else if (/^Discard (?:this card|~|it)$/i.test(part) || new RegExp('^Discard ' + nameRe + '$', 'i').test(part)) out.push({ k: 'discardSelf' });
    else if ((m = part.match(/^Discard (a|an|one|two|three|\d+) (.+?)s?$/i))) out.push({ k: 'discard', n: numw(m[1]), f: parseCostFilter(m[2]), text: part });
    else if ((m = part.match(/^Exile (a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+) (.*?)\s*cards? from your (graveyard|hand)$/i))) out.push({ k: 'exile', n: numw(m[1]), zone: m[3].toLowerCase(), f: parseCostFilter(m[2]), text: part });
    else if ((m = part.match(/^Tap (a|an|one|two|three|\d+) untapped (.+?)(?: you control)?$/i))) out.push({ k: 'tapOther', n: numw(m[1]), f: parseCostFilter('untapped ' + m[2]), text: part });
    else if ((m = part.match(/^Return (a|an|one|two|three|\d+) (.+?) you control to (?:its|their) owner'?s? hand$/i))) out.push({ k: 'bounce', n: numw(m[1]), f: parseCostFilter(m[2]), text: part });
    else if ((m = part.match(/^Blight (a|an|one|two|three|\d+)$/i))) out.push({ k: 'blight', n: 1, cnt: numw(m[1]), f: parseCostFilter('creature'), text: part });   // v0.86: put N -1/-1 counters on a creature you control
    else if ((m = part.match(/^Reveal (a|an|one|two|three|\d+) (.+?) cards? from your hand$/i))) out.push({ k: 'reveal', n: numw(m[1]), f: parseCostFilter(m[2]), text: part });   // v0.86
    else out.push({ k: 'other', text: part });
  }
  return out;
}
const manaOf = comps => comps.filter(k => k.k === 'mana').map(k => k.mana).join('');

// ---- cards that can pay for a component
function compCands(comp, srcId, taken) {
  const ok = c => !taken.has(c.id) && cardMatchesFilter(c, comp.f, srcId);
  switch (comp.k) {
    case 'sac': case 'bounce': return state.battlefield.filter(ok);
    case 'tapOther': return state.battlefield.filter(c => !c.tapped && ok(c));
    case 'discard': case 'reveal': return state.hand.filter(c => c.id !== srcId && ok(c));
    case 'blight': return state.battlefield.filter(c => !taken.has(c.id) && permTypeInfo(c).types.has('creature'));
    case 'exile': return (comp.zone === 'hand' ? state.hand : state.graveyard).filter(c => c.id !== srcId && ok(c));
  }
  return [];
}
// '' when every component can be paid right now, otherwise a plain-words reason.
function compsFeasible(comps, srcId) {
  if (!state) return '';
  const taken = new Set(); let life = 0;
  for (const comp of comps) {
    if (comp.k === 'life') life += comp.n;
    else if (PICK_KINDS.includes(comp.k)) {
      const c = compCands(comp, srcId, taken);
      if (c.length < comp.n) return `${comp.text} (you do not have ${comp.n === 1 ? 'one' : comp.n} to use)`;
      c.slice(0, comp.n).forEach(x => taken.add(x.id));
    }
  }
  if (life && state.life < life) return `Pay ${life} life (you have ${state.life})`;
  return '';
}

// ---- cost increases and reductions from permanents (Thalia, Goblin Electromancer, Sphere of Resistance...)
function spellSubjTest(subj) {
  const s = String(subj || '').toLowerCase().trim();
  if (!s) return () => true;
  const tests = s.split(/\s+(?:and|or)\s+|,\s*/).map(p0 => {
    let p = p0.trim(), neg = false;
    if (/^non/.test(p)) { neg = true; p = p.slice(3); }
    let f;
    if (COLOR_LETTER[p]) f = c => printedColors(c).includes(COLOR_LETTER[p]);
    else if (p === 'multicolored') f = c => printedColors(c).length > 1;
    else if (p === 'colorless') f = c => printedColors(c).length === 0;
    else if (p === 'historic') f = c => { const t = permTypeInfo(c); return t.types.has('artifact') || t.legendary || t.subs.has('saga'); };
    else f = c => permTypeInfo(c).types.has(p);
    return neg ? c => !f(c) : f;
  });
  return c => tests.some(t => t(c));
}
function costAdjustments(c) { return c && c.id != null ? renderMemo('ca:' + c.id + ':' + c.name, () => costAdjustmentsRaw(c)).slice() : costAdjustmentsRaw(c); }
function costAdjustmentsRaw(c) {
  const out = []; if (!state || !c) return out;
  const test = (src, dir, amt, subj) => { if (amt > 0 && spellSubjTest(subj)(c)) out.push({ src, dir, amt }); };
  for (const g of state.battlefield) {
    if (g.token) continue;
    const i = cardInfo(g.name); if (!i || !i.tx) continue;
    for (const raw of i.tx.replace(/\([^)]*\)/g, '').replace(/’/g, "'").split('\n')) for (const seg of raw.split(/(?<=\.)\s+/)) {
      const m = seg.trim().match(/^(.*?)\s*\bspells?\s+(you cast\s+|your opponents cast\s+)?cost\s+((?:\{[^}]+\})+)\s+(more|less)\s+to cast\b/i);
      if (!m || /opponents/i.test(m[2] || '')) continue;
      test(g.name, m[4].toLowerCase(), (m[3].match(/\{(\d+)\}/g) || []).reduce((a, x) => a + parseInt(x.slice(1), 10), 0), m[1]);
    }
  }
  for (const mod of (state.costMods || [])) test(mod.label, mod.dir, mod.amt, mod.subj);
  out.push(...perSpellTaxAdj(c));
  return out;
}
// Returns { base, cost, reduced, increased, why, add, cut } for a card in the current game.
function effectiveCost(c) {
  const i = c && cardInfo(c.name);
  const base = i && i.mc ? i.mc.split(' // ')[0] : '';
  const out = { base, cost: base, reduced: 0, increased: false, why: '', add: 0, cut: 0 };
  if (!base || !state) return out;
  const gm = base.match(/\{(\d+)\}/), g0 = gm ? parseInt(gm[1], 10) : 0;
  const notes = []; let add = 0, cut = 0;
  const tx = (i.tx || '').replace(/\([^)]*\)/g, '');
  const re = /costs?\s+((?:\{[^}]+\})+)\s+less to cast\b[^.]*?\bfor each ([^.]+?)\./i, m = tx.match(re);
  if (m) {
    const per = (m[1].match(/\{(\d+)\}/g) || []).reduce((a, x) => a + parseInt(x.slice(1), 10), 0), n = countForEach(m[2]);
    if (per && n !== null && per * n > 0) { cut += per * n; notes.push(`${n} × {${per}} less (${m[2].replace(/ you control$/, '').replace(/^basic land type among lands$/, 'basic land type')})`); }
  }
  if (/^Undaunted\s*$/im.test(tx)) { cut += 1; notes.push('Undaunted: {1} less for each opponent (1 opponent)'); }
  const am = tx.match(/^Affinity for ([a-z ]+?)\s*$/im);
  if (am) { const w = singularWord(am[1].trim().split(/\s+/).pop()), n = state.battlefield.filter(x => { const p = permTypeInfo(x); return p.types.has(w) || p.subs.has(w); }).length; if (n) { cut += n; notes.push(`Affinity: ${n} × {1} less (${am[1].trim()})`); } }
  for (const a of costAdjustments(c)) { if (a.dir === 'more') add += a.amt; else cut += a.amt; notes.push(`${a.src} ${a.dir === 'more' ? '+' : '−'}{${a.amt}}`); }
  out.add = add; out.cut = cut;
  let g1 = Math.max(0, g0 + add - cut);
  out.tri = trinisphereOn();
  if (out.tri) { const pb = manaCostParts(base), col = pb.colors.length + pb.flexible.length; if (g1 + col < 3) { g1 = 3 - col; notes.push('Trinisphere: each spell costs at least {3}'); } }
  const net = g1 - g0;
  if (net !== 0) out.cost = (g1 > 0 ? `{${g1}}` : '') + base.replace(/\{\d+\}/, '');
  out.reduced = Math.abs(net); out.increased = net > 0; out.why = notes.join('; ');
  return out;
}
// The same total adjustments applied to an alternative cost.
function trinisphereOn() { return !!state && state.battlefield.some(x => !x.tapped && !x.token && /each spell that would cost less than three mana to cast costs three mana to cast/i.test(((cardInfo(x.name) || {}).tx || '').replace(/\s+/g, ' '))); }
function taxed(mana, ec) {
  const p = manaCostParts(mana || '');
  let g = Math.max(0, p.generic + ec.add - ec.cut);
  if (ec.tri && g + p.colors.length + p.flexible.length < 3) g = 3 - p.colors.length - p.flexible.length;
  return (g ? `{${g}}` : '') + p.colors.map(x => `{${x}}`).join('') + p.flexible.map(x => `{${x}}`).join('');
}

// ---- alternative and additional costs, read from the card's text
function altCostsFor(c) {
  const tx = cardText(c).replace(/\([^)]*\)/g, '').replace(/’/g, "'"), out = []; let m;
  for (const raw of tx.split('\n')) {
    const line = raw.trim();
    { const ak = altKwLine(line, c); if (ak) { out.push(ak); continue; } }   // v0.96.2 blitz, dash, spectacle, surge
    if ((m = line.match(/^Evoke\s+((?:\{[^}]+\})+)\s*$/i))) out.push({ kind: 'evoke', label: 'Evoke', mana: m[1], comps: [] });
    else if ((m = line.match(/^Warp\s+((?:\{[^}]+\})+)\s*$/i))) out.push({ kind: 'warp', label: 'Warp', mana: m[1], comps: [] });
    else if ((m = line.match(/^Warp\s*[\u2014-]\s*(.+?)\.?$/i))) { const cs = parseCostComps(m[1], c.name); out.push({ kind: 'warp', label: 'Warp \u2014 ' + m[1].replace(/\.$/, ''), mana: manaOf(cs), comps: cs.filter(k => k.k !== 'mana') }); }
    else if ((m = line.match(/^Evoke—(.+?)\.?$/i))) { const cs = parseCostComps(m[1], c.name); out.push({ kind: 'evoke', label: 'Evoke — ' + m[1].replace(/\.$/, ''), mana: manaOf(cs), comps: cs.filter(k => k.k !== 'mana') }); }
    else if ((m = line.match(/(?:^|\.\s+)(?:(If [^,]+),\s*)?you may ((?:pay|exile|discard|sacrifice|tap|return)\b[^.]*?) rather than pay (?:this spell's|its) mana cost/i))) {
      const cs = parseCostComps(m[2], c.name);
      out.push({ kind: 'alt', label: m[2].charAt(0).toUpperCase() + m[2].slice(1), cond: m[1] || '', mana: manaOf(cs), comps: cs.filter(k => k.k !== 'mana') });
    }
  }
  out.push(...altKwExtra(c));
  return out;
}
function additionalCosts(c) {
  const tx = cardText(c).replace(/\([^)]*\)/g, '').replace(/’/g, "'"), req = { mana: '', comps: [] }, optional = []; let m;
  for (const raw of tx.split('\n')) {
    const line = raw.trim();
    { const co = casualtyOptional(line, c); if (co) { optional.push(co); continue; } }   // v0.96.2
    if ((m = line.match(/^Squad\s+((?:\{[^}]+\})+)\s*$/i))) { optional.push({ label: 'Squad', mana: m[1], comps: [], replicate: true, squad: true }); continue; }   // v0.96.22 CR 702.157
    if ((m = line.match(/^Offspring\s+((?:\{[^}]+\})+)\s*$/i))) { optional.push({ label: 'Offspring', mana: m[1], comps: [], offspring: true }); continue; }   // CR 702.175
    if ((m = line.match(/^Replicate\s+((?:\{[^}]+\})+)\s*$/i))) { optional.push({ label: 'Replicate', mana: m[1], comps: [], replicate: true }); continue; }   // v0.96.3
    if ((m = line.match(/^As an additional cost to cast this spell, (you may )?(.+?)\.?$/i))) {
      const cs = parseCostComps(m[2], c.name), mana = manaOf(cs), rest = cs.filter(k => k.k !== 'mana');
      if (m[1]) optional.push({ label: m[2], mana, comps: rest }); else { req.mana += mana; req.comps.push(...rest); }
    } else if ((m = line.match(/^Kicker\s+((?:\{[^}]+\})+)\s*$/i))) optional.push({ label: 'Kicker', mana: m[1], comps: [], kicker: true });
    else if ((m = line.match(/^Kicker—(.+?)\.?$/i))) { const cs = parseCostComps(m[1], c.name); optional.push({ label: 'Kicker — ' + m[1], mana: manaOf(cs), comps: cs.filter(k => k.k !== 'mana'), kicker: true }); }
  }
  for (const o of spliceOffers(c)) optional.push(o);   // v0.98.3 Splice (CR 702.47)
  return { req, optional };
}
// Every way this card can be cast right now: { label, mana, comps, alt, ok, why, detail }
function castRoutes(c, extra) {
  const ec = effectiveCost(c), ad = additionalCosts(c), alts = altCostsFor(c).filter(a => !(a.kind === 'warp' && c.fromExile));   // warp is a from-hand cost only
  const mk = (label, mana, alt, cond) => {
    const comps = ad.req.comps.concat(alt ? alt.comps : []);
    const r = { label, mana: mergeGeneric(mana + (extra || '') + ad.req.mana), comps, alt, cond: cond || '', ok: true, why: '', detail: '' };
    const cw = compsFeasible(comps.filter(k => k.k !== 'other'), c.id);
    const altWhy = alt && alt.test ? alt.test(c) : '';
    if (altWhy) { r.ok = false; r.why = 'condition'; r.detail = altWhy; }
    else if (cw) { r.ok = false; r.why = 'additional'; r.detail = cw; }
    else if (!manaFeasible(c, alt && alt.reduceBySac ? reduceGenericBy(r.mana, bestSacMV()) : r.mana)) {
      const total = manaTotal() + withCtx(c, manaSources).length; r.ok = false;
      r.why = total < symCmc(r.mana) ? 'amount' : 'color'; r.detail = r.why === 'amount' ? 'not enough mana' : 'not the right colours of mana';
    }
    return r;
  };
  if (c.fromGy) { const a = { kind: 'flashback', label: c.fromGy.label, mana: c.fromGy.mana, comps: c.fromGy.comps || [] }; return [mk(a.label, taxed(a.mana, ec), a, '')]; }
  const routes = [mk(alts.length || ad.optional.length ? 'Normal cost' : 'Cast', ec.cost, null)];
  for (const a of alts) routes.push(mk(a.label, a.mana ? taxed(a.mana, ec) : taxed('', ec), a, a.cond));
  const lim = routeLimits(c, routes); return lim.length ? lim : routes;
}
function manaFeasible(c, mana) {
  let cost = mana || '';
  for (const k of reducerKinds(c)) cost = reduceCost(cost, k, reducerCands(k));
  return manaPaymentAllocation(manaCostParts(cost), (state && state.manaPool) || {}, withCtx(c, manaSources), null).ok;
}

// ---- Delve, Convoke, Improvise
function reducerKinds(c) { const tx = cardText(c), k = []; for (const w of ['delve', 'convoke', 'improvise']) if (kwLine(tx, w)) k.push(w); return k; }
function reducerCands(kind) {
  if (!state) return [];
  if (kind === 'delve') return state.graveyard.slice();
  if (kind === 'convoke') return state.battlefield.filter(x => !x.tapped && permTypeInfo(x).types.has('creature'));
  return state.battlefield.filter(x => !x.tapped && permTypeInfo(x).types.has('artifact'));
}
function reduceCost(cost, kind, cards) {
  const p = manaCostParts(cost); let g = p.generic; const cols = p.colors.slice();
  for (const card of cards) {
    if (kind === 'convoke') { const cc = effColors(card), ix = cols.findIndex(x => cc.includes(x)); if (ix >= 0) { cols.splice(ix, 1); continue; } }
    if (g > 0) g--;
  }
  return (g ? `{${g}}` : '') + cols.map(x => `{${x}}`).join('') + p.flexible.map(x => `{${x}}`).join('');
}
const costKey = s => JSON.stringify(manaCostParts(s));
const REDUCER_TEXT = {
  delve: 'Delve: exile cards from your graveyard. Each card exiled pays for {1} of the generic cost.',
  convoke: 'Convoke: tap untapped creatures you control. Each one pays for {1}, or for one mana of a colour it shares with the cost.',
  improvise: 'Improvise: tap untapped artifacts you control. Each one pays for {1} of the generic cost.'
};
function openReducer(c, kind, mana, cands, cb) {
  const m = modal(`${c.name}: ${kind[0].toUpperCase() + kind.slice(1)}`, { width: 600, sticky: true, onCancel: () => {} });
  const sel = new Set(), rows = h('div', { class: 'prelist' }), left = h('div', { class: 'psub' });
  const chosen = () => cands.filter(x => sel.has(x.id));
  const upd = () => { left.replaceChildren('Cost still to pay in mana: ', symbols(reduceCost(mana, kind, chosen())) || 'nothing'); cands.forEach((x, i) => rows.children[i].classList.toggle('sel', sel.has(x.id))); };
  cands.forEach(x => {
    const row = h('div', { class: 'row' }, h('span', { class: 'nm', text: x.name }), h('span', { class: 'muted small', text: kind === 'delve' ? '' : (permTypeInfo(x).types.has('creature') ? effColors(x).join('') || 'colourless' : 'artifact') }));
    row.addEventListener('click', () => {
      if (sel.has(x.id)) sel.delete(x.id);
      else if (costKey(reduceCost(mana, kind, chosen())) !== costKey(reduceCost(mana, kind, chosen().concat([x])))) sel.add(x.id);   // ignore picks that would pay for nothing
      upd();
    });
    rows.append(row);
  });
  m.body.append(h('div', { class: 'psub', text: REDUCER_TEXT[kind] }), left, rows, teach('costGuidance') ? h('div', { class: 'muted small', text: 'Choosing none is fine. Cards you pick are exiled or tapped as you cast the spell, before you pay the remaining mana.' }) : null);
  m.foot.append(h('button', { text: 'Cancel', onclick: () => m.close() }), h('button', { class: 'primary', text: 'Continue', onclick: () => { const ids = chosen(); m.close(); cb(reduceCost(mana, kind, ids), ids.map(x => x.id)); } }));
  upd();
}
function runReducers(c, mana, kinds, cb, picks) {
  picks = picks || [];
  if (!kinds.length || !mana || !/\{/.test(mana)) { cb(mana, picks); return; }
  const kind = kinds[0], rest = kinds.slice(1), cands = reducerCands(kind);
  if (!cands.length || costKey(reduceCost(mana, kind, cands)) === costKey(mana)) { runReducers(c, mana, rest, cb, picks); return; }
  openReducer(c, kind, mana, cands, (m2, ids) => runReducers(c, m2, rest, cb, ids.length ? picks.concat([{ comp: { k: kind }, ids }]) : picks));
}

// ---- choosing the cards that pay a cost
function pickCardsModal(title, intro, cands, n, cb, verb) {
  if (verb === 'discard' && cands.length && cands.every(x => state.hand.some(c => c.id === x.id))) {   // v0.90.1: discard costs are chosen in the hand zone
    const okIds = new Set(cands.map(x => x.id)); pickFromHand({ n, title: String(title).split(':')[0], verb, note: 'This is part of the cost.', ok: c => okIds.has(c.id), choose: true, cancel: true, done: cb }); return;
  }
  const m = modal(title, { width: 600, sticky: true, onCancel: () => {} });
  const sel = new Set(), rows = h('div', { class: 'prelist' }), go = h('button', { class: 'primary', text: 'Confirm', disabled: true });
  const upd = () => { cands.forEach((x, i) => rows.children[i].classList.toggle('sel', sel.has(x.id))); go.disabled = sel.size !== n; go.textContent = `Confirm (${sel.size}/${n})`; };
  cands.forEach(x => {
    const i = x.token ? null : cardInfo(x.name);
    const row = h('div', { class: 'row' }, h('span', { class: 'nm', text: x.name + (x.tapped ? ' (tapped)' : '') }), h('span', { class: 'muted small', text: x.token ? 'Token' : (i && i.t) || '' }));
    row.addEventListener('click', () => { if (sel.has(x.id)) sel.delete(x.id); else if (n === 1) { sel.clear(); sel.add(x.id); } else if (sel.size < n) sel.add(x.id); upd(); });
    rows.append(row);
  });
  go.addEventListener('click', () => { const ids = [...sel]; m.close(); cb(ids); });
  m.body.append(h('div', { class: 'psub', text: intro }), rows);
  m.foot.append(h('button', { text: 'Cancel', onclick: () => m.close() }), go);
  upd();
}
// Ask for every non-mana choice, one after another. cb(picks) gets [{comp, ids}]. Nothing is changed yet.
function gatherCosts(src, comps, cb) {
  const need = comps.filter(k => PICK_KINDS.includes(k.k));
  if (!need.length) { cb([]); return; }
  const picks = [], taken = new Set(); let ix = 0;
  const VERB = { sac: 'sacrifice', discard: 'discard', exile: 'exile', tapOther: 'tap', bounce: 'return to your hand', blight: 'put the -1/-1 counters on', reveal: 'reveal' };
  const next = () => {
    if (ix >= need.length) { cb(picks); return; }
    const comp = need[ix++], cands = compCands(comp, src.id, taken);
    const done = ids => { ids.forEach(x => taken.add(x)); picks.push({ comp, ids }); next(); };
    if (cands.length < comp.n) { toast('Cannot pay the cost', comp.text); return; }
    if (cands.length === comp.n) { done(cands.map(x => x.id)); return; }
    pickCardsModal(`${src.name}: ${comp.text}`, `Choose ${comp.n} to ${VERB[comp.k]}. This is part of the cost, so it happens as you ${src.ability ? 'activate the ability' : 'cast the spell'}, before it goes on the stack.`, cands, comp.n, done, comp.k);
  };
  next();
}
let snapMuted = false, costHold = false;
// Do the payments. One undo step covers the whole cast; triggers they cause wait until the spell is on the stack.
function applyPicks(src, picks) {
  for (const p of picks) for (const id of p.ids) {
    const f = findCard(id); if (!f) continue;
    const nm = f.card.name;
    switch (p.comp.k) {
      case 'sac': log(`${src.name}: sacrificed ${nm} as a cost`); moveCard(id, 'graveyard'); break;
      case 'discard': log(`${src.name}: discarded ${nm} as a cost`); moveCard(id, 'graveyard'); break;
      case 'exile': log(`${src.name}: exiled ${nm} from your ${p.comp.zone} as a cost`); (src.exiledWith = src.exiledWith || []).push({ name: nm }); moveCard(id, 'exile'); break;
      case 'delve': log(`${src.name}: delved ${nm} (exiled from your graveyard)`); (src.exiledWith = src.exiledWith || []).push({ name: nm }); moveCard(id, 'exile'); break;
      case 'tapOther': case 'convoke': case 'improvise': f.card.tapped = true; log(`${src.name}: tapped ${nm} as a cost${p.comp.k === 'tapOther' ? '' : ' (' + p.comp.k + ')'}`); break;
      case 'bounce': log(`${src.name}: returned ${nm} to your hand as a cost`); moveCard(id, 'hand'); break;
      case 'blight': addCounter(id, p.comp.cnt || 1, 'minus'); log(`${src.name}: blight ${p.comp.cnt || 1} — put ${p.comp.cnt || 1} -1/-1 counter${(p.comp.cnt || 1) === 1 ? '' : 's'} on ${nm}`); break;
      case 'reveal': log(`${src.name}: revealed ${nm} from your hand as a cost (it stays in your hand)`); break;
    }
  }
}
function applyCostInfo(c, ci) {
  snapMuted = true; costHold = true;
  try {
    if (ci.life) { state.life -= ci.life; log(`${c.name}: paid ${ci.life} life as a cost`); }
    applyPicks(c, ci.picks || []);
    if (ci.alt === 'warp') { c.warped = true; log(`${c.name}: cast for its warp cost (exiled at the next end step)`); }
    if (ci.alt === 'blitz') c.blitzed = true;
    if (ci.alt === 'dash') c.dashed = true;
    if (ci.casualty) c.casualtyPaid = true;
    if (ci.replicate) c.replicateN = ci.replicate;
    if (ci.splice && ci.splice.length) spliceApply(c, ci.splice);
    if (ci.squad) { c.squadN = ci.squad; log(`${c.name}: squad cost paid ${ci.squad} time${ci.squad === 1 ? '' : 's'}`); }
    if (ci.offspring) { c.offspringPaid = true; log(`${c.name}: offspring cost paid`); }
    if (ci.alt === 'impending') c.impended = true;
    if (ci.alt === 'overload') c.overloaded = true;
    if (ci.alt === 'bestow') c.bestowed = true;
    if (ci.alt === 'mutate') c.mutating = true;
    if (ci.evoked) { c.evoked = true; log(`${c.name}: cast for its evoke cost`); }
    else if (ci.alt) log(`${c.name}: cast using an alternative cost (${ci.label})`);
    if (ci.kicked && ci.kicked.some(l => /^(?:Kicker|Multikicker)/i.test(l))) { c.kicked = true; log(`${c.name}: kicked`); }
  } finally { snapMuted = false; costHold = false; }
}
function applyCostPicks(src, picks, life) {
  snapMuted = true; costHold = true;
  try { if (life) { state.life -= life; log(`${src.name}: paid ${life} life as a cost`); } applyPicks(src, picks || []); }
  finally { snapMuted = false; costHold = false; }
}

// ---- casting: choose how to pay, then pay
function startCast(c, reopen, modes, md) {
  const extra = md && modes ? modalCost(md, modes) : '';
  const routes = castRoutes(c, extra), opts = additionalCosts(c).optional;
  if (!routes.some(r => r.ok)) {
    const r0 = routes[0];
    toast('Cannot cast this spell', r0.why === 'condition' ? `You cannot use that way of casting it: ${r0.detail}.` : r0.why === 'additional' ? `You cannot pay the additional cost: ${r0.detail}.` : r0.why === 'color' ? 'You do not have the right colours of mana.' : 'Not enough mana (floating mana plus untapped lands).');
    return;
  }
  const go = (route, kicks) => runCast(c, reopen, modes, route, kicks);
  if (routes.length > 1 || opts.length) { openCostChooser(c, routes, opts, go); return; }
  go(routes[0], []);
}
function openCostChooser(c, routes, opts, go) {
  const m = modal(`Cast ${c.name}: how do you pay?`, { width: 640, sticky: true, onCancel: () => { delete c.preAlt; delete c.miracleNow; } });
  const reps = {};
  let sel = routes.findIndex(r => r.ok); const kicks = new Set();
  const list = h('div', { class: 'prelist' }), ec = effectiveCost(c);
  const draw = () => {
    list.replaceChildren(...routes.map((r, i) => {
      const row = h('div', { class: 'row' + (i === sel ? ' sel' : '') + (r.ok ? '' : ' dim') },
        h('span', { class: 'nm' }, r.label, ' ', r.mana ? symbols(r.mana) : ''),
        h('span', { class: 'muted small', text: r.ok ? (r.cond ? `Only if: ${r.cond.replace(/^If /i, '')}` : '') : `Cannot pay: ${r.detail}` }));
      if (r.ok) row.addEventListener('click', () => { sel = i; draw(); });
      return row;
    }));
  };
  m.body.append(h('div', { class: 'psub', text: 'Choose how to pay for this spell.' }), list);
  if (ec.why) m.body.append(h('div', { class: 'costnote' }, 'Total cost is already adjusted: ', ec.why));
  opts.forEach((o, i) => {
    if (o.replicate) { const num = h('input', { type: 'number', min: 0, max: 9, value: 0, style: 'width:54px' }); num.addEventListener('input', () => { reps[i] = Math.max(0, Math.min(9, parseInt(num.value, 10) || 0)); }); m.body.append(h('label', { class: 'teachopt' }, num, h('span', null, h('b', { text: 'Optional: ' + (o.label || 'Replicate') + ' ' }), symbols(o.mana), h('span', { class: 'muted small', text: ' pay it any number of times; copy the spell for each' })))); return; }
    const cb = h('input', { type: 'checkbox' });
    cb.addEventListener('change', () => { if (cb.checked) kicks.add(i); else kicks.delete(i); });
    m.body.append(h('label', { class: 'teachopt' }, cb, h('span', null, h('b', { text: 'Optional: ' + o.label + ' ' }), o.mana ? symbols(o.mana) : '', h('span', { class: 'muted small', text: o.comps.length ? ' ' + o.comps.map(k => k.text || '').join(', ') : '' }))));
  });
  if (teach('costGuidance')) m.body.append(h('div', { class: 'muted small', style: 'margin-top:8px' },
    'Casting order (rule 601.2): you choose modes and targets, then HOW to pay (normal cost, an alternative cost instead of the mana cost, optional extras like kicker), then the game adds cost increases and subtracts reductions to get the total, then you pay it. Alternative costs still get taxes added (Thalia makes Force of Will cost {1} more even when you pitch a card).'));
  m.foot.append(h('button', { text: 'Cancel', onclick: () => m.close() }), h('button', { class: 'primary', text: 'Continue', onclick: () => {
    if (sel < 0 || !routes[sel].ok) return;
    m.close(); go(routes[sel], [...kicks].map(i => opts[i]).concat(...Object.entries(reps).map(([i, n]) => Array(n).fill(opts[+i]))));
  } }));
  draw();
}
function runCast(c, reopen, modes, route, kicks) {
  const id = c.id; let mana = route.mana; const comps = route.comps.slice(), kicked = [];
  for (const k of kicks) { if (k.mana) mana = mergeGeneric(mana + k.mana); comps.push(...k.comps); kicked.push(k.label); }
  const why = compsFeasible(comps.filter(k => k.k !== 'other'), id);
  if (why) { toast('Cannot pay the cost', why); return; }
  if (!manaFeasible(c, mana)) { toast('Cannot cast this spell', 'Not enough mana for that way of paying.'); return; }
  const manual = comps.filter(k => k.k === 'other').map(k => k.text);
  gatherCosts(c, comps, picks => {
    let manaE = mana; if (route.alt && route.alt.reduceBySac) { const sp = picks.find(p => p.comp.emerge); const sc = sp && findCard(sp.ids[0]); const mv = sc && !sc.card.token ? (cardInfo(sc.card.name) || {}).cmc || 0 : 0; manaE = reduceGenericBy(mana, mv); log(`${c.name}: emerge, ${sc ? sc.card.name : 'the sacrificed creature'} has mana value ${mv}, so the cost is reduced by ${mv}`); }
    runReducers(c, manaE, reducerKinds(c), (mana2, rpicks) => {
      const ci = { picks: picks.concat(rpicks), life: comps.filter(x => x.k === 'life').reduce((a, x) => a + x.n, 0), alt: route.alt ? route.alt.kind : null, label: route.label, kicked, casualty: kicks.some(k => k.casualty), replicate: kicks.filter(k => k.replicate && !k.squad).length, squad: kicks.filter(k => k.squad).length, offspring: kicks.some(k => k.offspring), evoked: !!(route.alt && route.alt.kind === 'evoke'), splice: kicks.filter(k => k.splice).map(k => k.splice) };
      const finish = ids => { commitSpellToStack(id, ids, reopen, undefined, modes, ci); if (manual.length) toast('Other costs', `Pay the rest of the cost yourself: ${manual.join(', ')}.`); };
      const full = mergeGeneric(mana2);
      if ((!route.alt && !effectiveCost(c).base) || (symCmc(full) === 0 && !/\{[WUBRGCXSP]/i.test(full))) { finish([]); return; }
      if (teach('stackGuidance')) { openManaPayment(c, finish, full); return; }
      const plan = manaPaymentAllocation(manaCostParts(full), state.manaPool || {}, manaSources(), null);
      if (!plan.ok) { toast('Cannot cast this spell', 'Not enough mana.'); return; }
      state.manaPool = plan.pool;
      finish(plan.used.map(i => manaSources()[i].card.id));
    });
  });
}

// ---- cycling (from hand, any time you have priority): the cost is paid and the card discarded, "draw a card" goes on the stack
function cyclingFor(c) {
  const tx = cardText(c).replace(/\([^)]*\)/g, ''); let m;
  for (const raw of tx.split('\n')) {
    const line = raw.trim();
    if ((m = line.match(/^Cycling\s+((?:\{[^}]+\})+)\s*$/i))) return { label: 'Cycling ' + m[1], comps: [{ k: 'mana', mana: m[1] }] };
    if ((m = line.match(/^Cycling—(.+?)\.?$/i))) return { label: 'Cycling — ' + m[1], comps: parseCostComps(m[1], c.name) };
  }
  return null;
}
// ---- suspend (v0.55, rule 702.62): exile from hand with N time counters; remove one each upkeep; cast it free when the last is gone
function suspendFor(c) {
  const tx = cardText(c).replace(/\([^)]*\)/g, ''); let m;
  for (const raw of tx.split('\n')) if ((m = raw.trim().match(/^Suspend\s+(\d+)\s*[—–-]\s*((?:\{[^}]+\})+)/i))) return { n: +m[1], cost: m[2] };
  return null;
}
function suspendCard(id) {
  const f = findCard(id); if (!f || f.zone !== 'hand') return;
  const su = suspendFor(f.card); if (!su) return; const c = f.card;
  if (!canCastNow(c)) { toast('Cannot suspend now', 'You may suspend a card any time you could begin to cast it: instants and flash cards at any time you have priority, everything else in your main phase with an empty stack.'); return; }
  if (!manaPaymentAllocation(manaCostParts(su.cost), state.manaPool || {}, manaSources(), null).ok) { toast('Cannot suspend', 'Not enough mana for the suspend cost.'); return; }
  const finish = ids => {
    if (!findCard(id)) return;
    snap(); tapManaIds(ids || []);
    snapMuted = true; try { moveCard(id, 'exile'); } finally { snapMuted = false; }
    const g = findCard(id); if (g) g.card.timeCounters = su.n;
    log(`${c.name}: suspended — exiled with ${su.n} time counter${su.n === 1 ? '' : 's'} (suspend cost ${su.cost})`);
    toast(`${c.name} suspended`, `It has ${su.n} time counter${su.n === 1 ? '' : 's'}. At the beginning of each of your upkeeps one is removed; when the last is gone you cast it for free${/Creature/.test(frontType(c) || '') ? ' and it has haste' : ''}.`);
    render();
  };
  if (teach('stackGuidance')) { openManaPayment(c, finish, su.cost, 'Pay and suspend'); return; }
  const plan = manaPaymentAllocation(manaCostParts(su.cost), state.manaPool || {}, manaSources(), null);
  state.manaPool = plan.pool; finish(plan.used.map(i => manaSources()[i].card.id));
}
function suspendUpkeep() {   // upkeep: every suspended card in exile gets its "remove a time counter" trigger (always, even with prompts off: it is game state)
  if (!state) return;
  for (const c of state.exile) if (c.timeCounters > 0) state.pendingTriggers.push({ kind: 'ability', cardId: c.id, cardName: c.name, special: 'suspendTick', optional: false,
    text: `Suspend — At the beginning of your upkeep, if ${c.name} is suspended, remove a time counter from it (${c.timeCounters} now).`, effect: 'Remove a time counter.', why: 'A suspended card in exile loses a time counter at the start of each of your upkeeps.' });
}
function suspendCastFree(id, done, label) {
  const f = findCard(id); if (!f || f.zone !== 'exile') { if (done) done(); return; }
  const c = f.card, md = spellModal(c);
  const fail = why => { log(`${c.name}: could not be cast (${why}); it stays in exile`); toast('Not cast', `${c.name} could not be cast (${why}), so it stays in exile with no time counters (rule 702.62).`); if (done) done(); };
  const go = modes => {
    const ft = frontType(c), castText = md && modes ? modalText(md, modes) : cardText(c);
    const specs = (!ft || /\b(?:Instant|Sorcery)\b/.test(ft)) ? parseTargetSpecs(castText) : [];
    const put = picked => {
      const g = findCard(id); if (!g || g.zone !== 'exile') { if (done) done(); return; }
      snap(); state.exile.splice(g.idx, 1); const cc = g.card; delete cc.timeCounters;
      if (picked) { cc.targets = picked; const gy = picked.find(t => t.kind === 'gy'); if (gy && RETURN_RE.test(cardText(cc).replace(/\n/g, ' '))) cc.target = { id: gy.id, name: gy.name }; else delete cc.target; } else { delete cc.targets; delete cc.target; }
      if (modes && md) { cc.modes = modes; cc.modeTexts = modes.map(i => md.modes[i].text); }
      const inf = cardInfo(cc.name); if (inf && /\{X\}/.test(inf.mc || '')) cc.xValue = 0;
      if (/\bCreature\b/.test(frontType(cc) || '')) cc.suspHaste = true;
      sfx('cast'); noteCast(cc); state.stack.push(cc); state.priority = { active: true, passed: false };
      log(`${label || 'Suspend'}: cast ${cc.name} from exile without paying its mana cost${cc.targets && cc.targets.length ? ' targeting ' + cc.targets.map(t => t.name).join(', ') : ''}`);
      fireTrigger('cast', { card: cc }); render();
      if (done) done();
      if (!state.pendingTriggers.length) openStack();
    };
    if (specs.length) chooseTargets(c.name, specs, put, { srcId: null, onCancel: () => fail('no target was chosen') }); else put(null);
  };
  if (md) openModeChoice(c.name, md, go, '0'); else go(undefined);
}
// ---- v0.94.7 Ninjutsu (CR 702.49): "Ninjutsu {cost} (Return an unblocked attacker you control to hand and pay the cost: put this card onto the battlefield from your hand tapped and attacking.)"
// Activated from your hand once blockers have been declared, while you control an unblocked attacker. The returned creature is a cost; the ability then goes on the stack.
function ninjutsuFor(c) {
  if (!c || c.token) return null;
  for (const raw of cardText(c).replace(/\([^)]*\)/g, '').split('\n')) { const m = raw.trim().match(/^Ninjutsu\s+((?:\{[^}]+\})+)\s*$/i); if (m) return { cost: m[1], label: 'Ninjutsu ' + m[1] }; }
  return null;   // Commander ninjutsu is not handled
}
function unblockedAttackers() {
  const cb = state && state.combat; if (!cb || !cb.declared) return [];
  const blocked = new Set(Object.values(cb.blockers || {}).filter(Boolean).map(Number));
  return (cb.attackers || []).map(a => a.id ?? a).filter(id => !blocked.has(+id)).map(id => (findCard(id) || {}).card).filter(c => c && findCard(c.id).zone === 'battlefield');
}
function ninjutsuWhy(c) {
  if (!state || state.phase !== 'play') return 'Start a game first.';
  if (!['block', 'damage', 'end_combat'].includes(STEPS[state.step].id)) return 'Ninjutsu can be activated after blockers are declared (the declare blockers step, up to the end of combat).';
  if (!unblockedAttackers().length) return 'You need an unblocked attacker you control to return to your hand.';
  if (splitSecondOn()) return 'A spell with split second is on the stack.';
  return '';
}
function activateNinjutsu(id) {
  const f = findCard(id); if (!f || f.zone !== 'hand') return;
  const nj = ninjutsuFor(f.card); if (!nj) return;
  const why = ninjutsuWhy(f.card); if (why) { toast('Cannot use ninjutsu now', why); return; }
  if (!manaPaymentAllocation(manaCostParts(nj.cost), state.manaPool || {}, manaSources(), null).ok) { toast('Cannot use ninjutsu', 'Not enough mana for ' + nj.cost + '.'); return; }
  const cands = unblockedAttackers(), c = f.card;
  pickCardsModal(`${c.name}: ninjutsu`, 'Choose an unblocked attacker you control to return to your hand. This is part of the cost.', cands, 1, ids => {
    const back = findCard(ids[0]); if (!back || back.zone !== 'battlefield') return;
    const finish = used => {
      if (!findCard(id) || !findCard(ids[0])) return;
      snap(); tapManaIds(used || []);
      const rc = findCard(ids[0]).card; log(`${c.name}: ninjutsu (${nj.cost}), returned ${rc.name} to hand`);
      state.combat.attackers = (state.combat.attackers || []).filter(a => (a.id ?? a) !== rc.id);
      moveCard(rc.id, 'hand');
      state.stack.push({ ability: true, special: 'ninjutsu', ninjId: c.id, id: state.nextId++, name: `${c.name} \u2014 ninjutsu`, sourceId: null, sourceName: c.name, cost: nj.label, text: `Put ${c.name} onto the battlefield from your hand tapped and attacking.` });
      state.priority = { active: true, passed: false };
      render(); openStack();
    };
    if (teach('stackGuidance')) { openManaPayment(c, finish, nj.cost, 'Pay and use ninjutsu'); return; }
    const plan = manaPaymentAllocation(manaCostParts(nj.cost), state.manaPool || {}, manaSources(), null);
    state.manaPool = plan.pool; finish(plan.used.map(i => manaSources()[i].card.id));
  });
}
function cycleCard(id) {
  const f = findCard(id); if (!f || f.zone !== 'hand') return;
  const cy = cyclingFor(f.card); if (!cy) return;
  if (!state || state.phase !== 'play' || holdForTriggers() || state.discarding || state.step === 0 || state.step === CLEANUP) { toast('Cannot cycle now', 'You can cycle when you have priority (not during untap or cleanup).'); return; }
  const rest = cy.comps.filter(k => k.k !== 'mana' && k.k !== 'other'), why = compsFeasible(rest, id), mana = manaOf(cy.comps);
  if (why) { toast('Cannot pay the cost', why); return; }
  if (mana && !manaPaymentAllocation(manaCostParts(mana), state.manaPool || {}, manaSources(), null).ok) { toast('Cannot cycle', 'Not enough mana.'); return; }
  const c = f.card;
  gatherCosts(c, rest, picks => {
    const finish = ids => {
      if (!findCard(id)) return;
      snap(); tapManaIds(ids || []);
      applyCostPicks(c, picks, rest.filter(k => k.k === 'life').reduce((a, k) => a + k.n, 0));
      snapMuted = true; costHold = true; discardHow = 'cycle'; try { log(`${c.name}: cycled (${cy.label})`); moveCard(id, 'graveyard'); } finally { snapMuted = false; costHold = false; discardHow = null; }
      state.stack.push({ ability: true, id: state.nextId++, name: `${c.name} — cycling`, sourceId: null, sourceName: c.name, cost: cy.label, text: 'Draw a card.' });
      state.priority = { active: true, passed: false };
      render(); openStack();
    };
    if (!mana) { finish([]); return; }
    if (teach('stackGuidance')) { openManaPayment(c, finish, mana, 'Pay and cycle'); return; }
    const plan = manaPaymentAllocation(manaCostParts(mana), state.manaPool || {}, manaSources(), null);
    state.manaPool = plan.pool; finish(plan.used.map(i => manaSources()[i].card.id));
  });
}

// ---- cost effects on the table that the app cannot see (an opponent's Thalia, a Sphere of Resistance...)
const COST_PRESETS = [
  ['Noncreature spells cost {1} more (Thalia, Vryn Wingmare, Thorn of Amethyst)', 'more', 1, 'noncreature'],
  ['All spells cost {1} more (Sphere of Resistance)', 'more', 1, ''],
  ['Creature spells cost {1} more', 'more', 1, 'creature'],
  ['Nonartifact spells cost {1} more (Lodestone Golem)', 'more', 1, 'nonartifact'],
  ['Your spells cost {1} less (any effect)', 'less', 1, '']
];
function openCostFx() {
  if (!state) { toast('Start a game first', 'These effects belong to the current game.'); return; }
  const m = modal('Cost effects on the table', { width: 640 });
  const list = h('div', { class: 'prelist' });
  const draw = () => {
    state.costMods = state.costMods || [];
    list.replaceChildren(...(state.costMods.length ? state.costMods.map((x, i) => h('div', { class: 'row' }, h('span', { class: 'nm', text: x.label }), h('button', { text: 'Remove', onclick: () => { snap(); state.costMods.splice(i, 1); draw(); render(); } }))) : [h('div', { class: 'muted small', text: 'None active. Your own permanents (Thalia, Goblin Electromancer...) are read from the board automatically; use this for cards the app cannot see, like an opponent’s.' })]));
  };
  m.body.append(h('div', { class: 'psub', text: 'Add an effect that changes what your spells cost. It stays until you remove it.' }),
    ...COST_PRESETS.map(([label, dir, amt, subj]) => h('div', { class: 'row' }, h('span', { class: 'nm', text: label }), h('button', { text: 'Add', onclick: () => { snap(); state.costMods = state.costMods || []; state.costMods.push({ label: label.replace(/ \(.*\)$/, ''), dir, amt, subj }); log(`Cost effect added: ${label}`); draw(); render(); } }))),
    h('div', { class: 'ptitle', style: 'margin-top:10px', text: 'Active' }), list);
  m.foot.append(h('button', { class: 'primary', text: 'Close', onclick: () => m.close() }));
  draw();
}

// ---- paying costs: floating mana is always spent first, lands only cover what is left
function matchPips(pips, srcIdx, sources) {
  const owner = new Map();   // source index -> pip index
  const tryPip = (pi, seen) => {
    for (const si of srcIdx) {
      if (seen.has(si)) continue;
      const ok = pips[pi] === 'C' ? true : sources[si].colors.has(pips[pi]);
      if (!ok) continue;
      seen.add(si);
      if (!owner.has(si) || tryPip(owner.get(si), seen)) { owner.set(si, pi); return true; }
    }
    return false;
  };
  for (let pi = 0; pi < pips.length; pi++) if (!tryPip(pi, new Set())) return null;
  return owner;
}
// chosen = Set of source indexes the player picked, or null to pick lands automatically.
function manaPaymentAllocation(parts, pool, sources, chosen) {
  const p = { W: pool.W || 0, U: pool.U || 0, B: pool.B || 0, R: pool.R || 0, G: pool.G || 0, C: pool.C || 0 };
  const pips = [];
  for (const col of parts.colors) { if (p[col] > 0) p[col]--; else pips.push(col); }
  let generic = parts.generic + (parts.hyb ? 0 : parts.flexible.length);
  const avail = chosen ? [...chosen] : sources.map((_, i) => i);
  // Hybrid / two-brid / Phyrexian symbols (CR 107.4e-f): paid with a matching colour if there is one; else the alternative (2 generic, or 2 life).
  let life = 0; const later = [];
  for (const hs of parts.hyb || []) {
    const pc = hs.opts.find(o => p[o] > 0); if (pc) { p[pc]--; continue; }
    later.push(hs);
  }
  const base = pips.slice(), baseGeneric = generic; let owner = null, nAlt = 0;
  for (nAlt = 0; nAlt <= later.length && !owner; nAlt++) {
    const pp = base.slice(); let g = baseGeneric, l = 0, ok = true;
    later.forEach((hs, i) => {
      const asAlt = i >= later.length - nAlt;   // convert from the end first
      if (!asAlt) { const o = hs.opts.find(x => x === 'C' || avail.some(si => sources[si].colors.has(x))); if (o) { pp.push(o); return; } }
      if (hs.two) g += 2; else if (hs.phy) l += 2; else ok = false;
    });
    if (!ok) continue;
    if (l && l > (state ? state.life : 0)) continue;   // CR 119.4: you can pay life only if your life total is at least that much
    const ow = matchPips(pp, avail, sources); if (ow) { owner = ow; generic = g; life = l; pips.length = 0; pp.forEach(x => pips.push(x)); }
  }
  for (const k of Object.keys(p)) { const use = Math.min(generic, p[k]); p[k] -= use; generic -= use; }
  const poolUsed = Object.keys(pool).reduce((a, k) => a + (pool[k] || 0) - p[k], 0);
  if (life) Object.defineProperty(p, '_life', { value: life, enumerable: false, writable: true, configurable: true });   // paid by whoever spends this pool: see settlePhyrexianLife
  if (!owner) return { ok: false, pool: p, used: [], poolUsed, needLands: pips.length + generic, life: 0 };
  const used = [...owner.keys()];
  const spare = avail.filter(i => !used.includes(i)).sort((a, b) => sources[a].colors.size - sources[b].colors.size);
  for (const i of spare) { if (generic <= 0) break; used.push(i); generic--; }
  return { ok: generic <= 0, life, pool: p, used, poolUsed, needLands: pips.length + parts.generic + parts.flexible.length - (parts.generic + parts.flexible.length - Math.max(0, generic)) };
}
function openManaPayment(c, done, costOverride, verb, skipId) {
  const ec = effectiveCost(c), mc = costOverride !== undefined ? costOverride : ec.cost;
  const parts = manaCostParts(mc), sources = withCtx(c, manaSources).filter(x => x.card.id !== skipId);   // a {T} ability cannot also tap its own source for mana
  const pool = state && state.manaPool ? state.manaPool : { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  if (!sources.length && manaTotal() === 0 && mc && symCmc(mc) > 0) { toast('No mana available', 'You cannot pay this spell’s cost.'); return; }
  const m = modal(`Pay ${c.name}`, { width: 620, sticky: true });
  const auto = manaPaymentAllocation(parts, pool, sources, null);
  let chosen = new Set(auto.ok ? auto.used : []);
  const status = h('div', { class: 'small muted' });
  const poolEl = h('div', { class: 'mana-payment-pool' });
  const rows = h('div', { class: 'prelist' });
  const pay = h('button', { class: 'primary', text: verb || 'Pay and cast', disabled: true });
  const refresh = () => {
    const result = manaPaymentAllocation(parts, pool, sources, chosen);
    const poolText = manaTotal() ? Object.entries(pool).filter(([, n]) => n).map(([k, n]) => `${n}${k}`).join(' · ') : 'empty';
    poolEl.replaceChildren(h('span', { class: 'mana-payment-label', text: 'Floating' }), h('span', { class: 'mana-payment-value', text: poolText }),
      h('span', { class: 'muted small', text: result.poolUsed ? ` · ${result.poolUsed} will be spent from the pool first` : ' · spent automatically first' }));
    const lands = result.ok ? result.used.length : chosen.size;
    status.replaceChildren(h('b', { text: result.ok ? (lands ? `Cost covered: ${result.poolUsed} floating + ${lands} land${lands === 1 ? '' : 's'}` : 'Cost covered by floating mana, no lands need tapping') : 'Choose lands for the rest of the cost' }));
    for (let i = 0; i < sources.length; i++) rows.children[i].classList.toggle('sel', chosen.has(i));
    pay.disabled = !result.ok;
  };
  sources.forEach((src, i) => {
    const label = [...src.colors].join('') || 'C';
    const row = h('div', { class: 'row' }, h('span', { class: 'nm' }, src.card.name + (src.of > 1 ? ` (mana ${src.slot + 1} of ${src.of})` : '')), h('span', { class: 'muted small', text: label }));
    row.addEventListener('click', () => { if (chosen.has(i)) chosen.delete(i); else chosen.add(i); refresh(); });
    rows.append(row);
  });
  pay.addEventListener('click', () => {
    const result = manaPaymentAllocation(parts, pool, sources, chosen);
    if (!result.ok) return;
    m.close();
    state.manaPool = result.pool;
    done(result.used.map(i => sources[i].card.id));
  });
  const costLine = h('div', { class: 'psub' }, 'Cost: ', mc ? symbols(mc) : 'no mana',
    ec.reduced && mc === ec.cost ? h('span', { class: 'muted small' }, ' (printed ', symbols(ec.base), `, ${ec.increased ? 'increased' : 'reduced'} by ${ec.reduced}: ${ec.why})`) : ec.why && mc !== ec.cost ? h('span', { class: 'muted small' }, ` (${ec.why} applied)`) : '');
  m.body.append(costLine, poolEl, status, rows,
    h('div', { class: 'muted small', style: 'margin-top:8px' }, 'Floating mana is spent first; lands are pre-selected only for what the pool cannot cover. Click lands to change the selection.'));
  m.foot.append(h('button', { text: 'Cancel', onclick: () => m.close() }), pay);
  refresh();
}
function settlePhyrexianLife() {   // CR 107.4f: a Phyrexian symbol paid with life: 2 life per symbol, taken when the cost is paid
  const pl = state && state.manaPool && state.manaPool._life; if (!pl) return;
  state.manaPool._life = 0; state.life -= pl; log(`Phyrexian mana: paid ${pl} life instead of coloured mana → ${state.life}`);
}
function tapManaIds(manaIds){
  settlePhyrexianLife();
  const used=new Map(); for(const mid of manaIds) used.set(mid,(used.get(mid)||0)+1);
  for(const [mid,n] of used){const mf=findCard(mid);if(mf&&mf.zone==='battlefield'){mf.card.tapped=true; mf.card.mt={cols:[],spent:true,life:0}; fireTrigger('tapmana',{card:mf.card});
    if(isLandName(mf.card.name)){ const lm=landMulti(mf.card); if(lm){ applyLandCost(mf.card,{dmg:lm.dmg,life:lm.life}); if(n<lm.fixed.length){ if(lm.only) log(`${mf.card.name}: ${lm.fixed.length-n} unused restricted mana is lost`); else { lm.fixed.slice(n).forEach(col=>addFloatingMana(col)); log(`${mf.card.name}: ${lm.fixed.length-n} unused mana floats`); } } } else applyLandCost(mf.card,landTapCost(mf.card)); }
    const r=!isLandName(mf.card.name)&&rockInfo(mf.card);   // a multi-mana rock taps once: unused mana floats
    if(r&&r.fixed&&n<r.fixed.length){ r.fixed.slice(n).forEach(col=>addFloatingMana(col)); log(`${mf.card.name}: ${r.fixed.length-n} unused mana floats`); }}}
}
function commitSpellToStack(id,manaIds=[],reopen=true,x,modes,ci){
  const f=findCard(id); if(!f||f.zone!=='hand'||isLandName(f.card.name))return;
  const fromC=centerOf(`#row-hand .card[data-id="${id}"]`); noteFlightFrom(id,`#row-hand .card[data-id="${id}"]`);
  snap(); const [c]=state.hand.splice(f.idx,1); sfx('cast'); spotlight(c,'cast',fromC);
  state.halfChosen=null; delete c.preAlt; delete c.miracleNow; let gyLeft=false; const castFrom0=c.fromGy?'graveyard':c.fromExile?'exile':'hand'; if(c.fromGy){ if(c.fromGy.kind==='warp') c.warped=true; else if(c.fromGy.kind!=='escape'&&c.fromGy.kind!=='static') c.gyExile=true; log(`${c.faceOf||c.name}: cast from the graveyard (${c.fromGy.kind})`); delete c.fromGy; gyLeft=true; }
  if(c.fromExile){ delete c.fromExile; delete c.mayPlayTurn; delete c.warpExile; delete c.plotted; delete c.foretold; const wasAdv=c.onAdv; delete c.onAdv; log(`${c.name}: cast from exile${wasAdv?' (it was on an adventure)':''}`); }
  c.castFrom=castFrom0;   // v0.86: "if this spell wasn't cast from your hand"
  if(x!==undefined){ c.xValue=x; log(`${c.name}: X = ${x}`); }
  if(modes){ const md=spellModal(c); if(md){ c.modes=modes; c.modeTexts=modes.map(i=>md.modes[i].text); log(`${c.name}: chosen ${md.spree?'extras':'modes'}: ${c.modeTexts.join(' | ')}`); } }
  withCtx(c,()=>tapManaIds(manaIds));
  if(ci) applyCostInfo(c,ci);
  noteCast(c); state.stack.push(c); state.priority={active:true,passed:false}; if(gyLeft) fireTrigger('gyleave',{card:c,to:'stack'});
  log(`Cast ${c.name}${c.targets&&c.targets.length?' targeting '+c.targets.map(t=>t.name).join(', '):''} — put it on the stack`); fireTrigger('cast',{card:c}); stormOnCast(c); casualtyOnCast(c); replicateOnCast(c); render();
  if(state.pendingTriggers.length) resolvePendingTrigger(); else if(reopen)openStack();
}
// ---- v0.91.0 copies of spells and Storm (rules 707.10, 702.40)
// A copy of an instant or sorcery spell is put on the stack (it is not cast, so it does not count for Storm), resolves like the original and then
// ceases to exist: it never reaches the graveyard.
function makeSpellCopies(spellId, n, srcName) {
  const i = state.stack.findIndex(x => x.id === spellId); if (i < 0) { log(`${srcName || 'Copy'}: the spell is no longer on the stack, so nothing is copied`); return 0; }
  const orig = state.stack[i]; if (orig.ability || orig.opp || isPermanentCard(orig)) { log(`${srcName || 'Copy'}: only instant and sorcery spells are copied here`); return 0; }
  for (let k = 0; k < n; k++) {
    const cp = JSON.parse(JSON.stringify(orig)); cp.id = state.nextId++; cp.copy = true; delete cp.gyExile; cp.castFrom = orig.castFrom;
    state.stack.push(cp);
  }
  state.priority = { active: true, passed: false };
  const copies = state.stack.filter(x => x.copy && x.id > orig.id).slice(-n);
  log(`${srcName || 'Copy'}: ${n} cop${n === 1 ? 'y' : 'ies'} of ${orig.name} put on the stack.`);
  // v0.91.3 rule 707.10c: you may choose new targets for each copy. Ask one copy at a time; closing the window keeps the original's targets.
  const specs = (orig.targets && orig.targets.length) ? parseTargetSpecs(String(cardText(orig) || '')) : [];
  if (specs.length && copies.length) {
    const ask = k => {
      if (k >= copies.length) { render(); return; }
      const cp = copies[k];
      chooseTargets(`${orig.name} (copy ${k + 1} of ${copies.length}): new target`, specs, picked => {
        cp.targets = picked; delete cp.target; if (picked[0] && picked[0].kind === 'player') cp.target = picked[0].id;
        log(`${orig.name} (copy ${k + 1}): now targets ${picked.map(t => t.name).join(', ')}`); ask(k + 1);
      }, { srcId: orig.id, onCancel: () => { log(`${orig.name} (copy ${k + 1}): keeps the original's targets`); ask(k + 1); } });
    };
    setTimeout(() => ask(0), 0);
  }
  return n;
}
function stormOnCast(c) {
  const tx = String(cardText(c) || '');
  if (c.copy || !tx.split('\n').some(l => /^storm\b/i.test(l.trim().replace(/\([^)]*\)/g, '')))) return;
  const n = Math.max(0, spellsCastNow() - 1);
  state.stack.push({ ability: true, trigger: true, special: 'storm', id: state.nextId++, name: `${c.name} \u2014 storm`, sourceId: c.id, sourceName: c.name, spellId: c.id, n, text: `Storm \u2014 copy ${c.name} for each spell cast before it this turn (${n}).` });
  log(`${c.name}: storm triggers (${n} spell${n === 1 ? '' : 's'} cast before it this turn)`);
}
function passPriority(){
  if(!state||!state.stack.length)return;
  state.priority.passed=true;
  log('Passed priority');
  resolveTopOfStack();
}

// ---- X spells: X is chosen as the spell is cast; every {X} in the cost is paid with X generic mana.
function costWithX(cost, x) {
  const n = (cost.match(/\{X\}/g) || []).length;
  const rest = cost.replace(/\{X\}/g, '');
  return n && x ? rest + `{${n * x}}` : rest;
}
// Largest X you can pay right now (-1 when even X = 0 cannot be paid).
function maxXFor(c) { return withCtx(c, () => maxXFor0(c)); }
function maxXFor0(c) {
  const ec = effectiveCost(c); let best = -1;
  const pool = (state && state.manaPool) || {};
  for (let x = 0; x <= 40; x++) {
    if (manaPaymentAllocation(manaCostParts(costWithX(ec.cost, x)), pool, manaSources(), null).ok) best = x; else break;
  }
  return best;
}
function castXSpell(c, reopen, modes) {
  const id = c.id, ec = effectiveCost(c), max = maxXFor(c);
  if (max < 0) { toast('Cannot cast this spell', 'You cannot pay even the fixed part of the cost (X = 0).'); return; }
  const count = (ec.cost.match(/\{X\}/g) || []).length;
  const m = modal(`${c.name}: choose X`, { width: 480, sticky: true, onCancel: () => {} });
  const inp = h('input', { type: 'number', min: 0, max, value: max, style: 'width:80px;font-size:18px' });
  const total = h('div', { class: 'psub' });
  const upd = () => { const x = Math.max(0, Math.min(max, parseInt(inp.value, 10) || 0)); total.replaceChildren('Total cost with X = ', h('b', { text: String(x) }), ': ', symbols(costWithX(ec.cost, x)) || 'no mana'); };
  inp.addEventListener('input', upd); upd();
  m.body.append(
    h('div', { class: 'psub', text: `X is chosen as you cast the spell.${count > 1 ? ` This card has ${count} {X} symbols, so each point of X costs ${count} mana.` : ''} With your current mana, X can be at most ${max}.` }),
    h('div', { class: 'row' }, h('span', { class: 'nm', text: 'Value of X' }), inp),
    total,
    teach('rulesHints') ? h('div', { class: 'muted small', text: 'On the stack X is the number you choose. Once the permanent is on the battlefield, X is 0 for its abilities, except enter-the-battlefield effects, which remember the X you chose.' }) : null);
  m.foot.append(h('button', { text: 'Cancel', onclick: () => m.close() }), h('button', { class: 'primary', text: 'Cast', onclick: () => {
    const x = Math.max(0, Math.min(max, parseInt(inp.value, 10) || 0));
    m.close();
    const cost = costWithX(ec.cost, x);
    if (symCmc(cost) === 0 && !/\{[WUBRGCSP]/i.test(cost)) { commitSpellToStack(id, [], reopen, x); return; }
    if (teach('stackGuidance')) { openManaPayment(c, ids => commitSpellToStack(id, ids, reopen, x, modes), cost); return; }
    const plan = manaPaymentAllocation(manaCostParts(cost), state.manaPool || {}, manaSources(), null);
    if (!plan.ok) { toast('Cannot cast this spell', 'Not enough mana.'); return; }
    state.manaPool = plan.pool;
    commitSpellToStack(id, plan.used.map(i => manaSources()[i].card.id), reopen, x);
  } }));
}
function castSpell(id,reopen=true,modes) {
  const f0=findCard(id); return withCtx(f0&&f0.card,()=>castSpell0(id,reopen,modes));
}
function castSpell0(id,reopen=true,modes) {
  const f=findCard(id); if(!f||f.zone!=='hand'||isLandName(f.card.name)) return;
  { const ho=halfOptions(f.card);
    if(ho.length && state.halfChosen!==id){
      const go=o=>{ const g=findCard(id); if(!g||g.zone!=='hand') return; state.halfChosen=id; if(o.fi!==null) castAsHalf(g.card,o.fi); castSpell(id,reopen,modes); };
      if(ho.length===1) go(ho[0]); else if(canCastNow(f.card)||ho.some(o=>withHalf(f.card,o.fi,()=>canCastNow(f.card)))) openHalfChooser(f.card,ho,go);
      else toast(state.stack.length ? 'Stack is active' : 'Wrong phase', state.stack.length ? 'Only instants and cards with flash can be cast while the stack is active.' : 'This card can only be cast during your main phase, unless it has flash.');
      return; } }
  if(!canCastNow(f.card)) {
    toast(state.stack.length ? 'Stack is active' : 'Wrong phase',
      state.stack.length ? 'Only instants and cards with flash can be cast while the stack is active.' :
      'This card can only be cast during your main phase, unless it has flash.');
    return;
  }
  { const pa=preAltKinds(f.card); if(pa.length && f.card.preAlt===undefined){ openPreAlt(f.card,pa,()=>castSpell(id,reopen,modes)); return; } }
  const md=spellModal(f.card);
  if(md && modes===undefined){ openModeChoice(f.card.name, md, idxs=>castSpell(id,reopen,idxs), effectiveCost(f.card).cost); return; }
  { const ft=frontType(f.card), castText=md&&modes?modalText(md,modes):cardText(f.card);
    const castText2=f.card.preAlt==='overload'?overloadText(castText):castText;
    const specs=f.card.preAlt==='bestow'?parseTargetSpecs('Bestow: attach to target creature.'):f.card.preAlt==='mutate'?parseTargetSpecs('Mutate: merge with target nonhuman creature you control.'):(!ft||/\b(?:Instant|Sorcery)\b/.test(ft))?parseTargetSpecs(castText2):[];
    if(specs.length){
      if(targetChosenFor!==id){
        chooseTargets(f.card.name,specs,picked=>{ const g=findCard(id); if(!g||g.zone!=='hand') return;
          g.card.targets=picked; const gy=picked.find(t=>t.kind==='gy');
          if(gy&&RETURN_RE.test(cardText(g.card).replace(/\n/g,' '))) g.card.target={id:gy.id,name:gy.name}; else delete g.card.target;
          targetChosenFor=id; castSpell(id,reopen,modes); },{srcId:null});
        return; }
      targetChosenFor=null;
    } else { delete f.card.targets; delete f.card.target; } }
  if(/\{X\}/.test(effectiveCost(f.card).base)){ castXSpell(f.card,reopen,modes); return; }
  startCast(f.card,reopen,modes,md);
}
