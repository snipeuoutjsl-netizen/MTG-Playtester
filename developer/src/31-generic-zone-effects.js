// v0.96.12 CR 202.3: a card's mana value is worked out from its mana cost symbols (X counts as 0 outside the stack); two-faced costs fall back to the stored value
function mvOf(info) { if (!info) return 0; const mc = info.mc || ''; return mc && !/\/\//.test(mc) ? symCmc(mc) : mvOf(info); }
// ---------------------------------------------------------------- generic zone effects (v0.63)
// Tutors, "return cards from your graveyard", coin flips and similar effects that used to be done by hand.
// Hidden-zone rule 701.19b: you may search for a card with qualities, but you are never forced to find one, so every card is shown
// and the ones that match the description are highlighted.
function descMatchesCard(desc, name) {
  const info = cardInfo(name); if (!info) return false;
  const t = (info.t || '').split(' // ')[0], d = String(desc || '').toLowerCase();
  const words = { land: /\bLand\b/, creature: /\bCreature\b/, artifact: /\bArtifact\b/, enchantment: /\bEnchantment\b/, instant: /\bInstant\b/, sorcery: /\bSorcery\b/, planeswalker: /\bPlaneswalker\b/, equipment: /\bEquipment\b/, aura: /\bAura\b/, saga: /\bSaga\b/, basic: /\bBasic\b/, legendary: /\bLegendary\b/ };
  let any = false;
  for (const [w, re] of Object.entries(words)) { const neg = new RegExp('\\bnon-?' + w + '\\b').test(d); if (neg) { any = true; if (re.test(t)) return false; } else if (new RegExp('\\b' + w + '\\b').test(d)) { any = true; if (!re.test(t)) return false; } }
  let m;
  if (/mana cost \{0\} or \{1\}/.test(d)) { if (mvOf(info) > 1) return false; any = true; }
  if ((m = d.match(/mana value (\d+) or less/))) { if (mvOf(info) > +m[1]) return false; any = true; }
  if ((m = d.match(/mana value (\d+) or greater|mana value (\d+) or more/))) { if (mvOf(info) < +(m[1] || m[2])) return false; any = true; }
  if ((m = d.match(/mana value (\d+)(?! or)/))) { if (mvOf(info) !== +m[1]) return false; any = true; }
  if ((m = d.match(/toughness (\d+) or less/))) { const pt = (info.pt || '').split('/')[1]; if (pt === undefined || parseInt(pt, 10) > +m[1]) return false; any = true; }
  if ((m = d.match(/power (\d+) or less/))) { const pt = (info.pt || '').split('/')[0]; if (pt === undefined || parseInt(pt, 10) > +m[1]) return false; any = true; }
  if (/\bcolorless\b/.test(d)) { any = true; if (/\{[^}]*[WUBRG]/.test(String(info.mc || '').split(' // ')[0])) return false; }   // CR 105.2c: a colorless object has no color (no colored mana symbol in its cost)
  { const CM = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' }, mc0 = String(info.mc || '').split(' // ')[0];
    for (const [w, L] of Object.entries(CM)) { if (new RegExp('\\bnon-?' + w + '\\b').test(d)) { any = true; if (mc0.includes('{' + L)||mc0.includes('/' + L)) return false; } else if (new RegExp('\\b' + w + '\\b').test(d)) { any = true; if (!(mc0.includes('{' + L) || mc0.includes('/' + L))) return false; } } }
  if ((m = d.match(/named ([a-z' ,-]+)/))) { if (norm(info.name) !== norm(m[1].trim())) return false; any = true; }
  return any || /^(?:a |an )?card$/.test(d.trim());
}
// A small picker: choose up to `max` of the listed cards (the list can contain duplicates by name). Calls done(chosen[]) once.
function openPickCards(o) {
  const m = modal(o.title, { width: 760, sticky: true, noClose: !!o.min });
  const chosen = new Set(), out = h('div');
  const groups = new Map();
  for (const c of o.cards) { const g = groups.get(c.name) || { name: c.name, ids: [], ok: o.isOk ? o.isOk(c) : true }; g.ids.push(c.id); groups.set(c.name, g); }
  const list = [...groups.values()].sort((a, b) => (b.ok - a.ok) || a.name.localeCompare(b.name));
  const status = h('div', { class: 'muted small' });
  const draw = () => {
    out.replaceChildren(); const grid = h('div', { class: 'fetchgrid' });
    for (const g of list) {
      const picked = g.ids.filter(i => chosen.has(i)).length;
      const row = h('div', { class: 'frow ' + (g.ok ? 'on' : 'off') + (picked ? ' picked' : ''), style: picked ? 'outline:2px solid var(--accent,#c9a227)' : '' },
        h('span', { class: 'q', text: g.ids.length + '×' }), h('span', { class: 'nm', text: g.name }), h('span', { class: 'ty', text: picked ? '✓ ' + picked : '' }));
      row.addEventListener('mouseenter', () => showPreview({ name: g.name }));
      row.addEventListener('click', () => { const free = g.ids.find(i => !chosen.has(i)); if (picked && free === undefined || (picked && chosen.size >= o.max)) { for (const i of g.ids) chosen.delete(i); } else if (free !== undefined && chosen.size < o.max) chosen.add(free); else if (o.max === 1) { chosen.clear(); chosen.add(g.ids[0]); } draw(); });
      grid.append(row);
    }
    out.append(grid); status.textContent = `${chosen.size} of up to ${o.max} chosen.`;
  };
  m.body.append(h('div', { class: 'psub', text: o.note || '' }), status, out); draw();
  m.foot.append(...(o.min ? [] : [h('button', { text: o.nothing || 'Choose nothing', onclick: () => { m.close(); o.done([]); } })]), h('button', { class: 'primary', text: 'Confirm', onclick: () => { if (chosen.size < (o.min || 0)) { toast('Choose more', `You must choose ${o.min}.`); return; } m.close(); o.done(o.cards.filter(c => chosen.has(c.id))); } }));
}
function wordN(w) { w = String(w || 'a').toLowerCase(); return /^\d+$/.test(w) ? +w : (TOKEN_NUMW[w] || (/^any\b/.test(w) ? 99 : 1)); }
// "Search your library for a creature card with toughness 2 or less, reveal it, put it into your hand, then shuffle."
function searchEffect(tx, src, obj) {
  const m = String(tx).replace(/\([^)]*\)/g, '').replace(/\n/g, ' ').match(/search your library(?: and\/or graveyard)? for (up to (\w+)|an?|one|two|three|any number of|\w+) ([^.]*?)(?:,| and| then|\.)/i);
  if (!m || /\band (?:your )?graveyard for\b|and exile the rest/i.test(tx)) return null;
  const sentence = (tx.replace(/\n/g, ' ').match(/search your library[^.]*\.(?:[^.]*\.)?/i) || [''])[0];
  const exileIt = /\bexile (?:them|it|that card|those cards|the cards?)\b/i.test(sentence), freeCast = exileIt && /you may cast (?:those cards|that card|it|them|the cards?) without paying (?:its|their) mana costs?/i.test(sentence);
  let dest = exileIt ? 'exile' : /onto the battlefield/i.test(sentence) ? 'battlefield' : /into your graveyard/i.test(sentence) ? 'graveyard' : /(?:on top|top of your library)/i.test(sentence) ? 'top' : /into your hand|put (?:it|that card) into your hand/i.test(sentence) ? 'hand' : /\breveal\b/i.test(sentence) ? 'hand' : null;
  if (!dest) return null;
  const tapped = /battlefield tapped/i.test(sentence);
  const max = m[2] ? wordN(m[2]) : wordN(m[1]);
  const desc = m[3].replace(/^cards?\s*/i, '').trim() || m[3];
  const full = (sentence.match(/for [^,.]*?cards?\b[^,.]*/i) || [m[3]])[0];
  return { label: `Search your library for ${max === 1 ? 'a card' : 'up to ' + max + ' cards'} (${full.replace(/^for /i, '').trim()}) → ${dest === 'top' ? 'top of library' : dest + (freeCast ? ', cast free this turn' : '')}`, fn: () => {
    if (!state.library.length) { toast('Library is empty', 'There is nothing to search.'); return; }
    openPickCards({ title: `${src}: search your library`, note: `Choose ${max === 1 ? 'a card' : 'up to ' + max + ' cards'}: ${full.replace(/^for /i, '')}. Highlighted cards match the description; you may also choose nothing (you can't be forced to find a card). ${/shuffle/i.test(sentence) || /shuffle/i.test(tx) ? 'Your library is shuffled afterwards.' : ''}`,
      cards: state.library.slice(), max, isOk: c => descMatchesCard(full.replace(/^for (?:up to \w+ |an? |one |two |three |any number of )?/i, ''), c.name), nothing: 'Find nothing',
      done: (picked) => { snap(); const names = [];
        for (const c of picked) { names.push(c.name);
          if (dest === 'hand') { const i = state.library.findIndex(x => x.id === c.id); if (i >= 0) state.hand.push(...state.library.splice(i, 1)); }
          else if (dest === 'graveyard') moveCard(c.id, 'graveyard');
          else if (dest === 'exile') { const i = state.library.findIndex(x => x.id === c.id); if (i >= 0) { const [x] = state.library.splice(i, 1); if (freeCast) x.freeCastTurn = state.turn; state.exile.push(x); } }   // CR 701.23 search, 406 exile; "until end of turn, you may cast … without paying" (CR 118.9)
          else if (dest === 'top') { const i = state.library.findIndex(x => x.id === c.id); if (i >= 0) { const [x] = state.library.splice(i, 1); state.library.unshift(x); } }
          else { const i = state.library.findIndex(x => x.id === c.id); if (i >= 0) { const [x] = state.library.splice(i, 1); enterBattlefield(x, { from: 'library', logMsg: `${src}: ${x.name} put onto the battlefield${tapped ? ' tapped' : ''}`, tapped }); if (tapped) x.tapped = true; } } }
        if (/shuffle/i.test(tx)) shuffle(state.library);
        if (dest === 'top' && picked.length) { const [x] = picked; const i = state.library.findIndex(y => y.id === x.id); if (i > 0) { const [y] = state.library.splice(i, 1); state.library.unshift(y); } }
        log(`${src}: searched the library${names.length ? ' and found ' + names.join(', ') + (dest === 'hand' ? ' (to hand)' : ' (' + dest + ')') : ' and found nothing'}${/shuffle/i.test(tx) ? '; shuffled' : ''}`); render(); flushTriggers(); } });
  } };
}
// "Return up to three target land cards from your graveyard to your hand."
function graveReturnEffect(tx, src) {
  const T = String(tx).replace(/\n/g, ' ');
  const m = T.match(/(?:return|put)s? (up to (\w+)|all\b|an?\b|one\b|two\b|three\b|\w+\b)? ?(?:target )?([a-z\- ]*?)cards?(?: at random)?(?: with mana value \d+(?: or (?:less|greater))?)? (?:from|in) (?:your|a|an|their|each|any) graveyards?(?: to| onto) (your hand|the battlefield)/i);
  if (!m) return null;
  const all = /^all$/i.test(m[1] || ''), rnd = /\bat random\b/i.test(T), tapped = /\b(?:to|onto) the battlefield tapped\b/i.test(T);
  const max = all ? 99 : m[2] ? wordN(m[2]) : wordN(m[1] || 'a'), desc = (m[3] || '').trim(), to = /hand/i.test(m[4]) ? 'hand' : 'battlefield';
  const mv = T.match(/with mana value (\d+)( or (?:less|greater))?/i);
  const lifeLoss = /you lose life equal to (?:its|that card's) mana value/i.test(T);
  const okCard = c => (!desc || descMatchesCard(desc, c.name)) && (!mv || (() => { const i = cardInfo(c.name), v = mvOf(i), n = +mv[1]; return mv[2] ? (/less/i.test(mv[2]) ? v <= n : v >= n) : v === n; })());
  const noun = `${desc ? desc + ' ' : ''}card${max === 1 ? '' : 's'}${mv ? ` with mana value ${mv[1]}${mv[2] || ''}` : ''}`;
  const lbl = all ? `Return all ${noun} from your graveyard to ${to === 'hand' ? 'your hand' : 'the battlefield' + (tapped ? ' tapped' : '')}` : `${rnd ? 'Return a random' : 'Return ' + (max === 1 ? 'a' : 'up to ' + max)} ${noun} from your graveyard to ${to === 'hand' ? 'your hand' : 'the battlefield' + (tapped ? ' tapped' : '')}`;
  const move = picked => {
    snap();
    for (const c of picked) {
      const i = state.graveyard.findIndex(x => x.id === c.id); if (i < 0) continue; const [x] = state.graveyard.splice(i, 1);
      if (to === 'hand') state.hand.push(x);
      else { enterBattlefield(x, { from: 'graveyard', tapped: tapped || undefined, logMsg: `${src}: ${x.name} returned to the battlefield${tapped ? ' tapped' : ''}` }); if (lifeLoss) { const inf = cardInfo(x.name), n = inf ? inf.cmc || 0 : 0; if (n) changeLife(-n); log(`${src}: you lose ${n} life (mana value of ${x.name})`); } }
    }
    log(`${src}: returned ${picked.map(c => c.name).join(', ') || 'nothing'} from the graveyard`); render(); flushTriggers();
  };
  return { label: lbl, fn: () => {
    const cards = state.graveyard.filter(okCard);
    if (!cards.length) { toast('Nothing to return', `Your graveyard has no matching card.`); return; }
    if (all) { move(cards); return; }
    if (rnd) { move([cards[Math.floor(Math.random() * cards.length)]]); return; }
    openPickCards({ title: `${src}: return from your graveyard`, note: `Choose ${max === 1 ? 'a card' : 'up to ' + max + ' cards'} to put ${to === 'hand' ? 'into your hand' : 'onto the battlefield'}.`, cards, max, done: move });
  } };
}
function flipCoin() { return Math.random() < 0.5; }


