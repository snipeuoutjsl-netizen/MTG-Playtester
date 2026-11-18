// ---------------------------------------------------------------- v0.97.4 rules text: "becomes an artifact creature with P/T equal to its mana value" and "reveal a card from outside the game or choose a face-up card in exile"
// CR 613.1d/613.4b  An effect that makes a permanent a creature adds the type and sets its power and toughness; CR 611.2b "until your next turn" ends as that turn begins.
// CR 400.11 / 406  Outside the game = the sideboard; a face-up exiled card you own can be chosen.   (Karn, the Great Creator reads both lines.)
function becomesCreatureEffect(tx, src, obj) {
  const m = /^(?:(until your next turn|until end of turn),\s*)?(up to one )?target ([a-z ,]+?) becomes an? ((?:[a-z]+ )*?)creature with (?:base )?power and toughness (?:each )?equal to (?:its|that [a-z]+'s) mana value\.?$/i.exec(String(tx || '').replace(/’/g, "'").replace(/\n/g, ' ').trim());
  if (!m) return null;
  const dur = /your next turn/i.test(m[1] || '') ? 'upkeep' : 'end', phrase = m[3].toLowerCase(), extra = m[4].trim().split(/\s+/).filter(Boolean).map(x => x.toLowerCase());
  const noncreature = /\bnoncreature\b/.test(phrase), words = phrase.replace(/\bnon\w+\b/g, '').split(/\s*(?:,|\bor\b)\s*/).map(w => singularWord(w.trim())).filter(Boolean);
  const ok = c => (!noncreature || !/\bCreature\b/.test(frontType(c) || permTypeLine(c))) && (!words.length || permHasAny(c, words));
  const apply = c => {
    snap(); const info = c.token ? null : cardInfo(c.name), mv = info ? mvOf(info) : 0;
    c.becomes = { pt: mv + '/' + mv, types: [...new Set([...extra, 'creature'])], subs: [], src: src + ' (its mana value)' };
    addFx({ kind: 'delayed', when: dur, action: 'unbecome', targetId: c.id, targetName: c.name, text: `${c.name} stops being a creature.`, srcName: src });
    log(`${src}: ${c.name} becomes a ${mv}/${mv} ${[...new Set([...extra, 'creature'])].join(' ')} (its mana value, ${dur === 'upkeep' ? 'until your next turn' : 'until end of turn'})`); render(); flushTriggers();
  };
  return { full: true, label: `Target ${phrase} becomes a ${extra.join(' ')} creature, power and toughness equal to its mana value`, fn: () => {
    const tg = obj && (obj.targets || []).find(t => t.kind === 'perm' && !t.gone);
    if (tg) { const f = findCard(tg.id); if (f && f.zone === 'battlefield') apply(f.card); else log(`${src}: its target is gone, so the ability does nothing (CR 608.2b)`); return; }
    const cards = state.battlefield.filter(ok);
    if (!cards.length) { log(`${src}: no ${phrase} to choose (the target is optional)`); toast('No legal target', `There is no ${phrase} on the battlefield.`); return; }
    openPickCards({ title: `${src}: choose target ${phrase}`, note: 'Choose up to one.', cards, min: 0, max: 1, nothing: 'No target', done: p => { const x = p && p[0]; if (x) apply(x); } });
  } };
}
function wishEffect(tx, src) {
  const m = /^you may reveal an? ([a-z ]+?) cards? you own from outside the game or choose a face-up \1 cards? you own in exile\.\s*put that card into your hand\.?$/i.exec(String(tx || '').replace(/\n/g, ' ').trim());
  if (!m) return null; const kind = m[1].toLowerCase();
  const typeOk = c => { const t = c.token ? '' : (cardInfo(c.name) || {}).t || ''; return new RegExp('\\b' + kind + '\\b', 'i').test(t.split(' // ')[0]); };
  return { full: true, label: `Put a ${kind} card from your sideboard or from exile (face up) into your hand`, fn: () => {
    const cards = [...(state.sideboard || []).filter(typeOk).map(c => ({ c, z: 'sideboard' })), ...state.exile.filter(c => !c.faceDown && !c.token && typeOk(c)).map(c => ({ c, z: 'exile' }))];
    if (!cards.length) { toast('Nothing to choose', `You have no ${kind} card outside the game (sideboard) or face up in exile.`); log(`${src}: no ${kind} card outside the game or in exile`); return; }
    openPickCards({ title: `${src}: choose a ${kind} card`, note: 'From outside the game (your sideboard) or face up in exile. You may choose nothing.', cards: cards.map(x => x.c), min: 0, max: 1, nothing: 'Choose nothing', done: p => {
      const x = p && p[0]; if (!x) return; snap(); const from = cards.find(y => y.c.id === x.id).z; const arr = from === 'sideboard' ? state.sideboard : state.exile, i = arr.findIndex(y => y.id === x.id); if (i < 0) return;
      const [card] = arr.splice(i, 1); state.hand.push(card); log(`${src}: put ${card.name} into your hand (from ${from === 'sideboard' ? 'outside the game' : 'exile'})`); render(); flushTriggers(); } });
  } };
}
// ---- the general family (CR 613.1d, 613.4b, 611.2): "~ becomes a 2/2 ... creature [with flying] until end of turn", "target land you control becomes a 4/4 Elemental creature with haste until end of turn. It's still a land.",
// "target creature has base power and toughness 1/1 until end of turn", "...becomes an artifact creature with base power and toughness 5/5". Read from the words, no card names.
const BECOMES_RE = /^(?:(until end of turn|until your next turn),\s*)?(?:(~|this [a-z]+|it)|(?:up to one )?target ([a-z ,\/-]+?)(?: you control)?) becomes? an? (?:(\d+)\/(\d+) )?((?:[a-z-]+ )*?)creature(?: with (?:base power and toughness (\d+)\/(\d+)|([a-z ,]+?)))?(?: in addition to its other types)?(?: (until end of turn|until your next turn))?\.?(?: it'?s still an? [a-z ]+\.?)?$/i;
const BASEPT_RE = /^(?:(until end of turn|until your next turn),\s*)?(?:(~|this [a-z]+|it)|(?:up to one )?target ([a-z ,\/-]+?)(?: you control)?)(?:'s)? (?:has|have|(?:base )?power and toughness become) (?:base power and toughness )?(\d+)\/(\d+)(?:,? and loses all abilities)?(?: (until end of turn|until your next turn))?\.?$/i;
function animateGeneralEffect(tx, src, obj) {
  const T = String(tx || '').replace(/’/g, "'").replace(/\n/g, ' ').replace(/\s+/g, ' ').replace(selfNameRe(src), '~').trim();
  let m = BECOMES_RE.exec(T), kind = 'becomes';
  if (!m) { m = BASEPT_RE.exec(T); kind = 'base'; }
  if (!m) return null;
  const selfTok = kind === 'becomes' ? m[2] : m[2], phrase = (m[3] || '').toLowerCase();
  const durTxt = kind === 'becomes' ? (m[1] || m[10] || '') : (m[1] || m[6] || ''), dur = /your next turn/i.test(durTxt) ? 'upkeep' : durTxt ? 'end' : null;
  let pt, types = [], subs = [], kws = [];
  if (kind === 'becomes') {
    const ws = (m[6] || '').trim().split(/\s+/).filter(Boolean).map(w => w.toLowerCase()), COL = ['white', 'blue', 'black', 'red', 'green', 'colorless'];
    for (const w of ws) { if (w === 'artifact') types.push('artifact'); else if (!COL.includes(w) && !/^legendary$/.test(w)) subs.push(w); }
    types.push('creature');
    pt = m[4] !== undefined ? m[4] + '/' + m[5] : m[7] !== undefined ? m[7] + '/' + m[8] : null;
    if (m[9]) kws = m[9].split(/,\s*|\s+and\s+/).map(x => x.trim().toLowerCase()).filter(x => GRANTABLE.includes(x));
    if (!pt) return null;   // no stated P/T: leave it to the card reader (e.g. a Vehicle's crew)
  } else pt = m[4] + '/' + m[5];
  const label = kind === 'becomes' ? `${selfTok ? 'It' : 'Target ' + phrase} becomes a ${pt} ${[...subs, ...types].join(' ')}${kws.length ? ' with ' + kws.join(', ') : ''}${dur ? (dur === 'upkeep' ? ' until your next turn' : ' until end of turn') : ''}`
    : `${selfTok ? 'It' : 'Target ' + phrase} has base power and toughness ${pt}${dur ? (dur === 'upkeep' ? ' until your next turn' : ' until end of turn') : ''}`;
  const apply = c => {
    snap();
    if (kind === 'becomes') { c.becomes = { pt, types: [...new Set(types)], subs, kws }; } else c.basePT = pt;
    if (dur) addFx({ kind: 'delayed', when: dur, action: kind === 'becomes' ? 'unbecome' : 'unbase', targetId: c.id, targetName: c.name, text: `${c.name}: the effect ends.`, srcName: src });
    log(`${src}: ${c.name} ${kind === 'becomes' ? 'becomes a ' + pt + ' ' + [...subs, ...types].join(' ') + (kws.length ? ' with ' + kws.join(', ') : '') : 'has base power and toughness ' + pt}${dur ? (dur === 'upkeep' ? ' until your next turn' : ' until end of turn') : ''} (CR ${kind === 'becomes' ? '613.1d' : '613.4b'})`); render(); flushTriggers();
  };
  return { full: true, label, fn: () => {
    if (selfTok) { const f = obj && obj.sourceId ? findCard(obj.sourceId) : null; if (f && f.zone === 'battlefield') { apply(f.card); return; } const c = state.battlefield.find(x => x.name === src); if (c) { apply(c); return; } toast('Not on the battlefield', `${src} is not on the battlefield.`); return; }
    const tg = obj && (obj.targets || []).find(t => t.kind === 'perm' && !t.gone);
    if (tg) { const f = findCard(tg.id); if (f && f.zone === 'battlefield') apply(f.card); else log(`${src}: its target is gone, so the ability does nothing (CR 608.2b)`); return; }
    const words = phrase.split(/\s*(?:,|\bor\b)\s*/).map(w => singularWord(w.trim())).filter(Boolean), cards = state.battlefield.filter(c => !words.length || permHasAny(c, words));
    if (!cards.length) { toast('No legal target', `There is no ${phrase} on the battlefield.`); return; }
    openPickCards({ title: `${src}: choose target ${phrase}`, note: 'Choose the target.', cards, min: 1, max: 1, done: p => { const x = p && p[0]; if (x) apply(x); } });
  } };
}
