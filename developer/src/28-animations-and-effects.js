// ---------------------------------------------------------------- animations and effects (v0.58)
// Everything here only decorates: it never changes the game state. Each part has its own switch (Settings → Animations).
const UI_THEMES = [['default', 'Midnight (default)'], ['obsidian', 'Obsidian & gold'], ['abyss', 'Abyss blue'], ['forest', 'Forest'], ['neon', 'Neon'], ['parchment', 'Parchment'], ['light', 'Light'], ['cosmos', 'Pixel cosmos (lo-fi)'], ['deck', 'Match my deck']];
function applyUiTheme() {
  const b = document.body, t = settings.uiTheme || 'default';
  b.dataset.uitheme = t === 'deck' || t === 'set' ? 'default' : t;   // 'set' was a v0.87 option; it now falls back to the default theme
  const keys = ['--accent', '--accent-text', '--gold', '--line'];
  for (const k of keys) b.style.removeProperty(k);
  if (t === 'deck') { try { const d = getCurrentDeck(), cols = d ? deckColorsOf(d) : [], c = DECKBOX_COL[cols[0] || ''][1], c2 = DECKBOX_COL[cols[1] || cols[0] || ''][1];
    b.style.setProperty('--accent', c); b.style.setProperty('--gold', c2); b.style.setProperty('--accent-text', cols[0] === 'W' ? '#1c1a10' : '#0b0f14'); } catch (e) {} }
}
const ANIM_DEFS = [
  ['move', 'Card movement', 'Cards slide when drawn, played, tapped or sent to a graveyard or exile, and permanents pop in'],
  ['castFlight', 'Cast & resolve flight', 'A spell flies from your hand to the middle of the board when cast, stays there while it is on the stack, then flies to the battlefield (permanents) or the graveyard (instants, sorceries, countered spells). Needs Card movement. While on, it replaces the spotlight for your own spells'],
  ['spell', 'Spell spotlight', 'A lit-up card in the middle of the screen when a spell is cast, resolves or is countered'],
  ['life', 'Life effects', 'Rolling life numbers, a colour flash, a shake on big hits and floating +/- numbers'],
  ['turn', 'Turn banner & phase flash', 'A banner at the start of each turn and a flash when the phase changes'],
  ['fan', 'Hand fan', 'Cards in your hand sit in a gentle arc and lift when you hover them'],
  ['shuffle', 'Shuffle animation', 'A quick riffle shuffle over your library whenever it is shuffled (search effects, fetch lands, the Shuffle button)'],
  ['cardDrag', 'Physical card drag', 'Click and hold a card and it follows your mouse. Drop it on a zone it can go to; if it cannot be played or moved there it flies back to where it came from'],
  ['hand3d', '3D card tilt', 'Cards in your hand and on the battlefield tilt toward the mouse in 3D as you hover them, like the big card preview'],
  ['handFloat', 'Floating hand', 'The cards in your hand hover up and down a small amount, each at its own pace, with a soft drop shadow'],
  ['dice', 'Dice & coin tumble', 'Coin flips and die rolls spin and land on the real random result (off = the result just appears)'],
  ['bfFloat', 'Floating battlefield', 'Cards on the battlefield drift up and down a tiny amount, each at its own pace, with a deeper shadow so the board has depth']
];
const reducedMotion = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const aamt = k => { const v = settings.anim && settings.anim[k]; return v === undefined || isNaN(+v) ? 1 : +v; };
const aspd = () => Math.max(0.2, aamt('speed'));
function wa(el, frames, o) { o = { ...o }; const sp = aspd(); if (o.duration) o.duration /= sp; if (o.delay) o.delay /= sp; return el.animate(frames, o); }
function castFlightOn() { return animOn('castFlight') && animOn('move'); }
function animOn(k) { const a = settings.anim; return !!(a && a.on !== false && a[k] !== false && !reducedMotion()); }
const centerOf = sel => { const e = typeof sel === 'string' ? document.querySelector(sel) : sel; if (!e) return null; const r = e.getBoundingClientRect(); return r.width || r.height ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; };
const CARD_SEL = '#mat .card[data-id], #row-hand .card[data-id], #stackStage .ss-card[data-id]';
const flightFrom = new Map();   // id -> where a card was just before a state change that re-renders more than once (cast, resolve)
function noteFlightFrom(id, sel) {
  if (!castFlightOn()) return; const el = document.querySelector(sel); if (!el) return; const r = el.getBoundingClientRect(); if (!r.width) return;
  flightFrom.set(String(id), { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: el.offsetWidth, h: el.offsetHeight, t: getComputedStyle(el).transform, stage: !!el.closest('#stackStage'), at: performance.now() });
}
const flightCounter = new Set();   // ids of spells that were just countered: their flight to the graveyard is tinted red
let animPrev = null;
function animCapture() {
  if (animPrev) return;   // v0.96.16 several redraws inside one frame: keep the EARLIEST snapshot (the last settled layout); the animation is applied once, after layout
  if (!animOn('move') || !state) return;
  const cards = new Map(), nodes = new Map(); let n = 0;
  for (const el of document.querySelectorAll(CARD_SEL)) {
    const r = el.getBoundingClientRect(); if (!r.width) continue;
    cards.set(el.dataset.id, { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: el.offsetWidth, h: el.offsetHeight, t: getComputedStyle(el).transform, stage: !!el.closest('#stackStage') });
    if (n++ < 70) nodes.set(el.dataset.id, el.cloneNode(true));
  }
  animPrev = { cards, nodes };
}
function sparks(x, y, col, n, dist, dur) {
  if (reducedMotion()) return;
  n = Math.round(n * aamt('spark'));
  for (let i = 0; i < n; i++) {
    const s = document.createElement('i'); s.className = 'spark'; s.style.cssText = `left:${x}px;top:${y}px;background:${col};box-shadow:0 0 6px ${col}`;
    document.body.appendChild(s); const a = Math.random() * Math.PI * 2, d = dist * (0.5 + Math.random() * 0.7);
    const an = wa(s, [{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(0)`, opacity: 0 }], { duration: dur * (0.7 + Math.random() * 0.6), easing: 'cubic-bezier(.1,.7,.3,1)' });
    an.onfinish = () => s.remove(); setTimeout(() => s.remove(), (dur * 2) * 3);
  }
}
function animApply() {
  const prev = animPrev; animPrev = null; if (!prev || !state || !animOn('move')) return;
  const now = [...document.querySelectorAll(CARD_SEL)], seen = new Set(), lib = centerOf('#libstack'), jobs = [];
  let newHand = 0;
  // v0.99.35 the opening hand is dealt one card at a time; after a mulligan the old hand goes back to the library first
  const opening = document.body.classList.contains('mullhand'), nowIds = new Set(now.map(e => e.dataset.id)), returning = [...prev.cards.keys()].some(id => !nowIds.has(id) && (findCard(+id) || {}).zone === 'library');
  const dealBase = opening ? (state && state.dealDelay ? state.dealDelay * aspd() : returning ? 420 : 0) : 0,   /* animation units: wa() divides by the speed setting, and dealDelay is real time */ dealStep = opening ? 170 : 80, dealDur = opening ? 560 : 480;
  for (const el of now) {
    const id = el.dataset.id; seen.add(id); const r = el.getBoundingClientRect(); if (!r.width) continue;
    let p = prev.cards.get(id); const ff = flightFrom.get(id); if (ff && performance.now() - ff.at < 4000) { p = ff; flightFrom.delete(id); }
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2, t = getComputedStyle(el).transform;
    if (p) {
      const dx = p.cx - cx, dy = p.cy - cy; if (Math.abs(dx) < 1.5 && Math.abs(dy) < 1.5 && p.t === t) continue;
      const dist = Math.hypot(dx, dy), staged = castFlightOn() && (p.stage || !!el.closest('#stackStage'));   // v0.90.1 to/from the centre stage
      const sc = el.offsetWidth && p.w ? p.w / el.offsetWidth : 1, scale = Math.abs(sc - 1) > .08 ? sc : 1;
      jobs.push(() => wa(el, [{ translate: `${dx}px ${dy}px`, scale: String(scale), transform: p.t, zIndex: staged ? 9000 : 'auto' }, { translate: '0px 0px', scale: '1', transform: t, zIndex: staged ? 9000 : 'auto' }], { duration: staged ? 640 : dist > 220 ? 460 : dist > 40 ? 340 : 220, easing: staged ? 'cubic-bezier(.3,.7,.2,1)' : 'cubic-bezier(.25,.8,.25,1)' }));
    } else if (el.closest('#row-hand') && lib) {
      const dx = lib.x - cx, dy = lib.y - cy, k = newHand++, delay = dealBase + Math.min(k, 8) * dealStep;
      jobs.push(() => { const an = wa(el, [{ translate: `${dx}px ${dy}px`, scale: '.4', rotate: '-10deg', opacity: opening ? 0 : 0.2 }, ...(opening ? [{ opacity: 1, offset: 0.12 }] : []), { translate: '0px 0px', scale: '1', rotate: '0deg', opacity: 1 }], { duration: dealDur, delay, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
        if (opening && an) setTimeout(() => { try { sfx('draw'); } catch (e) { /* sound only */ } }, delay / aspd()); });
    } else {
      jobs.push(() => { wa(el, [{ transform: `${t === 'none' ? '' : t} scale(.55) translateY(-26px)`, opacity: 0, filter: 'brightness(2.2)' }, { transform: `${t === 'none' ? '' : t} scale(1.06)`, opacity: 1, filter: 'brightness(1.5)', offset: 0.6 }, { transform: t === 'none' ? 'none' : t, opacity: 1, filter: 'brightness(1)' }], { duration: 380, easing: 'ease-out' });
        const col = (SPOT_COL[spotKey(el)] || SPOT_COL['']); sparks(cx, cy, col[0], 7, 46, 520); });
    }
  }
  const gone = [...prev.cards.keys()].filter(id => !seen.has(id));
  if (jobs.length + gone.length > 45) return;
  jobs.forEach(j => j());
  if (opening && newHand) {   // hold the Opening hand prompt back until the last card has landed, then check the fit once more
    const total = (dealBase + (Math.min(newHand, 9) - 1) * dealStep + dealDur) / aspd() + 60;   // v0.99.36 real time: the animations run at the speed setting
    if (state) state.dealDelay = 0;   // used once, by this deal
    document.body.classList.add('dealing'); clearTimeout(animApply.dealT);
    animApply.dealT = setTimeout(() => { document.body.classList.remove('dealing'); scheduleLayout(); }, total);
  }
  for (const id of gone) {
    const p = prev.cards.get(id), node = prev.nodes.get(id); if (!node) continue;
    const f = findCard(+id); let dest = null;
    if (f) dest = f.zone === 'graveyard' ? centerOf('#pile-graveyard .stack') : f.zone === 'exile' ? centerOf('#pile-exile .stack') : f.zone === 'library' ? centerOf('#libstack') : (f.zone === 'hand' ? null : null);
    if (!dest && state.stack.some(s => s.id === +id)) dest = centerOf('#stackBox');
    node.removeAttribute('data-id'); node.removeAttribute('title'); node.classList.add('ghost');
    if (flightCounter.has(+id)) { node.style.filter = 'sepia(1) hue-rotate(-35deg) saturate(3.2) brightness(.85)'; flightCounter.delete(+id); }
    node.style.cssText = `position:fixed;left:${p.cx - p.w / 2}px;top:${p.cy - p.h / 2}px;width:${p.w}px;height:${p.h}px;margin:0;z-index:9000;pointer-events:none;transform:${p.t === 'none' ? 'none' : p.t}`;
    document.body.appendChild(node);
    const base = p.t === 'none' ? '' : p.t, to = dest ? `translate(${dest.x - p.cx}px,${dest.y - p.cy}px) scale(.3) rotate(20deg)` : `${base} scale(.7)`;
    const an = wa(node, [{ transform: base || 'none', opacity: 1 }, { transform: to, opacity: 0.05 }], { duration: dest ? 520 : 320, easing: 'cubic-bezier(.5,0,.8,.5)' });
    an.onfinish = () => node.remove(); setTimeout(() => node.remove(), (1200) * 3);
  }
}
// ---- spell spotlight
const SPOT_COL = { W: ['#fff6c8', '#e3c964'], U: ['#8ec5ff', '#2f6fc4'], B: ['#c3a6e6', '#5a3c82'], R: ['#ffb08a', '#d9452f'], G: ['#9be8ab', '#2f9a4a'], multi: ['#ffe27a', '#d4a935'], '': ['#e6e9ee', '#8f98a6'] };
function spotKey(elOrCard) {
  let k = '';
  if (elOrCard && elOrCard.nodeType === 1) { const m = /\bc-(W|U|B|R|G|multi)\b/.exec(elOrCard.className); k = m ? m[1] : ''; }
  else if (elOrCard && !elOrCard.opp) { try { const c = colorClass(elOrCard); k = /^(W|U|B|R|G|multi)$/.test(c) ? c : ''; } catch (e) { k = ''; } }
  return k;
}
function spotCardEl(c) {
  const im = !c.opp && !c.token && showImages ? imgFor(c.name) : null;
  if (im && im.front) return h('img', { class: 'spot-img', src: im.front, alt: c.name });
  let el = null;
  if (!c.opp) { try { el = cardEl(c, 'stack'); el.classList.remove('sel', 'bsel', 'instant-speed'); el.removeAttribute('data-id'); el.removeAttribute('draggable'); } catch (e) { el = null; } }
  if (!el) el = h('div', { class: 'card c-art' }, h('div', { class: 'ctop' }, h('span', { class: 'cname', text: c.name })), h('div', { class: 'ctype', text: c.opp ? "Opponent's spell" : '' }));
  return h('div', { class: 'spot-tile' }, el);
}
function spotlight(c, kind, from) {
  if (!animOn('spell') || !c) return;
  if (castFlightOn() && !c.token) return;   // v0.90.1: the card itself flies hand -> stage -> zone instead
  const key = spotKey(c), col = SPOT_COL[key] || SPOT_COL[''], W = innerWidth, H = innerHeight;
  const wrap = h('div', { class: 'spot spot-' + kind, style: `--sc1:${col[0]};--sc2:${col[1]}` },
    h('div', { class: 'spot-rays' }), spotCardEl(c), kind === 'counter' ? h('div', { class: 'spot-x', text: '✕' }) : null,
    h('div', { class: 'spot-label', text: kind === 'cast' ? (c.opp ? 'Opponent casts' : 'Cast') : kind === 'counter' ? 'Countered' : 'Resolves' }));
  { const z = aamt('spotSize'); wrap.style.width = (200 * z) + 'px'; wrap.style.margin = `${-150 * z}px 0 0 ${-100 * z}px`; }
  document.body.appendChild(wrap);
  const cx = W * 0.4, cy = H * 0.42, sx = from ? from.x - cx : 0, sy = from ? from.y - cy : H * 0.35, stack = centerOf('#stackBox') || { x: W - 120, y: 130 };
  let frames, dur;
  if (kind === 'cast') { dur = 1250; frames = [
    { transform: `translate(${sx}px,${sy}px) scale(.4)`, opacity: 0 },
    { transform: 'translate(0,0) scale(1.12)', opacity: 1, offset: 0.26 },
    { transform: 'translate(0,0) scale(1)', opacity: 1, offset: 0.72 },
    { transform: `translate(${stack.x - cx}px,${stack.y - cy}px) scale(.18)`, opacity: 0 }]; }
  else if (kind === 'counter') { dur = 1150; frames = [
    { transform: 'translate(0,0) scale(.85)', opacity: 0 }, { transform: 'translate(0,0) scale(1)', opacity: 1, offset: 0.15 },
    { transform: 'translate(-14px,0) scale(1)', offset: 0.25 }, { transform: 'translate(14px,0) scale(1)', offset: 0.35 }, { transform: 'translate(-10px,0) scale(1)', offset: 0.45 }, { transform: 'translate(8px,0) scale(1)', opacity: 1, offset: 0.55 },
    { transform: 'translate(0,30px) scale(.7) rotate(8deg)', opacity: 0 }]; }
  else { dur = 950; frames = [
    { transform: 'translate(0,0) scale(.9)', opacity: 0 }, { transform: 'translate(0,0) scale(1.08)', opacity: 1, offset: 0.3 },
    { transform: 'translate(0,-10px) scale(1.04)', opacity: 1, offset: 0.55 }, { transform: 'translate(0,-90px) scale(1.2)', opacity: 0 }]; }
  const an = wa(wrap, frames, { duration: dur, easing: 'ease-in-out' });
  an.onfinish = () => wrap.remove(); setTimeout(() => wrap.remove(), (dur + 600) * 3);
  setTimeout(() => sparks(cx, cy, col[0], kind === 'counter' ? 16 : 22, 150, 800), dur * 0.22 / aspd());
  if (kind === 'counter') setTimeout(() => sparks(cx, cy, '#ff5a4f', 18, 130, 700), dur * 0.5 / aspd());
}
// ---- life effects
let lifePrev = { you: null, opp: null };
function lifeFx(which, el, val) {
  if (!el) return;
  const prev = lifePrev[which]; lifePrev[which] = val;
  if (prev === null || prev === val || !animOn('life')) { if (!el._rolling || prev === null || !animOn('life')) el.textContent = val; return; }
  const d = val - prev, up = d > 0, tok = (el._tok = (el._tok || 0) + 1);
  if (Math.abs(d) > 1) { el._rolling = true; const t0 = performance.now(), dur = Math.min(700, 260 + Math.abs(d) * 40) / aspd();
    const step = now => { if (el._tok !== tok) return; const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(prev + d * e); if (k < 1) requestAnimationFrame(step); else { el.textContent = val; el._rolling = false; } };
    requestAnimationFrame(step); } else el.textContent = val;
  el.classList.remove('lf-up', 'lf-down'); void el.offsetWidth; el.classList.add(up ? 'lf-up' : 'lf-down'); setTimeout(() => el.classList.remove('lf-up', 'lf-down'), 800);
  const r = el.getBoundingClientRect(), f = document.createElement('div'); f.className = 'lifefloat ' + (up ? 'up' : 'down'); f.textContent = (up ? '+' : '−') + Math.abs(d);
  f.style.cssText = `left:${r.left + r.width / 2}px;top:${r.top}px`; document.body.appendChild(f);
  const an = wa(f, [{ transform: 'translate(-50%,0) scale(.7)', opacity: 0 }, { transform: 'translate(-50%,-14px) scale(1.15)', opacity: 1, offset: 0.2 }, { transform: 'translate(-50%,-52px) scale(1)', opacity: 0 }], { duration: 1100, easing: 'ease-out' });
  an.onfinish = () => f.remove(); setTimeout(() => f.remove(), (1600) * 3);
  const box = el.closest('.hudbox'); if (box && d <= -3) wa(box, [{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' }], { duration: 340 });
  if (val <= 0 && prev > 0) lethalFx(which);
}
function lethalFx(which, title, sub) {
  const you = which === 'you', o = h('div', { class: 'lethal ' + (you ? 'you' : 'opp') }, h('div', { class: 'lethal-t', text: title || (you ? 'You are at 0 life' : 'Opponent is at 0 life') }), h('div', { class: 'lethal-s', text: sub || (you ? 'In a real game you would lose here.' : 'Lethal!') }));
  document.body.appendChild(o); const an = wa(o, [{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: 2600 });
  an.onfinish = () => o.remove(); setTimeout(() => o.remove(), (3200) * 3);
  sparks(innerWidth / 2, innerHeight / 2, you ? '#ff5a4f' : '#ffe27a', 40, 360, 1200);
  setTimeout(() => { try { showGameEnd(which, title, sub); } catch (e) { /* the pop-up is a convenience */ } }, 2500);   // v0.96.21 the "Next round" screen
}
// ---- turn banner and phase flash
function turnBanner() {
  if (!animOn('turn') || !state) return;
  const b = h('div', { class: 'turnbanner' }, h('b', { text: `Turn ${state.turn}` }), h('span', { text: state.onPlay || state.turn > 1 ? 'Your turn' : 'Your turn (on the draw)' }));
  document.body.appendChild(b);
  const an = wa(b, [{ transform: 'translateX(-60vw)', opacity: 0 }, { transform: 'translateX(0)', opacity: 1, offset: 0.22 }, { transform: 'translateX(0)', opacity: 1, offset: 0.72 }, { transform: 'translateX(60vw)', opacity: 0 }], { duration: 1500, easing: 'ease-in-out' });
  an.onfinish = () => b.remove(); setTimeout(() => b.remove(), (2200) * 3);
}
let lastStepShown = null;
function phaseFlash() {
  const id = state && state.phase === 'play' ? state.step : null, was = lastStepShown; lastStepShown = id;
  if (id === null || was === null || was === id || !animOn('turn')) return;
  const box = $('#phases'); if (!box) return; box.classList.remove('phase-flash'); void box.offsetWidth; box.classList.add('phase-flash'); setTimeout(() => box.classList.remove('phase-flash'), 900);
}
// ---- hand fan
function applyFan() {
  const row = $('#row-hand'); if (!row) return; const cards = [...row.children], on = animOn('fan') && cards.length > 1;
  row.classList.toggle('fan', on);
  for (const c of cards) { c.style.removeProperty('--fan-rot'); c.style.removeProperty('--fan-y'); }
  if (!on) return;
  const n = cards.length, k = aamt('fanAmt'), maxRot = Math.min(8, 1.4 * n) * k;
  cards.forEach((c, i) => { const t = (i / (n - 1)) * 2 - 1; c.style.setProperty('--fan-rot', (t * maxRot).toFixed(1) + 'deg'); c.style.setProperty('--fan-y', ((t * t * 7 - 4) * k).toFixed(1) + 'px'); });
}
