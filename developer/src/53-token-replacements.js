// ---------------------------------------------------------------- v0.96.25 token-creation replacement effects (rules text)
// CR 614.1 + CR 111.1: "If an effect would create one or more [creature] tokens under your control, it creates twice that many of those tokens instead."  (Doubling Season, Parallel Lives, Anointed Procession)
//                      "... it creates that many plus one/two of those tokens instead."
// Read from the words of every permanent you control, so any card worded this way works. Several such effects are applied in the order that gives the most tokens (CR 616.1).
const TOKEN_REPL_RE = /^If (?:an effect would create one or more (creature |artifact |food |treasure )?tokens under your control, (?:it|they) creates? (twice that many|that many plus (one|two|three|\d+)) (?:of those tokens|[a-z ]*tokens?)(?: [^.]*)? instead|one or more (creature |artifact |food |treasure )?tokens would be created under your control, (twice that many|that many plus (one|two|three|\d+)) (?:of those tokens|[a-z ]*tokens?) (?:are|is) created instead)\.?$/i;   // v0.99.94 also the newer wording (Elspeth, Storm Slayer)
function tokenReplLine(line) { return TOKEN_REPL_RE.test(String(line || '').trim()); }
function adjustTokenCount(n, d, src) {
  if (!state || n <= 0) return n;
  const types = new Set((d && d.types || []).map(x => String(x).toLowerCase())), effects = [];
  for (const g of state.battlefield) {
    if (g.token) continue; const tx = String(cardText(g) || '').replace(/\([^)]*\)/g, '');
    if (!/would create one or more|tokens would be created under your control/i.test(tx)) continue;
    for (const ln of tx.split('\n')) {
      const m0 = ln.trim().match(TOKEN_REPL_RE); if (!m0) continue; const m = [m0[0], m0[1] || m0[4], m0[2] || m0[5], m0[3] || m0[6]];   // the second wording's groups line up with the first's
      const kind = (m[1] || '').trim().toLowerCase(); if (kind && kind !== 'creature' && !types.has(kind) && !(d && String(d.name || '').toLowerCase() === kind)) continue;
      if (kind === 'creature' && !types.has('creature')) continue;
      if (/^twice/i.test(m[2])) effects.push({ src: g, label: '×2', f: v => v * 2 }); else { const add = wordN(m[3]); effects.push({ src: g, label: '+' + add, f: v => v + add }); }
    }
  }
  if (!effects.length) return n;
  const r = applyReplacements(effects, n, null, 'token', 'token');
  if (teach('replaceNotes')) log(`Replacement effect${effects.length > 1 ? 's' : ''} (rule 614): ${n} ${(d && d.name) || ''} token${n === 1 ? '' : 's'} would be created${src ? ' by ' + src : ''}; ${r.order.map(e => `${e.src.name}: ${e.label}`).join(', then ')} → ${r.value}`);
  return r.value;
}
