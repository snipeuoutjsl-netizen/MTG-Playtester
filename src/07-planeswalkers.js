// ---------------------------------------------------------------- planeswalkers
function isPlaneswalker(c) { return /\bPlaneswalker\b/.test(frontType(c)); }
function pwAbilities(c) {
  const info = !c.token && cardInfo(c.name);
  if (!info || !info.tx) return [];
  const out = [];
  for (const line of info.tx.split('\n')) {
    const m = line.trim().match(/^([+−–‒-]?)\s?(\d+|X):\s*(.+)$/);
    if (!m) continue;
    const neg = /[−–‒-]/.test(m[1]), isX = m[2] === 'X', n = isX ? 0 : parseInt(m[2], 10);
    if (!m[1] && n !== 0) continue;
    out.push({ label: (neg ? '−' : m[1] === '+' ? '+' : '') + m[2], cost: isX ? 0 : (neg ? -n : n), neg, isX, text: m[3] });
  }
  return out;
}
function pwBlock(c, ab) {
  if (!canPlaySorcerySpeedNow()) return 'Loyalty abilities can only be activated in your main phase with an empty stack.';
  if (c.activatedTurn === state.turn) return 'You can activate only one loyalty ability per planeswalker each turn.';
  if (ab.neg && !ab.isX && (c.loyalty || 0) < -ab.cost) return 'Not enough loyalty counters to pay this cost.';
  if (ab.isX && (c.loyalty || 0) < 1) return 'Not enough loyalty counters.';
  return '';
}
function checkLoyalty(c) {
  if (!state || !isPlaneswalker(c) || (c.loyalty || 0) > 0) return;
  const f = findCard(c.id);
  if (!f || f.zone !== 'battlefield') return;
  log(`${c.name} has 0 loyalty: put into the graveyard (state-based action)`);
  toast(`${c.name} dies`, 'A planeswalker with 0 loyalty counters is put into its owner’s graveyard.');
  leaveBattlefield(c, 'graveyard');
}
function adjustLoyalty(id, d) {
  const f = findCard(id); if (!f) return; snap();
  f.card.loyalty = Math.max(0, (f.card.loyalty || 0) + d);
  log(`${f.card.name}: loyalty ${d > 0 ? '+' : ''}${d} → ${f.card.loyalty}`);
  checkLoyalty(f.card); render(); flushTriggers();
}
function activatePW(c, ab, x) {
  if (splitSecondOn()) { toast('Split second', 'Loyalty abilities cannot be activated while a spell with split second is on the stack.'); return; }
  snap();
  const delta = ab.isX ? -x : ab.cost;
  c.loyalty = Math.max(0, (c.loyalty || 0) + delta);
  c.activatedTurn = state.turn;
  state.stack.push({ ability: true, pw: true, id: state.nextId++, name: `${c.name} (${ab.label})`, sourceId: c.id, sourceName: c.name, text: ab.text });
  state.priority = { active: true, passed: false };
  log(`${c.name}: activated ${ab.isX ? '−' + x : ab.label} (loyalty now ${c.loyalty}); ability on the stack`);
  checkLoyalty(c);
  render();
  openStack();
}
function openLoyalty(c) {
  if (!state || !isPlaneswalker(c)) return;
  const abs = pwAbilities(c);
  const m = modal(`${c.name}: loyalty ${c.loyalty ?? '?'}`, { width: 640, sticky: false });
  m.body.append(h('div', { class: 'psub', text: 'Loyalty abilities cost loyalty counters: + adds them, − removes them (you pay when you activate). Once per turn, only in your main phase with an empty stack, like a sorcery.' }));
  if (!abs.length) m.body.append(h('div', { class: 'muted', text: 'No loyalty abilities were found in the card text. Use the card menu to change loyalty by hand.' }));
  for (const ab of abs) {
    const why = pwBlock(c, ab);
    const xin = ab.isX ? h('input', { type: 'number', min: 1, max: c.loyalty || 1, value: 1, style: 'width:60px' }) : null;
    const go = h('button', { class: 'primary', text: 'Activate', disabled: !!why, title: why });
    go.addEventListener('click', () => { const x = xin ? Math.max(1, Math.min(parseInt(xin.value, 10) || 1, c.loyalty || 1)) : 0; m.close(); activatePW(c, ab, x); });
    m.body.append(h('div', { class: 'row pwrow' }, h('span', { class: 'pwcost', text: ab.label }), h('span', { class: 'nm', text: ab.text }), ...(xin ? [xin] : []), go),
      ...(why ? [h('div', { class: 'muted small', style: 'margin:-2px 0 6px 6px', text: why })] : []));
  }
  m.foot.append(h('button', { text: '−1 loyalty (damage)', onclick: () => { m.close(); adjustLoyalty(c.id, -1); } }), h('button', { text: '+1 loyalty', onclick: () => { m.close(); adjustLoyalty(c.id, 1); } }), h('button', { class: 'primary', text: 'Close', onclick: () => m.close() }));
}

function resolvePendingTrigger(){
  if(!state||!state.pendingTriggers.length||legendOpen)return;
  if(state.pendingTriggers[0].kind==='ability'){
    const batch=[]; while(state.pendingTriggers.length && state.pendingTriggers[0].kind==='ability') batch.push(state.pendingTriggers.shift());
    openTriggerBatch(batch); return;
  }
  const t=state.pendingTriggers.shift();
  if(t.kind==='scry'||t.kind==='surveil') openScry(t.n,t.kind==='surveil',t.text);
  else if(t.kind==='shock') openShockChoice(t.cardId,t.fetched);
  else if(t.kind==='vesuva') openVesuva(t.cardId);
  else if(t.kind==='attach') openAttachChoice(t.cardId);
  else if(t.kind==='discardInstead') openDiscardInstead(t.cardId,t.what);
  else if(t.kind==='choose') openChoose(t.cardId,t.what);
  else if(t.kind==='sagaSac') { state.sagaWait = (state.sagaWait || []).concat([t.cardId]); sagaCheck(); }
}
function openTriggeredAbility(t){
  const c=findCard(t.cardId)?.card; const m=modal('Triggered ability',{width:560,sticky:true});
  m.body.append(h('div',{class:'ptitle',text:c?c.name:'Ability'}),h('div',{class:'psub'},t.text),h('div',{class:'muted small'},teach('triggerPrompts')?'Resolve this trigger before continuing.':''));
  m.foot.append(h('button',{class:'primary',text:'Resolve ability',onclick:()=>{m.close();log(`Resolved triggered ability — ${c?c.name:'unknown source'}`);resolvePendingTrigger();render();}}));
}
// v0.94.5 How much life the "you may pay N life; if you don't, it enters tapped" question costs (shocklands pay 2; the modal double-faced lands such as Soporific Springs pay 3). 0 = no such question.
function shockLife(c) {
  if (!c || c.token) return 0; if (SHOCKS.has(norm(c.name))) return 2;
  const m = /\byou may pay (\d+) life\.\s*if you don'?t,\s*(?:it|this land|[^.]*?) enters(?: the battlefield)? tapped/i.exec(cardText(c)); return m ? +m[1] : 0;
}
function shockLandChoice(c) { return shockLife(c) > 0; }
// Everything a land does as it enters the battlefield by any route (played, fetched, put there by an effect):
// the shockland question and "When this enters, surveil/scry N". Tapped-ness is decided by etbTapped().
function landEntryTriggers(c, fetched) {
  if(!state||!c||!isLandName(c.name)) return;
  if(entersAsLandCopy(c) && state.battlefield.some(x=>x.id!==c.id&&isLandName(x.name))) queueTrigger({kind:'vesuva',cardId:c.id});
  if(shockLandChoice(c)) queueTrigger({kind:'shock',cardId:c.id,fetched:!!fetched});
  const etb=landETBTrigger(c); if(etb) queueTrigger(etb);
}
function queueTrigger(t) { if(state && t) state.pendingTriggers.push(t); }
function resumePhase() {
  if(!state) return; state.phasePause=false;
  if(state.pendingTriggers.length) resolvePendingTrigger();
  else render();
}
function stackPriorityMessage(){
  return teach('stackGuidance') ? 'You have priority. You may cast an instant/flash spell or activate an ability before the top object resolves.' : 'Priority is active.';
}
// ---- contextual mana costs ("This spell costs {2} less to cast for each basic land type ...")
// "for each Locus on the battlefield" / "for each Goblin you control": permanents with that type or subtype. ctrl 'you' counts only yours
// (the app only tracks your side, so "on the battlefield" is your permanents too).
function countPermsOf(what) {
  const w = singularWord(String(what).trim().toLowerCase().replace(/^(?:other|another)\s+/, ''));
  if (!w || !state) return 0;
  return state.battlefield.filter(c => { const ti = permTypeInfo(c); return ti.subs.has(w) || ti.types.has(w); }).length;
}
// v0.95.3 One quantity reader for every "for each ..." / "equal to the number of ..." amount. It knows counters on the source ("burden counter on ~",
// "+1/+1 counter on it", "counter on this artifact") and falls back to countForEach for everything else, so each effect only asks eachQty(phrase, obj).
// Returns a number, or null when the wording is not understood (callers then say so instead of guessing 1).
function counterKey(k) { k = String(k || '').toLowerCase().replace(/\u2212/g, '-'); return k === '+1/+1' ? 'plus' : k === '-1/-1' ? 'minus' : k; }
function counterCount(c, kind) { if (!c) return 0; const cc = typeof c.counters === 'number' ? { plus: c.counters } : (c.counters || {}); if (!kind) return Object.values(cc).reduce((a, b) => a + (+b || 0), 0) + (c.loyalty || 0) * 0; return cc[counterKey(kind)] || 0; }
function eachQty(phrase, obj) {
  let p = String(phrase || '').trim().replace(/[.,;]+$/, '').replace(/\u2019/g, "'");
  const src = obj && obj.sourceId ? (findCard(obj.sourceId) || {}).card : null;
  if (src) { const nm = src.name.split(' // ')[0]; if (nm) p = p.split(nm).join('~'); }
  const m = p.match(/^(?:(\+1\/\+1|[\u2212-]1\/[\u2212-]1|[a-z][a-z'-]*) )?counters?(?: of any kind)? on (~|it|this [a-z]+|that [a-z]+)$/i);
  if (m) { if (!src) return 0; const kind = m[1] && !/^(?:a|an|the|each)$/i.test(m[1]) ? m[1] : ''; return counterCount(src, kind); }
  return countForEach(p);
}
// "draw a card for each ..." / "you lose 1 life for each ..." -> { n: per-step amount, what, total }
function forEachAmount(tx, verbRe, obj) {
  const m = String(tx || '').match(new RegExp('\\b' + verbRe + '\\s+(a|an|one|two|three|four|five|\\d+)\\s+(?:cards?|life)\\s+for each ([^.,;]+)', 'i')); if (!m) return null;
  const per = wnum(m[1]) || 1; return { per, what: m[2].trim(), now: () => { const q = eachQty(m[2], obj); return q === null ? null : per * q; } };
}
function countForEach(phrase) {
  if (!state) return 0;
  const t = phrase.toLowerCase();
  const bf = state.battlefield;
  const typeOf = c => (c.token ? permTypeLine(c) : (() => { const i = cardInfo(c.name); return i && i.t ? i.t.split(' // ')[0] : ''; })());   // v0.95.0 a token counts as what it is (an artifact creature token is an artifact)
  { const mm = t.match(/\b(white|blue|black|red|green|colorless) mana (?:in your (?:mana )?pool|you have)\b/); if (mm) return (state.manaPool || {})[{ white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G', colorless: 'C' }[mm[1]]] || 0; if (/\bmana in your (?:mana )?pool\b/.test(t)) return manaTotal(); }   // Omnath, Locus of Mana
  if (/basic land type/.test(t)) return domainCount();
  if (/instant and sorcery card/.test(t) || /instant or sorcery card/.test(t)) return state.graveyard.filter(c => /\b(Instant|Sorcery)\b/.test(typeOf(c))).length;
  if (/card in your graveyard/.test(t)) return state.graveyard.length;
  // v0.96.10 CR 613.1d/205.1: count permanents by their CURRENT card types (type-changing effects and token types included), not by the printed type line
  const isType = (c, ty) => { try { return permTypeInfo(c).types.has(ty); } catch (e) { return new RegExp('\\b' + ty + '\\b', 'i').test(typeOf(c)); } };
  if (/creature (card )?you control|creature on the battlefield/.test(t)) return bf.filter(c => isType(c, 'creature')).length;
  if (/artifact you control/.test(t)) return bf.filter(c => isType(c, 'artifact')).length;
  if (/enchantment you control/.test(t)) return bf.filter(c => isType(c, 'enchantment')).length;
  if (/land you control/.test(t)) return bf.filter(c => isLandName(c.name)).length;
  if (/card in your hand/.test(t)) return state.hand.length;
  { const m = t.match(/^(?:each |an? )?([a-z][a-z'-]*)(?: you control| on the battlefield)?\.?$/); if (m && m[1] !== 'card' && m[1] !== 'permanent') { const n = countPermsOf(m[1]); if (n || /locus|goblin|elf|zombie|spirit|treasure|clue|food|army|orc/.test(m[1])) return n; } }
  return null;   // unsupported wording
}
function symCmc(mc) {
  let n = 0, m; const re = /\{([^}]+)\}/g;
  while ((m = re.exec(mc || ''))) n += /^\d+$/.test(m[1]) ? +m[1] : (m[1].toUpperCase() === 'X' ? 0 : 1);
  return n;
}
