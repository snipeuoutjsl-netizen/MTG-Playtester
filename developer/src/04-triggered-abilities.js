// ---------------------------------------------------------------- triggered abilities (v0.23)
// A triggered ability has an event ("when X happens") and an effect. When the event happens the ability
// is put on the stack the next time a player would get priority, then resolves like a spell.
const TRIG_CACHE = new Map();
const MAIN_STEPS = [[/\b(?:precombat|first) main phase\b/, 'main1'], [/\b(?:postcombat|second) main phase\b/, 'main2'], [/\bupkeep\b/, 'upkeep'], [/\bdraw step\b/, 'draw'], [/\bend step\b/, 'end']];
// Legendary cards such as "Phlage, Titan of Fire's Fury" refer to themselves by the part before the comma ("When Phlage enters..."),
// so a self-reference matches either the full name or that short name (rule 201.4 / Oracle wording).
// A token's name ("Rat", "Pest") is a creature type its own rules text uses for OTHER creatures ("each other Rat you control"), never a reference to itself, so tokens match only "this creature" and friends.
const selfNm = c => c && c.token ? '\u0000' : (c ? c.name : '');
function selfNameRe(full) {
  const f = String(full || '').split(' // ')[0], esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), short = f.includes(',') ? f.split(',')[0].trim() : (/^[A-Z][\w'’-]+ (?:the|of the) /.test(f) ? f.split(' ')[0] : '');   // Oracle shortens legendary names: "Rhonas" for Rhonas the Indomitable
  const nm = short && short.length > 2 ? '(?:' + esc(f) + '|' + esc(short) + ')' : esc(f);
  return new RegExp('(?:' + nm + '|\\bthis (?:creature|artifact|enchantment|land|permanent|planeswalker|vehicle|equipment|aura|saga|battle|token)\\b)', 'gi');   // v0.86: current Oracle wording says "this creature", not the card's name
}
// Prowess (CR 702.108a): "Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn." Read from the keyword line only (a card that
// merely MENTIONS prowess does not have it); each instance triggers separately (702.108c); prowess given by another effect is handled where spells are cast.
const PROWESS_TRIG = { ev: 'cast', cond: 'Prowess: whenever you cast a noncreature spell', effect: 'This creature gets +1/+1 until end of turn.', line: 'Prowess (keyword): whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.', filter: 'noncreature spell', optional: false, special: null, kw: 'prowess' };
function prowessCount(text) {
  let n = 0; for (const line of String(text || '').replace(/\([^)]*\)/g, '').split('\n')) { const l = line.trim(); if (!l || /[.:;]/.test(l)) continue; for (const p of l.split(/,\s*|\s+and\s+/)) if (p.trim().toLowerCase() === 'prowess') n++; }
  return n;
}
function parseTriggers(c) {
  if (!c) return [];
  const info = rulesInfo(c);
  if (!info || !info.tx) return [];
  const key = c.token ? 'tok:' + norm(c.name) + '|' + info.tx : info.ovr ? 'ovr:' + norm(c.name) + '|' + info.tx : norm(c.name);
  if (TRIG_CACHE.has(key)) return TRIG_CACHE.get(key);
  const out = [];
  const nameRe = selfNameRe(c.token ? "\u0000" : info.name);
  for (const raw of info.tx.replace(/\n(?=\s*[\u2022\u2023])/g, ' ').split('\n')) {
    const line = raw.trim();
    const lm = line.match(/^(?:([A-Z][A-Za-z' ]+) — )?((?:When|Whenever|At)\b.*)$/s);
    if (!lm) continue;
    const body = lm[2].replace(nameRe, '~');
    const cm = body.match(/^((?:When|Whenever|At)\b[^,]*),\s*(.*)$/s);
    if (!cm) continue;
    const cond = cm[1].toLowerCase(), word = lm[1] || '';
    let ev = null, filter = '', zone = null, from = null, cyc = false, dis = false, another = false, castAny = null, cAny = null, selfToo = false, q0 = null;
    if (/^at\b/.test(cond)) {
      if (!/opponent|\bnext\b/.test(cond)) {
        if (/end of combat/.test(cond)) ev = 'step:end_combat';
        else if (/beginning of combat/.test(cond)) ev = 'step:begin_combat';
        else for (const [re, id] of MAIN_STEPS) if (re.test(cond)) { ev = 'step:' + id; break; }
      }
    } else if (/^(?:when|whenever) you cast (?:this spell|~)/.test(cond)) ev = 'cast-self';
    else if (/^(?:when|whenever) you cast /.test(cond)) { ev = 'cast'; filter = cond.replace(/^(?:when|whenever) you cast /, ''); }
    else if ((cAny = cond.match(/^(?:when|whenever) a player casts a spell(?: with mana value (equal to the number of ([a-z+\/-]+) counters on (?:~|this \w+)|(\d+)(?: or (less|greater))?))?$/)) && /^counter that spell\.?$/i.test(cm[2].trim())) {   // v0.96.31 Chalice of the Void: "Whenever a player casts a spell with mana value equal to the number of charge counters on this artifact, counter that spell."
      ev = 'cast-any'; castAny = { counters: cAny[2] || '', mv: cAny[3] !== undefined ? +cAny[3] : null, cmp: cAny[4] || 'equal' }; }
    else if ((q0 = cond.match(/^(?:when|whenever) (?:a player|any player) casts (.+)$/))) { ev = 'cast'; filter = q0[1]; }   // v0.99.71 in a goldfish game only you cast spells (Vexing Bauble)
    else if (/^(?:when|whenever) (?:~|this \w+) mutates$/.test(cond)) ev = 'mutates-self';
    else if ((q0 = cond.match(/^when (?:~|this class) becomes level (\d+)$/))) { ev = 'class-level'; filter = q0[1]; }   // CR 716.2c
    else if (/^(?:when|whenever) (?:~|this \w+) enters/.test(cond)) ev = 'etb-self';
    else if (word === 'Landfall' || /\ba land (?:you control )?enters|land enters the battlefield under your control/.test(cond)) ev = 'landfall';
    else if (/^(?:when|whenever) (?:another|a|an|one or more) .*enters/.test(cond) && !/opponent/.test(cond)) { ev = 'etb-other'; filter = cond; }
    else if (/^(?:when|whenever) (?:~|this \w+) attacks/.test(cond)) ev = 'attack-self';
    else if (/creatures? you control attacks?/.test(cond)) ev = 'attack-any';
    else if (/^(?:when|whenever) (?:~|this \w+) (?:dies|is put into a graveyard from the battlefield)/.test(cond)) ev = 'dies-self';
    else if ((q0 = cond.match(/^(?:when|whenever) (?:~|this \w+) or another (.+?) dies$/)) && !/opponent/.test(cond)) { ev = 'dies-other'; filter = 'another ' + q0[1] + ' dies'; selfToo = true; }   // CR 603.10a "Blood Artist"
    else if (/^(?:when|whenever) (?:another|a) .*dies/.test(cond) && !/opponent/.test(cond)) { ev = 'dies-other'; filter = cond; }
    else if (/^(?:when|whenever) (?:equipped|enchanted) creature dies$/.test(cond)) ev = 'host-dies';
    else if (/^(?:when|whenever) (?:equipped|enchanted) creature attacks$/.test(cond)) ev = 'host-attacks';
    else if (/^(?:when|whenever) (?:equipped|enchanted) creature deals combat damage(?: to (?:a player|an opponent|the opponent|you))?$/.test(cond)) ev = 'host-combat-damage';
    else if (/^whenever you draw/.test(cond)) ev = 'draw';
    else if (/^whenever an opponent draws a card/.test(cond)) ev = 'opp-draw';
    else if ((q0 = cond.match(/^whenever an opponent searches their library(?: for (?:an? )?(.+?) cards?)?$/))) { ev = 'opp-search'; filter = q0[1] || ''; }   // v0.99.25 the optional "for a land card" is a filter on what they searched for
    else if (/^(?:when|whenever) (?:~|this \w+) leaves the battlefield/.test(cond)) ev = 'leaves-self';
    else if (/^whenever you gain life/.test(cond)) ev = 'lifegain';
    else if (/^(?:when|whenever) (?:~|this \w+) deals combat damage to (?:a player|an opponent|a creature or player|a player or planeswalker)/.test(cond)) ev = 'combat-damage-self';
    else if (/^(?:when|whenever) (?:one or more |a |an )?(?:other )?creatures? you control deals? combat damage to (?:a player|an opponent)/.test(cond)) ev = 'combat-damage-any';
    if (!ev && /^(?:when|whenever) (?:~|this \w+) becomes monstrous/.test(cond)) ev = 'monstrous';   // CR 701.37
    if (!ev && /^(?:when|whenever) (?:~|this \w+) enters(?: the battlefield)? or attacks/.test(cond)) ev = 'etb-self';
    let ko = null; if (!ev && (ko = cond.match(/^(?:when|whenever) (?:~|this \w+) or another (.+?) enters/))) ev = 'etb-self';   // v0.86
    if (!ev) {   // v0.64: graveyard, discard/cycle, mana, life loss
      let q;
      if ((q = cond.match(/^(?:when|whenever) (?:~|this \w+) is put into (?:your|a) graveyard from (anywhere|your library|your hand)/))) { ev = 'gy-self'; from = q[1]; zone = 'graveyard'; }
      else if ((q = cond.match(/^(?:when|whenever) (?:a|an|one or more) (.+?) cards? leaves? your graveyard/))) { ev = 'gy-leave'; filter = q[1]; }
      else if ((q = cond.match(/^(?:when|whenever) (?:a|an|another|one or more) (.+?)(?: cards?| creatures?)? (?:is|are) put into your graveyard from (anywhere|the battlefield|your library|your hand)/))) { ev = 'gy-other'; filter = q[1] + (/creature/.test(cond.slice(q.index, q[0].length)) && !/creature/.test(q[1]) ? ' creature' : ''); from = q[2]; }
      else if ((q = cond.match(/^(?:when|whenever) you (cycle or discard|discard|cycle) (?:(?:a|an|another|one or more|this or another) )?(?:other )?(?:([a-z ]+?) )?cards?/))) { ev = 'discard'; cyc = /cycle/.test(q[1]); dis = /discard/.test(q[1]); another = /another|other/.test(cond); filter = (q[2] || '').trim(); }
      else if ((q = cond.match(/^(?:when|whenever) you tap (?:~|this \w+) for mana/))) ev = 'tap-self';
      else if ((q = cond.match(/^(?:when|whenever) you lose life/))) ev = 'lifeloss';
    }
    // v0.94.4 intervening-if on casts: "if it's the second creature spell you cast this turn, you may return ~ ..." (Vengevine) is checked when the spell is cast (CR 603.4) and then dropped from the effect text
    let nth = null;
    if (ev === 'cast') { const n2 = /^(?:when|whenever) you cast your (first|second|third|fourth|fifth) (?:(noncreature|creature|instant|sorcery|artifact|enchantment|land|instant or sorcery) )?spell (?:each|this) turn$/i.exec(cm[1]); if (n2) { nth = { n: ['first', 'second', 'third', 'fourth', 'fifth'].indexOf(n2[1].toLowerCase()) + 1, type: (n2[2] || '').toLowerCase() }; filter = n2[2] ? n2[2].toLowerCase() + ' spell' : ''; } }   // CR 603.4-style ordinal cast triggers: flurry, "your second spell each turn"
    if (ev === 'cast') { const nm = /^if it'?s the (first|second|third|fourth) (?:(noncreature|creature|instant|sorcery|artifact|enchantment|land|instant or sorcery) )?spell you cast (?:this|each) turn,\s*/i.exec(cm[2]); if (nm) { nth = { n: ['first', 'second', 'third', 'fourth'].indexOf(nm[1].toLowerCase()) + 1, type: (nm[2] || '').toLowerCase() }; cm[2] = cm[2].slice(nm[0].length); } }
    // CR 601.2h / 603.4: "if no mana was spent to cast it" / "if mana was spent to cast that spell" is checked as the spell is cast, then dropped from the effect text
    let manaCond = null; if (ev === 'cast') { const mm = /^if (no mana|mana) was spent to cast (?:it|that spell|the spell|this spell),?\s*/i.exec(cm[2]); if (mm) { manaCond = /^no/i.test(mm[1]) ? 'none' : 'some'; cm[2] = cm[2].slice(mm[0].length); } }
    if (/^if (?:~|this \w+) is in your graveyard\b/i.test(cm[2]) || (ev === 'gy-self')) zone = 'graveyard';
    if (ev !== 'gy-self' && /\breturn (?:~|this \w+|it) from your graveyard to the battlefield/i.test(cm[2])) zone = 'graveyard';   // v0.94.1 Bloodghast: Landfall \u2014 you may return ~ from your graveyard to the battlefield
    out.push({ ev, cond: cm[1], effect: cm[2], line: body, filter, optional: /\byou may\b/i.test(cm[2]), special: null, zone, from, cyc, dis, another, nth, manaCond, selfToo, castAny, unsupported: ev === 'cast' && !nth && /\b(?:first|second|third|fourth|fifth|sixth)\b[^,]*\bspell\b/i.test(cm[1]) });
    if (ev === 'etb-self' && /enters(?: the battlefield)? or attacks/.test(cond)) out.push({ ev: 'attack-self', cond: cm[1], effect: cm[2], line: body, filter, optional: /\byou may\b/i.test(cm[2]), special: null });
    if (ko) out.push({ ev: 'etb-other', cond: cm[1], effect: cm[2], line: body, filter: 'another ' + ko[1], optional: /\byou may\b/i.test(cm[2]), special: null });
    if (ev === 'etb-self' && /\band whenever an opponent draws a card/i.test(cond)) out.push({ ev: 'opp-draw', cond: cm[1], effect: cm[2], line: body, filter, optional: /\byou may\b/i.test(cm[2]), special: null });
  }
  if (/\bcascade\b/i.test(info.tx)) out.push({ ev: 'cast-self', cond: 'When you cast this spell', effect: 'Cascade: exile cards from the top of your library until you exile a nonland card with lesser mana value. You may cast it without paying its mana cost. Put the exiled cards on the bottom of your library in a random order.', line: 'Cascade (keyword): exile cards from the top of your library until you exile a nonland card with lesser mana value. You may cast it free.', filter: '', optional: true, special: 'cascade' });
  { const n = prowessCount(info.tx); for (let k = 0; k < n; k++) out.push({ ...PROWESS_TRIG }); }   // CR 702.108: each instance triggers separately
  for (const kt of kwTriggersFor(info)) out.push(kt);   // v0.96.1 keyword triggers (exalted, evolve, renown ...)
  TRIG_CACHE.set(key, out);
  return out;
}
function frontType(c) {
  const i = c && !c.token && cardInfo(c.name); let t = i && i.t ? i.t.split(' // ')[0] : '';
  const bc = c && (c.becomes || selfBecomes(c));
  if (bc && t) {   // v0.96.12 CR 613.1d: a type-changing effect adds its card types and subtypes to the printed ones
    const [a, b] = t.split('\u2014').map(x => x.trim()), cap = w => w[0].toUpperCase() + w.slice(1), have = new Set(a.toLowerCase().split(/\s+/)), add = bc.types.filter(w => !have.has(w)).map(cap);
    const subs = bc.onlySubs ? (bc.subs || []).map(cap) : [...new Set([...(b ? b.split(/\s+/) : []), ...(bc.subs || []).map(cap)])];   // "loses all other creature types" (assimilate)
    t = [a, ...add].join(' ') + (subs.length ? ' \u2014 ' + subs.join(' ') : '');
  }
  if (c && t && (c.ovr || (state && state.battlefield.length))) t = ovrTypeLine(c, t);
  if (c && t && !/\bCreature\b/.test(t) && stationPT(c)) t = t.replace(/^((?:(?:Legendary|Snow|Tribal) )*)Artifact/, '$1Artifact Creature');   // CR 721.2 it is an artifact creature while it has the counters
  if (c && c.impended && t && c.counters && c.counters.time > 0) t = t.replace(/\bCreature\s*/, '').replace(/\s+\u2014/, ' \u2014');   // CR 702.176b not a creature while it has a time counter
  return t;
}
// "Whenever a permanent you control enters tapped" (Amulet of Vigor) / "enters untapped": the permanent's state as it entered decides (CR 603.6a + 614.1c).
function enterStateOk(t, e) { const l = String(t.line || t.cond || '');
  const fromGy = !!(e && (e.enteredFrom === 'graveyard' || e.enteredCastFromGy));
  if (/\benters? (?:the battlefield )?from (?:your|a) graveyard\b/i.test(l) && !fromGy) return false;   // Flayer of the Hatebound
  if (/\bif it entered from your graveyard or you cast it from your graveyard\b/i.test(l) && !fromGy) return false;   // Prized Amalgam (CR 603.4 intervening if)
   if (/\benters? (?:the battlefield )?tapped\b/i.test(l)) return !!e.tapped; if (/\benters? (?:the battlefield )?untapped\b/i.test(l)) return !e.tapped; return true; }
function filterMatches(filter, card) {
  const f = filter.toLowerCase();
  if (card && card.token && /\bnon-?token\b/.test(f)) return false;   // CR 111.1: a "nontoken" filter never matches a token (Weapons Manufacturing must not trigger on its own Munitions)
  if (/(?<!non-?)\btokens?\b/.test(f) && card && !card.token) return false;   // "a creature token enters" never matches a card
  let t = frontType(card);
  if (!t && card && card.token && card.tk) t = String(card.tk.type || (card.tk.types || []).join(' ') || '');   // a token has no printed card, so its own types decide
  if (!t) return true;
  for (const w of ['creature', 'artifact', 'enchantment', 'land', 'planeswalker', 'instant', 'sorcery']) if (new RegExp('\\bnon-?' + w + '\\b').test(f) && new RegExp('\\b' + w + '\\b', 'i').test(t)) return false;   // CR 205.4b: "nonland", "nonartifact" ... exclude that type
  if (/\bnonlegendary\b/.test(f) && /\bLegendary\b/i.test(t)) return false;
  const words = [['instant or sorcery', /\b(Instant|Sorcery)\b/], ['instant', /\bInstant\b/], ['sorcery', /\bSorcery\b/], ['artifact', /\bArtifact\b/], ['enchantment', /\bEnchantment\b/], ['planeswalker', /\bPlaneswalker\b/], ['land', /\bLand\b/], ['creature', /\bCreature\b/]];
  { const cws = [...f.matchAll(/\b(colorless|multicolored|colored|white|blue|black|red|green)\b/g)].map(m => m[1]), cs = cardColorSet(card);   // v0.99.53 "a white or green creature": any of the colours (before, only the first was checked)
    if (cws.length && !(/\bor\b/.test(f) ? cws.some(w => colorWordOk(w, cs)) : cws.every(w => colorWordOk(w, cs)))) return false; }
  // v0.99.53 "or" separates alternatives; type words side by side all apply ("an artifact creature" is both, CR 205.2b)
  const partTypes = f.split(/\s+or\s+|,\s*/).map(part => words.filter(([w]) => w !== 'instant or sorcery' && new RegExp('(?<!non-?)\\b' + w + '\\b').test(part)));
  const withTypes = partTypes.filter(m => m.length);
  if (!withTypes.length) return true;
  return withTypes.some(m => m.every(([, re]) => re.test(t)));
}
function fireTrigger(ev, ctx = {}) {
  memOnEvent(ev, ctx);   // v0.99.81 the turn's record (src/88)
  if (state && ev === 'step' && ctx.id === 'upkeep') { openingRevealTriggers(); runDelayed('upkeep'); suspendUpkeep(); reboundUpkeep(); }
  if (!state) return;   // v0.99.69 triggered abilities are rules, not a teaching aid: they always trigger (the prompt setting only skips the ordering window)
  if ((ev === 'etb' || ev === 'enters') && ctx.card && torporOrbOn(ctx.card)) { log(`Creatures entering don't cause abilities to trigger: ${ctx.card.name}'s enter-the-battlefield abilities are skipped`); return; }
  const inGy = x => state.graveyard.some(g => g.id === x.id);
  // CR 603.2d style "triggers an additional time" (Roaming Throne): another permanent you control says a triggered ability of a creature of the chosen type triggers an additional time
  const extraTimes = src => { let n = 0; if (!src || !state || !/\bCreature\b/.test(permTypeLine(src))) return 0; for (const g of state.battlefield) { if (g.id === src.id || !g.chosen) continue; if (!/If a triggered ability of another creature you control of the chosen type triggers, it triggers an additional time/i.test(cardText(g) || '')) continue; if (permTypeInfo(src).subs.has(String(g.chosen).toLowerCase()) || permTypeInfo(src).changeling) n++; } return n; };
  const add0 = (src, t, why) => { if (t.ev !== 'dies-self' && t.ev !== 'leaves-self' && t.ev !== 'host-dies' && !(t.ev === 'dies-other' && t.selfToo) && (t.zone === 'graveyard') !== inGy(src)) return; /* CR 603.10a: a "leaves the battlefield" ability looks back, so a card that just went to the graveyard still triggers */ state.pendingTriggers.push({ kind: 'ability', cardId: src.id, cardName: src.name, text: t.line, effect: t.effect, special: t.special, kw: t.kw, n: t.n, arg: t.arg, optional: t.optional, why, amt: ctx.amount, otherId: ctx.card && ctx.card.id !== src.id ? ctx.card.id : undefined }); };
  const add = (src, t, why) => { { const ii = interveningIf(t.effect, src); if (ii && ii.value === false) { log(`${src.name}: its ability does not trigger, because ${ii.cond} is not true (CR 603.4)`); return; } }   // v0.99.81 intervening "if"
    const n0 = state.pendingTriggers.length; add0(src, t, why); if (state.pendingTriggers.length > n0) { const x = extraTimes(src); for (let k = 0; k < x; k++) { const q = Object.assign({}, state.pendingTriggers[state.pendingTriggers.length - 1]); q.why = (q.why || '') + ' It triggers an additional time (' + 'a permanent you control says so).'; state.pendingTriggers.push(q); } } };
  const bf = state.battlefield.concat(state.emblems || [], state.graveyard.filter(g => parseTriggers(g).some(t => t.zone === 'graveyard')));
  if (ev === 'step') {
    const label = STEPS.find(x => x.id === ctx.id)?.label || ctx.id;
    for (const c of bf) for (const t of parseTriggers(c)) if (t.ev === 'step:' + ctx.id && (!t.test || t.test(c))) add(c, t, `It is the ${label.toLowerCase()} of your turn, so this "at the beginning of…" ability triggers now.`);
  } else if (ev === 'etb') {
    const e = ctx.card; soulbondOnEnter(e); noteGapsOnEnter(e);
    for (let t of parseTriggers(e)) if (t.ev === 'etb-self' && (!t.test || t.test(e)) && enterStateOk(t, e) && !(isLandName(e.name) && /\b(scry|surveil)\s+\d+/i.test(t.effect))) add(e, e.xValue !== undefined ? { ...t, effect: t.effect.replace(/\bX\b/g, String(e.xValue)), line: t.line.replace(/\bX\b/g, String(e.xValue)) } : t, `${e.name} entered the battlefield, so its "enters the battlefield" ability triggers.`);
    for (const c of bf) for (const t of parseTriggers(c)) {
      if (t.ev === 'landfall' && isLandName(e.name)) add(c, t, `A land (${e.name}) entered the battlefield under your control: landfall.`);
      else if (t.ev === 'etb-other' && c.id !== e.id && filterMatches(t.filter, e) && (!t.test || t.test(c, e)) && enterStateOk(t, e)) add(c, t, `${e.name} entered the battlefield and matches this ability's condition.`);
    }
  } else if (ev === 'cast') {
    const sp = ctx.card;
    for (const t of parseTriggers(sp)) if (t.ev === 'cast-self') add(sp, t, `You cast ${sp.name}. "When you cast this spell" abilities trigger immediately and go on the stack above the spell, so they resolve first.`);
    for (const c of bf) for (const t of parseTriggers(c)) if (t.ev === 'cast-any' && castAnyOk(t.castAny, sp, c)) { const n0 = state.pendingTriggers.length; add(c, t, `${sp.name} was cast with mana value ${spellMV(sp)}${t.castAny.counters ? ', equal to the number of ' + t.castAny.counters + ' counters on ' + c.name : ''}.`); if (state.pendingTriggers.length > n0) Object.assign(state.pendingTriggers[state.pendingTriggers.length - 1], { special: 'counterCast', spellId: sp.id }); }
    for (const c of bf) for (const t of parseTriggers(c)) if (t.ev === 'cast' && !t.unsupported && filterMatches(t.filter, sp) && (!t.nth || castNth(t.nth, sp)) && (!t.manaCond || (t.manaCond === 'none') === !sp.manaSpent)) add(c, t, `You cast ${sp.name}, which matches "${t.filter || 'a spell'}".`);
    for (const c of state.battlefield) if (prowessCount(cardText(c)) === 0 && hasKw(c, 'prowess') && filterMatches(PROWESS_TRIG.filter, sp)) add(c, PROWESS_TRIG, `You cast ${sp.name}, a noncreature spell, and ${c.name} has prowess (given by another effect).`);
  } else if (ev === 'attack') {
    const atk = ctx.cards || [];
    for (const a of atk) for (const t of parseTriggers(a)) if (t.ev === 'attack-self' && (!t.test || t.test(a, atk))) add(a, t, `${a.name} was declared as an attacker.`);
    for (const a of atk) for (const x of bf) if (x.att === a.id) for (const t of parseTriggers(x)) if (t.ev === 'host-attacks') add(x, t, `${a.name} (equipped or enchanted by ${x.name}) attacked.`);
    if (atk.length) for (const c of bf) for (const t of parseTriggers(c)) if (t.ev === 'attack-any' && (!t.test || t.test(c, atk))) add(c, t, 'You declared attackers.');
  } else if (ev === 'class-level') {   // CR 716.2c "When this Class becomes level N"
    const cc = ctx.card; for (const t of parseTriggers(cc)) if (t.ev === 'class-level' && +t.filter === ctx.level) add(cc, t, `${cc.name} became level ${ctx.level}.`);
  } else if (ev === 'mutates') {
    const mc = ctx.card; for (const t of parseTriggers(mc)) if (t.ev === 'mutates-self') add(mc, t, `${mc.name} mutated (a creature spell merged with it).`);
  } else if (ev === 'dies') {
    const d = ctx.card;
    if (d.blitzBody) { delete d.blitzBody; state.pendingTriggers.push({ kind: 'ability', cardId: d.id, cardName: d.name, text: 'Blitz (keyword, CR 702.152): when this creature dies, draw a card.', effect: 'Draw a card.', special: null, optional: false, why: `${d.name} was cast for its blitz cost and died.` }); }
    for (const t of parseTriggers(d)) if (t.ev === 'dies-self' && (!t.test || t.test(d))) add(d, t, `${d.name} was put into a graveyard from the battlefield (it died).`);
    for (const t of parseTriggers(d)) if (t.ev === 'dies-other' && t.selfToo) add(d, t, `${d.name} died (it triggers on its own death as well as on another creature's).`);
    for (const c of bf) if (c.id !== d.id) for (const t of parseTriggers(c)) if (t.ev === 'dies-other' && filterMatches(t.filter, d)) add(c, t, `${d.name} died and matches this ability's condition.`);
    for (const id of (d._hostOf || [])) { const a = findCard(id); if (a) for (const t of parseTriggers(a.card)) if (t.ev === 'host-dies') add(a.card, t, `${d.name} (the creature ${a.card.name} was attached to) died.`); }   // Skullclamp: "Whenever equipped creature dies"
    delete d._hostOf;
  } else if (ev === 'draw') {
    for (const c of bf) for (const t of parseTriggers(c)) if (t.ev === 'draw') add(c, t, 'You drew a card.');
  } else if (ev === 'oppsearch') {
    for (const c of bf) for (const t of parseTriggers(c)) if (t.ev === 'opp-search' && oppSearchMatches(t.filter, ctx.found)) add(c, t, t.filter ? `Your opponent searched their library for a ${t.filter} card.` : 'Your opponent searched their library.');
  } else if (ev === 'oppdraw') {
    for (const c of bf) for (const t of parseTriggers(c)) if (t.ev === 'opp-draw') add(c, t, 'Your opponent drew a card (not the first one of their draw step), so this ability triggers.');
  } else if (ev === 'monstrous') {
    const d = ctx.card; for (const t of parseTriggers(d)) if (t.ev === 'monstrous') add(d, t, `${d.name} became monstrous.`);
  } else if (ev === 'leaves') {
    const d = ctx.card;
    for (const t of parseTriggers(d)) if (t.ev === 'leaves-self') add(d, t, `${d.name} left the battlefield.`);
  } else if (ev === 'lifegain') {
    for (const c of bf) for (const t of parseTriggers(c)) if (t.ev === 'lifegain') add(c, t, `You gained ${ctx.amount || ''} life.`);
  } else if (ev === 'gyleave') {
    const d = ctx.card;
    for (const c of bf) for (const t of parseTriggers(c)) if (t.ev === 'gy-leave' && filterMatches(t.filter, d)) add(c, t, `${d.name} left your graveyard (${ctx.to === 'stack' ? 'it was cast from there' : 'moved to ' + ctx.to}), which matches "${t.filter}".`);
  } else if (ev === 'gyenter') {
    const d = ctx.card, from = ctx.from;
    const fromOk = f => !f || f === 'anywhere' || (f === 'the battlefield' && from === 'battlefield') || (f === 'your library' && from === 'library') || (f === 'your hand' && from === 'hand');
    for (const t of parseTriggers(d)) if (t.ev === 'gy-self' && fromOk(t.from)) add(d, t, `${d.name} was put into your graveyard from ${from === 'battlefield' ? 'the battlefield' : from === 'stack' ? 'the stack' : 'your ' + from}.`);
    for (const c of bf) for (const t of parseTriggers(c)) if (t.ev === 'gy-other' && c.id !== d.id && fromOk(t.from) && filterMatches(t.filter, d)) add(c, t, `${d.name} was put into your graveyard from ${from === 'stack' ? 'the stack' : from === 'battlefield' ? 'the battlefield' : 'your ' + from}, which matches "${t.filter}".`);
  } else if (ev === 'discard') {
    const d = ctx.card, how = ctx.how;
    for (const c of bf) for (const t of parseTriggers(c)) if (t.ev === 'discard' && !(t.another && c.id === d.id) && ((how === 'cycle' && (t.cyc || t.dis)) || (how === 'discard' && t.dis)) && filterMatches(t.filter, d)) add(c, t, `You ${how === 'cycle' ? 'cycled' : 'discarded'} ${d.name}.`);
  } else if (ev === 'tapmana') {
    const d = ctx.card;
    for (const t of parseTriggers(d)) if (t.ev === 'tap-self') add(d, t, `You tapped ${d.name} for mana.`);
  } else if (ev === 'lifeloss') {
    for (const c of bf) for (const t of parseTriggers(c)) if (t.ev === 'lifeloss') add(c, t, `You lost ${ctx.amount || ''} life.`);
  } else if (ev === 'combatdmg') {
    const a = ctx.card;
    for (const t of parseTriggers(a)) if (t.ev === 'combat-damage-self' && (!t.test || t.test(a))) add(a, t, `${a.name} dealt combat damage to the opponent.`);
    for (const c of bf) for (const t of parseTriggers(c)) if (t.ev === 'combat-damage-any') add(c, t, `${a.name} (a creature you control) dealt combat damage to the opponent.`);
    for (const x of bf) if (x.att === a.id) for (const t of parseTriggers(x)) if (t.ev === 'host-combat-damage') add(x, t, `${a.name} (equipped or enchanted by ${x.name}) dealt combat damage to the opponent.`);
  }
}
function flushTriggers() { if (state && state.pendingTriggers.length && !state.phasePause && !state.discarding && !costHold && !(state.trigHold > 0)) resolvePendingTrigger(); }
// v0.99.45 CR 603.3b: abilities that trigger during ONE event (milling five cards, sacrificing two lands, two lands entering) are put on the stack
// together, in the order you choose. Events that move several cards run inside simultaneously(), which holds the triggers until the event is over.
function simultaneously(fn) { if (!state) return fn(); state.trigHold = (state.trigHold || 0) + 1; try { return fn(); } finally { state.trigHold--; if (!state.trigHold) flushTriggers(); } }
function permanentEntered(c) {
  if (!state || !c) return;
  c.enteredTurn = state.turn;
  if (isPlaneswalker(c) && c.loyalty === undefined) {
    const info = cardInfo(c.name), m = info && info.pt && String(info.pt).match(/(\d+)/);
    c.loyalty = m ? +m[1] : 0;
    log(`${c.name} entered with ${c.loyalty} loyalty counters`);
  }
  const dup = legendDuplicates(c);
  fireTrigger('etb', { card: c });   // triggers still happen even if the new permanent is about to be put into the graveyard
  if (dup.length) openLegendRule(c, dup);
}
// ---- legend rule (state-based action): two or more legendary permanents with the same name -> keep one, the rest go to the graveyard
let legendOpen = false;
function legendDuplicates(c) {
  if (!/\bLegendary\b/.test(frontType(c))) return [];
  return state.battlefield.filter(x => !x.token && norm(x.name) === norm(c.name));
}
function openLegendRule(c, list) {
  if (list.length < 2 || legendOpen) return;
  legendOpen = true;
  const m = modal('Legend rule', { width: 540, sticky: true, noClose: true });
  m.body.append(
    h('div', { class: 'psub', text: `You control ${list.length} legendary permanents named ${c.name}. This is a state-based action: you choose one to keep, and the rest are put into their owner’s graveyard right away. It does not use the stack.` }),
    teach('rulesHints') ? h('div', { class: 'muted small', text: 'It is the name that matters, not the card. Only legendary permanents you control are affected. Enter-the-battlefield abilities of the new copy have already triggered, so keeping the old one does not undo them.' }) : null);
  const box = h('div', { class: 'prelist' });
  for (const x of list) {
    const tag = x.id === c.id ? 'the new one' : 'already in play';
    const extra = [x.tapped ? 'tapped' : 'untapped', (x.counters && (x.counters.plus || x.counters.minus)) ? 'has counters' : '', x.loyalty !== undefined ? `loyalty ${x.loyalty}` : ''].filter(Boolean).join(', ');
    box.append(h('div', { class: 'row' }, h('span', { class: 'nm', text: `${x.name} (${tag}; ${extra})` }), h('button', { class: 'primary', text: 'Keep this one', onclick: () => {
      snap();
      for (const o of list) if (o.id !== x.id) { const i = state.battlefield.findIndex(b => b.id === o.id); if (i >= 0) { log(`Legend rule: ${o.name} put into the graveyard (kept the ${x.id === c.id ? 'new' : 'old'} one)`); leaveBattlefield(o, 'graveyard'); } }
      legendOpen = false; m.close(); render(); resolvePendingTrigger();
    } })));
  }
  m.body.append(box);
}
// ---- modal cards: "Choose one —", "Choose two —", "Choose one or both —", "Choose up to one —", Spree (v0.38) ----------------
// Modes are chosen as the spell is cast (or as the ability goes on the stack), BEFORE paying costs (rule 601.2b), and
// the chosen modes resolve in the order they are printed (rule 700.2).
function parseModal(tx) {
  tx = String(tx || '').replace(/\s*\n\s*(?=[•‣])/g, ' ').replace(/,\n/g, ', ');
  let m;
  const spreeLines = tx.split('\n').map(l => l.trim()).filter(l => /^\+\s*(?:\{[^}]+\})+\s*—/.test(l));
  if (/^\s*Spree\b/im.test(tx) && spreeLines.length) {
    const modes = spreeLines.map(l => { const mm = l.match(/^\+\s*((?:\{[^}]+\})+)\s*—\s*(.+)$/); return { text: mm[2].trim(), cost: mm[1] }; });
    return { spree: true, min: 1, max: modes.length, label: 'one or more additional costs (Spree)', modes, kind: 'spell' };
  }
  let repeat = false;
  { const rm = tx.match(/\bchoose (one|two|three|four|five)\.\s*You may choose the same mode more than once\.\s*(?=•)/i);   // Mystic Confluence (CR 700.2d): the same mode may be chosen more than once
    if (rm) { const N0 = { one: 1, two: 2, three: 3, four: 4, five: 5 }; const modes0 = ('• ' + tx.slice(rm.index + rm[0].length)).split(/\s*•\s*/).slice(1).map(x => ({ text: x.trim() })).filter(x => x.text);
      if (modes0.length >= 2) return { spree: false, repeat: true, min: N0[rm[1].toLowerCase()], max: N0[rm[1].toLowerCase()], label: rm[1].toLowerCase() + ' (repeats allowed)', modes: modes0, kind: /^\s*(?:when|whenever|at the beginning)/i.test(tx.slice(0, rm.index)) ? 'trigger' : 'spell', escalate: '' }; } }
  // v0.99.78 CR 700.2: "Choose one. If you control a Wizard as you cast this spell, you may choose two instead." (Flame of Anor, Go Nuts!, See Double, Inscription of Insight)
  { const um = tx.match(/\bchoose (one|two)\.\s*(?:If|As long as) ([^•]+?), (you may )?choose (both|two|three|any number)(?: instead)?\.\s*(?=•)/i);
    if (um) { const modes = ('• ' + tx.slice(um.index + um[0].length)).split(/\s*•\s*/).slice(1).map(x => ({ text: x.trim() })).filter(x => x.text);
      if (modes.length >= 2) { const NN = { one: 1, two: 2, three: 3, both: 2 }, base = NN[um[1].toLowerCase()], up = um[4].toLowerCase() === 'any number' ? modes.length : NN[um[4].toLowerCase()];
        const lead = tx.slice(tx.lastIndexOf('\n', um.index) + 1, um.index), kind = /\b(?:when|whenever|at the beginning of)\b/i.test(lead) ? 'trigger' : lead.includes(':') ? 'ability' : 'spell';
        return { spree: false, min: base, max: base, label: um[1].toLowerCase(), modes, kind, escalate: '', upgrade: { cond: um[2].trim(), max: Math.min(up, modes.length), may: !!um[3], anyNumber: um[4].toLowerCase() === 'any number' } }; } } }
  m = tx.match(/\bchoose (one or both|one or more|up to (?:one|two|three|four)|one|two|three|four)\b[^•—]*—\s*/i);
  if (!m || !/•/.test(tx)) return null;
  const word = m[1].toLowerCase(), after = tx.slice(m.index + m[0].length);
  const modes = ('• ' + after).split(/\s*•\s*/).slice(1).map(x => ({ text: x.trim().replace(/\s+$/, '') })).filter(x => x.text);
  if (modes.length < 2) return null;
  const N = { one: 1, two: 2, three: 3, four: 4 };
  let min, max, label = word;
  if (word === 'one or both') { min = 1; max = 2; }
  else if (word === 'one or more') { min = 1; max = modes.length; }
  else if (/^up to /.test(word)) { min = 0; max = N[word.slice(7)]; }
  else { min = max = N[word]; }
  // What kind of ability is this "choose one" part of? Look at the words that lead into it on the same line.
  const lead = tx.slice(tx.lastIndexOf('\n', m.index) + 1, m.index);
  const kind = /\b(?:when|whenever|at the beginning of)\b/i.test(lead) ? 'trigger' : lead.includes(':') ? 'ability' : 'spell';
  const esc = tx.match(/^Escalate\s+((?:\{[^}]+\})+)/im);   // v0.96.3 escalate (CR 702.120): each mode beyond the first costs extra
  return { spree: false, min, max, label, modes, kind, escalate: esc ? esc[1] : '' };
}
// The mode choice made while CASTING: only a real spell (instant/sorcery) has one. A permanent's
// "choose one" belongs to a triggered or activated ability and is chosen when that ability goes on the stack.
function spellModal(c) {
  const md = parseModal(cardText(c)); if (!md) return null;
  if (md.spree) return md;
  if (md.kind !== 'spell') return null;
  return /\b(?:Instant|Sorcery)\b/.test(frontType(c)) || !frontType(c) ? md : null;
}
// Text of the chosen modes (in printed order), used as the text of the spell/ability as it resolves.
function modalText(md, idxs) {
  const sorted = [...idxs].sort((a, b) => a - b); if (!md.repeat) return sorted.map(i => md.modes[i].text).join(' ');
  const seen = {}, draws = sorted.filter(i => /^Draw a card\.?$/i.test(md.modes[i].text)).length, out = []; let drew = false;
  for (const i of sorted) { const t = md.modes[i].text; seen[i] = (seen[i] || 0) + 1;
    if (/^Draw a card\.?$/i.test(t)) { if (!drew) { out.push(draws === 1 ? 'Draw a card.' : `Draw ${draws} cards.`); drew = true; } continue; }
    out.push(seen[i] === 1 ? t : t.replace(/\btarget\b/i, 'another target')); }   // a repeated mode needs its own target (CR 700.2d)
  return out.join(' ');
}
function mergeGeneric(cost) { let n = 0; const rest = []; for (const m of String(cost || '').match(/\{[^}]+\}/g) || []) { if (/^\{\d+\}$/.test(m)) n += +m.slice(1, -1); else rest.push(m); } return (n ? `{${n}}` : '') + rest.join(''); }
function modalCost(md, idxs) { return md.spree ? idxs.map(i => md.modes[i].cost).join('') : md.escalate ? md.escalate.repeat(Math.max(0, idxs.length - 1)) : ''; }
// v0.99.78 is the condition that lets you choose more modes met right now? true / false / null (the app cannot tell: you say)
function modeUpgradeMet(cond, name) {
  const c = String(cond || '').replace(/\s+as you cast this spell$/i, '').trim(); let m;
  if ((m = c.match(/^you control (an?|one or more|two or more|three or more) (.+)$/i))) { try { const r = staticCheck('if you control ' + m[1] + ' ' + m[2], { name: name || '' }); return r.ok === true ? true : r.ok === false ? false : null; } catch (e) { return null; } }
  if (/^you have (\w+) or (?:less|fewer) life$/i.test(c) || /^you have (\w+) or more life$/i.test(c)) { try { const r = staticCheck('if ' + c, { name: name || '' }); return r.ok === true ? true : r.ok === false ? false : null; } catch (e) { return null; } }
  return null;   // kicked / teamwork / the opponent's graveyard: you say whether it is met
}
function openModeChoice(name, md, cb, baseCost, onCancel) {
  if (md.upgrade && !md._up) {   // decide how many modes may be chosen before showing them
    const met = modeUpgradeMet(md.upgrade.cond, name), up = md.upgrade;
    const go = yes => { const m2 = Object.assign({}, md, { _up: true, upgrade: Object.assign({}, up, { met: yes }) }); if (yes) { m2.max = up.max; if (!up.may && !up.anyNumber) m2.min = up.max; m2.label = up.anyNumber ? 'any number' : up.may ? `${md.label} or ${up.max === 2 ? 'both' : up.max}` : String(up.max); if (up.anyNumber) m2.min = 1; } openModeChoice(name, m2, cb, baseCost, onCancel); };
    if (met !== null) { go(met); return; }
    const q = modal(`${name}: how many modes?`, { width: 520, sticky: true });
    q.body.append(h('div', { class: 'psub', text: `If ${up.cond}, you ${up.may ? 'may ' : ''}choose ${up.anyNumber ? 'any number of modes' : up.max === 2 ? 'two modes' : up.max + ' modes'} instead of ${md.max === 1 ? 'one' : md.max}.` }), h('div', { class: 'muted small', text: 'The app cannot check this condition here (rule 700.2): tell it whether it is met.' }));
    q.foot.append(h('button', { text: 'Not met', onclick: () => { q.close(); go(false); } }), h('button', { class: 'primary', text: 'It is met', onclick: () => { q.close(); go(true); } }));
    return;
  }
  const chosen = new Set();
  const m = modal(`${name}: choose ${md.spree ? 'additional costs' : md.min === md.max ? md.max === 1 ? 'one mode' : md.max + ' modes' : md.label}`, { width: 640, sticky: true });
  const info = h('div', { class: 'psub' });
  const total = h('div', { class: 'muted small' });
  const ok = h('button', { class: 'primary', text: md.spree ? 'Choose and continue' : 'Choose', disabled: true });
  const rows = [];
  const counts = {};   // repeat modes: how many times each is chosen
  const refresh = () => {
    const n = md.repeat ? Object.values(counts).reduce((a, b) => a + b, 0) : chosen.size;
    info.textContent = md.spree ? `Pick one or more extras. Each one adds its cost to the spell. (${n} chosen)` : md.min === md.max ? `Choose ${md.max}. (${n} of ${md.max} chosen)` : `Choose ${md.min === 0 ? 'up to ' + md.max : md.label.replace(/^./, c => c.toLowerCase())}. (${n} chosen)`;
    if (md.repeat) for (const r of rows) { r.plus.disabled = n >= md.max; r.minus.disabled = !(counts[r.i] > 0); r.num.textContent = String(counts[r.i] || 0); }
    else for (const r of rows) r.box.disabled = !chosen.has(r.i) && n >= md.max;
    ok.disabled = n < md.min || n > md.max;
    if (md.spree || md.escalate) total.textContent = `Total cost: ${mergeGeneric((baseCost || '') + modalCost(md, [...chosen])).replace(/[{}]/g, '') || '0'}`;
  };
  md.modes.forEach((mo, i) => {
    const box = md.repeat ? h('span', { class: 'mode-count' }) : h('input', { type: 'checkbox' });
    const eff = recognizedEffects(mo.text);
    if (md.repeat) { const minus = h('button', { text: '−', title: 'One fewer' }), plus = h('button', { text: '+', title: 'Choose this mode again' }), num = h('b', { text: '0' });
      minus.addEventListener('click', e => { e.preventDefault(); if (counts[i] > 0) counts[i]--; refresh(); }); plus.addEventListener('click', e => { e.preventDefault(); counts[i] = (counts[i] || 0) + 1; refresh(); });
      box.append(minus, num, plus); rows.push({ i, box, minus, plus, num }); }
    else { box.addEventListener('change', () => { if (box.checked) chosen.add(i); else chosen.delete(i); refresh(); }); rows.push({ i, box }); }
    m.body.append(h('label', { class: 'mode-row' }, box, h('span', { class: 'mode-txt' }, h('b', { text: md.spree ? `+${mo.cost.replace(/[{}]/g, '')}  ` : `Mode ${i + 1}  ` }), mo.text, h('span', { class: 'muted small', text: eff.length ? `  — the app can apply: ${eff.join('; ')}` : '  — you apply this one by hand' }))));
  });
  m.body.prepend(info);
  m.body.append(total, teach('rulesHints') ? h('div', { class: 'muted small', text: 'Modes are chosen as you cast the spell, before you pay. You cannot pick the same mode twice, and the chosen modes happen in the order they are printed.' }) : null);
  ok.addEventListener('click', () => { m.close(); cb(md.repeat ? Object.entries(counts).flatMap(([i, k]) => Array(k).fill(+i)).sort((a, b) => a - b) : [...chosen].sort((a, b) => a - b)); });
  m.foot.append(h('button', { text: 'Cancel', onclick: () => { m.close(); if (onCancel) onCancel(); } }), ok);
  refresh();
}

// ---- "Always yield" (like Magic Online): remember, for the rest of THIS game, that a given triggered ability should go on the stack by itself
// with the same targets and apply the same effect, so it stops asking every time. The first time each ability appears you are asked once.
const ayKey = (name, text, id) => String(name || '') + '#' + (id == null || id < 0 ? '' : id) + '|' + String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
// CR 603.5 + 603.4: a "may" ability is decided on resolution, and an ability with a condition (intervening "if", "unless") is checked again on resolution.
// So only plain, unconditional abilities can be remembered as "always yield"; the rest ask every time.
const ayEligibleText = tx => !/\b(?:may|if|unless|as long as|choose|instead|up to|any number)\b/i.test(String(tx || ''));
function ayGet(name, text, id) { return state && state.ay ? state.ay[ayKey(name, text, id)] || null : null; }   // tracked per card (its id), not per name: a second copy asks again
const legalSig = (specs, srcId) => specs.map(sp => legalTargets(sp, { srcId }).map(t => String(t.id)).sort().join(',')).join('|');   // the set of things an ability could target right now
function ayTargetsOk(tg) { return !tg || tg.every(t => t.kind === 'player' || t.kind === 'opp' || t.kind === 'spell' ? true : !!findCard(t.id)); }
function askAlwaysYield(list, next) {
  const t = list.find(x => !x.delayed && !ayGet(x.cardName, x._text || x.effect, x.cardId) && ayEligibleText(x._text || x.effect) && !(x._picked || []).some(p => p.kind === 'opp')); if (!t) { next(); return; }   // v0.99.76 an ability aimed at the opponent's (untracked) permanents is never yielded: you act on the real table each time
  state.ay = state.ay || {}; const key = ayKey(t.cardName, t._text || t.effect, t.cardId), tg = t._picked && t._picked.length ? t._picked : null;
  state.ay[key] = { auto: false, sig: (() => { try { const sp = parseTargetSpecs(t._text || t.effect); return sp.length ? legalSig(sp, t.cardId) : null; } catch (e) { return null; } })(), id: t.cardId, name: t.cardName, text: t._text || t.effect, targets: null, label: null };   // asked once per game
  const m = modal('Always yield?', { width: 520, sticky: true, noClose: true });
  m.el.classList.add('ay-offer');
  m.body.append(h('div', { class: 'psub', text: `${t.cardName}: ${t._text || t.effect}` }),
    h('div', { class: 'psub', text: `Always put this ability on the stack${tg ? ' targeting ' + tg.map(x => x.name).join(', ') : ''} and apply the same effect for the rest of this game, without asking each time? (You can undo this from \u2699 \u2192 Always yield. It resets when the game ends.)` }));
  m.foot.append(h('button', { class: 'primary', text: 'Ask every time', onclick: () => { m.close(); askAlwaysYield(list, next); } }),   // v0.99.76 asking stays the default (Enter): yielding hides every later trigger of this card
    h('button', { text: 'Always yield', onclick: () => { state.ay[key].auto = true; state.ay[key].targets = tg; m.close(); log(`Always yield: ${t.cardName}'s ability will go on the stack automatically this game`); askAlwaysYield(list, next); } }));
}
function ayResolveAuto() {   // resolve always-yield abilities from the top of the stack while their effect is already known
  for (let i = 0; i < 12; i++) {
    const top = state.stack[state.stack.length - 1]; if (!top || !top.ability || !top.trigger) break;
    const e = ayGet(top.sourceName, top.text, top.sourceId); if (!e || !e.auto || !e.label || !ayEligibleText(top.text) || document.querySelector('#modalRoot .backdrop')) break;
    resolveTopOfStack();
  }
  if (state.stack.length && !document.querySelector('#modalRoot .backdrop')) openStack();
}
function openAlwaysYield() {
  const m = modal('Always yield (this game)', { width: 560 });
  const draw = () => {
    const ents = Object.entries((state && state.ay) || {}).filter(([, e]) => e.auto);
    m.body.replaceChildren(h('div', { class: 'psub', text: 'Triggered abilities that go on the stack and resolve by themselves for the rest of this game. Remove one to be asked again. All of these reset when the game ends.' }),
      ...(ents.length ? ents.map(([k, e]) => h('div', { class: 'row' }, h('span', { class: 'nm', text: `${e.name}: ${e.text}${e.targets ? ' \u2192 ' + e.targets.map(x => x.name).join(', ') : ''}${e.label ? ' (' + e.label + ')' : ''}` }), h('button', { text: 'Remove', onclick: () => { delete state.ay[k]; draw(); } }))) : [h('div', { class: 'muted', text: 'Nothing is set to always yield.' })]));
  };
  draw(); m.foot.append(h('button', { text: 'Clear all', onclick: () => { if (state) state.ay = {}; draw(); } }), h('button', { class: 'primary', text: 'Close', onclick: () => m.close() }));
}
function openTriggerBatch(batch) {
  // v0.99.36 CR 603.3: a triggered ability goes on the stack by itself the next time a player would receive priority; nobody confirms it. The only choices are
  // the ORDER of abilities that trigger at the same time (603.3b) and their modes and targets (603.3c-d); "may" is decided when it resolves (603.5).
  // So this window opens only to order two or more abilities (or when a single one's choice was cancelled, to decline an ability the app wrongly detected).
  let m = null; const win = () => m || (m = modal(remaining.length > 1 ? `${remaining.length} triggered abilities: choose the order` : 'Triggered ability', { width: 640, sticky: true, noClose: true }));
  const remaining = [...batch], placed = [];
  const finish = () => {
    if (m) m.close();
    if (placed.length) { render(); askAlwaysYield(placed, () => { render(); if (placed.every(x => x._auto)) ayResolveAuto(); else openStack(); }); }
    else { render(); resolvePendingTrigger(); }
  };
  const put = t => {
    const md = parseModal(t.effect);
    if (md) { openModeChoice(t.cardName, md, idxs => putWith(t, modalText(md, idxs)), undefined, () => draw()); return; }
    putWith(t, t.effect);
  };
  const putWith = (t, text) => {
    const specs = t.special ? [] : parseTargetSpecs(text);
    if (specs.length) {   // a trigger's targets are chosen as it goes on the stack
      chooseTargets(t.cardName, specs, picked => { if (t._ayRefresh) { t._ayRefresh.targets = picked.map(x => ({ ...x })); t._ayRefresh.sig = legalSig(specs, t.cardId); log(`Always yield: ${t.cardName}'s remembered targets were updated`); } pushWith(t, text, picked); }, { srcId: t.cardId, auto: true, onCancel: () => draw() }); return;
    }
    pushWith(t, text, null);
  };
  const pushWith = (t, text, picked) => {
    remaining.splice(remaining.indexOf(t), 1); t._picked = picked; t._text = text;
    const obj = { ability: true, trigger: true, id: state.nextId++, name: `${t.cardName} — trigger`, sourceId: t.cardId, sourceName: t.cardName, text, special: t.special, spellId: t.spellId, otherId: t.otherId, kw: t.kw, n: t.n, arg: t.arg, amt: t.amt };
    if (picked) { obj.targets = picked; obj._tgtAsked = true; if (picked[0] && picked[0].kind === 'player') obj.target = picked[0].id; }
    state.stack.push(obj);
    state.priority = { active: true, passed: false };
    placed.push(t);
    log(`${t.cardName}: triggered ability put on the stack${t._auto ? ' (always yield \u2014 turn it off in \u2699 \u2192 Always yield)' : ''}`);
    if (!remaining.length) finish(); else draw();
  };
  const skip = t => { remaining.splice(remaining.indexOf(t), 1); log(`${t.cardName}: trigger ${t.optional ? 'declined' : 'did not apply'}`); if (!remaining.length) finish(); else draw(); };
  const draw = () => {
    if (!remaining.length) return;
    if (!teach('triggerPrompts')) { put(remaining[0]); return; }   // v0.99.69 prompts off: each goes on the stack in the order it triggered (targets and modes are still chosen)
    win().body.replaceChildren(...[
      teach('stackGuidance') ? h('div', { class: 'psub', text: remaining.length > 1 ? 'Several abilities triggered at once. You choose the order they go on the stack. The LAST one you put on the stack resolves FIRST.' : 'A triggered ability goes on the stack, then resolves like a spell. Read it: if it says "you may", or has a condition, decide whether it applies.' }) : null,
      ...remaining.map(t => h('div', { class: 'trig' },
        h('div', { class: 'trig-src', text: t.cardName }),
        h('div', { class: 'muted small', text: t.why }),
        h('div', { class: 'trig-text', text: t.text }),
        h('div', { class: 'pbtns' },
          h('button', { class: 'primary', text: 'Put on the stack', onclick: () => put(t) }),
          h('button', { text: t.optional ? 'Choose not to' : "Doesn't apply", onclick: () => skip(t) })))),
      placed.length ? h('div', { class: 'muted small', text: 'On the stack so far (bottom to top): ' + placed.map(t => t.cardName).join(', ') }) : null
    ].filter(Boolean));
  };
  for (const t of [...remaining]) {   // always-yield abilities go on the stack by themselves
    const e = ayGet(t.cardName, t.effect, t.cardId); if (!e || !e.auto || !ayEligibleText(t.effect) || !remaining.includes(t) || parseModal(t.effect) || (e.targets || []).some(p => p.kind === 'opp')) continue;
    const specs = t.special ? [] : parseTargetSpecs(t.effect);
    if (!specs.length) { t._auto = true; pushWith(t, t.effect, null); if (!remaining.length) return; }
    else if (e.sig && e.sig !== legalSig(specs, t.cardId)) { t._ayRefresh = e; log(`Always yield: ${t.cardName} has a different set of possible targets than when you set it, so you choose again`); }   // a new (or missing) possible target: ask again
    else if (e.targets && ayTargetsOk(e.targets)) { t._auto = true; pushWith(t, t.effect, e.targets.map(x => ({ ...x }))); if (!remaining.length) return; }
  }
  if (remaining.length === 1) { put(remaining[0]); return; }   // one ability: straight onto the stack (asking only for its modes / targets)
  if (remaining.length) draw();
}
const NUMW = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const numOf = w => NUMW[String(w).toLowerCase()] || parseInt(w, 10) || 1;
// ---- the one list of effects the app can apply for a piece of rules text (used by the game AND by the card reader)
const WORD_NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const wnum = w => /^x$/i.test(w) ? 'X' : (WORD_NUM[String(w).toLowerCase()] || parseInt(w, 10) || 1);
// ---- v0.80 hand-written card definitions.
// A definition says, for one exact piece of rules text on one card, what the app does when it resolves. It is checked BEFORE the general text reader, so a
// card with a definition never depends on guesswork. Each definition lists the card's lines as { re, note, options(obj) } where options returns the same
// { label, fn } choices the general reader does. Cards without a definition still use the general reader (and the scanner tells you how far it got).
const CARD_DEFS = [];   // v0.96.4: a flat list of rules-text definitions. A line is matched by what the card SAYS, never by its name, so any card with the same wording behaves the same.
function defCard(name, def) { for (const L of def.lines) CARD_DEFS.push(Object.assign({ doc: name }, L)); }   // 'name' is documentation only
function defLine(name, text) {
  const clean = x => x.replace(/\([^)]*\)/g, ' ').replace(/\u2019/g, "'").replace(name ? selfNameRe(name) : /$^/, '~').replace(/\s+/g, ' ').trim();
  const whole = clean(String(text || '')); let L = CARD_DEFS.find(x => x.re.test(whole)); if (L) return L;
  for (const raw of String(text || '').split('\n')) { const t = clean(raw); if (!t) continue; L = CARD_DEFS.find(x => x.re.test(t)); if (L) return Object.assign({}, L, { _line: raw }); }
  return null;
}
defCard('Sink into Stupor', { lines: [{
  re: /^Return target spell or nonland permanent an opponent controls to its owner's hand\. If a spell is returned this way, that spell's owner puts it on top of their library instead\.?$/i,
  note: 'a spell is taken off the stack and goes on top of its owner\'s library; a permanent returns to its owner\'s hand.',
  options(obj) {
    const out = [];
    for (const t of (obj.targets || []).filter(x => !x.gone)) {
      if (t.kind === 'spell') out.push({ label: `Return ${t.name} from the stack: its owner puts it on top of their library instead (not to hand)`, fn: () => {
        const i = state.stack.findIndex(x => x.id === t.id); if (i < 0) { log(`Sink into Stupor: ${t.name} is no longer on the stack`); return; }
        const [c] = state.stack.splice(i, 1); if (!state.stack.length) state.priority = { active: false, passed: false };
        if (c.opp) log(`Sink into Stupor: ${t.name} leaves the stack and goes on top of your opponent's library (their library is not tracked)`);
        else { state.library.unshift(c); log(`Sink into Stupor: ${c.name} goes on top of your library`); }
        render();
      } });
      else if (t.kind === 'perm') out.push({ label: `Return ${t.name} to its owner's hand`, fn: () => { const f = findCard(t.id); if (f && f.zone === 'battlefield') moveCard(t.id, 'hand'); else log(`Sink into Stupor: ${t.name} is no longer on the battlefield`); } });
      else out.push({ label: `${t.name}: returned to its owner's hand (your opponent's permanent: apply it at the table)`, fn: () => log(`Sink into Stupor: ${t.name} returns to its owner's hand (opponent's permanent: apply at the table)`) });
    }
    return out;
  } }] });

// ---- v0.86 definitions written from the user's own deck scan (Modern Domain, Dragons, Grixis, Jewel Shops, Landfall, Leyline of the Goyf)
const srcCard = obj => { const f = obj && obj.sourceId ? findCard(obj.sourceId) : null; return f && f.zone === 'battlefield' ? f.card : null; };
const genericFor = (obj, tx) => effectOptions(tx, { ...obj, sourceName: '~' });   // the general reader, skipping this card's definition
function payManaThen(card, cost, label, cb) {   // pay a mana cost for an effect ("you may pay {4}") with the normal payment window, then run cb
  if (!state) return false;
  if (!manaPaymentAllocation(manaCostParts(cost), state.manaPool || {}, manaSources(), null).ok) { toast('Cannot pay', `You cannot pay ${cost} right now. Choose not to, or make more mana first.`); return false; }
  const finish = ids => { snap(); tapManaIds(ids || []); cb(); render(); };
  if (teach('stackGuidance')) { openManaPayment(card, finish, cost, label); return true; }
  const plan = manaPaymentAllocation(manaCostParts(cost), state.manaPool || {}, manaSources(), null);
  state.manaPool = plan.pool; finish(plan.used.map(i => manaSources()[i].card.id)); return true;
}
defCard('Twinned Vision', { lines: [{
  re: /^Draw a card\. If this spell wasn't cast from your hand, draw two cards instead\.?$/i,
  note: 'draws one card, or two if it was cast from anywhere except your hand (the app remembers where you cast it from, so flashback draws two).',
  options(obj) { const n = obj.castFrom && obj.castFrom !== 'hand' ? 2 : 1; return [{ label: n === 2 ? `Draw 2 cards (it was cast from your ${obj.castFrom}, not your hand)` : 'Draw 1 card (cast from your hand)', fn: () => { snap(); const d = drawCards(n); log(`Twinned Vision: you drew ${d}`); render(); } }]; } }] });
defCard('Requiting Hex', { lines: [{
  re: /^Destroy target creature with mana value \d+ or less\. If this spell's additional cost was paid, you gain \d+ life\.?$/i,
  note: 'destroys the target; the life is offered only if you paid the optional extra cost when you cast it.',
  options(obj) { const out = genericFor(obj, 'Destroy target creature with mana value 2 or less.'); if (obj.optPaid) out.push({ label: 'Gain 2 life (you paid the additional cost: blight 1)', fn: () => changeLife(2, true) }); else out.push({ label: 'No life gain: the additional cost was not paid', fn: () => log('Requiting Hex: the additional cost was not paid, so no life gained') }); return out; } }] });
defCard('Foul-Tongue Invocation', { lines: [{
  re: /^Target player sacrifices a creature of their choice\. If you revealed a Dragon card or controlled a Dragon as you cast this spell, you gain 4 life\.?$/i,
  note: 'the target player sacrifices a creature; you gain 4 life only if you revealed a Dragon card or controlled a Dragon as you cast it (you choose, the app cannot see a revealed card).',
  options(obj) {
    const out = [], t = (obj.targets || []).filter(x => !x.gone)[0];
    const mine = t && t.kind === 'player' && t.id === 'you';
    out.push({ label: mine ? 'You sacrifice a creature of your choice' : `${t ? t.name : 'Target player'} sacrifices a creature of their choice (their board is not tracked: apply it at the table)`, fn: () => {
      if (!mine) { log('Foul-Tongue Invocation: the target player sacrifices a creature of their choice (apply at the table)'); render(); return; }
      const cands = state.battlefield.filter(c => permTypeInfo(c).types.has('creature'));
      if (!cands.length) { log('Foul-Tongue Invocation: you control no creature to sacrifice'); return; }
      pickCardsModal('Foul-Tongue Invocation', 'Choose a creature you control to sacrifice.', cands, 1, ids => { log('Foul-Tongue Invocation: you sacrificed a creature'); moveCard(ids[0], 'graveyard'); });
    } });
    const dr = state.battlefield.some(c => permTypeInfo(c).subs.has('dragon'));
    out.push({ label: `Gain 4 life (you revealed a Dragon card or controlled a Dragon as you cast it${dr ? ': you control one now' : ''})`, fn: () => changeLife(4, true) });
    return out; } }] });
defCard('Tribal Flames', { lines: [{
  re: /^Domain\s*[—-]\s*~ deals X damage to any target, where X is the number of basic land types among lands you control\.?$/i,
  note: 'counts the basic land types among your lands (Plains, Island, Swamp, Mountain, Forest) and deals that much damage.',
  options(obj) { const n = domainCount(); return genericFor(obj, `~ deals ${n} damage to any target.`).map(o => ({ ...o, label: `${o.label || 'Deal damage'} (domain: ${n} basic land type${n === 1 ? '' : 's'})` })); } }] });
defCard('Wan Shi Tong, Librarian', { lines: [{
  re: /^put (X|\d+) \+1\/\+1 counters on (?:~|him)\. Then draw half (?:X|\d+) cards, rounded down\.?$/i,
  note: 'puts X +1/+1 counters on it, then you draw half X cards rounded down (X is read from how it was cast).',
  options(obj, tx) { const m = /put (X|\d+)/i.exec(tx), c = srcCard(obj), n = m && m[1] !== 'X' ? +m[1] : (c && c.xValue) || 0, d = Math.floor(n / 2);
    return [{ label: `Put ${n} +1/+1 counter${n === 1 ? '' : 's'} on it, then draw ${d} card${d === 1 ? '' : 's'} (X = ${n})`, fn: () => { if (c && n) addCounter(c.id, n, 'plus'); if (d) { snap(); const k = drawCards(d); log(`Wan Shi Tong: you drew ${k}`); } render(); } }]; } }] });
defCard('Wan Shi Tong, Librarian', { lines: [{
  re: /^put a \+1\/\+1 counter on (?:~|him|Wan Shi Tong) and draw a card\.?$/i,
  note: 'when an opponent searches their library (use the \uD83D\uDD0E button next to their life), it gets a +1/+1 counter and you draw a card.',
  options(obj) { const c = srcCard(obj); return [{ label: 'Put a +1/+1 counter on it and draw a card', fn: () => { if (c) addCounter(c.id, 1, 'plus'); snap(); const k = drawCards(1); log(`Wan Shi Tong: you drew ${k}`); render(); } }]; } }] });
defCard('Mossborn Hydra', { lines: [{
  re: /^double the number of \+1\/\+1 counters on ~\.?$/i,
  note: 'doubles the +1/+1 counters on it.',
  options(obj) { const c = srcCard(obj); if (!c) return []; const cur = (c.counters && c.counters.plus) || 0; return [{ label: `Double its +1/+1 counters (${cur} → ${cur * 2})`, fn: () => { if (cur) addCounter(c.id, cur, 'plus'); else log('Mossborn Hydra: no +1/+1 counters to double'); } }]; } }] });
defCard('Kappa Cannoneer', { lines: [{
  re: /^put a \+1\/\+1 counter on ~\. It can't be blocked this turn\.?$/i,
  note: 'puts a +1/+1 counter on it; "can\'t be blocked" has no effect in a goldfish game (there are no blockers).',
  options(obj) { const c = srcCard(obj); if (!c) return []; return [{ label: 'Put a +1/+1 counter on it (it can\'t be blocked this turn)', fn: () => { addCounter(c.id, 1, 'plus'); log('Kappa Cannoneer: it can\'t be blocked this turn'); } }]; } }] });
defCard('Search for Azcanta', { lines: [{
  re: /^surveil 1\. Then if you have seven or more cards in your graveyard, you may transform ~\.?$/i,
  note: 'surveil 1, then checks your graveyard (seven cards) and offers to transform it.',
  options(obj, tx) { return [{ label: 'Surveil 1, then transform it if you have seven or more cards in your graveyard', fn: () => {
    openScry(1, true, tx, () => {
      const n = state.graveyard.length;
      if (n < 7) { log(`Search for Azcanta: ${n} card${n === 1 ? '' : 's'} in your graveyard, not seven: it does not transform`); render(); return; }
      const m = modal('Search for Azcanta', { width: 460, sticky: true, noClose: true });
      m.body.append(h('div', { class: 'psub', text: `You have ${n} cards in your graveyard. You may transform it into Azcanta, the Sunken Ruin.` }));
      m.foot.append(h('button', { text: 'Do not transform', onclick: () => { m.close(); log('Search for Azcanta: you chose not to transform it'); render(); } }), h('button', { class: 'primary', text: 'Transform', onclick: () => { m.close(); if (obj.sourceId) transformPerm(obj.sourceId); } }));
    }); } }]; } }] });
defCard('Mana Vault', { lines: [{
  re: /^you may pay \{4\}\. If you do, untap ~\.?$/i,
  note: 'asks you to pay {4} with the normal payment window, then untaps it.',
  options(obj) { const c = srcCard(obj); if (!c) return []; return [{ label: 'Pay {4} and untap Mana Vault', fn: () => { if (!c.tapped) { toast('Already untapped', 'Mana Vault is already untapped.'); return; } payManaThen(c, '{4}', 'Pay {4} and untap', () => { c.tapped = false; log('Mana Vault: paid {4} and untapped it'); }); } }]; } }] });
// Lands from the graveyard (Icetill Explorer, Mole Man, Crucible of Worlds...)
function gyLandPermission() { return !!state && state.battlefield.some(x => !x.token && /you may play lands from your graveyard/i.test(((cardInfo(x.name) || {}).tx || '').replace(/\s+/g, ' '))); }
function gyLandPlayable(c) { return !!c && !c.token && gyLandPermission() && !!(cardInfo(c.name) || {}).land; }
function playLandFromGy(id) {
  const f = findCard(id); if (!f || f.zone !== 'graveyard' || !gyLandPlayable(f.card)) return;
  if (!canPlayLandNow()) { toast(landDropUsed() ? 'Land already played' : 'Wrong phase', landDropUsed() ? 'You have already used all your land plays this turn.' : 'Lands can only be played during your main phase when the stack is empty.'); return; }
  log(`${f.card.name}: played from your graveyard (a land you may play because of a permanent you control)`);
  moveCard(id, 'hand'); playLand(id);
}
// v0.88: linked steps. "Draw two cards, then discard two cards" / "Discard a card. If you do, draw a card": the second
// part is not optional and not a separate effect, it is the price of the first (Faithless Looting, Merfolk Looter, Prismari Command).
function parseDrawDiscard(tx) {
  const t = String(tx || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const sents = t.split(/(?<=[.!?])\s+/);
  const NUM = '(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+|that many)';
  const re = new RegExp('\\b(draw|discard)s?\\s+' + NUM + '\\s+cards?\\b', 'gi');
  for (let i = 0; i < sents.length; i++) {
    let seg = sents[i];
    if (!/\b(?:draws?|discards?)\b/i.test(seg)) continue;
    while (i + 1 < sents.length && /^(?:Then|If you do,|If you can,)\s+(?:you\s+)?(?:draw|discard)/i.test(sents[i + 1])) seg += ' ' + sents[++i];
    if (/\byou may\b|\bX\b|\bat random\b|\bopponent\b|\beach player\b|\bwhenever\b|\bif you (?!do|can)/i.test(seg)) continue;
    const steps = []; let m; re.lastIndex = 0;
    while ((m = re.exec(seg))) steps.push({ k: m[1].toLowerCase(), n: /^that many$/i.test(m[2]) ? 'that' : wnum(m[2]) });
    if (steps.length >= 2 && steps.some(x => x.k === 'draw') && steps.some(x => x.k === 'discard') && steps.every(x => x.n === 'that' || x.n > 0)) {
      return { steps, needs: /\bif you do\b/i.test(seg), text: seg };
    }
  }
  return null;
}
function ddLabel(p) { return p.steps.map((x, i) => (i ? 'then ' : '') + (x.k === 'draw' ? 'draw ' : 'discard ') + (x.n === 'that' ? 'that many' : x.n) + ' card' + (x.n === 1 ? '' : 's')).join(', ').replace(/^./, c => c.toUpperCase()); }
function runDrawDiscard(p, src) {
  snap();
  let i = 0, last = 0;
  const step = () => {
    if (i >= p.steps.length) { render(); flushTriggers(); return; }
    const st = p.steps[i++], n = st.n === 'that' ? last : st.n;
    if (p.needs && i > 1 && !last) { log(`${src}: "if you do" — nothing happened in the step before, so the rest is skipped`); i = p.steps.length; step(); return; }
    if (st.k === 'draw') { last = drawCards(n); log(`${src}: drew ${last}`); render(); step(); return; }
    if (!state.hand.length) { last = 0; log(`${src}: nothing to discard (your hand is empty)`); step(); return; }
    const finish = (ids) => { const picked = ids.map(id => state.hand.find(c => c.id === id)).filter(Boolean); for (const c of picked) moveCard(c.id, 'graveyard'); last = picked.length; log(`${src}: discarded ${picked.map(c => c.name).join(', ')}`); render(); step(); };
    pickFromHand({ n, title: src, verb: 'discard', note: `The discard is part of the effect (${ddLabel(p).toLowerCase()}).`, done: finish });
  };
  step();
}
// v0.93.0 Linked clauses (area 3): "Do A. Then do B." / "Do A. If you do, B." for any effects the app already understands one at a time.
// Each clause runs in order. An "If you do" clause runs only when the clause before it actually changed something (zones, life or mana);
// when a clause opens its own window (a pick, a scry) the chain waits until that window is finished before judging.
function chainSig() { const s = state; return [s.hand.length, s.library.length, s.graveyard.length, s.exile.length, s.battlefield.length, s.battlefield.filter(c => c.tapped).length, s.life, JSON.stringify(s.manaPool), s.stack.length].join('/'); }
function chainBusy(base) { return !!(handPick || (state && state.discarding) || document.querySelectorAll('.modal').length > base); }
function runChain(steps, src, baseModals) {
  let i = 0, prev = true;
  const next = () => {
    if (i >= steps.length) { render(); flushTriggers(); return; }
    const st = steps[i++];
    if (st.needs && !prev) { log(`${src}: "${st.text.slice(0, 60)}\u2026" skipped, the step before did nothing (rule: "if you do")`); next(); return; }
    const before = chainSig(); st.opt.fn();
    const judge = () => { prev = chainSig() !== before; next(); };
    if (chainBusy(baseModals)) { let t = 0; const iv = setInterval(() => { if (!chainBusy(baseModals) || ++t > 400) { clearInterval(iv); judge(); } }, 150); } else judge();
  };
  next();
}
// v0.99.25 "Deal 1 damage. Then amass Orcs 1." is ONE ability: when every step is understood, the player is offered the whole ordered chain as a single button
// (and Always Yield repeats the whole chain), instead of one button per step where the later steps are easy to skip.
// An option label can carry a live number ("... (counts when it happens; now 2)"). That number changes every time, so Always Yield compares labels without it.
function lblStable(l) { return String(l || '').replace(/\s*\(counts when it happens; now \d+\)/g, ''); }
function visibleOptions(all) {
  const ch = (all || []).find(o => o && o.chain && o.covers); if (!ch) return (all || []).filter(o => !o.hidden);
  return all.filter(o => o === ch || (!o.hidden && !ch.covers.has(o.label)));
}
function effectOptions(tx, obj) {
  if (hasRawQuote(tx)) { const res = effectOptions(maskQuotes(tx), obj); return res.map(o => o && typeof o.label === 'string' && o.label.includes('\u0001') ? Object.assign({}, o, { label: unmaskQuotes(o.label) }) : o); }   // quoted text is another object's ability
  tx = applyKickedInstead(tx, !!(obj && obj.optPaid));
  tx = applyCondInstead(tx);   // "... deals 4 damage instead if you control three or more artifacts"
  tx = applyWhereX(tx, obj);   // "...where X is your devotion to blue" / "the number of Elves you control"
  { const g0 = obj && obj.sourceId != null ? (findCard(obj.sourceId) || {}).card : null, ii = interveningIf(tx, g0 || null);   // v0.99.81 CR 603.4 / 608.2c a leading "if <condition>," read from what happened (src/88)
    { const dropped = []; tx = String(tx).replace(/(^|\.\s+)([^.]*?) unless ([^.]+?)\./g, (all, pre, body, cond) => { let v = null; try { v = evalCond(cond, g0 || null); } catch (e) { v = null; } if (v === true) { dropped.push(`${body.replace(/^then /i, '')} (${cond})`); return pre; } if (v === false) return pre + body + '.'; return all; }).trim();   // v0.99.84 "Then discard a card unless you attacked this turn" (Chart a Course)
      if (dropped.length) log(`${(obj && obj.sourceName) || 'Effect'}: not done: ${dropped.join('; ')}`); }
    if (ii && ii.value === true) tx = ii.rest;
    else if (ii && ii.value === false) { const trig = !!(obj && (obj.trigger || obj.ability || obj.kind === 'ability')), restS = String(tx).split(/(?<=\.)\s+/).slice(1).join(' ').trim();
      if (trig || !restS) return [{ full: true, covers: [String(tx)], label: `Does nothing: ${ii.cond} is not true now (CR 603.4)`, fn: () => log(`${(obj && obj.sourceName) || 'Ability'}: ${ii.cond} is not true, so it does nothing`) }];
      tx = restS; } }
  let res = effectOptionsInner(tx, obj); const seen = new Set();   // v0.94.7 an identical suggestion is never listed twice
  { const nm = obj && obj.sourceName ? String(obj.sourceName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : null; const b2 = batch2Options(nm ? String(tx).replace(new RegExp(nm, 'gi'), '~') : tx, obj || {});   // v0.99.69 rules batch 2 (src/86)
    if (b2.out.length) { res = res.filter(o => !(o && o.label && b2.drop.some(r => r.test(o.label)))); for (const o of b2.out) { const same = res.find(r => r && r.label === o.label); if (same) { if (o.covers) same.covers = [...(same.covers || [])].concat(o.covers); } else res.push(o); } } }   // v0.99.77 an option offered twice keeps one copy, with what both say they carry out
  if (res.some(o => o && o.early)) res = res.filter(o => o && o.early).concat(res.filter(o => !(o && o.early)));   // v0.99.80 CR 614 a replacement the spell sets up ("exile it instead") is in place before its damage is dealt
  // v0.99.79 a "Remember …" note is only for a sentence nothing else carries out: when another option already does it, the note goes
  if (!(obj && obj._noRemCheck) && res.some(o => o && /^Remember \(/.test(o.label || ''))) {
    res = res.filter(o => { if (!o || !/^Remember \(/.test(o.label || '')) return true; const sen = String(o.label).replace(/^Remember \([^)]*\):\s*/, '').replace(/\u2026$/, '');
      if (res.some(r => r !== o && r && [...(r.covers || [])].some(cv => String(cv).toLowerCase().startsWith(sen.toLowerCase().slice(0, 40))))) return false;
      let alt = []; try { alt = effectOptions(sen, Object.assign({}, obj, { _noRemCheck: true })).filter(r => r && typeof r.fn === 'function' && !/^Remember \(/.test(r.label || '') && !r.hidden); } catch (e) { alt = []; }
      return !alt.length || !alt.every(r => res.some(q => q && q.label === r.label)); });
  }
  // The same draw must not be offered twice ("Draw 1 card" from the plain reader and "You draw 1 card" from the targeted reader): applying both would draw twice.
  const drawN = res.filter(o => o && /^(?:Draw|You draw|.+ draws?) (\d+|a|an) cards?$/i.test(o.label || '') && typeof o.fn === 'function' && !o.hidden);
  const dup = new Set(); if (drawN.length > 1) { const keep = drawN.find(o => !/^Draw /i.test(o.label)) || drawN[0]; for (const o of drawN) if (o !== keep && String(o.label).replace(/^(?:You draw|.+ draws?)/i, 'Draw').toLowerCase() === String(keep.label).replace(/^(?:You draw|.+ draws?)/i, 'Draw').toLowerCase()) dup.add(o); }
  const outList = res.filter(o => { if (dup.has(o)) return false; const k = o && o.label && typeof o.fn === 'function' ? o.label : null; if (!k) return true; if (seen.has(k)) return false; seen.add(k); return true; });
  // CR 608.2c: effects happen in the order the text gives them, so list the suggestions in that order too.
  try {
    const low = String(tx || '').toLowerCase(), STEM = { scry: 'scr', create: 'creat', draw: 'draw', surveil: 'surveil', gain: 'gain', lose: 'lose', exile: 'exile', return: 'return', destroy: 'destroy', put: 'put', sacrifice: 'sacrifice' };
    const rank = o => { const m = /^(?:you |target player |each opponent )?(\w+)/i.exec(o.label || ''); const st = m && STEM[m[1].toLowerCase()]; const i = st ? low.search(new RegExp('\\b' + st)) : -1; return i; };
    const items = outList.filter(o => o && typeof o.fn === 'function' && !o.hidden);
    if (items.length > 1 && items.every(o => rank(o) >= 0)) { const sorted = items.slice().sort((a, b) => rank(a) - rank(b)); let k = 0; return outList.map(o => (o && typeof o.fn === 'function' && !o.hidden) ? sorted[k++] : o); }
  } catch (e) { /* ordering only */ }
  return outList;
}
function effectOptionsInner(tx, obj) {
  { const lk = classLevelOptions(tx, obj) || preparedOptions(tx, obj) || permChoiceOptions(tx, obj) || exiledReturnOptions(tx, obj) || massEffectOptions(tx, obj) || handRefillOptions(tx, obj) || playerChoiceOptions(tx, obj) || incubateOptions(tx, obj) || manaCountOptions(tx, obj) || vehicleOptions(tx, obj) || revealTopOptions(tx, obj) || oppHandOptions(tx, obj) || playerClauseOptions(tx, obj) || selfMoveOptions(tx, obj) || lookReorderOptions(tx, obj) || shuffleIntoOptions(tx, obj) || attachAfterCreateOptions(tx, obj) || linkedDependentOptions(tx, obj) || millAmongOptions(tx, obj) || assimilateOptions(tx, obj) || sacUnlessOptions(tx, obj) || ifYouDoOptions(tx, obj); if (lk) return lk; }   // v0.97.6 "destroy X. Its controller creates ..." is one linked effect
  const base = effectOptionsBase(tx, obj);
  try {
    if (!state || (obj && obj.special) || base.some(o => o.full || o.special)) return base;
    const clean = String(tx || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').replace(/,\s+then\s+(?=[a-z])/gi, '. Then ').trim();   // v0.95.3 "A, then B" is two ordered steps
    const sents = clean.split(/(?<=[.!?])\s+/).map(x => x.trim()).filter(Boolean);
    if (parseDrawDiscard(clean)) return base;
    if (sents.length < 2 || !sents.some((x, i) => i > 0 && /^(?:Then|If you do|If you can)\b/i.test(x))) return base;
    if (/\b(?:choose one|choose two|you may|X\b)/i.test(clean) || sents.some(x => /^(?:Flashback|Kicker|Storm|Cycling|Escape|Buyback|Entwine)/i.test(x))) return base;
    const steps = [];
    for (let i = 0; i < sents.length; i++) {
      const o = effectOptionsBase(sents[i].replace(/^(?:Then|If you do,|If you can,)\s+/i, ''), obj).filter(x => typeof x.fn === 'function' && !x.special);
      if (o.length !== 1) return base;
      steps.push({ opt: o[0], text: sents[i], needs: /^If you (?:do|can)\b/i.test(sents[i]) });
    }
    // v0.96.10 CR 608.2c: the steps of "A, then B" are applied in written order. The ordering is kept backend-side
    // (the component abilities are listed in sentence order); no combined "In order" entry is shown to the player.
    const ordered = steps.map(st => st.opt), keys = new Set(ordered.map(o => o.label));
    const src = (obj && obj.sourceName) || 'Ability';
    return [...ordered, ...base.filter(o => !keys.has(o.label)), { label: steps.map((st, i) => { const l = String(st.opt.label || st.text); return i ? l.replace(/^./, c => c.toLowerCase()) : l; }).join(', then '), full: false, chain: true, hidden: true, covers: keys, fn: () => { snap(); runChain(steps, src, document.querySelectorAll('.modal').length); } }];
  } catch (e) { return base; }
}
function effectOptionsBase(tx, obj) {
  obj = obj || {}; tx = String(tx || '');
  if (obj.kw && KW_EFFECTS[obj.kw]) return KW_EFFECTS[obj.kw](obj);   // v0.96.1 a keyword trigger resolving (exalted, evolve ...)
  { const srcN = obj.sourceName || 'Ability', te = emblemEffect(tx, srcN) || targetPermanentEffect(tx, srcN, obj) || becomesCreatureEffect(tx, srcN, obj) || animateGeneralEffect(tx, srcN, obj) || charChangeEffect(tx, srcN, obj) || wishEffect(tx, srcN); if (te) return [te]; }   // v0.96.12 emblems (CR 114) and "untap/put counters on target permanent. If it's ..." read from the rules text
  { const L = defLine(obj.sourceName, tx);
    if (L) {
      const o = L.options(obj, L._line || tx);
      if (o && o.length) {
        const out = o.map(x => ({ full: true, def: true, ...x }));
        if (L._line) { const rest = tx.split('\n').filter(l => l !== L._line).join('\n').trim(); if (rest) out.push(...effectOptions(rest, obj)); }
        return out;
      }
    } }
  if (/\bchoose (?:one|two|up to one|up to two|one or both)\b[^\u2022]*\u2014/i.test(tx) && /\u2022/.test(tx)) {   // modal: offer each mode separately
    const modes = tx.split(/\s*\u2022\s*/).slice(1), out = [];
    modes.forEach((md, i) => { for (const o of effectOptions(md, obj)) out.push(o.label ? { ...o, label: `Mode ${i + 1}: ${o.label}` } : o); });
    return out;
  }
  const src = obj.sourceName || '~';
  const txs = tx.replace(new RegExp(src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '~');
  const opts = []; let mm, fe;
  kwActionOptions(tx, obj, opts);   // v0.96.1 bolster / adapt / connive / discover
  const bound = obj.targets && obj.targets.length ? targetedOptions(tx, obj) : [];
  const pl = n => (n === 1 ? '' : 's');
  if (/pay any amount of life/i.test(tx) && /draw that many/i.test(tx)) opts.push({ special: 'payLifeDraw', summary: 'pay life and draw' });
  if (obj.special === 'cascade') opts.push({ special: 'cascade', summary: 'cascade' });
  if (obj.special === 'ninjutsu' && obj.ninjId) opts.push({ label: `Put ${obj.sourceName} onto the battlefield tapped and attacking`, full: true, fn: () => {
    const f = findCard(obj.ninjId); if (!f || f.zone !== 'hand') { toast('Not in hand', `${obj.sourceName} is no longer in your hand.`); return; }
    snap(); state.hand.splice(f.idx, 1);
    enterBattlefield(f.card, { from: 'hand', tapped: true, logMsg: `${obj.sourceName}: put onto the battlefield tapped and attacking (ninjutsu)` });
    state.combat.attackers = (state.combat.attackers || []).concat([f.card.id]);   // it attacks without having been declared as an attacker, so "whenever attacks" does not trigger (CR 508.4)
    render(); flushTriggers();
  } });
  // v0.92.1 "Target player reveals their hand. You choose a [nonland] card from it. That player discards that card." (Cabal Therapist, Duress-style)
  if (/target player reveals their hand\.\s*you choose (?:a|an) ([a-z\- ]*?)card from it\.\s*that player discards (?:that card|it)/i.test(tx)) {
    const nl = /nonland/i.test(tx), tgt = obj.targets && obj.targets[0], mine = !tgt || tgt.id === 'you', srcN = obj.sourceName || 'Ability';
    opts.push({ full: true, label: mine ? `Discard a ${nl ? 'nonland ' : ''}card from your hand (you are the target)` : `Opponent reveals their hand (nothing to choose in a goldfish game)`, fn: () => {
      if (!mine) { log(`${srcN}: the opponent's hand is not tracked in a goldfish game, so nothing is discarded`); return; }
      pickFromHand({ n: 1, title: srcN, verb: 'discard', choose: true, ok: c => !nl || !isLandName(c.name), note: `You are the target, so you choose a ${nl ? 'nonland ' : ''}card from your own hand and discard it.`, done: ids => { const c = state.hand.find(x => x.id === ids[0]); if (c) { moveCard(c.id, 'graveyard'); log(`${srcN}: discarded ${c.name}`); } else log(`${srcN}: no ${nl ? 'nonland ' : ''}card to discard`); render(); flushTriggers(); } });
    } });
  }
  // v0.95.2 Imprint: "you may exile a [nonartifact, nonland] card from your hand" (Chrome Mox). The exiled card is remembered on the source; its colours feed the mana ability.
  { const im = tx.match(/\bexile (?:an?|one) ([a-z, \-]*?)card(?: with mana value (\d+) or (greater|less))? from your hand\b/i); if (im && obj.sourceId && /imprint/i.test(cardText((findCard(obj.sourceId) || {}).card || {}) || '')) {
    const words = im[1].toLowerCase().split(/[ ,]+/).filter(Boolean), srcN = obj.sourceName;
    const okType = c => { const t = frontType(c), inf = cardInfo(c.name) || {}; if (im[2] && (im[3].toLowerCase() === 'greater' ? (inf.cmc || 0) < +im[2] : (inf.cmc || 0) > +im[2])) return false; return words.every(w => w === 'colorless' ? !((inf.col || []).length) :  /^non(.+)$/.test(w) ? !new RegExp('\\b' + w.slice(3) + '\\b', 'i').test(t) : new RegExp('\\b' + w + '\\b', 'i').test(t)); };   // v0.96.30 "colorless" and "with mana value N or greater/less" (Ugin's Labyrinth)
    opts.push({ full: true, label: `Imprint: exile ${im[1].trim() ? 'a ' + im[1].trim() + ' ' : 'a '}card from your hand`, fn: () => {
      const cands = state.hand.filter(okType);
      if (!cands.length) { toast('Nothing to imprint', `You have no ${im[1].trim() || ''} card in hand to exile, so ${srcN} stays without an imprinted card.`); return; }
      pickFromHand({ n: 1, title: srcN, verb: 'exile', choose: true, ok: okType, note: `Choose the card to exile with ${srcN} (imprint). Its colours are the colours of mana ${srcN} can make.`, done: ids => {
        const c = state.hand.find(x => x.id === ids[0]), src = findCard(obj.sourceId); if (!c || !src) return;
        const cols = ((cardInfo(c.name) || {}).col || []).filter(k => 'WUBRG'.includes(k)); snap(); moveCard(c.id, 'exile');
        src.card.imprint = { name: c.name, cols }; log(`${srcN}: imprinted ${c.name}${cols.length ? ' (' + cols.join('') + ')' : ' (colourless: no mana)'}`); render(); } });
    } });
  } }
  if (obj.special === 'sacSelf' && obj.sourceId) opts.push({ label: `Sacrifice ${obj.sourceName}`, fn: () => { const f = findCard(obj.sourceId); if (f && f.zone === 'battlefield') { log(`${obj.sourceName}: sacrificed (evoke)`); moveCard(f.card.id, 'graveyard'); } else toast('Already gone', `${obj.sourceName} is no longer on the battlefield.`); } });
  const delayed = /\bat the beginning of (?:the )?next (?:turn's )?upkeep\b/i.test(tx);
  if (/look at the top card of target player'?s library/i.test(tx)) opts.push({ special: 'lookTop', summary: 'look at the top card' });
  // v0.82 look at the top N cards and distribute them
  // v0.99.68 impulse draw: "Exile the top [N] card(s) of your library. [Until the end of your next turn | Until end of turn | This turn,] you may play/cast it/them [this turn | until the end of your next turn]."
  const imp = /\bexile the top (card|(a|one|two|three|four|five|six|seven|x|\d+) cards) of your library(?: face down)?\.\s*((?:until the end of your next turn|until end of turn|this turn|until your next end step),?\s*)?you may (play|cast) (?:it|that card|them|those cards|the exiled cards?|cards exiled this way)( this turn| until the end of your next turn| until end of turn| until your next end step)?\.?/i.exec(txs.replace(/\n/g, ' '));
  if (imp && state && !/\bif you don'?t\b|\bspend mana as though\b/i.test(txs)) {
    const n = imp[1].toLowerCase() === 'card' ? 1 : (/^x$/i.test(imp[2]) ? (obj.xValue || 0) : numOf(imp[2])), nextTurn = /next turn|next end step/i.test((imp[3] || '') + (imp[5] || '')), castOnly = /^cast$/i.test(imp[4]);
    const whenTxt = nextTurn ? 'until the end of your next turn' : 'this turn';
    opts.push({ full: imp[0].replace(/\s+/g, ' ').trim().length >= txs.replace(/\s+/g, ' ').trim().length - 1, covers: imp[0].split(/(?<=\.)\s+/), label: `Exile the top ${n === 1 ? 'card' : n + ' cards'} of your library; you may ${castOnly ? 'cast' : 'play'} ${n === 1 ? 'it' : 'them'} ${whenTxt}`, fn: () => {
      snap(); const got = []; for (let i = 0; i < n && state.library.length; i++) { const c = state.library.shift(); if (nextTurn) c.mayPlayUntil = state.turn + 1; else c.mayPlayTurn = state.turn; if (castOnly) c.mayCastOnly = true; state.exile.push(c); got.push(c.name); }
      log(`${src}: exiled ${got.join(', ') || 'nothing (the library is empty)'} from the top of your library; you may ${castOnly ? 'cast' : 'play'} ${got.length === 1 ? 'it' : 'them'} ${whenTxt} (from the exile pile)`); render(); } });
  }
  { const ld = parseLookDistribute(txs.replace(/\n/g, ' ')); if (ld && state) opts.push({ full: ld.full, covers: ld.covers, label: `Look at the top ${ld.n === 1 ? 'card' : ld.n + ' cards'} of your library and sort them: ${ld.slots.map(x => x.label).join(', ')}${ld.slots.some(x => x.play) ? ' (you may play the exiled card this turn)' : ''}`, fn: () => { let sl = ld.slots; if (ld.alt) { let v = null; try { v = evalCond(ld.alt.cond, { id: -1, name: 'x', tapped: false, counters: { plus: 0, minus: 0 } }); } catch (e) {} if (v === true) { sl = ld.alt.slots; log(`${obj.sourceName || 'Ability'}: the condition "${ld.alt.cond}" is true, so the alternative applies`); } else if (v === null) toast('Check the condition', `The app cannot check "${ld.alt.cond}". If it is true, sort the cards as the "instead" line says.`); } openLookDistribute(ld.n, sl, obj.sourceName || ''); } }); }
  // v0.79 flashback granted until end of turn (Snapcaster Mage): "Target instant or sorcery card in your graveyard gains flashback until end of turn. The flashback cost is equal to its mana cost."
  { const fg = /target (instant or sorcery|instant|sorcery) card in your graveyard gains flashback until end of turn/i.exec(txs);
    if (fg) {
      const cands = state.graveyard.filter(x => !x.token && new RegExp('\\b(' + fg[1].replace(' or ', '|') + ')\\b', 'i').test(((cardInfo(x.name) || {}).t || '').split(' // ')[0]));
      opts.push({ full: true, label: `Choose a ${fg[1]} card in your graveyard: it gains flashback until end of turn (cost = its mana cost)`, fn: () => {
        if (!cands.length) { toast('No target', `You have no ${fg[1]} card in your graveyard.`); return; }
        const mm = modal('Gains flashback until end of turn', { width: 520 });
        for (const x of cands) mm.body.append(h('div', { class: 'row' }, h('span', { class: 'nm' }, x.name, ' ', symbols((cardInfo(x.name) || {}).mc || '')), h('button', { class: 'primary', text: 'Choose', onclick: () => { mm.close(); x.gfb = state.turn; log(`${x.name} gains flashback until end of turn (open the graveyard to cast it)`); render(); } })));
      } });
    } }
  // v0.73 transform (rule 701.28). "Look at the top card of your library. You may reveal it. If an instant or sorcery card is revealed this way, transform ~." (Delver of Secrets)
  if (obj.sourceId && /\btransform ~/i.test(txs)) {
    const lk = /look at the top card of your library\.\s*You may reveal (?:that|it)(?: card)?\.\s*If an? ([^.,]+?) card is revealed this way, transform ~/i.exec(txs);
    if (lk) {
      const words = lk[1].split(/,\s*|\s+or\s+/).map(w => w.trim()).filter(Boolean), re = new RegExp('\\b(?:' + words.join('|') + ')\\b', 'i');
      // v0.99.43 CR 701.16a + 608.2c: you look at the card first (only you see it), then decide whether to reveal it. Revealing any card is allowed;
      // only a revealed card of the named kind transforms it (CR 701.28). The card stays on top of the library either way.
      opts.push({ full: true, label: `Look at the top card of your library, then choose whether to reveal it (${src} transforms if you reveal ${/^[aeiou]/i.test(lk[1]) ? 'an' : 'a'} ${lk[1]} card)`, fn: () => {
        const f = findCard(obj.sourceId); if (!f || f.zone !== 'battlefield') { toast('Not on the battlefield', `${src} is no longer on the battlefield.`); return; }
        const top = state.library[0]; if (!top) { toast('Library empty', 'There is no card to look at.'); return; }
        const ti = cardInfo(top.name), ty = ((ti && ti.t) || '').split(' // ')[0], hit = re.test(ty);
        const m = modal(`${src}: the top card of your library`, { width: 460, sticky: true, noClose: true });
        let pic = null; try { pic = spotCardEl(top); pic.classList.add('peek-card'); } catch (e) { pic = h('div', { class: 'peek-card', text: top.name }); }
        m.body.append(h('div', { class: 'peek-wrap' }, pic,
          h('div', { class: 'peek-txt' }, h('b', { text: top.name }), h('div', { class: 'muted small', text: ty || 'card' }),
            h('div', { class: 'small', style: 'margin-top:8px', text: `Only you have looked at it. You may reveal it. If you reveal ${/^[aeiou]/i.test(lk[1]) ? 'an' : 'a'} ${lk[1]} card, ${src} transforms. It stays on top of your library either way.` }),
            h('div', { class: 'small ' + (hit ? 'peek-yes' : 'muted'), style: 'margin-top:6px', text: hit ? `This is ${/^[aeiou]/i.test(lk[1]) ? 'an' : 'a'} ${lk[1]} card: revealing it transforms ${src}.` : `This is not ${/^[aeiou]/i.test(lk[1]) ? 'an' : 'a'} ${lk[1]} card: revealing it would not transform ${src}.` }))));
        const done = reveal => { m.close();
          if (!reveal) { log(`${src}: looked at the top card and kept it hidden; no transform`); return; }
          const g = findCard(obj.sourceId);
          if (hit && g && g.zone === 'battlefield') { log(`${src}: revealed ${top.name} (${lk[1]}); transforming`); transformPerm(g.card.id, 1); }
          else { log(`${src}: revealed ${top.name}${hit ? '' : ` (not ${lk[1]})`}; no transform`); toast(`Revealed ${top.name}`, hit ? `${src} is no longer on the battlefield.` : `It is not ${lk[1]}, so ${src} does not transform.`); }
          render(); };
        m.foot.append(h('button', { text: 'Keep it hidden', onclick: () => done(false) }), h('button', { class: hit ? 'primary' : '', text: hit ? `Reveal it (transform ${src})` : 'Reveal it', onclick: () => done(true) }));
      } });
    } else opts.push({ label: `Transform ${src}`, fn: () => transformPerm(obj.sourceId) });
  }
  if (delayed && /\bdraw a card\b/i.test(tx)) opts.push({ special: 'delayedDraw', summary: 'draw a card next upkeep' });
  const drawBound = bound.length && /\btarget\b[^.]*\bdraws?\b/i.test(tx);   // v0.94.5 a targeted draw is already offered once, bound to its target: do not add the generic copy
  const ddp = !delayed && !drawBound ? parseDrawDiscard(tx) : null;
  if (ddp) opts.push({ label: ddLabel(ddp), fn: () => runDrawDiscard(ddp, src), full: false });
  else if (!delayed && !drawBound && !/opponent/i.test(tx.replace(/\bfor each opponents? who [^.]+/ig, '')) && (fe = forEachAmount(tx, '(?:you draw|draws?)', obj))) {   /* v0.99.76 "for each opponent who lost life this turn" is a count, not someone else drawing */ const fd = fe;   // v0.95.3 "draw a card for each <thing>" counts at the moment it resolves
    const now = fd.now(), lab = now === null ? `Draw cards (for each ${fd.what}: the app cannot count that, use the card menus)` : `Draw ${fd.per === 1 ? 'a card' : fd.per + ' cards'} for each ${fd.what} (counts when it happens; now ${now})`;
    opts.push({ label: lab, fn: () => { const n = fd.now(); if (n === null) { toast('Count it yourself', `The app cannot count "${fd.what}". Draw the right number of cards by hand.`); return; } snap(); const d = drawCards(n); log(`${src}: drew ${d} (for each ${fd.what} = ${n})`); render(); } });
  }
  else if (!delayed && !drawBound && !/opponent/i.test(tx) && (mm = tx.match(/\b(?:you draw|draws?)\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+|X)\s+cards?(?! for each)/i))) { const n = wnum(mm[1]); opts.push({ label: `Draw ${n} card${pl(n)}`, fn: () => { snap(); if (dredgeOptions().length && teach('dredgePrompts')) { askDredge(+n || 0); return; } const d = drawCards(+n || 0); log(`${src}: drew ${d}`); render(); } }); }
  if ((mm = txs.match(/\byou gain (an?|\d+) life for each ([^.,]+)/i))) { const per = /^\d+$/.test(mm[1]) ? +mm[1] : 1, n = per * (eachQty(mm[2], obj) || 0); opts.push({ label: `Gain ${n} life (${per} for each ${mm[2].trim()})`, fn: () => changeLife(per * (eachQty(mm[2], obj) || 0), true) }); }
  else if ((mm = tx.match(/\byou gain (\d+|X) life/i)) && mm[1] !== 'X') { const v = +mm[1]; opts.push({ label: `Gain ${v} life`, fn: () => changeLife(v, true) }); }
  if ((fe = forEachAmount(tx, 'you lose', obj))) { const fl = fe, now = fl.now(); opts.push({ label: now === null ? `Lose life (for each ${fl.what}: count it yourself)` : `Lose ${fl.per === 1 ? '1 life' : fl.per + ' life'} for each ${fl.what} (counts when it happens; now ${now})`, fn: () => { const n = fl.now(); if (n === null) { toast('Count it yourself', `The app cannot count "${fl.what}". Change your life by hand.`); return; } changeLife(-n); } }); }
  else if ((mm = tx.match(/\byou lose (\d+|X) life(?! for each)/i)) && mm[1] !== 'X') { const v = +mm[1]; opts.push({ label: `Lose ${v} life`, fn: () => changeLife(-v) }); }
  if (!bound.length && (mm = tx.match(/\b(?:each opponent|target opponent|an opponent) loses (\d+) life/i))) { const v = +mm[1]; opts.push({ label: `Opponent loses ${v} life`, fn: () => changeOppLife(-v) }); }
  if (!bound.length && (mm = tx.match(/\bdeals? (\d+) damage to (?:any target|target (?:opponent|player)|each opponent|target creature or player|target player or planeswalker)/i))) { const v = +mm[1]; opts.push({ label: `Deal ${v} damage to the opponent`, fn: () => changeOppLife(-v) }); }
  const ldAll = !!parseLookDistribute(txs.replace(/\n/g, ' '));
  let prevSent = ''; for (const sent of txs.replace(/\([^)]*\)/g, '').replace(/\n/g, ' ').split(/(?<=\.)\s+(?!If you don't\b)/)) {   /* "pay X. If you don't, ..." stays one instruction */ const prev = prevSent; prevSent = sent; if (bound.length && /\btarget\b/i.test(sent)) continue;
    // v0.99.65 "Return target creature card … to the battlefield. It gains haste": "it" is the card just returned, put or created, not the source (the return itself grants that, see applyGraveReturn)
    if (/^(?:it|that creature|they|those creatures)\b/i.test(sent.trim()) && /\b(?:return|put|create|creates)\b[^.]*\b(?:card|cards|token|tokens|creature|creatures)\b[^.]*\b(?:battlefield|tokens?)\b/i.test(prev) && !/\b(?:return|put) (?:~|this \w+)\b/i.test(prev)) continue;
    if (/^(?:it|that creature|that permanent|they|those creatures)\b/i.test(sent.trim()) && /\btarget\b/i.test(prev) && !((obj.targets || []).some(t => t.kind === 'perm'))) continue;   // v0.99.68 "it" is the target, which has not been chosen here
    if (ldAll && /^you may play (?:it|the exiled card|that card|those cards|them) this turn/i.test(sent.trim())) continue;
    if (imp && /^(?:(?:until the end of your next turn|until end of turn|this turn|until your next end step),?\s*)?you may (?:play|cast) /i.test(sent.trim())) continue; opts.push(...durationOptions(sent, obj, (obj.targets || []).filter(t => t.kind === 'perm' && !t.gone).map(t => ({ id: t.id, name: t.name })))); }
  if ((mm = tx.match(/\b(scry|scries|surveils?)\s+(\d+)/i))) { const w = /^scr/i.test(mm[1]) ? 'scry' : 'surveil', v = +mm[2]; const stx0 = obj && obj.name ? `${obj.name}: ${w.toLowerCase()} ${v}.` : ''; opts.push({ label: `${w[0].toUpperCase() + w.slice(1)} ${v}`, fn: () => openScry(v, /surveil/i.test(w), stx0), then: cb => openScry(v, /surveil/i.test(w), stx0, cb) }); }   // v0.99.92 then: the next effect waits for the window
  if ((mm = txs.match(/\bmills? (\d+|X) cards?|\bmill (\d+)\b/i)) && !/opponent/i.test(tx) && !isNaN(+(mm[1] || mm[2]))) { const v = +(mm[1] || mm[2]); opts.push({ label: `Mill ${v}`, fn: () => millCards(v) }); }
  else if ((mm = txs.match(/\bmills? (an?|one|two|three|four|five|six|seven|eight|nine|ten) cards?\b/i)) && !/opponent|target player|each player/i.test(tx)) { const v = numOf(mm[1]); opts.push({ label: `Mill ${v}`, fn: () => millCards(v) }); }   // v0.86: "mill a card"
  // v0.86 amass (rule 701.47): "Then amass Orcs 1."
  if ((mm = txs.match(/\bamass ([A-Z][a-z]+) (\d+|an?|one|two|three|four|five)\b/))) { const ty = mm[1], v = numOf(mm[2]); opts.push({ label: `Amass ${ty} ${v}`, fn: () => doAmass(ty, v, obj.sourceName || '~') }); }
  if ((mm = txs.match(/\bremove (an?|one|two|three|four|five|\d+) ([a-z][a-z-]*) counters? from (?:~|this \w+\b)/i)) && obj.sourceId && mm[2].toLowerCase() !== 'all') { const v = /^\d+$/.test(mm[1]) ? +mm[1] : (TOKEN_NUMW[mm[1].toLowerCase()] || 1), kd = mm[2].toLowerCase(); opts.push({ label: `Remove ${v === 1 ? 'an' : v} ${kd} counter${pl(v)} from ${src}`, fn: () => addCounter(obj.sourceId, -v, kd === 'plus' ? 'plus' : kd) }); }
  if (obj.sourceId && /\byou may exile (?:it|~)\b/i.test(txs)) {
    const combo = /\byou may exile (?:it|~)\b[^.]*\.\s*If you do, create\b/i.test(txs), defs = combo ? tokenDefsFromText(txs, src).filter(d => !d.amassOnly) : [];
    opts.push({ full: combo && defs.length > 0, label: combo && defs.length ? `Exile ${src}, then create ${defs.map(d => d.name).join(', ')}` : `Exile ${src}`, fn: () => { const f = findCard(obj.sourceId); if (f && (f.zone === 'battlefield' || f.zone === 'graveyard')) { log(`${src}: exiled`); moveCard(f.card.id, 'exile'); for (const d of defs) makeTokensFromDef(d, typeof d.count === 'number' ? d.count : 1, src); } else toast('Already gone', `${src} is no longer on the battlefield, so you cannot exile it.`); } });
  }
  if ((mm = txs.match(/put (a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+) \+1\/\+1 counters? on (?:~|this \w+\b|it\b)/i)) && obj.sourceId && !(/^it$/i.test(mm[0].split(' ').pop()) && /\btarget\b/i.test(txs))) { const v = wnum(mm[1]); opts.push({ label: v === 1 ? 'Add a +1/+1 counter' : `Add ${v} +1/+1 counters`, fn: () => addCounter(obj.sourceId, v, 'plus') }); }
  { const sp0 = parseTargetSpecs(tx);
    for (const d of tokenDefsFromText(tx, src)) {
      if (d.amassOnly) continue;
      if (obj.sourceId && /\byou may exile (?:it|~)\b[^.]*\.\s*If you do, create\b/i.test(txs)) continue;   // offered together with the exile option
      const lbl = (n) => `Create ${n === 'X' ? 'X' : n} ${d.pt ? d.pt + ' ' : ''}${d.name} token${n === 1 ? '' : 's'}`;
      const ix = sp0.findIndex(sp => sp.kind === 'player'), tgt = ix >= 0 && /\btarget (?:player|opponent) creates?\b/i.test(tx) ? (obj.targets || []).find(t => t.spec === ix) : null;
      if (tgt && tgt.id === 'opp') { opts.push({ label: `Opponent creates ${d.count} ${d.pt ? d.pt + ' ' : ''}${d.name} token${d.count === 1 ? '' : 's'} (their side is not tracked: log only)`, fn: () => log(`${src}: opponent creates ${d.count} ${d.name} token${d.count === 1 ? '' : 's'}`) }); continue; }
      opts.push({ label: lbl(d.count), fn: async () => { let n = d.count; if (n === 'X') { n = (await appAskNumber(`${src}: X`, `How many ${d.name} tokens (X)?`, 1)) || 0; } if (n > 0) makeTokensFromDef(d, n, src); } });
    } }
  const txNq = tx.replace(/"[^"]*"/g, ' ');
  // v0.99.77 CR 106.6 "Spend this mana only to …" after an Add: the mana floats with that restriction (Lord of the Forsaken, Titans' Nest)
  const spendS = (txNq.match(/(?:^|[.!]\s+)(Spend this mana only (?:to|on) [^.]+\.)/i) || [])[1] || '', spendOnly = spendS ? spendS.replace(/^Spend this mana only (?:to |on )?/i, '').replace(/\.$/, '') : undefined, spendCov = spendS ? [spendS] : undefined, spendLab = spendS ? ` (spend it only to ${spendOnly})` : '';
  if (!/^\{T\}/.test(tx) && (mm = txNq.match(/\badd ((?:\{[WUBRGC]\})+)/i)) && !/for each|any number/i.test(tx)) { const cols = [...mm[1].matchAll(/\{([WUBRGC])\}/g)].map(x => x[1]); opts.push({ label: `Add ${cols.join('')}${spendLab}`, covers: spendCov, fn: () => { snap(); for (const col of cols) addFloatingMana(col, 1, spendOnly); render(); } }); }
  if ((mm = txNq.match(/\badd (two|three|four|five|\d+) mana of any (one )?color\b/i))) { const nn = wordN(mm[1]); opts.push({ label: `Add ${nn} mana of any one color${spendLab}`, covers: spendCov, fn: () => openManaChoice({ name: src }, col => { if (col) { snap(); addFloatingMana(col, nn, spendOnly); render(); } }, ['W', 'U', 'B', 'R', 'G']) }); }
  if ((mm = txNq.match(/\badd (two|three|four|five|\d+) mana in any combination of colors\b/i))) { const nn = wordN(mm[1]); opts.push({ label: `Add ${nn} mana in any combination of colors`, fn: () => { let left = nn; const next = () => { if (left <= 0) return; openManaChoice({ name: src + ` (${left} left)` }, col => { if (col) { snap(); addFloatingMana(col, 1); left--; render(); next(); } }, ['W', 'U', 'B', 'R', 'G']); }; next(); } }); }
  if (/\btakes? an extra turn after this one\b/i.test(tx)) opts.push({ label: 'Take an extra turn after this one', fn: () => { state.extraTurns = (state.extraTurns || 0) + 1; log(`${src}: you will take an extra turn after this one`); toast('Extra turn', 'You take another turn right after this one (rule 500.7). In a goldfish every turn is already yours; the log notes it.'); } });
  if (/\badd one mana of any color\b/i.test(txNq)) opts.push({ label: 'Add one mana of any color' + spendLab, covers: spendCov, fn: () => openManaChoice({ name: src }, col => { if (col) { snap(); addFloatingMana(col, 1, spendOnly); render(); } }, ['W', 'U', 'B', 'R', 'G']) });
  // v0.67.1 Thespian's Stage: "~ becomes a copy of target land, except it has this ability." (rule 707.9: it keeps counters and tapped state; no enter-the-battlefield event)
  if (obj.sourceId && /\bbecomes a copy of target land, except it has this ability\b/i.test(tx)) return [{ full: true, label: `${src} becomes a copy of a land`, fn: () => {
    const f = findCard(obj.sourceId); if (!f || f.zone !== 'battlefield') { toast('Not on the battlefield', `${src} is no longer on the battlefield.`); return; }
    const c = f.card, own = c.origName || c.name;
    const lands = state.battlefield.filter(x => x.id !== c.id && isLandName(x.name));
    if (!lands.length) { toast('No target', 'There is no other land on the battlefield to copy.'); return; }
    const seen = new Set(), cards = lands.filter(x => !seen.has(x.name) && seen.add(x.name));
    openPickCards({ title: `${own}: copy which land?`, note: `${own} becomes a copy of the land you pick, except it keeps this ability. It keeps its counters and stays tapped or untapped. If it leaves the battlefield it is ${own} again.`, cards, max: 1, done: picked => {
      if (!picked.length) return; snap(); const t = picked[0];
      if (!c.origName) c.origName = c.name; c.name = t.name;
      c.gained = [`{2}, {T}: ${own} becomes a copy of target land, except it has this ability.`];
      log(`${own} became a copy of ${t.name}`); checkNoCounterTriggers(); render(); if (state.pendingTriggers.length) flushTriggers(); } }); } }];
  if (obj.sourceId && (mm = tx.match(/\bgains? \"([^\"]+(?:\"[^\"]*\"[^\"]*)?)\"\s*\.?\s*$/i)) && /^[^"]* gains? "/.test(tx.replace(new RegExp((obj.sourceName||'~').replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'),'~'))) { const gl = mm[1]; opts.push({ label: `${src} gains "${gl}"`, fn: () => { const f = findCard(obj.sourceId); if (f && f.zone === 'battlefield') { snap(); f.card.gained = (f.card.gained || []).concat([gl]); log(`${src} gains "${gl}"`); render(); } } }); return [opts[opts.length - 1]]; }
  // v0.65 graveyard-based effects
  if (/\bshuffles? (?:your|their) graveyard into (?:your|their) library\b/i.test(tx)) opts.push({ label: 'Shuffle your graveyard into your library', fn: () => { snap(); state.library.push(...state.graveyard.splice(0)); shuffleLib(); log(`${src}: graveyard shuffled into the library`); render(); } });
  if (obj.sourceId && /\byou may put it onto the battlefield\b/i.test(txs)) opts.push({ label: `Put ${src} onto the battlefield`, fn: () => { const f = findCard(obj.sourceId); if (f && f.zone === 'graveyard') { snap(); state.graveyard.splice(f.idx, 1); enterBattlefield(f.card, { from: 'graveyard', logMsg: `${src}: put onto the battlefield from the graveyard` }); render(); flushTriggers(); } else toast('Not in graveyard', `${src} is no longer in your graveyard.`); } });
  if (obj.sourceId && (mm = txs.match(/you may exile an? ([a-z]+) creature card other than ~ from your graveyard\. If you do, return ~ to the battlefield/i))) { const col = mm[1].toLowerCase(); opts.push({ label: `Exile a ${col} creature card from your graveyard to return ${src}`, fn: () => { const f = findCard(obj.sourceId); if (!f || f.zone !== 'graveyard') { toast('Not in graveyard', `${src} is no longer in your graveyard.`); return; } const cards = state.graveyard.filter(x => x.id !== f.card.id && descMatchesCard(col + ' creature', x.name)); if (!cards.length) { toast('Nothing to exile', `You need another ${col} creature card in your graveyard.`); return; } openPickCards({ title: `${src}: exile a ${col} creature card`, note: `Exile one to return ${src} to the battlefield.`, cards, max: 1, done: picked => { if (!picked.length) return; snap(); const x = picked[0], i = state.graveyard.findIndex(g => g.id === x.id); if (i >= 0) state.exile.push(...state.graveyard.splice(i, 1)); const f2 = findCard(obj.sourceId); if (f2 && f2.zone === 'graveyard') { state.graveyard.splice(f2.idx, 1); enterBattlefield(f2.card, { from: 'graveyard', logMsg: `${src}: exiled ${x.name} and returned to the battlefield` }); } render(); flushTriggers(); } }); } }); }
  // v0.63 generic effects
  { const se = searchEffect(tx, src, obj); if (se && !(/\{T\}, Sacrifice/i.test(tx))) opts.push(se);
    const ge = graveReturnEffect(tx, src); if (ge && !bound.length) opts.push(ge);
    opts.push(...rollOptionsFor(tx, src));   // v0.96.21 "roll a d20"
    if (/flip a coin/i.test(tx)) { const lm = tx.match(/if you lose the flip,[^.]*?deals? (\d+) damage to you/i); opts.push({ label: lm ? `Flip a coin (lose: take ${lm[1]} damage)` : 'Flip a coin', fn: () => { flipCoinUI(win => { log(`${src}: coin flip - you ${win ? 'win' : 'lose'} the flip`); toast('Coin flip', win ? 'You won the flip.' : 'You lost the flip.' + (lm ? ` ${src} deals ${lm[1]} damage to you.` : '')); if (!win && lm) changeLife(-+lm[1], true); }); } }); }
    else if ((mm = txs.match(/\b(?:~|it) deals? (\d+) damage to you\b/i))) { const v = +mm[1], cond = /if ~ is tapped/i.test(txs); opts.push({ label: `${cond ? 'If tapped: ' : ''}take ${v} damage`, fn: () => { if (cond) { const f = obj.sourceId && findCard(obj.sourceId); if (f && !f.card.tapped) { toast('Not tapped', `${src} is untapped, so it deals no damage.`); return; } } changeLife(-preventDamage('you', v, src), true); } }); }
    if (obj.sourceId && /\buntap (?:~|this \w+)\b/i.test(txs)) opts.push({ label: `Untap ${src}`, fn: () => { const f = findCard(obj.sourceId); if (f && f.zone === 'battlefield' && f.card.tapped) untapByEffect(f.card.id); } });
    if (obj.sourceId && /^(?:then )?(?:you may )?sacrifice (?:~|it|this \w+)(?: unless it escaped)?\.?$/i.test(txs.trim().replace(/^.*\.\s+(?=then sacrifice)/i, ''))) opts.push({ label: `Sacrifice ${src}`, fn: () => { const f = findCard(obj.sourceId); if (f && f.zone === 'battlefield') { log(`${src}: sacrificed`); moveCard(f.card.id, 'graveyard'); } } });
    if (obj.sourceId && (mm = txs.match(/return ~ from your graveyard to (your hand|the battlefield)/i))) { const dest = mm[1].toLowerCase(); opts.push({ label: `Return ${src} from the graveyard to ${dest}`, fn: () => { const f = findCard(obj.sourceId); if (f && f.zone === 'graveyard') moveCard(f.card.id, /hand/i.test(dest) ? 'hand' : 'battlefield'); else toast('Not in graveyard', `${src} is no longer in your graveyard.`); } }); }   // v0.94.4 mm was reassigned by later matches, so the click threw (Vengevine/Bloodghast)
    if (obj.sourceId && (mm = txs.match(/put (a|an|one|two|three|\d+) ([a-z]+) counters? on (?:~|this \w+)/i)) && !/\+1\/\+1/.test(mm[0]) && mm[2].toLowerCase() !== 'a') { const v = wnum(mm[1]), kd = mm[2].toLowerCase(); opts.push({ label: `Put ${v === 1 ? 'a' : v} ${kd} counter${v === 1 ? '' : 's'} on ${src}`, fn: () => addCounter(obj.sourceId, v, kd) }); }
  }
  return bound.concat(opts);
}
let resolvingObj = null;   // v0.90.5 the stack object whose effect is being applied, so a hand pick can show it in the centre
function openAbilityEffect(obj, done) {
  const tx = obj.text || ''; if (obj && obj.sourceName) resolvingObj = obj;
  if (obj.special === 'suspendTick') {
    const f = findCard(obj.sourceId);
    if (f && f.zone === 'exile' && f.card.timeCounters > 0) {
      f.card.timeCounters--; const n = f.card.timeCounters;
      log(`${f.card.name}: removed a time counter (${n} left)`);
      if (n === 0) state.pendingTriggers.push({ kind: 'ability', cardId: f.card.id, cardName: f.card.name, special: 'suspendCast', optional: true, text: `Suspend — When the last time counter is removed from ${f.card.name}, you may cast it without paying its mana cost.`, effect: 'Cast it for free.', why: 'That was its last time counter.' });
      else toast(`${f.card.name}`, `${n} time counter${n === 1 ? '' : 's'} left.`);
    }
    render(); if (done) done(); return;
  }
  if (obj.special === 'storm') { makeSpellCopies(obj.spellId, obj.n || 0, obj.sourceName); render(); if (done) done(); return; }
  if (obj.special === 'suspendCast') { suspendCastFree(obj.sourceId, done); return; }
  if (obj.special === 'soulbondSelf' || obj.special === 'soulbondOther') { soulbondResolve(obj, done); return; }
  if (obj.special === 'counterCast') { counterStackObject(obj.spellId, obj.sourceName); render(); if (done) done(); return; }
  if (obj.special === 'openingReveal' && openingRevealEffect(obj, done)) return;
  if (obj.special === 'reboundCast') { suspendCastFree(obj.sourceId, done, 'Rebound'); return; }
  if ((obj.special === 'surveil' || obj.special === 'scry') && obj.n) {
    openScry(obj.n, obj.special === 'surveil', obj.text || '', () => { log(`Resolved: ${obj.name}`); if (done) done(); }); return;
  }
  if (!obj.targets && !obj._tgtAsked) {   // a trigger (or anything put on the stack without targets): choose them now
    const specs = parseTargetSpecs(tx);
    if (specs.length) { obj._tgtAsked = true; chooseTargets(obj.sourceName || 'Effect', specs, picked => { obj.targets = picked; if (picked[0] && picked[0].kind === 'player') obj.target = picked[0].id; openAbilityEffect(obj, done); }, { srcId: obj.sourceId, onCancel: () => openAbilityEffect(obj, done) }); return; }
  }
  // v0.99.68 CR 115.6 + 608.2b: "up to one target" with no target chosen. The parts that need the target do nothing; any other part still happens.
  const untracked = Array.isArray(obj.targets) && obj.targets.length > 0 && obj.targets.every(t => t.kind === 'opp');   // v0.99.69 only the opponent's (untracked) permanents were chosen
  if (Array.isArray(obj.targets) && (!obj.targets.length || untracked) && !obj.special) {
    const specs0 = parseTargetSpecs(tx);
    if (specs0.length && (untracked || specs0.every(sp => sp.min === 0))) {
      const what = untracked ? obj.targets.map(t => t.name.replace(/ \(not tracked here\)$/, '')).join(', ') : '';
      const sents = tx.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim().split(/(?<=\.)\s+/), keep = []; let lastT = false;
      for (const se of sents) { const t = /\btarget\b/i.test(se) || (lastT && /^(?:it|that \w+|they|those \w+|its)\b/i.test(se)); lastT = t; if (!t) keep.push(se); }
      if (!keep.length) { const said = sents.join(' ').replace(/^(?:it|this \w+)\b/i, obj.sourceName || 'It').replace(/\btarget ([^.,;]+?) (?:an opponent controls|you don't control|your opponent controls)\b/gi, "the $1 you chose on your opponent's side").replace(/\btarget ([a-z ]+?)(?=[.,;]| and\b)/gi, 'the $1 you chose'); const msg = untracked ? `${said} Your opponent's permanents are not on this table, so apply it to the real card (mark the damage or remove it there).` : 'No target was chosen, so it does nothing.'; log(`${obj.sourceName || obj.name}: ${untracked ? msg : 'no target was chosen, so it does nothing'}`); log(`Resolved: ${obj.name}`);
        // v0.99.82 no window for it any more: the stack panel's "What the app did" and the log already say what to do on the real table
        toast(`${obj.sourceName || 'Ability'} resolves`, msg); render(); if (done) done(); return; }
      if (keep.length < sents.length) { if (untracked) log(`${obj.sourceName || obj.name}: the part about ${what} is applied on the real table (the opponent's permanents are not tracked)`); const o2 = Object.assign({}, obj, { text: keep.join(' '), targets: undefined, _tgtAsked: true }); openAbilityEffect(o2, done); return; }
    }
  }
  if (!obj.special && obj.sourceName) {   // always yield: apply the effect you picked the first time
    const e = ayGet(obj.sourceName, tx, obj.sourceId);
    if (e && e.auto && e.label && !uncoveredClauses(tx).length) { let os = []; try { os = visibleOptions(effectOptions(tx, obj)); } catch (er) { os = []; } const o = os.find(x => lblStable(x.label) === lblStable(e.label) && typeof x.fn === 'function');
      if (o) { log(`${obj.sourceName}: always yield \u2014 ${o.label}`); toast(`${obj.sourceName} resolves`, o.label); o.fn(); log(`Resolved: ${obj.name}`); render(); if (done) done(); return; } }
  }
  // v0.86: when exactly one effect applies and nothing is left to decide, apply it straight away and only ask when there is a real choice.
  if (teach('autoResolve') && !obj.special) {
    let pre = []; try { pre = visibleOptions(effectOptions(tx, obj)); } catch (e) { pre = []; }
    const one = pre.length === 1 && !pre[0].special && typeof pre[0].fn === 'function' ? pre[0] : null;
    // v0.99.86 an understood effect resolves by itself even if a clause beside it is not read: that clause is named in the log and a note,
    // never held in a window with a checklist (Territorial Kavu's "Discard a card. If you do, draw a card." was stopped by its own first clause)
    let gaps0 = []; try { gaps0 = uncoveredClauses(tx); } catch (e) { gaps0 = []; }
    const gapNote = () => { const g = gaps0.filter(x => !gapCovered(x, pre)); if (!g.length) return; log(`${obj.sourceName || 'Ability'}: do by hand (the app does not apply this): ${g.join(' ')}`); toast('Do by hand', g.join(' ')); };
    let clean = !!one;
    if (one && /\byou may\b|\bchoose\b|\bup to\b|\bX\b/i.test(tx.replace(/\([^)]*\)/g, ' ')) && !one.def) clean = false;
    if (one && /\bpay\b/i.test(one.label || '')) clean = false;   // paying is your decision
    // v0.99.81 an effect that opens its own window (surveil, scry, look at, search ...) is no longer held in the Resolving panel: the window it opens is where you decide, so it opens at once
    // v0.99.68 several effects that must all happen ("You gain 3 life and draw a card"): every sentence understood, nothing optional or chosen,
    // no effect repeating part of another, none opening its own window: apply them all, in order (CR 608.2c), instead of offering them as buttons
    if (!one && pre.length > 1 && pre.length <= 4) {
      const plain = tx.replace(/\([^)]*\)/g, ' ').replace(/\btarget [^.,;]*/gi, 'target'), labs = pre.map(o => String(o.label || '').toLowerCase());   // v0.99.79 "target player or planeswalker" is the target, chosen already: its "or" is not a choice left (Skullcrack)
      const ok = !/\byou may\b|\bchoose\b|\bup to\b|\bX\b|\bany number\b|\bunless\b|\bif you do\b|\bor\b/i.test(plain)
        && pre.every(o => typeof o.fn === 'function' && !o.special && !o.def && o.label && (typeof o.then === 'function' || !/^remember\b|\b(?:look at|sort|surveil|scry|choose|search|amass|pick|transform|cascade|pay|target)\b/i.test(o.label)))
        && labs.every((a, i) => labs.every((b2, j) => i === j || !b2.includes(a)));
      if (ok) { const all = pre.map(o => o.label).join('; '); log(`${obj.sourceName || 'Ability'}: applied automatically \u2014 ${all}`); toast(`${obj.sourceName || 'Ability'} resolves`, all);
        // v0.99.92 in order (CR 608.2c); a scry or surveil opens its window and the effects after it wait for it (Kozilek's Command: tokens, scry 5, then draw)
        let k = 0; const step = () => { while (k < pre.length) { const o = pre[k++]; if (typeof o.then === 'function') { o.then(() => { render(); step(); }); return; } o.fn(); } gapNote(); log(`Resolved: ${obj.name}`); render(); if (done) done(); };
        step(); return; }
    }
    if (clean) {
      const lbl = one.label || 'its effect'; { const e = obj.sourceName ? ayGet(obj.sourceName, tx, obj.sourceId) : null; if (e && e.auto && !e.label && one.label) e.label = one.label; }
      log(`${obj.sourceName || 'Ability'}: applied automatically \u2014 ${lbl}`); toast(`${obj.sourceName || 'Ability'} resolves`, lbl);
      one.fn(); gapNote(); log(`Resolved: ${obj.name}`); render(); if (done) done(); return;
    }
    // v0.99.86 nothing the app can apply: say what to do by hand and finish, instead of a window that only says so
    if (!pre.length) { const t0 = String(tx || '').trim(); log(`${obj.sourceName || 'Ability'}: do by hand (the app does not apply this): ${t0 || 'no text'}`); if (t0) toast(`${obj.sourceName || 'Ability'}: do by hand`, t0); log(`Resolved: ${obj.name}`); render(); if (done) done(); return; }
  }
  // v0.99.92 no Resolving window any more: when a spell or ability leaves the stack, what it does just happens. Only a real decision
  // (a "you may", a choice between effects, an amount to pay) is asked, as one short question; anything the app cannot apply is a "do by hand" note.
  resolveNoPanel(obj, tx, done);
}
function resolveNoPanel(obj, tx, done) {
  let opts = []; try { opts = visibleOptions(effectOptions(tx, obj)); } catch (e) { opts = []; }
  if (opts.some(x => x.special === 'delayedDraw')) opts = opts.filter(x => !(x.label && /^Create delayed trigger: Draw a card/i.test(x.label)));
  for (const o of opts) if (o.special === 'delayedDraw' && !obj._delayedSet) { obj._delayedSet = true; addFx({ kind: 'delayed', when: 'upkeep', draw: 1, text: 'Draw a card.', srcName: obj.sourceName, srcId: obj.sourceId || null }); log(`${obj.sourceName}: you will draw a card at the beginning of the next turn's upkeep`); }
  opts = opts.filter(o => o.special !== 'delayedDraw');
  const who = obj.sourceName || 'Ability';
  let gaps = []; try { gaps = opts.some(o => o.full) ? [] : uncoveredClauses(tx); } catch (e) { gaps = []; } gaps = gaps.filter(x => !gapCovered(x, opts));
  let finished = false; const finish = () => { if (finished) return; finished = true; if (gaps.length) { log(`${who}: do by hand (the app does not apply this): ${gaps.join(' ')}`); toast('Do by hand', gaps.join(' ')); }
    if (!opts.length && !gaps.length && String(tx || '').trim()) { log(`${who}: do by hand (the app does not apply this): ${tx}`); toast(`${who}: do by hand`, tx); }
    log(`Resolved: ${obj.name}`); render(); if (done) done(); };
  if (opts.some(o => o.special === 'cascade')) { openCascade(obj, done); return; }
  // each effect once: drop an option that is part of a longer one ("Scry 3" beside "Scry 3, then draw a card")
  const low = x => String(x || '').toLowerCase().replace(/^mode \d+: /, '');
  opts = opts.filter((o, i) => o.special || !opts.some((p, j) => j !== i && !p.special && low(p.label) !== low(o.label) && low(p.label).includes(low(o.label))));
  const run = async list => { for (const o of list) {
      if (o.special === 'lookTop') { if (obj.target === 'opp') { toast(`${who}`, 'A goldfish opponent has no library: look at the real one.'); log(`${who}: look at the top card of your opponent's library at the real table`); continue; } await peekTopCard(who); continue; }
      if (o.special === 'payLifeDraw') { const n = await appAskNumber('Pay how much life?', `${who}: you draw that many cards.`, 0); const k = Math.max(0, Math.min(+n || 0, state.life)); if (k) { snap(); state.life -= k; const d = drawCards(k); log(`${who}: paid ${k} life, drew ${d}`); } continue; }
      if (typeof o.fn !== 'function') continue;
      if (typeof o.then === 'function') { await new Promise(r => { try { o.then(() => { render(); r(); }); } catch (e) { r(); } }); continue; }
      try { o.fn(); } catch (e) { console.error(e); } render(); } };
  const plain = String(tx || '').replace(/\([^)]*\)/g, ' ').replace(/\btarget [^.,;]*/gi, 'target');
  const choice = opts.length > 1 && (/\bchoose (?:one|two|up to)\b/i.test(plain) || opts.some(o => o.final) || opts.some(o => /^Decline\b/i.test(o.label || '')));   // v0.99.94 a plain "or" ("mana value 2 or less") is no choice
  (async () => {
    if (!opts.length) { finish(); return; }
    if (choice) { const i = await appChoose(who, tx, opts.map(o => o.label)); if (i !== null && opts[i] && !/^Decline\b/i.test(opts[i].label || '')) { log(`${who}: ${opts[i].label}`); await run([opts[i]]); } else log(`${who}: declined`); finish(); return; }
    const mayPlain = plain.replace(/(?:^|\.\s+)(?:until (?:the )?end of (?:your next )?turn, )?you may (?:cast|play|look at)\b[^.]*\./gi, '. ').replace(/\byou may (?:cast|play) (?:it|that card|them|those cards)\b[^.]*\b(?:this turn|until\b[^.]*)\./gi, '');   // a permission to cast later is no question now
    if (/\byou may\b/i.test(mayPlain) && !opts.some(o => o.def)) { const all = opts.map(o => o.label).join('; ');
      if (!(await appAsk(who, `${tx}`, all.length < 60 ? all : 'Do it'))) { log(`${who}: you chose not to`); gaps = []; finish(); return; } }
    { const labs = opts.map(o => o.label || o.summary).filter(Boolean).join('; '); if (labs) { log(`${who}: applied automatically \u2014 ${labs}`); toast(`${who} resolves`, labs); } }
    await run(opts); finish(); })();
}
function openCascade(obj, done) {
  const src = cardInfo(obj.sourceName), mv = src ? src.cmc : 0;
  snap();
  const seen = []; let hit = null;
  while (state.library.length) {
    const c = state.library.shift(); seen.push(c);
    const i = cardInfo(c.name);
    if (i && !i.land && i.cmc < mv) { hit = c; break; }
  }
  const m = modal(`Cascade ${mv}`, { width: 560, sticky: true, noClose: true });
  const bottom = list => { const l = shuffle([...list]); state.library.push(...l); };
  m.body.append(
    h('div', { class: 'psub', text: hit ? `Exiled ${seen.length} card${seen.length === 1 ? '' : 's'}. The first nonland card with mana value less than ${mv} is ${hit.name}.` : `No nonland card with mana value below ${mv} was found. All ${seen.length} exiled cards go to the bottom.` }),
    h('div', { class: 'prelist' }, seen.map(c => h('div', { class: 'row' }, h('span', { class: 'nm', text: c.name }), c === hit ? h('span', { class: 'ok', text: 'hit' }) : h('span', { class: 'muted small', text: 'bottom' })))));
  const finish = cast => {
    m.close();
    const rest = seen.filter(c => c !== hit || !cast);
    bottom(rest);
    if (cast && hit) { noteCast(hit); state.stack.push(hit); state.priority = { active: true, passed: false }; log(`Cascade: cast ${hit.name} without paying its mana cost`); fireTrigger('cast', { card: hit }); }
    else log(`Cascade: nothing cast; ${seen.length} cards on the bottom`);
    render();
    if (done) done();
    if (cast && hit) { if (state.pendingTriggers.length) resolvePendingTrigger(); else openStack(); }
  };
  if (hit) m.foot.append(h('button', { text: 'Do not cast', onclick: () => finish(false) }), h('button', { class: 'primary', text: `Cast ${hit.name} free`, onclick: () => finish(true) }));
  else { toast(`Cascade: nothing found`, `${seen.length} card${seen.length === 1 ? '' : 's'} went to the bottom of your library.`); finish(false); }   // v0.99.82 nothing to decide: no window to dismiss
}


// v0.99.86 is a clause the reader flagged already carried out by one of the options? ("Discard a card." by "Discard 1 card, then draw 1 card")
function gapCovered(clause, opts) {
  const N = { a: '1', an: '1', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7' };
  const norm = t => String(t || '').toLowerCase().replace(/[~.,;:()]/g, ' ').replace(/\b(a|an|one|two|three|four|five|six|seven)\b/g, w => N[w]).replace(/\bcards\b/g, 'card').replace(/\s+/g, ' ').trim();
  const c = norm(clause).replace(/^(?:then|you) /, '').split(' ').slice(0, 3).join(' ');
  return !!c && (opts || []).some(o => o && o.label && norm(o.label).includes(c));
}

// v0.99.94 "Look at the top card of your library" (Mishra's Bauble, Sensei's Divining Top's peers): the card is shown, picture and all,
// in one small window; it stays on top. A toast was too easy to miss.
function peekTopCard(src) {
  return new Promise(res => { const top = state.library[0]; if (!top) { toast('Library empty', 'There is no card to look at.'); res(); return; }
    log(`${src}: looked at the top card of your library: ${top.name}`);
    const ti = cardInfo(top.name), ty = ((ti && ti.t) || '').split(' // ')[0];
    const m = modal(`${src}: the top card of your library`, { width: 420 }); let pic = null; try { pic = spotCardEl(top); pic.classList.add('peek-card'); } catch (e) { pic = h('div', { class: 'peek-card', text: top.name }); }
    m.body.append(h('div', { class: 'peek-wrap' }, pic, h('div', { class: 'peek-txt' }, h('b', { text: top.name }), h('div', { class: 'muted small', text: ty || 'card' }), h('div', { class: 'small', style: 'margin-top:8px', text: 'Only you see it. It stays on top of your library.' }))));
    let d = false; const end = () => { if (d) return; d = true; m.close(); res(); };
    m.foot.append(h('button', { class: 'primary', text: 'OK', onclick: end }));
    const obs = new MutationObserver(() => { if (!document.body.contains(m.el || m.body)) { obs.disconnect(); end(); } }); try { obs.observe(document.body, { childList: true, subtree: true }); } catch (e) { /* no observer */ } });
}
