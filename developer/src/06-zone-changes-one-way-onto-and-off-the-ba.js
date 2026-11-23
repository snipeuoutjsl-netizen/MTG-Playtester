// ---------------------------------------------------------------- zone changes: ONE way onto and off the battlefield
// Whatever puts a permanent onto the battlefield (playing a land, a spell resolving, a fetch, a reanimation, a token,
// dragging a card by hand) goes through enterBattlefield(); whatever takes one off goes through leaveBattlefield().
// That is where "enters tapped", the shockland question, surveil lands, enters-the-battlefield triggers, landfall, the
// legend rule, replacement effects ("exile it instead"), dies/leaves triggers and the turn memory are handled, once.
function memNote(kind, c) {
  if (!state || !c) return;
  let m = state.mem; if (!m || m.turn !== state.turn) m = state.mem = { turn: state.turn, entered: [], left: [], died: [] };
  m[kind].push({ id: c.id, name: c.name, type: c.token ? 'Token Creature' : (frontType(c) || ''), token: !!c.token });
}
// What happened this turn, e.g. memThisTurn('entered', x => /Creature/.test(x.type)).length
function memThisTurn(kind, pred) {
  const m = state && state.mem; if (!m || m.turn !== state.turn) return [];
  return (m[kind] || []).filter(pred || (() => true));
}
function enterBattlefield(c, o = {}) {
  if (!state || !c) return c;
  // o.from: 'hand' | 'stack' | 'library' | 'graveyard' | 'exile' | 'effect'   o.tapped: force tapped/untapped
  // o.logMsg: logged first   o.afterPlace(c): runs once it is on the battlefield, before any triggers (counters, flags)
  if (cageBlocksEnter(c, o.from)) { const g = globalHas(/^Creature cards in graveyards and libraries can't enter the battlefield\.?$/i); log(`${g.g.name}: ${c.name} can't enter the battlefield from your ${o.from}; it stays there`); toast("It can't enter", `${g.g.name}: creature cards in graveyards and libraries can't enter the battlefield.`); if (o.from === 'graveyard' && !state.graveyard.includes(c)) state.graveyard.push(c); else if (o.from === 'library' && !state.library.includes(c)) state.library.unshift(c); return c; }
  { const pr = priestExiles(c, o.from); if (pr) { log(`${pr.name}: ${c.name} would enter without being cast, so it is exiled instead`); toast('Exiled instead', `${pr.name}: a nontoken creature that would enter and wasn't cast is exiled instead.`); for (const z of ['hand', 'library', 'graveyard']) { const k = state[z].indexOf(c); if (k >= 0) state[z].splice(k, 1); } state.exile.push(c); render(); return c; } }
  c.counters = c.counters || { plus: 0, minus: 0 };
  c.enteredFrom = o.from || 'effect'; c.enteredCastFromGy = o.from === 'stack' && !!(c.fromGy || c.castFrom === 'graveyard');   // v0.99.45 "enters from your graveyard" (Prized Amalgam, Flayer of the Hatebound)
  c.echoDue = true;   // CR 702.30a echo: it came under your control since your last upkeep
  sfx(!c.token && isLandName(c.name) ? 'land' : 'enter');
  if (o.logMsg) log(o.logMsg);
  const et = o.tapped !== undefined ? { tapped: !!o.tapped, why: o.why || '' } : (c.token ? { tapped: false, why: '' } : etbTapped(c));
  if (et.tapped && o.tapped === undefined && landsEnterUntapped(c)) { et.tapped = false; et.why = ''; }
  state.battlefield.push(c);
  applyEtbTapped(c, et);
  etbCounters(c);
  if (isSaga(c)) { try { sagaAdvance(c, true); } catch (e) { console.error(e); } }
  if (!c.token && /\bliving weapon\b/i.test(cardText(c))) { try { livingWeapon(c); } catch (e) { console.error(e); } }
  if (isAuraCard(c) && !c.att && o.from !== 'effect') queueTrigger({ kind: 'attach', cardId: c.id });
  if (!c.token) { const tx0 = (cardText(c) || '').replace(/\u2019/g, "'"); let cm;
    if ((cm = tx0.match(/^If .+ would enter the battlefield, you may discard an? ([a-z]+) card instead\./im))) queueTrigger({ kind: 'discardInstead', cardId: c.id, what: cm[1] });
    else if ((cm = tx0.match(/^As .+? enters(?: the battlefield)?(?: tapped)?, choose an? ([^.\n]+)\./im)) && !/\bfrom among\b/i.test(cm[1])) queueTrigger({ kind: 'choose', cardId: c.id, what: cm[1].trim().toLowerCase() }); }
  memNote('entered', c);
  if (o.afterPlace) o.afterPlace(c);
  if (!c.prepared && prepSpellOf(c) && entersPrepared(c)) becomePrepared(c, 'it enters prepared');   // CR 722.3c
  landEntryTriggers(c, o.from !== 'hand');   // a land you played can be taken back; one put there by an effect cannot
  permanentEntered(c);
  return c;
}
function leaveBattlefield(c, dest = 'graveyard', o = {}) {
  if (!state || !c) return null;
  const i = state.battlefield.findIndex(x => x.id === c.id);
  if (i >= 0) state.battlefield.splice(i, 1);
  memNote('left', c);
  if (c.pairedWith) unpairCard(c);
  fxOnLeave(c);
  c._hostOf = state.battlefield.filter(x => x.att === c.id).map(x => x.id);   // what was attached to it, for "whenever equipped creature dies"
  detachFrom(c);
  for (const k of ['becomes', 'basePT', 'tmp', 'tmpKw', 'exileAtEnd', 'overloaded', 'bestowed', 'bestowAura', 'mutating', 'replicateN', 'preAlt', 'miracleNow', 'blitzed', 'dashed', 'casualtyPaid', 'squadN', 'offspringPaid', 'impended', 'target', 'targets', 'dmg', 'xValue', 'modes', 'modeTexts', 'loyalty', 'evoked', 'kicked', 'gained', 'exiledWith']) delete c[k];
  c.lki = { plus: counterCount(c, 'plus'), minus: counterCount(c, 'minus') };   // last known information (CR 603.10a): persist and undying look at the counters it HAD
  c.tapped = false; c.counters = { plus: 0, minus: 0 }; c._noCtr = false;
  delete c.chosen;
  if (c.faceOf) { c.name = c.faceOf; delete c.faceOf; delete c.face; }   // a transformed card is its front face again in any other zone (rule 712.14)
  if (c.origName) { c.name = c.origName; delete c.origName; }
  const _mp = c.mutParts ? c : null;
  if (c.exileInstead && dest !== 'exile') { log(`${c.name} would leave the battlefield, so it is exiled instead`); dest = 'exile'; }
  if (c.prepared) unprepare(c, 'it left the battlefield');   // CR 722.3c
  delete c.exileInstead; delete c.monstrous; delete c.exerted; delete c.classLevel;   // CR 400.7 + 716.3: a Class that returns is a new object at level 1
    // CR 701.37b: monstrous lasts until it leaves the battlefield
  if (_mp) mutSpawnParts(c, dest);
  if (c.token) {   // a token that leaves the battlefield ceases to exist, but it did leave (and may have died)
    log(`Token ${c.name} left the battlefield`);
    if (dest === 'graveyard') { memNote('died', c); fireTrigger('dies', { card: c }); }
    fireTrigger('leaves', { card: c });
    return 'gone';
  }
  if (dest === 'graveyard') { const where = gyPush(c, 'battlefield'); if (where === 'graveyard') memNote('died', c); return where; }
  if (dest === 'exile') state.exile.push(c);
  else if (dest === 'hand') state.hand.push(c);
  else if (dest === 'library') { if (o.pos === 'bottom') state.library.push(c); else state.library.unshift(c); }
  else state[dest].push(c);
  fireTrigger('leaves', { card: c });
  return dest;
}
// Every card going to the graveyard goes through here so replacement effects can apply.
let discardHow = null, silentGy = false;
function gyPush(c, from) {
  if (c) delete c.splicedTx;
  if (c.gyExile) { delete c.gyExile; state.exile.push(c); log(`${c.faceOf || c.name} was cast from the graveyard, so it is exiled instead of going anywhere else`); if (from === 'battlefield') fireTrigger('leaves', { card: c }); if (c.half && from !== 'stack') restoreHalf(c); return 'exile'; }
  if (c.half && from !== 'stack') restoreHalf(c);
  if (c.exileInstead && from === 'battlefield') { delete c.exileInstead; delete c.exileAtEnd; state.exile.push(c); log(`${c.name} would leave the battlefield, so it is exiled instead`); fireTrigger('leaves', { card: c }); return 'exile'; }   // (leaveBattlefield normally handles this first)
  const fx = staticFx();
  if (fx.gyExile && !(c.id === undefined)) {
    state.exile.push(c);
    log(`${c.name} would go to the graveyard, but ${fx.gyExile} exiles it instead`);
    toast('Exiled instead', `${fx.gyExile} replaces going to the graveyard.`);
    if (from === 'battlefield') fireTrigger('leaves', { card: c });
    return 'exile';
  }
  state.graveyard.push(c);
  if (from === 'battlefield') { fireTrigger('dies', { card: c }); fireTrigger('leaves', { card: c }); }
  if (!silentGy) { fireTrigger('gyenter', { card: c, from }); if (from === 'hand') fireTrigger('discard', { card: c, how: discardHow || 'discard' }); }
  return 'graveyard';
}

