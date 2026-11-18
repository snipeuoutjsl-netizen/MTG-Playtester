// ---------------------------------------------------------------- v0.98.4 characteristic-changing effects (CR 613, 205.1, 305.7, 613.1f)
// "Until end of turn, target creature loses all abilities and becomes a blue Frog with base power and toughness 1/1." (Turn to Frog)
// "Enchanted creature loses all abilities and is a green Elk creature with base power and toughness 3/3."  (Kenrith's Transformation)
// "Enchanted creature is a 0/1 Insect artifact creature with no abilities and loses all other card types and creature types."  (Darksteel Mutation)
// "Enchanted permanent is a colorless land with "{T}: Add {C}" and loses all other card types and abilities."  (Imprisoned in the Moon)
// "Enchanted permanent is a colorless Forest land."  (Song of the Dryads)   "target creature loses flying until end of turn"
// Read from the words, never from card names. A permanent's override = its own temporary effect (c.ovr) merged with the Auras attached to it.
const CC_COLORS = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
const CC_TYPES = ['creature', 'artifact', 'enchantment', 'land', 'planeswalker', 'battle', 'instant', 'sorcery'];
const CC_BASIC = { plains: 'W', island: 'U', swamp: 'B', mountain: 'R', forest: 'G' };
const cap1 = w => w[0].toUpperCase() + w.slice(1);
// Parse what an effect does to its object. `rest` starts at the verb: "loses all abilities and becomes a blue Frog with base power and toughness 1/1".
function parseCharChange(rest) {
  let r = String(rest || '').replace(/’/g, "'").replace(/\s+/g, ' ').trim().replace(/\.$/, '').replace(/\s+until end of turn$/i, '');
  const grant = [...r.matchAll(/"([^"]+)"/g)].map(m => m[1]); r = r.replace(/"[^"]*"/g, '""');
  const out = { lose: false, grant, loseKws: [] };
  if (/\bloses all (?:other card types and )?abilities\b|\bwith no abilities\b|\bhas no abilities\b|\bloses all other card types and abilities\b/i.test(r)) out.lose = true;
  const resetTypes = /\bloses all other card types\b/i.test(r), resetSubs = resetTypes || /\bloses all (?:other )?creature types\b|\band creature types\b/i.test(r);
  const im = /\b(is|are|becomes?) an? (?:(\d+)\/(\d+) )?((?:[A-Za-z'-]+ )*?[A-Za-z'-]+?)(?= with | and |,|$)/i.exec(r);
  if (im) {
    const words = im[4].split(/\s+/).filter(Boolean).map(w => w.toLowerCase()), types = [], subs = []; let colors = null;
    for (const w of words) {
      if (CC_COLORS[w]) { colors = (colors || []).concat(CC_COLORS[w]); } else if (w === 'colorless') colors = [];
      else if (CC_TYPES.includes(w)) types.push(cap1(w)); else if (w === 'permanent' || w === 'legendary' || w === 'basic' || w === 'snow') continue; else subs.push(cap1(w));
    }
    if (im[2] !== undefined) out.pt = im[2] + '/' + im[3];
    if (colors) out.colors = colors; if (subs.length) out.subs = subs;
    if (types.length) { if (resetTypes || /^(is|are)$/i.test(im[1])) out.types = types; else out.addTypes = types; }
  }
  if ((out.subs || []).some(s => CC_BASIC[s.toLowerCase()]) && (out.types || []).includes('Land')) out.lose = true;   // CR 305.7: a land set to a basic land type loses its other abilities
  if (resetTypes && !out.types && !out.addTypes) out.types = [];
  if (resetSubs && !out.subs) out.subs = [];
  const bp = /base power and toughness (\d+)\/(\d+)/i.exec(r); if (bp) out.pt = bp[1] + '/' + bp[2];
  for (const lm of r.matchAll(/\bloses? ((?:[a-z]+(?: strike)?(?:, | and |,? and )?)+?)(?= and |$|,)/gi)) for (const k of GRANTABLE) if (new RegExp('\\b' + k + '\\b', 'i').test(lm[1]) && !/\ball\b/i.test(lm[1])) out.loseKws.push(k);
  if (!(out.lose || out.subs || out.types || out.addTypes || out.colors || out.loseKws.length)) return null;
  return out;
}
const AURA_OVR_CACHE = new Map();
function auraOvrOf(a) {   // the override an attached Aura / Equipment applies to what it is attached to
  const tx = (a.token ? (a.tk && a.tk.tx) : (cardInfo(a.name) || {}).tx) || ''; if (!/\benchanted\b|\bequipped\b/i.test(tx)) return null;
  if (AURA_OVR_CACHE.has(tx)) return AURA_OVR_CACHE.get(tx);
  let res = null;
  for (const raw of tx.replace(/\([^)]*\)/g, ' ').split(/\n|(?<=\.)\s+(?=[A-Z])/)) {
    const m = /^(?:Enchanted|Equipped) (?:creature|permanent|land|artifact|enchantment) (.+)$/i.exec(raw.trim()); if (!m) continue;
    const p = parseCharChange(m[1]); if (p) res = Object.assign(res || {}, p, { grant: (res && res.grant || []).concat(p.grant || []), loseKws: (res && res.loseKws || []).concat(p.loseKws || []) });
  }
  AURA_OVR_CACHE.set(tx, res); return res;
}
function ovrOf(c) {
  if (!state || !c) return null; let out = null;
  const merge = o => { if (!o) return; out = out || { lose: false, grant: [], loseKws: [] }; if (o.lose) out.lose = true; for (const k of ['subs', 'types', 'addTypes', 'colors', 'pt']) if (o[k] !== undefined) out[k] = o[k]; out.grant = out.grant.concat(o.grant || []); out.loseKws = out.loseKws.concat(o.loseKws || []); };
  merge(c.ovr);
  for (const a of state.battlefield) if (a.att === c.id) merge(auraOvrOf(a));
  return out;
}
const hasOvr = c => !!(c && (c.ovr || (state && state.battlefield.some(a => a.att === c.id && auraOvrOf(a)))));
// What a type line looks like after the override (frontType calls this).
function ovrTypeLine(c, t) {
  const ov = ovrOf(c); if (!ov || !t || !(ov.types || ov.addTypes || ov.subs)) return t;
  const [a, b] = t.split('—').map(x => x.trim()), SUP = new Set(['Legendary', 'Basic', 'Snow', 'World', 'Token']);
  let words = a.split(/\s+/).filter(Boolean), sup = words.filter(w => SUP.has(w)), tys = words.filter(w => !SUP.has(w));
  if (ov.types) tys = ov.types.slice(); if (ov.addTypes) for (const w of ov.addTypes) if (!tys.includes(w)) tys.push(w);
  const subs = ov.subs ? ov.subs.slice() : (ov.types && !ov.subs ? [] : (b ? b.split(/\s+/) : []));
  return [...sup, ...tys].join(' ') + (subs.length ? ' — ' + subs.join(' ') : '');
}
// A land that now has a basic land type taps for that colour; one with a granted "{T}: Add {C}" ability taps for that. null = no override applies.
function ovrLandMana(c) {
  const ov = ovrOf(c); if (!ov || !ov.lose) return null;
  const cols = new Set(); for (const s of ov.subs || []) if (CC_BASIC[s.toLowerCase()]) cols.add(CC_BASIC[s.toLowerCase()]);
  for (const g of ov.grant || []) { const m = /\{T\}: Add ((?:\{[A-Z]\})+)/i.exec(g); if (m) for (const x of m[1].match(/[A-Z]/g)) cols.add(x); }
  return [...cols];
}
// The effect on a spell or ability: "[Until end of turn,] target creature loses all abilities and becomes a blue Frog with base power and toughness 1/1."
function charChangeEffect(tx, src, obj) {
  const T = String(tx || '').replace(/’/g, "'").replace(/\n/g, ' ').replace(/\s+/g, ' ').replace(selfNameRe(src), '~').trim();
  const m = /^(?:(until end of turn|until your next turn),\s*)?(?:(~|this [a-z]+|it)|(?:up to one )?target ([a-z ,\/-]+?)(?: you control| an opponent controls)?) ((?:loses?|is|becomes?) .+?)\.?$/i.exec(T);
  if (!m) return null;
  const p = parseCharChange(m[4]); if (!p || !(p.lose || p.loseKws.length || (p.subs && p.subs.length) || p.colors || p.types)) return null;
  const durTxt = m[1] || (/until end of turn\s*$/i.test(m[4]) ? 'until end of turn' : ''), dur = /your next turn/i.test(durTxt) ? 'upkeep' : durTxt ? 'end' : null, selfTok = m[2], phrase = (m[3] || '').toLowerCase();
  const bits = [p.lose ? 'loses all abilities' : '', p.loseKws.length ? 'loses ' + p.loseKws.join(', ') : '', p.subs && p.subs.length ? 'is a ' + (p.colors && p.colors.length ? p.colors.map(x => Object.keys(CC_COLORS).find(k => CC_COLORS[k] === x)).join(' ') + ' ' : '') + p.subs.join(' ') : '', p.pt ? 'base P/T ' + p.pt : ''].filter(Boolean).join(', ');
  const label = `${selfTok ? 'It' : 'Target ' + phrase}: ${bits}${dur ? (dur === 'upkeep' ? ' until your next turn' : ' until end of turn') : ''}`;
  const apply = c => {
    snap(); c.ovr = Object.assign({}, c.ovr || {}, p, { grant: (c.ovr && c.ovr.grant || []).concat(p.grant || []), loseKws: (c.ovr && c.ovr.loseKws || []).concat(p.loseKws) });
    if (dur) addFx({ kind: 'delayed', when: dur, action: 'unovr', targetId: c.id, targetName: c.name, text: `${c.name}: the effect ends.`, srcName: src });
    log(`${src}: ${c.name} ${bits}${dur ? (dur === 'upkeep' ? ' until your next turn' : ' until end of turn') : ''} (CR 613)`); render(); flushTriggers();
  };
  return { full: true, label, fn: () => {
    if (selfTok) { const f = obj && obj.sourceId ? findCard(obj.sourceId) : null; if (f && f.zone === 'battlefield') { apply(f.card); return; } const c = state.battlefield.find(x => x.name === src); if (c) { apply(c); return; } toast('Not on the battlefield', 'The permanent is no longer here.'); return; }
    const tg = obj && (obj.targets || []).find(t => t.kind === 'perm' && !t.gone);
    if (tg) { const f = findCard(tg.id); if (f && f.zone === 'battlefield') apply(f.card); else log(`${src}: its target is gone, so the ability does nothing (CR 608.2b)`); return; }
    const words = phrase.split(/\s*(?:,|\bor\b)\s*/).map(w => singularWord(w.trim())).filter(Boolean), cards = state.battlefield.filter(c => !words.length || permHasAny(c, words));
    if (!cards.length) { toast('No legal target', `There is no ${phrase} on the battlefield.`); return; }
    openPickCards({ title: `${src}: choose target ${phrase}`, note: 'Choose the target.', cards, min: 1, max: 1, done: q => { const x = q && q[0]; if (x) apply(x); } });
  } };
}
