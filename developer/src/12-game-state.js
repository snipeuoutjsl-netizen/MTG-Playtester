// ---------------------------------------------------------------- game state
const ZONES = ['library', 'hand', 'battlefield', 'graveyard', 'exile', 'sideboard', 'command'];
let state = null;
let undoStack = [];
let selected = null;
let bottomSel = new Set();
// v0.90.1: choosing cards to discard happens in the hand zone itself. `handPick` describes an effect or cost that needs cards from the hand
// ({n, verb, note, ok(card), cancel, onCancel, done(ids)}); the cleanup discard uses the same bar with no `handPick`.
let handPick = null;
function pickFromHand(o) {
  if (!state) return;
  const hand = state.hand.filter(c => !o.ok || o.ok(c));
  const n = Math.min(o.n, hand.length);
  if (!n) { if (o.done) o.done([]); return; }
  if (n >= hand.length && !o.choose) { o.done(hand.map(c => c.id)); return; }   // only one possible choice: no need to ask
  bottomSel.clear(); handPick = Object.assign({ verb: 'discard' }, o, { n }); if (o.title && resolvingObj && resolvingObj.sourceName === o.title) handPick.res = resolvingObj; state.discarding = n; render();
}
function cancelHandPick() { const ctx = handPick; handPick = null; bottomSel.clear(); if (state) state.discarding = 0; render(); if (ctx && ctx.onCancel) ctx.onCancel(); }
function drawHandPickBar() {
  const bar = $('#handPickBar'), wrap = $('#handWrap'); if (!bar || !wrap) return;
  if (handPick && !(state && state.discarding)) handPick = null;
  const mb = !!state && state.phase === 'mull' && state.bottomPhase;   // v0.90.7 the mulligan "put on the bottom" step uses the same bar
  const on = (!!state && state.phase === 'play' && state.discarding > 0) || mb;
  { const oh = !!state && state.phase === 'mull' && !state.bottomPhase, wasOh = document.body.classList.contains('mullhand'); document.body.classList.toggle('mullhand', oh); if (oh !== wasOh) requestAnimationFrame(() => { try { layoutHand(); } catch (e) { /* layout only */ } }); }   // v0.99.25 the opening hand is shown large too
  { const was = document.body.classList.contains('mullpick'); document.body.classList.toggle('mullpick', mb); if (was !== mb) requestAnimationFrame(() => { try { layoutHand(); } catch (e) { /* layout only */ } }); }   // v0.99.25 the mulligan step brings the hand up, larger and centred
  document.body.classList.toggle('picking-hand', on && !!handPick && !mb);   // v0.90.5 an open effect window steps aside while you choose cards
  // v0.99.36 the stamp on a chosen card says what happens to it (it always said DISCARD, even for a mulligan's put-on-the-bottom)
  const centre = on && !mb && layoutOn('pickCentre'); wrap.classList.toggle('picking', on); { const v = mb ? 'bottom' : String((handPick && handPick.verb) || 'discard').toLowerCase(); wrap.dataset.pick = v; wrap.style.setProperty('--pickstamp', JSON.stringify(v === 'bottom' ? 'BOTTOM' : v.split(/\s+/)[0].toUpperCase())); } bar.hidden = !on || centre || !!(handPick && handPick.res); if (!on || centre || (handPick && handPick.res)) { bar.replaceChildren(); return; }
  if (mb) {
    const n = state.mulls, cnt = bottomSel.size, serum = state.serumPending;
    bar.replaceChildren(
      h('span', { class: 'hp-msg', text: `Select ${n} card${n === 1 ? '' : 's'} and put ${n === 1 ? 'it' : 'them'} at the bottom to continue` }), h('span', { class: 'hp-count', text: `${cnt} of ${n} selected` }),
      serum ? h('span', { class: 'hp-note muted small', text: 'Serum Powder is used after you choose.' }) : null,
      h('button', { class: 'primary', text: serum ? 'Confirm and use Serum Powder' : 'Confirm', disabled: cnt !== n, onclick: serum ? finishSerumPowder : finishMulligan }));
    return;
  }
  const n = state.discarding, verb = handPick ? handPick.verb : 'discard', cnt = bottomSel.size;
  bar.replaceChildren(
    h('span', { class: 'hp-msg', text: handPick ? `${handPick.title ? handPick.title + ': ' : ''}select ${n} card${n === 1 ? '' : 's'} to ${verb}` : `Cleanup: select ${n} card${n === 1 ? '' : 's'} to discard` }),
    h('span', { class: 'hp-count', text: `${cnt}/${n}` }),
    handPick && handPick.note ? h('span', { class: 'hp-note muted small', text: handPick.note }) : null,
    h('span', { class: 'hp-sp' }),
    handPick && handPick.cancel ? h('button', { text: 'Cancel', onclick: cancelHandPick }) : null,
    h('button', { class: 'primary', text: verb.charAt(0).toUpperCase() + verb.slice(1) + (n > 1 ? ` ${cnt}/${n}` : ''), disabled: cnt !== n, onclick: confirmDiscard }));
}

function newCard(name, extra) { return Object.assign({ id: 0, name, tapped: false, counters: 0 }, extra || {}); }

function freshState() {
  return { gs: {}, spellsCast: { turn: 0, n: 0 }, delayed: [], fx: [], nextId: 1, phase: 'idle', turn: 0, life: 20, onPlay: true, mulls: 0, bottomPhase: false, serumPending: false, step: 0, discarding: 0, skipDraw: false, landPlayedThisTurn: false,
    library: [], hand: [], battlefield: [], graveyard: [], exile: [], sideboard: [], command: [], stack: [], log: [],
    manaPool: {W:0,U:0,B:0,R:0,G:0,C:0},
    phasePause: false, pendingTriggers: [], costMods: [], priority: {active:false, passed:false}, combat: {attackers:[], blockers:{}, declared:false, dealt:false}, oppLife: 20, dmgHistory: [], pregameDone: false };
}

function snap() {
  if (snapMuted) return;
  undoStack.push(JSON.stringify(state));
  if (undoStack.length > 300) undoStack.shift();
}
function undo() {
  if (!undoStack.length) return;
  state = JSON.parse(undoStack.pop());
  selected = null; bottomSel.clear();
  render();
}

function log(msg) {
  if (state.resolving || state.resolvingAb) { state.resLines = state.resLines || []; if (!/^Resolved\b|is resolving$/.test(msg)) state.resLines.push(msg); if (state.resLines.length > 6) state.resLines.shift(); }   // v0.91.1 shown under the card while it resolves
  state.log.push((state.turn ? `T${state.turn}: ` : '') + msg);
  if (state.log.length > 400) state.log.shift();
  if (typeof a11yAnnounce === 'function') a11yAnnounce();
}

function findCard(id) {
  if (!state) return null;   // v0.99.32 the card reader also runs with no game (deck scan, How the app reads cards): there is nothing to look at yet
  for (const z of ZONES) {
    const i = state[z].findIndex(c => c.id === id);
    if (i >= 0) return { zone: z, idx: i, card: state[z][i] };
  }
  return null;
}

function moveCard(id, to, pos) {
  if (!state) return;
  const f = findCard(id);
  if (!f || f.zone === to && to !== 'library') return;
  snap();
  let c, where = to;
  if (f.zone === 'battlefield') {
    c = f.card; where = leaveBattlefield(c, to, { pos }) || to;
    if (where === 'gone') { if (selected === id) selected = null; render(); flushTriggers(); return; }
  } else {
    [c] = state[f.zone].splice(f.idx, 1);
    if (c.token) { log(`Token ${c.name} removed`); render(); return; }
    delete c.xValue; delete c.manaSpent; delete c.freeCastTurn; delete c.modes; delete c.modeTexts; delete c.target; delete c.targets; delete c.dmg; delete c.tmpKw; delete c.exileAtEnd; delete c.exileInstead; delete c.imprint; delete c.rebound; delete c.evoked; delete c.kicked; delete c.castFrom; delete c.fromGy; if (to !== 'exile') { delete c.mayPlayTurn; delete c.warpExile; } if (to !== 'graveyard' && to !== 'exile') delete c.gyExile; if (to !== 'exile') delete c.timeCounters; if (to !== 'battlefield') delete c.suspHaste;
    delete c.exiledWith;
    c.tapped = false; delete c.mt; c.counters = to === 'battlefield' ? (c.counters || { plus: 0, minus: 0 }) : { plus: 0, minus: 0 };
    if (to === 'battlefield') enterBattlefield(c, { from: f.zone });
    else if (to === 'library') { if (pos === 'bottom') state.library.push(c); else state.library.unshift(c); }
    else if (to === 'graveyard') gyPush(c, f.zone);
    else state[to].push(c);
    if (f.zone === 'graveyard' && to !== 'graveyard') fireTrigger('gyleave', { card: c, to });   // v0.84 rule 603.10a: leaves-the-graveyard triggers (Murktide Regent)
  }
  log(`${c.name}: ${f.zone} → ${where}${where === 'library' ? ' (' + (pos === 'bottom' ? 'bottom' : 'top') + ')' : ''}`);
  if (selected === id && to !== 'hand' && to !== 'battlefield') selected = null;
  render();
  flushTriggers();
}

function replacementEffectHints(){
  if(!state||!teach('rulesHints'))return [];
  return state.battlefield.filter(c=>/\b(?:if you would|whenever you would|instead|skip that draw)\b/i.test(cardText(c))).map(c=>c.name);
}
function skipDrawSource() { return !!state && state.battlefield.some(x => !x.token && /If you would draw a card, you may skip that draw instead/i.test(((cardInfo(x.name) || {}).tx || '').replace(/\s+/g, ' '))); }
function drawCards(n, silent) {
  // v0.99.45 CR 702.52a + 121.6: dredge replaces ANY draw (a spell, cycling, a trigger), not only the draw step. While a dredge card could
  // replace it, the draws are handed to the dredge prompt, which asks once per card drawn.
  if (!silent && n > 0 && !state.inDredge && state.phase !== 'mull' && teach('dredgePrompts') && dredgeOptions().length) { setTimeout(() => askDredge(n), 0); return n; }
  let drawn = 0, skipped = 0;
  const skipOn = !!(state.gs && state.gs.skipDraw) && skipDrawSource();   // v0.90 Necrodominance: you may skip each draw (the Skip draws switch)
  for (let i = 0; i < n; i++) {
    if (skipOn) { skipped++; continue; }
    if (!state.library.length) { if (!silent) log('Library is empty!'); state.drewEmpty = true; break; }
    const reps=replacementEffectHints(); if(reps.length && !silent && i===0) log(`Rules hint: ${reps.join(', ')} may modify this draw or event.`);
    state.hand.push(state.library.shift());
    if (!silent) noteMiracleDraw(state.hand[state.hand.length - 1]);
    drawn++; if (!silent) setTimeout(() => sfx('draw'), (drawn - 1) * 110);
    if (!silent && drawn <= 3) fireTrigger('draw');
  }
  if (skipped && !silent) log(`Skipped ${skipped} draw${skipped === 1 ? '' : 's'} (the Skip draws switch is on)`);
  return drawn;
}

// v0.99.35 the Opening hand prompt waits until the hand has been dealt; animApply ends it when the last card lands (a safety timer ends it regardless)
function dealingStart() { if (!animOn('move') || reducedMotion()) return; document.body.classList.add('dealing'); clearTimeout(dealingStart.t); dealingStart.t = setTimeout(() => document.body.classList.remove('dealing'), 5000); }
function startGame() {
  dealingStart();
  lifePrev = { you: null, opp: null }; lastStepShown = null;
  const deck = getCurrentDeck();
  if (!deck || !deck.main.length) { alert('Import a deck first (Import / edit deck).'); return; }
  state = freshState();
  state.newGameReset = true;   // v0.99.44 on screen every card of the old game goes back into the library before the new seven are dealt (card ids start again, so an old card must never be mistaken for a new one)
  undoStack = []; selected = null; bottomSel.clear();
  const unknown = new Set();
  const cmdOn = commanderModeOn(deck);   // v0.99.29 Commander mode (CR 903)
  for (const { qty, name, cmd } of deck.main) {
    const rec = resolve(name);
    if (!rec && cardCount) unknown.add(name);
    for (let i = 0; i < qty; i++) { const c = newCard(rec ? rec.name : name); c.id = state.nextId++; if (cmdOn && cmd) { c.isCommander = true; c.cmdCasts = 0; state.command.push(c); } else state.library.push(c); }
  }
  if (cmdOn) startCommanderState();
  for (const { qty, name } of deck.side) {
    const rec = resolve(name);
    for (let i = 0; i < qty; i++) { const c = newCard(rec ? rec.name : name); c.id = state.nextId++; state.sideboard.push(c); }
  }
  shuffleLib({ delay: 120 });   // v0.99.36 CR 103.2: the deck is shuffled at the start of the game, on screen, and then the seven are dealt
  state.dealDelay = 120 + riffleDuration();
  drawCards(7, true);
  state.phase = 'mull';
  state.onPlay = $('#chkPlay').checked;
  state.deckName = deck.name; try { noteGameStarted(deck.name); } catch (e) {}   // v0.99.47 which deck this game is using (the New Game button lights up when you pick another)
  state.log.push(`New game: ${deck.name} (${sum(deck.main)} cards, ${state.onPlay ? 'on the play' : 'on the draw'})`);
  if (unknown.size) state.log.push('Not found in card data: ' + [...unknown].join(', '));
  render();
  prepareImages();
}

function doMulligan() {
  // CR 103.5: a player may keep taking mulligans; after the seventh there is nothing left to keep, so that is the last one offered
  if (!state || state.phase !== 'mull' || state.mulls >= 7) return;
  dealingStart();
  snap();
  state.library.push(...state.hand.splice(0));   // CR 103.5: the whole hand goes back into the library ...
  state.mullReset = true;   // the animation shows all seven going back, even cards that are drawn again
  shuffleLib({ delay: 450 });   // ... which is shuffled (on screen, once the old hand has landed on it) ...
  state.dealDelay = 450 + riffleDuration();   // ... then a new seven is dealt (London mulligan, CR 103.5)
  const free = !!state.cmdMode && !state.freeMullUsed;   // CR 103.5c: in a multiplayer game such as Commander the first mulligan is free
  if (free) state.freeMullUsed = true; else state.mulls++;
  drawCards(7, true);
  log(free ? 'Free mulligan (CR 103.5c): drew a new seven' : `Mulligan #${state.mulls}`);
  render();
}

function keepHand() {
  if (!state || state.phase !== 'mull') return;
  if (state.mulls > 0 && !state.bottomPhase) {
    snap();
    state.bottomPhase = true; state.serumPending = false; bottomSel.clear();
    render();
    return;
  }
  finishMulligan();
}

function finishMulligan() {
  if (!state || state.phase !== 'mull') return;
  if (state.mulls > 0 && !state.bottomPhase) {
    snap();
    state.bottomPhase = true; state.serumPending = false; bottomSel.clear();
    render();
    return;
  }
  snap();
  const ids = [...bottomSel];
  for (const id of ids) {
    const i = state.hand.findIndex(c => c.id === id);
    if (i >= 0) state.library.push(state.hand.splice(i, 1)[0]);
  }
  bottomSel.clear();
  state.bottomPhase = false;
  state.serumPending = false;
  state.phase = 'pregame';
  state.turn = 1;
  state.onPlay = $('#chkPlay').checked;
  state.skipDraw = state.onPlay;
  state.pregameDone = false;
  log(`Kept ${state.hand.length} cards${state.mulls ? ` (mulligan ×${state.mulls})` : ''}`);
  if (!teach('preGame')) { state.pregameDone = true; state.phase = 'play'; log('Pre-game actions screen skipped (turned off in Settings)'); startTurn(); return; }
  render();
}

function pregameDraw(n) {
  if(!state||state.phase!=='mull'||state.bottomPhase)return; snap(); const d=drawCards(n,false); log(`Opening hand: drew ${d}`); render();
}

function serumPowder() {
  // Serum Powder is checked whenever the player has an opening hand and is
  // still deciding whether to mulligan. It replaces the entire current hand
  // with a new hand of the same size (normally 7), without changing the
  // mulligan count. This means it can be used again after a normal mulligan
  // if the new 7-card hand contains another Serum Powder.
  if(!state || state.phase !== 'mull' || state.bottomPhase || !state.hand.some(mulliganHandSwap)) return;

  snap();
  const count = state.hand.length;
  state.exile.push(...state.hand.splice(0));
  const drawn = drawCards(count, true);
  log(`Serum Powder: exiled ${count} cards and drew ${drawn}. You may now keep this hand, mulligan, or use Serum Powder again if present.`);
  render();
}

// Kept as a compatibility shim for older state/UI references. Serum Powder
// never requires putting cards back before its replacement draw; the normal
// mulligan bottoming happens only after the player finally keeps a hand.
function finishSerumPowder() {
  if (!state || state.phase !== 'mull' || !state.serumPending) return;
  state.serumPending = false;
  state.bottomPhase = false;
  render();
}
function pregameAction(id,action) {
  if(!state||state.phase!=='pregame')return; const f=findCard(id); if(!f||f.zone!=='hand')return;
  if(action==='reveal'){ pregameReveal(id); return; }
  snap(); const [c]=state.hand.splice(f.idx,1);
  if(action==='battlefield'){enterBattlefield(c,{from:'hand',tapped:false,logMsg:`Pre-game: ${c.name} begins on the battlefield`});}
  else {state.exile.push(c);log(`Pre-game: ${c.name} exiled`);}
  render();
}
function finishPregame(){if(!state||state.phase!=='pregame')return;snap();state.pregameDone=true;state.phase='play';log('Pre-game actions complete');startTurn();}
// ---- turn structure
const STEPS = [
  { id: 'untap', g: 'Beginning', label: 'Untap', tip: 'Untap your permanents. No player receives priority during untap.' },
  { id: 'upkeep', g: 'Beginning', label: 'Upkeep', tip: 'Upkeep triggers happen here. After triggers are put on the stack, instants and activated abilities can be used.' },
  { id: 'draw', g: 'Beginning', label: 'Draw', tip: 'Draw your card for the turn. After the draw, instants, flash spells, and activated abilities can be used.' },
  { id: 'main1', g: 'Main', label: 'Main 1', tip: 'You may play one land this turn and cast spells allowed at sorcery speed. Instants and flash are also available.' },
  { id: 'begin_combat', g: 'Combat', label: 'Begin', tip: 'Beginning-of-combat triggers happen here. Players can cast instants and activate abilities before attackers are declared.' },
  { id: 'attack', g: 'Combat', label: 'Attack', tip: 'Declare attackers. After attackers are declared, players get priority to cast instants and activate abilities.' },
  { id: 'block', g: 'Combat', label: 'Block', tip: 'Declare blockers. After blockers are declared, players get priority before combat damage.' },
  { id: 'damage', g: 'Combat', label: 'Damage', tip: 'Combat damage is dealt. After damage, players receive priority before the next step.' },
  { id: 'end_combat', g: 'Combat', label: 'End', tip: 'End-of-combat triggers happen here. Instants and activated abilities can be used before leaving combat.' },
  { id: 'main2', g: 'Main', label: 'Main 2', tip: 'Second main phase. You may play a land if you have not played one this turn, and cast sorcery-speed spells.' },
  { id: 'end', g: 'Ending', label: 'End step', tip: 'End-step triggers happen here. Instants and activated abilities can still be used.' },
  { id: 'cleanup', g: 'Ending', label: 'Cleanup', tip: 'Discard to seven if necessary and remove damage and temporary effects. Players normally do not receive priority unless a trigger occurs.' }
];
const MAIN1 = 3, MAIN2 = 9, CLEANUP = 11;
const stackLocked = () => !!state && state.phase === 'play' && state.stack.length > 0;
function stackToast() { toast('Stack is active', 'Nothing else can happen while something is on the stack. Respond with an instant or ability, or resolve / counter the top item first.'); }
const isBlocked = () => !state || state.phase !== 'play' || state.discarding > 0 || state.phasePause;

let toastTimer = null;
function toast(t1, t2) {
  if (!teach('phasePopups')) return;
  const el = $('#toast');
  el.replaceChildren(h('div', { class: 't1', text: t1 }), t2 ? h('div', { class: 't2', text: t2 }) : '');
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1500);
}

function enterStep(i, quiet) {
  if (state.step !== i && manaTotal()) clearManaPool(`leaving ${STEPS[state.step]?.label || 'previous step'}`);
  state.step = i;
  const id = STEPS[i].id;
  if (id === 'untap') {
    // Rule 502.3: untap everything except permanents that say they don't (v0.63): "~ doesn't untap during your untap step", Back to Basics.
    const noUntapNonbasic = state.battlefield.some(x => /nonbasic lands don'?t untap during their controllers' untap steps/i.test(cardText(x)));
    const held = [], pendUntap = [];
    for (const c of state.battlefield) {
      const tx = (cardText(c) || '').replace(/\u2019/g, "'"), nm = c.name.split(' // ')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const self = new RegExp("^(?:" + nm + "|this \\w+) doesn't untap during your untap step", 'im').test(tx);
      const bb = noUntapNonbasic && /\bLand\b/.test(c.types ? c.types.join(' ') : (cardInfo(c.name) || {}).t || '') && !/\bBasic\b/.test((cardInfo(c.name) || {}).t || '');
      if (c.exerted && c.exerted < state.turn) { delete c.exerted; if (c.tapped) { held.push(c.name + ' (exerted)'); continue; } }   // CR 701.43a: an exerted permanent does not untap during your next untap step
      if ((self || bb) && c.tapped) { held.push(c.name); continue; }
      if (c.tapped) pendUntap.push(c); else delete c.mt;
    }
    untapWithLimits(pendUntap, held);
    log('Untap' + (held.length ? ` (stayed tapped: ${[...new Set(held)].join(', ')})` : '')); endFx(e => e.until === 'yourNextTurn' && e.turn < state.turn, 'your turn began'); }
  else if (id === 'draw') {
    const fx = staticFx();
    if (state.skipDraw) { state.skipDraw = false; log('No draw (on the play)'); }
    else if (fx.skipDraw) { log(`Draw step skipped (${fx.skipDraw}: "skip your draw step")`); if (!quiet) toast('Draw step skipped', `${fx.skipDraw} says to skip your draw step.`); }
    else if (dredgeOptions().length && teach('dredgePrompts')) { log('Draw step: you may dredge instead of drawing'); askDredge(1); }
    else log(drawCards(1) ? 'Draw' : 'Library is empty!');
  } else if (id === 'upkeep') {
    if (state.gs && state.gs.init) queueTrigger({ kind: 'ability', cardId: 0, cardName: 'The initiative', text: 'At the beginning of your upkeep, venture into the Undercity.', effect: 'Venture into the Undercity.', special: null, optional: false, why: 'You have the initiative (rule 725.2). The app does not track the dungeon; move your marker by hand.' });
  } else if (id === 'main1') {
    runDelayed('main1');
    for (const c of state.battlefield.slice()) if (isSaga(c)) sagaAdvance(c, false);
  } else if (id === 'end_combat') {
    runDelayed('endcombat');
  } else if (id === 'end') {
    runDelayed('end');
    if (state.gs && state.gs.monarch) queueTrigger({ kind: 'ability', cardId: 0, cardName: 'The monarch', text: 'At the beginning of your end step, draw a card.', effect: 'Draw a card.', special: null, optional: false, why: 'You are the monarch (rule 724.2).' });
  } else if (id === 'damage') {
    dealCombatDamage();
  } else if (id === 'cleanup') {
    for (const x of state.battlefield) { if (x.dmg) delete x.dmg; }
    endFx(e => e.until === 'eot', 'end of turn');   // "until end of turn" effects end
    for (const x of state.battlefield) if (x.copyEot) { log(`${x.name} is ${x.origName} again (its copy effect ended)`); x.name = x.origName; delete x.origName; delete x.copyEot; }   // CR 514.2 (Shifting Woodland)
    const lim = staticFx().maxHand;
    if (state.hand.length > lim) { state.discarding = state.hand.length - lim; bottomSel.clear(); }
  }
  fireTrigger('step', { id });
  if (!quiet) toast(STEPS[i].label === 'End' ? 'End of combat' : STEPS[i].g === 'Combat' ? 'Combat: ' + STEPS[i].label : STEPS[i].label, STEPS[i].tip);
  if (!quiet && teach('phasePauses')) { state.phasePause = true; }
}

function startTurn() {
  state.landPlayedThisTurn = false; state.landsPlayed = 0; state.extraLandDrops = 0; state.usedAb = {};
  state.combat = { attackers: [], blockers: {}, declared: false, dealt: false };
  state.step = 0; state.phasePause = false;
  enterStep(0, true);
  if (state.turn === 1) {   // v0.81 the game's first turn skips the beginning phase and starts in Main 1 (the draw still happens on the draw)
    enterStep(1, true); enterStep(2, true); enterStep(MAIN1, true);
    toast('Turn 1', !state.onPlay ? 'Beginning phase done (you drew). Main phase 1.' : 'Beginning phase skipped. Main phase 1.');
  } else if (teach('phasePauses')) {
    state.phasePause = true;
    toast(`Turn ${state.turn}`, 'Untap complete. Continue to the next step when ready.');
  } else if (teach('autoStart')) {
    // v0.99.44 CR 503.1 + 117.3: an upkeep (or draw-step) trigger is put on the stack and resolves in that step, so the turn stops there
    // instead of running on to the draw and Main 1 (Summoner's Pact's "pay or lose" used to wait until after the draw).
    const busy = () => state.pendingTriggers.length || state.stack.length || state.discarding;
    enterStep(1, true); if (busy()) { toast(`Turn ${state.turn}`, 'Upkeep: a triggered ability needs you first.'); }
    else { enterStep(2, true); if (busy()) toast(`Turn ${state.turn}`, 'Draw step: a triggered ability needs you first.'); else { enterStep(MAIN1, true); toast(`Turn ${state.turn}`, 'Untap, upkeep and draw done. Main phase 1.'); } }
  } else toast(`Turn ${state.turn}`, 'Untap step. Press Next phase to continue.');
  render(); turnBanner();
  flushTriggers();
}

// v0.99.36 CR 508.1d: a creature that "attacks each combat if able" must be among the attackers you declare. You still declare (the Declare attackers window,
// with it already chosen and locked, and you may add others); no way of moving on (Next, clicking a later step, Next turn) may pass the declare-attackers step without it.
function requiredAttackGate(target) {
  if (!state || state.phase !== 'play' || state.combat.declared) return false;
  const atk = STEPS.findIndex(s => s.id === 'attack'); if (atk < 0 || state.step > atk || target <= atk && state.step !== atk) return false;
  if (!mandatoryAttackers().length) return false;
  if (state.step < atk) { snap(); for (let j = state.step + 1; j <= atk && !state.discarding && !state.pendingTriggers.length; j++) enterStep(j, j !== atk); render(); flushTriggers(); if (state.step !== atk) return true; }
  openCombatHelper(); return true;
}
function jumpToStep(i) {
  if (stackLocked()) { if (i > state.step) stackToast(); return; }
  if (isBlocked() || i <= state.step) { if (state && state.phasePause && i > state.step) toast('Continue first', 'Finish the pause at this step (press Next) before skipping ahead.'); return; }
  if (requiredAttackGate(i)) return;
  snap();
  for (let j = state.step + 1; j <= i && !state.discarding && !(j > state.step + 1 && state.pendingTriggers.length); j++) enterStep(j, j !== i);
  render();
  flushTriggers();
}

function nextPhase() {
  if (state && state.resolving) finishResolving();
  if (state && state.resolvingAb) { state.resolvingAb = null; state.resLines = []; }
  if (stackLocked()) { stackToast(); return; }
  if (isBlocked()) return;
  if (requiredAttackGate(state.step + 1)) return;
  if (STEPS[state.step].id === 'attack' && !state.combat.declared && teach('combatHelper') && eligibleAttackers().length) { promptSkipAttack(); return; }
  if (state.step >= CLEANUP) { nextTurn(); return; }
  jumpToStep(state.step + 1);
}

function nextTurn() {
  if (state && state.resolving) finishResolving();
  if (state && state.resolvingAb) { state.resolvingAb = null; state.resLines = []; }
  if (stackLocked()) { stackToast(); return; }
  if (isBlocked()) return;
  if (requiredAttackGate(CLEANUP)) return;
  snap();
  if (state.step < CLEANUP) { for (let j = state.step + 1; j <= CLEANUP && !state.discarding && !state.pendingTriggers.length; j++) enterStep(j, true); }
  if (state.pendingTriggers.length) { render(); flushTriggers(); return; }
  if (state.discarding) { render(); return; }
  const vault = teach('vaultPrompt') ? state.battlefield.find(c => c.tapped && !c.token && /you would begin your turn while [^.]*? is tapped, you may skip that turn instead/i.test(((cardInfo(c.name) || {}).tx || '').replace(/\s+/g, ' '))) : null;
  if (vault) { openVaultPrompt(vault); return; }
  beginNextTurn();
}
function beginNextTurn() {
  state.turn++;
  if (state.extraTurns > 0) { state.extraTurns--; log('Extra turn begins'); }
  startTurn();
}
// Time Vault: "If you would begin your turn while this artifact is tapped, you may skip that turn instead. If you do, untap this artifact."
function openVaultPrompt(vault) {
  const extra = state.extraTurns > 0;
  const m = modal(`${vault.name} is tapped`, { width: 520, sticky: true, noClose: true });
  m.body.append(h('div', { class: 'psub', text: `You would begin ${extra ? 'your extra turn' : 'your turn'} while ${vault.name} is tapped, so you may skip that turn instead (rule 614.10). If you do, ${vault.name} untaps.` }),
    h('div', { class: 'muted small', text: extra ? 'Skipping uses up the extra turn without playing it. Your next turn then begins normally.' : 'Skipping means a whole turn cycle passes (a goldfish opponent does nothing), then your next turn begins with it untapped.' }));
  m.foot.append(
    h('button', { text: 'Take the turn', onclick: () => { m.close(); beginNextTurn(); } }),
    h('button', { class: 'primary', text: 'Skip it and untap', onclick: () => { m.close(); snap(); vault.tapped = false; if (extra) state.extraTurns--; log(`${vault.name}: you skipped ${extra ? 'your extra turn' : 'a turn'} and untapped it`); beginNextTurn(); } }));
}

function confirmDiscard() {
  if (!state || !state.discarding || bottomSel.size !== state.discarding) return;
  if (handPick) { const ctx = handPick, ids = [...bottomSel]; handPick = null; bottomSel.clear(); state.discarding = 0; ctx.done(ids); render(); flushTriggers(); return; }
  snap();
  for (const id of [...bottomSel]) {
    const i = state.hand.findIndex(c => c.id === id);
    if (i >= 0) { const [c] = state.hand.splice(i, 1); gyPush(c, 'hand'); log(`Discarded ${c.name}`); }
  }
  bottomSel.clear(); state.discarding = 0;
  render();
  flushTriggers();
}

function untapAll() {
  if (!state || state.phase !== 'play') return;
  if (stackLocked()) { stackToast(); return; }
  snap();
  for (const c of state.battlefield) { c.tapped = false; delete c.mt; }
  log('Untap all');
  render();
}

function drawOne() {
  if (!state || state.phase !== 'play') return;
  if (stackLocked()) { stackToast(); return; }
  snap();
  const n = drawCards(1);
  log(n ? 'Draw' : 'Library is empty!');
  render();
}


function millCards(n) {
  if (!state || !n) return;
  snap();
  const names = [];
  simultaneously(() => { for (let i = 0; i < n && state.library.length; i++) { const c = state.library[0]; names.push(c.name); moveCardQuiet(c.id, 'graveyard'); } });   // one event (CR 701.17a)
  log(names.length ? `Milled ${names.length}: ${names.join(', ')}` : 'Library is empty!');
  render();
}
function moveCardQuiet(id, to) { const before = undoStack.length; moveCard(id, to); if (undoStack.length > before) undoStack.length = before; }

function closeLibMenu() { const m = $('#libMenu'); if (m) m.remove(); document.removeEventListener('keydown', libMenuKey, true); }
function libMenuKey(e) { if (e.key === 'Escape') { e.stopPropagation(); closeLibMenu(); } }
function openLibMenu(ev) {
  if (!state) return;
  closeLibMenu();
  const play = state.phase === 'play';
  const nIn = h('input', { type: 'number', value: String(lsGet('mtgpt.libN', 1)), min: '1', max: '99', title: 'How many cards' });
  nIn.addEventListener('input', () => lsSet('mtgpt.libN', Math.max(1, parseInt(nIn.value, 10) || 1)));
  const n = () => Math.max(1, parseInt(nIn.value, 10) || 1);
  const item = (label, hint, fn, dis) => { const b = h('button', { class: 'lm-item', role: 'menuitem' }, h('span', { text: label }), h('small', { text: hint })); b.disabled = !!dis; b.addEventListener('click', e => { e.stopPropagation(); closeLibMenu(); fn(); }); return b; };
  const m = h('div', { id: 'libMenu', role: 'menu' },
    h('div', { class: 'lm-title', text: `Library · ${state.library.length} cards` }),
    item('Draw a card', 'Takes the top card into your hand', drawOne, !play),
    h('div', { class: 'lm-n' }, h('span', { text: 'Number of cards (type any number)' }), nIn),
    ...(topLandSource() ? [item('Play the top land', 'Your top card, if it is a land (' + topLandSource().g.name + ')', playTopLand, !topLandPlayable())] : []),
    item('Look at top N', 'Look at, reorder or move the top cards', () => openLibraryManipulation(n())),
    item('Scry N', 'Look, then keep on top or bottom', () => openScry(n(), false)),
    item('Surveil N', 'Look, then keep on top or put in graveyard', () => openScry(n(), true)),
    item('Mill N', 'Put the top cards into the graveyard', () => millCards(n())),
    h('hr'),
    item('Search library', 'Find a card (shuffle afterwards)', () => openZone('library')),
    item('Shuffle', 'Randomise the library', shuffleLibrary));
  document.body.append(m);
  const r = $('#libstack').getBoundingClientRect();
  const w = m.offsetWidth, hh = m.offsetHeight;
  let x = ev && ev.clientX ? ev.clientX : r.right + 6, y = ev && ev.clientY ? ev.clientY : r.top;
  if (x + w > innerWidth - 6) x = Math.max(6, r.left - w - 6);
  if (y + hh > innerHeight - 6) y = Math.max(6, innerHeight - hh - 6);
  m.style.left = x + 'px'; m.style.top = y + 'px';
  document.addEventListener('keydown', libMenuKey, true);
  m.querySelector('.lm-item:not([disabled])')?.focus();
}
function setupLibraryMenu() {
  const ls = $('#libstack');
  ls.addEventListener('click', e => { e.stopPropagation(); if ($('#libMenu')) closeLibMenu(); else openLibMenu(e); });
  ls.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); openLibMenu(e); });
  ls.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLibMenu(); } });
  document.addEventListener('click', e => { const m = $('#libMenu'); if (m && !m.contains(e.target)) closeLibMenu(); });
}

function shuffleLibrary() {
  if (!state) return;
  if (stackLocked()) { stackToast(); return; }
  snap();
  shuffleLib();
  log('Shuffled library');
  render();
}

function manaTotal() {
  if (!state || !state.manaPool) return 0;
  return Object.values(state.manaPool).reduce((a,b)=>a+(b||0),0);
}
// v0.90.9 Static effects that change when mana empties (rule 106.4): Omnath, Locus of Mana keeps green; Upwelling keeps everything.
function manaKeepers() {
  const out = { all: false, colors: new Set(), by: [] };
  if (!state) return out;
  for (const x of state.battlefield) {
    if (x.token) continue; const tx = (((cardInfo(x.name) || {}).tx) || '').replace(/\s+/g, ' ');
    if (/mana pools? (?:don'?t|doesn'?t|do not) empty|(?:you )?don'?t lose unspent mana as steps and phases end/i.test(tx)) { out.all = true; out.by.push(x.name); }
    else { const m = tx.match(/(?:you )?don'?t lose unspent (white|blue|black|red|green) mana as steps and phases end/i) || tx.match(/(white|blue|black|red|green) mana doesn'?t empty from (?:your )?mana pools?/i); if (m) { out.colors.add({ white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' }[m[1].toLowerCase()]); out.by.push(x.name); } }
  }
  return out;
}
function clearManaPool(reason='') {
  if (!state || !state.manaPool || !manaTotal()) return;
  const keep = manaKeepers(), kept = {}; let lost = 0, held = 0, toC = 0;
  for (const k of Object.keys(state.manaPool)) {
    const v = state.manaPool[k] || 0;
    if (keep.all || keep.colors.has(k)) { kept[k] = v; held += v; } else { kept[k] = 0; lost += v; if (v && k !== 'C' && omnathColorless()) { toC += v; lost -= v; held += v; } }
  }
  kept.C = (kept.C || 0) + toC;   // Omnath: unspent mana becomes colorless instead of being lost
  state.manaPool = Object.assign({W:0,U:0,B:0,R:0,G:0,C:0}, kept);
  if (reason && lost) log(`${lost} floating mana emptied (${reason})`);
  if (reason && held) log(`${held} floating mana stayed in your pool (${[...new Set(keep.by)].join(', ')})`);
}
function addFloatingMana(color, amount=1) {
  if (!state) return;
  state.manaPool = state.manaPool || {W:0,U:0,B:0,R:0,G:0,C:0};
  state.manaPool[color] = (state.manaPool[color] || 0) + amount;
}
