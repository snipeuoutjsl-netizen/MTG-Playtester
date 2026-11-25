// ---------------------------------------------------------------- targeting
// Targets are read from the rules text of a spell or ability ("target creature you control", "any target",
// "up to two target creatures", "target spell", "target creature card in your graveyard"...), chosen when the
// spell is cast / the ability is activated, and checked again when it resolves (rules 601.2c, 608.2b).
const TYPE_WORDS = ['creature', 'artifact', 'enchantment', 'land', 'planeswalker', 'battle', 'permanent'];
function parseTargetSpecs(text) {
  const t = String(text || '').replace(/\([^)]*\)/g, ' ').replace(/\n/g, ' ').replace(/\u2019/g, "'");
  const specs = [], re = /\btarget\b/gi; let m;
  const STOP = /\s+(?:to|from|in|gets?|deals?|deal|loses?|lose|draws?|discards?|gains?|gain|can't|cannot|can|doesn't|untaps?|taps?|becomes?|if|unless|until|then|attacks?|blocks?|fights?|exiles?|destroys?|puts?|returns?|sacrifices?|mills?|reveals?|each|has|have|is|are|was|were|chooses?|shuffles?|creates?|with)\b|\s+and(?=\s+target)|\s+or(?=\s+target)|[.,;:]|$/i;
  while ((m = re.exec(t))) {
    const before = t.slice(0, m.index);
    const isAny = /\bany\s*$/i.test(before);
    if (!isAny && /\b(?:the|that|a|an|each|of)\s*$/i.test(before)) continue;      // "the target of", "becomes the target" - not a choice
    const rest = t.slice(m.index + m[0].length), sm = rest.match(STOP);
    const phrase = rest.slice(0, sm.index).trim(), after = rest.slice(sm.index);
    const sp = { min: 1, max: 1, types: [], mods: [], ctrl: 'any', pctrl: 'any', player: false, qual: '', label: '' };
    { const q = t.replace(/["“][^"”]*["”]/g, x => x.replace(/\./g, ' ')), a = q.lastIndexOf('. ', m.index), b = q.indexOf('.', m.index); sp.clause = t.slice(a < 0 ? 0 : a + 2, b < 0 ? t.length : b + 1).trim(); }   // v0.94.5 the sentence this target belongs to, so the window can say which mode it is for
    let cm;
    if (/\bany number of\s*$/i.test(before)) { sp.min = 0; sp.max = 99; }
    else if ((cm = before.match(/\bup to (one|two|three|four|five|x|\d+)\s*$/i))) { sp.min = 0; sp.max = wnum(cm[1]) === 'X' ? 1 : wnum(cm[1]); }
    else if ((cm = before.match(/\b(one|two|three|four|five|\d+)\s+(?:other\s+)?$/i)) && !/choose\s+\w+\s*$/i.test(before)) { sp.min = sp.max = wnum(cm[1]); }
    { const cq = (' ' + phrase + ' ' + after).match(/\s+that(?:'s| is| are) (one or more colors|colorless|multicolored|white|blue|black|red|green)\b/i) || after.match(/^\s+that(?:'s| is| are) (one or more colors|colorless|multicolored|white|blue|black|red|green)\b/i); if (cq) sp.colorWord = cq[1].toLowerCase(); }   // "target permanent that's one or more colors"
    const wq = after.match(/^\s+with ([^.,;:]+)/i); if (wq) sp.qual = 'with ' + wq[1];
    const p = phrase.toLowerCase();
    if (isAny && !p) { sp.kind = 'any'; sp.types = ['creature', 'planeswalker', 'battle']; sp.player = true; sp.label = 'any target'; }
    else if (/\bcards?\b/.test(p) && (/^\s+(?:in|from) (?:your|a|any|an opponent's|target player's|their) graveyard/i.test(after) || /graveyard/.test(p))) {
      sp.kind = 'gy'; sp.words = p.split(/\bcards?\b/)[0].trim().split(/\s+/).filter(Boolean);
      sp.ctrl = /opponent's/.test(after + p) ? 'opp' : /\ba graveyard|any graveyard/i.test(after + p) ? 'any' : 'you';
      sp.label = `target ${p}${/graveyard/.test(p) ? '' : ' in ' + (sp.ctrl === 'you' ? 'your' : 'a') + ' graveyard'}`;
    }
    else if (/\bspells?\b/.test(p)) {
      sp.kind = 'spell'; sp.types = (p.match(/\b(?:instant|sorcery|creature|artifact|enchantment|planeswalker|land)\b/g) || []); sp.mods = (p.match(/\bnon\w+/g) || []); sp.label = 'target ' + p;
      // v0.94.5 "target spell or nonland permanent an opponent controls" (Sink into Stupor): the target may be a spell on the stack OR a permanent
      { const pa = t.slice(m.index, m.index + 140).split(/[.;]/)[0], mvm = pa.match(/\bmana value (?:of )?(\d+|x)(?: or (less|greater|more))?/i); if (mvm && /^\d+$/.test(mvm[1])) sp.mvf = { n: +mvm[1], op: mvm[2] ? (mvm[2].toLowerCase() === 'less' ? 'le' : 'ge') : 'eq' };   // "Counter target spell with mana value 1" (Spell Snare)
        const cw = p.match(/\b(white|blue|black|red|green|colorless|multicolored)\b/); if (cw) sp.colorWord = cw[1]; }
      if (/\bspells?\b.*\bor\b.*\bpermanents?\b/.test(p)) { sp.alsoPerm = true; sp.types = []; }
      if (/\b(?:an opponent controls|you don't control|your opponents? controls?|opponents? control)\b/.test(p)) sp.ctrl = 'opp'; else if (/\byou control\b/.test(p)) sp.ctrl = 'you';
    }
    else if (/\b(?:abilit(?:y|ies))\b/.test(p)) { sp.kind = 'ability'; sp.label = 'target ' + p; }
    else {
      const ty = TYPE_WORDS.filter(w => new RegExp('\\b' + w + 's?\\b').test(p));
      const pl = /\b(?:player|opponent)s?\b/.test(p.replace(/\b(?:an opponent controls|you don't control|your opponents? controls?|opponents? control|an opponent's|your opponents?'s?)\b/g, ' '));   // v0.96.19 "permanent an opponent controls" names a permanent, not a player
      if (pl && !ty.length) { sp.kind = 'player'; sp.player = true; sp.pctrl = /\bopponent\b/.test(p) ? 'opp' : 'any'; }
      else { sp.kind = 'perm'; sp.types = ty; sp.player = pl; }
      sp.mods = (p.match(/\b(?:non)?legendary|nonland|noncreature|nonartifact|nonbasic|basic|nontoken|token|tapped|untapped|attacking|blocking|other\b/g) || []);
      if (/\byou control\b/.test(p)) sp.ctrl = 'you'; else if (/\b(?:an opponent controls|you don't control|your opponents? controls?|opponents? control)\b/.test(p)) sp.ctrl = 'opp';
      sp.label = 'target ' + p;
    }
    if (sp.qual) sp.label += ' ' + sp.qual;
    sp.label = sp.label.replace(/\s+/g, ' ').trim();
    specs.push(sp);
  }
  return specs;
}
function permTypeLine(c) { return c.token ? (c.tk && c.tk.type ? c.tk.type : c.tk && c.tk.pt ? 'Token Creature' : 'Token Artifact') : (frontType(c) || (isLandName(c.name) ? 'Land' : '')); }
// CR 105.2: an object's colors come from its mana cost (colorless when it has none); tokens use their listed colors.
function cardColorSet(c) {
  { const ov = ovrOf(c); if (ov && ov.colors) return new Set(ov.colors); }
  if (c.token) return new Set(((c.tk && (c.tk.colors || c.tk.color)) || '').toString().toUpperCase().replace(/[^WUBRG]/g, '').split(''));
  const inf = cardInfo(c.name); return new Set(((String((inf && (inf.mc || '')) || '').split(' // ')[0].match(/\{[^}]*\}/g) || []).join('')).replace(/[^WUBRG]/g, '').split('').filter(Boolean));
}
const CARD_COLOR_LETTER = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
function colorWordOk(word, colors) {   // "colorless", "one or more colors", "multicolored", or one color word
  const w = String(word).toLowerCase();
  if (w === 'colorless') return colors.size === 0;
  if (/^(?:one or more colors|colored)$/.test(w)) return colors.size > 0;
  if (w === 'multicolored') return colors.size > 1;
  return CARD_COLOR_LETTER[w] ? colors.has(CARD_COLOR_LETTER[w]) : true;
}
function permMatchesSpec(c, sp, ctx) {
  const tl = permTypeLine(c);
  if (sp.colorWord && !colorWordOk(sp.colorWord, cardColorSet(c))) return false;
  if (sp.types.length && !sp.types.includes('permanent') && !sp.types.some(w => new RegExp('\\b' + w + '\\b', 'i').test(tl))) return false;
  for (const md of sp.mods) {
    if (md === 'legendary' && !/Legendary/i.test(tl)) return false;
    if (md === 'nonlegendary' && /Legendary/i.test(tl)) return false;
    if (md === 'nonland' && /\bLand\b/.test(tl)) return false;
    if (md === 'noncreature' && /\bCreature\b/.test(tl)) return false;
    if (md === 'nonartifact' && /\bArtifact\b/.test(tl)) return false;
    if (md === 'basic' && !/\bBasic\b/.test(tl)) return false;
    if (md === 'nonbasic' && /\bBasic\b/.test(tl)) return false;
    if (md === 'token' && !c.token) return false;
    if (md === 'nontoken' && c.token) return false;
    if (md === 'tapped' && !c.tapped) return false;
    if (md === 'untapped' && c.tapped) return false;
    if (md === 'attacking' && !(state.combat && (state.combat.attackers || []).includes(c.id))) return false;
    if (md === 'other' && ctx && ctx.srcId === c.id) return false;
  }
  if (hasKw(c, 'shroud')) return false;
  if (ctx && (ctx.srcCard || ctx.srcId != null) && ctx.srcId !== c.id) { const sc = ctx.srcCard || (findCard(ctx.srcId) || {}).card; if (sc && sc.id !== c.id && protBlocks(protQuals(c), sc)) return false; }   // CR 702.16b protection: it can't be targeted by sources with the quality
  return true;
}
function legalTargets(sp, ctx) {
  ctx = ctx || {}; const out = [];
  const typeLabel = sp.types.length && !sp.types.includes('permanent') ? sp.types.join(' or ') : 'permanent';
  if (sp.kind === 'player' || sp.player) {
    if (sp.pctrl !== 'opp') out.push({ kind: 'player', id: 'you', name: 'You' });
    out.push({ kind: 'player', id: 'opp', name: 'Opponent' });
  }
  if (sp.kind === 'perm' || sp.kind === 'any') {
    if (sp.types.length || sp.kind === 'any') {
      if (sp.ctrl !== 'opp') for (const c of state.battlefield) if (permMatchesSpec(c, sp, ctx)) out.push({ kind: 'perm', id: c.id, name: c.name, card: c });
      if (sp.ctrl !== 'you') out.push({ kind: 'opp', id: 'opp-perm', name: `A ${typeLabel} your opponent controls (not tracked here)` });
    } else if (sp.kind === 'perm') {
      if (sp.ctrl !== 'opp') for (const c of state.battlefield) if (permMatchesSpec(c, sp, ctx)) out.push({ kind: 'perm', id: c.id, name: c.name, card: c });
      if (sp.ctrl !== 'you') out.push({ kind: 'opp', id: 'opp-perm', name: 'A permanent your opponent controls (not tracked here)' });
    }
  }
  if (sp.kind === 'gy') {
    if (sp.ctrl !== 'opp') for (const c of state.graveyard) if (matchesGraveSpec(c, { words: sp.words || [] })) out.push({ kind: 'gy', id: c.id, name: c.name, card: c });
    if (sp.ctrl !== 'you') out.push({ kind: 'opp', id: 'opp-gy', name: `A ${(sp.words || []).join(' ') || ''} card in an opponent's graveyard (not tracked here)`.replace('  ', ' ') });
  }
  if (sp.kind === 'spell' || sp.kind === 'ability') {
    for (const x of state.stack) {
      if (sp.kind === 'ability' ? !x.ability : x.ability) continue;
      if (sp.kind === 'spell') {
        const tl = x.opp ? (x.oppType || '') : (frontType(x) || '');
        if (sp.types.length && tl && !sp.types.some(w => new RegExp('\\b' + w + '\\b', 'i').test(tl))) continue;
        if (tl && sp.mods.some(m => m.length > 3 && new RegExp('\\b' + m.slice(3) + '\\b', 'i').test(tl))) continue;   // nonland / nonartifact / noncreature ... spells
        if (sp.mvf && cardInfo(x.name)) { const mv = spellMV(x); if (!(sp.mvf.op === 'le' ? mv <= sp.mvf.n : sp.mvf.op === 'ge' ? mv >= sp.mvf.n : mv === sp.mvf.n)) continue; }
        if (sp.colorWord && cardInfo(x.name) && !colorWordOk(sp.colorWord, cardColorSet(x))) continue;
      }
      if (sp.kind === 'spell' && sp.ctrl === 'opp' && !x.opp) continue;
      if (sp.kind === 'spell' && sp.ctrl === 'you' && x.opp) continue;
      out.push({ kind: sp.kind, id: x.id, name: x.opp ? `Opponent's ${x.name}` : x.name, card: x.opp ? null : x });
    }
    if (sp.alsoPerm) {
      if (sp.ctrl !== 'opp') for (const c of state.battlefield) if (permMatchesSpec(c, sp, ctx)) out.push({ kind: 'perm', id: c.id, name: c.name, card: c });
      if (sp.ctrl !== 'you') out.push({ kind: 'opp', id: 'opp-perm', name: `A ${sp.mods.includes('nonland') ? 'nonland ' : ''}permanent your opponent controls (not tracked here)` });
    }
  }
  return out;
}
function targetStillLegal(t) {
  if (!state) return false;
  if (t.kind === 'perm') { const f = findCard(t.id); return !!f && f.zone === 'battlefield'; }
  if (t.kind === 'gy') { const f = findCard(t.id); return !!f && f.zone === 'graveyard'; }
  if (t.kind === 'spell' || t.kind === 'ability') return state.stack.some(x => x.id === t.id);
  return true;   // players and untracked opposing things stay legal
}
function targetsText(o) { return (o.targets && o.targets.length) ? o.targets.map(t => t.name).join(', ') : (o.target && o.target.name) || ''; }
function chooseTargets(title, specs, done, o) {
  o = o || {};
  const lists = specs.map(sp => legalTargets(sp, o));
  const bad = specs.findIndex((sp, i) => sp.min > 0 && !lists[i].length);
  if (bad >= 0) { toast('No legal target', `${title} needs a ${specs[bad].label}, and there is nothing it can legally target. A spell or ability cannot be put on the stack without a legal target.`); if (o.onCancel) o.onCancel(); return; }
  if (o.auto && specs.every((sp, i) => sp.min === sp.max && lists[i].length === sp.min && lists[i].every(t => t.kind !== 'opp' && t.kind !== 'opp-perm'))) {   // CR 603.3d: with exactly one way to choose, the choice is made for you
    log(`${title}: only one legal target (${lists.flat().map(t => t.name).join(', ')}), chosen automatically`); done(lists.flatMap((l, i) => l.map(t => ({ kind: t.kind, id: t.id, name: t.name, spec: i })))); return;
  }
  const picks = specs.map(() => []);
  const m = modal(`${title}: choose ${specs.length > 1 ? 'targets' : 'a target'}`, { width: 600, sticky: true, onCancel: () => { if (o.onCancel) o.onCancel(); } });
  const confirm = h('button', { class: 'primary', text: 'Confirm targets' });
  const draw = () => {
    m.body.replaceChildren(h('div', { class: 'psub', text: 'Targets are chosen as the spell is cast or the ability is activated, before you pay. They are checked again when it resolves: if every target is gone, it does nothing.' }));
    specs.forEach((sp, i) => {
      const need = sp.min === 0 ? `up to ${sp.max === 99 ? 'any number' : sp.max}` : sp.max > 1 ? `choose ${sp.max}` : 'choose one';
      m.body.append(h('div', { class: 'tg-head' }, h('b', { text: sp.label[0].toUpperCase() + sp.label.slice(1) }), h('span', { class: 'muted small', text: ` — ${need}` })));
      if (sp.clause) m.body.append(h('div', { class: 'tg-for muted small', text: `For: ${sp.clause}` }));
      if (!lists[i].length) m.body.append(h('div', { class: 'muted small', text: 'Nothing legal to target (that is fine: this target is optional).' }));
      for (const t of lists[i]) {
        const on = picks[i].some(x => x.id === t.id), info = t.card && !t.card.ability && !t.card.opp ? cardInfo(t.card.name) : null;
        const row = h('div', { class: 'row tg-row' + (on ? ' on' : '') }, h('span', { class: 'nm' }, t.name, ' ', info && info.mc ? symbols(info.mc) : ''),
          h('button', { class: on ? 'primary' : '', text: on ? 'Chosen ✓' : 'Choose', onclick: () => {
            if (on) picks[i] = picks[i].filter(x => x.id !== t.id);
            else if (picks[i].length < sp.max) picks[i].push(t);
            else if (sp.max === 1) picks[i] = [t];
            else return;
            draw(); } }));
        if (t.card && !t.card.ability && !t.card.opp) row.addEventListener('mouseenter', () => showPreview(t.card));
        m.body.append(row);
      }
    });
    confirm.disabled = specs.some((sp, i) => picks[i].length < sp.min);
  };
  confirm.addEventListener('click', () => { m.close(); done(picks.flatMap((arr, i) => arr.map(t => ({ kind: t.kind, id: t.id, name: t.name, spec: i })))); });
  m.foot.append(h('button', { text: 'Cancel', onclick: () => { m.close(); if (o.onCancel) o.onCancel(); } }), confirm);
  draw();
}
// Damage marked on a creature this turn; lethal damage is a state-based action.
function dealDamageTo(c, n, src) {
  if (!state) return; snap();
  n = preventDamage(c.id, n, src); if (!(n > 0)) { render(); return; }   // v0.99.80 CR 615 prevention shields
  if (isPlaneswalker(c)) { c.loyalty = Math.max(0, (c.loyalty || 0) - n); log(`${src}: ${n} damage to ${c.name} (loyalty ${c.loyalty})`); checkLoyalty(c); }
  else { c.dmg = (c.dmg || 0) + n; if (!c.dmgBy || c.dmgBy.turn !== state.turn) c.dmgBy = { turn: state.turn, srcs: [] }; c.dmgBy.srcs.push(src); log(`${src}: ${n} damage to ${c.name} (${c.dmg} marked this turn)`); }
  runToughnessSBA(); render(); flushTriggers();
}
// v0.99.62 CR 701.19 regenerate: "the next time this permanent would be destroyed this turn, instead tap it, remove all damage from it,
// and remove it from combat". A shield is a counter on the permanent that lasts until the end of the turn it was made in.
function regenShields(c) { return c && c.regenTurn === (state && state.turn) ? (c.regen || 0) : 0; }
function addRegenShield(c, src) { if (!c || !state) return; c.regen = regenShields(c) + 1; c.regenTurn = state.turn; log(`${src}: ${c.name} gets a regeneration shield (${c.regen} this turn)`); }
function tryRegenerate(c, why) {
  if (!c || !state || !regenShields(c)) return false;
  c.regen--; c.tapped = true; c.dmg = 0;
  if (state.combat) for (const k of ['attackers', 'blockers']) if (Array.isArray(state.combat[k])) state.combat[k] = state.combat[k].filter(a => (a && a.id !== undefined ? a.id : a) !== c.id);
  log(`${c.name} regenerates instead of being destroyed${why ? ' (' + why + ')' : ''}: tapped, damage removed, removed from combat (CR 701.19)`);
  toast('Regenerated', `${c.name} was tapped and removed from combat instead of being destroyed.`); return true;
}
function destroyPerm(c, src, noRegen) {
  if (!state) return;
  if (hasKw(c, 'indestructible')) { log(`${src}: ${c.name} is indestructible, so it is not destroyed`); toast('Not destroyed', `${c.name} has indestructible.`); return; }
  if (!noRegen && tryRegenerate(c, src)) { render(); return; }
  snap(); log(`${src}: destroyed ${c.name}`); leaveBattlefield(c, 'graveyard'); render(); flushTriggers();
}
// The effects of a resolving spell/ability, bound to the targets that were chosen for it.
function targetedOptions(tx, obj) {
  const ts = (obj.targets || []).filter(t => !t.gone); if (!ts.length) return [];
  const src = obj.sourceName || '~', opts = [];
  let si = 0;
  const live = t => t.kind === 'perm' ? (findCard(t.id) || {}).card : t.kind === 'gy' ? (findCard(t.id) || {}).card : null;
  const SENTS = String(tx).replace(/\([^)]*\)/g, '').replace(/\n/g, ' ').split(/(?<=\.)\s+/);
  for (let sIdx = 0; sIdx < SENTS.length; sIdx++) { const sentence = SENTS[sIdx];
    const ls = parseTargetSpecs(sentence); if (!ls.length) continue;
    const T = ls.map((_, k) => ts.filter(t => t.spec === si + k)); si += ls.length;
    const first = T[0] || []; if (!first.length) continue;
    const s = sentence.replace(/\u2019/g, "'");
    let mm;
    const each = (fnFor, label, oppFn) => { for (const t of first) { const c = live(t); opts.push({ label: label(t), fn: () => { if (t.kind === 'opp') { log(`${src}: ${label(t)} (your opponent's ${/graveyard/.test(t.id) ? 'graveyard' : 'permanent'}: apply it at the table)`); if (oppFn) oppFn(t); render(); return; } fnFor(t, c); } }); } };
    if ((mm = s.match(/\bdeals? (\d+) damage/i))) { const n = +mm[1]; each((t, c) => { if (t.kind === 'player') { t.id === 'you' ? changeLife(-preventDamage('you', n, src)) : changeOppLife(-n); } else if (c) dealDamageTo(c, n, src); }, t => `Deal ${n} damage to ${t.name}`); }
    else if (/\battach\b/i.test(s) && obj.sourceId) each((t, c) => { if (c) attachTo(obj.sourceId, c.id, src); }, t => `Attach ${src} to ${t.name}`);
    else if (/\bdestroy\b/i.test(s)) { const mvc = /\bif it has mana value (\d+) or (less|greater)\b/i.exec(s); each((t, c) => { if (c) { if (mvc) { const v = c.token ? 0 : ((cardInfo(c.name) || {}).cmc || 0); if (mvc[2].toLowerCase() === 'less' ? v > +mvc[1] : v < +mvc[1]) { log(`${src}: ${c.name} has mana value ${v}, not ${mvc[1]} or ${mvc[2]}, so nothing happens to it`); toast('Nothing happens', `${c.name} has mana value ${v}.`); return; } } destroyPerm(c, src); } }, t => `Destroy ${t.name}${mvc ? ` (only if its mana value is ${mvc[1]} or ${mvc[2]})` : ''}`); }
    else if (/\bexile\b/i.test(s) && !/\bexile it\b/i.test(s)) { const srcTx = (obj.sourceId > 0 && (findCard(obj.sourceId) || {}).card) ? String(cardText(findCard(obj.sourceId).card) || '') : ''; const until = !!obj.sourceId && (/\buntil\b[^.]*\bleaves the battlefield/i.test(s) || /leaves the battlefield, return the exiled cards? to the battlefield/i.test(srcTx));
      const rest = SENTS.slice(sIdx + 1), lifeR = rest.map(x => /^Its controller gains life equal to its (power|toughness|mana value)\.?$/i.exec(x)).find(Boolean), srchR = rest.map(x => /^Its controller may search their library for (.+?)\.?$/i.exec(x)).find(Boolean);
      each((t, c) => { if (c) { const lifeN = lifeR ? (/power/i.test(lifeR[1]) ? ptCalc(c).p : /toughness/i.test(lifeR[1]) ? ptCalc(c).t : (c.token ? 0 : ((cardInfo(c.name) || {}).cmc || 0))) : 0; moveCard(c.id, 'exile'); if (lifeN) { changeLife(lifeN, true); log(`${src}: you gain ${lifeN} life (its controller gains life equal to its ${lifeR[1]})`); } if (srchR) { const so = effectOptionsBase('Search your library for ' + srchR[1] + '.', { sourceName: src, sourceId: null }).filter(o => typeof o.fn === 'function'); if (so[0]) afterSettled(() => so[0].fn()); } if (until) addFx({ kind: 'exileUntil', cardId: c.id, cardName: c.name, srcId: obj.sourceId, srcName: src }); } }, t => `Exile ${t.name}${until ? ' until ' + src + ' leaves the battlefield' : ''}`, until ? (t => addFx({ kind: 'note', until: 'srcLeaves', text: `${t.name} is exiled (your opponent's): it comes back when ${src} leaves the battlefield`, srcId: obj.sourceId, srcName: src })) : null); }
    else if (/\breturn\b[^.]*\bto (?:its|their) owner's hand/i.test(s)) each((t, c) => {
      if (c && t.kind === 'perm') moveCard(c.id, 'hand');
      else if (t.kind === 'spell') { const i = state.stack.findIndex(x => x.id === t.id); if (i >= 0) { snap(); const [x] = state.stack.splice(i, 1); if (!state.stack.length) state.priority = { active: false, passed: false }; if (x.opp) log(`${src}: opponent's ${x.name} returned to its owner's hand`); else { delete x.target; delete x.targets; delete x.modes; delete x.modeTexts; restoreHalf(x); state.hand.push(x); log(`${src}: ${x.name} returned to your hand`); } render(); } }
    }, t => `Return ${t.name} to its owner's hand`);
    else if (/\buntap\b/i.test(s)) each((t, c) => { if (c && c.tapped) untapByEffect(c.id); }, t => `Untap ${t.name}`);
    else if (/\btap\b/i.test(s) && /\btap target/i.test(s)) each((t, c) => { if (c && !c.tapped) toggleTap(c.id); }, t => `Tap ${t.name}`);
    else if ((mm = s.match(/put (a|an|one|two|three|four|five|\d+) \+1\/\+1 counters? on/i))) { const n = wnum(mm[1]); each((t, c) => { if (c) addCounter(c.id, n, 'plus'); }, t => `Put ${n} +1/+1 counter${n === 1 ? '' : 's'} on ${t.name}`); }
    else if (/\bcounter\b/i.test(s) && /\bcounter target\b/i.test(s)) { const cdest = (m0 => m0 ? (/hand/.test(m0[1]) ? 'hand' : /top of/.test(m0[1]) ? 'top' : 'exile') : null)(tx.replace(/\u2019/g, "'").match(/countered this way, ((?:put it into its owner's hand|put it on top of its owner's library|exile it))/i));
      const soft = s.match(/\bunless (?:its controller|that player|they|its owner|you) pays? (.+?)\.?$/i);   // CR 608.2c / 701.6: a "soft" counter: only counters if the cost is NOT paid
      each((t) => { const sp = state.stack.find(x => x.id === t.id), mv = sp ? spellMV(sp) : 0;
        { const cc = s.match(/\bif it has mana value (\d+) or (less|greater|more)\b/i);   // "Counter target spell if it has mana value 3 or less" (CR 608.2b: checked as it resolves)
          if (cc && sp) { const nn = +cc[1], okc = cc[2].toLowerCase() === 'less' ? mv <= nn : mv >= nn; if (!okc) { log(`${src}: ${t.name} has mana value ${mv}, not ${nn} or ${cc[2] === 'less' ? 'less' : 'greater'}, so it is not countered`); render(); return; } } }
        if (!soft) { counterStackObject(t.id, src, cdest); delayedManaFromText(tx, mv, src); return; }
        const cost = soft[1].replace(/\s+/g, ' ').trim(), m = modal(`${src}: counter unless it pays ${cost}`, { width: 480, sticky: true, noClose: true });
        m.body.append(h('div', { class: 'psub', text: `${t.name} is countered unless its controller pays ${cost}. Did they pay?` }), h('div', { class: 'muted small', text: 'Their mana is not tracked here: pay it from your own mana if it is your spell, otherwise answer for your opponent.' }));
        m.foot.append(h('button', { text: `They paid ${cost}`, onclick: () => { m.close(); log(`${src}: ${t.name}'s controller paid ${cost}, so it is not countered`); render(); } }), h('button', { class: 'primary', text: "They didn't pay: counter it", onclick: () => { m.close(); counterStackObject(t.id, src, cdest); delayedManaFromText(tx, mv, src); } }));
      }, t => `Counter ${t.name}${soft ? ' unless its controller pays ' + soft[1].replace(/\s+/g, ' ').trim() : ''}`); }
    else if ((mm = s.match(/\bgains? (\d+) life/i))) { const n = +mm[1]; each((t) => { t.id === 'you' ? changeLife(n, true) : changeOppLife(n); }, t => `${t.name} ${t.id === 'you' ? 'gain' : 'gains'} ${n} life`); }
    else if ((mm = s.match(/\bloses? (\d+) life/i))) { const n = +mm[1]; each((t) => { t.id === 'you' ? changeLife(-n) : changeOppLife(-n); }, t => `${t.name} ${t.id === 'you' ? 'lose' : 'loses'} ${n} life`); }
    else if (parseDrawDiscard(s)) { const dd = parseDrawDiscard(s); each((t) => { if (t.id === 'you') runDrawDiscard(dd, src); else { log(`${src}: your opponent: ${ddLabel(dd).toLowerCase()} (not tracked here)`); render(); } }, t => `${t.name}: ${ddLabel(dd).toLowerCase()}`); }
    else if ((mm = s.match(/\bdraws? (a|an|one|two|three|four|five|six|seven|\d+) cards?/i))) { const n = wnum(mm[1]); each((t) => { if (t.id === 'you') { snap(); const d = drawCards(n); log(`${src}: you drew ${d}`); render(); } else { log(`${src}: your opponent draws ${n} (not tracked here)`); render(); } }, t => `${t.name} ${t.id === 'you' ? 'draw' : 'draws'} ${n} card${n === 1 ? '' : 's'}`); }
    opts.push(...durationOptions(s, obj, first.filter(t => t.kind === 'perm' && !t.gone).map(t => ({ id: t.id, name: t.name }))));
  }
  return opts;
}
// "Return target legendary creature card from your graveyard to the battlefield" and similar: the target is chosen
// as the spell is cast, and checked again as it resolves (rules 601.2c, 608.2b).
const RETURN_RE = /\b(?:Return|Put) target ((?:[a-z\-]+ )*?)card (?:with mana value (\d+)( or (?:less|greater))? )?(?:from|in) (?:your|a|an) graveyard (?:to|onto) (the battlefield|your hand)[^.]*\./i;   // v0.94.1 also "Put target creature card from a graveyard onto the battlefield under your control" and mana value limits
function matchesGraveSpec(card, spec) {
  const t=frontType(card)||'';
  if (spec.mv) { const i=cardInfo(card.name), v=i?i.cmc||0:0; if (spec.mv.rel==='or less' ? v>spec.mv.n : spec.mv.rel==='or greater' ? v<spec.mv.n : v!==spec.mv.n) return false; }
  return spec.words.every(w => w==='legendary' ? /Legendary/i.test(t) : w==='nonlegendary' ? !/Legendary/i.test(t) : w==='nonland' ? !/\bLand\b/i.test(t) : new RegExp('\\b'+w+'\\b','i').test(t));
}
let targetChosenFor=null;
// Carry out the "Return target ..." sentence of a resolving spell. Returns the spell text left for the effect panel.
function applyGraveReturn(c, stx) {
  const rm=stx.replace(/\n/g,' ').match(RETURN_RE); if(!rm||!c.target) return stx;
  const gi=state.graveyard.findIndex(x=>x.id===c.target.id), name=c.target.name; delete c.target;
  const rest=stx.replace(RETURN_RE,'').trim();
  if(gi<0){ log(`${c.name}: its target (${name}) is no longer in the graveyard, so the spell does nothing`); toast('Spell fizzled',`${name} left the graveyard, so ${c.name} has no legal target and does nothing.`); return ''; }
  const [t]=state.graveyard.splice(gi,1);
  if(rm[4].toLowerCase()==='your hand'){ state.hand.push(t); log(`${c.name}: returned ${t.name} to your hand`); return rest; }
  const tappedIn=/\b(?:to|onto) the battlefield tapped\b/i.test(rm[0]), loseMV=/you lose life equal to (?:its|that card's) mana value/i.test(rest);
  if(loseMV){ const inf=cardInfo(t.name), n=inf?inf.cmc||0:0; if(n){ changeLife(-n); log(`${c.name}: you lose ${n} life (mana value of ${t.name})`); } }
  t.counters={plus:0,minus:0};
  enterBattlefield(t,{from:'graveyard',tapped:tappedIn||undefined,logMsg:`${c.name}: returned ${t.name} from the graveyard to the battlefield${tappedIn?' tapped':''}`,afterPlace:()=>{
    if(/gains? haste(?: until end of turn)?\b/i.test(rest)){ addFx({kind:'kw',targetId:t.id,kw:'haste',srcName:c.name}); log(`${t.name} gains haste until end of turn`); }
    if(/exile (?:it|that creature) at the beginning of the next end step/i.test(rest)){ addFx({kind:'delayed',when:'end',action:'exile',targetId:t.id,targetName:t.name,text:`Exile ${t.name}.`,srcName:c.name}); log(`${t.name} will be exiled at the beginning of the next end step`); }
    if(/if (?:it|that creature) would leave the battlefield, exile it instead/i.test(rest)){ t.exileInstead=true; }
  }});
  return rest.replace(/You lose life equal to (?:its|that card's) mana value\.?/i,'').replace(/[^.]*gains? haste(?: until end of turn)?\.?/i,'').replace(/[^.]*exile (?:it|that creature) at the beginning of the next end step\.?/i,'').replace(/[^.]*would leave the battlefield, exile it instead[^.]*\.?/i,'').trim();
}
// "Countered": the top object of the stack is removed without resolving (you are playtesting against a real opponent).
function counterStackObject(id, by, dest) {   // dest: where a countered spell goes instead of its graveyard (CR 701.6 + Remand / Memory Lapse / Dissipate text)
  if(!state) return; const i=state.stack.findIndex(x=>x.id===id); if(i<0) return;
  { const sc=state.stack[i], why=cantBeCounteredWhy(sc); if(why) { log(`${by?by+': ':''}${sc.name} can't be countered (${why}), so it stays on the stack`); toast("Can't be countered", `${sc.name} can't be countered: ${why}. The counter effect does nothing to it (rule 101.2).`); return; } }
  snap();
  const [c]=state.stack.splice(i,1); delete c.splicedTx; if(!state.stack.length) state.priority={active:false,passed:false}; sfx('counter'); if(!c.ability) { flightCounter.add(c.id); spotlight(c,'counter',null); }
  if(c.opp){ log(`${by?by+': ':''}Opponent's ${c.name} was countered`); toast(`Opponent's ${c.name} countered`,'It leaves the stack without resolving.'); }
  else if(c.ability){ log(`${by?by+': ':''}${c.sourceName||c.name}: ability was countered — it does not resolve`); toast('Ability countered','It leaves the stack without resolving. The permanent that made it is unaffected.'); }
  else { const where = dest === 'hand' ? (state.hand.push(c), "its owner's hand") : dest === 'top' ? (state.library.unshift(c), 'the top of its owner\'s library') : dest === 'exile' ? (state.exile.push(c), 'exile') : gyPush(c,'stack'); delete c.target; delete c.targets; delete c.modes; delete c.modeTexts; log(`${by?by+': ':''}${c.name} was countered → ${where}`); restoreHalf(c); toast(`${c.name} countered`, `A countered spell does not resolve (no effects, no entering the battlefield) and goes to its owner's ${where}.`); }
  render();
  if(state.pendingTriggers.length) resolvePendingTrigger();
}
function counterTopOfStack() { if(state&&state.stack.length) counterStackObject(state.stack[state.stack.length-1].id); }
function castOppSpell(name, type) {
  if(!state||!name) return; snap();
  const isAb=type==='Ability';
  if (!isAb) noteCast({ name }); state.stack.push({ id: state.nextId++, name, opp: true, oppType: isAb?'':(type || ''), ...(isAb?{ability:true,sourceName:name}:{}) }); state.priority={active:true,passed:false};
  if(!isAb) spotlight({name,opp:true},'cast',null);
  log(isAb?`Opponent's ability ${name} goes on the stack`:`Opponent casts ${name}${type?' ('+type+')':''} — it is on the stack`); render();
}
function finishAbilityResolving() {
  if (!state || !state.resolvingAb) return;
  if (state.discarding || handPick) { state.resolvingWait = true; render(); return; }
  state.resolvingAb = null; if (!state.resolving) { state.resolvingWait = false; state.resLines = []; } render();
}
function finishResolving() {   // the spell whose effect was just applied (or skipped) now leaves the stack
  const c = state && state.resolving; if (!c) return;
  if (state.discarding || handPick) { state.resolvingWait = true; render(); return; }   // wait until the chosen cards have been discarded
  state.resolving = null; state.resolvingWait = false; state.resLines = []; if (c.copy) { log(`Resolved a copy of ${c.name}; the copy ceases to exist`); render(); return; } const where = reboundOnResolve(c) || shuffleSelfOnResolve(c) || exileSelfOnResolve(c) || gyPush(c, 'stack'); restoreHalf(c); log(`Resolved ${c.name} \u2192 ${where}`); render();
}
function resolveTopOfStack() {
  if (gameIsOver()) return;   // v0.99.71 the game is over: nothing more is put on the stack or resolved until you choose Keep playing
  if(!state||!state.stack.length) return; snap();
  // v0.99.94 no flight off the stack: the card dissolves from the top of the pile (src/91) and simply appears where it goes
  const c=state.stack.pop(); state.priority={active:false,passed:false};
  if(c.opp && practiceResolve(c)) return;   // v0.99.91 the practice opponent's own Counterspell
  if(c.opp){ log(`Opponent's ${c.name} resolves — apply its effects at the table`); toast(`Opponent's ${c.name} resolves`,'Its effects are not tracked here. Adjust your board, life or cards by hand.'); render(); return; }
  if(c.targets&&c.targets.length){
    const alive=c.targets.filter(targetStillLegal);
    if(!alive.length && !c.mutating){
      log(`${c.ability?c.sourceName+' ability':c.name} fizzles: all its targets (${c.targets.map(t=>t.name).join(', ')}) are gone`);
      toast('Fizzled','Every target is illegal now, so it does nothing (rule 608.2b).');
      if(!c.ability){ gyPush(c,'stack'); restoreHalf(c); delete c.targets; delete c.target; }
      render(); if(state.pendingTriggers.length) resolvePendingTrigger(); return;
    }
    c.targets.forEach(t=>{ t.gone=!targetStillLegal(t); });
  }
  let eff=null; if(!isPermanentCard(c)||c.ability) sfx('resolve'); if(!c.opp&&!c.ability&&!isPermanentCard(c)) spotlight(c,'resolve',null);
  if(c.ability){ log(`Resolved ability of ${c.sourceName}`); eff=c; }
  else if (isPermanentCard(c) && c.mutating && mutateMerge(c)) { /* merged into its target: no new permanent enters (CR 702.140c) */ }
  else if (isPermanentCard(c)) {
    enterBattlefield(c,{from:'stack',logMsg:`Resolved ${c.name} → battlefield`,afterPlace:()=>{
    if(c.warped){ delete c.warped; c.warpExile=state.turn; addFx({kind:'delayed',when:'end',action:'exile',targetId:c.id,targetName:c.name,text:`Exile ${c.name} (warp).`,srcName:c.name}); log(`${c.name}: warped, it will be exiled at the beginning of the next end step; you may cast it from exile on a later turn`); }
    if(c.bestowed) bestowResolved(c);
    if(c.impended) impendingEnter(c);
    if(c.blitzed||c.dashed) altKwResolved(c);
    if(c.evoked){ delete c.evoked; queueTrigger({kind:'ability',cardId:c.id,cardName:c.name,text:'Evoke: when this enters, sacrifice it.',effect:'Sacrifice ~.',special:'sacSelf',optional:false,why:'You cast it for its evoke cost, so it is sacrificed when it enters. Its other enters-the-battlefield abilities still trigger; you choose the order they go on the stack.'}); }
    // v0.99.32 "enters with X counters" is applied once, by etbCounters (with replacement effects such as Hardened Scales). This block added them a second time: Walking Ballista cast for X = 3 got 6 counters.
    }});
  } else {
    const nm0=c.name, adv0=c.half && (halfParent(c)||{}).kind==='adventure', cf0=c.castFrom, op0=!!c.kicked;
    // v0.90.11 rule 608.2n: an instant or sorcery stays on the stack until its effect is done, then goes to the graveyard. The effect window opens first.
    { const md0=c.modes?spellModal(c):null; let baseTx=md0?modalText(md0,c.modes):cardText(c); if(c.overloaded){ baseTx=overloadText(baseTx); delete c.overloaded; log(`${c.name}: overloaded, so every "target" is "each"`); } delete c.modes; delete c.modeTexts; delete c.splicedTx;
      baseTx=String(baseTx||'').split('\n').filter(l=>!/^(?:As an additional cost to cast this spell\b|This spell costs\b[^.]*\b(?:less|more) to cast\b)/i.test(l.trim())).join('\n');   // v0.99.75 CR 601.2f/601.2b: costs were paid as it was cast; they are not effects of the resolving spell (Lightning Axe asked about "discard a card or pay {5}")
      let stx=applyKickedInstead(baseTx,op0).replace(/\bX\b/g,c.xValue!==undefined?String(c.xValue):'X').replace(/\b1 cards\b/g,'1 card');
      if(c.target) stx=applyGraveReturn(c,stx);
      if(stx && (c.xValue!==undefined || effectOptions(stx,{sourceName:c.name,sourceId:null,targets:c.targets}).length)) eff={ability:true,id:0,name:c.name,sourceName:c.name,sourceId:null,text:stx,targets:c.targets,_tgtAsked:true,castFrom:cf0,optPaid:op0}; delete c.targets; }
    if(eff && !adv0 && layoutOn('resolveFirst')){ state.resolving=c; log(`${nm0} is resolving`); }
    else if(c.copy){ log(`Resolved a copy of ${nm0}; the copy ceases to exist`); }
    else { const where=adv0?exileOnAdventure(c):(reboundOnResolve(c)||shuffleSelfOnResolve(c)||gyPush(c,'stack')); log(`Resolved ${nm0} → ${where}${adv0?' (on an adventure)':''}`); }
  }
  if(!state.resolving) restoreHalf(c);
  render();
  if(eff && c.ability){ state.resolvingAb = Object.assign({}, c); render(); }
  if(eff) openAbilityEffect(eff,()=>{ finishResolving(); finishAbilityResolving(); if(state.pendingTriggers.length) resolvePendingTrigger(); });
  else if(state.pendingTriggers.length) resolvePendingTrigger();
}


// v0.99.72 "Resolve all": resolve every trigger of ONE card from the top of the stack, one at a time in stack order (CR 608.1, 405.5).
// A new trigger of that card that lands on top (Glaring Fleshraker's damage when one of its Spawn enters) is part of the run; anything else on top ends it,
// so you can still respond to a different card. A choice window pauses the run until you answer it.
function sameSourceRun() {
  if (!state || !state.stack.length) return 0; const st = state.stack, top = st[st.length - 1]; if (!top.ability || !top.trigger || top.opp || top.sourceId == null) return 0;
  let n = 0; for (let i = st.length - 1; i >= 0; i--) { const x = st[i]; if (x.ability && x.trigger && !x.opp && x.sourceId === top.sourceId) n++; else break; } return n;
}
let RES_RUN = null;
function resolveAllFromSource() {
  const st = state && state.stack; if (!st || !st.length) return; const top = st[st.length - 1];
  RES_RUN = { src: top.sourceId, name: top.sourceName, done: 0, t0: Date.now() }; log(`Resolve all: ${top.sourceName}'s triggers resolve one at a time`); stepResolveRun();
}
function stepResolveRun() {
  const run = RES_RUN; if (!run || !state) return;
  if (gameIsOver() || Date.now() - run.t0 > 10 * 60000) { RES_RUN = null; return; }
  { const ay = document.querySelector('#modalRoot .ay-offer'); const no = ay && [...ay.querySelectorAll('button')].find(b => b.textContent === 'Ask every time'); if (no) { no.click(); setTimeout(stepResolveRun, 60); return; } }   // you chose Resolve all: the Always yield offer is answered "not now"
  const win = document.querySelector('#modalRoot .backdrop');
  if (!win && state.pendingTriggers.length && !state.resolving && !state.resolvingAb) flushTriggers();
  const busy = state.resolving || state.resolvingAb || document.querySelector('#modalRoot .backdrop') || state.pendingTriggers.length;
  if (busy) { setTimeout(stepResolveRun, 150); return; }   // waiting for you to answer a choice (or to order new triggers)
  const top = state.stack[state.stack.length - 1];
  if (!top || !top.ability || !top.trigger || top.opp || top.sourceId !== run.src) { RES_RUN = null; if (run.done) log(`Resolve all: ${run.done} of ${run.name}'s triggers resolved`); render(); return; }
  run.done++; resolveTopOfStack(); setTimeout(stepResolveRun, 60);
}


const BASIC_LANDS = new Set(['plains', 'island', 'swamp', 'mountain', 'forest', 'wastes',
  'snow-covered plains', 'snow-covered island', 'snow-covered swamp', 'snow-covered mountain', 'snow-covered forest']);

const LAND_HINT = /\b(triome|tower|foothills|strand|mesa|mire|catacombs|crypt|tomb|fountain|vents|grounds?|pool|plains|island|swamp|mountain|forest|wastes|fetch|temple garden)\b/i;
function isLandName(name) {
  const i = cardInfo(name);
  return i ? i.land : (BASIC_LANDS.has(norm(name)) || LAND_HINT.test(name));
}

