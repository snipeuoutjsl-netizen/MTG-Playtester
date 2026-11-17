// ---------------------------------------------------------------- v0.96.12 emblems (CR 114) and "target permanent" effects read from rules text
// CR 114.1: an emblem is an object in the command zone; it has no characteristics other than the abilities defined by the effect that created it,
// it cannot be removed, and its abilities work from the command zone (CR 114.4). Emblems live in state.emblems and are read like any other source of triggered abilities.
function makeEmblem(text, src) {
  if (!state) return null; snap();
  state.emblems = state.emblems || [];
  const c = newCard('Emblem', { token: true, tk: { pt: '', subs: [], col: [], tx: text, types: ['Emblem'], type: 'Emblem', emblem: true, from: src } });
  c.id = state.nextId++; state.emblems.push(c);
  log(`${src}: you get an emblem with "${text}"`); toast('Emblem', `${src}: you get an emblem. It stays for the rest of the game (CR 114.1).`);
  render(); return c;
}
function renderEmblems() {
  const mat = document.getElementById('mat'); if (!mat) return;
  let bar = document.getElementById('emblemBar');
  const list = (state && state.emblems) || [];
  if (!list.length) { if (bar) bar.remove(); return; }
  if (!bar) { bar = h('div', { id: 'emblemBar' }); mat.append(bar); }
  bar.replaceChildren(...list.map(e => h('div', { class: 'emblem', title: e.tk.tx }, h('b', { text: 'Emblem' }), h('span', { text: ` · ${e.tk.from || ''}` }), h('div', { class: 'etx', text: e.tk.tx }))));
}
// the permanent types named by a phrase such as "artifact or creature" / "artifact you control"
function typeWordsOf(phrase) { return String(phrase || '').toLowerCase().replace(/\byou control\b/g, '').split(/\s*(?:,|\bor\b|\band\/or\b)\s*/).map(w => singularWord(w.trim())).filter(Boolean); }
function permHasAny(c, words) { const t = permTypeInfo(c).types; return words.some(w => t.has(w)); }
// "If it's an artifact creature" / "If it's not a creature": every named type must (or, with "not", must not) be present on the target as it is NOW (CR 608.2c + 613 current characteristics)
function ifItsHolds(neg, typesPhrase, c) { const t = permTypeInfo(c), words = String(typesPhrase).toLowerCase().split(/\s+/).filter(Boolean).map(singularWord); const all = words.every(w => t.types.has(w) || t.subs.has(w)); return neg ? !all : all; }
function countsFromText(s) { const m = /put (a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+) \+1\/\+1 counters? on (?:it|that creature|target [a-z ,]+?)(?: you control)?(?=[.,]|$)/i.exec(s); return m ? wordN(m[1]) : 0; }
// "Untap target artifact or creature. If it's an artifact creature, put a +1/+1 counter on it."  /  "Put three +1/+1 counters on target artifact you control. If it's not a creature, it becomes a 0/0 Robot artifact creature."
function targetPermanentEffect(tx, src, obj) {
  const clean = String(tx || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const sents = clean.split(/(?<=[.!?])\s+/).map(x => x.trim()).filter(Boolean);
  const first = sents[0] || '';
  let m, act = null, phrase = '';
  if ((m = /^untap target ([a-z ,\/]+?)(?: you control)?\.?$/i.exec(first))) { act = 'untap'; phrase = m[1]; }
  else if ((m = /^put (?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+) \+1\/\+1 counters? on target ([a-z ,\/]+?)(?: you control)?\.?$/i.exec(first))) { act = 'counters'; phrase = m[1]; }
  if (!act) return null;
  const words = typeWordsOf(phrase); if (!words.length) return null;
  const cond = [];
  for (const s of sents.slice(1)) {
    const cm = /^If it'?s (not )?an? ([a-z ]+?), (.+?)\.?$/i.exec(s); if (!cm) return null;   // unknown follow-up: let the general reader handle (and flag) it
    const n = countsFromText(cm[3]); let bm;
    if (n) cond.push({ neg: !!cm[1], types: cm[2], counters: n });
    else if ((bm = /^it becomes an? (\d+)\/(\d+) ([A-Za-z]+) ((?:[a-z]+ )*)creature$/i.exec(cm[3]))) cond.push({ neg: !!cm[1], types: cm[2], becomes: { pt: bm[1] + '/' + bm[2], sub: bm[3], types: bm[4].trim().split(/\s+/).filter(Boolean).concat('creature') } });
    else return null;
  }
  const n0 = act === 'counters' ? countsFromText(first) : 0;
  const label = (act === 'untap' ? `Untap target ${phrase}` : `Put ${n0} +1/+1 counter${n0 === 1 ? '' : 's'} on target ${phrase}`) + (cond.length ? ' (then the "If it’s…" part)' : '');
  const apply = c => {
    snap();
    if (act === 'untap') { c.tapped = false; delete c.mt; log(`${src}: untapped ${c.name}`); }
    else { addCounter(c.id, n0, 'plus'); log(`${src}: put ${n0} +1/+1 counter${n0 === 1 ? '' : 's'} on ${c.name}`); }
    for (const k of cond) {   // CR 608.2c: the "If it's ..." part is checked as the first step has left the permanent
      if (!ifItsHolds(k.neg, k.types, c)) { log(`${src}: "If it\u2019s ${k.neg ? 'not ' : ''}${k.types}" was not true for ${c.name}, so that part does nothing`); continue; }
      if (k.counters) { addCounter(c.id, k.counters, 'plus'); log(`${src}: ${c.name} was ${k.neg ? 'not ' : ''}${k.types}: put ${k.counters} +1/+1 counter${k.counters === 1 ? '' : 's'} on it`); }
      if (k.becomes) { c.becomes = { pt: k.becomes.pt, types: k.becomes.types, subs: [k.becomes.sub.toLowerCase()] }; log(`${src}: ${c.name} becomes a ${k.becomes.pt} ${k.becomes.sub} ${k.becomes.types.join(' ')} (CR 613.1d/f; it stays that way)`); }
    }
    render(); flushTriggers();
  };
  return { full: true, label, fn: () => {
    const tg = obj && (obj.targets || []).find(t => t.kind === 'perm' && !t.gone);   // the target was chosen when the ability went on the stack (CR 601.2c / 602.2b)
    if (tg) { const f = findCard(tg.id); if (!f || f.zone !== 'battlefield') { log(`${src}: its target is gone, so the ability does nothing (CR 608.2b)`); return; } apply(f.card); return; }
    const cards = state.battlefield.filter(c => permHasAny(c, words));
    if (!cards.length) { toast('No legal target', `${src} needs a ${phrase} on the battlefield.`); return; }
    openPickCards({ title: `${src}: choose target ${phrase}`, note: 'The target is checked as the ability resolves (CR 608.2b).', cards, min: 1, max: 1, done: ids => { const f = ids[0] !== undefined && findCard(ids[0]); if (f && f.zone === 'battlefield') apply(f.card); } });
  } };
}
// "You get an emblem with "..."" (CR 114.1)
function emblemEffect(tx, src) {
  const m = /\byou get an emblem with ["“](.+)["”]\s*\.?\s*$/is.exec(String(tx || '').replace(/\n/g, ' ').trim()); if (!m) return null;
  const text = m[1].trim();
  return { full: true, label: 'Get an emblem', fn: () => makeEmblem(text, src) };
}
