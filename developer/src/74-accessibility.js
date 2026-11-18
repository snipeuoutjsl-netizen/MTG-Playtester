// ---- Accessibility (v0.99.28): its own tab on the gear wheel. Every option has its own switch and is stored in settings.a11y.
//  scale     whole interface size (100-175 %)          contrast  high-contrast colours and thicker borders
//  calm      no animation, tilt, fan or scrolling      targets   larger buttons and click areas
//  focus     a strong focus outline for keyboard use   announce  the game log is also read out by screen readers (aria-live)
const A11Y_DEFAULT = { scale: 100, contrast: false, calm: false, targets: false, focus: false, announce: false };
const a11y = () => Object.assign({}, A11Y_DEFAULT, settings.a11y || {});
function applyA11y() {
  const a = a11y(), b = document.body; if (!b) return;
  b.classList.toggle('a11y-contrast', !!a.contrast); b.classList.toggle('a11y-calm', !!a.calm); b.classList.toggle('a11y-targets', !!a.targets); b.classList.toggle('a11y-focus', !!a.focus);
  const z = Math.max(100, Math.min(175, +a.scale || 100)) / 100; document.documentElement.style.zoom = z === 1 ? '' : String(z);
  let live = document.getElementById('srLive');
  if (a.announce && !live) { live = document.createElement('div'); live.id = 'srLive'; live.className = 'sr-only'; live.setAttribute('aria-live', 'polite'); live.setAttribute('role', 'log'); b.append(live); }
  if (live) live.hidden = !a.announce;
  A11Y_ANNOUNCE = !!a.announce;
}
let A11Y_ANNOUNCE = false, A11Y_LASTN = 0;
function a11yAnnounce() {   // read out the new log lines (called from render)
  if (!A11Y_ANNOUNCE || !state) return; const live = document.getElementById('srLive'); if (!live) return;
  const n = state.log.length; if (n < A11Y_LASTN) A11Y_LASTN = 0; const fresh = state.log.slice(A11Y_LASTN, n).slice(-6); A11Y_LASTN = n;
  if (fresh.length) live.textContent = fresh.join('. ');
}
function buildA11yTab() {
  const box = h('div'), save = () => { settings.a11y = a11y(); saveSettings(); applyA11y(); };
  const sw = (k, label, desc) => { const cb = h('input', { type: 'checkbox' }); cb.checked = !!a11y()[k]; cb.addEventListener('change', () => { settings.a11y = Object.assign(a11y(), { [k]: cb.checked }); save(); }); return h('label', { class: 'teachopt' }, cb, h('span', null, h('b', { text: label }), ' — ' + desc)); };
  const out = h('b', { text: a11y().scale + '%' }), rng = h('input', { type: 'range', min: '100', max: '175', step: '5', value: String(a11y().scale), 'aria-label': 'Interface size' });
  rng.addEventListener('input', () => { out.textContent = rng.value + '%'; }); rng.addEventListener('change', () => { settings.a11y = Object.assign(a11y(), { scale: +rng.value }); save(); });
  box.append(
    h('div', { class: 'fhead', text: 'Seeing the table' }),
    h('div', { class: 'teachopt' }, h('span', null, h('b', { text: 'Interface size ' }), out, ' — makes the whole game larger; 100% is the normal size'), rng),
    sw('contrast', 'High contrast', 'brighter text, stronger borders and darker panels'),
    h('div', { class: 'fhead', text: 'Moving and clicking' }),
    sw('calm', 'Calm motion', 'turns off animations, card tilt, the fanned hand and scrolling status text (it only decorates, the game plays the same)'),
    sw('targets', 'Larger click targets', 'bigger buttons, lists and controls'),
    sw('focus', 'Strong keyboard focus', 'a thick outline around whatever has keyboard focus (use Tab and Enter)'),
    h('div', { class: 'fhead', text: 'Screen readers' }),
    sw('announce', 'Read out the game log', 'new log lines are announced by a screen reader as they happen'),
    h('div', { class: 'small muted', style: 'margin-top:10px', text: 'More options are planned: colour-blind markers, full keyboard play and a text view of every zone. Tell us what would help you.' }));
  return box;
}
applyA11y();
