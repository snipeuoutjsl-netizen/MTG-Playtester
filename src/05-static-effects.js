// ---------------------------------------------------------------- static effects (Necrodominance, Rest in Peace, ...)
function staticFx() {
  const fx = { skipDraw: null, maxHand: 7, gyExile: null };
  if (!state) return fx;
  const W = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  for (const c of state.battlefield) {
    const tx = cardText(c);
    if (!tx) continue;
    if (/\bskip your draw step\b/i.test(tx)) fx.skipDraw = fx.skipDraw || c.name;
    if (/you have no maximum hand size/i.test(tx)) fx.maxHand = Infinity;
    const m = tx.match(/your maximum hand size is (\w+)/i);
    if (m) { const v = W[m[1].toLowerCase()] !== undefined ? W[m[1].toLowerCase()] : parseInt(m[1], 10); if (!isNaN(v) && v < fx.maxHand) fx.maxHand = v; }
    if (/would be put into (?:your |a )?graveyard from anywhere, exile/i.test(tx)) fx.gyExile = fx.gyExile || c.name;
  }
  return fx;
}
