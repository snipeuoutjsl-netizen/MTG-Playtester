// ---------------------------------------------------------------- v0.96.26 global static abilities of permanents, read from rules text
// Each is a short pattern for a whole FAMILY of cards (Oracle wording), checked against every permanent on the battlefield.
//  CR 508.1c-style attack restriction:  "Creatures with power greater than the number of cards in your hand can't attack."   (Ensnaring Bridge)
//  CR 603.2g (events that don't cause abilities to trigger):  "Creatures entering don't cause abilities to trigger."   (Torpor Orb)
//  CR 614.12 / 401.? zone restrictions:  "Creature cards in graveyards and libraries can't enter the battlefield." / "Players can't cast spells from graveyards or libraries."  (Grafdigger's Cage)
//  CR 614.1 replacement of mana loss:  "If you would lose unspent mana, that mana becomes colorless instead."   (Omnath, Locus of the Void)
//  CR 118.7 cost increase per spell cast:  "Each spell a player casts costs {1} more to cast for each other spell that player has cast this turn."   (Damping Sphere)
//  CR 614.12 enters untapped:  "Lands you control enter untapped." / "Permanents you control enter untapped."
function globalLines() {
  if (!state) return [];
  const out = [];
  for (const g of state.battlefield) { if (g.token) continue; const i = cardInfo(g.name); if (!i || !i.tx) continue;
    for (const ln of i.tx.replace(/\([^)]*\)/g, '').replace(/[’]/g, "'").split('\n')) out.push({ g, ln: ln.trim() }); }
  return out;
}
function globalHas(re) { return globalLines().find(x => re.test(x.ln)) || null; }
// Ensnaring Bridge family
function globalAttackBlock(c) {
  const cr = ptCalc(c);
  for (const { g, ln } of globalLines()) {
    let m = ln.match(/^Creatures with power greater than the number of cards in your hand can't attack\.?$/i);
    if (m && cr.p > state.hand.length) return `${g.name}: creatures with power greater than the number of cards in your hand (${state.hand.length}) can't attack.`;
    m = ln.match(/^Creatures with power (\d+) or (greater|less) can't attack\.?$/i);
    if (m && (m[2].toLowerCase() === 'greater' ? cr.p >= +m[1] : cr.p <= +m[1])) return `${g.name}: creatures with power ${m[1]} or ${m[2]} can't attack.`;
  }
  return '';
}
const torporOrbOn = c => !!c && /\bCreature\b/.test(frontType(c) || '') && !!globalHas(/^Creatures entering don't cause abilities to trigger\.?$/i);
const cageBlocksEnter = (c, from) => (from === 'graveyard' || from === 'library') && !!c && /\bCreature\b/.test(frontType(c) || '') && globalHas(/^Creature cards in graveyards and libraries can't enter the battlefield\.?$/i);
const cageBlocksCast = () => !!globalHas(/^Players can't cast spells from graveyards or libraries\.?$/i);
const omnathColorless = () => !!globalHas(/^If you would lose unspent mana, that mana becomes colorless instead\.?$/i);
const landsEnterUntapped = c => !!c && !c.token && /\bLand\b/.test(frontType(c) || '') && !!globalHas(/^(?:Lands|Permanents) you control enter untapped\.?$/i);
function perSpellTaxAdj(c) {
  const out = []; if (!state || !c) return out; const n = spellsCastNow();
  for (const { g, ln } of globalLines()) { const m = ln.match(/^Each spell a player casts costs \{(\d+)\} more to cast for each other spell that player has cast this turn\.?$/i); if (m && n > 0) out.push({ src: g.name, dir: 'more', amt: +m[1] * n }); }
  return out;
}
const GLOBAL_STATIC_RES = [
  /^Creatures with power (?:greater than the number of cards in your hand|\d+ or (?:greater|less)) can't attack\.?$/i, /^Creatures entering don't cause abilities to trigger\.?$/i,
  /^Creature cards in graveyards and libraries can't enter the battlefield\.?$/i, /^Players can't cast spells from graveyards or libraries\.?$/i,
  /^If you would lose unspent mana, that mana becomes colorless instead\.?$/i, /^Each spell a player casts costs \{\d+\} more to cast for each other spell that player has cast this turn\.?$/i,
  /^(?:Lands|Permanents) you control enter untapped\.?$/i, /^~ can't be blocked by creatures with power \d+ or less\.?$/i];
const globalStaticLine = line => GLOBAL_STATIC_RES.some(re => re.test(String(line || '').trim().replace(/[\u2019]/g, "'")));

// CR 202.3: a spell's mana value, with X taken from the value chosen for it on the stack (CR 202.3e). "Whenever a player casts a spell with mana value equal to the number of charge counters on this artifact, counter that spell."
function spellMV(sp) {
  const info = sp && !sp.token ? cardInfo(sp.name) : null; if (!info) return 0; const mc = String(info.mc || '').split(' // ')[0], nx = (mc.match(/\{X\}/g) || []).length;
  return symCmc(mc.replace(/\{X\}/g, '')) + nx * (sp.xValue || 0);
}
function castAnyOk(ca, sp, src) {
  if (!ca) return false; const mv = spellMV(sp);
  if (ca.counters) { const kk = ca.counters.toLowerCase() === '+1/+1' ? 'plus' : ca.counters.toLowerCase(); return mv === counterCount(src, kk); }
  if (ca.mv === null) return true;
  return ca.cmp === 'less' ? mv <= ca.mv : ca.cmp === 'greater' ? mv >= ca.mv : mv === ca.mv;
}
