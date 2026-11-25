// ---- v0.99.92 Polish: attack arrows and damage numbers in combat, a celebration on a win, sounds for each Library room,
// and a few things on the desk in each room. All of it is drawn and synthesised by the app (no images, no audio files) and all of
// it steps aside when motion is reduced or sound is off.
function polishMotion() { try { return !(reducedMotion() || document.body.classList.contains('a11y-calm') || animOn('ui') === false); } catch (e) { return true; } }
// combat: an arrow from each creature that dealt damage to your opponent's life box, then the number
function combatFx(hits) {
  if (!polishMotion() || !hits || !hits.length) return;
  const tgt = document.querySelector('#oppBox'), tr = tgt && tgt.getBoundingClientRect(); if (!tr || !tr.width) return;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'cbfx'); svg.setAttribute('width', innerWidth); svg.setAttribute('height', innerHeight);
  svg.innerHTML = '<defs><marker id="cbHead" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#ff6a3d"/></marker><filter id="cbGlow"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>';
  document.body.append(svg);
  const tx = tr.left + tr.width / 2, ty = tr.top + tr.height / 2; let i = 0;
  for (const { id, dmg } of hits) {
    const el = document.querySelector(`#mat .card[data-id="${id}"]`); if (!el) continue; const r = el.getBoundingClientRect();
    const sx = r.left + r.width / 2, sy = r.top + r.height * .3, mx = (sx + tx) / 2 + (sx < tx ? -60 : 60), my = Math.min(sy, ty) - 80;
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', `M${sx} ${sy} Q${mx} ${my} ${tx} ${ty + 8}`); p.setAttribute('class', 'cb-arrow'); p.setAttribute('marker-end', 'url(#cbHead)'); p.setAttribute('filter', 'url(#cbGlow)');
    p.style.animationDelay = (i * 0.12) + 's'; svg.append(p);
    const len = p.getTotalLength(); p.style.strokeDasharray = len; p.style.strokeDashoffset = len;
    const n = h('div', { class: 'cb-num', text: '−' + dmg, style: `left:${sx}px;top:${r.top}px;animation-delay:${i * 0.12}s` }); document.body.append(n); setTimeout(() => n.remove(), 1600);
    i++;
  }
  setTimeout(() => { try { sfx('hit'); } catch (e) {} }, 520);
  setTimeout(() => svg.remove(), 1500 + i * 120);
}
// a win: gold confetti over the lethal message
function winConfetti() {
  if (!polishMotion()) return;
  const box = h('div', { class: 'confetti', 'aria-hidden': 'true' }); const cols = ['#f0d48c', '#e3b95c', '#fff1bd', '#ff9d6e', '#8fd3ff', '#b4f0a0'];
  for (let k = 0; k < 90; k++) box.append(h('i', { style: `left:${Math.random() * 100}%;--dx:${(Math.random() - .5) * 220}px;--r:${(Math.random() - .5) * 900}deg;--d:${(1.6 + Math.random() * 1.6).toFixed(2)}s;--w:${(Math.random() * .5).toFixed(2)}s;background:${cols[k % cols.length]};width:${5 + Math.random() * 6}px;height:${8 + Math.random() * 8}px` }));
  document.body.append(box); setTimeout(() => box.remove(), 3800);
}
// ---- the sound of each Library room (only while the Library is open, only with sound on)
let ambTimer = null, ambNodes = [];
function ambStop() { clearInterval(ambTimer); ambTimer = null; for (const n of ambNodes) { try { n.stop ? n.stop() : n.disconnect(); } catch (e) {} } ambNodes = []; }
function ambStart() {
  ambStop(); const so = settings.sound; if (!so || !so.on || so.ambience === false) return;
  const ac = audio(); if (!ac) return; if (ac.state === 'suspended') document.addEventListener('pointerdown', () => { try { ac.resume(); } catch (e) {} }, { once: true });
  const room = typeof hallRoom === 'function' ? hallRoom() : 'library', vol = Math.max(0, Math.min(1, so.vol === undefined ? .5 : so.vol)) * .22;
  const out = ac.createGain(); out.gain.value = vol; out.connect(ac.destination); ambNodes.push(out);
  const noiseBuf = (() => { const len = ac.sampleRate * 2, b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; return b; })();
  const bed = (f, q, g) => { const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q; const gg = ac.createGain(); gg.gain.value = g; s.connect(bp); bp.connect(gg); gg.connect(out); s.start(); ambNodes.push(s); return gg; };
  const blip = (f1, f2, dur, g, type) => { const t = ac.currentTime, o = ac.createOscillator(), gg = ac.createGain(); o.type = type || 'sine'; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + dur); gg.gain.setValueAtTime(.0001, t); gg.gain.exponentialRampToValueAtTime(g, t + .02); gg.gain.exponentialRampToValueAtTime(.0001, t + dur); o.connect(gg); gg.connect(out); o.start(t); o.stop(t + dur + .05); };
  const crack = g => { const t = ac.currentTime, s = ac.createBufferSource(); s.buffer = noiseBuf; const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800; const gg = ac.createGain(); gg.gain.setValueAtTime(g, t); gg.gain.exponentialRampToValueAtTime(.0001, t + .05 + Math.random() * .06); s.connect(hp); hp.connect(gg); gg.connect(out); s.start(t, Math.random()); s.stop(t + .15); };
  if (room === 'dungeon') { bed(220, .7, .5); ambTimer = setInterval(() => { if (Math.random() < .7) crack(.5 + Math.random() * .5); if (Math.random() < .04) blip(70, 55, 2.2, .25, 'sine'); }, 160); }
  else if (room === 'grove') { bed(1200, .4, .18); ambTimer = setInterval(() => { if (Math.random() < .12) { const f = 2400 + Math.random() * 1600; blip(f, f * 1.25, .09, .35); setTimeout(() => blip(f * 1.1, f * .9, .11, .3), 120); } }, 400); }
  else if (room === 'castle') { const w = bed(400, .5, .35); ambTimer = setInterval(() => { try { w.gain.setTargetAtTime(.15 + Math.random() * .45, ac.currentTime, .8); } catch (e) {} }, 1200); }
  else if (room === 'tower') { bed(3000, 2, .05); ambTimer = setInterval(() => { if (Math.random() < .25) { const base = [523, 659, 784, 988, 1175][Math.floor(Math.random() * 5)]; blip(base, base, 1.8, .12, 'triangle'); } }, 700); }
  else { bed(600, .6, .12); ambTimer = setInterval(() => { if (Math.random() < .3) crack(.18); }, 500); }   // the Library: a quiet room and a fire somewhere
}
// ---- on the desk: two things for each room, drawn in SVG, standing either side of the open book
const DESK_OBJ = {
  library: ['<svg viewBox="0 0 70 120"><ellipse cx="35" cy="112" rx="26" ry="6" fill="#000" opacity=".35"/><path d="M14 108 h42 l-4 -10 h-34z" fill="#b8892f"/><rect x="28" y="40" width="14" height="60" rx="3" fill="#f3ead3"/><path d="M28 50 q4 8 2 16" stroke="#fff" stroke-width="2" fill="none" opacity=".6"/><line x1="35" y1="40" x2="35" y2="33" stroke="#222" stroke-width="1.4"/></svg>', '<svg viewBox="0 0 90 120"><ellipse cx="40" cy="112" rx="30" ry="6" fill="#000" opacity=".35"/><path d="M20 112 q-4 -30 8 -36 h24 q12 6 8 36z" fill="#1d2a3a"/><rect x="28" y="70" width="24" height="8" rx="2" fill="#0f1720"/><path d="M42 72 L74 8 q6 6 0 14 L46 74z" fill="#efe6cf"/><path d="M44 72 L72 14" stroke="#9a8a6a" stroke-width="1"/></svg>'],
  castle: ['<svg viewBox="0 0 70 120"><ellipse cx="35" cy="112" rx="22" ry="5" fill="#000" opacity=".35"/><path d="M20 110 h30 l-6 -6 h-18z" fill="#c9a24a"/><rect x="32" y="66" width="6" height="40" fill="#c9a24a"/><path d="M14 30 h42 q0 34 -21 38 q-21 -4 -21 -38z" fill="#d8b456"/><path d="M18 34 h34 q-2 22 -17 26 q-15 -4 -17 -26z" fill="#6e1414"/></svg>', '<svg viewBox="0 0 110 80"><ellipse cx="55" cy="72" rx="46" ry="6" fill="#000" opacity=".35"/><rect x="12" y="40" width="86" height="26" rx="13" fill="#e8dcbc"/><ellipse cx="12" cy="53" rx="8" ry="13" fill="#d9caa4"/><ellipse cx="98" cy="53" rx="8" ry="13" fill="#f2e9d2"/><circle cx="58" cy="54" r="9" fill="#9b1c1c"/><path d="M52 62 l-4 12 M64 62 l4 12" stroke="#9b1c1c" stroke-width="3"/></svg>'],
  dungeon: ['<svg viewBox="0 0 90 120"><ellipse cx="45" cy="112" rx="32" ry="6" fill="#000" opacity=".4"/><path d="M18 76 q0 -40 27 -40 q27 0 27 40 q0 14 -10 18 v12 h-34 v-12 q-10 -4 -10 -18z" fill="#d9d0bb"/><ellipse cx="34" cy="74" rx="8" ry="10" fill="#1b1612"/><ellipse cx="56" cy="74" rx="8" ry="10" fill="#1b1612"/><path d="M45 84 l-4 9 h8z" fill="#2a221b"/><path d="M33 100 v8 M39 100 v8 M45 100 v8 M51 100 v8 M57 100 v8" stroke="#8a8070" stroke-width="1.5"/><rect x="40" y="16" width="10" height="22" rx="2" fill="#efe4c4"/><path d="M38 38 q7 -6 14 0" fill="#e6d8b0"/></svg>', '<svg viewBox="0 0 90 80"><ellipse cx="45" cy="72" rx="36" ry="6" fill="#000" opacity=".4"/><path d="M8 60 q20 -14 40 0 q20 14 36 0" stroke="#5a5a60" stroke-width="6" fill="none" stroke-dasharray="10 4"/><circle cx="16" cy="58" r="7" fill="none" stroke="#6c6c74" stroke-width="3"/></svg>'],
  tower: ['<svg viewBox="0 0 90 120"><ellipse cx="45" cy="112" rx="28" ry="6" fill="#000" opacity=".4"/><path d="M24 110 l6 -18 h30 l6 18z" fill="#3a2a5a"/><circle cx="45" cy="62" r="30" fill="url(#crys)"/><defs><radialGradient id="crys" cx=".4" cy=".35"><stop offset="0" stop-color="#e8f0ff"/><stop offset=".45" stop-color="#8fa8ff"/><stop offset="1" stop-color="#3a2f8a"/></radialGradient></defs><ellipse cx="36" cy="50" rx="8" ry="5" fill="#fff" opacity=".6"/></svg>', '<svg viewBox="0 0 60 120"><ellipse cx="30" cy="112" rx="20" ry="5" fill="#000" opacity=".4"/><path d="M22 36 h16 v18 q16 10 16 30 q0 26 -24 26 q-24 0 -24 -26 q0 -20 16 -30z" fill="#7a3fd1" opacity=".85"/><path d="M8 84 q22 8 44 0 v4 q0 22 -22 22 q-22 0 -22 -22z" fill="#c06bff" opacity=".9"/><rect x="21" y="26" width="18" height="12" rx="2" fill="#8a5a2a"/></svg>'],
  grove: ['<svg viewBox="0 0 90 120"><ellipse cx="45" cy="112" rx="28" ry="6" fill="#000" opacity=".35"/><path d="M26 112 l-4 -30 h46 l-4 30z" fill="#9a5a34"/><rect x="20" y="78" width="50" height="8" rx="2" fill="#b56d40"/>' + Array.from({ length: 9 }, (_, i) => `<path d="M45 80 q${(i - 4) * 9} -${36 + (i % 3) * 10} ${(i - 4) * 14} -${44 + (i % 3) * 12}" stroke="#3f7a2c" stroke-width="3" fill="none"/>`).join('') + '</svg>', '<svg viewBox="0 0 80 90"><ellipse cx="40" cy="84" rx="28" ry="5" fill="#000" opacity=".35"/><path d="M30 84 v-20 h8 v20z" fill="#efe6d0"/><path d="M14 64 q20 -34 44 0z" fill="#c23b2a"/><circle cx="26" cy="56" r="3" fill="#fff"/><circle cx="40" cy="50" r="3" fill="#fff"/><circle cx="50" cy="58" r="2.5" fill="#fff"/><path d="M52 84 v-12 h5 v12z" fill="#efe6d0"/><path d="M46 72 q8 -16 18 0z" fill="#d44c37"/></svg>'] };
function deskObjectsEl(room) {
  const o = DESK_OBJ[room] || DESK_OBJ.library, box = h('div', { class: 'desk-objs', 'aria-hidden': 'true' });
  ['l', 'r'].forEach((side, i) => { const e = h('div', { class: 'desk-obj ' + side }); e.innerHTML = o[i]; box.append(e); });
  return box;
}
function ambPlaying() { return ambNodes.length > 0 && !!ambTimer; }
