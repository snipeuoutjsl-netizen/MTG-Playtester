// ---- v0.99.103 The dungeon tracker. The map is drawn from the dungeon's rooms: one row per depth, lines for the paths, the venture
// marker on the current room, the rooms you passed through in gold, and (while you choose) the rooms you can move to lit up to click.
// It is shown in the right column above the Stack whenever you are in a dungeon (or have completed one), and in a window from the
// Dungeon icon among the game-state icons (that is the way on phones). Choosing a dungeon and choosing a branch use the same map.
function dungeonMapEl(name, o = {}) {
  const rooms = dungeonRooms(name), d = o.dungeon || null, path = new Set(d ? d.path : []), pick = new Set(o.pick || []);
  const levels = []; for (const r of rooms) (levels[r.depth] = levels[r.depth] || []).push(r);
  const RH = o.small ? 40 : 58, GAP = o.small ? 12 : 16, H = levels.length * RH + (levels.length - 1) * GAP;
  const pos = new Map(); levels.forEach((row, y) => row.forEach((r, x) => pos.set(r.name, { x: (x + 0.5) / row.length * 100, y: y * (RH + GAP) + RH / 2 })));
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'dg-lines'); svg.setAttribute('viewBox', `0 0 100 ${H}`); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('aria-hidden', 'true');
  for (const r of rooms) for (const n of r.leads) { const a = pos.get(r.name), b = pos.get(n); if (!a || !b) continue;
    const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line'); ln.setAttribute('x1', a.x); ln.setAttribute('y1', a.y); ln.setAttribute('x2', b.x); ln.setAttribute('y2', b.y);
    const walked = d && path.has(r.name) && path.has(n) && d.path.indexOf(n) === d.path.indexOf(r.name) + 1;
    ln.setAttribute('class', walked ? 'walked' : pick.has(n) && d && r.name === d.room ? 'next' : ''); ln.setAttribute('vector-effect', 'non-scaling-stroke'); svg.append(ln); }
  const wrap = h('div', { class: 'dg-map' + (o.small ? ' small' : ''), style: `height:${H}px` }, svg);
  for (const r of rooms) { const p = pos.get(r.name), row = levels[r.depth], cur = d && d.room === r.name, can = pick.has(r.name);
    const node = h(can ? 'button' : 'div', { class: 'dg-room' + (cur ? ' cur' : '') + (path.has(r.name) && !cur ? ' past' : '') + (can ? ' can' : '') + (!r.leads.length ? ' last' : ''), style: `left:${p.x}%;top:${p.y - RH / 2}px;height:${RH}px;width:calc(${100 / row.length}% - 8px)`, title: `${r.name} — ${r.effect}`, type: can ? 'button' : null },
      h('b', {}, cur ? h('i', { class: 'dg-marker', 'aria-label': 'Your venture marker' }) : null, r.name), o.small ? null : h('span', { text: r.effect }));
    if (can) node.addEventListener('click', () => o.onPick && o.onPick(r.name));
    wrap.append(node); }
  return wrap;
}
function dungeonPickNew(src) {
  return new Promise(res => {
    let done = false; const fin = v => { if (done) return; done = true; res(v); };
    const m = modal(`${src}: venture into the dungeon`, { width: 980, sticky: true, onCancel: () => fin(null) });
    m.body.append(h('div', { class: 'psub', text: 'You are not in a dungeon, so choose one: it goes to the command zone with your venture marker on its first room, and that room\'s ability triggers (rule 309.4). You can choose a dungeon you have already completed.' }));
    const grid = h('div', { class: 'dg-choose' });
    for (const nm of DUNGEONS_VENTURE) { const rooms = dungeonRooms(nm), depth = Math.max(0, ...rooms.map(r => r.depth)) + 1, done2 = dungeonsDone().filter(x => x === nm).length;
      const card = h('button', { class: 'dg-pick', type: 'button' }, h('div', { class: 'dg-pick-h' }, h('b', { text: nm }), h('span', { text: `${depth} rooms deep${done2 ? ` · completed ${done2 > 1 ? done2 + ' times' : 'once'}` : ''}` })), dungeonMapEl(nm, { small: true }), h('div', { class: 'dg-pick-end', text: `Last room: ${rooms[rooms.length - 1].effect}` }));
      card.addEventListener('click', () => { m.close(); fin(nm); }); grid.append(card); }
    m.body.append(grid); m.foot.append(h('button', { text: 'Not now', onclick: () => { m.close(); fin(null); } }));
  });
}
function dungeonPickRoom(d, leads, src) {
  return new Promise(res => {
    let done = false; const fin = v => { if (done) return; done = true; res(v); };
    const m = modal(`${src}: venture — choose the next room`, { width: 560, sticky: true, onCancel: () => fin(leads[0]) });
    m.body.append(h('div', { class: 'psub', text: `${d.name}: ${d.room} leads to ${leads.join(' or ')}. Click the room to move your venture marker into; its room ability triggers.` }),
      dungeonMapEl(d.name, { dungeon: d, pick: leads, onPick: r => { m.close(); fin(r); } }));
  });
}
function dungeonPanelBody(full) {
  const d = state && state.dungeon, done = dungeonsDone();
  const head = h('div', { class: 'dg-sub' }, d ? h('span', {}, 'Marker: ', h('b', { text: d.room })) : h('span', { text: 'Not in a dungeon.' }), done.length ? h('span', { class: 'dg-done', title: done.join(', '), text: `✓ ${done.length} completed` }) : null);
  const body = [head];
  if (d) body.push(dungeonMapEl(d.name, { dungeon: d, small: !full }));
  else if (done.length) body.push(h('div', { class: 'muted small', text: `Completed: ${done.join(', ')}.` }));
  if (full && state && state.phase === 'play') body.push(h('div', { class: 'dg-acts' },
    h('button', { text: d ? 'Venture into the dungeon' : 'Venture: choose a dungeon', title: 'Do it yourself when a card the app does not read tells you to venture', onclick: () => { document.querySelectorAll('#modalRoot .modal').length && closeTopModal(); venture('dungeon', 'You'); } }),
    !d ? h('button', { text: 'Venture into Undercity', onclick: () => { closeTopModal(); venture('undercity', 'You'); } }) : null,
    d ? h('button', { class: 'danger', text: 'Remove the dungeon', title: 'For corrections: takes the dungeon away without completing it', onclick: () => { closeTopModal(); snap(); log(`${d.name} removed by hand`); state.dungeon = null; render(); } }) : null));
  return body;
}
function closeTopModal() { const b = [...document.querySelectorAll('#modalRoot .backdrop')].pop(); if (b) b.remove(); }
function openDungeonMap() {
  if (!state) return; const d = state.dungeon;
  const m = modal(d ? d.name : 'Dungeons', { width: 560 });
  m.el.classList.add('dg-modal');
  m.body.append(h('div', { class: 'psub', text: d ? 'Your dungeon is in the command zone. Each time you venture, the marker moves down one room and that room\'s ability triggers; when the last room\'s ability has resolved, the dungeon is completed (rule 309).' : 'Venturing into the dungeon puts a dungeon into the command zone (rule 309). Cards that say "venture into the dungeon" or "take the initiative" do it for you.' }), ...dungeonPanelBody(true));
  m.foot.append(h('button', { text: 'Close', onclick: () => m.close() }));
}
// the panel in the right column (above the Stack)
function drawDungeonBox() {
  const right = document.getElementById('right'), stackBox = document.getElementById('stackBox'); if (!right) return;
  let box = document.getElementById('dungeonBox');
  const show = !!state && state.phase === 'play' && (state.dungeon || dungeonsDone().length);
  if (!show) { if (box) box.remove(); return; }
  if (!box) { box = h('div', { class: 'box', id: 'dungeonBox' }); right.insertBefore(box, stackBox || null); }
  const d = state.dungeon, key = JSON.stringify([d, dungeonsDone()]); if (box._k === key) return; box._k = key;
  box.replaceChildren(h('div', { class: 'boxhead' }, h('span', { text: d ? d.name : 'Dungeon' }), h('button', { class: 'dg-open', text: 'Map', title: 'Open the dungeon map', onclick: () => openDungeonMap() })), ...dungeonPanelBody(false));
}
