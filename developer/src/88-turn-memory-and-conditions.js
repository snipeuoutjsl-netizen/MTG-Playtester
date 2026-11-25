// ---- v0.99.81 What happened this turn, and the conditions that ask about it
// One record per turn (state.mem, started by memNote in src/06) now also counts attacks, life gained and lost, cards drawn and spells warped.
// Every "this turn" condition is answered from it by turnCond(), which evalCond() (src/63) asks first. Nothing else should keep its own
// per-turn flag: add the event to memBump() at the one place it happens, and the condition here.
//   memBump('attacked', n)    fireTrigger('attack')      memBump('gained', n)  fireTrigger('lifegain')
//   memBump('lost', n)        fireTrigger('lifeloss')    memBump('drawn', 1)   fireTrigger('draw')
//   memBump('warped', 1)      a spell cast for its warp cost
// The same conditions drive: intervening "if" on triggered abilities (CR 603.4, checked when it triggers and again as it resolves),
// "enters with … counters if …" (Raid), "Activate only if …" (CR 602.5b) and "This spell costs {N} less to cast if …" (CR 601.2f).
function memCur() {
  if (!state) return null;
  let m = state.mem; if (!m || m.turn !== state.turn) m = state.mem = { turn: state.turn, entered: [], left: [], died: [] };
  for (const k of ['attacked', 'gained', 'lost', 'drawn', 'warped']) if (typeof m[k] !== 'number') m[k] = 0;
  return m;
}
function memBump(key, n) { const m = memCur(); if (m && n > 0) m[key] += n; }
function memCount(key) { const m = memCur(); return m ? (m[key] || 0) : 0; }
// fireTrigger() calls this first, so every event is counted once whichever card caused it
function memOnEvent(ev, ctx) {
  if (!state) return;
  if (ev === 'attack') memBump('attacked', ((ctx && ctx.cards) || []).length);
  else if (ev === 'lifegain') memBump('gained', +(ctx && ctx.amount) || 0);
  else if (ev === 'lifeloss') memBump('lost', +(ctx && ctx.amount) || 0);
  else if (ev === 'draw') memBump('drawn', 1);
}
const isNonlandMem = x => !/\bLand\b/.test(x.type || '');
// A "this turn" condition in the card's words (lower case, no full stop) -> true / false, or null when it is not one of these.
function turnCond(t, g) {
  if (!state) return null;
  let m;
  if (/^you attacked (?:with (?:a|one or more) creatures? )?this turn$/.test(t)) return memCount('attacked') > 0;   // raid
  if (/^you cast (?:it|~|this (?:creature|artifact|enchantment|permanent|card))$/.test(t)) return g && g.enteredFrom ? g.enteredFrom === 'stack' : null;   // v0.99.86 The One Ring, Wildfire Eternal: "if you cast it" (CR 603.4)
  if ((m = t.match(/^you attacked with (\w+) or more creatures this turn$/))) { const k = CS_NUM(m[1]); return isNaN(k) ? null : memCount('attacked') >= k; }
  if (/^you(?:'ve| have)? not attacked this turn$|^you didn'?t attack this turn$/.test(t)) return memCount('attacked') === 0;
  if (/^a permanent (?:you controlled )?left the battlefield (?:under your control )?this turn$/.test(t)) return memThisTurn('left').length > 0;   // revolt
  if (/^a nonland permanent (?:you controlled )?left the battlefield (?:under your control )?this turn$/.test(t)) return memThisTurn('left', isNonlandMem).length > 0;
  if (/^a spell was warped this turn$/.test(t)) return memCount('warped') > 0;   // void: "… or a spell was warped this turn" is split on "or" by evalCond
  if (/^a creature died (?:under your control )?this turn$|^a creature you controlled died this turn$/.test(t)) return memThisTurn('died', x => /\bCreature\b/.test(x.type)).length > 0;   // morbid
  if (/^(?:a|another) creature entered the battlefield under your control this turn$|^(?:a|another) creature entered under your control this turn$/.test(t)) return memThisTurn('entered', x => /\bCreature\b/.test(x.type) && !(g && x.id === g.id && /^another/.test(t))).length > 0;
  if (/^(?:an|each|any) opponents? (?:lost life|has lost life|was dealt damage|has been dealt damage) this turn$/.test(t)) return state.oppLifeLostTurn === state.turn;   // bloodthirst-style
  if (/^you gained life this turn$|^you(?:'ve| have) gained life this turn$/.test(t)) return memCount('gained') > 0;
  if ((m = t.match(/^you(?:'ve| have)? gained (\w+) or more life this turn$/))) { const k = CS_NUM(m[1]); return isNaN(k) ? null : memCount('gained') >= k; }
  if (/^you lost life this turn$|^you(?:'ve| have) lost life this turn$/.test(t)) return memCount('lost') > 0;
  if ((m = t.match(/^you(?:'ve| have)? drawn (\w+) or more cards this turn$|^you drew (\w+) or more cards this turn$/))) { const k = CS_NUM(m[1] || m[2]); return isNaN(k) ? null : memCount('drawn') >= k; }
  if (/^you(?:'ve| have)? cast another spell this turn$/.test(t)) return spellsCastNow() >= 1 + (g && g._castCounted === state.turn ? 1 : 0);
  if (/^you(?:'ve| have)? cast (?:a|another) (?:noncreature|instant or sorcery|instant|sorcery|creature|artifact|enchantment) spell this turn$/.test(t)) return null;   // the kind of spell is not recorded yet
  if (/^you(?:'ve| have)? played a land this turn$/.test(t)) return (state.landsPlayed || 0) > 0;
  if (/^(?:~|this (?:land|creature|permanent|artifact|enchantment)) entered (?:the battlefield )?this turn$/.test(t)) return !!g && g.enteredTurn === state.turn;   // "Activate only if this land entered this turn"
  if ((m = t.match(/^(\w+) or more (nonland permanents|creatures|artifacts|lands|permanents) entered (?:the battlefield )?under your control this turn$/))) { const k = CS_NUM(m[1]); if (isNaN(k)) return null;
    const ty = { 'nonland permanents': x => isNonlandMem(x), creatures: x => /\bCreature\b/.test(x.type || ''), artifacts: x => /\bArtifact\b/.test(x.type || ''), lands: x => /\bLand\b/.test(x.type || ''), permanents: () => true }[m[2]];
    return memThisTurn('entered', ty).length >= k; }
  // coven: three or more creatures with different powers
  if (/^you control three or more creatures with different powers$/.test(t)) return new Set(state.battlefield.filter(c => permZone(c) === 'creatures').map(c => ptCalc(c).p)).size >= 3;
  return null;
}
// CR 603.4 an intervening "if": "When/Whenever/At …, if <condition>, <effect>". The effect text of a trigger then starts "if <condition>, ".
// Returns { cond, rest, value } or null. "If you do" / "If you don't" / "If it's …" that the app cannot read are left alone (value null).
function interveningIf(effect, g) {
  const m = /^if ([^,]+?), (.+)$/is.exec(String(effect || '').trim()); if (!m) return null;
  if (/^you (?:do|don'?t|can'?t|can)$/i.test(m[1].trim())) return null;
  let v = null; try { v = evalCond(m[1], g); } catch (e) { v = null; }
  return { cond: m[1], rest: m[2].charAt(0).toUpperCase() + m[2].slice(1), value: v };
}
// "enters with a +1/+1 counter on it if you attacked this turn" (Raid, Cindering Cutthroat): false -> no counters; unreadable -> counters, with a note
function etbCounterCondOk(c, tx) {
  const m = /\benters(?: the battlefield)? with [^.]*? counters? on it if ([^.]+)\./i.exec(tx); if (!m) return true;
  const v = evalCond(m[1], c);
  if (v === false) { log(`${c.name}: enters without counters (${m[1]}: not this turn)`); return false; }
  if (v === null) log(`${c.name}: enters with its counters; check yourself that ${m[1]}`);
  return true;
}
// "This spell costs {2} less to cast if you've cast another spell this turn." (Bone Picker, Focus the Mind)
function condCostCut(c, tx) {
  const m = /\bcosts? ((?:\{\d+\})+) less to cast if ([^.]+)\./i.exec(tx); if (!m) return null;
  const n = (m[1].match(/\{(\d+)\}/g) || []).reduce((a, x) => a + parseInt(x.slice(1), 10), 0);
  let v = null; try { v = evalCond(m[2], c); } catch (e) { v = null; }
  return v ? { n, why: `{${n}} less: ${m[2]}` } : null;
}
