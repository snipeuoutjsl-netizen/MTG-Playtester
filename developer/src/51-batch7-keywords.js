// ---------------------------------------------------------------- v0.96.23 keyword batch 7 (rules text): Hideaway, Undaunted, Encore
// CR 702.75a Hideaway N: "When this permanent enters, look at the top N cards of your library. You may exile one of them face down. Put the rest on the bottom of your library in a random order."
// CR 702.75b "[Do something] with the exiled card" refers to the card exiled by that permanent's hideaway; the card may be played (CR 702.75c) when the permanent's own condition is met.
// CR 702.125a Undaunted: "This spell costs {1} less to cast for each opponent you have." (goldfish: one opponent)  [in costAdjustments, 08]
// CR 702.141a Encore [cost]: "[Cost], Exile this card from your graveyard: For each opponent, create a token that's a copy of it that attacks that opponent this turn if able. They gain haste. Sacrifice them at the beginning of the next end step. Activate only as a sorcery." [in useGyAbility, 44]
KW_TRIGGERS.push(
  { cr: '702.75', kw: 'hideaway', ev: 'etb-self', cond: 'Hideaway: when this permanent enters', text: 'When this permanent enters, look at the top N cards of your library. You may exile one of them face down. Put the rest on the bottom of your library in a random order.' }
);
KW_EFFECTS['hideaway'] = obj => {
  const n = obj.n || 4;
  return [{ full: true, label: `Look at the top ${n} cards, exile one face down, the rest on the bottom`, fn: () => {
    const top = state.library.slice(0, n); if (!top.length) { log(`${obj.sourceName}: hideaway, but your library is empty`); return; }
    const finish = chosen => {
      snap(); const keep = chosen && state.library.find(x => x.id === chosen.id);
      let rest = state.library.splice(0, top.length).filter(x => !keep || x.id !== keep.id);
      for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }   // random order (CR 702.75a)
      state.library.push(...rest);
      if (keep) { keep.hiddenBy = obj.sourceId; keep.faceDown = true; state.exile.push(keep); log(`${obj.sourceName}: hideaway, exiled a card face down; ${rest.length} went to the bottom of your library in a random order`); }
      else log(`${obj.sourceName}: hideaway, no card exiled; ${rest.length} went to the bottom of your library in a random order`);
      render();
    };
    openPickCards({ title: `${obj.sourceName}: hideaway ${n}`, cards: top, max: 1, min: 0, note: 'Exile one face down (optional). The rest go to the bottom in a random order.', done: picked => finish(picked && picked[0]) });
  } }];
};
// "You may play the exiled card without paying its mana cost" once the permanent's condition is met (CR 702.75c): a land is put onto the battlefield, anything else is cast free.
function hideawayPlay(srcId) {
  if (!state) return; const cards = state.exile.filter(x => x.hiddenBy === srcId); if (!cards.length) { toast('Nothing hidden', 'This permanent has no card exiled with hideaway.'); return; }
  const go = c => {
    delete c.hiddenBy; delete c.faceDown;
    if (/\bLand\b/.test(frontType(c) || '')) { moveCard(c.id, 'battlefield'); log(`Hideaway: played ${c.name} from exile`); render(); }
    else suspendCastFree(c.id, null, 'Hideaway');
  };
  if (cards.length === 1) go(cards[0]); else openPickCards({ title: 'Hideaway: play which exiled card?', cards, max: 1, min: 1, done: p => { if (p[0]) go(p[0]); } });
}
