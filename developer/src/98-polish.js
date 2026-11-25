// ---- v0.99.92 Polish: attack arrows and damage numbers in combat, a celebration on a win, sounds for each Library room,
// and a few things on the desk in each room. All of it is drawn and synthesised by the app (no images, no audio files) and all of
// it steps aside when motion is reduced or sound is off.
function polishMotion() { try { return !(reducedMotion() || document.body.classList.contains('a11y-calm') || animOn('ui') === false); } catch (e) { return true; } }
// combat (v0.99.94 refined): each attacker lunges toward your opponent, a thin arrow with a soft trail runs to their life total,
// and as it lands the life box flashes and the damage number pops out of it (one after another, not on top of the cards)
function combatFx(hits) {
  if (!polishMotion() || !hits || !hits.length) return;
  const box = document.querySelector('#oppBox'), num = document.querySelector('#oppNum'), tgt = num || box, tr = tgt && tgt.getBoundingClientRect(), br = box ? box.getBoundingClientRect() : tr; if (!tr || !tr.width) return;
  const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'cbfx'); svg.setAttribute('width', innerWidth); svg.setAttribute('height', innerHeight);
  svg.innerHTML = '<defs><marker id="cbHead" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse"><path d="M0 1 L10 5 L0 9 z" fill="#ff5a36"/></marker></defs>';
  document.body.append(svg);
  const tx = tr.left + tr.width / 2, ty = tr.top + tr.height / 2, step = 140; let i = 0;
  for (const { id, dmg } of hits) {
    const el = document.querySelector(`#mat .card[data-id="${id}"]`); if (!el) continue; const r = el.getBoundingClientRect();
    const sx = r.left + r.width / 2, sy = r.top + r.height * .25, ex = tx + (i % 3 - 1) * 6, ey = tr.bottom + 2, mx = (sx + ex) / 2 + (sx < ex ? -40 : 40), my = Math.min(sy, ey) - 50, delay = i * step;
    const d = `M${sx} ${sy} Q${mx} ${my} ${ex} ${ey}`;
    const g = document.createElementNS(NS, 'linearGradient'); g.id = 'cbGrad' + i; g.setAttribute('gradientUnits', 'userSpaceOnUse'); g.setAttribute('x1', sx); g.setAttribute('y1', sy); g.setAttribute('x2', ex); g.setAttribute('y2', ey);
    g.innerHTML = '<stop offset="0" stop-color="#ffd27a" stop-opacity=".35"/><stop offset=".5" stop-color="#ffb04a"/><stop offset="1" stop-color="#ff4b2b"/>'; svg.querySelector('defs').append(g);
    const trail = document.createElementNS(NS, 'path'), p = document.createElementNS(NS, 'path'); trail.setAttribute('d', d); p.setAttribute('d', d);
    trail.setAttribute('class', 'cb-trail'); trail.setAttribute('stroke', `url(#cbGrad${i})`); p.setAttribute('class', 'cb-arrow'); p.setAttribute('stroke', `url(#cbGrad${i})`); p.setAttribute('marker-end', 'url(#cbHead)');
    svg.append(trail, p); const len = p.getTotalLength();
    for (const x of [p, trail]) { x.style.strokeDasharray = len; x.style.strokeDashoffset = len; x.style.setProperty('--len', len); x.style.animationDelay = `${delay}ms, ${delay + 750}ms`; }
    // the attacker leans in toward the target
    const dx = ex - sx, dy = ey - sy, dl = Math.hypot(dx, dy) || 1;
    setTimeout(() => { el.style.setProperty('--lx', (dx / dl * 12).toFixed(1) + 'px'); el.style.setProperty('--ly', (dy / dl * 12).toFixed(1) + 'px'); el.classList.remove('cb-lunge'); void el.offsetWidth; el.classList.add('cb-lunge'); setTimeout(() => el.classList.remove('cb-lunge'), 420); }, delay);
    // impact: the life box flashes and one running total pops below the life number (−2, then −4 …), never numbers on top of each other
    const sub = hits.slice(0, i + 1).reduce((a, x) => a + x.dmg, 0);
    setTimeout(() => { if (box) { box.classList.remove('cb-hit'); void box.offsetWidth; box.classList.add('cb-hit'); setTimeout(() => box.classList.remove('cb-hit'), 480); }
      let n = document.getElementById('cbTotal'); if (n) n.remove(); n = h('div', { id: 'cbTotal', class: 'cb-num', text: '\u2212' + sub, style: `left:${tx}px;top:${br.bottom + 20}px` }); document.body.append(n); setTimeout(() => n.remove(), 1200);
      try { sfx('hit'); } catch (e) {} }, delay + 400);
    i++;
  }
  setTimeout(() => svg.remove(), 1300 + i * step);
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
  ambStop(); const so = settings.sound; if (!so || !so.on || so.ambience === false || !libClassic()) return;   // v0.99.99 room sounds belong to the 3D room
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
function ambPlaying() { return ambNodes.length > 0 && !!ambTimer; }
