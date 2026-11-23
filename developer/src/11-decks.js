// ---------------------------------------------------------------- decks
const SAMPLE = `4 Ancient Stirrings
4 Wild Nacatl
4 Dryad of the Ilysian Grove
4 Territorial Kavu
4 Scion of Draco
4 Leyline Binding
4 Leyline of the Guildpact
4 Lightning Bolt
3 Bonecrusher Giant
2 Tribal Flames
4 Wooded Foothills
4 Flooded Strand
3 Arid Mesa
2 Overgrown Tomb
3 Stomping Ground
1 Temple Garden
1 Breeding Pool
1 Blood Crypt
1 Hallowed Fountain
1 Steam Vents
1 Indatha Triome
1 Raugrin Triome

Sideboard
3 Kitchen Finks
2 Thragtusk
2 Wurmcoil Engine
2 Lightning Helix
3 Scavenging Ooze
3 Leyline of the Void`;

function parseDeck(text) {
  const main = [], side = [];
  let cur = main, blankUsed = false, inCmd = false;
  const hasSideHeader = /^\s*(sideboard|side)\s*:?\s*$/im.test(text);
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line) {
      if (inCmd) { inCmd = false; continue; }   // a blank line ends the Commander block (the rest is the main deck)
      if (!hasSideHeader && !blankUsed && main.length) { cur = side; blankUsed = true; }
      continue;
    }
    if (/^(\/\/|#)/.test(line)) continue;
    if (/^commander\s*:?$/i.test(line)) { cur = main; inCmd = true; continue; }   // v0.99.29 the cards under a Commander header are flagged (cmd:true); they stay in main unless Commander mode is on
    if (/^(deck|mainboard|main|companion)\s*:?$/i.test(line)) { cur = main; inCmd = false; continue; }
    if (/^(sideboard|side)\s*:?$/i.test(line)) { cur = side; inCmd = false; continue; }
    let target = cur;
    let m = line.match(/^SB:\s*(.*)$/i);
    if (m) { target = side; line = m[1]; }
    m = line.match(/^(\d+)\s*x?\s+(.+)$/i);
    let qty = 1, name = line;
    if (m) { qty = parseInt(m[1], 10); name = m[2]; }
    const isCmd = (inCmd && cur === main && target === main) || /\*cmdr\*|\[commander\b/i.test(line);
    name = name.replace(/\s*\[[^\]]*\]\s*$/, '').replace(/\s*\([A-Za-z0-9]{2,6}\)\s*[\w★-]*\s*$/, '').replace(/\s*\*[A-Za-z]+\*\s*$/, '').trim();
    if (!name || !(qty > 0)) continue;
    if (isCmd && target === main) target.push({ qty, name, cmd: true }); else target.push({ qty, name });
  }
  return { main, side };
}

const sum = list => list.reduce((a, c) => a + c.qty, 0);
function loadDecks() { return lsGet('mtgpt.decks', {}); }
function saveDecks(d) { lsSet('mtgpt.decks', d); }
function currentDeckName() { return lsGet('mtgpt.current', null); }

// v0.99.29 game modes: Commander decks (a Commander section in the list) live in their own tab and are only listed in Commander mode; the mode is chosen on the deck selection screen.
function deckIsCommander(d) { try { return !!d && parseDeck(d.text).main.some(x => x.cmd); } catch (e) { return false; } }
function gameMode() { return FEATURES.commander && lsGet('mtgpt.mode', 'standard') === 'commander' ? 'commander' : 'standard'; }
function setGameMode(m) { lsSet('mtgpt.mode', m === 'commander' ? 'commander' : 'standard'); }
function decksInMode(decks, mode) { return Object.keys(decks).filter(n => (FEATURES.commander && deckIsCommander(decks[n]) ? 'commander' : 'standard') === mode); }
function refreshDeckSelect() {
  const sel = $('#deckSelect');
  const decks = loadDecks();
  { const cn = currentDeckName(); if (FEATURES.commander && cn && decks[cn]) { const k = deckIsCommander(decks[cn]) ? 'commander' : 'standard'; if (k !== gameMode() && lsGet('mtgpt.modeKeep', false) !== true) setGameMode(k); } }   // saving or importing a deck of the other kind switches to that mode so it is visible
  const names = decksInMode(decks, gameMode()).sort((a, b) => a.localeCompare(b));
  sel.replaceChildren();
  if (!names.length) sel.append(h('option', { value: '', text: '(no decks yet)' }));
  for (const n of names) sel.append(h('option', { value: n, text: n }));
  const cur = currentDeckName();
  if (cur && names.includes(cur)) sel.value = cur;
  else if (names.length) { sel.value = names[0]; lsSet('mtgpt.current', names[0]); }
  else if (cur && decks[cur]) lsSet('mtgpt.current', '');   // the chosen deck belongs to the other mode
  if (typeof applyUiTheme === 'function' && settings.uiTheme === 'deck') applyUiTheme();
  const dc = $('#deckCur'); if (dc) dc.textContent = names.length ? (sel.value || names[0]) : 'No decks yet';
  newGameCue();
}
// v0.99.47 the deck you picked is not the one on the table yet: the New Game button glows until you start a game with it
function newGameCue() {
  const b = $('#btnNew'); if (!b) return; const cur = currentDeckName(), on = !!(state && state.deckName && cur && cur !== state.deckName);
  b.classList.toggle('pending', on);
  b.title = on ? `Start a new game with ${cur} (the game on the table is using ${state.deckName})` : 'Start a new game with the selected deck';
}

function getCurrentDeck() {
  const decks = loadDecks();
  const n = currentDeckName();
  if (!n || !decks[n]) return null;
  const sb = decks[n].sb;   // v0.90.2 sideboarded version of the list (the saved text itself is never touched)
  if (sb && Array.isArray(sb.main) && sb.main.length) return { name: n, main: sb.main.map(x => ({ ...x })), side: (sb.side || []).map(x => ({ ...x })), sideboarded: true };
  return { name: n, ...parseDeck(decks[n].text) };
}

