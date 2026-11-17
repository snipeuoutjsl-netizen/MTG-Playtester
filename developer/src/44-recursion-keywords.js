// ---------------------------------------------------------------- v0.96.5 recursion keywords: Embalm, Eternalize, Unearth (graveyard activated abilities), Outlast, Rebound
// CR 702.128a Embalm: "[Cost], Exile this card from your graveyard: Create a token that's a copy of this card, except it's white, it has no mana cost, and it's a Zombie in addition to its other types. Activate only as a sorcery."
// CR 702.129a Eternalize: the same, except the token is black and 4/4.
// CR 702.84a  Unearth: "[Cost]: Return this card from your graveyard to the battlefield. It gains haste. Exile it at the beginning of the next end step. If it would leave the battlefield, exile it instead of putting it anywhere else. Activate only as a sorcery."
// CR 702.97a  Scavenge: "[Cost], Exile this card from your graveyard: Put a number of +1/+1 counters equal to this card's power on target creature. Activate only as a sorcery."  (The power is the one it had in the graveyard: its printed power.)
// CR 702.107a Outlast: "[Cost], {T}: Put a +1/+1 counter on this creature. Activate only as a sorcery."  (read in activatedAbilitiesFor)
// CR 702.88a  Rebound: "If this spell was cast from your hand, instead of putting it into your graveyard as it resolves, exile it and, at the beginning of your next upkeep, you may cast this card from exile without paying its mana cost."
const GY_ABILITY_RE = /^(Embalm|Eternalize|Unearth|Scavenge)\s*(?:[—-]\s*)?((?:\{[^}]+\})+)\s*$/i;
function gyAbilitiesFor(c) {
  if (!c || c.token || !state) return [];
  const info = cardInfo(c.name); if (!info) return []; const out = [];
  for (const raw of String(info.tx || '').replace(/\([^)]*\)/g, '').split('\n')) {
    const m = raw.trim().match(GY_ABILITY_RE); if (!m) continue;
    const kind = m[1].toLowerCase(); out.push({ kind, cost: m[2], label: `${m[1]} ${m[2]}` });
  }
  return out;
}
// The copy a token is made from (CR 707.2 copiable values), with the keyword's exceptions applied.
function copyTokenDef(info, kind) {
  const front = String(info.t || '').split(' // ')[0], parts = front.split('—'), types = (parts[0].match(/\b(Artifact|Creature|Enchantment|Land|Planeswalker|Battle|Kindred)\b/g) || []);
  const subs = ((parts[1] || '').trim().split(/\s+/).filter(Boolean)).map(x => x.toLowerCase()); if (!subs.includes('zombie')) subs.unshift('zombie');
  const pt = kind === 'eternalize' ? '4/4' : (info.pt || '');
  const col = kind === 'embalm' ? ['W'] : ['B'];
  const subWords = subs.map(s => s[0].toUpperCase() + s.slice(1));
  return { name: String(info.name || '').split(' // ')[0], pt, subs, col, types, type: `Token ${types.join(' ')} — ${subWords.join(' ')}`, tx: String(info.tx || '') };
}
function useGyAbility(id, kind) {
  if (!state) return; const g = state.graveyard.find(x => x.id === id); if (!g) return;
  const ab = gyAbilitiesFor(g).find(a => a.kind === kind); if (!ab) return;
  if (!canPlaySorcerySpeedNow()) { toast('Wrong timing', `${ab.label} can be activated only as a sorcery: your main phase with an empty stack.`); return; }
  const card = g;
  payManaThen(card, ab.cost, ab.label, () => {
    const f = state.graveyard.findIndex(x => x.id === id); if (f < 0) return;
    if (kind === 'unearth') {
      moveCard(id, 'battlefield'); const b = findCard(id); if (!b || b.zone !== 'battlefield') return;
      b.card.exileInstead = true; addKwFx(id, 'haste', { until: 'manual' });
      addFx({ kind: 'delayed', when: 'end', action: 'exile', targetId: id, targetName: b.card.name, text: `Exile ${b.card.name} (unearth).`, srcName: b.card.name });
      log(`${b.card.name}: unearthed. It has haste, is exiled at the beginning of the next end step, and is exiled instead if it would leave the battlefield`);
    } else if (kind === 'scavenge') {
      const [c0] = state.graveyard.splice(f, 1); state.exile.push(c0);   // exiling it is part of the cost
      const n = Math.max(0, ptCalc(c0).p || 0), crs = state.battlefield.filter(x => permTypeInfo(x).types.has('creature'));
      log(`${c0.name}: scavenge paid; choose a creature to get ${n} +1/+1 counter${n === 1 ? '' : 's'}`);
      if (!crs.length) log('Scavenge: there is no creature to target'); else if (crs.length === 1) addCounter(crs[0].id, n, 'plus');
      else openPickCards({ title: `Scavenge: put ${n} +1/+1 counter${n === 1 ? '' : 's'} on target creature`, cards: crs, max: 1, min: 1, note: `Counters equal to ${c0.name}'s power (${n}).`, done: picked => { if (picked[0]) addCounter(picked[0].id, n, 'plus'); } });
    } else {
      const info = cardInfo(g.name); const [c0] = state.graveyard.splice(f, 1); state.exile.push(c0);   // exiling this card is part of the cost
      makeTokensFromDef(copyTokenDef(info, kind), 1, `${c0.name} (${kind})`);
      log(`${c0.name}: ${kind} paid; a ${kind === 'embalm' ? 'white' : 'black 4/4'} Zombie token copy was created`);
    }
    render();
  });
}
// ---- Rebound (CR 702.88)
const hasRebound = c => /^Rebound\b/im.test(String(cardText(c)).replace(/\([^)]*\)/g, ''));
function reboundOnResolve(c) {   // returns 'exile' when it was exiled with rebound, else null (the caller then puts it in the graveyard)
  if (!c || c.copy || c.gyExile || c.castFrom !== 'hand' || !hasRebound(c)) return null;
  c.rebound = state.turn; state.exile.push(c);
  log(`${c.name}: rebound. It was cast from your hand, so it is exiled instead of going to the graveyard; at the beginning of your next upkeep you may cast it from exile without paying its mana cost`);
  return 'exile';
}
function reboundUpkeep() {
  if (!state) return;
  for (const c of state.exile) if (c.rebound && c.rebound < state.turn) {
    delete c.rebound;
    state.pendingTriggers.push({ kind: 'ability', cardId: c.id, cardName: c.name, special: 'reboundCast', optional: true, text: `Rebound — At the beginning of your next upkeep, you may cast ${c.name} from exile without paying its mana cost.`, effect: 'Cast it from exile without paying its mana cost.', why: 'A spell that was cast from your hand with rebound was exiled as it resolved.' });
  }
}
