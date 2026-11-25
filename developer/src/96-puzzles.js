// ---- v0.99.90 Puzzles: "win this turn". A puzzle is a frozen moment: your hand, your battlefield, the graveyard, both life totals,
// the turn and your Main phase 1. Solve it before the turn ends (the opponent reaches 0 life). Built-in puzzles use real cards the
// rules engine plays out; "Save this moment as a puzzle" (Game tools) freezes any position of your own games, tokens and counters included.
// Saved puzzles live in 'mtgpt.puzzles'; solved ones are remembered in 'mtgpt.puzzlesSolved'.
const PUZZLES = [
  { id: 'p-bolts', title: 'Two bolts', level: 1, opp: 6, life: 20, turn: 2, hand: ['Lightning Bolt', 'Lightning Bolt'], bf: ['Mountain', 'Mountain'], hint: 'Each Lightning Bolt can target your opponent.' },
  { id: 'p-haste', title: 'Haste makes waste', level: 2, opp: 7, life: 20, turn: 3, hand: ['Goblin Guide', 'Monastery Swiftspear', 'Lightning Bolt'], bf: ['Mountain', 'Mountain', 'Mountain'], hint: 'Both creatures have haste. Prowess only counts spells cast after the Swiftspear is on the battlefield.' },
  { id: 'p-spike', title: 'Spike and spear', level: 2, opp: 9, life: 20, turn: 3, hand: ['Lava Spike', 'Lightning Bolt'], bf: ['Monastery Swiftspear', 'Mountain', 'Mountain'], hint: 'Cast both spells before combat damage: every noncreature spell makes the Swiftspear bigger.' },
  { id: 'p-pump', title: 'Pump and prowess', level: 3, opp: 11, life: 20, turn: 4, hand: ['Giant Growth', 'Lightning Bolt'], bf: ['Monastery Swiftspear', 'Goblin Guide', 'Mountain', 'Forest'], hint: 'Grow the creature that also gets bigger from the spell itself, and send the Bolt at your opponent.' },
  { id: 'p-all', title: 'Everything at once', level: 3, opp: 13, life: 20, turn: 5, hand: ['Lightning Bolt', 'Giant Growth', 'Lava Spike'], bf: ['Grizzly Bears', 'Goblin Guide', 'Mountain', 'Mountain', 'Forest'], hint: 'Three lands, three spells, two attackers: every point counts.' }];
const PZ_KEY = 'mtgpt.puzzles', PZ_SOLVED = 'mtgpt.puzzlesSolved';
const pzSaved = () => { const l = lsGet(PZ_KEY, []); return Array.isArray(l) ? l : []; };
const pzSolved = () => lsGet(PZ_SOLVED, {}) || {};
function pzCard(x, turn) {   // a card from a puzzle: a name (built-in) or a saved card object
  const src = typeof x === 'string' ? { name: x } : x;
  const c = Object.assign(newCard(src.name), JSON.parse(JSON.stringify(src))); c.id = state.nextId++;
  if (c.counters === undefined) c.counters = { plus: 0, minus: 0 };
  if (c.enteredTurn === undefined || c.enteredTurn >= turn) c.enteredTurn = src.sick ? turn : turn - 1;
  return c;
}
function startPuzzle(p) {
  try { if (typeof hallOpen === 'function' && hallOpen()) closeHall(true); } catch (e) { /* the Library may be closed */ }
  document.querySelectorAll('#modalRoot .backdrop').forEach(x => x.remove());
  state = freshState(); undoStack = []; selected = null; bottomSel.clear(); try { lifePrev = { you: null, opp: null }; } catch (e) { /* life display */ }
  const turn = p.turn || 3; state.turn = turn; state.onPlay = true; state.phase = 'play'; state.mulls = 0; state.notedKeep = true; state.notedWin = true;
  state.life = p.life || 20; state.oppLife = p.opp || 20; state.deckName = '';
  const idMap = new Map();
  for (const x of p.bf || []) { const old = typeof x === 'object' ? x.id : null; const c = pzCard(x, turn); if (old != null) idMap.set(old, c.id); state.battlefield.push(c); }
  for (const c of state.battlefield) if (c.att != null) c.att = idMap.has(c.att) ? idMap.get(c.att) : null;
  for (const x of p.hand || []) state.hand.push(pzCard(x, turn));
  for (const x of p.gy || []) state.graveyard.push(pzCard(x, turn));
  for (const x of p.exile || []) state.exile.push(pzCard(x, turn));
  const lib = (p.lib && p.lib.length) ? p.lib : Array(20).fill('Wastes'); for (const x of lib) state.library.push(pzCard(x, turn));
  state.puzzle = { id: p.id, title: p.title, turn, hint: p.hint || '', saved: !!p.saved };
  state.log.push(`Puzzle: ${p.title}. Win this turn: your opponent is at ${state.oppLife} life.`);
  enterStep(MAIN1, true); render(); try { turnBanner(); } catch (e) {}
  toast(`Puzzle: ${p.title}`, `Win this turn. Your opponent is at ${state.oppLife} life.`);
}
// the game's end inside a puzzle: solved, or the turn ran out
function puzzleResult(won, why) {
  const pz = state && state.puzzle; if (!pz || pz.over) return; pz.over = true;
  if (won) { const s = pzSolved(); s[pz.id] = Date.now(); lsSet(PZ_SOLVED, s); }
  const m = modal(won ? 'Puzzle solved' : 'Not this time', { width: 460, sticky: true }); m.el.classList.add(won ? 'ge-win' : 'ge-loss');
  m.body.append(h('div', { class: 'ge-big', text: won ? 'Solved!' : 'Try again' }), h('div', { class: 'ge-sub', text: won ? `${pz.title}: your opponent is at ${state.oppLife} life.` : (why || `${pz.title}: your opponent survived the turn.`) }));
  const p = pzFind(pz.id);
  m.foot.append(h('button', { text: 'Puzzles', onclick: () => { m.close(); openPuzzles(); } }), p ? h('button', { class: won ? '' : 'primary', text: 'Play it again', onclick: () => { m.close(); startPuzzle(p); } }) : null,
    won && pzNext(pz.id) ? h('button', { class: 'primary', text: 'Next puzzle', onclick: () => { m.close(); startPuzzle(pzNext(pz.id)); } }) : null, h('button', { text: 'Close', onclick: () => m.close() }));
}
function pzFind(id) { return PUZZLES.find(p => p.id === id) || pzSaved().find(p => p.id === id) || null; }
function pzNext(id) { const all = PUZZLES.concat(pzSaved()), i = all.findIndex(p => p.id === id); return i >= 0 ? all.slice(i + 1).find(p => !pzSolved()[p.id]) || null : null; }
// freeze the current moment of a game as a puzzle
function savePuzzleFromGame() {
  if (!state || state.phase !== 'play') { appNotice('No game', 'Start a game first; then save any moment of it as a puzzle.'); return; }
  const strip = c => { const o = JSON.parse(JSON.stringify(c)); delete o.dmgBy; return o; };
  const m = modal('Save this moment as a puzzle', { width: 460 }); const nm = h('input', { type: 'text', value: `${state.deckName || 'Puzzle'}: turn ${state.turn}`, style: 'width:100%' });
  m.body.append(h('div', { class: 'psub', text: 'Your hand, battlefield (tokens and counters too), graveyard, exile, the top of your library and both life totals are saved. The puzzle starts in your Main phase 1 of this turn: win before the turn ends.' }), nm);
  m.foot.append(h('button', { text: 'Cancel', onclick: () => m.close() }), h('button', { class: 'primary', text: 'Save puzzle', onclick: () => {
    const p = { id: 'u-' + Date.now(), saved: true, title: nm.value.trim() || 'My puzzle', level: 0, opp: state.oppLife, life: state.life, turn: state.turn,
      hand: state.hand.map(strip), bf: state.battlefield.map(strip), gy: state.graveyard.map(strip), exile: state.exile.map(strip), lib: state.library.slice(0, 20).map(strip), hint: '' };
    const l = pzSaved(); l.push(p); lsSet(PZ_KEY, l); m.close(); toast('Puzzle saved', `${p.title}: find it in Puzzles (Library contents).`); } }));
}
function openPuzzles() {
  const m = modal('Puzzles: win this turn', { width: 620 }), list = h('div', { class: 'pz-list' });
  const row = (p, saved) => { const done = !!pzSolved()[p.id];
    return h('div', { class: 'pz-row' + (done ? ' done' : '') },
      h('div', { class: 'pz-txt' }, h('b', { text: p.title }), h('span', { class: 'small muted', text: saved ? `Saved from a game · turn ${p.turn} · opponent at ${p.opp}` : `${'★'.repeat(p.level)}${'☆'.repeat(3 - p.level)} · opponent at ${p.opp} · ${p.hand.length} cards in hand` })),
      done ? h('span', { class: 'pz-ok', text: '✓ solved' }) : h('span'),
      saved ? h('button', { class: 'danger', text: 'Delete', onclick: async () => { if (await appAsk('Delete puzzle', `Delete "${p.title}"?`, 'Delete', true)) { lsSet(PZ_KEY, pzSaved().filter(x => x.id !== p.id)); draw(); } } }) : h('span'),
      h('button', { class: 'primary', text: 'Play', onclick: () => { m.close(); startPuzzle(p); } })); };
  const draw = () => { const s = pzSaved(); list.replaceChildren(h('div', { class: 'fhead', text: 'Puzzles' }), ...PUZZLES.map(p => row(p, false)), h('div', { class: 'fhead', style: 'margin-top:12px', text: 'Your saved moments' }), ...(s.length ? s.map(p => row(p, true)) : [h('div', { class: 'small muted', text: 'In any game, Game tools → Save this moment as a puzzle.' })])); };
  m.body.append(h('p', { class: 'small muted', text: 'Each puzzle starts in your main phase with everything set out. Find the line that brings your opponent to 0 before the turn ends. The rules engine plays it out with you.' }), list);
  m.foot.append(h('button', { text: 'Close', onclick: () => m.close() })); draw();
}
// the bar over the table while a puzzle is on
function drawPuzzleBar() {
  let bar = document.getElementById('puzzleBar'); const pz = state && state.puzzle;
  // the puzzle ends the moment a life total reaches 0, however it got there (spells, combat, triggers)
  if (pz && !pz.over && !pz.ending && state.phase === 'play' && (state.oppLife <= 0 || state.life <= 0)) { pz.ending = true; const won = state.oppLife <= 0; setTimeout(() => { if (state && state.puzzle === pz && !pz.over) puzzleResult(won); }, 1200); }
  if (!pz || state.phase !== 'play') { if (bar) bar.remove(); return; }
  if (!bar) { bar = h('div', { id: 'puzzleBar' }); document.body.append(bar); }
  const p = pzFind(pz.id);
  bar.replaceChildren(h('b', { text: `Puzzle: ${pz.title}` }), h('span', { text: `Win this turn — opponent at ${state.oppLife}` }),
    pz.hint ? h('button', { text: 'Hint', onclick: () => toast('Hint', pz.hint) }) : null, p ? h('button', { text: 'Restart', onclick: () => startPuzzle(p) }) : null, h('button', { text: 'Puzzles', onclick: () => openPuzzles() }));
}

document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('#btnSavePuzzle, #btnPuzzles'); if (!b) return; try { document.getElementById('gameMenu').hidden = true; } catch (er) {} if (b.id === 'btnSavePuzzle') savePuzzleFromGame(); else openPuzzles(); });
