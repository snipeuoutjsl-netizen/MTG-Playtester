// ---- Commander mode (CR 903), goldfish. A separate, rules-enforced mode: tick "Commander" next to "On the play" when the deck has a Commander section.
//  903.6/903.7  the commander starts in the command zone; 40 life, 99-card library        903.8  casting it from there costs {2} more per previous cast from there
//  903.9        if it would go to graveyard, exile, hand or library you may put it in the command zone instead   903.10a  21 commander combat damage is lethal
//  103.5c       the first mulligan is free        903.5  deck: 100 cards, singleton, colour identity of the commander
function commanderModeOn(deck) {
  return !!FEATURES.commander && !!deck && gameMode() === 'commander' && deck.main.some(x => x.cmd);   // the mode is chosen on the deck selection screen
}
function startCommanderState() {
  state.cmdMode = true; state.life = 40; state.oppLife = 40; state.cmdDealt = {}; state.freeMullUsed = false;
  const names = state.command.map(c => c.name).join(' + ');
  state.log.push(`Commander mode: ${names} starts in the command zone. 40 life; the first mulligan is free; casting the commander from the command zone costs {2} more each time (CR 903).`);
  const rep = commanderDeckCheck(); if (rep.length) state.log.push('Deck check (CR 903.5): ' + rep.join(' '));
}
// ---- colour identity (CR 903.4): mana symbols in the cost and rules text (hybrid counts both colours; reminder text does not count)
function colorIdentityOf(name) {
  const i = cardInfo(name); if (!i) return null; const set = new Set();
  const grab = t => { for (const m of String(t || '').matchAll(/\{([^}]+)\}/g)) for (const ch of m[1].split('/')) if (/^[WUBRG]$/.test(ch)) set.add(ch); };
  grab(i.mc); grab(String(i.tx || '').replace(/\([^)]*\)/g, ''));
  if (Array.isArray(i.ci)) for (const x of i.ci) set.add(x);
  return set;
}
function commanderDeckCheck() {
  const out = []; if (!state) return out;
  const cmds = state.command.slice(), deckCards = state.library.concat(state.hand, state.command);
  const n = deckCards.length; if (n !== 100) out.push(`${n} cards (a Commander deck has exactly 100).`);
  if (cmds.length > 2) out.push('More than two commanders.');
  const ci = new Set(); for (const c of cmds) { const s = colorIdentityOf(c.name); if (s) for (const x of s) ci.add(x); }
  const seen = new Map(), dup = [], off = [];
  for (const c of deckCards) { const i = cardInfo(c.name), basic = i && /\bBasic\b/.test(i.t || ''), many = i && /a deck can have any number of cards named/i.test(i.tx || '');
    if (!basic && !many) seen.set(c.name, (seen.get(c.name) || 0) + 1);
    const s = colorIdentityOf(c.name); if (s && cmds.length) for (const x of s) if (!ci.has(x)) { off.push(c.name); break; } }
  for (const [nm, k] of seen) if (k > 1) dup.push(`${nm} ×${k}`);
  if (dup.length) out.push(`Not singleton: ${dup.slice(0, 6).join(', ')}${dup.length > 6 ? '…' : ''}.`);
  if (off.length) out.push(`Outside the commander's colour identity: ${[...new Set(off)].slice(0, 6).join(', ')}${new Set(off).size > 6 ? '…' : ''}.`);
  for (const c of cmds) { const i = cardInfo(c.name); if (i && !/\bLegendary\b/.test(i.t || '') && !/can be your commander/i.test(i.tx || '')) out.push(`${c.name} is not a legal commander (it must be a legendary creature or say it can be your commander).`); }
  if (cmds.length === 2 && !cmds.every(c => /\bPartner\b|Choose a Background|Friends forever|Doctor's companion/i.test((cardInfo(c.name) || {}).tx || '') || /\bBackground\b/.test((cardInfo(c.name) || {}).t || ''))) out.push('Two commanders need Partner (or Background / Friends forever).');
  return out;
}
// ---- casting from the command zone (CR 903.8): the card is lifted into the hand for the normal cast flow; the tax is added by costAdjustments
function castFromCommand(id) {
  if (!state) return; const i = state.command.findIndex(x => x.id === id); if (i < 0) return; const c = state.command[i];
  if (!canCastNow(c)) { toast('Wrong timing', 'A commander follows the normal timing: your main phase with an empty stack for permanents and sorceries; instants any time you have priority.'); return; }
  state.command.splice(i, 1); c.fromCmd = true; state.hand.push(c); state.halfChosen = id; castSpell(id);
}
// ---- CR 903.9: a commander that is in the graveyard or exile (state-based action), or in the hand or library (replacement), may go to the command zone instead
let CMD_ASKING = false;
function commanderSBA() {
  if (!state || !state.cmdMode || CMD_ASKING || state.phase === 'idle') return;
  for (const z of ['graveyard', 'exile', 'hand', 'library']) for (const c of state[z]) {
    if (!c.isCommander || c.fromCmd) continue;
    if (c._cmdAsk === z) continue; c._cmdAsk = z;
    if (z === 'hand' && state.phase !== 'play') continue;   // it is only a question once the game is running
    CMD_ASKING = true;
    const m = modal(`${c.name}: command zone?`, { width: 460, sticky: true, noClose: true });
    m.body.append(h('div', { class: 'psub', text: `${c.name} is in your ${z}. Its owner may put it into the command zone instead (CR 903.9). If you keep it in the ${z} it is an ordinary card there, and you can still cast it from there, but the commander tax no longer applies.` }));
    m.foot.append(h('button', { text: `Leave it in the ${z}`, onclick: () => { m.close(); CMD_ASKING = false; log(`${c.name}: left in the ${z}`); render(); } }),
      h('button', { class: 'primary', text: 'Put it in the command zone', onclick: () => { m.close(); CMD_ASKING = false; snap(); const f = findCard(c.id); if (f) { state[f.zone].splice(f.idx, 1); delete c._cmdAsk; c.tapped = false; c.counters = { plus: 0, minus: 0 }; state.command.push(c); log(`${c.name}: put into the command zone (CR 903.9)`); } render(); } }));
    return;   // one question at a time; the render after the answer asks about the next
  }
}
// ---- commander damage dealt to the opponent (CR 903.10a: 21 from one commander is lethal)
function commanderDamage(dealers) {
  if (!state || !state.cmdMode) return;
  for (const d of dealers || []) { if (!d.isCommander) continue; let n = 0; try { n = powerOf(d).n * (hasKw(d, 'double strike') ? 2 : 1); } catch (e) { n = 0; } if (n <= 0) continue;
    state.cmdDealt[d.name] = (state.cmdDealt[d.name] || 0) + n; const t = state.cmdDealt[d.name];
    log(`Commander damage: ${d.name} has dealt ${t} combat damage to your opponent in total (21 is lethal, CR 903.10a)`);
    if (t >= 21) { toast('Commander damage', `${d.name} has dealt ${t} damage: that is lethal in Commander.`); log(`${d.name}: 21 commander damage, your opponent loses the game (CR 903.10a)`); } }
}
function commanderRender() {
  const pile = document.getElementById('pile-command'); if (pile) pile.hidden = !(state && state.cmdMode);
  const cb = document.getElementById('cmdWrap'); if (cb) cb.hidden = !(FEATURES.commander && gameMode() === 'commander');
  if (state && state.cmdMode) { const el = document.getElementById('pile-command'); if (el) { const tax = state.command.length ? (state.command[0].cmdCasts || 0) * 2 : 0; el.title = state.command.length ? `Command zone: click to cast your commander${tax ? ` (+{${tax}} commander tax)` : ''}` : 'Your commander is not in the command zone'; } setTimeout(commanderSBA, 0); }
}
