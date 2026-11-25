// ---- v0.99.103 Room cards (Duskmourn), CR 709.5. A Room is a split card whose halves (doors) are enchantments.
//  - Casting: you choose one door and cast it (the half chooser); when it resolves the Room enters with THAT door unlocked (709.5b), and its
//    "When you unlock this door" ability triggers (the release notes: it triggers as the Room enters).
//  - A Room that enters without being cast (returned, blinked, put onto the battlefield) has both doors locked (709.5e).
//  - Unlocking: as a sorcery, pay a locked door's mana cost to unlock it. It is a special action: it does not use the stack (116.2m).
//  - The permanent has only the abilities of its unlocked doors (709.5c); with both doors unlocked it is "fully unlocked", which
//    triggers "whenever you fully unlock a Room" (eerie) and "when you fully unlock this Room".
// The doors are shown on the card as two chips: an open padlock for an unlocked door, a closed one (click to unlock) for a locked door.
function roomParent(c) { const p = c && !c.token ? cardInfo(c.faceOf || c.name) : null; return p && p.fc && p.kind === 'room' ? p : null; }
function isRoomPerm(c) { return !!(state && c && !c.half && roomParent(c) && state.battlefield.includes(c)); }
function roomDoors(c) { return Array.isArray(c.doors) ? c.doors : [false, false]; }
// the rules text of a Room on the battlefield: its unlocked doors only (a fully locked Room has no abilities)
function roomText(c, tx) {
  if (!isRoomPerm(c)) return tx;
  const p = roomParent(c), d = roomDoors(c);
  return p.fc.filter((r, i) => d[i]).map(r => String(r.tx || '').split('\n').filter(l => !/^\(You may cast either half\b/i.test(l.trim())).join('\n')).join('\n');
}
// the door that was cast has resolved: the Room is the whole card again, with that door unlocked
function roomResolved(c) {
  const fi = c.face || 0; c.name = c.faceOf || c.name; delete c.faceOf; delete c.face; delete c.half;
  const p = roomParent(c); c.doors = [fi === 0, fi === 1];
  log(`${c.name} entered with ${p ? p.fc[fi].name : 'the door you cast'} unlocked (rule 709.5)`);
  roomUnlocked(c, fi);
}
function unlockDoor(c, fi) {
  const p = roomParent(c); if (!p || !p.fc[fi]) return;
  const d = roomDoors(c).slice(); if (d[fi]) return; d[fi] = true; c.doors = d;
  log(`Unlocked ${p.fc[fi].name} on ${c.name} — a special action: it does not use the stack (rule 116.2m)`);
  roomUnlocked(c, fi); render(); flushTriggers();
}
function roomUnlocked(c, fi) {
  const p = roomParent(c); if (!p) return; const door = p.fc[fi];
  for (const line of String(door.tx || '').split('\n')) { const m = line.trim().match(/^When(?:ever)? you unlock this door, (.+)$/i);
    if (m) queueTrigger({ kind: 'ability', cardId: c.id, cardName: c.name, text: line.trim(), effect: m[1], special: null, optional: false, why: `You unlocked ${door.name} (rule 709.5)`, noYield: true }); }
  if (roomDoors(c).every(Boolean)) {   // fully unlocked
    log(`${c.name} is fully unlocked`);
    for (const line of String(roomText(c, '') || '').split('\n')) { const m = line.trim().match(/^When(?:ever)? you fully unlock this Room, (.+)$/i); if (m) queueTrigger({ kind: 'ability', cardId: c.id, cardName: c.name, text: line.trim(), effect: m[1], special: null, optional: false, why: `${c.name} is fully unlocked`, noYield: true }); }
    for (const o of state.battlefield) { const tx = String((rulesInfo(o) || {}).tx || '');
      for (const line of tx.split('\n')) { const m = line.match(/\bwhenever you fully unlock a Room, (.+)$/i); if (m) queueTrigger({ kind: 'ability', cardId: o.id, cardName: o.name, text: line.trim(), effect: m[1], special: null, optional: false, why: `You fully unlocked ${c.name} (eerie)` }); } }
  }
}
// the unlock special action, offered like an ability (it shows in the ability menu and the door chip runs it)
function roomUnlockAbilities(c, base) {
  if (!isRoomPerm(c)) return [];
  const p = roomParent(c), d = roomDoors(c), out = [];
  p.fc.forEach((r, i) => { if (d[i] || !r.mc) return; const pc = parseAbilityCost(r.mc, c.name.split(' // ')[0]);
    out.push({ cost: `${r.mc}: Unlock ${r.name}`, effect: `Unlock ${r.name}. Activate only as a sorcery.`, mana: pc.mana, comps: [], other: '', ix: base + out.length, unlock: i }); });
  return out;
}
function roomBadge(c) {
  if (!isRoomPerm(c)) return null;
  const p = roomParent(c), d = roomDoors(c);
  const stop = e => e.stopPropagation();
  return h('div', { class: 'room-doors' }, p.fc.map((r, i) => {
    const b = h('button', { class: 'room-door ' + (d[i] ? 'open' : 'locked'), type: 'button', title: d[i] ? `${r.name}: unlocked. Its abilities apply.` : `${r.name}: locked. Click to unlock it: pay ${r.mc} as a sorcery (a special action, rule 709.5).`, 'aria-label': `${r.name}, ${d[i] ? 'unlocked' : 'locked: unlock'}` },
      h('span', { class: 'room-lock', 'aria-hidden': 'true', text: d[i] ? '\u{1F513}' : '\u{1F512}' }), h('span', { class: 'room-nm', text: r.name }), d[i] ? null : h('span', { class: 'room-mc' }, symbols(r.mc)));
    b.addEventListener('pointerdown', stop); b.addEventListener('dblclick', stop);
    b.addEventListener('click', e => { e.stopPropagation(); if (d[i]) return; const ab = activatedAbilitiesFor(c).find(a => a.unlock === i); if (ab) activateAbility(c.id, false, ab.ix); });
    return b;
  }));
}
