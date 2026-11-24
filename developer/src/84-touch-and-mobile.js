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
  // the click that a browser sends after a drag or a press-and-hold is not a click
  document.addEventListener('click', e => { if (swallowClick && Date.now() - swallowClick < 600) { e.preventDefault(); e.stopPropagation(); swallowClick = 0; } }, true);
  // iOS has no right-click menu of its own to block, but its long-press callout and text selection would fight the press-and-hold
  document.addEventListener('contextmenu', e => { if (e.isTrusted && matchMedia('(pointer: coarse)').matches && !(e.target.closest && e.target.closest('input, textarea'))) e.preventDefault(); }, true);
})();
// phones held upright: the table needs the width, so ask for landscape
function phoneOrientationCheck() {
  const s = Math.min(screen.width, screen.height), portrait = matchMedia('(orientation: portrait)').matches;
  document.documentElement.classList.toggle('phone-portrait', s < 600 && portrait && matchMedia('(pointer: coarse)').matches);
}
if (typeof window !== 'undefined') { window.addEventListener('orientationchange', () => setTimeout(phoneOrientationCheck, 200)); window.addEventListener('resize', phoneOrientationCheck); setTimeout(phoneOrientationCheck, 0); }
