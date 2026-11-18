// ---------------------------------------------------------------- mana rocks + soft static-ability checks
// A mana rock is a nonland permanent with a plain "{T}: Add ..." line. Supported: Add {C}. / Add {C}{C}. / Add {R} or {G}.
// / Add one mana of any color. / Add one mana of any color among legendary creatures and planeswalkers you control.
// Extra sentences like "Activate only if you control a Dragon." are checked softly (see staticCheck).
const ROCK_CACHE = new Map();
function rockInfo(c) {
  if (!c || (!c.token && isLandName(c.name))) return null;
  const tx = cardText(c);
  if (!tx) return null;
  const key = (c.token ? 'tok:' : '') + norm(c.name);
  if (ROCK_CACHE.has(key + '|' + tx.length + '|' + tx.slice(0, 40))) return ROCK_CACHE.get(key + '|' + tx.length + '|' + tx.slice(0, 40));
  let out = null;
  for (const line of tx.split('\n')) {
    const m = line.trim().replace(/^[A-Z][A-Za-z' ]+ \u2014 /, '').match(/^\{T\}: Add (.+)$/);   // v0.95.2 ability words (Metalcraft \u2014, Threshold \u2014 ...) are just labels
    if (!m) continue;
    const body = m[1];
    const first = body.split(/(?<=\.)\s+/)[0], rest = body.slice(first.length).trim();
    let r = null;
    let mm;
    if ((mm = first.match(/^((?:\{[WUBRGC]\})+)\.?$/))) r = { fixed: [...mm[1].matchAll(/\{([WUBRGC])\}/g)].map(x => x[1]) };
    else if ((mm = first.match(/^(\{[WUBRGC]\}(?:,? (?:or )?\{[WUBRGC]\})+)\.?$/))) r = { choice: [...mm[1].matchAll(/\{([WUBRGC])\}/g)].map(x => x[1]) };
    else if (/^one mana of any color among legendary creatures and planeswalkers you control\.?$/i.test(first)) r = { among: true, choice: [] };
    else if ((mm = first.match(/^\{([WUBRGC])\} for each (.+?) you control\.?$/i))) r = { fixed: [mm[1]], per: mm[2] + ' you control' };   // CR 106.1: Elvish Archdruid, Gaea's Cradle style
    else if ((mm = first.match(/^(two|three|four|five) mana of any one color\.?$/i))) r = { choice: ['W', 'U', 'B', 'R', 'G'], multi: ({ two: 2, three: 3, four: 4, five: 5 })[mm[1].toLowerCase()] };   // Gilded Lotus
    else if (/^one mana of any color\.?$/i.test(first)) r = { choice: ['W', 'U', 'B', 'R', 'G'] };
    else if (/^one mana of any of the exiled card'?s colou?rs?\.?$/i.test(first)) r = { exiled: true, choice: [] };   // v0.95.2 imprint (Chrome Mox)
    if (!r) continue;
    const cm = (rest + ' ' + first).match(/Activate (?:this ability )?only ([^.]+)\./i);
    r.cond = cm ? cm[1].trim() : null;
    { const rs = (rest + ' ' + first).replace(/\s+/g, ' '); if (/this mana can'?t be spent to cast (?:a )?nonartifact spells?/i.test(rs)) r.noSpend = 'nonartifact'; const so = rs.match(/spend this mana only (?:to|on) ([^.]+)\./i); if (so) r.only = so[1].trim(); }   // CR 106.6 restrictions on what the mana may pay for (Powerstone, Mishra's Workshop style)
    out = r; break;
  }
  ROCK_CACHE.set(key + '|' + tx.length + '|' + tx.slice(0, 40), out);
  return out;
}
// Soft check of a restriction phrase such as "if you control a Dragon" or "as a sorcery".
// Returns { ok: true | false | null (unknown), why }. Callers warn but let the player override.
const STEP_RESTRICTIONS = [
  [/^during your upkeep$/, ['upkeep'], 'during your upkeep'],
  [/^during your draw step$/, ['draw'], 'during your draw step'],
  [/^during your end step$/, ['end'], 'during your end step'],
  [/^during (?:the )?beginning of combat(?: on your turn)?$/, ['begin_combat'], 'during the beginning of combat'],
  [/^during (?:your )?combat before blockers are declared$|^before blockers are declared$|^during (?:your )?combat before (?:the )?declare blockers step$/, ['begin_combat', 'attack'], 'before blockers are declared'],
  [/^during (?:your )?combat$|^during combat on your turn$/, ['begin_combat', 'attack', 'block', 'damage', 'end_combat'], 'during combat'],
  [/^during (?:the |your )?declare attackers step$/, ['attack'], 'during the declare attackers step'],
  [/^during your main phase$|^during your turn's main phase$/, ['main1', 'main2'], 'during your main phase'],
  [/^during your turn before attackers are declared$/, ['upkeep', 'draw', 'main1', 'begin_combat'], 'before attackers are declared'],
  [/^during your turn after attackers (?:have been|are) declared$/, ['attack', 'block', 'damage', 'end_combat', 'main2', 'end'], 'after attackers are declared']
];
// Parse one "Activate only ..." phrase into a restriction record, or null when the app does not know it.
function parseRestrictionPart(p) {
  p = p.trim().replace(/[.]$/, ''); let m;
  if (/^(?:as a sorcery|any time you could cast a sorcery)$/i.test(p)) return { kind: 'sorcery', label: 'as a sorcery (your main phase, empty stack)' };
  if (/^if (?:this creature|~|it) attacked this turn$/i.test(p)) return { kind: 'attacked', label: 'if this creature attacked this turn' };   // CR 702.142a (boast)
  if (/^once each turn$/i.test(p)) return { kind: 'once', label: 'once each turn' };
  if (/^during your turn$/i.test(p)) return { kind: 'myturn', label: 'during your turn' };
  if (/^(?:during )?(?:an? opponent'?s turn|any other player'?s turn|the opponent'?s turn)$/i.test(p)) return { kind: 'oppturn', label: "during an opponent's turn" };
  for (const [re, steps, label] of STEP_RESTRICTIONS) if (re.test(p)) return { kind: 'steps', steps, label };
  if ((m = p.match(/^if you control (\w+) or more (.+)$/i)) && numOf(m[1])) return { kind: 'controln', n: numOf(m[1]), what: m[2], label: `if you control ${m[1]} or more ${m[2]}` };   // v0.95.2 metalcraft-style counts
  if ((m = p.match(/^if you control (?:an?|one or more) (.+)$/i))) return { kind: 'control', what: m[1], label: `if you control ${/^[aeiou]/i.test(m[1]) ? 'an' : 'a'} ${m[1]}` };
  if (/^if you have no cards in hand$/i.test(p)) return { kind: 'hand', max: 0, label: 'if you have no cards in hand' };
  if ((m = p.match(/^if you have (\w+) or (more|fewer) cards in (?:your )?(hand|graveyard)$/i))) return { kind: 'count', n: numOf(m[1]), more: /more/i.test(m[2]), zone: m[3].toLowerCase() === 'hand' ? 'hand' : 'graveyard', label: p };
  if ((m = p.match(/^if there are (\w+) or more cards in your graveyard$/i))) return { kind: 'count', n: numOf(m[1]), more: true, zone: 'graveyard', label: p };
  return null;
}
function parseRestriction(cond) {
  const parts = String(cond || '').split(/\s+and\s+(?=only\b|once each turn|as a sorcery|during\b|if you\b)/i).map(x => x.replace(/^only\s+/i, '').trim()).filter(Boolean);
  return parts.map(p => ({ raw: p, rec: parseRestrictionPart(p) }));
}
function checkRestrictionPart(rec, card) {
  if (!state) return { ok: true, why: '' };
  const stepId = STEPS[state.step] && STEPS[state.step].id;
  switch (rec.kind) {
    case 'sorcery': return canPlaySorcerySpeedNow() ? { ok: true, why: '' } : { ok: false, why: 'This can only be activated at sorcery speed: your main phase with an empty stack.' };
    case 'myturn': return { ok: true, why: '' };
    case 'attacked': return card && state.combat && state.combat.declared && (state.combat.attackers || []).some(a => (a.id ?? a) === card.id) ? { ok: true, why: '' } : { ok: false, why: 'This creature has not attacked this turn.' };
    case 'oppturn': return { ok: false, why: "This can only be activated during an opponent's turn. A goldfish game only has your turns, so it is never available here." };
    case 'once': return card && state.usedAb && state.usedAb[card.id] ? { ok: false, why: 'This ability can only be activated once each turn, and you already did.' } : { ok: true, why: '' };
    case 'steps': return rec.steps.includes(stepId) ? { ok: true, why: '' } : { ok: false, why: `This can only be activated ${rec.label}. It is currently ${STEPS[state.step] ? STEPS[state.step].label : 'not a step'}.` };
    case 'hand': return state.hand.length <= rec.max ? { ok: true, why: '' } : { ok: false, why: `You must have no cards in hand (you have ${state.hand.length}).` };
    case 'count': { const n = state[rec.zone].length; const okc = rec.more ? n >= rec.n : n <= rec.n; return okc ? { ok: true, why: '' } : { ok: false, why: `Needs ${rec.n} or ${rec.more ? 'more' : 'fewer'} cards in your ${rec.zone}; you have ${n}.` }; }
    case 'controln': {
      const w = rec.what.replace(/s$/i, '').toLowerCase(), n = state.battlefield.filter(c => { const t = permTypeInfo(c); return t.types.has(w) || (t.subs && t.subs.has && t.subs.has(w)); }).length;
      return n >= rec.n ? { ok: true, why: '' } : { ok: false, why: `You control ${n} ${rec.what} (needs ${rec.n} or more).` };
    }
    case 'control': {
      const alts = rec.what.split(/\s+or\s+(?:an?\s+)?/i).map(x => x.trim()).filter(Boolean);
      const subs = alts.map(a => parseSubject(a + ' you control', { id: -1, name: '' }));
      const has = subs.every(Boolean) ? state.battlefield.some(c => subs.some(sj => sj.test(c))) : state.battlefield.some(c => {
        if (c.token) return false;
        const t = frontType(c), i = cardInfo(c.name), changeling = i && /\bchangeling\b/i.test(i.tx || '');
        return alts.some(alt => alt.split(/\s+/).every(w => new RegExp('\\b' + w.replace(/s$/i, '') + 's?\\b', 'i').test(t) || (changeling && /\bCreature\b/.test(t))));
      });
      return has ? { ok: true, why: '' } : { ok: false, why: `You do not control ${/^[aeiou]/i.test(rec.what) ? 'an' : 'a'} ${rec.what} (checked: permanents you control on the battlefield).` };
    }
  }
  return { ok: null, why: '' };
}
// Soft check of a restriction phrase such as "if you control a Dragon", "as a sorcery" or "once each turn".
// Returns { ok: true | false | null (unknown), why }. Callers warn but let the player override.
function staticCheck(cond, card) {
  if (!cond || !state) return { ok: true, why: '' };
  let unknown = null;
  for (const p of parseRestriction(cond)) {
    if (!p.rec) { unknown = unknown || { ok: null, why: `Restriction "Activate only ${p.raw}" could not be checked automatically. Make sure it is met.` }; continue; }
    const r = checkRestrictionPart(p.rec, card);
    if (r.ok === false) return r;
  }
  return unknown || { ok: true, why: '' };
}
function markAbilityUsed(card) { if (!state || !card) return; state.usedAb = state.usedAb || {}; state.usedAb[card.id] = true; }
function amongColors() {
  const out = new Set();
  for (const c of state.battlefield) {
    if (c.token) continue;
    const t = frontType(c);
    if (/\bLegendary\b/.test(t) && /\b(Creature|Planeswalker)\b/.test(t)) for (const col of ((cardInfo(c.name) || {}).col || [])) if ('WUBRG'.includes(col)) out.add(col);
  }
  return [...out];
}
function rockColors(c) {
  const r = rockInfo(c); if (!r) return [];
  if (r.among) return amongColors();
  if (r.exiled) return (c.imprint && c.imprint.cols) || [];
  return [...new Set(r.fixed || r.choice)];
}
function rockStatus(c) {   // can this rock produce mana right now? (soft)
  const r = rockInfo(c); if (!r) return { ok: false, why: '' };
  if (isSick(c)) return { ok: false, why: 'Summoning sickness: this creature came under your control this turn, so it cannot tap for mana (it has no haste).' };
  if (r.exiled && !rockColors(c).length) return { ok: false, why: `${c.name} has no exiled card with a colour (imprint), so it adds no mana.` };
  if (r.among && !amongColors().length) return { ok: false, why: 'You control no legendary creature or planeswalker with a colour, so there is no colour of mana to add.' };
  return r.cond ? staticCheck(r.cond, c) : { ok: true, why: '' };
}
function isManaPermanent(c) { return isLandName(c.name) || !!rockInfo(c); }
function softWarn(title, msg, proceed) {
  const m = modal(title, { width: 480, sticky: true });
  m.body.append(h('div', { class: 'psub', text: msg }), h('div', { class: 'muted small', text: 'This check is a soft one: it can be wrong, so you may continue anyway.' }));
  m.foot.append(h('button', { text: 'Cancel', onclick: () => m.close() }), h('button', { class: 'primary', text: 'Do it anyway', onclick: () => { m.close(); proceed(); } }));
}
function tapRock(card) {
  const id = card.id, r = rockInfo(card);
  const run = () => {
    const f = findCard(id); if (!f || f.zone !== 'battlefield' || f.card.tapped) return;
    if (r.fixed) {
      let fx = r.fixed; if (r.per) { const n = csCount(r.per, f.card) || 0; fx = Array(n).fill(r.fixed[0]); }   // counted when you tap
      snap(); f.card.tapped = true; if (fx.length) noteManaTap(f.card, fx); markAbilityUsed(f.card); for (const col of fx) addFloatingMana(col);
      log(`${f.card.name} tapped → floated ${fx.join('') || 'no mana'}`); render(); return;
    }
    const colors = rockColors(f.card);
    const use = colors.length ? colors : ['W', 'U', 'B', 'R', 'G'];
    openManaChoice(f.card, color => {
      if (!color) return;
      const g = findCard(id); if (!g || g.zone !== 'battlefield' || g.card.tapped) return;
      const nm = r.multi || 1; snap(); g.card.tapped = true; noteManaTap(g.card, Array(nm).fill(color)); markAbilityUsed(g.card); for (let k = 0; k < nm; k++) addFloatingMana(color);
      log(`${g.card.name} tapped → floated ${color.repeat(nm)}`); render();
    }, use);
  };
  const st = rockStatus(card);
  if (st.ok === true) run();
  else softWarn(`${card.name}: condition not met`, st.why, run);
}
function landManaColors(c) {
  if (c && !isLandName(c.name)) return rockColors(c);
  if (!c || !isLandName(c.name)) return [];
  const eff = effectiveLandTypes(c);
  // Blood Moon / Magus of the Moon overwrite nonbasic lands into Mountains,
  // so their old mana abilities no longer apply.
  if (eff.override) return eff.types.includes('Mountain') ? ['R'] : [];
  const i = cardInfo(c.name), key = norm(c.name);
  const prod = (i && i.prod && i.prod.length) ? i.prod : BASIC_PRODUCES[key] || [];
  const out = new Set(prod.map(x=>String(x).toUpperCase()).filter(x=>/^[WUBRGC]$/.test(x)));
  for (const t of eff.types) out.add(({Plains:'W',Island:'U',Swamp:'B',Mountain:'R',Forest:'G'})[t]);
  return [...out].filter(Boolean);
}
function openManaChoice(c, done, forced) {
  const colors = forced || landManaColors(c);
  if (!colors.length) { done(null); return; }
  if (colors.length === 1) { done(colors[0]); return; }
  const m = modal(`Float mana — ${c.name}`, {width:420, sticky:true});
  const choices = h('div',{class:'mana-choice'});
  const labels={W:'White',U:'Blue',B:'Black',R:'Red',G:'Green',C:'Colorless'};
  for (const color of colors) {
    choices.append(h('button',{class:'mana-choice-btn '+color,text:`${labels[color]} (${color})`,
      onclick:()=>{m.close();done(color);}}));
  }
  m.body.append(h('div',{class:'psub'},'Choose which mana this land produces. It stays in your mana pool until the current step/phase ends.'),choices);
  m.foot.append(h('button',{text:'Cancel',onclick:()=>m.close()}));
}
function tapForMana(id) {
  const f=findCard(id);
  if (!f || f.zone !== 'battlefield' || f.card.tapped || !isManaPermanent(f.card)) return;
  if (!isLandName(f.card.name)) { tapRock(f.card); return; }
  { const lm=landMulti(f.card,true);
    if(lm){ snap(); f.card.tapped=true; noteManaTap(f.card,lm.fixed); fireTrigger('tapmana',{card:f.card}); for(const col of lm.fixed) addFloatingMana(col); applyLandCost(f.card,{dmg:lm.dmg,life:lm.life}); log(`${f.card.name} tapped → floated ${lm.fixed.join('')}`); if(lm.only) toast('Mana restriction',`Spend this mana only ${lm.only}. The app cannot track restricted mana in the pool, so keep to that yourself, or pay through the cast window, which enforces it.`); render(); return; } }
  const colors=landManaColors(f.card);
  if (!colors.length) { toast('No mana ability detected', `${f.card.name} has no recognized mana production entry.`); return; }
  openManaChoice(f.card, color=>{
    if (!color) return;
    const fresh=findCard(id);
    if (!fresh || fresh.zone!=='battlefield' || fresh.card.tapped) return;
    snap();
    fresh.card.tapped=true; noteManaTap(fresh.card,[color]); fireTrigger('tapmana',{card:fresh.card});
    addFloatingMana(color); applyLandCost(fresh.card,landTapCost(fresh.card));
    log(`${fresh.card.name} tapped → floated ${color}`);
    render();
  });
}
function toggleTap(id) {
  const f = findCard(id);
  if (!f || f.zone !== 'battlefield') return;
  if (!f.card.tapped && isManaPermanent(f.card)) { tapForMana(id); return; }
  if (f.card.tapped) {
    const uc = untapCheck(f.card);
    if (!uc.ok) { toast('It stays tapped', uc.why); return; }
    snap();
    f.card.tapped = false;
    if (uc.take) {
      const cols = Object.entries(uc.take).map(([k, n]) => n + k).join(' ');
      for (const [k, n] of Object.entries(uc.take)) state.manaPool[k] = Math.max(0, (state.manaPool[k] || 0) - n);
      if (f.card.mt && f.card.mt.life) { state.life += f.card.mt.life; log(`${f.card.name}: ${f.card.mt.life} life from the tap given back`); }
      log(`${f.card.name} untapped: ${cols} removed from the mana pool`);
    }
    delete f.card.mt; render(); return;
  }
  snap();
  f.card.tapped = true;
  render();
}

function addCounter(id,d,type='plus',manual) {
  const f=findCard(id); if(!f)return; snap();
  if(type==='loyalty' && isPlaneswalker(f.card)) {   // v0.95.0 a loyalty counter IS the planeswalker's loyalty (CR 306.5b), not a separate counter kind
    f.card.loyalty=Math.max(0,(f.card.loyalty||0)+d); log(`${f.card.name}: ${d>=0?'put '+d+' loyalty counter'+(d===1?'':'s')+' on it':'removed '+(-d)+' loyalty counter'+(d===-1?'':'s')} (loyalty now ${f.card.loyalty})`);
    if(f.card.loyalty<=0) checkLoyalty(f.card); render(); flushTriggers(); return;
  }
  if(!manual && d>0 && state.battlefield.some(x=>x.id===id)) d=adjustCounterAdd(f.card,type,d,true);
  if(typeof f.card.counters==='number')f.card.counters={plus:f.card.counters,minus:0};
  f.card.counters=f.card.counters||{plus:0,minus:0};
  f.card.counters[type]=Math.max(0,(f.card.counters[type]||0)+d); checkNoCounterTriggers(); render(); flushTriggers();
}

function changeLife(d, real) {   // real = life gained or lost by a card effect (manual +/- buttons do not trigger anything)
  if (!state) return;
  if (real && d > 0 && lifeGainBlocked()) { log(`Life gain prevented: ${lifeGainBlocked().g.name} says a player who would gain life gains no life instead`); toast('No life gained', `${lifeGainBlocked().g.name}: if a player would gain life, that player gains no life instead.`); render(); return; }
  snap();
  state.life += d;
  log(`Life ${d > 0 ? '+' : ''}${d} → ${state.life}`);
  if (real && d > 0) fireTrigger('lifegain', { amount: d });
  if (real && d < 0) fireTrigger('lifeloss', { amount: -d });
  render();
  if (real && d !== 0) flushTriggers();
}

