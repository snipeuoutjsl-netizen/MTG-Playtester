// ---------------------------------------------------------------- board layout (v0.67)
const LAYOUT_DEFS = [
  ['pickCentre', 'Discard and card choices in the centre', 'When you must discard or choose cards from your hand, the choice is shown in the middle of the table next to the card that causes it, instead of the thin bar above your hand. Off: the bar above your hand.'],
  ['resolveFirst', 'Spell stays on the stack while its effect is applied', 'Instants and sorceries stay in the middle of the table while you apply their effect, then go to the graveyard (rule 608.2n). Off: they go to the graveyard first.'],
  ['zoneDepth', 'Zone depth', 'The battlefield zones look like shelves: a soft inner shadow at the top and a lit edge at the bottom'],
  ['stackCards', 'Stack identical lands and tokens', 'Identical untapped lands (or tapped lands, tokens) pile into one card with a count. Click the count to spread them out'],
  ['dimIdle', 'Dim cards that cannot act', 'Tapped lands and summoning-sick creatures are shown a little duller, so the cards you can use stand out'],
  ['boardStrip', 'Turn tracker strip', 'A bar floating across the middle of the battlefield shows every step of the turn and lights the one you are in, with your floating mana and land drop. Off = the older Now / Next box in the top bar'],
  ['combatLane', 'Combat lane', 'Attacking creatures slide into a lit lane at the front of the creature zone'],
  ['gyFan', 'Fan graveyard / exile on hover', 'Hover the graveyard or exile pile to fan out its top three cards; click to open the whole zone']
];
const layoutOn = k => !!(settings.layout && settings.layout[k] !== false);
// v0.74 Board arrangement: 'original' (the layout up to v0.73) or 'updated'. Each part of the updated layout has its own switch (Settings > Layout).
const LAY_DEFS = [
  ['lanes', 'Two lanes', 'Creatures get one wide lane across the top and are centred in it; lands and other permanents share one band below, lands on the left.'],
  ['rail', 'Slim zone rail', 'Library, graveyard and exile become three card-sized slots on a slim rail at the edge. Click one to open it; hover for a list.'],
  ['side', 'Slimmer right column', 'The enlarged card preview, the stack and the log share a narrower right column (286px instead of 330px), so the board is wider.'],
  ['mix', 'Land and artifact piles', 'Untapped lands (and mana artifacts) that make the same colours share a pile, all tapped ones share one pile, and a land or artifact with an activated ability only piles with exact copies. Other non-creature artifacts pile when they are identical. Every land in a pile keeps its name visible, and clicking one land taps or untaps just that land.']
];
const layMode = () => settings.layoutMode !== 'original';
const layV = k => layMode() && !(settings.lay && settings.lay[k] === false);
function applyLayout() {
  const b = document.body; if (!b) return;
  b.classList.toggle('lay-new', layMode());
  for (const [k] of LAY_DEFS) b.classList.toggle('lay-' + k, layV(k));
}
const expandedGroups = new Set();
function groupKey(c) {
  return [c.name, c.tapped ? 't' : 'u', JSON.stringify(c.counters || {}), c.chosen || '', c.token ? 'tok' : '', (c.gained || []).join('|'), c.tmp ? 'tmp' : '', c.exileAtEnd ? 'ex' : '', isSick(c) ? 's' : ''].join('~');
}
function groupKeyMix(c) { return groupKey({ ...c, tapped: false }); }
function stackableCard(c) {
  if (!c || c.att || c.target || c.targets || c.dmg || c.loyalty !== undefined || c.evoked || c.kicked || c.origName) return false;
  if (state.battlefield.some(x => x.att === c.id)) return false;
  return (c.token || permZone(c) === 'lands' || isPlainArtifact(c));
}
// v0.99.19 a non-creature artifact that is a real card (Sol Ring, Mox Opal, Skullclamp...) piles like a land does.
function isPlainArtifact(c) {
  if (!c || c.token || !layV('mix') || permZone(c) !== 'noncreature') return false;
  try { const t = permTypeInfo(c).types; return t.has('artifact') && !t.has('creature') && !t.has('land'); } catch (e) { return false; }
}
// v0.99.12 Land piles and token bundles.
// Lands: untapped lands pile by the mana colours they make (every Forest and Llanowar Wastes-type land that makes only {G} share a pile), all tapped lands share one pile,
// and a land with an activated ability (fetch, manland, Wasteland...) only piles with exact copies of itself until it is tapped. A pile is a cascade like the deck view: every land keeps its name strip visible.
// Tokens: identical tokens bundle in fives; two fives make a ten, five tens a fifty, two fifties a hundred, and so on, so a huge number of tokens is one obvious stack with a count.
const TOKEN_LADDER = [1000, 500, 100, 50, 10, 5];
function tokenBundles(n) { const out = []; let left = n; for (const sz of TOKEN_LADDER) while (left >= sz) { out.push(sz); left -= sz; } return { bundles: out, loose: left }; }
function artPileKey(c) {
  const extra = [JSON.stringify(c.counters || {}), c.chosen || '', (c.gained || []).join('|'), c.tmp ? 'tmp' : '', c.exileAtEnd ? 'ex' : ''].join('~');
  if (c.tapped) return { key: 'art#tapped~' + extra, cap: 'Tapped' };
  if (landHasActivated(c)) return { key: 'art#own~' + c.name + '~' + extra, cap: '' };   // equipment, Clue-like cards with an ability: only exact copies pile
  let cols = []; try { cols = rockColors(c).slice(); } catch (e) { cols = []; }
  const ord = 'WUBRGC'; cols.sort((a, b) => ord.indexOf(a) - ord.indexOf(b));
  if (cols.length) return { key: 'art#cols:' + cols.join('') + '~' + extra, cap: cols.join(' ') };   // mana artifacts pile by the colours they make
  return { key: 'art#name~' + c.name + '~' + extra, cap: '' };
}
function landHasActivated(c) { try { return activatedAbilitiesFor(c).length > 0; } catch (e) { return false; } }
function landPileKey(c) {
  const extra = [JSON.stringify(c.counters || {}), c.chosen || '', c.token ? 'tok' : '', (c.gained || []).join('|'), c.tmp ? 'tmp' : '', c.exileAtEnd ? 'ex' : ''].join('~');
  if (c.tapped) return { key: 'lands#tapped~' + extra, cap: 'Tapped' };
  if (landHasActivated(c)) return { key: 'lands#own~' + c.name + '~' + extra, cap: '' };   // the cascade already shows each land's name
  let cols = []; try { cols = landManaColors(c).slice().sort(); } catch (e) { cols = []; }
  const ord = 'WUBRGC'; cols.sort((a, b) => ord.indexOf(a) - ord.indexOf(b));
  return { key: 'lands#cols:' + cols.join('') + '~' + extra, cap: cols.length ? cols.join(' ') : 'No mana' };
}
// Rows of the battlefield with identical cards folded into one (v0.67).
function battlefieldRows(cards) {
  const out = { creatures: [], noncreature: [], lands: [] };
  const on = layoutOn('stackCards'), groups = new Map();
  for (const c of cards) {
    const z = permZone(c);
    if (on && stackableCard(c)) {
      let k, cap = '';
      const plain = isPlainArtifact(c);
      if (z === 'lands' && layV('mix')) { const lp = landPileKey(c); k = lp.key; cap = lp.cap; } else if (plain) { const ap = artPileKey(c); k = ap.key; cap = ap.cap; } else k = z + '#' + groupKey(c);
      let g = groups.get(k); if (!g) { g = { key: k, zone: z, cards: [], pile: (z === 'lands' && layV('mix')) || plain, cap }; groups.set(k, g); out[z].push(g); } g.cards.push(c);
    } else out[z].push({ key: null, zone: z, cards: [c] });
  }
  for (const z of ['creatures', 'noncreature']) {   // token bundles (fives, tens, fifties...)
    const list = out[z]; out[z] = [];
    for (const g of list) {
      if (!g.key || g.cards.length < 5 || expandedGroups.has(g.key)) { out[z].push(g); continue; }
      const { bundles, loose } = tokenBundles(g.cards.length); let at = 0;
      for (const sz of bundles) { out[z].push({ key: g.key, zone: z, cards: g.cards.slice(at, at + sz), bundle: sz }); at += sz; }
      for (; at < g.cards.length; at++) out[z].push({ key: null, zone: z, cards: [g.cards[at]] });
    }
  }
  for (const g of [...out.lands, ...out.noncreature]) if (g.pile && g.cards.length > 1) g.cards.sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
  return out;
}
// The stack floats in the middle of the table (v0.70.2) so you can see exactly what is on it. While you drag a card or permanent, it becomes a drop
// target: release a card from your hand on it to cast it in response, or a permanent to activate its ability.
// v0.94.2 What is forcing this hand choice? The ability or spell being resolved, else the card named by the choice (a cost), else the hand-size rule.
function pickSource() {
  if (handPick && handPick.res) return handPick.res;
  const t = handPick && handPick.title ? String(handPick.title) : '';
  if (state.resolving && (!t || state.resolving.name === t)) return state.resolving;
  if (state.resolvingAb && (!t || (state.resolvingAb.sourceName || state.resolvingAb.name) === t)) return state.resolvingAb;
  if (!handPick) return { id: 'res', name: 'Maximum hand size', pseudo: true, ability: false, text: `At the cleanup step you discard down to ${staticFx().maxHand} cards.` };
  if (t && cardInfo(t)) return { id: 'res', name: t, ability: false, kindTxt: /cost/i.test(handPick.note || '') ? 'Cost of' : 'Effect of' };
  return { id: 'res', name: t || 'Choice', pseudo: true, ability: false, text: handPick.note || '' };
}
// v0.99.35 shrink the stack stage (scale) until it sits inside the table and above the hand: the hand used to cover its buttons
function fitStackStage() {
  const el = $('#stackStage'); if (!el || el.hidden) return;
  el.style.setProperty('--ss', '1');
  const mat = $('#mat'), mr = mat ? mat.getBoundingClientRect() : null; if (!mr) return;
  const hand = [...document.querySelectorAll('#row-hand .card')].filter(c => !c.matches(':hover')).map(c => c.getBoundingClientRect()).filter(r => r.height);
  const bottom = Math.min(mr.bottom - 8, hand.length ? Math.min(...hand.map(r => r.top)) - 10 : Infinity), top = mr.top + 8;
  const r = el.getBoundingClientRect(), cy = (r.top + r.bottom) / 2, half = r.height / 2;
  const s = Math.min(1, (cy - top) / half, (bottom - cy) / half);
  if (s < 1) el.style.setProperty('--ss', String(Math.max(0.55, Math.floor(s * 100) / 100)));
}
function drawStackStage() {
  const el = $('#stackStage'); if (!el) return;
  const resSpell = !!state && state.phase === 'play' && !state.stack.length && !!state.resolving;   // v0.90.11 spell still on the stack while its effect is applied
  const resPick = !!state && state.phase === 'play' && state.discarding > 0 && (layoutOn('pickCentre') || (!state.stack.length && !!handPick && !!handPick.res));   // v0.94.2 every hand choice, not only ones from a resolving ability
  const resAb = !!state && state.phase === 'play' && !!state.resolvingAb && !resPick && !resSpell;   // v0.91.1 an ability whose effect is being applied
  const on = !!state && state.phase === 'play' && (state.stack.length > 0 || resPick || resSpell || resAb);
  el.hidden = !on; el.classList.toggle('resolving', resPick || resSpell || resAb); document.body.classList.toggle('res-stage', !!on && (resPick || resSpell || resAb)); if (!on) { el.replaceChildren(); return; }
  const pickSrc = resPick ? pickSource() : null;
  const items = resPick ? [handPick && handPick.res ? (state.resolving || Object.assign({}, handPick.res, { id: 'res', ability: true })) : pickSrc] : resSpell ? [state.resolving] : resAb ? [state.resolvingAb, ...[...state.stack].reverse()] : [...state.stack].reverse(), shown = items.slice(0, 5);
  const face = (c, i) => {
    const base = c.ability ? (c.sourceName || String(c.name).replace(/ — ability$/, '')) : c.name, im = showImages ? imgFor(base) : null;   // abilities show the card they come from
    const kind = c.kindTxt ? c.kindTxt + ' ' + base : c.pseudo ? 'Rule' : c.opp ? "Opponent's " + (c.ability ? 'ability' : 'spell') : c.ability ? (c.trigger ? 'Triggered ability' : 'Activated ability') : c.copy ? 'Copy of your spell' : 'Your spell';
    const abText = c.ability || c.pseudo ? String(c.text || '').replace(/\s+/g, ' ').trim() : '';
    const body = im && !c.pseudo ? h('img', { src: im.front, alt: base, draggable: 'false' }) : h('div', { class: 'ss-text' }, h('b', { text: base }), h('span', { text: c.ability || c.pseudo ? abText.slice(0, 150) : (cardInfo(c.name) ? (cardInfo(c.name).t || '') : '') }));
    return h('div', { class: 'ss-card' + (i ? '' : ' top') + (c.opp ? ' opp' : c.ability ? ' abil' : ''), style: `--i:${i}`, 'data-id': c.id, title: `${kind}: ${base}${abText ? ' — ' + abText : ''}` }, body, im && abText ? h('div', { class: 'ss-abil', text: abText.length > 120 ? abText.slice(0, 117) + '…' : abText }) : null, h('i', { class: 'ss-tag', text: (i ? '' : 'TOP · ') + kind }));
  };
  const resLinesEl = () => (state.resLines && state.resLines.length) ? h('div', { class: 'ss-lines' }, h('div', { class: 'ss-lh', text: 'What the app did' }), ...state.resLines.slice(-4).map(t => h('div', { text: t }))) : null;
  const stepsEl = (cur) => h('div', { class: 'ss-steps' }, ...['On the stack', 'Resolving', 'Done'].map((t, i) => h('span', { class: 'ss-st' + (i === cur ? ' now' : i < cur ? ' past' : ''), text: `${i + 1} ${t}` })));
  if (resAb) {
    const r = state.resolvingAb;
    el.replaceChildren(stepsEl(1), h('div', { class: 'ss-row' }, shown.map(face)),
      h('div', { class: 'ss-pick' }, h('b', { text: `${r.trigger ? 'Triggered ability' : r.pw ? 'Loyalty ability' : 'Activated ability'}: ${r.sourceName || r.name}` }), h('div', { class: 'muted small', text: 'Choose what it does in the window next to the card.' })),
      resLinesEl(), h('div', { class: 'ss-btns' }, h('button', { class: 'primary', text: 'Finish', title: 'Done applying this ability', onclick: () => { state.resolvingAb = null; state.resLines = []; render(); } })));
    return;
  }
  if (resPick) {
    const n = state.discarding, verb = handPick ? handPick.verb : 'discard', cnt = bottomSel.size, r = pickSrc;
    // v0.96.14 a rules check with no card behind it (the hand-size discard) is shown as a normal pop-up panel, not as an empty card
    const ruleBox = r && r.pseudo ? h('div', { class: 'ss-rulebox' }, h('div', { class: 'ss-rh', text: !handPick ? 'Rules check: maximum hand size' : 'Rules check: ' + (handPick.title || r.name) }), h('div', { class: 'ss-rt', text: r.text || '' })) : null;
    el.replaceChildren(ruleBox || h('div', { class: 'ss-row' }, shown.map(face)),
      h('div', { class: 'ss-pick' }, h('b', { text: !handPick ? 'Cleanup: hand size' : pickSrc.kindTxt ? `${pickSrc.kindTxt}: ${pickSrc.name}` : `${r.trigger ? 'Triggered ability' : 'Resolving'}: ${handPick.title || r.sourceName || pickSrc.name}` }),
        h('div', { text: `Select ${n} card${n === 1 ? '' : 's'} in your hand to ${verb} (${cnt}/${n})` }), handPick && handPick.note ? h('div', { class: 'muted small', text: handPick.note }) : null, state.stack.length ? h('div', { class: 'muted small', text: `${state.stack.length} object${state.stack.length === 1 ? '' : 's'} on the stack wait${state.stack.length === 1 ? 's' : ''} behind this.` }) : null),
      resLinesEl(),
      h('div', { class: 'ss-btns' }, handPick && handPick.cancel ? h('button', { text: 'Cancel', onclick: cancelHandPick }) : null,
        h('button', { class: 'primary', text: verb.charAt(0).toUpperCase() + verb.slice(1) + (n > 1 ? ` ${cnt}/${n}` : ''), disabled: cnt !== n, onclick: confirmDiscard })));
    return;
  }
  if (resSpell) {
    el.classList.add('resolving');
    el.replaceChildren(stepsEl(1), h('div', { class: 'ss-row' }, shown.map(face)), h('div', { class: 'ss-pick' }, h('b', { text: `Resolving: ${state.resolving.name}` }), h('div', { class: 'muted small', text: 'It stays here while its effect is applied, then goes to the graveyard.' })),
      resLinesEl(),
      h('div', { class: 'ss-btns' }, h('button', { class: 'primary', text: 'Finish: to graveyard', title: 'Done applying the effect', onclick: () => finishResolving() })));
    return;
  }
  const orderEl = items.length > 1 ? h('ol', { class: 'ss-order', title: 'The top of the stack resolves first' }, ...items.slice(0, 8).map((c, i) => h('li', { class: i ? '' : 'first' }, h('span', { class: 'ss-on', text: i ? `then ${i + 1}` : 'resolves first' }), ' ', h('b', { text: c.ability ? `${c.sourceName || c.name}` : c.name }), h('span', { class: 'muted', text: ' \u00b7 ' + (c.opp ? (c.ability ? "opponent's ability" : "opponent's spell") : c.ability ? (c.trigger ? 'triggered ability' : c.pw ? 'loyalty ability' : 'activated ability') : c.copy ? 'copy' : 'spell') })))) : null;
  const ssOn = splitSecondOn() ? h('div', { class: 'ss-split', text: 'Split second: no spells or abilities (except mana abilities) until it resolves' }) : null;
  el.replaceChildren(stepsEl(0), h('div', { class: 'ss-row' }, shown.map(face)), orderEl, ssOn, items.length > shown.length ? h('div', { class: 'ss-more', text: `+${items.length - shown.length} more below` }) : null, h('div', { class: 'ss-btns' },
      h('button', { text: 'Pass priority', title: 'Do not respond: the top object will resolve', onclick: () => passPriority() }),
      (!items[0].ability && !items[0].opp && !isPermanentCard(items[0])) ? h('button', { text: 'Copy', title: 'A copy of this spell goes on the stack (Twincast, Fork, Reverberate…). It is not cast, so it does not count for Storm.', onclick: () => { snap(); makeSpellCopies(items[0].id, 1, 'Copy effect'); render(); } }) : null,
      (() => { const cw = cantBeCounteredWhy(items[0]); return h('button', { class: 'danger', text: cw ? "Can't be countered" : 'Countered', disabled: !!cw, title: cw ? items[0].name + " can't be countered: " + cw : 'The top object is removed without resolving', onclick: () => { counterTopOfStack(); } }); })(),
      h('button', { class: 'primary', text: items[0].opp ? 'Resolve (opponent)' : 'Resolve top', title: 'Resolve ' + (items[0].ability ? (items[0].sourceName || items[0].name) : items[0].name), onclick: () => resolveTopOfStack() })),
    h('div', { class: 'ss-hint', text: 'Drag a card or permanent onto the stack to respond' }));
}
let bsActionsNode = null;
function bsActionsEl() { return bsActionsNode || (bsActionsNode = $('#bsActions')); }
function drawBoardStrip() {
  // v0.76 The turn tracker: every step of the turn, grouped, with the one you are in lit. It sits in the table's flow under the top bar (so it never
  // covers a card, and stays visible while the stack is up) and replaces the old Now/Next box.
  const el = $('#boardstrip'); if (!el) return;
  const on = layoutOn('boardStrip') && state && state.phase === 'play';
  document.body.classList.toggle('strip-on', !!on);
  el.hidden = !on; if (!on) { el.replaceChildren(); const a = bsActionsEl(), g = $('.gbtns'); if (g && a.parentNode !== g) g.prepend(a); return; }
  const cur = state.step, p = state.manaPool || {};
  const groups = []; STEPS.forEach((st, i) => { const last = groups[groups.length - 1]; if (last && last.g === st.g && !(st.g === 'Main')) last.steps.push(i); else groups.push({ g: st.g, steps: [i] }); });
  const track = h('div', { class: 'bs-track' }, ...groups.map(gr => h('div', { class: 'bs-grp' + (gr.steps.includes(cur) ? ' cur' : '') + (gr.steps[gr.steps.length - 1] < cur ? ' past' : ''), 'data-g': gr.g },
    h('div', { class: 'bs-gl', text: gr.g }),
    h('div', { class: 'bs-steps' }, ...gr.steps.map(i => {
      const st = STEPS[i], isNow = i === cur, ahead = i > cur;
      return h('button', { class: 'bs-step' + (isNow ? ' now' : i < cur ? ' done' : ''), 'data-step': st.id, text: st.label, title: `${st.label}: ${st.tip}${ahead ? '\n(Click to skip ahead to this step.)' : ''}`, 'aria-current': isNow ? 'step' : null, onclick: () => { if (ahead) jumpToStep(i); } });
    })))));
  // v0.90.2 floating mana is shown once (top bar), not twice; the strip carries the Next phase / Next turn buttons instead.
  const info = h('div', { class: 'bs-info' },
    state.stack.length ? h('span', { class: 'bs-stack', text: `stack ${state.stack.length}` }) : null);
  const acts = bsActionsEl(); el.replaceChildren(track, info, acts);
  scheduleLayout();
}
// v0.96.16 The tracker is a fixed row of the mat between the creature lane and the lower zones, so nothing around it moves (combat notice included); here it only tightens to fit.
function placeBoardStrip() {
  const el = $('#boardstrip'); if (!el || el.hidden) return;
  const zs = [...el.children]; const setZ = v => zs.forEach(k => { k.style.zoom = v; }); el.classList.remove('tight', 'tighter'); setZ('');
  const over = () => el.scrollWidth > el.clientWidth + 1;
  if (over()) { el.classList.add('tight'); if (over()) { el.classList.add('tighter'); let z = 0.95; while (over() && z > 0.6) { setZ(z.toFixed(2)); z -= 0.05; } } }
  // v0.96.18 the bar fills like a loading bar up to the end of the step you are in
  const now = el.querySelector('.bs-step.now'), r = el.getBoundingClientRect();
  if (now && r.width) { const nr = now.getBoundingClientRect(); el.style.setProperty('--fill', Math.max(0, Math.round(nr.right - r.left + 5)) + 'px'); } else el.style.setProperty('--fill', '0px');
}
window.addEventListener('resize', () => { try { placeBoardStrip(); } catch (e) { /* ignore */ } });

