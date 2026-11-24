// ---------------------------------------------------------------- game-state indicators (v0.75)
// Static pictures in the top bar that light up while a game state applies: things the app can see for itself (spells cast this turn, delirium,
// threshold, metalcraft, revolt, morbid, landfall, the city's blessing) and things only you know (monarch, initiative, day/night, counters), which you set by clicking.
function noteCast(c) {
  if (!state) return; const sc = state.spellsCast; state.spellsCast = { turn: state.turn, n: (sc && sc.turn === state.turn ? sc.n : 0) + 1 };
  // v0.94.4 remember each spell's type line this turn, for "the second creature spell you cast this turn" (Vengevine)
  const tl = state.castTypes && state.castTypes.turn === state.turn ? state.castTypes.list : [];
  state.castTypes = { turn: state.turn, list: tl.concat([{ id: c.id, t: frontType(c) || '' }]) };
}
// Is this spell the Nth (of the given type) spell cast this turn? Counts spells already noted, including this one.
function castNth(nth, sp) {
  const list = state.castTypes && state.castTypes.turn === state.turn ? state.castTypes.list : [];
  const tf = { creature: /\bCreature\b/, noncreature: /^(?!.*\bCreature\b)/, instant: /\bInstant\b/, sorcery: /\bSorcery\b/, 'instant or sorcery': /\b(Instant|Sorcery)\b/, artifact: /\bArtifact\b/, enchantment: /\bEnchantment\b/, land: /\bLand\b/ }[nth.type];
  const matching = list.filter(x => !tf || tf.test(x.t));
  const i = matching.findIndex(x => x.id === sp.id);
  return i + 1 === nth.n;
}
const spellsCastNow = () => (state && state.spellsCast && state.spellsCast.turn === state.turn ? state.spellsCast.n : 0);
const GS_ICON = {
  skipdraw: '<rect x="6" y="3" width="12" height="17" rx="2"/><path d="M4 21 20 3"/>',
  storm: '<path d="M7 16a4 4 0 0 1 .5-7.9A5.500 5.500 0 0 1 18 9a3.500 3.500 0 0 1 0 7"/><path d="M12.500 11l-2.500 4h3l-2 4"/>',
  monarch: '<path d="M3 19h18M4 19 3 8l5 4 4-7 4 7 5-4-1 11z"/>',
  initiative: '<path d="M6 21V10a6 6 0 0 1 12 0v11M3 21h18M12 21v-6"/><circle cx="15" cy="15.500" r=".9" fill="currentColor"/>',
  ascend: '<path d="M3 21V12h4v9M9 21V5h6v16M17 21v-9h4v9M2 21h20M11.500 9h1M11.500 12.500h1M11.500 16h1"/>',
  day: '<circle cx="12" cy="12" r="4"/><path d="M12 2.500v3M12 18.500v3M2.500 12h3M18.500 12h3M5.300 5.300l2.100 2.100M16.600 16.600l2.100 2.100M18.700 5.300l-2.100 2.100M7.400 16.600l-2.100 2.100"/>',
  night: '<path d="M20 14.500A8 8 0 0 1 9.500 4 8 8 0 1 0 20 14.500z"/>',
  dayoff: '<path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor" fill-opacity=".3"/><path d="M12 4a8 8 0 0 1 0 16"/><path d="M12 2v2M12 20v2"/>',
  delirium: '<path d="M12 12a1.500 1.500 0 1 1 3 0 4 4 0 1 1-6 0 6.500 6.500 0 1 1 10 0"/>',
  threshold: '<path d="M6 21V10a6 6 0 0 1 12 0v11zM12 8v7M9 11h6"/>',
  metalcraft: '<path d="M12 3l7.500 4.300v8.600L12 20.200 4.500 15.900V7.300z"/><circle cx="12" cy="11.600" r="2.500"/>',
  revolt: '<path d="M10 4H5v16h5M14 8l4 4-4 4M8 12h10"/>',
  morbid: '<path d="M12 3a7 7 0 0 0-7 7c0 2.500 1.200 4 3 5v3h8v-3c1.800-1 3-2.500 3-5a7 7 0 0 0-7-7z"/><circle cx="9.500" cy="11" r="1.500" fill="currentColor"/><circle cx="14.500" cy="11" r="1.500" fill="currentColor"/>',
  landfall: '<path d="M12 3v9M8.500 8.500 12 12l3.500-3.500M3 20l5-4.500 4 3 4-3 5 4.500z"/>',
  energy: '<rect x="3" y="7.500" width="15" height="9" rx="2"/><path d="M21 11v2M10.500 9.500l-2 3h3l-2 3"/>',
  poison: '<path d="M12 3s6 6.500 6 11a6 6 0 0 1-12 0c0-4.500 6-11 6-11z"/><path d="M9.500 15h5"/>',
  experience: '<path d="M12 3l2.600 5.600 6 .8-4.400 4.200 1.100 6L12 16.700 6.700 19.600l1.100-6L3.400 9.400l6-.8z"/>'
};
function gameStates() {
  const gs = state.gs || (state.gs = {}), L = [];
  const types = deliriumCount(), gy = state.graveyard.length, perms = state.battlefield.length;
  const arts = state.battlefield.filter(c => { try { return permTypeInfo(c).types.has('artifact'); } catch (e) { return false; } }).length;
  const sc = spellsCastNow();
  const add = (key, label, on, count, desc, o = {}) => L.push({ key, label, on, count, desc, ...o });
  add('storm', 'Storm', sc > 0, sc || '', `Spells cast this turn (yours and your opponent's): ${sc}. A spell with storm is copied once for each spell cast before it this turn (rule 702.40).`);
  add('monarch', 'Monarch', !!gs.monarch, '', 'You are the monarch (rule 724): you draw a card at the beginning of your end step (the app queues that trigger for you), and whoever deals combat damage to the monarch takes the crown. Click to take or lose it.', { manual: true });
  add('initiative', 'Initiative', !!gs.init, '', 'You have the initiative (rule 725): venture into the Undercity when you take it and at the beginning of your upkeep. Whoever deals combat damage to the player with the initiative takes it. Click to take or lose it.', { manual: true });
  add('ascend', 'City’s blessing', !!gs.citys, gs.citys ? '' : (perms >= 1 ? perms + '/10' : ''), 'Ascend (rule 702.131): you get the city’s blessing the moment you control ten or more permanents, and you keep it for the rest of the game. The app checks this for you; click to set or clear it by hand.', { manual: true });
  add(gs.dn === 'night' ? 'night' : 'day', gs.dn === 'night' ? 'Night' : gs.dn === 'day' ? 'Day' : 'Day / night', !!gs.dn, '', 'Day and night (rule 726): once a daybound or nightbound permanent appears it becomes day. It becomes night if the active player cast no spells during their own previous turn, and day if they cast two or more. Click to cycle: not set, day, night.', { manual: true, gsKey: 'dn' });
  if (skipDrawSource()) add('skipdraw', 'Skip draws', !!gs.skipDraw, '', 'Necrodominance lets you skip any card you would draw. While this is on, every draw is skipped (your draw step too). Click to switch it on or off. Turn it off again when you want to draw.', { manual: true, functional: true });
  add('delirium', 'Delirium', types >= 4, types || '', `Four or more card types among cards in your graveyard. You have ${types} right now.`);
  add('threshold', 'Threshold', gy >= 7, gy || '', `Seven or more cards in your graveyard. You have ${gy}.`);
  add('metalcraft', 'Metalcraft', arts >= 3, arts || '', `Three or more artifacts you control. You control ${arts}.`);
  add('revolt', 'Revolt', memThisTurn('left').length > 0, '', 'A permanent you controlled left the battlefield this turn.');
  add('morbid', 'Morbid', memThisTurn('died', x => /\bCreature\b/.test(x.type)).length > 0, '', 'A creature died this turn.');
  add('landfall', 'Landfall', memThisTurn('entered', x => /\bLand\b/.test(x.type)).length > 0, '', 'A land entered the battlefield under your control this turn.');
  add('energy', 'Energy', (gs.energy || 0) > 0, gs.energy || '', 'Energy counters (rule 107.14): you pay them with {E}. Click to add one, right-click to remove one.', { counter: 'energy' });
  add('poison', 'Poison', (gs.poison || 0) > 0, gs.poison || '', 'Poison counters (rule 704.5c): at ten or more you lose the game. Click to add one, right-click to remove one.', { counter: 'poison' });
  add('experience', 'Experience', (gs.exp || 0) > 0, gs.exp || '', 'Experience counters: some cards count them. Click to add one, right-click to remove one.', { counter: 'exp' });
  return L;
}
// v0.99.71 one rule on every screen: all icons when they fit on one line; when they would wrap, only the active ones plus a ⋯ button that shows the rest.
function fitStateIcons() {
  const box = $('#gstates'); if (!box || box.hidden) return;
  box.classList.remove('gs-trim'); if (document.body.classList.contains('gs-all')) return;
  const icons = [...box.querySelectorAll('.sti')]; if (!icons.length) return;
  const top = icons[0].offsetTop; if (icons.some(e => e.offsetTop > top + 4)) box.classList.add('gs-trim');
}
window.addEventListener('resize', () => { try { fitStateIcons(); } catch (e) {} });
function drawStateIcons() {
  const box = $('#gstates'); if (!box) return;
  const list0 = !!state && state.phase === 'play' ? gameStates().filter(x => x.functional || teach('stateIcons')) : [];
  const on = list0.length > 0;
  box.hidden = !on; if (!on) { box.replaceChildren(); return; }
  const gs = state.gs || (state.gs = {});
  if (!gs.citys && state.battlefield.length >= 10) { gs.citys = true; log('You get the city’s blessing (ten or more permanents; Ascend, rule 702.131)'); }
  box.replaceChildren(...list0.map(s => {
    const e = h('button', { class: 'sti' + (s.on ? ' on' : ' off'), 'data-gs': s.key, title: `${s.label}${s.on ? ' — active' : ''}\n${s.desc}` });
    e.innerHTML = `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GS_ICON[s.on || s.key !== 'day' ? s.key : 'dayoff'] || ''}</svg>`;
    if (s.count !== '' && s.count !== undefined) e.append(h('i', { text: String(s.count) }));
    e._s = s; return e;
  }), h('button', { class: 'sti-more', text: document.body.classList.contains('gs-all') ? '×' : '⋯', title: 'Show every game-state icon (to add energy, poison…)', 'aria-label': 'Show all game-state icons', onclick: ev => { ev.stopPropagation(); document.body.classList.toggle('gs-all'); drawStateIcons(); } }));   // v0.99.69 upright phones show only the active ones
  fitStateIcons();
}
document.addEventListener('click', ev => {
  const b = ev.target.closest && ev.target.closest('#gstates .sti'); if (!b || !state || !b._s) return;
  const s = b._s, gs = state.gs || (state.gs = {});
  if (s.counter) { snap(); gs[s.counter] = (gs[s.counter] || 0) + 1; log(`${s.label}: ${gs[s.counter]}`); if (s.counter === 'poison' && gs.poison >= 10) toast('Ten poison counters', 'A player with ten or more poison counters loses the game (rule 704.5c).'); render(); return; }
  if (s.manual) {
    snap();
    if (s.gsKey === 'dn') { gs.dn = !gs.dn ? 'day' : gs.dn === 'day' ? 'night' : ''; log(`It is now ${gs.dn || 'neither day nor night'}`); }
    else if (s.key === 'monarch') { gs.monarch = !gs.monarch; log(gs.monarch ? 'You are the monarch' : 'You are no longer the monarch'); }
    else if (s.key === 'initiative') { gs.init = !gs.init; log(gs.init ? 'You have the initiative' : 'You no longer have the initiative'); }
    else if (s.key === 'skipdraw') { gs.skipDraw = !gs.skipDraw; log(gs.skipDraw ? 'Skip draws is ON: cards you would draw are skipped' : 'Skip draws is OFF: you draw normally'); }
    else if (s.key === 'ascend') { gs.citys = !gs.citys; log(gs.citys ? 'You have the city’s blessing' : 'City’s blessing cleared'); }
    render(); return;
  }
  toast(s.label, s.desc);
});
document.addEventListener('contextmenu', ev => {
  const b = ev.target.closest && ev.target.closest('#gstates .sti'); if (!b || !state || !b._s) return; ev.preventDefault();
  const s = b._s, gs = state.gs || (state.gs = {}); if (s.counter && (gs[s.counter] || 0) > 0) { snap(); gs[s.counter]--; log(`${s.label}: ${gs[s.counter]}`); render(); }
});

