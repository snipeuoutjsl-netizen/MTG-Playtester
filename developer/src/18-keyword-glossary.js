// ---------------------------------------------------------------- keyword glossary (hover to learn)
const AMB = '(?<=^|\\n|, |has |have |gains? |with |and |or )';   // words that are only keywords in a keyword position
const KEYWORDS = [
  ['Flying', /\bflying\b/i, 'This creature can only be blocked by creatures with flying or reach.'],
  ['Reach', new RegExp(AMB + 'reach\\b', 'i'), 'This creature can block creatures with flying.'],
  ['First strike', /\bfirst strike\b/i, 'Deals combat damage before creatures without first strike. If it kills the blocker or attacker first, it takes no damage back.'],
  ['Double strike', /\bdouble strike\b/i, 'Deals combat damage twice: once in the first-strike step and once in the regular step.'],
  ['Deathtouch', /\bdeathtouch\b/i, 'Any amount of damage this deals to a creature is enough to destroy it.'],
  ['Lifelink', /\blifelink\b/i, 'Damage dealt by this creature also gains you that much life.'],
  ['Haste', /\bhaste\b/i, 'This creature can attack and use {T} abilities the turn it comes under your control (it ignores summoning sickness).'],
  ['Vigilance', /\bvigilance\b/i, 'Attacking does not cause this creature to tap, so it can still block on your opponent’s turn.'],
  ['Trample', /\btrample\b/i, 'If this creature would assign more combat damage than needed to kill its blockers, it can assign the rest to the player.'],
  ['Menace', /\bmenace\b/i, 'This creature can’t be blocked except by two or more creatures.'],
  ['Defender', /\bdefender\b/i, 'This creature can’t attack.'],
  ['Hexproof', /\bhexproof\b/i, 'This can’t be the target of spells or abilities your opponents control.'],
  ['Shroud', /\bshroud\b/i, 'This can’t be the target of any spells or abilities, including your own.'],
  ['Indestructible', /\bindestructible\b/i, 'Destroy effects and lethal damage don’t destroy it. It can still be exiled, sacrificed or die to 0 toughness.'],
  ['Protection', /\bprotection from\b/i, 'Can’t be Damaged, Enchanted/Equipped, Blocked or Targeted by the stated quality (DEBT).'],
  ['Ward', new RegExp(AMB + 'ward\\b(?=\\s*[—{\\d-])', 'i'), 'Whenever this becomes the target of a spell or ability an opponent controls, counter it unless that player pays the ward cost.'],
  ['Flash', new RegExp(AMB + 'flash\\b', 'i'), 'You may cast this spell any time you could cast an instant.'],
  ['Prowess', /\bprowess\b/i, 'Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.'],
  ['Cycling', /\b\w*cycling\b/i, 'Pay the cycling cost and discard this card: draw a card (landcycling fetches a land of that type instead). Works from your hand at instant speed.'],
  ['Kicker', /\b(?:multi)?kicker\b/i, 'You may pay an additional cost as you cast this spell. If you did, it has extra or stronger effects.'],
  ['Flashback', /\bflashback\b/i, 'You may cast this card from your graveyard by paying its flashback cost. Then exile it.'],
  ['Escape', /\bescape\b(?=\s*[—{])/i, 'You may cast this from your graveyard by paying its escape cost, including exiling other cards from your graveyard.'],
  ['Delve', new RegExp(AMB + 'delve\\b', 'i'), 'Each card you exile from your graveyard while casting this spell pays for {1}.'],
  ['Convoke', /\bconvoke\b/i, 'Your creatures can help cast this spell. Each creature you tap pays for {1} or one mana of that creature’s colour.'],
  ['Affinity', /\baffinity for\b/i, 'This spell costs {1} less to cast for each permanent of the stated kind you control.'],
  ['Cascade', /\bcascade\b/i, 'When you cast this spell, exile cards from the top of your library until you exile a nonland card with lesser mana value. You may cast it free. Put the rest on the bottom in random order.'],
  ['Suspend', /\bsuspend\b/i, 'Exile this card from your hand with time counters by paying its suspend cost. Remove one each upkeep; when the last is gone, cast it free (creatures gain haste).'],
  ['Storm', new RegExp(AMB + 'storm\\b', 'i'), 'When you cast this spell, copy it for each other spell cast before it this turn.'],
  ['Equip', new RegExp(AMB + 'equip\\b', 'i'), 'Pay the equip cost to attach this to a creature you control. Only at sorcery speed.'],
  ['Crew', /\bcrew \d/i, 'Tap any number of creatures with total power equal to or greater than the crew number: this Vehicle becomes an artifact creature until end of turn.'],
  ['Persist', /\bpersist\b/i, 'When this creature dies, if it had no -1/-1 counters on it, return it to the battlefield with a -1/-1 counter.'],
  ['Undying', /\bundying\b/i, 'When this creature dies, if it had no +1/+1 counters on it, return it to the battlefield with a +1/+1 counter.'],
  ['Warp', /\bwarp\b/i, 'You may cast this from your hand for its warp cost. If you do, it is exiled at the beginning of the next end step, and you may cast it from exile on a later turn.'],
  ['Evoke', /\bevoke\b/i, 'You may cast this for its evoke cost. If you do, it’s sacrificed when it enters the battlefield.'],
  ['Madness', /\bmadness\b/i, 'If you discard this card, you may cast it for its madness cost instead of putting it into your graveyard.'],
  ['Dash', /\bdash\b(?=\s*[{—])/i, 'You may cast this for its dash cost. It gains haste and returns to your hand at end of turn.'],
  ['Ninjutsu', /\bninjutsu\b/i, 'Pay the cost and return an unblocked attacker you control to hand: put this onto the battlefield tapped and attacking.'],
  ['Toxic', /\btoxic \d/i, 'Whenever this creature deals combat damage to a player, that player gets that many poison counters.'],
  ['Infect', /\binfect\b/i, 'Deals damage to creatures as -1/-1 counters and to players as poison counters.'],
  ['Changeling', /\bchangeling\b/i, 'This card is every creature type at all times.'],
  ['Scry', /\bscry \d+/i, 'Look at the top N cards of your library. Put any number on the bottom and the rest back on top in any order.'],
  ['Surveil', /\bsurveil \d+/i, 'Look at the top N cards of your library. Put any number into your graveyard and the rest back on top in any order.'],
  ['Mill', new RegExp(AMB + 'mill\\b', 'i'), 'Put the top cards of your library into your graveyard.'],
  ['Fight', new RegExp('\\bfights?\\b', 'i'), 'Each creature deals damage equal to its power to the other.'],
  ['Proliferate', /\bproliferate\b/i, 'Choose any number of permanents and/or players with counters, then give each another counter of each kind already there.'],
  ['Domain', /\bdomain\b/i, 'Counts the basic land types (Plains, Island, Swamp, Mountain, Forest) among lands you control, from 0 to 5.'],
  ['Landfall', /\blandfall\b/i, 'Triggers whenever a land enters the battlefield under your control.'],
  ['Delirium', /\bdelirium\b/i, 'Active while there are four or more card types among cards in your graveyard.'],
  ['Threshold', /\bthreshold\b/i, 'Active while you have seven or more cards in your graveyard.'],
  ['Opening-hand ability', /\bIf this card is in your opening hand, you may begin the game with it on the battlefield\b/i, 'Leyline-style: during pre-game, before turn 1, you may put this card onto the battlefield for free.'],
  ['Enters tapped', /\benters(?: the battlefield)? tapped\b/i, 'It comes onto the battlefield tapped, so you can’t tap it for mana until it untaps in your next untap step.'],
  ['Domain cost reduction', /costs? \{\d+\} less to cast for each basic land type/i, 'This spell’s cost is reduced for each different basic land type among lands you control, so it is cheaper with more land types.']
];
function findKeywords(c) {
  if (!c || c.token || !teach('keywordTips')) return [];
  const raw = cardText(c);
  if (!raw) return [];
  const text = raw.replace(selfNameRe(c.name), '~');
  const found = [];
  for (const [name, re, tip] of KEYWORDS) { const m = re.exec(text); if (m) found.push({ name, tip, re }); }
  return found;
}
// Text with keywords underlined; hovering shows the tooltip.
function keywordText(c, raw) {
  const kws = findKeywords(c);
  const frag = document.createDocumentFragment();
  if (!kws.length) { frag.append(symbols(raw)); return frag; }
  const spans = [];
  for (const k of kws) {
    const re = new RegExp(k.re.source, 'gi');
    let m;
    while ((m = re.exec(raw))) { if (!m[0]) { re.lastIndex++; continue; } spans.push({ s: m.index, e: m.index + m[0].length, k }); }
  }
  spans.sort((a, b) => a.s - b.s || b.e - a.e);
  let pos = 0;
  for (const sp of spans) {
    if (sp.s < pos) continue;
    if (sp.s > pos) frag.append(symbols(raw.slice(pos, sp.s)));
    frag.append(h('span', { class: 'kw', 'data-kw': sp.k.name, 'data-tip': sp.k.tip }, raw.slice(sp.s, sp.e)));
    pos = sp.e;
  }
  if (pos < raw.length) frag.append(symbols(raw.slice(pos)));
  return frag;
}

// ---- small keyword icons (v0.48): drawn as inline SVG so they cost almost no space on a card
const KW_ICON = {
  'flying': '<path d="M12 14C9 8 5 6 2 7c2 3 3 5 5 6-2 0-3 1-4 3 4 0 7-1 9-2zM12 14c3-6 7-8 10-7-2 3-3 5-5 6 2 0 3 1 4 3-4 0-7-1-9-2z" fill="currentColor" stroke="none"/>',
  'first strike': '<path d="M5 19 19 5M14 5h5v5M7 14l3 3M4 20l3-3"/>',
  'double strike': '<path d="M4 4l11 11M20 4 9 15M13 17l3 3M11 17l-3 3"/>',
  'deathtouch': '<path d="M12 3a7 7 0 0 0-7 7c0 2.5 1.2 4 3 5v3h8v-3c1.8-1 3-2.5 3-5a7 7 0 0 0-7-7z"/><circle cx="9.5" cy="11" r="1.5" fill="currentColor"/><circle cx="14.5" cy="11" r="1.5" fill="currentColor"/>',
  'haste': '<path d="M13 2 5 14h6l-1 8 8-12h-6z" fill="currentColor"/>',
  'hexproof': '<path d="M12 2 6.5 17h11z" fill="currentColor" fill-opacity=".35"/><path d="M3 19.5c3.5 2 14.500 2 18 0M9.500 11l5 .5"/><circle cx="12" cy="8" r="1" fill="currentColor"/>',
  'indestructible': '<path d="M12 3l8 3v6c0 5-3.500 8-8 9-4.500-1-8-4-8-9V6z"/>',
  'lifelink': '<path d="M12 21s-8-5-8-11a4.500 4.500 0 0 1 8-2.500A4.500 4.500 0 0 1 20 10c0 6-8 11-8 11z" fill="currentColor" fill-opacity=".4"/>',
  'menace': '<circle cx="8" cy="7.500" r="2.500"/><circle cx="16" cy="7.500" r="2.500"/><path d="M3.500 20c0-4 2-6 4.500-6s4.500 2 4.500 6M11.500 20c0-4 2-6 4.500-6s4.500 2 4.500 6"/>',
  'reach': '<path d="M12 21V4M6 10l6-6 6 6"/>',
  'trample': '<ellipse cx="12" cy="16" rx="5" ry="4.500" fill="currentColor" fill-opacity=".4"/><circle cx="6" cy="9" r="1.700"/><circle cx="10" cy="6" r="1.700"/><circle cx="14.500" cy="6" r="1.700"/><circle cx="18.500" cy="9" r="1.700"/>',
  'vigilance': '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3" fill="currentColor"/>',
  'defender': '<path d="M3 6h18v12H3zM3 12h18M9 6v6M15 12v6"/>'
};
function kwIconEl(kw, extra) {
  const k = String(kw).toLowerCase(), body = KW_ICON[k]; if (!body) return null;
  const e = h('span', { class: 'kwi' + (extra ? ' ' + extra : ''), 'data-kwi': k });
  e.innerHTML = `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  return e;
}
function kwIconsOnTile(c) {
  if (!teach('keywordIcons') || !state || c.token || permZone(c) !== 'creatures') return null;
  const g = grantedKeywords(c).filter(x => KW_ICON[x.kw]); if (!g.length) return null;
  return h('div', { class: 'kwicons' }, ...g.map(x => { const i = kwIconEl(x.kw); i.title = `${x.kw[0].toUpperCase() + x.kw.slice(1)} (from ${x.from})`; return i; }));
}
function activeKeywordsRow(c) {
  if (!teach('keywordIcons') || !state || !c || c.token || !onBattlefield(c) || permZone(c) !== 'creatures') return null;
  const act = GRANTABLE.filter(k => hasKw(c, k)); if (!act.length) return null;
  const granted = new Map(grantedKeywords(c).map(x => [x.kw, x.from]));
  return h('div', { class: 'kwrow kwactive' }, h('span', { class: 'kwlabel', text: 'Active now' }),
    ...act.map(k => h('span', { class: 'kwchip on', 'data-kw': k, 'data-tip': granted.has(k) ? `Granted by ${granted.get(k)}` : 'Printed on the card' }, ...[kwIconEl(k), k[0].toUpperCase() + k.slice(1) + (granted.has(k) ? ' *' : '')].filter(Boolean))));
}
function keywordChips(c) {
  const kws = findKeywords(c);
  if (!kws.length) return null;
  return h('div', { class: 'kwrow' }, h('span', { class: 'kwlabel', text: 'Keywords' }),
    ...kws.map(k => { const kn = k.name.toLowerCase(), live = state && onBattlefield(c) && GRANTABLE.includes(kn); const on = live && hasKw(c, kn);
      return h('span', { class: 'kwchip' + (live ? (on ? ' on' : ' off') : ''), 'data-kw': k.name, 'data-tip': k.tip + (live ? (on ? ' (active on this creature right now)' : ' (not active right now)') : ''), text: '' }, ...[kwIconEl(kn), (live && on ? '\u2713 ' : '') + k.name].filter(Boolean)); }));
}
function setupKeywordTips() {
  const tip = h('div', { id: 'kwTip', hidden: true });
  document.body.append(tip);
  const hide = () => { tip.hidden = true; };
  document.addEventListener('mouseover', e => {
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (!t) return hide();
    tip.replaceChildren(h('div', { class: 'kwname', text: t.dataset.kw || '' }), h('div', { text: t.dataset.tip }));
    tip.hidden = false;
    const r = t.getBoundingClientRect(), w = tip.offsetWidth, hh = tip.offsetHeight;
    let x = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2));
    let y = r.top - hh - 8; if (y < 8) y = r.bottom + 8;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  });
  document.addEventListener('scroll', hide, true);
}

function sickNote(c) { return state && teach('summoningSick') && state.battlefield.some(x => x.id === c.id) && isSick(c) ? h('div', { class: 'sicknote', text: SICK_TEXT }) : null; }
// The enlarged preview stays interactive (click to flip, hover keyword chips): it only swaps to another card after the pointer rests on it
// briefly, so crossing other cards on the way to the right column no longer replaces it, and it never changes while the pointer is on it.
let previewTimer = 0, previewHold = false, previewWired = false;
function showPreview(c) {
  if (!previewWired) { const b = $('#preview'); if (b) { previewWired = true; b.addEventListener('mouseenter', () => { previewHold = true; clearTimeout(previewTimer); }); b.addEventListener('mouseleave', () => { previewHold = false; }); } }
  if (previewHold) return;
  clearTimeout(previewTimer); previewTimer = setTimeout(() => { if (!previewHold) showPreviewNow(c); }, 170);
}
function showPreviewNow(c) {
  const box = $('#preview');
  const im = cardArt(c);
  if (im) {
    let side = 0;
    const img = h('img', { class: 'pimg', src: im.front, alt: c.name });
    if (im.back) img.title = 'Click to flip';
    img.addEventListener('click', () => { if (im.back) { side ^= 1; img.src = side ? im.back : im.front; } });
    img.addEventListener('error', () => showPreviewText(c));
    const ec = effectiveCost(c);
    const pr = state && !c.token && onBattlefield(c) && permZone(c) === 'creatures' ? ptCalc(c) : null;
    const wrap = h('div', { class: 'pwrap' + (isFoil(c) ? ' foil' : '') }, img, isFoil(c) ? foilEl() : null, pr && ptDelta(pr) ? ptOverlay(c, pr) : null);
    box.replaceChildren(...[h('div', { class: 'pslot' }, wrap), sickNote(c), staticNote(c), activeKeywordsRow(c), keywordChips(c), ec.reduced ? h('div', { class: 'costnote' }, 'Costs now ', ec.cost ? symbols(ec.cost) : '0', ` (${ec.why})`) : null, im.back ? h('div', { class: 'muted small', text: 'Click the card to flip it.' }) : null].filter(Boolean));
    return;
  }
  showPreviewText(c);
}

function showPreviewText(c) {
  const box = $('#preview');
  const info = c.token ? null : cardInfo(c.name);
  box.replaceChildren(...[
    h('div', { class: 'pname' }, c.name, ' ', info && info.mc ? symbols(info.mc) : ''),
    sickNote(c),
    staticNote(c),
    (() => { const ec = c.token ? null : effectiveCost(c); return ec && ec.reduced ? h('div', { class: 'costnote' }, 'Costs now ', ec.cost ? symbols(ec.cost) : '0', ` (${ec.why})`) : null; })(),
    h('div', { class: 'ptype', text: c.token ? 'Token' : info ? info.t : '(no card data)' }),
    info && info.tx ? h('div', { class: 'ptext' }, keywordText(c, info.tx)) : null,
    activeKeywordsRow(c),
    keywordChips(c),
    (c.token ? c.tk.pt : info && info.pt) ? h('div', { class: 'ppt', text: state && state.battlefield.some(x => x.id === c.id) && permZone(c) === 'creatures' ? ptText(c) : (c.token ? c.tk.pt : info.pt) }) : null
  ].filter(Boolean));
}

function permZone(c) {
  if ((c.becomes && c.becomes.types.includes('creature')) || selfBecomes(c)) return 'creatures';
  if (c.token) return c.tk && c.tk.pt ? 'creatures' : 'noncreature';
  if (state && state.battlefield.includes(c) && stationPT(c)) return 'creatures';   // v0.99.75 CR 721.2: a Spacecraft at its station P/T threshold is an artifact creature (laid out, attacks and blocks as one)
  const info = cardInfo(c.name);
  if (isLandName(c.name)) return 'lands';
  if (!info) return 'creatures';
  const front = info.t.split(' // ')[0];
  return /\bCreature\b/.test(front) ? 'creatures' : 'noncreature';
}

function renderPileTop(zone) {
  const el = $('#top-' + zone); if (!el) return;
  const arr = state ? (state[zone] || []) : [];
  el.className = 'stacktop' + (arr.length ? '' : ' empty');
  el.replaceChildren();
  if (!arr.length) return;
  const c = arr[arr.length - 1];
  el.onmouseenter = () => { const a = state && state[zone]; if (a && a.length) showPreview(a[a.length - 1]); };   // hover a pile: its top card (the commander, for the command zone) in the large card display
  if (layoutOn('gyFan')) {   // v0.78: graveyard AND exile, spread only while hovered
    arr.slice(-3, -1).forEach((b, i, a) => { const k = a.length - i;   // k = 2 (deepest) or 1
      const bi = cardArt(b);
      el.append(h('div', { class: 'fanbehind fb' + k }, bi ? h('img', { src: bi.front, alt: b.name, draggable: 'false' }) : h('div', { class: 'mini' }, h('b', { text: b.name })))); });
  }
  const im = cardArt(c);
  if (im) {
    const img = h('img', { src: im.front, alt: c.name, draggable: 'false' });
    img.addEventListener('error', () => img.replaceWith(h('div', { class: 'mini' }, h('b', { text: c.name }))));
    el.append(img);
  } else el.append(h('div', { class: 'mini' }, h('b', { text: c.name }), h('span', { class: 'muted', text: c.token ? 'Token' : (cardInfo(c.name) || {}).t || '' })));
}

function cardTypesInGraveyard() {
  const counts = new Map();
  if (!state) return counts;
  for (const c of state.graveyard) {
    const info = cardInfo(c.name);
    const typeLine = info && info.t ? info.t : '';
    const faces = typeLine.split(' // ');
    const types = new Set();
    for (const face of faces) {
      const main = face.split('—')[0].trim();
      for (const t of ['Artifact','Battle','Creature','Enchantment','Instant','Land','Planeswalker','Sorcery','Kindred','Tribal']) {
        if (new RegExp(`\\b${t}\\b`, 'i').test(main)) types.add(t);
      }
    }
    for (const t of types) counts.set(t, (counts.get(t) || 0) + 1);
  }
  return counts;
}

function deliriumSummary() {
  const counts = cardTypesInGraveyard();
  const types = [...counts.keys()].sort((a,b) => a.localeCompare(b));
  return { total: types.length, counts, types };
}

// v0.96.11 the floating hand may only overlap the very bottom edge of the mat: everything above that is reserved, so no battlefield card
// (second rows especially) is ever hidden behind the hand. The zones are measured after this and their cards shrink to fit.
function reserveHandSpace() {
  const stage = $('#stage'), hc = $('#row-hand'); if (!stage || !hc) return;
  const card = hc.querySelector('.card'), h = card ? card.offsetHeight : 0;
  const cover = h ? Math.round(h * 0.82) + 8 : 0;
  stage.style.setProperty('--handcover', cover + 'px');
  { const hw = $('#handWrap'); if (hw) stage.style.setProperty('--hand-h', hw.offsetHeight + 'px'); }   // v0.99.69 upright phones keep the whole hand clear of the table
  document.documentElement.style.setProperty('--handcover-root', (h ? h + 28 : 0) + 'px');   // v0.96.14 pop-ups centre in the space ABOVE the hand
}
function fitBattlefieldCards() {
  try { reserveHandSpace(); } catch (e) { /* layout only */ }
  // v0.99.69 upright phones: each zone's share of the height follows how many cards it holds (an empty zone stays small, a busy one grows)
  try { const mat = $('#mat'); if (mat && document.documentElement.classList.contains('portrait-ui') && state) {
    const n = { creatures: 0, noncreature: 0, lands: 0 }; for (const c of state.battlefield) { const z = permZone(c); if (z in n) n[z]++; }
    // v0.99.78 an empty zone shrinks to its label, so the zones with cards get the height (and their cards grow into it)
    const w = k => Math.max(0.55, Math.min(3, 0.45 + Math.sqrt(n[k]) * 0.42)).toFixed(2), row = k => n[k] ? `minmax(0, ${w(k)}fr)` : 'minmax(34px, 0.12fr)';
    // v0.99.83 creatures come first: their row gets about twice the share it used to, the lands-and-permanents row a little less, and the
    // deck/graveyard/exile row is lower, so creatures are drawn large on an upright phone
    const nb = n.noncreature + n.lands, bot = nb ? `minmax(0, ${(Math.max(0.55, Math.min(3, 0.45 + Math.sqrt(nb) * 0.42)) * 0.8).toFixed(2)}fr)` : 'minmax(34px, 0.12fr)';   // v0.99.81 lands and the other permanents share one row
    const cre = n.creatures ? `minmax(0, ${(Math.max(1, Math.min(3, 0.45 + Math.sqrt(n.creatures) * 0.42)) * 1.9).toFixed(2)}fr)` : row('creatures');
    mat.style.setProperty('grid-template-rows', `74px ${cre} auto ${bot}`, 'important');
  } else if (mat) mat.style.removeProperty('grid-template-rows'); } catch (e) { /* layout only */ }
  // v0.99.78 side by side (desktop, tablets, sideways phones): lands and artifacts/enchantments share the row by how many cards each holds,
  // so a big mana base gets the width and an empty zone shrinks to its label (and the other way round)
  // v0.99.81 one zone: lands on the left, artifacts/enchantments/planeswalkers on the right, on every screen. The split follows how many cards
  // each side holds. The weights are scaled to add up to 2: fr tracks that add up to less than 1 leave part of the row empty (CSS Grid 7.2.4),
  // which is what left half of a wide window blank.
  try { const mat = $('#mat'), zl = $('#zone-lands'), zn = $('#zone-noncreature');
    if (mat && zl && zn && state) {
      mat.style.removeProperty('grid-template-columns'); const cols = getComputedStyle(mat).gridTemplateColumns.split(' ').filter(Boolean), port = document.documentElement.classList.contains('portrait-ui');
      if ((cols.length === 3 || (port && cols.length === 2)) && Math.abs(zl.offsetTop - zn.offsetTop) < 4) {
        const n = { lands: 0, noncreature: 0 }; for (const c of state.battlefield) { const z = permZone(c); if (z in n) n[z]++; }
        const raw = k => n[k] ? 0.6 + Math.sqrt(n[k]) * 0.45 : 0.3, sum = raw('lands') + raw('noncreature'), mn = port ? 72 : 150;
        const w = k => `minmax(${n[k] ? 0 : mn}px, ${(raw(k) / sum * 2).toFixed(3)}fr)`;
        const landsFirst = zl.offsetLeft < zn.offsetLeft, pair = landsFirst ? `${w('lands')} ${w('noncreature')}` : `${w('noncreature')} ${w('lands')}`;
        mat.style.setProperty('grid-template-columns', cols.length === 3 ? `${pair} ${cols[2]}` : pair, 'important');
      } } } catch (e) { /* layout only */ }
  const specs = [
    { id: 'row-creatures', wrap: true },
    { id: 'row-noncreature', wrap: true },
    { id: 'row-lands', wrap: true }
  ];
  const img = document.body.classList.contains('imgmode');   // picture cards are taller (100x140) than text tiles (112x84)
  const baseW = (img ? 100 : 112) * (settings.bfs || 1);
  const baseH = (img ? 140 : 84) * (settings.bfs || 1);
  const gap = 8;
  const minScale = 0.34;   // v0.96.11 a crowded board may shrink further so every card stays visible

  for (const spec of specs) {
    const row = $('#' + spec.id);
    if (!row) continue;
    const zone = row.parentElement;
    const count = row.children.length;
    if (!count || !zone) {
      row.style.setProperty('--zone-scale', '1'); row.style.maxWidth = '';
      continue;
    }

    const availW = Math.max(1, zone.clientWidth - 20);
    const lab = zone.querySelector('.zlabel, .zone-label, h3, .zhead'); const labH = lab ? lab.offsetHeight + 14 : 34;   // v0.99.78 only the label's own height is held back
    const availH = Math.max(1, zone.clientHeight - Math.max(30, labH) - 8);   // v0.96.20 a few px of margin so a borderline fit cannot flip between two layouts
    let scale = 1, usedCols = 0;
    if (spec.id === 'row-creatures' && zone.classList.contains('combat-on')) {   // combat (v0.69.3): a single row, non-attackers overlapped to the side
      const na = row.querySelectorAll('.card.attacking').length, no = row.querySelectorAll('.card:not(.attacking)').length;
      const need = na * (baseW + gap) + no * (baseW * 0.54 + gap) + 24;
      row.style.setProperty('--zone-scale', String(Math.max(minScale, Math.min(1, availW / need)))); continue;
    }

    if (spec.wrap) {
      // Choose a sensible number of columns, then shrink enough to fit both
      // dimensions. This keeps the creature zone fixed while dense boards
      // become progressively more compact.
      const idealCols = Math.max(1, Math.ceil(Math.sqrt((count * availW * baseH) / Math.max(availH * baseW, 1))));
      const cols = Math.min(count, idealCols);
      const rows = Math.ceil(count / cols); usedCols = cols;
      scale = Math.min(
        document.documentElement.classList.contains('portrait-ui') ? 1.9 : (window.matchMedia && matchMedia('(pointer: coarse)').matches ? 1.5 : 1),   // v0.99.78 phones and tablets (upright or sideways): cards grow into the room they have
        (availW - Math.max(0, cols - 1) * gap) / (cols * baseW),
        (availH - Math.max(0, rows - 1) * gap) / (rows * baseH)
      );
    } else {
      // Lands and noncreatures are intentionally a single row: shrink the
      // cards rather than making the zone wider or adding a horizontal scroll.
      scale = Math.min(1, (availW - Math.max(0, count - 1) * gap) / (count * baseW));
    }

    scale = Math.max(minScale, scale);
    // v0.96.23 Fit by measuring, not only by arithmetic: lay the row out, and if any card sits outside the zone, shrink everything a little and look again (smaller cards also fit more per row).
    const place = sc => {
      row.style.setProperty('--zone-scale', String(sc));
      if (spec.id !== 'row-creatures') {   // v0.96.28 measure the REAL card widths (a tapped card is turned sideways and a stack of copies is wider), so a row only wraps when it truly cannot fit on one line
      row.style.maxWidth = '';
      const kids = [...row.children], wmax = Math.max(1, ...kids.map(k => k.offsetWidth)), total = kids.reduce((t, k) => t + k.offsetWidth, 0) + Math.max(0, kids.length - 1) * gap + 3;
      if (total > availW) { const cols = Math.max(1, Math.floor((availW + gap) / (wmax + gap))); row.style.maxWidth = Math.ceil(cols * wmax + (cols - 1) * gap + 3) + 'px'; } }
    };
    const spills = () => {   // offset* ignores the floating/tilting transforms, so a card that merely bobs does not count
      const lim = zone.clientHeight - 6, limW = zone.clientWidth - 6;
      for (const k of row.children) { if (k.offsetTop + k.offsetHeight > lim || k.offsetLeft + k.offsetWidth > limW) return true; }
      return false;
    };
    place(scale);
    for (let g = 0; g < 16 && scale > minScale && spills(); g++) { scale = Math.max(minScale, scale * 0.94); place(scale); }
  }
}

function layoutHand() {
  const row = $('#row-hand'), cards = [...row.children], hw = $('#handWrap');
  for (const c of cards) c.style.marginLeft = '';
  // Opening hand / mulligan: size the cards so the WHOLE hand fits on screen (width and height), whatever the window size
  if (document.body.classList.contains('mullhand')) {
    // v0.99.36 The large hand is only for the Keep / Mulligan decision (so the whole hand can be read); from Keep on it is the normal hand.
    // Sized for seven cards in this window, then shrunk only while a resting card would leave the table or cover the prompt.
    const img = document.body.classList.contains('imgmode'), ratio = img ? 1.4 : 0.785, n = Math.max(cards.length, 7);
    const aw = Math.max(hw.parentElement ? hw.parentElement.clientWidth : innerWidth, 300) - 70;
    let cw = Math.floor(Math.max(90, Math.min(176, aw / (1 + (n - 1) * 0.62), (innerHeight * 0.3) / ratio)));
    const box = ($('#mat') || $('#stage') || document.body).getBoundingClientRect(), pad = 6;
    const settled = c => { if (c.matches(':hover')) return false; try { return !c.getAnimations({ subtree: true }).some(a => a.playState === 'running' && a.effect && a.effect.getTiming().iterations !== Infinity); } catch (e) { return true; } };   // cards still being dealt are not where they will rest
    for (let g = 0; g < 14; g++) {
      hw.style.setProperty('--cw', cw + 'px'); hw.style.setProperty('--ch', Math.round(cw * ratio) + 'px');
      spreadHand(row, cards);
      { // v0.99.36 up and centred: the prompt and the hand sit together in the middle of the table (the hand used to rest on its bottom edge)
        const pc0 = $('#overlay:not([hidden]) .pcard'), ph = pc0 ? pc0.offsetHeight : 0, hh = row.getBoundingClientRect().height + 30;
        const lift = Math.max(14, Math.round((box.height - (ph + 24 + hh)) / 2));
        hw.style.paddingBottom = lift + 'px'; }
      { const rr = row.getBoundingClientRect(), st = $('#stage'); if (st && rr.height) st.style.setProperty('--openhand', Math.max(0, Math.round(box.bottom - rr.top)) + 'px'); }   // the prompt is centred in the space above the hand
      const pc = $('#overlay:not([hidden]) .pcard'), pr = pc && pc.getBoundingClientRect(), top = pc && pc.offsetHeight ? (pr.top + pr.bottom) / 2 + pc.offsetHeight / 2 + 10 : -Infinity;   // the prompt's real size (it is drawn scaled while it fades in)
      const out = cards.filter(settled).some(c => { const r = c.getBoundingClientRect(); return r.left < box.left + pad || r.right > box.right - pad || r.bottom > box.bottom - 2 || r.top < top; });
      if (!out || cw <= 90) break;
      cw = Math.max(90, Math.floor(cw * 0.93));
    }
    return;
  } else { hw.style.removeProperty('--cw'); hw.style.removeProperty('--ch'); hw.style.paddingBottom = ''; }
  spreadHand(row, cards);
}

// Overlap the hand cards when they do not fit side by side.
function spreadHand(row, cards) {
  for (const c of cards) c.style.marginLeft = '';
  row.classList.remove('pfan');
  if (cards.length < 2) return;
  // v0.99.58 upright phones: the hand is held like real cards, fanned from one point below the screen, so the top of every card shows
  if (document.documentElement.classList.contains('portrait-ui') && !document.body.classList.contains('mullhand')) {
    const n = cards.length, cw0 = cards[0].offsetWidth, ch0 = cards[0].offsetHeight; if (!cw0 || !ch0) return;
    const R = 2.3 * ch0, W = Math.max(200, $('#handWrap').clientWidth - 20);
    const tmax = Math.min(Math.asin(Math.max(0, Math.min(1, (W - cw0) / (2 * R)))) * 180 / Math.PI, 7 * (n - 1));
    row.classList.add('fan', 'pfan');
    cards.forEach((c, i) => { if (i) c.style.marginLeft = (-cw0) + 'px'; const t = n > 1 ? (i / (n - 1)) * 2 - 1 : 0; c.style.setProperty('--fan-rot', (t * tmax).toFixed(2) + 'deg'); c.style.setProperty('--fan-y', '0px'); });
    return;
  }
  const avail = $('#handWrap').clientWidth - 70, cw = cards[0].offsetWidth;
  if (!cw) return;
  const need = cards.length * cw + (cards.length - 1) * 8;
  if (need <= avail) return;
  const step = (avail - cw) / (cards.length - 1);
  for (let i = 1; i < cards.length; i++) cards[i].style.marginLeft = (step - cw) + 'px';
}

function renderManaPool() {
  const el=$('#manaPool');
  if(!el) return;
  const p=state&&state.manaPool?state.manaPool:{};
  const chips=[];
  for(const k of ['W','U','B','R','G','C']) if((p[k]||0)>0) chips.push(h('span',{class:`mana-chip ${k}`,text:`${p[k]}${k}`,title:`${p[k]} ${k} mana`}));
  el.replaceChildren(...(chips.length?chips:[h('span',{class:'mana-empty',text:'—'})]));
}

// v0.96.16 Redraws are cheap now: (1) values that depend only on the board (cost reductions, land-type effects) are worked out once per redraw, and
// (2) the layout steps that force the browser to re-measure the page (fit cards to zones, spread the hand, place the strip) run ONCE per frame instead of once per redraw.
let renderCache = null, layoutQueued = false;
function renderMemo(key, fn) { if (!renderCache) return fn(); if (renderCache.has(key)) return renderCache.get(key); const v = fn(); renderCache.set(key, v); return v; }
function render() { try { newGameCue(); libraryNotesTick(); } catch (e) {} const prev = renderCache; renderCache = new Map(); try { renderInner(); } finally { renderCache = prev; } try { mpQueueSnap(); } catch (e) { /* multiplayer sync only */ } try { autoResumeTurn(); } catch (e) { /* turn flow only */ } try { drawPuzzleBar(); } catch (e) { /* puzzle bar only */ } try { practiceHud(); } catch (e) { /* label only */ } }
function layoutPass() {
  layoutQueued = false;
  try { const sb = $('#stackBox'); stackBoxShown = !!(sb && sb.offsetParent); } catch (e) { /* layout only */ }
  try { fitBattlefieldCards(); } catch (e) { /* layout only */ }
  try { layoutHand(); } catch (e) { /* layout only */ }
  try { fitStackStage(); } catch (e) { /* layout only */ }
  try { placeBoardStrip(); } catch (e) { /* layout only */ }
  try { const lg = $('#log'); if (lg) lg.scrollTop = lg.scrollHeight; } catch (e) { /* layout only */ }   // reading scrollHeight forces a re-measure: once per frame, not once per redraw
  try { animApply(); } catch (e) { console.error(e); }
}
function scheduleLayout() { if (layoutQueued) return; layoutQueued = true; requestAnimationFrame(layoutPass); }
function renderInner() {
  if (state) { healHalves(); if (state.halfChosen) setTimeout(checkHalfAbandon, 80); }
  if (state && state.sagaWait && state.sagaWait.length) setTimeout(() => { try { sagaCheck(); } catch (e) { console.error(e); } }, 0);
  animCapture();
  runToughnessSBA(); try { dungeonSBA(); } catch (e) { console.error(e); }
  document.body.classList.toggle('responding', !!state && state.phase === 'play' && state.stack.length > 0);
  document.body.classList.toggle('imgmode', showImages && (IMG.size > 0 || CUSTOM.size > 0));
  document.body.classList.toggle('castflight', castFlightOn()); document.body.classList.toggle('hand3d', animOn('hand3d')); document.body.classList.toggle('bffloat', animOn('bfFloat')); document.body.classList.toggle('handfloat', animOn('handFloat'));
  document.body.classList.toggle('blocked', isBlocked());
  renderTop();
  const has = !!state;
  $('#turnNum').textContent = has && state.turn ? state.turn : '–';
  { const fb = $('#btnFx'); if (fb) { const n = has ? (state.fx || []).length : 0; fb.hidden = !n; fb.textContent = `\u23F3 Effects ${n}`; } }
  lifeFx('you', $('#lifeNum'), has ? state.life : 20);
  lifeFx('opp', $('#oppNum'), has ? (state.oppLife ?? 20) : 20);
  $('#oppBox').title = has && state.dmgHistory && state.dmgHistory.length ? 'Combat damage dealt so far: ' + state.dmgHistory.map(d => `turn ${d.turn}: ${d.dmg}`).join(', ') : 'Goldfish opponent life. Combat damage from your attackers is subtracted automatically.';
  const cbt = $('#btnCombat'); if (cbt) cbt.hidden = !(has && state.phase === 'play' && STEPS[state.step].id === 'attack' && !state.phasePause && !(state.combat && state.combat.declared));
  renderManaPool(); drawStateIcons(); try { drawDungeonBox(); } catch (e) { console.error(e); }
  for (const z of ['library', 'graveyard', 'exile', 'command']) { const n = has ? (state[z] || []).length : 0; const pc = $('#pcnt-' + z); if (!pc) continue; pc.textContent = n; pc.classList.toggle('zero', !n); }
  { const tb = $('#btnTokens'); if (tb) { const n = has ? deckTokenDefs().filter(d => !d.amassOnly || true).length : 0; tb.hidden = !n; $('#cnt-tokens').textContent = n; } }
  { const n = has ? state.library.length : 0; const ls = $('#libstack'); ls.dataset.thick = n > 40 ? 3 : n > 15 ? 2 : n > 0 ? 1 : 0; ls.title = teach('libraryMenu') ? 'Click for draw, look, scry, surveil, mill, search' : ''; }
  $('#cnt-hand').textContent = has ? `(${state.hand.length})` : '';
  $('#btnHandKey')?.classList.toggle('hidden', !teach('playability'));
  for (const z of ['graveyard', 'exile', 'command']) renderPileTop(z);
  try { commanderRender(); } catch (e) { /* commander UI only */ }
  $('#libstack').classList.toggle('empty', !has || !state.library.length);
  if (has) renderTopReveal(); else { const lt = $('#libTop'); if (lt) lt.remove(); }

  const rows = { creatures: $('#row-creatures'), noncreature: $('#row-noncreature'), lands: $('#row-lands') };
  const hand = $('#row-hand');
  for (const r of Object.values(rows)) r.replaceChildren();
  hand.replaceChildren();
  const counts = { creatures: 0, noncreature: 0, lands: 0 };
  if (has) {
    const atk = new Set((state.combat && state.combat.declared && state.combat.attackers || []).map(a => a.id ?? a));
    const lane = layoutOn('combatLane') && atk.size > 0;
    const brows = battlefieldRows(state.battlefield);
    const onBf = new Set(state.battlefield.map(x => x.id)), attMap = new Map();   // v0.99.21 an Aura or Equipment is drawn in the stack under what it is attached to
    for (const x of state.battlefield) if (x.att && onBf.has(x.att)) { if (!attMap.has(x.att)) attMap.set(x.att, []); attMap.get(x.att).push(x); }
    for (const z of ['creatures', 'noncreature', 'lands']) for (const g of brows[z]) {
      if (g.cards.length === 1 && g.cards[0].att && onBf.has(g.cards[0].att)) { counts[z]++; continue; }   // drawn with its host below
      if (g.pile && g.cards.length > 1) {   // v0.99.12 land pile: a cascade where every land's name strip stays readable (the deck-view layout)
        const n = g.cards.length, tapped = g.cards[0].tapped, f = n <= 8 ? 1 : Math.max(.35, 7 / (n - 1));
        const el = h('div', { class: 'landpile' + (tapped ? ' tappile' : ''), style: `--n:${n};--f:${f}`, title: `${n} lands: ${g.cap}` });
        g.cards.forEach((c, i) => { counts[z]++; const e = cardEl(c, 'battlefield'); e.style.setProperty('--i', String(i)); if (!c.tapped) e.style.zIndex = String(i + 1); el.append(e); });
        el.append(h('span', { class: 'pilecount', text: '\u00d7' + n }), h('span', { class: 'pilecap', text: g.cap }));
        rows[z].append(el); continue;
      }
      const open = g.key && expandedGroups.has(g.key);
      const mixed = z === 'lands' && layV('mix') && g.cards.length > 1 && !open, tapN = g.cards.filter(x => x.tapped).length;
      const shown = g.cards.length > 1 && !open ? [mixed ? ([...g.cards].reverse().find(x => !x.tapped) || g.cards[g.cards.length - 1]) : g.cards[g.cards.length - 1]] : g.cards;
      shown.forEach((c, i) => {
        counts[z]++; const e = cardEl(c, 'battlefield');
        if (g.bundle) e.classList.add('bundle', 'bt' + g.bundle);
        if (g.cards.length > 1 && !open) { e.classList.add('stackgrp'); counts[z] += g.cards.length - 1; e.dataset.stack = String(g.cards.length); e.style.setProperty('--sg', String(Math.min(3, g.cards.length - 1)));
          { const nl = Math.min(4, g.cards.length - 1), im0 = cardArt(c), im1 = im0;
            for (let k = nl; k >= 1; k--) e.prepend(h('div', { class: 'sgl', style: `--k:${k};--n:${nl}` }, im1 ? h('img', { src: im1.front, alt: '', draggable: 'false' }) : h('div', { class: 'mini' }, h('b', { text: c.name })))); }
          e.append(h('button', { class: 'grpbadge', title: `${g.cards.length} identical cards${mixed && tapN ? ` (${tapN} tapped)` : ''}. Click to spread them out.`, onclick: ev => { ev.stopPropagation(); expandedGroups.add(g.key); render(); } }, '×' + g.cards.length), mixed && tapN ? h('span', { class: 'grptap', text: tapN + ' tapped', title: `${tapN} of these ${g.cards.length} are tapped` }) : null); }
        else if (g.cards.length > 1 && i === 0) e.append(h('button', { class: 'grpbadge open', text: '▾' + g.cards.length, title: 'Click to pile these cards up again.', onclick: ev => { ev.stopPropagation(); expandedGroups.delete(g.key); render(); } }));
        if (layoutOn('dimIdle') && ((z === 'lands' && (mixed ? tapN === g.cards.length : c.tapped)) || (z === 'creatures' && isSick(c) && !c.tapped))) e.classList.add('idle');
        if (lane && z === 'creatures' && !atk.has(c.id) && !rows[z].querySelector('.first-idle')) e.classList.add('first-idle');
        if (lane && z === 'creatures' && atk.has(c.id)) { e.classList.add('attacking'); if (!rows[z].querySelector('.lanebreak')) rows[z].append(h('div', { class: 'lanebreak' })); }
        { const ats = attMap.get(c.id);
          if (ats && ats.length && g.cards.length === 1) {
            const n = ats.length + 1, el = h('div', { class: 'landpile attstack' + (c.tapped ? ' hosttap' : ''), style: `--n:${n};--f:${n <= 8 ? 1 : Math.max(.35, 7 / (n - 1))}`, title: `${c.name} with ${ats.map(a => a.name).join(', ')}` });
            ats.forEach((a, i) => { const ae = cardEl(a, 'battlefield'); ae.style.setProperty('--i', String(i)); ae.style.zIndex = String(i + 1); el.append(ae); });
            e.style.setProperty('--i', String(ats.length)); e.style.zIndex = String(n); el.append(e); rows[z].append(el); return;
          } }
        rows[z].append(e);
      });
    }
    $('#zone-creatures').classList.toggle('combat-on', lane);
    for (const c of state.hand) hand.append(cardEl(c, 'hand'));
  }
  applyLayout();
  document.body.classList.toggle('l-strip', layoutOn('boardStrip')); document.body.classList.toggle('l-depth', layoutOn('zoneDepth')); document.body.classList.toggle('l-fangy', layoutOn('gyFan'));
  $('#zc-creatures').textContent = counts.creatures ? `(${counts.creatures})` : '';
  $('#zc-lands').textContent = (counts.lands ? `(${counts.lands})` : '') + (has && state.phase === 'play' ? (counts.lands ? ' · ' : '') + (landDropUsed() ? 'land drop used' : 'land drop ready') : '');   // v0.90.2 moved here from the turn bar
  scheduleLayout();
  try { renderEmblems(); } catch (e) { /* display only */ }
  applyFan();
  $('#phases')?.classList.toggle('hidden', !teach('phaseBar') || (layoutOn('boardStrip') && !!state && state.phase === 'play'));
  renderPhaseBar(); phaseFlash(); drawBoardStrip(); drawStackStage(); drawHandPickBar();
  if (state && (state.resolving || state.resolvingAb) && state.resolvingWait && !state.discarding && !handPick) setTimeout(() => { try { finishResolving(); finishAbilityResolving(); } catch (e) { /* ignore */ } }, 0);
  renderOverlay();
  const logEl = $('#log');
  logEl.replaceChildren();
  const logOpen = lsGet('mtgpt.logopen', '0') === '1';
  { const lb = $('#logBox'); if (lb) { lb.classList.toggle('collapsed', !logOpen); const t = $('#btnLogToggle'); if (t) t.textContent = logOpen ? 'Show less ▴' : 'Show all ▾'; } }
  if (has) for (const line of state.log.slice(logOpen ? -120 : -2)) logEl.append(h('div', { text: line }));
  if (stackPanelVisible()) { ensureStackPanel(); stackPanelDraw(); }
  scheduleLayout();   // animApply runs after the layout pass
}

function renderTop() {
  const play = state && state.phase === 'play' && !state.discarding;
  $('#btnDraw').disabled = !play || !!state.phasePause || stackLocked();
  $('#btnUntap').disabled = !play || !!state.phasePause || stackLocked();
  $('#btnNext').disabled = !play || !!state.phasePause;
  $('#btnNextPhase').disabled = !play || !!state.phasePause || stackLocked();
  $('#btnShuffle').disabled = !state;
  $('#btnUndo').disabled = !undoStack.length;
  $('#btnToken').disabled = !state;
  if (state && state.phase === 'play') {
    const nx = state.step >= CLEANUP ? 'Next turn' : STEPS[state.step + 1].g === 'Combat' && STEPS[state.step].g !== 'Combat' ? 'Combat' : STEPS[state.step + 1].label;
    $('#btnNextPhase').textContent = 'Next: ' + nx + ' ▸';
  } else $('#btnNextPhase').textContent = 'Next phase ▸';
}

function renderPhaseBar() {
  const box = $('#phases');
  if (!box) return;
  box.replaceChildren();
  if (!state || state.phase !== 'play') return;
  const st = STEPS[state.step] || STEPS[0];
  const next = state.step < CLEANUP ? STEPS[state.step + 1] : null;
  const pct = Math.round(((state.step + 1) / STEPS.length) * 100);
  const card = h('div', { class: 'phase-current phase2' },
    h('div', { class: 'ph-box ph-now' },
      h('div', { class: 'ph-tag', text: 'Now' }),
      h('div', { class: 'ph-name', text: st.label }),
      h('div', { class: 'ph-grp', text: st.g })),
    h('div', { class: 'ph-arrow', text: '›' }),
    h('div', { class: 'ph-box ph-next' },
      h('div', { class: 'ph-tag', text: 'Next' }),
      h('div', { class: 'ph-name', text: next ? next.label : 'New turn' }),
      h('div', { class: 'ph-grp', text: next ? next.g : 'Untap' })),
    h('div', { class: 'ph-count', text: `${state.step + 1}/${STEPS.length}`, title: 'Step of the turn' }),
    h('div', { class: 'phase-tip', text: st.tip }));
  box.append(card);
}

function openCombatHelper(){
  if(!state||!['attack','block'].includes(STEPS[state.step].id))return;
  const attackStep=STEPS[state.step].id==='attack';
  const m=modal(attackStep?'Declare attackers':'Declare blockers',{width:680,sticky:true});
  m.el.classList.add('seethru'); if(m.el.parentElement) m.el.parentElement.classList.add('seethru-bd');   // see the board through the window while you choose
  if(attackStep){
    const cb=state.combat;
    if(cb.declared){
      const names=(cb.attackers||[]).map(id=>findCard(id)?.card?.name).filter(Boolean);
      m.body.append(h('div',{class:'psub',text:names.length?`Attackers this turn: ${names.join(', ')}.`:'You declared no attackers this turn.'}),h('div',{class:'muted small',text:'Attackers are declared once per combat.'}));
      m.foot.append(h('button',{class:'primary',text:'Close',onclick:()=>m.close()}));
      return;
    }
    const picks=new Set();
    const rows=h('div',{class:'prelist'});
    const creatures=state.battlefield.filter(c=>permZone(c)==='creatures');
    if(!creatures.length) rows.append(h('div',{class:'muted',text:'You control no creatures.'}));
    const mand=new Map(mandatoryAttackers().map(c=>[c.id,mustAttackWhy(c)])); for(const id of mand.keys()) picks.add(id);   // CR 508.1d: required attackers are already chosen
    const btns=new Map(), sync=(c)=>{const b=btns.get(c.id); if(!b) return; b.className=picks.has(c.id)?'tgl on':'tgl'; b.textContent=picks.has(c.id)?'Attacking':'Attack';};
    creatures.forEach(c=>{
      const why=attackBlock(c), vig=hasKw(c,'vigilance');
      const btn=h('button',{class:'tgl',text:'Attack',disabled:!!why||mand.has(c.id),title:why||mand.get(c.id)||''}); btns.set(c.id,btn);
      btn.addEventListener('click',()=>{picks.has(c.id)?picks.delete(c.id):picks.add(c.id);sync(c);});
      const pw=powerOf(c);
      rows.append(h('div',{class:'row'+(why?' cantatk':'')},h('span',{class:'nm'},c.name+(vig?' (vigilance: does not tap)':'')),h('span',{class:'muted small',text:why?why:mand.has(c.id)?`must attack — ${mand.get(c.id)}`:`power ${pw.n}${pw.star?' (*)':''}`}),btn));
    });
    creatures.forEach(c=>sync(c));
    // v0.94.3 Attack with all: picks every creature that can legally attack (not tapped, not summoning sick unless it has haste, no defender, no "can't attack" effect)
    const viable=creatures.filter(c=>!attackBlock(c)), skipped=creatures.filter(c=>attackBlock(c));
    const allBtn=h('button',{text:`Attack with all (${viable.length})`,disabled:!viable.length,title:viable.length?'Selects every creature that can attack right now':'No creature can attack right now',onclick:()=>{viable.forEach(c=>picks.add(c.id));creatures.forEach(sync);allNote.textContent=skipped.length?`Left out: ${skipped.map(c=>`${c.name} (${c.tapped?'tapped':isSick(c)?'summoning sick':hasKw(c,'defender')?'defender':"can't attack"})`).join(', ')}.`:'Every creature you control is attacking.';}});
    const noneBtn=h('button',{text:'Clear',disabled:!viable.length,onclick:()=>{picks.clear();for(const id of mand.keys())picks.add(id);creatures.forEach(sync);allNote.textContent='';}});
    const allNote=h('div',{class:'muted small'});
    m.body.append(h('div',{class:'psub'},'Choose the creatures that will attack. Creatures that are tapped, summoning sick (no haste) or have defender cannot attack. Attacking taps a creature unless it has vigilance.'),rows);
    rows.append(h('div',{class:'row',style:'gap:8px;justify-content:flex-start'},allBtn,noneBtn),allNote);   // below the list of possible attackers
    m.foot.append(h('button',{text:'Cancel',onclick:()=>m.close()}),h('button',{class:'primary',text:'Declare attackers',onclick:()=>{
      for(const id of mand.keys())picks.add(id);
      snap();state.combat.attackers=[...picks];state.combat.declared=true;
      const atk=[...picks].map(id=>findCard(id)?.card).filter(Boolean);
      for(const c of atk){ if(!hasKw(c,'vigilance')) c.tapped=true; }
      log(atk.length?`Declared attackers: ${atk.map(c=>c.name).join(', ')}`:'Declared no attackers');
      fireTrigger('attack',{cards:atk});m.close();render();flushTriggers();}}));
  }else{
    const attackers=state.combat.attackers||[]; const assigns={...(state.combat.blockers||{})}; const rows=h('div',{class:'prelist'});
    const blockers=state.battlefield.filter(c=>permZone(c)==='creatures'&&!c.tapped&&!kwCantBlock(c));
    blockers.forEach(b=>{const sel=h('select');sel.append(h('option',{value:'',text:'No block'}));for(const aid of attackers){const ac=findCard(aid)?.card;if(ac)sel.append(h('option',{value:String(aid),text:ac.name}));}sel.value=assigns[b.id]||'';sel.addEventListener('change',()=>assigns[b.id]=sel.value?+sel.value:null);rows.append(h('div',{class:'row'},h('span',{class:'nm'},b.name),sel));});
    m.body.append(h('div',{class:'psub'},'Assign each available blocker to one attacker. This helper records assignments for teaching; it does not calculate combat damage automatically.'),rows);
    m.foot.append(h('button',{text:'Cancel',onclick:()=>m.close()}),h('button',{class:'primary',text:'Declare blockers',onclick:()=>{snap();state.combat.blockers=assigns;log('Declared blockers');m.close();render();}}));
  }
}
// Goldfish combat damage: the opponent has no blockers, so every attacker connects.
function dealCombatDamage(){
  const cb=state.combat; if(!cb||cb.dealt||!cb.attackers||!cb.attackers.length) return;
  let total=0; const parts=[]; const dealers=[]; let blk=null; try { blk=practiceBlock(cb.attackers); } catch(e) { blk=null; }   // v0.99.91 a practice opponent may chump-block
  for(const id of cb.attackers){
    const f=findCard(id); if(!f||f.zone!=='battlefield') continue;
    if(id===blk){ const tr=hasKw(f.card,'trample'), over=tr?Math.max(0,powerOf(f.card).n-1)*(hasKw(f.card,'double strike')?2:1):0; parts.push(`${f.card.name} blocked by a 1/1${over?`, ${over} tramples over`:''}`); log(`Practice opponent: chump-blocks ${f.card.name} with a 1/1`); total+=over; continue; }
    const pw=powerOf(f.card), mult=hasKw(f.card,'double strike')?2:1;
    if(pw.n>0) dealers.push(f.card);
    total+=pw.n*mult; parts.push(`${f.card.name} ${pw.n*mult}${mult===2?' (double strike)':''}${pw.star?' (* power counted as 0: adjust the opponent life by hand)':''}`);
  }
  cb.dealt=true;
  const fxHits=[]; for(const d of dealers){ if(d.id===blk) continue; const n=powerOf(d).n*(hasKw(d,'double strike')?2:1); if(n>0) fxHits.push({id:d.id,dmg:n}); }
  { const fog=(state.fx||[]).find(e=>e.kind==='fog'); if(fog && total>0){ log(`Combat damage: ${parts.join(', ')} = ${total}, all prevented (${fog.srcName||'an effect'}: prevent all combat damage this turn)`); toast('Combat damage prevented',`${fog.srcName||'An effect'} prevents all combat damage this turn.`); return; } }   // v0.99.79 Fog (CR 615)
  // Lifelink: damage dealt by the creature also gains its controller that much life (rule 702.15).
  let lifeGain=0; const lifeParts=[];
  for(const d of dealers){ if(!hasKw(d,'lifelink')) continue; const g=powerOf(d).n*(hasKw(d,'double strike')?2:1); if(g>0){ lifeGain+=g; lifeParts.push(`${d.name} ${g}`); } }
  try { if(total>0) combatFx(fxHits); } catch(e) { /* the arrows are decoration */ }   // v0.99.92
  const before=state.oppLife; state.oppLife-=total; mpOppLife(-total); if(total>0) state.oppLifeLostTurn=state.turn; try { if(total>0) recapNote('opp',-total); } catch(e) { /* recap only */ }   // v0.99.91 combat damage counts in the recap too
  state.dmgHistory=state.dmgHistory||[]; state.dmgHistory.push({turn:state.turn,dmg:total});
  log(`Combat damage: ${parts.join(', ')||'none'} = ${total}. Opponent life ${before} → ${state.oppLife}`);
  if(!(fxHits.length && polishMotion() && state.oppLife>0)) toast(`Combat damage: ${total}`, state.oppLife<=0?`Opponent is at ${state.oppLife}: goldfish kill on turn ${state.turn}!`:`Opponent life ${before} → ${state.oppLife}`);
  if(state.oppLife<=0) log(`Goldfish kill on turn ${state.turn}`);
  if(lifeGain>0 && lifeGainBlocked()){ log(`Lifelink: no life gained (${lifeGainBlocked().g.name})`); lifeGain=0; }
  if(lifeGain>0){ state.life+=lifeGain; log(`Lifelink: gained ${lifeGain} life (${lifeParts.join(', ')}) → ${state.life}`); toast(`Lifelink: +${lifeGain} life`, `You are now at ${state.life}.`); fireTrigger('lifegain',{amount:lifeGain}); }
  noteCombatDealers(dealers); commanderDamage(dealers);
  for(const d of dealers) fireTrigger('combatdmg',{card:d, amount:powerOf(d).n});
}
function changeOppLife(d){ if(!state) return; try { if (d < 0) recapNote('opp', d); } catch (e) { /* recap only */ } if(d>0 && typeof oppGainBlocked==='function' && oppGainBlocked()){ log(`Opponent life gain prevented: ${oppGainBlocked().g.name}`); toast('No life gained',`${oppGainBlocked().g.name}: your opponent can't gain life this turn.`); return; } snap(); state.oppLife=(state.oppLife??20)+d; mpOppLife(d); if(d<0) state.oppLifeLostTurn=state.turn; log(`Opponent life ${d>0?'+':''}${d} → ${state.oppLife}`); render(); }
function promptSkipAttack(){
  const n=eligibleAttackers().length;
  const m=modal('Skip attacking?',{width:460,sticky:true});
  m.body.append(h('div',{class:'psub',text:`You have ${n} creature${n===1?'':'s'} that can attack, and you have not declared attackers this turn.`}));
  m.foot.append(h('button',{text:'Skip attacking',onclick:()=>{m.close();if(mandatoryAttackers().length){openCombatHelper();return;}state.combat.declared=true;jumpToStep(state.step+1);}}),h('button',{class:'primary',text:'Declare attackers',onclick:()=>{m.close();openCombatHelper();}}));
}
function renderOverlay() {
  const ov = $('#overlay');
  const show = (...kids) => { ov.hidden = false; ov.replaceChildren(h('div', { class: 'pcard' }, ...kids.filter(Boolean))); };
  if (!state) {
    const hasDecks = Object.keys(loadDecks()).length > 0;
    if (!hasDecks) show(
      h('div', { class: 'ptitle', text: 'Welcome' }),
      h('div', { class: 'psub', text: 'Get set up in three quick steps.' }),
      h('ol', null,
        h('li', {}, h('b', { text: 'Import / edit deck' }), ' – paste a decklist.'),
        h('li', {}, h('b', { text: 'Card data ' }), '(optional) – load the Scryfall bulk file. Without it, card info is picked up from Scryfall when you are online.'),
        h('li', {}, h('b', { text: 'New game' }), ' – draw your opening hand.')),
      h('div', { class: 'pbtns' }, h('button', { class: 'primary', text: 'Import a deck', onclick: () => openDeckEditor({ blank: true }) })));
    else show(
      h('div', { class: 'ptitle', text: 'Ready to play' }),
      h('div', { class: 'psub', text: 'Pick a deck at the top, then start a game.' }),
      h('div', { class: 'pbtns' }, h('button', { class: 'primary', text: 'New game', onclick: startGame })));
    return;
  }
  if (state.phasePause) {
    const st=STEPS[state.step];
    show(h('div',{class:'ptitle',text:`${st.g} — ${st.label}`}),
      h('div',{class:'psub'},st.tip,h('br'),state.pendingTriggers.length ? 'Game paused at the beginning of this step. A triggered ability is waiting: press Continue to put it on the stack. You get priority after it resolves.' : 'You have priority in this step: cast instants, use flash, or activate abilities (cards outlined in green). Press Continue when you are done.'),
      h('div',{class:'pbtns'},h('button',{class:'primary',text:'Continue',onclick:resumePhase}),
      (STEPS[state.step]?.id==='attack'||STEPS[state.step]?.id==='block')&&teach('combatHelper') ? h('button',{text:'Combat helper',onclick:openCombatHelper}) : null));
    return;
  }
  if (state.phase === 'pregame') {
    const candidates=state.hand.filter(c=>beginsOnBattlefield(c));
    // v0.99.34 nothing in the opening hand acts before the game: do not stop on a screen that only says so (it still opens for Leylines, Gemstone Caverns, opening-hand reveals...)
    if(!candidates.length && !state.hand.some(c=>openingReveal(c))){ ov.hidden=true; ov.replaceChildren(); if(!state.preAuto){ state.preAuto=true; setTimeout(()=>{ if(state && !state.pregameDone) finishPregame(); },0); } return; }
    const serum=state.hand.find(mulliganHandSwap);
    const openingLine = c => {
      const ln = String(cardText(c) || '').split('\n').find(l => /opening hand/i.test(l));
      return ln ? ln.replace(new RegExp(c.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'),'this card') : 'This card has an opening-hand ability.';
    };
    show(h('div',{class:'ptitle',text:'Pre-game actions'}),
      h('div',{class:'psub',text:'Some cards can begin the game in a special way. Resolve them now, before turn one.'}),
      candidates.length
        ? h('div',{class:'prelist'},candidates.map(c=>h('div',{class:'prerow'},
            h('div',{class:'pre-info',title:openingLine(c)},h('div',{class:'pre-name',text:c.name}),h('div',{class:'pre-desc',text:openingLine(c).split(/(?<=\.)\s+/)[0]})),
            h('button',{class:'primary',text:'Start on battlefield',onclick:()=>pregameAction(c.id,'battlefield')}))))
        : null,
      state.hand.some(c=>openingReveal(c)) ? h('div',{class:'prelist'},state.hand.filter(c=>openingReveal(c)).map(c=>h('div',{class:'prerow'},
            h('div',{class:'pre-info',title:openingLine(c)},h('div',{class:'pre-name',text:c.name}),h('div',{class:'pre-desc',text:openingLine(c).split(/(?<=\.)\s+/)[0]})),
            h('button',{class:'primary',text:c.revealedOpening?'Revealed \u2713':'Reveal',disabled:!!c.revealedOpening,onclick:()=>pregameAction(c.id,'reveal')})))) : null,
      (!candidates.length && !state.hand.some(c=>openingReveal(c))) ? h('div',{class:'pre-none',text:'Nothing in your hand can begin the game in a special way.'}) : null,
      h('div',{class:'phint'},h('span',{class:'phint-i',text:'i'}),h('span',{text:'This pause is on purpose: opening-hand abilities happen before the first turn begins.'})),
      h('div',{class:'pbtns pre-go'},h('button',{class:'primary',text:'Continue to first turn',onclick:finishPregame})));
    return;
  }
  if (state.phase === 'mull') {
    if (!state.bottomPhase) {
      const lands = state.hand.filter(c => isLandName(c.name)).length;
      show(
        h('div', { class: 'ptitle', text: 'Opening hand' }),
        h('div', { class: 'psub' }, h('b', { text: `${state.hand.length} cards, ${lands} land${lands === 1 ? '' : 's'}` }), state.mulls ? ` · mulligan ×${state.mulls}` : '', h('br'), state.onPlay ? 'You are on the play.' : 'You are on the draw.'),
        h('div', { class: 'pbtns' },
          h('button', { class: 'primary', text: 'Keep', onclick: keepHand }),
          h('button', { text: 'Draw 1', onclick: () => pregameDraw(1) }),
          state.hand.some(mulliganHandSwap) ? h('button', { text: `Use Serum Powder — exile hand, draw ${state.hand.length}`, onclick: serumPowder }) : null,   // v0.96.25 only offered when a card in the hand allows it (CR 103.5b)
          h('button', { text: state.mulls >= 7 ? 'Cannot mulligan' : (state.cmdMode && !state.freeMullUsed ? 'Free mulligan (draw 7)' : `Mulligan to ${7 - state.mulls - 1}`), disabled: state.mulls >= 7, onclick: doMulligan })),
        state.hand.some(mulliganHandSwap) ? h('div', { class: 'phint', text: 'This card lets you exile your hand and draw that many cards any time you could mulligan (CR 103.5b). Exile the entire current opening hand and draw 7 new cards; if the new hand has Serum Powder, you may repeat. Mulligan normally only when you are ready to continue.' }) : null);   // v0.99.34 no "Your hand is shown below" line
    } else {
      ov.hidden = true; ov.replaceChildren(); return;   // v0.90.7 chosen in the hand bar instead
      const serum = state.serumPending;
      show(
        h('div', { class: 'ptitle', text: serum ? 'Put cards on the bottom' : 'Put cards on the bottom' }),
        h('div', { class: 'psub' }, serum ? `You have mulliganed ${state.mulls} time${state.mulls === 1 ? '' : 's'}. When you finally keep a hand, you will put ${state.mulls} card${state.mulls === 1 ? '' : 's'} on the bottom. Serum Powder itself does not require bottoming cards.` : 'Click ', serum ? null : h('b', { text: String(state.mulls) }), serum ? null : ` card${state.mulls === 1 ? '' : 's'} in your hand below `, serum ? null : `(${bottomSel.size}/${state.mulls} chosen).`),
        h('div', { class: 'pbtns' }, h('button', { class: 'primary', text: serum ? 'Confirm and use Serum Powder' : 'Confirm', disabled: bottomSel.size !== state.mulls, onclick: serum ? finishSerumPowder : finishMulligan })));
    }
    return;
  }
  ov.hidden = true;
  ov.replaceChildren();
}

