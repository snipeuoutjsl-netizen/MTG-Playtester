// ---------------------------------------------------------------- tokens (v0.61): token definitions read from card text
const TOKEN_PRE = {
  'treasure': { types: ['Artifact'], tx: '{T}, Sacrifice this artifact: Add one mana of any color.' },
  'food': { types: ['Artifact'], tx: '{2}, {T}, Sacrifice this artifact: You gain 3 life.' },
  'clue': { types: ['Artifact'], tx: '{2}, Sacrifice this artifact: Draw a card.' },
  'blood': { types: ['Artifact'], tx: '{1}, {T}, Discard a card, Sacrifice this artifact: Draw a card.' },
  'powerstone': { types: ['Artifact'], tx: "{T}: Add {C}. This mana can't be spent to cast a nonartifact spell." },
  'gold': { types: ['Artifact'], tx: 'Sacrifice this artifact: Add one mana of any color.' },
  'map': { types: ['Artifact'], tx: '{1}, {T}, Sacrifice this artifact: Target creature you control explores. Activate only as a sorcery.' },
  'junk': { types: ['Artifact'], tx: '{T}, Sacrifice this artifact: Exile the top card of your library. You may play that card this turn. Activate only as a sorcery.' },
  'shard': { types: ['Artifact'], tx: '{2}, {T}, Sacrifice this artifact: Scry 1, then draw a card.' },
  'lander': { types: ['Artifact'], tx: '{2}, {T}, Sacrifice this artifact: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.' },
  'incubator': { types: ['Artifact'], tx: '{2}: Transform this artifact.' },
  'eldrazi spawn': { pt: '0/1', types: ['Creature'], tx: 'Sacrifice this creature: Add {C}.' },
  'eldrazi scion': { pt: '1/1', types: ['Creature'], tx: 'Sacrifice this creature: Add {C}.' }
};
const TOKEN_NUMW = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const TOKEN_COL = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
// Quoted rules text ("When this token leaves the battlefield, it deals 2 damage to any target.") is an ability of the thing being created or granted, NOT of the card that says it.
// The card's own readers must not see inside the quotes; the token reader gets them back. (CR 111.4 / 113.3: an ability belongs to the object that has it.)
const QUOTE_STORE = [];
const normQuotes = s => String(s || '').replace(/[\u201c\u201d]/g, '"');
// Only a quote that follows "...token... with/and" is the created token's ability. Emblems and "gains/has "..."" grants keep their quotes for their own readers.
const quoteIsTokens = (s, off) => { const seg = s.slice(Math.max(s.lastIndexOf('. ', off) + 1, 0), off); return /\btokens?\b/i.test(seg) && !/\bemblem\b/i.test(seg) && !/\b(?:gains?|has|have|loses?)\b/i.test(seg.slice(seg.search(/\btokens?\b/i))); };
function maskQuotes(tx) { const s = normQuotes(tx); return s.replace(/"([^"]*)"/g, (m, inner, off) => { if (/^\u0001Q\d+\u0001$/.test(inner) || !quoteIsTokens(s, off)) return m; QUOTE_STORE.push(inner); return '"\u0001Q' + (QUOTE_STORE.length - 1) + '\u0001"'; }); }
const hasRawQuote = s => { const n = normQuotes(s); let hit = false; n.replace(/"([^"]*)"/g, (m, inner, off) => { if (!/^\u0001Q\d+\u0001$/.test(inner) && quoteIsTokens(n, off)) hit = true; return m; }); return hit; };
function unmaskQuotes(s) { return String(s == null ? '' : s).replace(/\u0001Q(\d+)\u0001/g, (m, i) => QUOTE_STORE[+i] != null ? QUOTE_STORE[+i] : ''); }
function tokenDefsFromText(text, srcName) {
  const t = unmaskQuotes(normQuotes(text)).replace(/\([^)]*\)/g, ' ').replace(/\n/g, ' ').replace(/\u2019/g, "'");
  const out = [], re = /\bcreates?\s+([^"]*?)\btokens?\b((?:"[^"]*"|[^."])*)/gi; let m;
  const mk = d => { d.from = srcName || ''; d.key = [d.name, d.pt || '', (d.col || []).join(''), d.tx || ''].join('|'); out.push(d); };
  while ((m = re.exec(t))) {
    let head = m[1].trim(), tail = m[2] || '';
    let tokNamed = ''; { const nm0 = tail.match(/^\s+named ([A-Z][^"]*?)(?=\s+with\b|\s*,|\s*$)/); if (nm0) { tokNamed = nm0[1].trim(); tail = tail.slice(nm0[0].length); } }   // "a colorless artifact token named Munitions with ..."
    if (/\b(?:cop(?:y|ies)|that's a)\b/i.test(head + ' ' + tail.slice(0, 30)) || (!tokNamed && /\bnamed\b/i.test(tail.slice(0, 30))) || !head) continue;
    if (/^(?:one or more|that many|twice that many|those|an additional|a number of)\b/i.test(head) || /\bof those\b/i.test(head + ' ' + tail.slice(0, 30))) continue;   // v0.95.1 replacement-effect wording (Doubling Season), not a token to make
    let named = '', lg = /\blegendary\b/i.test(head), nmM = head.match(/^([A-Z][^,]*),\s+(?:an?\s+)?(.*)$/);
    if (nmM) { named = nmM[1].trim(); head = nmM[2]; }
    let count = 1, cm = named ? null : head.match(/^(an?|one|two|three|four|five|six|seven|eight|nine|ten|\d+|x|that many|a number of)\s+/i);
    if (cm) { const w = cm[1].toLowerCase(); count = /^\d+$/.test(w) ? +w : w === 'x' ? 'X' : (TOKEN_NUMW[w] || 'X'); head = head.slice(cm[0].length); }
    let tapped = false; if (/^tapped\s+/i.test(head)) { tapped = true; head = head.replace(/^tapped\s+/i, ''); }
    head = head.replace(/^legendary\s+/i, '');
    let pt = '', pm = head.match(/^(\d+|X|\*)\/(\d+|X|\*)\s+/i); if (pm) { pt = pm[1] + '/' + pm[2]; head = head.slice(pm[0].length); }
    const col = [], types = []; let words = head.split(/\s+/).filter(Boolean), nameW = [];
    for (const w of words) { const lw = w.toLowerCase().replace(/,$/, '');
      if (TOKEN_COL[lw]) col.push(TOKEN_COL[lw]); else if (lw === 'colorless' || lw === 'and' || lw === 'legendary') continue;
      else if (/^(creature|artifact|enchantment|land)$/.test(lw)) types.push(lw[0].toUpperCase() + lw.slice(1)); else nameW.push(w); }
    const name = tokNamed || named || nameW.join(' ').trim(); if (!name) continue;
    const pre = TOKEN_PRE[name.toLowerCase()] || {};
    if (!pt && pre.pt) pt = pre.pt;
    const off = officialToken(name, pt, col, '');
    const ty = types.length ? types : pre.types ? pre.types : pt ? ['Creature'] : ['Artifact'];
    if (pt && !ty.includes('Creature')) ty.unshift('Creature');
    const lines = [], tm = tail.match(/^\s*,?\s*(?:tapped(?: and attacking)?,?\s*)?with\s+(.*)$/i);
    if (tm) { const rest = tm[1], q0 = rest.indexOf('"'); let kwPart = q0 >= 0 ? rest.slice(0, q0) : rest;
      if (q0 >= 0) { const qm = rest.slice(q0).match(/^(?:"[^"]*")(?:\s*(?:,|and)?\s*"[^"]*")*/); if (qm) for (const q of qm[0].matchAll(/"([^"]*)"/g)) lines.push(q[1].replace(/~/g, 'this token')); }   // inside quotes "~" was this token itself
      const kw = kwPart.split(/,|\band\b/).map(x => x.trim()).filter(x => x && !/counter|\bon it\b/i.test(x));
      for (const k of kw.reverse()) lines.unshift(k[0].toUpperCase() + k.slice(1)); }
    let tx = lines.join('\n'); if (!tx && pre.tx) tx = pre.tx;
    const subW = tokNamed ? [] : named ? nameW : name.split(/\s+/);
    const d = { name, pt, col, types: ty, subs: subW.map(x => x.toLowerCase()), tx, count, tapped, legendary: lg, type: `Token ${lg ? 'Legendary ' : ''}${ty.join(' ')}${subW.join(' ') || !tokNamed ? ' — ' + (subW.join(' ') || name) : ''}` };
    if (off) {   // v0.95.0 the official token card is the truth for its type line and rules text; what the card text said is the fallback
      d.type = off.t.replace(/^(?!Token)/, 'Token ');
      d.official = true; if (off.tx && off.tx.replace(/\([^)]*\)/g, '').trim()) d.tx = off.tx.replace(/\([^)]*\)/g, '').replace(/\n{2,}/g, '\n').trim();
      const tys = ['Creature', 'Artifact', 'Enchantment', 'Land'].filter(w => new RegExp('\\b' + w + '\\b').test(off.t.split('\u2014')[0])); if (tys.length) d.types = tys;
      if (/\bLegendary\b/.test(off.t)) d.legendary = true;
    }
    mk(d);
  }
  let am = t.match(/\bamass ([A-Z][a-z]+)/); if (am) { const ty = singularWord(am[1]), tn = ty[0].toUpperCase() + ty.slice(1); mk({ name: `${tn} Army`, pt: '0/0', col: ['B'], types: ['Creature'], subs: [ty, 'army'], tx: '', count: 1, type: `Token Creature — ${tn} Army`, amassOnly: true }); }
  if (/\binvestigate\b/i.test(t)) mk({ name: 'Clue', pt: '', col: [], types: ['Artifact'], subs: ['clue'], tx: TOKEN_PRE.clue.tx, count: 1, type: 'Token Artifact — Clue' });
  if (/\bafterlife (\d+)/i.test(t)) mk({ name: 'Spirit', pt: '1/1', col: ['W', 'B'], types: ['Creature'], subs: ['spirit'], tx: 'Flying', count: +t.match(/\bafterlife (\d+)/i)[1], type: 'Token Creature — Spirit' });
  return out;
}
let tokenCache = { key: '', defs: [] };
function deckTokenDefs() {
  if (!state) return [];
  const names = new Set();
  for (const z of [state.hand, state.library, state.battlefield, state.graveyard, state.exile, state.sideboard || [], state.stack]) for (const c of z || []) if (c && !c.token && c.name) names.add(c.name);
  const key = [...names].sort().join('|') + '#' + cardCount;
  if (tokenCache.key === key) return tokenCache.defs;
  const map = new Map();
  for (const n of names) { const i = cardInfo(n); if (!i || !i.tx) continue; for (const d of tokenDefsFromText(i.tx.replace(new RegExp(i.name.split(' // ')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '~'), i.name.split(' // ')[0])) { const ex = map.get(d.key); if (ex) { if (!ex.froms.includes(d.from)) ex.froms.push(d.from); } else { d.froms = [d.from]; d.count = d.count; map.set(d.key, d); } } }
  tokenCache = { key, defs: [...map.values()] }; return tokenCache.defs;
}
function makeTokensFromDef(d, n, src) {
  if (!state) return; snap();
  n = adjustTokenCount(n, d, src);   // CR 614: Doubling Season and friends, read from the rules text (53)
  for (let i = 0; i < n; i++) {
    const c = newCard(d.name, { token: true, tk: { pt: d.pt, subs: [...d.subs], col: [...d.col], tx: d.tx, types: [...d.types], type: d.type, legendary: !!d.legendary } });
    c.id = state.nextId++;
    if (d.startPlus) c.counters = { plus: d.startPlus, minus: 0 };   // Incubate N: the token enters with N +1/+1 counters
    if (d.amassOnly) c.counters = { plus: 1, minus: 0 };   // a hand-made Army starts as if amassed once
    enterBattlefield(c, { from: 'effect', tapped: !!d.tapped, logMsg: `${src ? src + ': created' : 'Created'} token ${d.name}${d.pt ? ' ' + d.pt : ''}` });
  }
  render(); flushTriggers();
}
// Token ability audit (v0.97.7): classify every rules-text line of a token and say whether the app can run it.
function tokenAbilityAudit(d) {
  const out = [];
  try {
    const tc = newCard(d.name, { token: true, tk: { pt: d.pt, subs: [...d.subs], col: [...d.col], tx: d.tx || '', types: [...d.types], type: d.type } });
    const acts = (typeof activatedAbilitiesFor === 'function' ? activatedAbilitiesFor(tc) : []) || [];
    const trigs = (typeof parseTriggers === 'function' ? parseTriggers(tc) : []) || [];
    const rock = typeof rockInfo === 'function' ? rockInfo(tc) : null;
    for (const raw of String(d.tx || '').split('\n').map(x => x.trim()).filter(Boolean)) {
      const line = raw.replace(/\s*\(.*?\)\s*/g, ' ').trim();
      let kind, st;
      if (!line) continue;
      if (/^(When|Whenever|At)\b/i.test(line)) { kind = 'triggered'; st = trigs.length ? 'ok' : 'no'; }
      else if (/^\{T\}: Add /i.test(line) && rock) { kind = 'mana'; st = 'ok'; }
      else if (/^[^:]{1,80}:\s/.test(line)) { kind = 'activated'; const cost = line.split(':')[0].toLowerCase(); st = acts.some(a => String(a.cost || '').toLowerCase().replace(/\s+/g, '') === cost.replace(/\s+/g, '')) || acts.length ? 'ok' : 'no'; }
      else if (/^(flying|first strike|double strike|deathtouch|lifelink|vigilance|trample|haste|reach|menace|defender|indestructible|hexproof|flash|ward|prowess|infect|wither)\b/i.test(line)) { kind = 'keyword'; st = 'ok'; }
      else { kind = 'static'; st = 'part'; }
      out.push({ line: raw, kind, st });
    }
  } catch (e) { /* audit is advisory only */ }
  return out;
}
function openTokenTray() {
  if (!state) return;
  const defs = deckTokenDefs();
  const m = modal('Tokens your deck can make', { width: 620 });
  m.body.append(h('div', { class: 'psub', text: 'Found by reading the rules text of every card in your deck. Pick a token to put it onto the battlefield (for example if a card’s effect did not offer it, or your opponent made you create one).' }));
  if (!defs.length) m.body.append(h('div', { class: 'muted small', text: 'No cards in this deck create tokens (or card data is not loaded yet).' }));
  for (const d of defs) {
    const q = h('input', { type: 'number', min: 1, max: 99, value: typeof d.count === 'number' && d.count > 0 ? d.count : 1, style: 'width:58px' });
    m.body.append(h('div', { class: 'row tokrow' },
      h('span', { class: 'tokpt', text: d.pt || '—' }),
      h('span', { class: 'nm' }, h('b', { text: d.name }), h('span', { class: 'muted small', text: ` ${d.type.replace('Token ', '')}${d.col.length ? ' · ' + d.col.join('') : ' · colorless'}` }), h('div', { class: 'muted small', text: [d.tx.replace(/\n/g, '; '), 'from ' + d.froms.join(', ')].filter(Boolean).join(' — ') })),
      q, h('button', { class: 'primary', text: 'Create', onclick: () => makeTokensFromDef(d, Math.max(1, parseInt(q.value, 10) || 1), '') })));
    m.body.append(h('div', { class: 'tokabs' }, ...tokenAbilityAudit(d).map(a => h('div', { class: 'muted small tokab', title: a.st === 'ok' ? 'Implemented' : a.st === 'part' ? 'Read as a static/other effect; check it applies' : 'Not implemented yet', text: (a.st === 'ok' ? '\u2713 ' : a.st === 'part' ? '\u25d0 ' : '\u2717 ') + a.kind + ': ' + a.line }))));
  }
  const nm = h('input', { type: 'text', placeholder: 'Other token name', style: 'flex:1;min-width:0' }), pt = h('input', { type: 'text', placeholder: 'P/T (blank = noncreature)', style: 'width:120px' });
  m.body.append(h('div', { class: 'fhead', text: 'Other token' }), h('div', { class: 'row' }, nm, pt, h('button', { text: 'Create', onclick: () => { const n = nm.value.trim(); if (n) makeToken(n, pt.value.trim()); } })));
  m.foot.append(h('button', { text: 'Token glossary & art', onclick: () => { m.close(); openTokenGlossary(); } }), h('button', { class: 'primary', text: 'Close', onclick: () => m.close() }));
}
// Amass (rule 701.47): put N +1/+1 counters on an Army you control; with none, first create a 0/0 black Army token. The Army becomes an <Type> in addition.
function doAmass(type, n, src) {
  if (!state) return;
  const ty = singularWord(type), tyName = ty[0].toUpperCase() + ty.slice(1);
  const armies = state.battlefield.filter(c => permTypeInfo(c).subs.has('army'));
  const apply = army => {
    snap();
    if (!army) {
      const c = newCard(`${tyName} Army`, { token: true, tk: { pt: '0/0', subs: [ty, 'army'], col: ['B'], types: ['Creature'], type: `Token Creature — ${tyName} Army` } });
      c.id = state.nextId++; c.counters = { plus: n, minus: 0 };
      enterBattlefield(c, { from: 'effect', tapped: false, logMsg: `${src}: amass ${type} ${n} — you controlled no Army, so you create a 0/0 black ${tyName} Army token, then put ${n} +1/+1 counter${n === 1 ? '' : 's'} on it` });
    } else {
      if (typeof army.counters === 'number') army.counters = { plus: army.counters, minus: 0 };
      army.counters = army.counters || { plus: 0, minus: 0 };
      army.counters.plus = (army.counters.plus || 0) + n;
      if (!permTypeInfo(army).subs.has(ty)) army.addSubs = [...(army.addSubs || []), ty];
      log(`${src}: amass ${type} ${n} — ${n} +1/+1 counter${n === 1 ? '' : 's'} on ${army.name} (it is also a${/^[aeiou]/.test(ty) ? "n" : ""} ${tyName} now)`);
    }
    render(); flushTriggers();
  };
  if (armies.length <= 1) { apply(armies[0] || null); return; }
  const m = modal(`Amass ${type} ${n}`, { width: 460, sticky: true, noClose: true });
  m.body.append(h('div', { class: 'psub', text: 'You control more than one Army. Choose which one gets the counters (rule 701.47).' }));
  for (const a of armies) m.body.append(h('div', { class: 'row' }, h('span', { class: 'nm', text: `${a.name} (${ptText(a)})` }), h('button', { class: 'primary', text: 'Choose', onclick: () => { m.close(); apply(a); } })));
}
function openOppDraw() {
  if (!state) return;
  const m = modal('Opponent drew a card', { width: 480 });
  m.body.append(h('div', { class: 'psub', text: 'Abilities like Orcish Bowmasters ignore the first card an opponent draws in each of their draw steps. Was this that card?' }));
  m.foot.append(
    h('button', { text: 'Yes, their draw-step draw', onclick: () => { m.close(); log('Opponent drew their draw-step card (no triggers)'); } }),
    h('button', { class: 'primary', text: 'No, an extra draw', onclick: () => {
      m.close();
      const hb = state.battlefield.find(c => !c.token && /If an opponent would draw a card except the first one they draw in each of their draw steps, instead you create a Treasure token/i.test(((cardInfo(c.name) || {}).tx || '').replace(/\s+/g, ' ')));
      if (hb) { log(`${hb.name}: your opponent's extra draw is replaced, so they draw nothing and you create a Treasure token (rule 614.6: "whenever an opponent draws" abilities do not trigger)`); makeTokensFromDef(treasureDef(), 1, hb.name); return; }
      log('Opponent drew an extra card'); fireTrigger('oppdraw'); render(); flushTriggers(); } }));
}
function treasureDef() { return { name: 'Treasure', pt: '', col: [], types: ['Artifact'], subs: ['treasure'], tx: TOKEN_PRE.treasure.tx, type: 'Token Artifact \u2014 Treasure' }; }
// ---- The opponent searched their library (CR 701.23): ask WHAT they searched for so the right permanents react.
// "searches their library for a land card" abilities look at the kind; Opposition Agent (CR 722 control of a player) exiles the card they found and lets you play it.
const SEARCH_KINDS = [['basic land', 'Basic land'], ['land', 'Nonbasic land'], ['creature', 'Creature'], ['other', 'Other card'], ['none', 'Found nothing']];
function oppSearchMatches(filter, found) {
  const f = String(filter || '').toLowerCase().trim(); if (!f) return true; if (!found) return false;
  const kind = found.kind, types = found.types || [];
  if (f === 'basic land') return kind === 'basic land'; if (f === 'land' || f === 'nonbasic land') return f === 'land' ? (kind === 'basic land' || kind === 'land') : kind === 'land';
  return types.includes(f) || kind === f;
}
const oppSearchBlocker = () => state.battlefield.find(c => !c.token && /(?:your opponents|players|each player|opponents) can'?t search (?:libraries|their libraries)|can'?t search libraries/i.test(((cardInfo(c.name) || {}).tx || '').replace(/\s+/g, ' ')));
const oppSearchAgent = () => state.battlefield.find(c => !c.token && /you control your opponents while they'?re searching their libraries/i.test(((cardInfo(c.name) || {}).tx || '').replace(/\s+/g, ' ')));
function oppSearchCares() { return state.battlefield.some(c => parseTriggers(c).some(t => t.ev === 'opp-search')) || !!oppSearchAgent(); }
function finishOppSearch(found) {
  log(found && found.kind !== 'none' ? `Your opponent searched their library${found.name ? ' and found ' + found.name : ' for a ' + found.kind + ' card'}` : 'Your opponent searched their library');
  const ag = oppSearchAgent();
  if (ag && found && found.name && found.kind !== 'none') {
    const info = cardInfo(found.name);
    if (info) { const c = Object.assign(newCard(info.name), { id: state.nextId++, mayPlayAlways: true, anyColorSpend: true }); state.exile.push(c);
      log(`${ag.name}: you control your opponent while they search, so ${info.name} is exiled instead of going to their hand. You may play it for as long as it stays exiled, spending mana as though it were mana of any colour`); toast(`${ag.name}`, `${info.name} is exiled. Cast it from the Exile zone (any colour of mana).`); }
    else log(`${ag.name}: "${found.name}" is not in the card database, so it could not be exiled for you to play`);
  }
  fireTrigger('oppsearch', { found }); render(); flushTriggers();
}
function openOppSearch() {
  if (!state) return;
  const blk = oppSearchBlocker(); if (blk) { log(`${blk.name}: your opponent can't search their library, so nothing happens (CR 701.23)`); toast(`${blk.name}`, `Searching libraries is not allowed, so there is no search.`); return; }
  if (!oppSearchCares()) { log('Your opponent searched their library'); fireTrigger('oppsearch', { found: null }); render(); flushTriggers(); toast('Opponent searched', 'Noted. None of your permanents care when an opponent searches their library.'); return; }
  const agent = oppSearchAgent(), m = modal('What did your opponent search for?', { width: 520 });
  m.body.append(h('div', { class: 'psub', text: agent ? `${agent.name} lets you control them while they search: the card they find is exiled and you may play it. Pick what they searched for, then name the card.` : 'Pick what they searched for: some abilities only trigger for a certain kind of card.' }));
  const nameIn = h('input', { type: 'text', placeholder: 'Name of the card they found', list: 'oppSearchNames', style: 'width:100%' }), dl = h('datalist', { id: 'oppSearchNames' });
  if (agent) { nameIn.addEventListener('input', () => { const q = norm(nameIn.value); dl.replaceChildren(); if (q.length < 2) return; let n = 0; for (const c of CARDS.values()) { if (c.name && norm(c.name).includes(q)) { dl.append(h('option', { value: c.name })); if (++n >= 30) break; } } }); m.body.append(nameIn, dl); }
  const kindOf = nm => { const i = cardInfo(nm), t = ((i && i.t) || '').toLowerCase(); return { kind: /basic land/.test(t) ? 'basic land' : /\bland\b/.test(t) ? 'land' : /\bcreature\b/.test(t) ? 'creature' : 'other', types: t.split(/[\s—-]+/) }; };
  const go = kind => { const nm = nameIn.value.trim(); let found;
    if (kind === 'none') found = { kind: 'none', types: [] }; else if (nm && cardInfo(nm)) { const info = cardInfo(nm), k = kindOf(info.name); found = { kind: k.kind, types: k.types, name: info.name }; } else found = { kind, types: kind === 'basic land' ? ['basic', 'land'] : kind === 'land' ? ['land'] : kind === 'creature' ? ['creature'] : [], name: '' };
    if (agent && kind !== 'none' && !found.name) { toast('Name the card', 'Type the card they found so it can be exiled for you.'); return; }
    m.close(); finishOppSearch(found); };
  const row = h('div', { class: 'row', style: 'flex-wrap:wrap;gap:8px;margin-top:10px' }); for (const [k, lab] of SEARCH_KINDS) row.append(h('button', { class: k === 'none' ? '' : 'primary', text: lab, onclick: () => go(k) }));
  m.body.append(row); m.foot.append(h('button', { text: 'Cancel', onclick: () => m.close() }));
}
function makeToken(name, pt) {
  if (!state) return;
  snap();
  const c = newCard(name || 'Token', { token: true, tk: { pt: pt || '' } });
  c.id = state.nextId++;
  enterBattlefield(c, { from: 'effect', tapped: false, logMsg: `Created token ${c.name}${pt ? ' ' + pt : ''}` });
  render();
  flushTriggers();
}

