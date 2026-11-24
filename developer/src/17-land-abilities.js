// ---------------------------------------------------------------- land abilities (v0.62)
// Lands are read from their rules text: how much mana a {T} ability makes ({C}{C} lands), "Spend this mana only..." limits,
// damage / life paid for the mana, the Urza's tron bonus, and enters-with-counters (Dark Depths).
let PAY_CTX = null;   // the spell being paid for (null = none): decides whether restricted mana may be used
function withCtx(card, fn) { const old = PAY_CTX; PAY_CTX = card; try { return fn(); } finally { PAY_CTX = old; } }
const LAND_AB_CACHE = new Map();
function landManaAbilities(c) {
  if (!c || c.token || !isLandName(c.name)) return [];
  const i = cardInfo(c.name), tx = sagaStrip(((i && i.tx) || '') + (c.gained && c.gained.length ? '\n' + c.gained.join('\n') : '')); if (!tx) return [];
  const key = norm(c.name) + '|' + tx.length + '|' + tx.slice(-40);
  if (LAND_AB_CACHE.has(key)) return LAND_AB_CACHE.get(key);
  const nm = c.name.split(' // ')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const t = tx.replace(/\([^)]*\)/g, ' ').replace(selfNameRe(selfNm(c)), '~');   // v0.96.6: "this land" / "this artifact" as well as the printed name
  const out = []; let becomes = 0, bm;
  if ((bm = t.match(/Whenever ~ becomes tapped, it deals (\d+) damage to you/i))) becomes = +bm[1];
  for (const line of t.split('\n')) {
    const m = line.trim().replace(/^[A-Z][A-Za-z' ]+ \u2014 /, '').match(/^\{T\}(?:, Pay (\d+) life)?: (Add .*)$/i); if (!m) continue;
    const sents = m[2].split(/(?<=\.)\s+/), ab = { fixed: null, choice: null, any: false, only: '', dmg: becomes, life: +m[1] || 0, alt: null, unread: [] };
    const first = sents[0].replace(/\.$/, ''); let mm;
    if ((mm = first.match(/^Add (\{[WUBRGC]\}) for each (.+?)(?: you control| on the battlefield)?$/i))) ab.per = { col: mm[1][1], what: mm[2], ctrl: / you control$/i.test(first) };
    else if ((mm = first.match(/^Add ((?:\{[WUBRGC]\})+)$/i))) ab.fixed = [...mm[1].matchAll(/\{([WUBRGC])\}/g)].map(x => x[1]);
    else if ((mm = first.match(/^Add (\{[WUBRGC]\}(?:,? (?:or )?\{[WUBRGC]\})+)$/i))) ab.choice = [...mm[1].matchAll(/\{([WUBRGC])\}/g)].map(x => x[1]);
    else if (/^Add one mana of any color in your commander'?s colou?r identity$/i.test(first)) ab.cmdId = true;   // v0.99.73 Command Tower (CR 903.4f)
    else if (/^Add one mana of any color$/i.test(first)) ab.any = true;
    else continue;
    for (const sn of sents.slice(1)) { let q;
      if ((q = sn.match(/^Spend this mana only (?:to|on) (.*?)\.?$/i))) { let lim = q[1]; if (/,? and that spell can'?t be countered$/i.test(lim)) { ab.noCounter = true; lim = lim.replace(/,? and that spell can'?t be countered$/i, ''); }   // Cavern of Souls
        ab.only = c.chosen ? lim.replace(/the chosen type/i, 'the ' + c.chosen.toLowerCase() + ' type') : lim; }
      else if ((q = sn.match(/^~ deals (\d+) damage to you\.?$/i))) ab.dmg += +q[1];
      else if ((q = sn.match(/^If a card is exiled with ~, add ((?:\{[WUBRGC]\})+) instead\.?$/i))) ab.altExiled = [...q[1].matchAll(/\{([WUBRGC])\}/g)].map(x => x[1]);   // imprint-style: "If a card is exiled with this land, add {C}{C} instead"
      else if ((q = sn.match(/^If you control (.+?), add ((?:\{[WUBRGC]\})+) instead\.?$/i))) ab.alt = { need: q[1].split(/,? and /).map(x => x.replace(/^(?:an?|the) /i, '').trim()), fixed: [...q[2].matchAll(/\{([WUBRGC])\}/g)].map(x => x[1]) }; 
      else if ((q = sn.match(/^You lose (\d+) life\.?$/i))) ab.dmg += +q[1];
      else if ((q = sn.match(/^Activate (?:this ability )?only (.+?)\.?$/i))) ab.cond = q[1].trim();   // v0.99.71 CR 602.5b: Verge lands ("Activate only if you control a Plains or a Swamp"), Spire of Industry, Gathering Place
      else if (/^~ doesn'?t untap during your next untap step\.?$/i.test(sn)) ab.noUntap = true;   // Waterveil Cavern style: CR 502.3 the next untap step skips it
      else if ((q = sn.match(/^Each opponent gains (\w+) life\.?$/i)) && numOf(q[1])) ab.oppGain = numOf(q[1]);   // Grove of the Burnwillows
      else if ((q = sn.match(/^If that mana is spent on (?:an? )?(.+?), that spell can'?t be countered\.?$/i))) { ab.noCounter = true; ab.ncOn = q[1]; }   // Boseiju, Who Shelters All
      else if (sn.trim()) ab.unread.push(sn.trim()); }   // v0.96.6 every sentence of the ability is read; what is not understood is reported, never skipped silently
    out.push(ab);
  }
  LAND_AB_CACHE.set(key, out); return out;
}
// Does a "Spend this mana only to ..." limit allow paying for ctx (the spell or ability source)? Unknown limits are allowed.
function spendOnlyOk(only, ctx) {
  if (!only) return true; if (!ctx) return false;
  const i = ctx.token ? null : cardInfo(ctx.name), t = (i && i.t) || '', lo = only.toLowerCase();
  { const ct = lo.match(/creature spell of the ([a-z' -]+?) type/); if (ct && ct[1] !== 'chosen') return /\bCreature\b/.test(t) && (new RegExp('\\b' + ct[1].replace(/[^a-z ]/g, '') + '\\b', 'i').test(t) || /\bChangeling\b/i.test((i && i.tx) || '')); }
  if (/^instant or sorcery spells?$/.test(lo)) return /\b(?:Instant|Sorcery)\b/.test(t);
  if (/colorless eldrazi/.test(lo)) return !!i && !(i.col && i.col.length) && /\bEldrazi\b/.test(t);
  if (/\bartifact (?:spells|abilities)?/.test(lo) && /artifact/.test(lo)) return /\bArtifact\b/.test(t);
  if (/\bcreature spells?\b/.test(lo)) return /\bCreature\b/.test(t);
  return true;
}
// "If you control an Urza's Mine and an Urza's Power-Plant": these are land TYPES (CR 205.3i), not card names, so the condition is checked against the type line of each permanent
// (supertypes, card types and subtypes, punctuation ignored) \u2014 never against what the card is called.
const typeKey = t => String(t || '').toLowerCase().replace(/[\u2019']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
function hasTypePhrase(c, phrase) { const line = typeKey(frontType(c) || ''), want = typeKey(phrase); return !!want && (' ' + line + ' ').includes(' ' + want + ' '); }
function abFixed(ab, c) { if (ab.altExiled && c && c.imprint) return ab.altExiled; if (ab.per) return Array(Math.max(1, countPermsOf(ab.per.what))).fill(ab.per.col); if (ab.alt && state && ab.alt.need.every(n => state.battlefield.some(x => hasTypePhrase(x, n)))) return ab.alt.fixed; return ab.fixed; }
// The most productive fixed multi-mana ability of a land that may be used for ctx, or null (a normal one-mana land).
function landMulti(c, anyCtx) {
  let best = null;
  for (const ab of landManaAbilities(c)) { const f = abFixed(ab, c); if (!f || f.length < 2) continue; if (ab.only && !anyCtx && !spendOnlyOk(ab.only, PAY_CTX)) continue; if (!best || f.length > best.fixed.length) best = { fixed: f, dmg: ab.dmg, life: ab.life, only: ab.only }; }
  return best;
}
// Damage or life you pay each time a one-ability land is tapped (Mana Confluence, City of Brass). Lands with several abilities are left alone.
// v0.99.71 CR 602.5b + 605.3: a land with several mana abilities pays the cost of the ability that made the colour (a painland's {C} is free, its coloured mana deals 1 damage);
// an ability whose "Activate only ..." restriction is not met is not available at all.
function landAbUsable(ab, c) { return !ab.cond || staticCheck(ab.cond, c).ok !== false; }
function cmdIdentity() {   // the colours of your commander(s); none outside Commander mode
  if (!state) return []; const set = new Set();
  for (const z of ['command', 'battlefield', 'graveyard', 'exile', 'hand', 'library']) for (const c of state[z] || []) if (c.isCommander) { const s = colorIdentityOf(c.name); if (s) s.forEach(x => set.add(x)); }
  return [...set];
}
function abColors(ab) { if (ab.cmdId) return cmdIdentity(); if (ab.fixed) return ab.fixed.length === 1 ? ab.fixed : []; if (ab.choice) return ab.choice; if (ab.any) return ['W', 'U', 'B', 'R', 'G']; if (ab.per) return [ab.per.col]; return []; }
function landColorAbility(c, col) {
  const abs = landManaAbilities(c).filter(ab => landAbUsable(ab, c) && (col == null || abColors(ab).includes(col)));
  if (!abs.length) return null;
  const w = ab => (ab.dmg || 0) + (ab.life || 0) + (ab.noUntap ? 3 : 0) + (ab.oppGain ? 1 : 0);
  return abs.slice().sort((a, b) => w(a) - w(b))[0];
}
function landColorCost(c, col) { const ab = landColorAbility(c, col); return ab ? { dmg: ab.dmg, life: ab.life, noUntap: ab.noUntap, oppGain: ab.oppGain } : landTapCost(c); }
function landBlockedColors(c) {   // colours that only a restricted (unusable right now) ability of this land makes
  const abs = landManaAbilities(c); if (!abs.some(ab => ab.cond)) return [];
  const ok = new Set(), bad = new Set();
  for (const ab of abs) for (const k of abColors(ab)) (landAbUsable(ab, c) ? ok : bad).add(k);
  return [...bad].filter(k => !ok.has(k));
}
let LAND_PAY_COLS = new Map();   // card id -> the colour the last payment plan used it for (so its cost is the right ability's)
function landTapCost(c) { const a = landManaAbilities(c); return a.length === 1 && (a[0].dmg || a[0].life) ? { dmg: a[0].dmg, life: a[0].life } : null; }
// Mana taps (v0.72). A permanent tapped for mana remembers what it made (c.mt). Untapping it while that mana still floats takes the mana back out
// of the pool (and returns any life or damage the tap cost); once the mana is spent or has emptied, it stays tapped until a card effect or the untap step untaps it.
function noteManaTap(c, cols) { c.mt = { cols: (cols || []).slice(), spent: false, life: 0 }; }
function untapCheck(c) {
  const mt = c.mt; if (!c.tapped || !mt) return { ok: true, take: null };
  const why = `${c.name} was tapped for mana that has already been spent (or has emptied from your pool), so it stays tapped. Only a card effect, or your next untap step, can untap it.`;
  if (mt.spent) return { ok: false, why };
  const need = {}; for (const k of mt.cols) need[k] = (need[k] || 0) + 1;
  const pool = (state && state.manaPool) || {};
  for (const k of Object.keys(need)) if ((pool[k] || 0) < need[k]) return { ok: false, why };
  return { ok: true, take: need };
}
function untapByEffect(id) {   // a card effect untaps it: allowed, the mana it made (if any) stays where it is
  const f = findCard(id); if (!f || f.zone !== 'battlefield' || !f.card.tapped) return;
  snap(); f.card.tapped = false; delete f.card.mt; log(`${f.card.name}: untapped by a card effect`); render();
}
function applyLandCost(c, k) {
  if (!k) return;
  if (c.mt) c.mt.life += (k.life || 0) + (k.dmg || 0);
  if (k.life) { state.life -= k.life; log(`${c.name}: paid ${k.life} life for the mana → ${state.life}`); }
  if (k.dmg) { const d = preventDamage('you', k.dmg, c.name); state.life -= d; log(`${c.name}: dealt ${d} damage to you → ${state.life}`); }
  if (k.noUntap) { c.noUntapNext = state.turn; log(`${c.name}: it doesn't untap during your next untap step`); }
  if (k.oppGain && typeof oppGainBlocked === 'function' && oppGainBlocked()) log(`${c.name}: your opponent can't gain life this turn`);
  else if (k.oppGain) { state.oppLife = (state.oppLife ?? 20) + k.oppGain; log(`${c.name}: each opponent gains ${k.oppGain} life → ${state.oppLife}`); }
}
// "enters with N <kind> counters on it" (Dark Depths: ten ice counters)
function etbCounters(c) {
  if (!c || c.token) return;
  const nm = c.name.split(' // ')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let tx = cardText(c).replace(selfNameRe(selfNm(c)), '~');
  { const its = kwItems(tx); const mi = its.map(x => x.match(/^modular (\d+)$/i)).find(Boolean); if (mi) tx += `\n~ enters with ${mi[1]} +1/+1 counters on it.`;
    const vn = its.map(x => x.match(/^vanishing (\d+)$/i)).find(Boolean); if (vn) tx += `\n~ enters with ${vn[1]} time counters on it.`;   // CR 702.63a
    const fd = its.map(x => x.match(/^fading (\d+)$/i)).find(Boolean); if (fd) tx += `\n~ enters with ${fd[1]} fade counters on it.`; }   // CR 702.32a   // v0.96.1 modular (CR 702.43a)
  const m = tx.match(/\benters(?: the battlefield)? with (twice )?(an?|one|two|three|four|five|six|seven|eight|nine|ten|\d+|X) ([a-z][a-z-]*|\+1\/\+1|[−-]1\/[−-]1) counters? on it/i);   // v0.99.32 also "twice X"
  if (!m) return;
  if (!etbCounterCondOk(c, tx)) return;   // v0.99.81 Raid: "... counter on it if you attacked this turn"
  // v0.84 "...counter on it for each <type> card exiled with it" (Murktide Regent): one per matching card exiled while casting it (delve), not a flat one.
  const fe = tx.match(/\bcounters? on it for each ([^.]+?)(?:\.|$)/im);
  let n;
  if (fe) {
    const em = /^(.+?) cards? exiled with it$/i.exec(fe[1].trim());
    if (em) { const phrase = em[1].replace(/\s+and\s+/g, ' or '); n = (c.exiledWith || []).filter(e => filterMatches(phrase, { name: e.name })).length; log(`${c.name}: ${n} ${em[1]} card${n === 1 ? '' : 's'} exiled with it while casting it: enters with ${n} counter${n === 1 ? '' : 's'}`); if (!n) return; }
    else { log(`${c.name}: enters with counters "for each ${fe[1]}": count them yourself and add the counters by hand`); toast('Add counters by hand', `${c.name} gets one counter for each ${fe[1]}. The app cannot count that, so add them from the card menu.`); return; }
  } else n = (m[1] ? 2 : 1) * (/^x$/i.test(m[2]) ? (+c.xValue || 0) : /^\d+$/.test(m[2]) ? +m[2] : (TOKEN_NUMW[m[2].toLowerCase()] || 1));   // CR 107.3m: X is 0 unless it was cast with X chosen
  if (!n) return;
  let kind = m[3].toLowerCase(); if (kind === 'loyalty') return;
  const key = kind === '+1/+1' ? 'plus' : /^[−-]1/.test(kind) ? 'minus' : kind;
  if (typeof c.counters === 'number') c.counters = { plus: c.counters, minus: 0 };
  c.counters = c.counters || { plus: 0, minus: 0 };
  const adj = adjustCounterAdd(c, key, n, false); c.counters[key] = (c.counters[key] || 0) + adj; log(`${c.name} entered with ${adj} ${kind} counter${adj === 1 ? '' : 's'}${/^x$/i.test(m[2]) ? ` (X = ${+c.xValue || 0})` : ''}`);
}
// State-triggered "When ~ has no <kind> counters on it, ..." (Dark Depths): queued once each time the last counter goes away.
function checkNoCounterTriggers() {
  if (!state) return;
  for (const c of state.battlefield) {
    if (c.token) continue; const tx = cardText(c); if (!tx || !/has no [a-z+\/-]+ counters on it/i.test(tx)) continue;
    const nm = c.name.split(' // ')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), t = tx.replace(selfNameRe(selfNm(c)), '~');
    const m = t.match(/^(When(?:ever)? ~ has no ([a-z+\/-]+) counters on it),\s*(.*)$/im); if (!m) continue;
    const key = m[2].toLowerCase() === '+1/+1' ? 'plus' : m[2].toLowerCase(), cc = typeof c.counters === 'number' ? { plus: c.counters } : (c.counters || {});
    if ((cc[key] || 0) > 0) { c._noCtr = false; continue; }
    if (c._noCtr || c.enteredTurn === undefined) continue;
    c._noCtr = true;
    state.pendingTriggers.push({ kind: 'ability', cardId: c.id, cardName: c.name, text: m[0], effect: m[3], special: null, optional: /\byou may\b/i.test(m[3]), why: `${c.name} has no ${m[2]} counters on it, so this state-triggered ability triggers.` });
  }
}
// Vesuva: "You may have it enter the battlefield tapped as a copy of any land on the battlefield."
function openVesuva(id) {
  const f = findCard(id); if (!f || f.zone !== 'battlefield') return; const c = f.card;
  const lc = entersAsLandCopy(c) || { from: 'battlefield', addType: '' }, pool = lc.from === 'graveyard' ? state.graveyard : state.battlefield;
  const lands = []; for (const x of pool) if (x.id !== c.id && isLandName(x.name) && !lands.some(l => l.name === x.name)) lands.push(x);
  const m = modal(c.name + ': copy a land?', { width: 520, sticky: true, noClose: true });
  m.body.append(h('div', { class: 'psub', text: `You may have it enter tapped as a copy of any land ${lc.from === 'graveyard' ? 'card in a graveyard' : 'on the battlefield'}. As a copy it has that land’s name, types and abilities${lc.addType ? `, and it is also a ${lc.addType}` : ''}. It goes back to being itself if it leaves the battlefield.` }));
  const done = () => { m.close(); render(); if (state.pendingTriggers.length) resolvePendingTrigger(); };
  for (const l of lands) m.body.append(h('div', { class: 'row' }, h('span', { class: 'nm', text: l.name }), h('button', { class: 'primary', text: 'Copy it', onclick: () => {
    snap(); c.origName = c.name; c.name = l.name; c.tapped = true; c.counters = { plus: 0, minus: 0 }; if (lc.addType) c.extraTypes = [lc.addType]; log(`${c.origName} entered tapped as a copy of ${l.name}${lc.addType ? ` (also a ${lc.addType})` : ''}`);
    etbCounters(c); const etb = landETBTrigger(c); if (etb) queueTrigger(etb); fireTrigger('etb', { card: c }); done(); } })));
  m.foot.append(h('button', { text: 'Enter as itself (no copy)', onclick: done }));
}
function manaSources() {
  const out=[];
  if(!state) return out;
  for(const c of state.battlefield){
    if(!isManaPermanent(c)) continue;
    if(!isLandName(c.name)){
      const r=rockInfo(c), st=rockStatus(c);
      if(r.payMana) continue;   // v0.99.73 a mana ability with a mana cost (Signet) is used by hand, not by the automatic payment
      if(r.tap && c.tapped) continue;   // v0.99.32 a sacrifice-only mana ability (Eldrazi Spawn) has no {T}: a tapped creature can still pay with it
      if(st.ok===false) continue;
      if(PAY_CTX && r.noSpend==='nonartifact' && !state.battlefield.includes(PAY_CTX) && !/\bArtifact\b/.test(PAY_CTX.token ? ((PAY_CTX.tk&&PAY_CTX.tk.type)||'') : ((cardInfo(PAY_CTX.name)||{}).t||'').split(' // ')[0])) continue;   // "This mana can't be spent to cast a nonartifact spell"
      if(PAY_CTX && r.only && !spendOnlyOk(r.only, PAY_CTX)) continue;               // restriction clearly not met: not offered automatically (tap it by hand to override)
      if(r.fixed) r.fixed.forEach((col,k)=>out.push({card:c, colors:new Set([col]), any:true, slot:k, of:r.fixed.length, sac:!!r.sac}));
      else out.push({card:c, colors:new Set(rockColors(c)), any:true, slot:0, of:1, sac:!!r.sac});
      continue;
    }
    if(c.tapped) continue;
    // Same colour logic as tapping by hand: printed mana plus the basic land types the board gives it
    // (Leyline of the Guildpact, Dryad of the Ilysian Grove, Urborg, Blood Moon...).
    { const om = ovrLandMana(c); if (om) { if (!om.length) continue; om.forEach((col,k)=>out.push({card:c, colors:new Set([col]), any:true, slot:k, of:om.length})); continue; } }   // a land that lost its abilities (Song of the Dryads, Imprisoned in the Moon)
    const lm=landMulti(c);
    if(lm){ lm.fixed.forEach((col,k)=>out.push({card:c, colors:new Set([col]), any:true, slot:k, of:lm.fixed.length})); continue; }
    const cols=landManaColors(c);
    if(!cols.length) continue;
    out.push({card:c, colors:new Set(cols), any:true});
  }
  return out;
}
function manaCostParts(mc){
  const out={generic:0, colors:[], flexible:[], hyb:[]};
  if(!mc) return out;
  const re=/\{([^}]+)\}/g; let m;
  while((m=re.exec(mc))){
    const x=m[1].toUpperCase();
    if(/^\d+$/.test(x)) out.generic+=+x;
    else if(/^[WUBRG]$/.test(x)) out.colors.push(x);
    else if(x==='C') out.colors.push('C');
    else { out.flexible.push(x);
      // v0.96.6 CR 107.4: hybrid {W/U}, two-brid {2/W} and Phyrexian {W/P} / {W/U/P} symbols. Each is paid one of its ways, never as plain generic.
      const ps = x.split('/'), phy = ps.includes('P'), two = ps[0] === '2', opts = ps.filter(q => /^[WUBRGC]$/.test(q));
      out.hyb.push({ sym: x, opts, phy, two }); }
  }
  return out;
}
function canPayMana(c){ return withCtx(c,()=>canPayMana0(c)); }
function canPayMana0(c){
  const i=cardInfo(c.name); if(!i || i.land || !i.mc) return null;
  // X spells are castable when they can be paid with X = 0; the player picks X when casting.
  if(i.mc.split(' // ')[0].includes('{X}')) return maxXFor(c)>=0 ? {ok:true,reason:''} : {ok:false,reason:'amount'};
  const routes=castRoutes(c,'');
  if(routes.some(r=>r.ok)) return {ok:true,reason:''};
  return {ok:false,reason:routes[0].why,detail:routes[0].detail};
}
// v0.99.76 an ability you can activate from your hand right now also makes the card glow (Ninjutsu after blockers, cycling, reinforce)
function handAbilityReady(c){
  if(!state || state.phase!=='play' || state.discarding || holdForTriggers() || !c || c.token) return '';
  if(state.step===0 || state.step===CLEANUP || (typeof splitSecondOn==='function' && splitSecondOn())) return '';
  try{
    { const nj=ninjutsuFor(c); if(nj && !ninjutsuWhy(c) && manaFeasible(c,nj.cost)) return `Ninjutsu (${nj.cost}) can be activated now`; }
    { const cy=cyclingFor(c); if(cy){ const mana=cy.comps.filter(k=>k.k==='mana').map(k=>k.mana).join(''), rest=cy.comps.filter(k=>k.k!=='mana'); if((!mana || manaFeasible(c,mana)) && !compsFeasible(rest.filter(k=>k.k!=='other'),c.id)) return `${cy.label} can be activated now`; } }
    { const rf=reinforceFor(c); if(rf && state.battlefield.some(x=>permZone(x)==='creatures') && manaFeasible(c,rf.cost)) return `Reinforce ${rf.n} (${rf.cost}) can be activated now`; }
  }catch(e){ return ''; }
  return '';
}
function handInteraction(c){ const r=handInteractionSpell(c); return r!=='ready' && handAbilityReady(c) ? 'ready' : r; }
function handInteractionSpell(c){
  const ho=halfOptions(c); if(!ho.length) return handInteraction0(c);
  const rank={ready:3,mana:2,timing:1,'':0}; let best=null;
  for(const o of ho){ const r=withHalf(c,o.fi,()=>handInteraction0(c)); if(best===null||(rank[r]||0)>(rank[best]||0)) best=r; }
  return best||'';
}
function handInteraction0(c){
  if(!state || state.phase!=='play' || state.discarding || holdForTriggers()) return '';
  if(isLandName(c.name)) return canPlayLandNow() ? 'ready' : 'timing';
  if(!canCastNow(c)) return 'timing';
  const mana=canPayMana(c);
  if(mana && !mana.ok) return 'mana';
  return mana && mana.ok ? 'ready' : '';
}
// Plain-words reason a hand card is not playable right now (used for tooltips).
function handWhy(c){
  const ho=halfOptions(c); if(!ho.length) return handWhy0(c);
  let first=null; for(const o of ho){ const w=withHalf(c,o.fi,()=>handWhy0(c)); if(!w) return ''; if(first===null) first=w; }
  return first||'';
}
function handWhy0(c){
  if(!state || state.phase!=='play') return '';
  if(state.discarding) return 'Choose cards to discard first';
  if(holdForTriggers()) return '';
  if(state.step===0 || state.step===CLEANUP) return 'No player gets priority in this step';
  if(isLandName(c.name)){
    if(canPlayLandNow()) return '';
    if(state.stack.length) return 'Lands cannot be played while something is on the stack';
    if(!isMainPhase()) return 'Lands can only be played in your main phase';
    if(landDropUsed()) return 'You already used all your land plays this turn';
    return '';
  }
  if(!canCastNow(c)) return state.stack.length ? 'Only instants and cards with flash can be cast while something is on the stack' : 'Sorcery speed: only in your main phase with an empty stack';
  const m=canPayMana(c);
  if(m && !m.ok) return m.reason==='condition' ? `You cannot use that way of casting it: ${m.detail}` : m.reason==='additional' ? `You cannot pay the additional cost: ${m.detail}` : m.reason==='color' ? 'You have enough mana in total, but not the right colours' : 'Not enough mana';
  return '';
}
function handTip(c){ const i=handInteraction(c); if(!i) return ''; if(i==='ready' && handInteractionSpell(c)!=='ready'){ const ab=handAbilityReady(c); if(ab) return ' — '+ab; } return i==='ready' ? ' — playable now' : ' — ' + handWhy(c); }

// Does this permanent have a non-mana activated ability (or loyalty / fetch ability) that can be activated right now?
// Mana abilities of lands and rocks are not highlighted, otherwise every land would glow.
function activationReady(c) {
  if (!state || state.phase !== 'play' || holdForTriggers() || state.discarding || state.step === 0 || state.step === CLEANUP) return '';
  if (!c.token && isPlaneswalker(c)) { const a = pwAbilities(c).find(x => !pwBlock(c, x)); return a ? `A loyalty ability can be activated (${a.label})` : ''; }
  if (isLandName(c.name) && fetchInfo(c)) return !c.tapped ? 'Can be sacrificed to search for a land' : '';
  const list = activatedAbilitiesFor(c);
  const ok = list.find(ab => !abilityReady(c, ab));
  return ok ? `Ability can be activated: ${ok.cost}` : '';
}
// ---- foil (v0.54): a holographic sheen. Off / every card / about one card in five (stable per card).
function isFoil(c) {
  const m = settings.foil || 'off'; if (m === 'off' || !c || c.token) return false;
  return m === 'all' || (((c.id * 2654435761) >>> 0) % 5 === 0);
}
const foilEl = () => h('i', { class: 'foilfx' });
document.addEventListener('mousemove', e => {
  const t = e.target && e.target.closest && e.target.closest(document.body.classList.contains('hand3d') ? '.foil, .cardrow .card, #preview .pwrap' : '.foil, #preview .pwrap'); if (!t) return;
  const r = t.getBoundingClientRect(); if (!r.width) return;
  t.style.setProperty('--fx', Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100)).toFixed(0) + '%');
  t.style.setProperty('--fy', Math.max(0, Math.min(100, (e.clientY - r.top) / r.height * 100)).toFixed(0) + '%');
  t.style.setProperty('--rx', (((e.clientX - r.left) / r.width - 0.5) * 2).toFixed(2)); t.style.setProperty('--ry', (((e.clientY - r.top) / r.height - 0.5) * 2).toFixed(2));
});
function cardEl(c, zone) {
  const info = c.token ? null : cardInfo(c.name);
  const pw = !c.token && isPlaneswalker(c);
  const ptc = ((!pw || selfBecomes(c)) && zone === 'battlefield' && permZone(c) === 'creatures' && (c.token || info)) ? ptCalc(c) : null;
  const pt = pw && !selfBecomes(c) ? null : ptc ? ptText(c) : (c.token ? c.tk.pt : info && info.pt);
  const e = h('div', {
    class: `card c-${colorClass(c)}${isFoil(c) ? ' foil' : ''}${pt ? ' haspt' : ''}${c.tapped ? ' tapped' : ''}${c.prepared ? ' prepared' : ''}${selected === c.id ? ' sel' : ''}${bottomSel.has(c.id) ? ' bsel' : ''}${zone === 'hand' && state && (state.discarding || (state.phase === 'mull' && state.bottomPhase)) ? (!handPick || !handPick.ok || handPick.ok(c) ? ' pickable' : ' nopick') : ''}${zone === 'hand' && teach('playability') ? ' cast-' + handInteraction(c) : ''}${zone === 'hand' && isInstantSpeed(c) && teach('playability') ? ' instant-speed' : ''}${zone === 'battlefield' && teach('playability') && activationReady(c) ? ' cast-ready act-ready' : ''}${zone === 'battlefield' && teach('summoningSick') && isSick(c) ? ' sick' : ''}`,
    draggable: 'true', 'data-id': c.id, title: c.name + (!c.token && cardInfo(c.name) && cardInfo(c.name).mc ? '  ' + cardInfo(c.name).mc : '') + (zone === 'hand' ? handTip(c) : '') + (zone === 'battlefield' && teach('playability') && activationReady(c) ? ' — ' + activationReady(c) : '') + (zone === 'battlefield' && teach('summoningSick') && isSick(c) ? ' — ' + SICK_TEXT : '')
  },
    isFoil(c) ? foilEl() : null,
    h('div', { class: 'ctop' },
      h('span', { class: 'cname', text: c.name }),
      info && !info.land && info.mc ? (() => { const ec = zone === 'hand' || zone === 'stack' ? effectiveCost(c) : null; const red = ec && ec.reduced; return h('span', { class: 'cmc' + (red ? (ec.increased ? ' increased' : ' reduced') : ''), text: String(red ? symCmc(ec.cost) : Math.round(info.cmc)), title: red ? `Costs ${ec.cost.replace(/[{}]/g, '') || '0'} now (printed ${info.mc.replace(/[{}]/g, '')}; ${ec.why})` : '' }); })() : null),
    h('div', { class: 'ctype', text: c.token ? ((c.tk && c.tk.type) || 'Token') : info ? ((c.becomes || hasOvr(c)) && zone === 'battlefield' ? frontType(c) : info.t) : '' }),
    pt ? (() => { const d = ptc ? ptDelta(ptc) : ''; const prev = lastPT.get(c.id); lastPT.set(c.id, pt); const flash = prev !== undefined && prev !== pt;
      return h('div', { class: 'cpt' + (ptc && (ptc.dynamic || ptc.modified) ? ' ptmod' : '') + (d ? ' pt-' + d + ' ptshow' : '') + (flash ? ' ptflash' : ''), text: pt, 'data-len': String(String(pt).length), title: ptc ? ptTitle(c, ptc) : '' }); })() : null,
    pw && zone === 'battlefield' ? h('div', { class: 'cloyalty', text: String(c.loyalty ?? '?'), title: 'Loyalty counters. Double-click to use loyalty abilities.' }) : null,
    !c.token && isLandName(c.name) && effectiveLandTypes(c).types.length && effectiveLandTypes(c).types.join('|') !== baseLandTypesOf(c.name).types.join('|') ? h('div', { class: 'land-effect-badge', text: effectiveLandTypes(c).types.map(t => t[0]).join(' '), title: `Effective land types: ${effectiveLandTypes(c).types.join(', ')}` }) : null,
    zone === 'battlefield' && !c.token && teach('gapBadges') && ruleGaps(c).length ? h('div', { class: 'gapbadge', text: '\u26a0', title: 'The app only reminds you of these rules (apply them by hand):\n' + ruleGaps(c).map(g => '\u2022 ' + g.text).join('\n') }) : null,
    zone === 'battlefield' && c.mutParts ? h('div', { class: 'fxbadge', text: '\u29c9 Mutated \u00d7' + c.mutParts.length, title: 'A merged permanent: ' + c.mutParts.map(x => x.name).join(' + ') + '. It has all of their abilities; the top card is ' + c.mutParts[0].name }) : null,
    zone === 'battlefield' && c.pairedWith ? h('div', { class: 'fxbadge', text: '\u26D3 Paired', title: 'Soulbond: paired with another creature for as long as you control both' }) : null,
    zone === 'battlefield' ? kwIconsOnTile(c) : null,
    zone === 'battlefield' && state && teach('durationHints') && fxOn(c).length ? h('div', { class: 'fxbadge', title: fxOn(c).map(e => `${e.kind === 'pt' ? sgnN(e.p) + '/' + sgnN(e.t) : e.kind === 'kw' ? e.kw : e.text} ${UNTIL_WORDS[e.until] || ''}`).join('\n'), text: '\u23F3' }) : null,
    !c.token && usesDelirium(c) && state ? (() => { const n = deliriumCount(); return h('div', { class: 'delirium-badge' + (n >= 4 ? ' on' : ''), text: `\u0394 ${Math.min(n, 4)}/4`, title: `Delirium: ${n} card type${n === 1 ? '' : 's'} among cards in your graveyard (${n >= 4 ? 'active' : 'needs four'})` }); })() : null,
    !c.token && usesDomain(c) ? h('div', { class: 'domain-badge', text: `${domainCount()}/5`, title: 'Domain: distinct basic land types among lands you control' }) : null,
    (() => { const cc=typeof c.counters==='number'?{plus:c.counters,minus:0}:(c.counters||{plus:0,minus:0}); const chips=[];   // v0.94.3 one chip per kind of counter: the count first, then which counter it is
      const chip=(cls,n,label,tip)=>h('span',{class:'ctr '+cls,title:tip},h('b',{class:'ctr-n',text:String(n)}),h('span',{class:'ctr-k',text:label}));
      if(cc.plus)chips.push(chip('plus',cc.plus,'+1/+1',`${cc.plus} +1/+1 counter${cc.plus===1?'':'s'} (the creature gets +${cc.plus}/+${cc.plus})`)); if(cc.minus)chips.push(chip('minus',cc.minus,'\u22121/\u22121',`${cc.minus} \u22121/\u22121 counter${cc.minus===1?'':'s'}`));
      for(const k of Object.keys(cc)) if(k!=='plus'&&k!=='minus'&&cc[k]) chips.push(chip('other',cc[k],k,`${cc[k]} ${k} counter${cc[k]===1?'':'s'}`));
      if(c.chosen) chips.push(h('span',{class:'ctr chosen',title:'Chosen'},h('span',{class:'ctr-k',text:'\u201c'+c.chosen+'\u201d'})));
      return chips.length?h('div',{class:'cbadge'},...chips):null; })(),
    zone === 'battlefield' && state && (c.att || attachmentsOf(c).length) ? (() => { const hst = hostOf(c), ats = attachmentsOf(c); return h('div', { class: 'attbadge', text: hst ? '\u2192 ' + hst.name : '\u2694 ' + ats.map(a => a.name).join(', '), title: hst ? `${c.name} is attached to ${hst.name}.` : `Attached to this: ${ats.map(a => a.name).join(', ')}` }); })() : null,
    c.token ? h('div', { class: 'ctoken', text: 'token' }) : null
  );
  const im = cardArt(c);
  if (im) {
    e.classList.add('hasimg');
    const img = h('img', { class: 'cimg', src: im.front, draggable: 'false', alt: '' });
    img.addEventListener('error', () => { e.classList.remove('hasimg'); img.remove(); });
    e.prepend(img);
  }
  e.addEventListener('mouseenter', () => showPreview(c));
  e.addEventListener('click', ev => { ev.stopPropagation(); onCardClick(c, zone); });
  e.addEventListener('dblclick', ev => { ev.stopPropagation(); onCardDbl(c, zone); });
  e.addEventListener('contextmenu', ev => { ev.preventDefault(); ev.stopPropagation(); showCardMenu(c, zone, ev.clientX, ev.clientY); });
  if (animOn('cardDrag')) { e.removeAttribute('draggable'); e.addEventListener('pointerdown', ev => pointerDragBegin(ev, e, c, zone)); }
  else {
    e.addEventListener('dragstart', ev => { ev.dataTransfer.setData('text/plain', 'mtg:' + c.id); ev.dataTransfer.effectAllowed = 'move'; e.classList.add('dragging'); dragHand = zone === 'hand' ? c.id : null; });
    e.addEventListener('dragend', () => { e.classList.remove('dragging'); dragHand = null; clearHandMarker(); });
  }
  return e;
}

function onCardClick(c, zone) {
  hideMenu();
  if (zone === 'hand' && ((state.phase === 'mull' && state.bottomPhase) || state.discarding)) {
    const lim = state.discarding || state.mulls;
    if (handPick && handPick.ok && !handPick.ok(c)) { toast('Cannot choose that', 'That card is not an allowed choice.'); return; }
    if (bottomSel.has(c.id)) bottomSel.delete(c.id);
    else if (bottomSel.size < lim) bottomSel.add(c.id);
    render();
    return;
  }

  // Lands now use a single click to activate their mana ability. This keeps
  // the interaction close to a real tabletop: click an untapped mana land,
  // choose a colour when necessary, and the mana is added to the floating
  // pool while the land becomes tapped. Other permanents retain selection.
  if (zone === 'battlefield' && isLandName(c.name) && !c.tapped) {
    tapForMana(c.id);
    return;
  }

  selected = selected === c.id ? null : c.id;
  render();
}

function openAbilityPicker(c) {
  const L = activatedAbilitiesFor(c), m = modal(`${c.name}: activate an ability`, { width: 580 });
  const why = { tap: 'it must be untapped and not summoning sick', counters: 'not enough counters', life: 'not enough life', cost: 'you cannot pay the cost', restriction: 'a timing restriction is not met', mana: 'not enough mana' };
  m.body.append(h('div', { class: 'psub', text: 'You may activate this any time you have priority (and only as a sorcery if the ability says so). Pick one.' }));
  for (const ab of L) { const r = abilityReady(c, ab); m.body.append(h('div', { class: 'row' + (r ? ' dim' : '') }, h('span', { class: 'nm', text: `${ab.cost}: ${ab.effect}` }), h('button', { class: r ? '' : 'primary', text: 'Activate', title: r ? 'Cannot now: ' + (why[r] || r) : '', onclick: () => { m.close(); activateAbility(c.id, false, ab.ix); } }))); }
  m.foot.append(h('button', { text: c.tapped ? 'Untap it instead' : 'Tap it instead', onclick: () => { m.close(); toggleTap(c.id); } }), h('button', { text: 'Close', onclick: () => m.close() }));
}
let lastDblAct = { id: null, t: 0 };
function onCardDbl(c, zone) {
  if (!state || state.phase !== 'play' || state.discarding || holdForTriggers()) return;
  // v0.99.62 one double tap = one action. Phones can deliver the double tap twice (the browser's own and the touch layer's), which opened a spell's choices twice.
  { const now = Date.now(); if (lastDblAct.id === c.id && now - lastDblAct.t < 600) return; lastDblAct = { id: c.id, t: now }; }
  if (document.querySelector('#modalRoot .modal, #stackStage .modal.res-panel') && zone === 'hand') return;   // a spell is already being cast (its choices are open)
  if (zone === 'battlefield') {
    if (isPlaneswalker(c)) openLoyalty(c);
    else if (isLandName(c.name) && fetchInfo(c) && !c.tapped) openFetch(c);
    else if (isManaPermanent(c) && !c.tapped && !isSacManaSource(c)) tapForMana(c.id);
    else if (!/\bCreature\b/.test(frontType(c)) && !isLandName(c.name) && activatedAbilityFor(c)) { const L = activatedAbilitiesFor(c); const ab = L.find(x => !abilityReady(c, x)) || L[0]; activateAbility(c.id, false, ab.ix); }
    else if (!isLandName(c.name) && activatedAbilitiesFor(c).some(x => !abilityReady(c, x))) openAbilityPicker(c);   // v0.86: a creature with a usable ability (Psychic Frog): choose which
    else toggleTap(c.id);
  }
  else if (zone === 'hand') {
    if (isLandName(c.name)) playLand(c.id);
    else if (isSpellCard(c) || isInstantSpeed(c)) castSpell(c.id);
    else if (canPlaySorcerySpeedNow()) moveCard(c.id, 'battlefield');
    else toast('Wrong phase', 'This card can only be played during your main phase.');
  }
}


// v0.99.20 the big card preview leans toward the pointer again (a soft 3D tilt with a light spot) and settles back when the pointer leaves it.
document.addEventListener('mouseout', e => {
  const t = e.target && e.target.closest && e.target.closest('#preview .pwrap'); if (!t || t.contains(e.relatedTarget)) return;
  t.style.setProperty('--rx', '0'); t.style.setProperty('--ry', '0'); t.style.setProperty('--fx', '50%'); t.style.setProperty('--fy', '50%');
});
