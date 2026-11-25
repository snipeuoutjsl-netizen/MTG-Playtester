// ---------------------------------------------------------------- v0.99.54 phones and tablets (the web app)
// The desktop layout is kept and fitted to the screen: on a screen smaller than the design size the viewport is widened (see the
// script in index.html), phones are asked to turn sideways, and touch gets what a mouse has:
//   drag a card      -> touch, move: the browser's drag events are replayed from the finger (the existing drop code runs unchanged)
//   right-click      -> press and hold
//   double-click     -> double tap
const TOUCH = { dragPx: 10, holdMs: 480, dblMs: 320, dblPx: 26 };
(function touchLayer() {
  if (typeof document === 'undefined') return;
  let st = null, lastTap = null, swallowClick = 0;
  const fire = (el, type, x, y, dt) => {
    if (!el) return null;
    let ev; try { ev = new DragEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: dt }); } catch (e) { ev = null; }
    if (!ev || !ev.dataTransfer) { ev = new Event(type, { bubbles: true, cancelable: true }); Object.defineProperty(ev, 'dataTransfer', { value: dt }); Object.defineProperty(ev, 'clientX', { value: x }); Object.defineProperty(ev, 'clientY', { value: y }); }
    el.dispatchEvent(ev); return ev;
  };
  const under = (x, y) => document.elementFromPoint(x, y);
  document.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch' || !e.isPrimary) return;
    const src = e.target.closest && e.target.closest('[draggable="true"]');
    st = { x: e.clientX, y: e.clientY, src, target: e.target, drag: false, held: false, t: Date.now() };
    // v0.99.78 a button, a field or a choice in a window is never press-and-hold: a slow tap on "Pay and cast" or "Cast" must still click it
    if (e.target.closest && e.target.closest('button, input, select, textarea, a, label, .mode-row, .tgl, #modalRoot .row')) { st.noHold = true; return; }
    st.timer = setTimeout(() => {   // press and hold = right-click (card menus, the library menu ...)
      if (!st || st.drag) return; st.held = true; swallowClick = Date.now();
      const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: st.x, clientY: st.y, button: 2 }); (under(st.x, st.y) || st.target).dispatchEvent(ev);
      try { navigator.vibrate && navigator.vibrate(12); } catch (x) {}
    }, TOUCH.holdMs);
  }, true);
  document.addEventListener('pointermove', e => {
    if (!st || e.pointerType !== 'touch') return;
    const dx = e.clientX - st.x, dy = e.clientY - st.y;
    if (!st.drag && Math.hypot(dx, dy) > TOUCH.dragPx) {
      clearTimeout(st.timer);
      if (!st.src || st.held) return;
      st.drag = true; st.dt = (() => { try { return new DataTransfer(); } catch (x) { const m = new Map(); return { setData: (k, v) => m.set(k, v), getData: k => m.get(k) || '', types: [], effectAllowed: 'all', dropEffect: 'move', files: [], setDragImage() {} }; } })();
      fire(st.src, 'dragstart', st.x, st.y, st.dt);
      const r = st.src.getBoundingClientRect(), g = st.src.cloneNode(true);
      g.classList.add('touch-ghost'); Object.assign(g.style, { position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', margin: 0, pointerEvents: 'none', zIndex: 99999, opacity: '.88', transform: 'scale(1.06) rotate(-2deg)', transition: 'none' });
      document.body.append(g); st.ghost = g; st.gx = r.left - st.x; st.gy = r.top - st.y;
    }
    if (st.drag) {
      e.preventDefault();
      st.ghost.style.left = (e.clientX + st.gx) + 'px'; st.ghost.style.top = (e.clientY + st.gy) + 'px';
      const t = under(e.clientX, e.clientY);
      if (t !== st.over) { if (st.over) fire(st.over, 'dragleave', e.clientX, e.clientY, st.dt); if (t) fire(t, 'dragenter', e.clientX, e.clientY, st.dt); st.over = t; }
      const ov = fire(t, 'dragover', e.clientX, e.clientY, st.dt); st.canDrop = !!(ov && ov.defaultPrevented);
    }
  }, { capture: true, passive: false });
  const end = (e, cancel) => {
    if (!st || e.pointerType !== 'touch') return;
    clearTimeout(st.timer);
    if (st.drag) {
      if (!cancel && st.over && st.canDrop) fire(st.over, 'drop', e.clientX, e.clientY, st.dt);
      fire(st.src, 'dragend', e.clientX, e.clientY, st.dt); if (st.ghost) st.ghost.remove(); swallowClick = Date.now();
    } else if (!st.held && !cancel && Date.now() - st.t < 400) {   // a tap: a second tap close by = double-click
      const now = Date.now(), tgt = e.target;
      if (lastTap && now - lastTap.t < TOUCH.dblMs && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < TOUCH.dblPx) {
        setTimeout(() => tgt.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY })), 0); lastTap = null;
      } else lastTap = { t: now, x: e.clientX, y: e.clientY };
    }
    st = null;
  };
  document.addEventListener('pointerup', e => end(e, false), true);
  document.addEventListener('pointercancel', e => end(e, true), true);
  // v0.99.62 phone browsers send their own dblclick for a double tap as well as the one made above: one double tap = one action (it used to cast a spell twice)
  let lastDbl = 0;
  document.addEventListener('dblclick', e => { const now = Date.now(); if (now - lastDbl < 450) { e.preventDefault(); e.stopImmediatePropagation(); return; } lastDbl = now; }, true);
  // the click that a browser sends after a drag or a press-and-hold is not a click
  document.addEventListener('click', e => { if (swallowClick && Date.now() - swallowClick < 600) { e.preventDefault(); e.stopPropagation(); swallowClick = 0; } }, true);
  // iOS has no right-click menu of its own to block, but its long-press callout and text selection would fight the press-and-hold
  document.addEventListener('contextmenu', e => { if (e.isTrusted && matchMedia('(pointer: coarse)').matches && !(e.target.closest && e.target.closest('input, textarea'))) e.preventDefault(); }, true);
})();
// v0.99.55 upright phones and tablets: html.portrait-ui (set by the script in index.html) stacks the table in one column. The right-hand
// column (stack, log) becomes a drawer opened from the top bar, and the card preview floats over the table for a moment when a card is tapped.
function portraitUiSetup() {
  if (typeof document === 'undefined' || document.getElementById('btnSideDrawer')) return;
  const bar = document.getElementById('topbar'); if (!bar) return;
  const b = h('button', { id: 'btnSideDrawer', class: 'sidedrawer', title: 'Stack and game log', 'aria-label': 'Stack and game log', 'aria-expanded': 'false', text: 'Stack & log',
    onclick: () => { const on = document.body.classList.toggle('side-open'); b.setAttribute('aria-expanded', String(on)); } });
  bar.append(b);
  const pv = document.getElementById('preview'); if (!pv) return;
  let t = 0;
  new MutationObserver(() => { if (!document.documentElement.classList.contains('portrait-ui')) return; document.body.classList.add('pv-on'); clearTimeout(t); t = setTimeout(() => document.body.classList.remove('pv-on'), 2600); })
    .observe(pv, { childList: true, subtree: true });
  pv.addEventListener('click', () => document.body.classList.remove('pv-on'));
}
if (typeof window !== 'undefined') setTimeout(portraitUiSetup, 0);

// v0.99.61 swipe the table to move on: a quick swipe from right to left on an empty part of the table is "Next step" (the same as
// the Next button / Space). It only counts on the table itself, during your game, with no window open.
(function swipeNext() {
  if (typeof document === 'undefined') return;
  let sw = null;
  document.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch' || !e.isPrimary) return;
    const t = e.target; if (!t.closest || !t.closest('#mat') || t.closest('.card, [draggable="true"], button, input, #stackStage, #piles, .pile')) { sw = null; return; }
    sw = { x: e.clientX, y: e.clientY, t: Date.now() };
  }, true);
  document.addEventListener('pointerup', e => {
    if (!sw || e.pointerType !== 'touch') return;
    const dx = e.clientX - sw.x, dy = e.clientY - sw.y, dt = Date.now() - sw.t; sw = null;
    if (dt > 700 || dx > -80 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
    if (!state || state.phase !== 'play' || document.querySelector('#modalRoot .backdrop:not(.dock)')) return;
    const b = document.getElementById('btnNextPhase'); if (!b || b.disabled || b.hidden) return;
    swipeCue(b.textContent.trim()); b.click();
  }, true);
  document.addEventListener('pointercancel', () => { sw = null; }, true);
})();
function swipeCue(label) {
  const mat = document.getElementById('mat'); if (!mat) return;
  const el = h('div', { class: 'swipe-cue', 'aria-hidden': 'true' }, h('span', { text: '‹‹' }), h('b', { text: label || 'Next' }));
  mat.append(el); setTimeout(() => el.remove(), 700);
}
// v0.99.69 upright phones: the hand can be tucked down to a strip, giving the whole height to the table.
// v0.99.92 the control is the hand tray's own handle, part of the tray (never floating over the table, a window or its buttons):
// a full-width bar on top of the hand. Tap it, or swipe it down / up, to tuck or raise the hand; tucked, only the bar shows at the bottom.
(function handTab() {
  if (typeof document === 'undefined') return;
  const mk = () => {
    const hw = document.getElementById('handWrap'); if (!hw || document.getElementById('handTab')) return;
    const b = document.createElement('button'); b.id = 'handTab'; b.className = 'hand-tab'; b.type = 'button';
    const grip = document.createElement('i'); grip.className = 'ht-grip'; grip.setAttribute('aria-hidden', 'true'); const txt = document.createElement('span'); txt.className = 'ht-txt'; b.append(grip, txt);
    const label = () => { const n = (state && state.hand) ? state.hand.length : 0, t = document.body.classList.contains('hand-tuck'); txt.textContent = (t ? 'Show hand' : 'Hide hand') + ` (${n})`; b.setAttribute('aria-label', t ? 'Raise the hand' : 'Tuck the hand away'); b.setAttribute('aria-expanded', String(!t)); };
    const setTuck = on => { const r = hw.getBoundingClientRect(); document.documentElement.style.setProperty('--tuck', Math.max(0, Math.round(r.height - b.offsetHeight)) + 'px'); document.body.classList.toggle('hand-tuck', on); label(); try { render(); } catch (er) { /* no game */ } };
    window.__handTuck = setTuck;
    let y0 = null, moved = false;
    b.addEventListener('pointerdown', e => { y0 = e.clientY; moved = false; });
    b.addEventListener('pointermove', e => { if (y0 === null) return; const dy = e.clientY - y0; if (Math.abs(dy) > 24 && !moved) { moved = true; setTuck(dy > 0); } });
    b.addEventListener('pointerup', () => { y0 = null; });
    b.addEventListener('click', e => { e.stopPropagation(); if (moved) { moved = false; return; } setTuck(!document.body.classList.contains('hand-tuck')); });
    hw.prepend(b); label(); new MutationObserver(label).observe(document.getElementById('row-hand') || hw, { childList: true, subtree: true });
    window.__placeHandTab = () => {};   // the old floating tab was moved by a timer; the handle is part of the tray now
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mk); else mk();
})();
