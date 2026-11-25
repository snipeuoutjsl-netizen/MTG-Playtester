// ---- v0.99.89 Game recap: each game is written down as it is played (state.recap, so Undo takes it back too), and when the game
// ends it becomes an inked page: the kill turn, a chart of the damage dealt each turn, what you played each turn and your best turn.
// The last 20 pages of each deck are kept with its Librarian's notes ('mtgpt.deckNotes'[deck].recaps) and can be reopened from its book.
function recapNote(kind, v) {
  if (!state || state.phase !== 'play') return;
  const rc = state.recap || (state.recap = { onPlay: !!state.onPlay, mulls: state.mulls || 0, start: Date.now(), turns: {} });
  const t = state.turn || 1, T = rc.turns[t] || (rc.turns[t] = { dmg: 0, lost: 0, gain: 0, cast: [], lands: [], opp: state.oppLife, life: state.life });
  if (kind === 'opp' && v < 0) T.dmg += -v;
  else if (kind === 'life') { if (v < 0) T.lost += -v; else T.gain += v; }
  else if (kind === 'cast' && v) T.cast.push(v);
  else if (kind === 'land' && v) T.lands.push(v);
}
function recapFinish(won, why) {
  if (!state || !state.recap || state.recap.done) return state && state.recap;
  const rc = state.recap; rc.done = true; rc.won = !!won; rc.turn = state.turn; rc.why = why || ''; rc.end = Date.now(); rc.deck = state.deckName || '';
  rc.lifeEnd = state.life; rc.oppEnd = state.oppLife;
  if (rc.deck) updateNotes(rc.deck, n => { n.recaps = n.recaps || []; n.recaps.push(rc); if (n.recaps.length > 20) n.recaps.shift(); });
  return rc;
}
// the page itself
function recapEl(rc) {
  const turns = Object.keys(rc.turns || {}).map(Number).sort((a, b) => a - b), last = Math.max(rc.turn || 1, ...turns, 1);
  const first = turns.length ? Math.min(...turns) : 1, rows = []; for (let t = first; t <= last; t++) rows.push(Object.assign({ t, dmg: 0, cast: [], lands: [] }, (rc.turns || {})[t] || {}));
  const total = rows.reduce((a, r) => a + r.dmg, 0), best = rows.reduce((b, r) => r.dmg > (b ? b.dmg : 0) ? r : b, null);
  const W = 460, H = 128, pad = 22, bw = Math.min(46, (W - pad * 2) / rows.length - 6), maxD = Math.max(1, ...rows.map(r => r.dmg));
  let bars = '', labels = '';
  rows.forEach((r, i) => { const x = pad + i * ((W - pad * 2) / rows.length) + 3, hgt = Math.round((H - 34) * r.dmg / maxD), y = H - 18 - hgt;
    bars += `<rect x="${x.toFixed(1)}" y="${y}" width="${bw.toFixed(1)}" height="${hgt}" rx="2" fill="${best && r.t === best.t ? '#8e1f0b' : '#5b3a1e'}" opacity="${r.dmg ? .9 : .25}"/>`;
    if (r.dmg) bars += `<text x="${(x + bw / 2).toFixed(1)}" y="${y - 4}" text-anchor="middle" font-size="11" fill="#2b1a0c">${r.dmg}</text>`;
    labels += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 4}" text-anchor="middle" font-size="10.5" fill="#5a4630">T${r.t}</text>`; });
  const chart = h('div', { class: 'rc-chart' }); chart.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Damage dealt each turn"><line x1="${pad}" y1="${H - 18}" x2="${W - pad}" y2="${H - 18}" stroke="#8a7350" stroke-width="1"/>${bars}${labels}</svg>`;
  const head = rc.won ? `Won on turn ${rc.turn}` : rc.done ? `Lost on turn ${rc.turn}` : `Turn ${rc.turn || last}, still playing`;
  return h('div', { class: 'recap-page' },
    h('div', { class: 'rc-title', text: head }),
    h('div', { class: 'rc-sub', text: `${rc.deck ? rc.deck + ' · ' : ''}${rc.onPlay ? 'on the play' : 'on the draw'} · ${rc.mulls ? 'mulliganed to ' + (7 - rc.mulls) : 'kept seven'}${rc.why ? ' · ' + rc.why : ''}` }),
    h('div', { class: 'rc-h', text: `Damage to your opponent: ${total}` }), chart,
    best && best.dmg ? h('div', { class: 'rc-best', text: `Best turn: turn ${best.t}, ${best.dmg} damage${best.cast.length ? ' (' + best.cast.join(', ') + ')' : ''}.` }) : null,
    h('div', { class: 'rc-h', text: 'Turn by turn' }),
    h('div', { class: 'rc-turns' }, ...rows.map(r => h('div', { class: 'rc-turn' }, h('b', { text: `T${r.t}` }),
      h('span', { text: [r.lands.length ? r.lands.join(', ') : null, r.cast.length ? r.cast.join(', ') : null].filter(Boolean).join(' · ') || '—' }),
      r.dmg ? h('i', { text: `${r.dmg} dmg` }) : h('i')))));
}
function openRecap(rc) { const m = modal('Game recap', { width: 560 }); m.body.append(recapEl(rc)); m.foot.append(h('button', { class: 'primary', text: 'Close', onclick: () => m.close() })); }
// the deck's last games, as a line of small links for its Librarian's notes
function recapListEl(name) {
  const n = deckNotes(name), l = (n && n.recaps) || []; if (!l.length) return null;
  return h('div', { class: 'rc-list' }, h('span', { text: 'Recent games: ' }), ...l.slice(-6).reverse().map(rc => h('button', { class: 'hall-btn hall-ink rc-link' + (rc.won ? ' won' : ''), title: 'Open the recap of this game', text: `${rc.won ? 'W' : 'L'} T${rc.turn}`, onclick: e => { e.stopPropagation(); openRecap(rc); } })));
}
