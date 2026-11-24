// ---- "Can't be countered" (CR 101.2, 701.6a, 614): one engine-level check used by every counter effect and by the stack buttons.
// Sources: (1) the spell's own text, "This spell can't be countered" (and "... can't be countered by spells or abilities");
// (2) a static ability of a permanent you control: "Spells you control can't be countered", "Creature spells you cast can't be countered", "Green spells you control ...", "Creature spells you cast of the chosen type ..." (Allosaurus Shepherd, Cavern-style statics);
// (3) mana: Cavern of Souls mana says "... and that spell can't be countered", so a spell paid for with it (c.noCounterMana) can't be countered.
// Returns '' when the object can be countered, otherwise a short reason.
function noteUncounterableMana(spell, manaIds) {
  if (!spell || spell.ability) return; delete spell.noCounterMana;
  for (const id of (manaIds || [])) { const f = findCard(id); if (!f || f.zone !== 'battlefield') continue; let ab = []; try { ab = landManaAbilities(f.card) || []; } catch (e) { ab = []; }
    for (const a of ab) if (a.noCounter && spendOnlyOk(a.only, spell) && (!a.ncOn || spendOnlyOk(a.ncOn, spell))) { spell.noCounterMana = f.card.name; log(`${spell.name}: paid with mana from ${f.card.name}, so it can't be countered`); return; } }
}
function spellTypeWords(sc) { const t = (sc.token ? '' : ((cardInfo(sc.name) || {}).t || '')).split(' // ')[0]; const [a, b] = t.split('—'); return { types: new Set(String(a || '').toLowerCase().split(/\s+/).filter(Boolean)), subs: new Set(String(b || '').toLowerCase().split(/\s+/).filter(Boolean)), changeling: /\bchangeling\b/i.test((cardInfo(sc.name) || {}).tx || '') }; }
function cantBeCounteredWhy(sc) {
  if (!state || !sc || sc.ability || sc.opp) return '';
  if (sc.noCounterMana) return `it was cast with mana from ${sc.noCounterMana}`;
  const own = String(cardText(sc) || '').replace(/[’]/g, "'").replace(selfNameRe(sc.name), '~');
  if (/(?:this spell|this card|~) can'?t be countered(?: by spells or abilities)?\b/i.test(own) && !/^[^.]*\bspells? you (?:control|cast)\b/im.test(own)) return `${sc.name} says it can't be countered`;
  const tw = spellTypeWords(sc), cols = (cardInfo(sc.name) || {}).col || [], CN = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' };
  for (const g of state.battlefield) {
    for (const ln of String(cardText(g) || '').replace(/[’]/g, "'").split('\n')) {
      const m = /^(?:(.+?) spells?|Spells?) you (?:control|cast)(?: of the chosen type)? can'?t be countered\.?$/i.exec(ln.trim()); if (!m) continue;
      const chosen = /of the chosen type/i.test(ln), filt = (m[1] || '').toLowerCase().trim();
      if (chosen && !(g.chosen && (tw.subs.has(String(g.chosen).toLowerCase()) || tw.changeling))) continue;
      let ok = true; for (const w of filt.split(/\s+/).filter(Boolean)) { if (w === 'and' || w === 'or') continue; const neg = /^non/.test(w) ? w.slice(3) : null;
        const has = x => tw.types.has(x) || tw.subs.has(x) || cols.some(c => CN[c] === x); ok = ok && (neg ? !has(neg) : has(w)); }
      if (ok) return `${g.name}: ${ln.trim().replace(/\.$/, '')}`;
    }
  }
  return '';
}
