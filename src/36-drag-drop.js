// ---------------------------------------------------------------- drag & drop
// ---- hand reordering (drag a hand card sideways; a gold line shows where it will land)
let dragHand = null;
function handCardsEls() { return [...$('#row-hand').children]; }
function handSlotAt(x) {   // index in the full hand list (0..n) where a card dropped at x would go
  const els = handCardsEls();
  for (let i = 0; i < els.length; i++) {
    const r = els[i].getBoundingClientRect(), nx = els[i + 1] ? els[i + 1].getBoundingClientRect().left : r.right;
    const vis = Math.max(8, Math.min(r.width, nx - r.left));
    if (x < r.left + vis / 2) return i;
  }
  return els.length;
}
function showHandMarker(slot) {
  const els = handCardsEls(); if (!els.length) return;
  let m = $('#handMarker'); if (!m) { m = h('div', { id: 'handMarker' }); document.body.append(m); }
  const row = $('#row-hand').getBoundingClientRect();
  const r = slot < els.length ? els[slot].getBoundingClientRect() : els[els.length - 1].getBoundingClientRect();
  const x = slot < els.length ? r.left - 4 : r.right + 4;
  m.style.left = (x - 2) + 'px'; m.style.top = (r.top - 4) + 'px'; m.style.height = (r.height + 8) + 'px';
}
function clearHandMarker() { const m = $('#handMarker'); if (m) m.remove(); }
function reorderHand(id, slot) {
  if (!state) return;
  const from = state.hand.findIndex(c => c.id === id); if (from < 0) return;
  const [c] = state.hand.splice(from, 1);
  const to = Math.max(0, Math.min(state.hand.length, slot > from ? slot - 1 : slot));
  state.hand.splice(to, 0, c);
  render();
}
const HAND_SORTS = [
  ['Lands first, then by mana value', 'Land → cheap spells → expensive spells', c => { const i = cardInfo(c.name); return [isLandName(c.name) ? 0 : 1, i ? i.cmc || 0 : 0, c.name]; }],
  ['Mana value, low to high', 'Cheapest first, lands counted as 0', c => { const i = cardInfo(c.name); return [0, i ? i.cmc || 0 : 0, c.name]; }],
  ['Colour', 'Groups cards by colour', c => [0, ['W','U','B','R','G','multi','art','land'].indexOf(colorClass(c)), c.name]],
  ['Playable first', 'Green, then red, then gold', c => [{ ready: 0, mana: 1, timing: 2 }[handInteraction(c)] ?? 3, 0, c.name]],
];
function sortHand(fn) {
  if (!state) return;
  const key = c => fn(c);
  state.hand.sort((a, b) => { const x = key(a), y = key(b); for (let i = 0; i < x.length; i++) { if (x[i] < y[i]) return -1; if (x[i] > y[i]) return 1; } return 0; });
  render();
}
function openHandSortMenu(ev) {
  if (!state) return;
  closeLibMenu();
  const m = h('div', { id: 'libMenu', role: 'menu' }, h('div', { class: 'lm-title', text: 'Sort hand' }),
    ...HAND_SORTS.map(([label, hint, fn]) => { const b = h('button', { class: 'lm-item', role: 'menuitem' }, h('span', { text: label }), h('small', { text: hint })); b.addEventListener('click', e => { e.stopPropagation(); closeLibMenu(); sortHand(fn); }); return b; }));
  document.body.append(m);
  const r = ev.currentTarget.getBoundingClientRect();
  m.style.left = Math.max(6, Math.min(innerWidth - m.offsetWidth - 6, r.left)) + 'px';
  m.style.top = Math.max(6, r.top - m.offsetHeight - 6) + 'px';
  document.addEventListener('keydown', libMenuKey, true);
}

function setupDrop() {
  document.addEventListener('dragover', e => { if (dragHand == null) return; if (e.target.closest && e.target.closest('#handWrap')) { e.preventDefault(); showHandMarker(handSlotAt(e.clientX)); } else clearHandMarker(); });
  $('#btnHandKey').addEventListener('click', e => { e.stopPropagation(); $('#handLegend').classList.toggle('open'); });
  document.addEventListener('click', e => { const l = $('#handLegend'); if (l && l.classList.contains('open') && !e.target.closest('#handLegend')) l.classList.remove('open'); });
  // v0.96.13 the small Hand label (count, Key) can be dragged anywhere over the table; its place is remembered, double-click puts it back. (Sorting is done by dragging cards in the hand.)
  { const lab = $('#handWrap > .zlabel'); if (lab) {
    const KEY = 'mtgpt.handBarPos', wrap = $('#handWrap');
    const place = (x, y) => { const w = wrap.getBoundingClientRect(), r = lab.getBoundingClientRect(); x = Math.max(0, Math.min(w.width - r.width, x)); y = Math.max(-w.top, Math.min(window.innerHeight - w.top - r.height, y)); lab.style.left = x + 'px'; lab.style.top = y + 'px'; lab.style.bottom = 'auto'; return [x, y]; };
    const reset = () => { lab.style.left = lab.style.top = lab.style.bottom = ''; try { localStorage.removeItem(KEY); } catch (e) { /* storage unavailable */ } };
    try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v && isFinite(v.fx) && isFinite(v.fy)) requestAnimationFrame(() => { const w = wrap.getBoundingClientRect(); place(v.fx * window.innerWidth - w.left, v.fy * window.innerHeight - w.top); }); } catch (e) { /* ignore */ }
    lab.title = 'Drag to move this label. Double-click to put it back.'; lab.style.cursor = 'grab';
    lab.addEventListener('dblclick', e => { if (!e.target.closest('button')) reset(); });
    lab.addEventListener('pointerdown', e => {
      if (e.target.closest('button, .handlegend') || e.button !== 0) return;
      const w0 = wrap.getBoundingClientRect(), r0 = lab.getBoundingClientRect(), dx = e.clientX - r0.left, dy = e.clientY - r0.top; lab.setPointerCapture(e.pointerId); lab.style.cursor = 'grabbing';
      const move = ev => place(ev.clientX - dx - w0.left, ev.clientY - dy - w0.top);
      const up = () => { lab.removeEventListener('pointermove', move); lab.removeEventListener('pointerup', up); lab.style.cursor = 'grab';
        try { const w = wrap.getBoundingClientRect(), r = lab.getBoundingClientRect(); localStorage.setItem(KEY, JSON.stringify({ fx: r.left / window.innerWidth, fy: r.top / window.innerHeight })); } catch (e) { /* storage unavailable */ } };
      lab.addEventListener('pointermove', move); lab.addEventListener('pointerup', up);
    });
  } }
  // Anywhere over the table counts: a drop that is not on a specific zone or pile lands on the battlefield (v0.67.2).
  const target = e => e.target.closest && (e.target.closest('[data-drop]') || (e.target.closest('#stage') ? $('#mat') : null));
  document.addEventListener('dragover', e => { const t = target(e); if (t && !(dragHand != null && t.dataset.drop === 'hand')) { e.preventDefault(); t.classList.add('over'); } });
  document.addEventListener('dragleave', e => { const t = target(e); if (t && !t.contains(e.relatedTarget)) t.classList.remove('over'); });
  document.addEventListener('drop', e => {
    const t = target(e);
    if (!t) return;
    e.preventDefault();
    for (const x of $$('.over')) x.classList.remove('over');
    const d = e.dataTransfer.getData('text/plain');
    if (!d.startsWith('mtg:') || !state) return;
    dropCardOn(parseInt(d.slice(4), 10), t.dataset.drop, e.clientX);
  });
}

// What happens when a card is released on a zone (shared by the physical drag and the old browser drag).
function dropCardOn(id, kind, x) {
  const f = findCard(id);
  if (kind === 'stack') {   // dropped on the floating stack: cast it, or activate the permanent's ability, in response
    if (!f) return;
    if (f.zone === 'hand') { if (isLandName(f.card.name)) { toast('Lands are played, not cast', 'Drop a land on the battlefield instead.'); return; } castSpell(id); return; }
    if (f.zone === 'battlefield') { const L = activatedAbilitiesFor(f.card); const ab = L.find(a => !abilityReady(f.card, a)) || L[0]; if (!ab) { toast('No ability', `${f.card.name} has no ability the app can activate.`); return; } activateAbility(id, false, ab.ix); return; }
    toast('Cannot use that here', 'Only cards in your hand and permanents on the battlefield can respond.'); return;
  }
  if (f && f.zone === 'hand' && kind === 'hand') { const slot = handSlotAt(x); clearHandMarker(); dragHand = null; reorderHand(id, slot); return; }
  clearHandMarker();
  if (f && f.zone === 'hand' && kind === 'battlefield') {
    if (isLandName(f.card.name)) playLand(id);
    else if (isSpellCard(f.card) || isInstantSpeed(f.card)) castSpell(id);
    else if (canPlaySorcerySpeedNow()) moveCard(id, 'battlefield');
    else toast('Wrong phase', 'This card can only be played during your main phase.');
    return;
  }
  if (f && f.zone === kind && kind === 'battlefield') return;   // already on the battlefield
  moveCard(id, kind, 'top');
}

// Physical card drag (v0.68): the card itself follows the mouse. Released on a zone that takes it, the action happens;
// released anywhere else, or on a zone where the move is not allowed right now, it flies back to where it came from.
let dragJustEnded = false;
document.addEventListener('click', ev => { if (dragJustEnded) { ev.stopPropagation(); ev.preventDefault(); } }, true);
function pointerDragBegin(ev, e, c, zone) {
  if (state && state.discarding) return;
  if (ev.button !== 0 || !state || (ev.target.closest && ev.target.closest('button, input, select'))) return;
  const sx = ev.clientX, sy = ev.clientY;
  let clone = null, cx = 0, cy = 0, w = 0, h2 = 0, offX = 0, offY = 0, lx = sx, ly = sy, vx = 0, vy = 0, tapped = false;
  const tr = (rx, ry, sc) => `${tapped ? 'rotate(90deg) ' : ''}perspective(700px) rotateX(${rx}deg) rotateY(${ry}deg) scale(${sc})`;
  const targetAt = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.closest ? el.closest('[data-drop]') : null; };
  const begin = () => {
    const r = e.getBoundingClientRect(); tapped = e.classList.contains('tapped');
    w = e.offsetWidth; h2 = e.offsetHeight; cx = r.left + r.width / 2; cy = r.top + r.height / 2; offX = sx - cx; offY = sy - cy;
    clone = e.cloneNode(true); clone.removeAttribute('data-id'); clone.removeAttribute('title');
    for (const k of ['sel', 'bsel', 'dragging', 'tapped', 'stackgrp', 'idle']) clone.classList.remove(k);
    clone.classList.add('dragclone');
    const cs = getComputedStyle(e); for (const v of ['--cw', '--ch', '--zone-scale', '--bfs', '--hs']) { const val = cs.getPropertyValue(v); if (val) clone.style.setProperty(v, val); }
    clone.style.width = w + 'px'; clone.style.height = h2 + 'px'; clone.style.left = (cx - w / 2) + 'px'; clone.style.top = (cy - h2 / 2) + 'px'; clone.style.transform = tr(0, 0, 1.1);
    document.body.append(clone); e.classList.add('dragging'); document.body.classList.add('dragging-card');
    dragHand = zone === 'hand' ? c.id : null;
    if (typeof hideCardPreview === 'function') { try { hideCardPreview(); } catch (x) { /* ignore */ } }
  };
  const update = m => {
    const x = m.clientX, y = m.clientY;
    vx = vx * .7 + (x - lx) * .3; vy = vy * .7 + (y - ly) * .3; lx = x; ly = y;
    const cl = n => Math.max(-16, Math.min(16, n));
    clone.style.left = (x - offX - w / 2) + 'px'; clone.style.top = (y - offY - h2 / 2) + 'px'; clone.style.transform = tr(cl(-vy * .8), cl(vx * .8), 1.1);
    for (const o of $$('.over')) o.classList.remove('over');
    const t = targetAt(x, y);
    if (t && !(t.dataset.drop === 'battlefield' && zone === 'battlefield')) t.classList.add('over');
    if (t && t.dataset.drop === 'hand' && zone === 'hand') showHandMarker(handSlotAt(x)); else clearHandMarker();
  };
  const cleanup = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); window.removeEventListener('keydown', key, true); };
  const end = () => { for (const o of $$('.over')) o.classList.remove('over'); clearHandMarker(); document.body.classList.remove('dragging-card'); dragHand = null; e.classList.remove('dragging'); dragJustEnded = true; setTimeout(() => { dragJustEnded = false; }, 60); };
  const flyBack = () => {
    const dest = document.querySelector(`.card[data-id="${c.id}"]:not(.dragclone)`);
    if (!dest || !clone) { if (clone) clone.remove(); return; }
    const r = dest.getBoundingClientRect(), dt = dest.classList.contains('tapped'); dest.style.visibility = 'hidden';
    clone.classList.add('fly'); clone.style.left = (r.left + r.width / 2 - w / 2) + 'px'; clone.style.top = (r.top + r.height / 2 - h2 / 2) + 'px'; clone.style.transform = `${dt ? 'rotate(90deg) ' : ''}scale(1)`;
    let done = false; const fin = () => { if (done) return; done = true; clone.remove(); dest.style.visibility = ''; }; clone.addEventListener('transitionend', fin); setTimeout(fin, 520);
  };
  const finish = m => {
    const t = targetAt(m.clientX, m.clientY), kind = t && t.dataset.drop;
    end();
    if (!kind || (zone === 'battlefield' && kind === 'battlefield')) { flyBack(); return; }
    const z0 = zone, st0 = state.stack.length, bd0 = document.querySelectorAll('#modalRoot .backdrop').length, tp0 = state.pendingTriggers.length;
    dropCardOn(c.id, kind, m.clientX);
    const f2 = findCard(c.id), reorder = zone === 'hand' && kind === 'hand';
    const accepted = reorder || !f2 || f2.zone !== z0 || state.stack.length !== st0 || document.querySelectorAll('#modalRoot .backdrop').length > bd0 || state.pendingTriggers.length !== tp0;
    if (accepted) { clone.classList.add('land'); clone.style.opacity = '0'; clone.style.transform = tr(0, 0, 1.25); setTimeout(() => clone.remove(), 180); }
    else flyBack();
  };
  const move = m => { if (!clone) { if (Math.hypot(m.clientX - sx, m.clientY - sy) < 6) return; begin(); } update(m); };
  const up = m => { cleanup(); if (clone) finish(m); };
  const cancel = () => { cleanup(); if (clone) { end(); flyBack(); } };
  const key = k => { if (k.key === 'Escape' && clone) { k.stopPropagation(); cancel(); } };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancel); window.addEventListener('keydown', key, true);
}

