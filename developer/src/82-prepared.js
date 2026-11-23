// ---- v0.99.47 Preparation cards (CR 722, Secrets of Strixhaven / Reality Fracture). Scryfall layout "prepare": face 0 is the creature, face 1 its prepare spell.
// 722.3a "Prepared" is a designation (a marker, like monstrous). A permanent without a prepare spell can't become prepared, and one that is prepared can't become prepared again.
// 722.3c As it becomes prepared, its controller creates a copy of its prepare spell in exile. That copy stays there while the permanent stays on the battlefield
//        and prepared; its controller may cast it (paying its own mana cost, normal timing). The permanent stops being prepared as the copy becomes cast (601.2i),
//        so a countered copy still leaves it unprepared. Leaving the battlefield or an "unprepare" effect ends the designation and the copy ceases to exist.
function prepSpellOf(c) { if (!c || c.token && !c.tk) return null; const i = cardInfo(c.faceOf || c.origName || c.name); return i && i.lo === 'prepare' && i.fc && i.fc[1] ? i.fc[1] : (i && i.prep && i.fc && i.fc[1] ? i.fc[1] : null); }
function prepCopyOf(c) { return state ? state.exile.find(x => x.prepCopy === c.id) || state.hand.find(x => x.prepCopy === c.id) : null; }
function becomePrepared(c, why) {
  if (!state || !c) return false; const sp = prepSpellOf(c);
  if (!sp) { log(`${c.name} has no prepare spell, so it can't become prepared (CR 722.3a)`); return false; }
  if (c.prepared) { log(`${c.name} is already prepared (CR 722.3a)`); return false; }
  c.prepared = true;
  const parent = (cardInfo(c.faceOf || c.origName || c.name) || {}).name || c.name;   // the copy is the prepare half of the same card (like a split card's half)
  const cp = Object.assign(newCard(parent), { id: state.nextId++, copy: true, prepCopy: c.id, prepSource: c.name }); castAsHalf(cp, 1);
  state.exile.push(cp); log(`${c.name} became prepared${why ? ' (' + why + ')' : ''}: a copy of ${sp.name} is in exile; you may cast it (CR 722.3c)`); render(); return true;
}
function unprepare(c, why) {
  if (!state || !c || !c.prepared) return; delete c.prepared;
  for (const z of ['exile', 'hand']) { const i = state[z].findIndex(x => x.prepCopy === c.id); if (i >= 0) state[z].splice(i, 1); }
  log(`${c.name} is no longer prepared${why ? ' (' + why + ')' : ''}; the copy of its spell ceases to exist`);
}
const entersPrepared = c => /(?:^|[\s.])(?:~|this creature|this permanent) enters prepared\b/im.test(selfTxt(c) || '');
function preparedCastable(cp) { const f = cp && findCard(cp.prepCopy); return !!(f && f.zone === 'battlefield' && f.card.prepared && !f.card.opp); }
function castPrepared(c) {   // from the prepared creature (its menu) or from the copy in exile
  const cp = c.prepCopy !== undefined ? c : state.exile.find(x => x.prepCopy === c.id); if (!cp) { toast('Not prepared', `${c.name} is not prepared.`); return; }
  if (!canCastNow(cp)) { toast('Wrong timing', `${cp.name} follows its own timing: ${/\bInstant\b/.test(frontType(cp) || '') ? 'any time you have priority' : 'your main phase with an empty stack'}.`); return; }
  const i = state.exile.indexOf(cp); if (i < 0) return; state.exile.splice(i, 1); cp.fromExile = true; state.hand.push(cp); state.halfChosen = cp.id; castSpell(cp.id);
}
// "~ becomes prepared." / "target creature you control becomes prepared." / "prepare target creature" / "~ becomes unprepared"
function preparedOptions(tx, obj) {
  const t = String(tx || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim(); let m; const src = (obj && obj.sourceName) || 'It';
  if ((m = t.match(/^(?:if you do, )?(?:~|this creature|it) becomes (un)?prepared\.?$/i)) && obj && obj.sourceId !== undefined)
    return [{ full: true, label: `${src} becomes ${m[1] ? 'unprepared' : 'prepared'}`, fn: () => { const f = findCard(obj.sourceId); if (!f || f.zone !== 'battlefield') { log(`${src} is no longer on the battlefield`); return; } snap(); if (m[1]) unprepare(f.card, src); else becomePrepared(f.card, src); render(); } }];
  if ((m = t.match(/^(?:(?:up to one )?target creature(?: you control)? becomes (un)?prepared|(un)?prepare (?:up to one )?target creature(?: you control)?)\.?$/i))) { const un = !!(m[1] || m[2]);
    return [{ full: true, label: `${un ? 'Unprepare' : 'Prepare'} a creature`, fn: () => {
      const tg = (obj && obj.targets || []).find(q => q.id !== undefined); const go = k => { snap(); if (un) unprepare(k, src); else becomePrepared(k, src); render(); };
      if (tg) { const g = findCard(tg.id); if (g && g.zone === 'battlefield') go(g.card); return; }
      const cands = state.battlefield.filter(k => !k.opp && permTypeInfo(k).types.has('creature') && (un ? k.prepared : prepSpellOf(k) && !k.prepared));
      if (!cands.length) { toast('No creature', un ? 'None of your creatures is prepared.' : 'None of your creatures has a prepare spell that is not already prepared.'); return; }
      openPickCards({ title: `${src}: ${un ? 'unprepare' : 'prepare'} a creature`, cards: cands, max: 1, done: p => { if (p[0]) go(p[0]); } }); } }];
  }
  return null;
}
