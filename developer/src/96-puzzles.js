// ---- v0.99.90 Puzzles: "win this turn". A puzzle is a frozen moment: your hand, your battlefield, the graveyard, both life totals,
// the turn and your Main phase 1. Solve it before the turn ends (the opponent reaches 0 life). Built-in puzzles use real cards the
// rules engine plays out; "Save this moment as a puzzle" (Game tools) freezes any position of your own games, tokens and counters included.
// Saved puzzles live in 'mtgpt.puzzles'; solved ones are remembered in 'mtgpt.puzzlesSolved'.
const PUZZLES = [
  { id: 'p-bolts', title: 'Two bolts', level: 1, opp: 6, life: 20, turn: 2, hand: ['Lightning Bolt', 'Lightning Bolt'], bf: ['Mountain', 'Mountain'], hint: 'Each Lightning Bolt can target your opponent.' },
  { id: 'p-haste', title: 'Haste makes waste', level: 2, opp: 7, life: 20, turn: 3, hand: ['Goblin Guide', 'Monastery Swiftspear', 'Lightning Bolt'], bf: ['Mountain', 'Mountain', 'Mountain'], hint: 'Both creatures have haste. Prowess only counts spells cast after the Swiftspear is on the battlefield.' },
  { id: 'p-spike', title: 'Spike and spear', level: 2, opp: 9, life: 20, turn: 3, hand: ['Lava Spike', 'Lightning Bolt'], bf: ['Monastery Swiftspear', 'Mountain', 'Mountain'], hint: 'Cast both spells before combat damage: every noncreature spell makes the Swiftspear bigger.' },
  { id: 'p-pump', title: 'Pump and prowess', level: 3, opp: 11, life: 20, turn: 4, hand: ['Giant Growth', 'Lightning Bolt'], bf: ['Monastery Swiftspear', 'Goblin Guide', 'Mountain', 'Forest'], hint: 'Grow the creature that also gets bigger from the spell itself, and send the Bolt at your opponent.' },
  { id: 'p-all', title: 'Everything at once', level: 3, opp: 13, life: 20, turn: 5, hand: ['Lightning Bolt', 'Giant Growth', 'Lava Spike'], bf: ['Grizzly Bears', 'Goblin Guide', 'Mountain', 'Mountain', 'Forest'], hint: 'Three lands, three spells, two attackers: every point counts.' },
  // v0.99.107 more puzzles, each about a different part of the game (every one is played out by the tests to prove it can be solved)
  { id: 'p-double', title: 'Double trouble', level: 2, opp: 10, life: 20, turn: 3, hand: ['Temur Battle Rage', 'Giant Growth'], bf: ['Goblin Guide', 'Mountain', 'Mountain', 'Forest'], hint: 'Double strike deals combat damage twice. Make the creature as big as you can first.' },
  { id: 'p-landfall', title: 'Every land counts twice', level: 2, opp: 9, life: 20, turn: 4, hand: ['Arid Mesa'], bf: ['Plated Geopede', 'Steppe Lynx', 'Mountain'], lib: ['Mountain', 'Plains', 'Wastes', 'Wastes', 'Wastes'], hint: 'A fetch land is a land entering, and the land it fetches is another one. Both creatures have landfall.' },
  { id: 'p-cascade', title: 'Cascade order', level: 2, opp: 8, life: 20, turn: 4, hand: ['Bloodbraid Elf', 'Monastery Swiftspear'], bf: ['Mountain', 'Mountain', 'Mountain', 'Forest', 'Forest'], lib: ['Mountain', 'Lightning Bolt', 'Wastes', 'Wastes', 'Wastes'], hint: 'Cascade casts the first cheaper spell on top of your library for free. A spell cast by cascade is still cast: what else notices that?' },
  { id: 'p-snap', title: 'Back from the graveyard', level: 2, opp: 8, life: 20, turn: 4, hand: ['Snapcaster Mage', 'Lava Spike'], gy: ['Lightning Bolt'], bf: ['Goblin Guide', 'Island', 'Mountain', 'Mountain', 'Mountain'], hint: 'Snapcaster Mage gives a spell in your graveyard flashback. Count your mana: you need all four lands.' },
  { id: 'p-dungeon', title: 'The trap is set', level: 2, opp: 8, life: 20, turn: 5, hand: ['Find the Path', 'Lightning Bolt'], bf: ['Forest', 'Forest', 'Mountain', 'Mountain'], dungeon: { name: 'Undercity', room: 'Forge', path: ['Secret Entrance', 'Forge'] }, hint: 'You are in Undercity, on Forge (the Dungeon panel shows the map). Venturing moves your marker one room down: choose the room that hurts.' },
  { id: 'p-storm', title: 'Storm warning', level: 3, opp: 4, life: 20, turn: 3, hand: ['Lotus Petal', 'Desperate Ritual', 'Manamorphose', 'Grapeshot'], bf: ['Mountain', 'Mountain'], hint: 'Grapeshot is copied once for each spell cast before it this turn. Rituals pay for themselves; keep two mana for the finisher.' },
  { id: 'p-fireblast', title: 'Burn the boats', level: 3, opp: 14, life: 20, turn: 4, hand: ['Fireblast', 'Lightning Bolt', 'Lava Spike'], bf: ['Monastery Swiftspear', 'Mountain', 'Mountain', 'Mountain', 'Mountain'], hint: 'Fireblast can be cast by sacrificing two Mountains instead of paying its cost. Every spell also grows the Swiftspear: attack after casting them.' },
  { id: 'p-fiend', title: 'Feed the fiend', level: 3, opp: 16, life: 20, turn: 4, hand: ['Desperate Ritual', 'Manamorphose', 'Manamorphose', 'Lava Spike'], bf: ['Kiln Fiend', 'Mountain', 'Mountain'], hint: 'Kiln Fiend gets +3/+0 for every instant or sorcery you cast. Manamorphose gives back the mana it costs.' }];
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
// v0.99.102 a puzzle's cards are usually not in your decks, so the app had no card data or pictures for them (they showed as plain text
// placeholders, and without card data the rules could not read them). Starting a puzzle now fetches what is missing from Scryfall, the same
// way a deck import does: card data first (the puzzle waits for it), pictures after (they fill in while you play).
function pzNames(p) { return [...new Set([].concat(p.hand || [], p.bf || [], p.gy || [], p.exile || [], p.lib || []).map(x => typeof x === 'string' ? x : x && !x.token ? x.faceOf || x.name : null).filter(Boolean))]; }
let pzFetching = false;
function startPuzzle(p) {
  const names = pzNames(p), noData = names.filter(n => !cardInfo(n));
  if (!noData.length || navigator.onLine === false || pzFetching) { startPuzzle0(p); if (noData.length && navigator.onLine === false) toast('Puzzle cards offline', `No card data yet for ${noData.join(', ')}. Connect to the internet once so the puzzle's cards can be looked up.`); pzPictures(names); return; }
  pzFetching = true; toast(`Puzzle: ${p.title}`, `Looking up ${noData.length} card${noData.length === 1 ? '' : 's'} for this puzzle…`);
  (async () => { try { for (let i = 0; i < 40 && imgJob.running; i++) await sleep(250); await downloadImages(noData); } catch (e) { /* started below either way */ } finally { pzFetching = false; }
    startPuzzle0(p); const still = names.filter(n => !cardInfo(n)); if (still.length) toast('Some puzzle cards were not found', `${still.join(', ')}: ${lastNetReason || 'Scryfall could not be reached.'}`); pzPictures(names); })();
}
async function pzPictures(names) {
  try { if (await loadCachedImages(names)) render(); const miss = names.filter(n => !IMG.has(imgKey(n)));
    if (miss.length && navigator.onLine !== false && typeof autoImages !== 'undefined' && autoImages) { for (let i = 0; i < 40 && imgJob.running; i++) await sleep(250); await downloadImages(miss); render(); } } catch (e) { /* pictures are optional */ }
}
function startPuzzle0(p) {
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
  if (p.dungeon) state.dungeon = JSON.parse(JSON.stringify(p.dungeon));   // v0.99.107 a puzzle may start with your venture marker in a dungeon
  if (p.gs) state.gs = Object.assign(state.gs || {}, JSON.parse(JSON.stringify(p.gs)));
  state.puzzle = { id: p.id, title: p.title, turn, hint: p.hint || '', saved: !!p.saved };
  state.log.push(`Puzzle: ${p.title}. Win this turn: your opponent is at ${state.oppLife} life.`);
  enterStep(MAIN1, true); render(); try { turnBanner(); } catch (e) {}
  toast(`Puzzle: ${p.title}`, `Win this turn. Your opponent is at ${state.oppLife} life.`);
}
// the game's end inside a puzzle: solved, or the turn ran out
function puzzleResult(won, why) {
  const pz = state && state.puzzle; if (!pz || pz.over) return; pz.over = true;
  let packNow = false;
  if (won) { const s = pzSolved(); packNow = !s[pz.id] && !pz.saved; s[pz.id] = Date.now(); lsSet(PZ_SOLVED, s); if (packNow) earnPack(`you solved the puzzle "${pz.title}"`, pz.id); }   // v0.99.106 the first solve of each puzzle earns a pack
  const m = modal(won ? 'Puzzle solved' : 'Not this time', { width: 460, sticky: true }); m.el.classList.add(won ? 'ge-win' : 'ge-loss');
  m.body.append(h('div', { class: 'ge-big', text: won ? 'Solved!' : 'Try again' }), h('div', { class: 'ge-sub', text: won ? `${pz.title}: your opponent is at ${state.oppLife} life.` : (why || `${pz.title}: your opponent survived the turn.`) }));
  if (packNow) m.body.append(h('button', { class: 'ge-pack', title: 'Tear open the pack this puzzle earned (it is kept if you open it later)', onclick: () => { m.close(); openPackScreen(); } }, h('span', { class: 'ge-pack-i', 'aria-hidden': 'true' }), h('b', { text: 'First solve: you earned a pack' }), h('span', { text: 'Tear it open' })));
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
      hand: state.hand.map(strip), bf: state.battlefield.map(strip), gy: state.graveyard.map(strip), exile: state.exile.map(strip), lib: state.library.slice(0, 20).map(strip), hint: '', dungeon: state.dungeon ? JSON.parse(JSON.stringify(state.dungeon)) : undefined, gs: state.gs && (state.gs.dungeonsDone || state.gs.init || state.gs.monarch) ? { dungeonsDone: state.gs.dungeonsDone, init: state.gs.init, monarch: state.gs.monarch } : undefined };
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
  if (!pz || pz.over || state.phase !== 'play') { if (bar) bar.remove(); return; }   // v0.99.105 a finished puzzle (solved or not) has no bar
  if (!bar) { bar = h('div', { id: 'puzzleBar' }); document.body.append(bar); }
  const p = pzFind(pz.id);
  bar.replaceChildren(h('b', { text: `Puzzle: ${pz.title}` }), h('span', { text: `Win this turn — opponent at ${state.oppLife}` }),
    pz.hint ? h('button', { text: 'Hint', onclick: () => toast('Hint', pz.hint) }) : null, p ? h('button', { text: 'Restart', onclick: () => startPuzzle(p) }) : null, h('button', { text: 'Puzzles', onclick: () => openPuzzles() }));
}

document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('#btnSavePuzzle, #btnPuzzles'); if (!b) return; try { document.getElementById('gameMenu').hidden = true; } catch (er) {} if (b.id === 'btnSavePuzzle') savePuzzleFromGame(); else openPuzzles(); });
