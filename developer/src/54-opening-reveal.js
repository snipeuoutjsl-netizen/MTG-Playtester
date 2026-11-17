// ---------------------------------------------------------------- v0.96.26 opening-hand reveal (CR 103.6 / Chancellor-style cards), read from the rules text
// CR 103.6: "...a player may take any special actions that let a card begin the game ... before the first turn."  The wording is:
//   "You may reveal this card from your opening hand. If you do, at the beginning of your first upkeep, <effect>."   (Chancellor of the Annex, Devourer of Destiny, ...)
// The pre-game screen offers a Reveal button for every such card; at your first upkeep the effect is put on the stack.
const OPEN_REVEAL_RE = /^You may reveal ~ from your opening hand\. If you do, (?:at the beginning of your first upkeep, )?(.+)$/i;
function openingReveal(c) { if (!c || c.token) return null; for (const ln of selfTxt(c).split('\n')) { const m = ln.trim().match(OPEN_REVEAL_RE); if (m) return { text: m[1].replace(/\s+$/, ''), upkeep: /at the beginning of your first upkeep/i.test(ln) }; } return null; }
function pregameReveal(id) {
  if (!state || state.phase !== 'pregame') return; const f = findCard(id); if (!f || f.zone !== 'hand' || !openingReveal(f.card) || f.card.revealedOpening) return;
  snap(); f.card.revealedOpening = true; log(`Pre-game: revealed ${f.card.name} from your opening hand; its effect happens at the beginning of your first upkeep`); render();
}
function openingRevealTriggers() {
  if (!state) return;
  for (const c of state.hand) if (c.revealedOpening) {
    const r = openingReveal(c); delete c.revealedOpening; if (!r) continue;
    state.pendingTriggers.push({ kind: 'ability', cardId: c.id, cardName: c.name, special: 'openingReveal', text: `Opening-hand reveal — At the beginning of your first upkeep, ${r.text}`, effect: r.text, why: `You revealed ${c.name} from your opening hand.` });
  }
}
// "Look at the top four cards of your library. You may put one of those cards back on top of your library. Exile the rest."
function openingRevealEffect(obj, done) {
  const m = String(obj.effect || obj.text).match(/look at the top (\w+) cards? of your library\. You may put one of those cards back on top of your library\. Exile the rest/i); if (!m) return false;
  const n = wordN(m[1]), top = state.library.slice(0, n); if (!top.length) { log(`${obj.cardName || obj.sourceName}: your library is empty`); if (done) done(); return true; }
  openPickCards({ title: `${obj.cardName || obj.sourceName}: put one back on top`, cards: top, max: 1, min: 0, note: `Look at the top ${top.length}. You may put one back on top of your library; the rest are exiled.`, done: picked => {
    snap(); const keep = picked && picked[0] ? picked[0].id : null;
    for (const c of top) { if (c.id === keep) continue; const i = state.library.findIndex(x => x.id === c.id); if (i >= 0) { const [x] = state.library.splice(i, 1); state.exile.push(x); } }
    log(`${obj.cardName || obj.sourceName}: ${keep ? 'one card stays on top, ' : ''}${top.length - (keep ? 1 : 0)} exiled`); render(); if (done) done(); } });
  return true;
}
