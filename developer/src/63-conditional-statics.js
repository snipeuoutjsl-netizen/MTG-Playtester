// ---------------------------------------------------------------- v0.98.5 conditional static abilities + "know what is missing"
// CR 611.3 / 613.4c: "~ gets +2/+2 as long as there are three or more land cards in your graveyard."  (Elvish Reclaimer)
//                    "This creature gets +2/+0 for every seven cards in your graveyard."
//                    "As long as it's your turn, this creature has first strike."
// The condition is read from its words by evalCond(), which answers true, false or null ("I do not understand this wording"). A rule the app cannot
// evaluate is never guessed: it is reported as a gap (compileCard marks it, the card gets a warning badge, and the log says so once).
const CS_NUM = w => { w = String(w).toLowerCase(); return /^\d+$/.test(w) ? +w : (NUMW[w] !== undefined ? NUMW[w] : (w === 'zero' || w === 'no' ? 0 : NaN)); };
const cardTy = c => { if (c.token) return permTypeLine(c); const i = cardInfo(c.name); return i && i.t ? i.t.split(' // ')[0] : ''; };
const CS_TYPE_WORDS = ['land', 'creature', 'artifact', 'enchantment', 'planeswalker', 'instant', 'sorcery', 'battle'];
// "land cards", "creature and land cards", "instant or sorcery cards", "cards", "permanent cards" in a zone array
function csCountZone(arr, thing) {
  const t = String(thing).toLowerCase().replace(/\bcards?\b/g, '').replace(/\band\/or\b|\band\b|\bor\b|,/g, ' ').trim();
  const words = t.split(/\s+/).filter(Boolean); if (!words.length) return arr.length;
  const ty = words.filter(w => CS_TYPE_WORDS.includes(singularWord(w))).map(singularWord);
  if (ty.length !== words.length) { if (words.every(w => w === 'permanent')) return arr.filter(c => !/\b(Instant|Sorcery)\b/.test(cardTy(c))).length; return null; }
  return arr.filter(c => ty.some(w => new RegExp('\\b' + w + '\\b', 'i').test(cardTy(c)))).length;
}
// Count "things": "land cards in your graveyard", "creatures you control", "other artifacts you control", "cards in your hand", "Elves you control".
function csCount(phrase, g) {
  const t = String(phrase).toLowerCase().replace(/’/g, "'").trim();
  let m;
  if ((m = t.match(/^(.*?)\s*in your graveyard$/))) return csCountZone(state.graveyard, m[1]);
  if ((m = t.match(/^(.*?)\s*in your hand$/))) return csCountZone(state.hand, m[1]);
  if ((m = t.match(/^(?:(other|another) )?(.+?) you control$/))) {
    const other = !!m[1], what = singularWord(m[2].trim().replace(/^nonland /, ''));
    if (/^permanent$/.test(what)) return state.battlefield.filter(c => !(other && g && c.id === g.id)).length;
    const nonland = /^nonland /.test(m[2]);
    return state.battlefield.filter(c => !(other && g && c.id === g.id) && (!nonland || !isLandName(c.name)) && (() => { try { const p = permTypeInfo(c); return p.types.has(what) || p.subs.has(what) || [...p.subs].some(x => singularWord(x) === what); } catch (e) { return false; } })()).length;
  }
  const f = typeof countForEach === 'function' ? countForEach(t) : null; return f;
}
function csCmp(n, op, k) { return /less|fewer/.test(op) ? n <= k : n >= k; }
function evalCond(text, g) {
  if (!state) return null;
  let t = String(text || '').replace(/’/g, "'").replace(/\s+/g, ' ').trim().replace(/\.$/, '').toLowerCase(), m;
  if (!t) return null;
  { const sp = t.match(/^(.+?),? and (.+)$/); if (sp && !/\band\b.*\bcards\b|instant and|creature and|artifact and|land and|and\/or/.test(sp[1])) { const a = evalCond(sp[1], g), b = evalCond(sp[2], g); if (a !== null && b !== null) return a && b; } }
  { const sp = t.match(/^(.+?),? or (?!more|less|greater|fewer|equal)(.+)$/); if (sp && !/instant or|creature or|artifact or|land or/.test(sp[1])) { const a = evalCond(sp[1], g), b = evalCond(sp[2], g); if (a !== null && b !== null) return a || b; } }
  if (/^it(?:'s| is) your turn$/.test(t)) return true;                       // a goldfish game is only ever your turn (the opponent's turn is not played out)
  if (/^it(?:'s| is) not your turn$|^it(?:'s| is) an opponent's turn$/.test(t)) return false;
  if ((m = t.match(/^there are (\w+) or more (.+?) in your graveyard$/))) { const k = CS_NUM(m[1]), n = csCountZone(state.graveyard, m[2]); return isNaN(k) || n === null ? null : n >= k; }
  if ((m = t.match(/^there are (\w+) or fewer (.+?) in your graveyard$/))) { const k = CS_NUM(m[1]), n = csCountZone(state.graveyard, m[2]); return isNaN(k) || n === null ? null : n <= k; }
  if ((m = t.match(/^(?:there (?:is|are)|you have) (.+?) in your graveyard$/)) && /\b(?:an?|one) [a-z]+ cards?\b/.test(m[1])) {   // "there is an instant card and a sorcery card in your graveyard": each listed kind must be there
    const kinds = m[1].split(/\s*(?:,|\band\b)\s*/).map(x => x.trim()).filter(Boolean); let all = true;
    for (const k of kinds) { const q = k.match(/^(?:an?|one|at least one) ([a-z]+(?: [a-z]+)?) cards?$/); if (!q) return null; const n = csCountZone(state.graveyard, q[1]); if (n === null) return null; if (n < 1) all = false; }
    return all;
  }
  if ((m = t.match(/^there are no (.+?) in your graveyard$/))) { const n = csCountZone(state.graveyard, m[1]); return n === null ? null : n === 0; }
  if ((m = t.match(/^you have (\w+) or more cards in (?:your )?hand$/))) { const k = CS_NUM(m[1]); return isNaN(k) ? null : state.hand.length >= k; }
  if ((m = t.match(/^you have (\w+) or fewer cards in (?:your )?hand$/))) { const k = CS_NUM(m[1]); return isNaN(k) ? null : state.hand.length <= k; }
  if (/^you have no cards in (?:your )?hand$|^you have an empty hand$/.test(t)) return state.hand.length === 0;
  if ((m = t.match(/^you have exactly (\w+) cards? in (?:your )?hand$/))) { const k = CS_NUM(m[1]); return isNaN(k) ? null : state.hand.length === k; }
  if ((m = t.match(/^(?:your life total is|you have) (\w+) or (less|more|greater|fewer)(?: life)?$/))) { const k = CS_NUM(m[1]); return isNaN(k) ? null : (/less|fewer/.test(m[2]) ? state.life <= k : state.life >= k); }
  if ((m = t.match(/^you control a creature with power (\w+) or greater$/))) { const k = CS_NUM(m[1]); return isNaN(k) ? null : state.battlefield.some(c => permTypeInfo(c).types.has('creature') && ptCalc(c).p >= k); }   // ferocious
  if ((m = t.match(/^you control (\w+) or more (.+)$/))) { const k = CS_NUM(m[1]), n = csCount(m[2] + ' you control', g); return isNaN(k) || n === null ? null : n >= k; }
  if ((m = t.match(/^you control no (.+)$/))) { const n = csCount(m[1] + ' you control', g); return n === null ? null : n === 0; }
  if ((m = t.match(/^you control (?:an? |another )(.+)$/))) { const n = csCount((/^you control another/.test(t) ? 'other ' : '') + m[1] + ' you control', g); return n === null ? null : n >= 1; }
  if ((m = t.match(/^(?:it|~|this \w+) (?:is|'s) (tapped|untapped|attacking|blocking)$/))) {
    if (!g) return null; if (m[1] === 'tapped') return !!g.tapped; if (m[1] === 'untapped') return !g.tapped;
    if (m[1] === 'attacking') return !!(state.combat && state.combat.attackers && state.combat.attackers.some(a => (a.id ?? a) === g.id)); return null;
  }
  if ((m = t.match(/^(?:it|~|this \w+) has (an?|\w+) (?:([+-]\d+\/[+-]\d+|[a-z]+) )?counters? on it$/))) { if (!g) return null; const k = CS_NUM(m[1] === 'a' || m[1] === 'an' ? 'one' : m[1]); return isNaN(k) ? null : counterCount(g, /^[+-]/.test(m[2] || '') ? 'plus' : (m[2] || 'plus')) >= k; }
  if ((m = t.match(/^you(?:'ve| have) cast (\w+) or more (?:other )?spells this turn$/))) { const k = CS_NUM(m[1]); return isNaN(k) ? null : spellsCastNow() >= k; }
  if (/^you(?:'ve| have) cast (?:an? )?\w+ spell this turn$/.test(t)) return null;
  return null;
}
// Parse the effect half: "~ gets +2/+2 and has flying" -> { p, t, kws, cant, other }
function csEffect(eff) {
  const out = { p: 0, t: 0, kws: [], cant: null, other: [] };
  const body = eff.replace(/^(?:~|it|this \w+)\s+/i, '');
  for (const part of body.split(/,\s*(?:and\s+)?|\s+and\s+(?=gets?\b|has\b|have\b|can't\b)/i)) {
    const x = part.trim(); let q; if (!x) continue;
    if ((q = x.match(/^gets? ([+-]\d+)\/([+-]\d+)$/i))) { out.p += +q[1]; out.t += +q[2]; }
    else if ((q = x.match(/^(?:has|have) (.+)$/i))) { for (const k of q[1].toLowerCase().split(/\s*(?:,|\band\b)\s*/)) { const w = k.trim(); if (GRANTABLE.includes(w)) out.kws.push(w); else if (w) out.other.push(w); } }
    else if (/^attacks each (?:combat|turn) if able$/i.test(x)) out.kws.push('mustattack');   // CR 508.1d requirement, e.g. Dragon's Rage Channeler's delirium
    else if ((q = x.match(/^can't (attack(?: or block)?|block)$/i))) out.cant = { attack: /attack/i.test(q[1]), block: /block/i.test(q[1]) };
    else out.other.push(x);
  }
  return out;
}
// A conditional / scaling static on the card itself. Returns a record for parseStaticCard, or null if this is not that shape.
function parseCondStatic(line, g) {
  const L = String(line).replace(/\.$/, '').trim(); let m, cond = null, eff = null, per = null;
  if ((m = L.match(/^as long as (.+?), ((?:~|it|this \w+) .+)$/i))) { cond = m[1]; eff = m[2]; }
  else if ((m = L.match(/^((?:~|this \w+) (?:gets?|has|have|can't) .+?) as long as (.+)$/i))) { eff = m[1]; cond = m[2]; }
  else if ((m = L.match(/^((?:~|this \w+) gets? [+-]\d+\/[+-]\d+) for every (\w+) (.+)$/i))) { eff = m[1]; per = { every: CS_NUM(m[2]), thing: m[3] }; if (isNaN(per.every)) per = { every: 1, thing: m[2] + ' ' + m[3] }; }
  else if ((m = L.match(/^((?:~|this \w+) gets? [+-]\d+\/[+-]\d+) for each (.+)$/i))) { eff = m[1]; per = { every: 1, thing: m[2] }; }   // CR 613.4c: "gets +1/+1 for each other Rat you control"
  else return null;
  const e = csEffect(eff); if (!(e.p || e.t || e.kws.length || e.cant)) return null;
  return { line: L, kind: 'cs', g, cond, per, p: e.p, t: e.t, kws: e.kws, cant: e.cant, other: e.other };
}
// Is it on right now? true / false / null (not understood). The numbers for a "for every N things" static come back as `mult`.
function csState(e) {
  if (!state) return { on: false, known: true, mult: 0 };
  if (e.cond) { const v = evalCond(e.cond, e.g); if (v === null) return { on: false, known: false, mult: 0 }; if (!v) return { on: false, known: true, mult: 0 }; }
  if (e.per) { const n = csCount(e.per.thing, e.g); if (n === null) return { on: false, known: false, mult: 0 }; const mult = Math.floor(n / Math.max(1, e.per.every)); return { on: mult > 0, known: true, mult, n }; }
  return { on: true, known: true, mult: 1 };
}
const csActive = e => csState(e).on;
// What the app does NOT apply for a card: every rules line the reader marks partly / unknown, plus conditional statics whose wording it cannot evaluate.
function ruleGaps(c) {
  try { const r = c && !c.token ? compileCard({ name: c.name }) : null; return r ? r.lines.filter(l => l.status === 'part' || l.status === 'unk').map(l => ({ text: l.text, why: l.note || '' })) : []; } catch (e) { return []; }
}
const GAP_LOGGED = new Set();
function noteGapsOnEnter(c) {
  if (!state || !c || c.token || !teach('gapNotes')) return;
  const k = state.turn + '|' + c.id; if (GAP_LOGGED.has(k)) return; GAP_LOGGED.add(k);
  const g = ruleGaps(c); if (!g.length) return;
  log(`Heads up: ${c.name} has ${g.length} rule${g.length === 1 ? '' : 's'} the app only reminds you of (apply by hand): ${g.map(x => '"' + x.text.slice(0, 70) + (x.text.length > 70 ? '…' : '') + '"').join('; ')}`);
}

// Is this condition / count wording one the evaluator understands? (checked against an empty board, so only the wording matters)
const CS_STUB = () => ({ graveyard: [], hand: [], battlefield: [], life: 20, turn: 0, combat: null, manaPool: {}, spellsCast: { turn: 0, n: 0 } });
function csUnderstood(cond, thing) {
  const old = state; state = CS_STUB();
  try { const g = { id: -1, tapped: false, counters: { plus: 0, minus: 0 }, name: 'x' }; return cond !== null ? evalCond(cond, g) !== null : csCount(thing, g) !== null; }
  catch (e) { return false; } finally { state = old; }
}
