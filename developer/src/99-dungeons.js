// ---- v0.99.103 Dungeons (CR 309), venture into the dungeon (701.49) and the initiative (725).
//  - Venturing with no dungeon: you choose a dungeon (Undercity only through "venture into Undercity" / the initiative, 309.2c) and put it
//    into the command zone with your venture marker on its first room. Otherwise the marker moves to a room the current one leads to;
//    with two exits you choose (by clicking the room on the map).
//  - Moving into a room triggers its room ability (309.4c): it goes on the stack and resolves through the normal effect reader.
//  - When the marker is on the bottom room and its room ability has left the stack, the dungeon is completed and removed (704.5t, 309.7).
//    Completed dungeons are remembered for "if you've completed a dungeon" / "completed Tomb of Annihilation".
//  - The initiative: taking it ventures into Undercity, and so does each of your upkeeps while you have it.
// The rooms are read from the dungeon card's Oracle text ("Room — effect (Leads to: A, B)"). Dungeons are not in decks, so when the card
// data has no record of them the app uses its own copy of the four dungeons' Oracle text.
const DUNGEON_TEXT = {
  'Tomb of Annihilation': "Trapped Entry — Each player loses 1 life. (Leads to: Veils of Fear, Oubliette)\nVeils of Fear — Each player loses 2 life unless they discard a card. (Leads to: Sandfall Cell)\nSandfall Cell — Each player loses 2 life unless they sacrifice a creature, artifact, or land of their choice. (Leads to: Cradle of the Death God)\nOubliette — Discard a card and sacrifice a creature, an artifact, and a land. (Leads to: Cradle of the Death God)\nCradle of the Death God — Create The Atropal, a legendary 4/4 black God Horror creature token with deathtouch.",
  'Lost Mine of Phandelver': "Cave Entrance — Scry 1. (Leads to: Goblin Lair, Mine Tunnels)\nGoblin Lair — Create a 1/1 red Goblin creature token. (Leads to: Storeroom, Dark Pool)\nMine Tunnels — Create a Treasure token. (Leads to: Dark Pool, Fungi Cavern)\nStoreroom — Put a +1/+1 counter on target creature. (Leads to: Temple of Dumathoin)\nDark Pool — Each opponent loses 1 life and you gain 1 life. (Leads to: Temple of Dumathoin)\nFungi Cavern — Target creature gets -4/-0 until your next turn. (Leads to: Temple of Dumathoin)\nTemple of Dumathoin — Draw a card.",
  'Dungeon of the Mad Mage': "Yawning Portal — You gain 1 life. (Leads to: Dungeon Level)\nDungeon Level — Scry 1. (Leads to: Goblin Bazaar, Twisted Caverns)\nGoblin Bazaar — Create a Treasure token. (Leads to: Lost Level)\nTwisted Caverns — Target creature can't attack until your next turn. (Leads to: Lost Level)\nLost Level — Scry 2. (Leads to: Runestone Caverns, Muiral's Graveyard)\nRunestone Caverns — Exile the top two cards of your library. You may play them. (Leads to: Deep Mines)\nMuiral's Graveyard — Create two 1/1 black Skeleton creature tokens. (Leads to: Deep Mines)\nDeep Mines — Scry 3. (Leads to: Mad Wizard's Lair)\nMad Wizard's Lair — Draw three cards and reveal them. You may cast one of them without paying its mana cost.",
  'Undercity': "You can't enter this dungeon unless you \"venture into Undercity.\"\nSecret Entrance — Search your library for a basic land card, reveal it, put it into your hand, then shuffle. (Leads to: Forge, Lost Well)\nForge — Put two +1/+1 counters on target creature. (Leads to: Trap!, Arena)\nLost Well — Scry 2. (Leads to: Arena, Stash)\nTrap! — Target player loses 5 life. (Leads to: Archives)\nArena — Goad target creature. (Leads to: Archives, Catacombs)\nStash — Create a Treasure token. (Leads to: Catacombs)\nArchives — Draw a card. (Leads to: Throne of the Dead Three)\nCatacombs — Create a 4/1 black Skeleton creature token with menace. (Leads to: Throne of the Dead Three)\nThrone of the Dead Three — Reveal the top ten cards of your library. Put a creature card from among them onto the battlefield with three +1/+1 counters on it. It gains hexproof until your next turn. Then shuffle."
};
const DUNGEONS_VENTURE = ['Lost Mine of Phandelver', 'Dungeon of the Mad Mage', 'Tomb of Annihilation'];
const DUNGEON_ROOMS = new Map();
function dungeonText(name) { const i = cardInfo(name); return (i && /\bDungeon\b/.test(i.t || '') && i.tx) || DUNGEON_TEXT[name] || ''; }
function dungeonRooms(name) {
  const tx = dungeonText(name), key = name + '|' + tx.length; if (DUNGEON_ROOMS.has(key)) return DUNGEON_ROOMS.get(key);
  const rooms = [];
  for (const raw of tx.split('\n')) { const m = raw.trim().match(/^(.+?)\s+[—-]\s+(.+?)(?:\s*\(Leads to: (.+)\))?$/); if (!m || /^You can't enter/i.test(raw)) continue;
    rooms.push({ name: m[1].trim(), effect: m[2].trim(), leads: m[3] ? m[3].split(/,\s*/).map(x => x.replace(/\.$/, '').trim()) : [] }); }
  // depth = the longest path from the first room, so the last room is always at the bottom
  const depth = new Map(rooms.length ? [[rooms[0].name, 0]] : []);
  for (let pass = 0; pass < rooms.length; pass++) for (const r of rooms) if (depth.has(r.name)) for (const n of r.leads) depth.set(n, Math.max(depth.get(n) || 0, depth.get(r.name) + 1));
  for (const r of rooms) r.depth = depth.get(r.name) || 0;
  DUNGEON_ROOMS.set(key, rooms); return rooms;
}
const dungeonRoom = (name, room) => dungeonRooms(name).find(r => r.name === room) || null;
function dungeonsDone() { const gs = state && state.gs; return gs && Array.isArray(gs.dungeonsDone) ? gs.dungeonsDone : []; }
// ---- venturing
function venture(kind, src) {
  if (!state) return Promise.resolve();
  const d = state.dungeon;
  if (!d) {
    if (kind === 'undercity') return Promise.resolve(dungeonEnter('Undercity', src, kind));
    return dungeonPickNew(src).then(name => { if (name) dungeonEnter(name, src, kind); });
  }
  const cur = dungeonRoom(d.name, d.room); const leads = cur ? cur.leads : [];
  if (!leads.length) { log(`${src}: venture — ${d.name} has no room after ${d.room}`); return Promise.resolve(); }
  if (leads.length === 1) { dungeonMove(leads[0], src); return Promise.resolve(); }
  return dungeonPickRoom(d, leads, src).then(room => dungeonMove(room || leads[0], src));
}
function dungeonEnter(name, src, kind) {
  const rooms = dungeonRooms(name); if (!rooms.length) { toast('Dungeon unreadable', `No rooms could be read for ${name}.`); return; }
  snap(); state.dungeon = { name, room: rooms[0].name, path: [rooms[0].name] };
  log(`${src}: ${kind === 'undercity' ? 'venture into Undercity' : 'venture into the dungeon'} — ${name} goes to the command zone; your venture marker is on ${rooms[0].name} (rule 309.4)`);
  dungeonRoomTrigger(); try { sfx('draw'); } catch (e) {}
  render(); flushTriggers();
}
function dungeonMove(room, src) {
  const d = state.dungeon; if (!d) return; snap();
  d.room = room; d.path.push(room);
  log(`${src}: venture — the marker moves to ${room} in ${d.name}`);
  dungeonRoomTrigger(); render(); flushTriggers();
}
function dungeonRoomTrigger() {
  const d = state.dungeon, r = d && dungeonRoom(d.name, d.room); if (!r) return;
  if (!r.leads.length) d.final = true;   // the bottom room: completed once its room ability has left the stack (704.5t)
  queueTrigger({ kind: 'ability', cardId: 0, cardName: d.name, text: `Room ability — ${r.name}: ${r.effect}`, effect: r.effect, special: null, optional: false, why: `Your venture marker moved into ${r.name} (rule 309.4c)`, dungeon: d.name, noYield: true });
}
// 704.5t: the dungeon is removed once the marker is on its bottom room and that room's ability is no longer waiting or on the stack
function dungeonSBA() {
  const d = state && state.dungeon; if (!d || !d.final || state.phase !== 'play') return;
  const nm = d.name, mine = x => x && (x.dungeon === nm || x.cardName === nm || (x.sourceName === nm && !x.sourceId));
  if (state.stack.some(mine)) { d.seen = true; return; }   // its room ability is on the stack
  if ((state.pendingTriggers || []).some(mine) || mine(state.resolvingAb) || mine(state.resolving)) return;
  // between leaving the waiting list and reaching the stack the ability is in the trigger window: until it has been seen on the stack,
  // wait while any window is open (checked again shortly)
  if (!d.seen && document.querySelector('#modalRoot .backdrop')) { clearTimeout(dungeonSBA.t); dungeonSBA.t = setTimeout(() => { try { dungeonSBA(); render(); } catch (e) {} }, 400); return; }
  const gs = state.gs || (state.gs = {}); gs.dungeonsDone = dungeonsDone().concat(nm); state.dungeon = null;
  log(`You completed ${nm}: it is removed from the game (rules 309.7 and 704.5t). Dungeons completed: ${gs.dungeonsDone.length}`);
  toast('Dungeon completed', `${nm} is complete. You can venture again to enter a new dungeon.`);
  for (const o of state.battlefield) for (const line of String((rulesInfo(o) || {}).tx || '').split('\n')) { const m = line.trim().replace(/^[A-Z][\w' ]+ \u2014 /, '').match(/^Whenever you complete a dungeon, (.+)$/i); if (m && !/from your graveyard to your hand/i.test(m[1])) queueTrigger({ kind: 'ability', cardId: o.id, cardName: o.name, text: line.trim(), effect: m[1], special: null, optional: false, why: `You completed ${nm}` }); }
  for (const o of state.graveyard) for (const line of String((cardInfo(o.name) || {}).tx || '').split('\n')) { const m = stripAW(line.trim()).match(/^Whenever you complete a dungeon, (you may return this card from your graveyard to your hand\.?)$/i);   // Dungeon Crawler: it triggers from the graveyard
    if (m) queueTrigger({ kind: 'ability', cardId: o.id, cardName: o.name, text: line.trim(), effect: m[1], special: null, optional: true, why: `You completed ${nm} (this card triggers from your graveyard)` }); }
  flushTriggers();
}
// ---- the initiative (CR 725)
function takeInitiative(src) {
  const gs = state.gs || (state.gs = {}); gs.init = true;
  log(`${src}: you take the initiative (rule 725)`);
  queueTrigger({ kind: 'ability', cardId: 0, cardName: 'The initiative', text: 'Whenever you take the initiative, venture into Undercity.', effect: 'Venture into Undercity.', special: null, optional: false, why: 'You took the initiative (rule 725.2)', noYield: true });
  render(); flushTriggers();
}
// ---- reading the words: venture / initiative / monarch (called from the effect reader, src/98 rules batch 5)
function dungeonOptions(t, sents, obj, src, out, drop) {
  let m0;
  for (const s of sents) {
    const x = s.trim().replace(/\.$/, '');
    if ((m0 = x.match(/^(.+?),? (?:and|then) venture into (the dungeon|undercity)$/i)) && !/^venture\b/i.test(m0[1])) {   // Acererak: "return Acererak to its owner's hand and venture into the dungeon"
      const first = m0[1].replace(/^./, ch => ch.toUpperCase()) + '.', kind = /undercity/i.test(m0[2]) ? 'undercity' : 'dungeon';
      out.push({ covers: [s], label: `${first.replace(/\.$/, '')}, then venture into ${kind === 'undercity' ? 'Undercity' : 'the dungeon'}`, then: done => { b4RunSentence(first, obj, src); venture(kind, src).then(done); } }); }
    else if (/^venture into the dungeon$/i.test(x)) out.push({ covers: [s], label: 'Venture into the dungeon', then: done => { venture('dungeon', src).then(done); } });
    else if (/^venture into (?:the )?undercity$/i.test(x)) out.push({ covers: [s], label: 'Venture into Undercity', then: done => { venture('undercity', src).then(done); } });
    else if (/^you take the initiative$/i.test(x)) out.push({ covers: [s], label: 'You take the initiative', fn: () => takeInitiative(src) });
    // the dungeon rooms' own wordings the general reader does not cover
    else if ((m0 = x.match(/^each player loses (\w+) life$/i)) && numOf(m0[1])) { const n = numOf(m0[1]); out.push({ covers: [s], label: `Each player loses ${n} life`, fn: () => { snap(); state.life -= n; state.oppLife -= n; log(`${src}: each player loses ${n} life`); render(); } }); }
    else if ((m0 = x.match(/^each player loses (\w+) life unless they (discard a card|sacrifice a creature, artifact, or land of their choice)$/i)) && numOf(m0[1])) {
      const n = numOf(m0[1]), disc = /^discard/i.test(m0[2]);
      out.push({ covers: [s], label: `Each player loses ${n} life unless they ${m0[2]}`, then: done => {
        log(`${src}: your opponent loses ${n} life unless they ${m0[2].replace(/their/, 'their')} — their choice, at the real table`);
        const kinds = disc ? (state.hand.length ? ['Discard a card'] : []) : ['creature', 'artifact', 'land'].filter(k => state.battlefield.some(c => { try { return permTypeInfo(c).types.has(k); } catch (e) { return false; } })).map(k => `Sacrifice ${k === 'artifact' ? 'an' : 'a'} ${k}`);
        if (!kinds.length) { snap(); state.life -= n; log(`${src}: you have nothing to ${disc ? 'discard' : 'sacrifice'}, so you lose ${n} life`); render(); done(); return; }
        appChoose(src, `Lose ${n} life, or ${m0[2].replace(/ of their choice/, '')}?`, [`Lose ${n} life`, ...kinds]).then(k => {
          if (!k) { snap(); state.life -= n; log(`${src}: you lose ${n} life`); render(); }
          else b4RunSentence(kinds[k - 1] + '.', obj, src);
          done(); }); } });
    }
    else if (/^discard a card and sacrifice a creature, an artifact, and a land$/i.test(x)) out.push({ covers: [s], label: 'Discard a card and sacrifice a creature, an artifact, and a land', fn: () => { for (const one of ['Discard a card.', 'Sacrifice a creature.', 'Sacrifice an artifact.', 'Sacrifice a land.']) b4RunSentence(one, obj, src); } });
    else if (/^goad target creature$/i.test(x)) out.push({ covers: [s], label: 'Goad target creature', fn: () => { log(`${src}: goad target creature (rule 701.38): it attacks each combat if able and attacks a player other than you if able — your opponent's creature, at the real table`); render(); } });
    else if (/^reveal the top ten cards of your library$/i.test(x) && /^put a creature card from among them onto the battlefield with three \+1\/\+1 counters on it/i.test(sents[sents.indexOf(s) + 1] || '')) {
      const rest = sents.slice(sents.indexOf(s) + 1); out.push({ covers: [s, ...rest], label: 'Reveal the top ten: a creature card onto the battlefield with three +1/+1 counters, hexproof until your next turn; then shuffle', then: done => {
        const top = state.library.slice(0, 10), cre = top.filter(c => { const i = cardInfo(c.name); return /\bCreature\b/.test(String((i && i.t) || '').split(' // ')[0]); });
        log(`${src}: revealed ${top.map(c => c.name).join(', ') || 'nothing'}`);
        const fin = picked => { snap(); const c = picked && picked[0]; if (c) { const i = state.library.findIndex(x => x.id === c.id); if (i >= 0) { const [card] = state.library.splice(i, 1); enterBattlefield(card, { from: 'library', logMsg: `${src}: put ${card.name} onto the battlefield` }); addCounter(card.id, 3, 'plus'); addFx({ kind: 'kw', kw: 'hexproof', targetId: card.id, until: 'yourNextTurn', srcName: src }); } }
          shuffleLibrary(); log(`${src}: shuffled your library`); render(); done(); };
        if (!cre.length) { fin(null); return; }
        openPickCards({ title: `${src}: put a creature card onto the battlefield`, note: 'It enters with three +1/+1 counters and gains hexproof until your next turn. The rest are shuffled back.', cards: cre, max: 1, min: 1, done: fin }); } });
      for (const r of rest) drop.push(new RegExp('^' + r.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
    }
    else if (/^you become the monarch$/i.test(x)) out.push({ covers: [s], label: 'You become the monarch', fn: () => { const gs = state.gs || (state.gs = {}); gs.monarch = true; log(`${src}: you become the monarch (rule 724)`); render(); } });
  }
}
// conditions: "you've completed a dungeon", "you've completed Tomb of Annihilation", "you have the initiative", "you're the monarch"
function dungeonCond(t) {
  let m; const done = (state && state.gs && Array.isArray(state.gs.dungeonsDone)) ? state.gs.dungeonsDone : [];
  if (/^you(?:'ve| have) completed (?:a|one or more) dungeons?$/.test(t)) return done.length > 0;
  if (/^you(?:'ve| have)n'?t completed a dungeon$|^you have not completed a dungeon$/.test(t)) return done.length === 0;
  if ((m = t.match(/^you(?:'ve| have) completed (.+)$/)) && DUNGEON_TEXT[Object.keys(DUNGEON_TEXT).find(k => k.toLowerCase() === m[1]) || '']) return done.some(n => n.toLowerCase() === m[1]);
  if ((m = t.match(/^you(?:'ve| have)n'?t completed (.+)$|^you have not completed (.+)$/))) { const n = m[1] || m[2]; if (Object.keys(DUNGEON_TEXT).some(k => k.toLowerCase() === n)) return !done.some(x => x.toLowerCase() === n); }
  if (/^you have the initiative$/.test(t)) return !!(state && state.gs && state.gs.init);
  if (/^you(?:'re| are) the monarch$/.test(t)) return !!(state && state.gs && state.gs.monarch);
  if (/^you(?:'re| are) in a dungeon$/.test(t)) return !!(state && state.dungeon);
  return null;
}
