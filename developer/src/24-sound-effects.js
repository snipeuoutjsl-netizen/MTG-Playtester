// ---------------------------------------------------------------- sound effects (v0.51)
// Everything is synthesised with the Web Audio API, so there are no audio files and it works offline.
const SOUND_DEFS = [
  ['draw', 'Drawing a card', 'A soft card swish'],
  ['cast', 'Casting a spell', 'A rising magical sweep as the spell goes on the stack'],
  ['enter', 'Entering the battlefield', 'A low thump when a permanent or token arrives'],
  ['land', 'Playing a land', 'A wooden clack'],
  ['resolve', 'A spell or ability resolving', 'A small chime'],
  ['counter', 'A spell being countered', 'A falling tone']
];
let audioCtx = null, reverbNode = null; const lastSnd = {};
// A shared soft room reverb: a generated impulse (decaying stereo noise), so no audio files are needed.
function reverbIn(ac) {
  if (reverbNode && reverbNode.context === ac) return reverbNode;
  const len = Math.floor(ac.sampleRate * 2.4), buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
  const cv = ac.createConvolver(); cv.buffer = buf;
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
  cv.connect(lp); lp.connect(ac.destination); reverbNode = cv; return cv;
}
function audio() {
  try { if (!audioCtx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; audioCtx = new AC(); } if (audioCtx.state === 'suspended') audioCtx.resume(); return audioCtx; } catch (e) { return null; }
}
function sfx(kind) {
  try {
    const so = settings.sound; if (!so || !so.on || so[kind] === false || !state) return;
    const now = performance.now(); if (lastSnd[kind] && now - lastSnd[kind] < 60) return; lastSnd[kind] = now;
    const ac = audio(); if (!ac) return;
    const t0 = ac.currentTime, vol = Math.max(0, Math.min(1, so.vol === undefined ? 0.5 : so.vol));
    const out = ac.createGain(); out.gain.value = vol * 0.5; out.connect(ac.destination);
    const wet = ac.createGain(); wet.gain.value = 0.55; out.connect(wet); wet.connect(reverbIn(ac));   // soft reverb on every effect
    const tone = (type, f1, f2, start, dur, peak, atk) => {
      const o = ac.createOscillator(), g = ac.createGain(); o.type = type;
      o.frequency.setValueAtTime(f1, t0 + start); if (f2 !== f1) o.frequency.exponentialRampToValueAtTime(f2, t0 + start + dur);
      g.gain.setValueAtTime(0.0001, t0 + start); g.gain.exponentialRampToValueAtTime(peak, t0 + start + (atk || 0.01)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
      o.connect(g); g.connect(out); o.start(t0 + start); o.stop(t0 + start + dur + 0.02);
    };
    const noise = (start, dur, f1, f2, q, peak) => {
      const len = Math.max(1, Math.floor(ac.sampleRate * dur)), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ac.createBufferSource(); src.buffer = buf;
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q; f.frequency.setValueAtTime(f1, t0 + start); f.frequency.exponentialRampToValueAtTime(f2, t0 + start + dur);
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t0 + start); g.gain.exponentialRampToValueAtTime(peak, t0 + start + dur * 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
      src.connect(f); f.connect(g); g.connect(out); src.start(t0 + start); src.stop(t0 + start + dur + 0.02);
    };
    if (kind === 'draw') { noise(0, 0.12, 1800, 5200, 1.2, 0.9); tone('sine', 900, 1400, 0.02, 0.06, 0.05); }
    else if (kind === 'cast') { noise(0, 0.5, 260, 700, 0.6, 0.22); tone('sine', 196, 247, 0, 0.55, 0.22, 0.14); tone('sine', 294, 370, 0.05, 0.55, 0.08, 0.16); }
    else if (kind === 'enter') { tone('sine', 150, 50, 0, 0.22, 0.9); noise(0, 0.07, 700, 300, 0.8, 0.5); }
    else if (kind === 'land') { tone('square', 220, 120, 0, 0.05, 0.25); noise(0, 0.05, 1800, 900, 1.5, 0.7); tone('sine', 140, 80, 0.01, 0.12, 0.5); }
    else if (kind === 'resolve') { tone('sine', 880, 880, 0, 0.18, 0.3); tone('sine', 1320, 1320, 0.07, 0.25, 0.25); }
    else if (kind === 'counter') { tone('sawtooth', 520, 90, 0, 0.3, 0.3); noise(0, 0.12, 900, 200, 1, 0.3); }
  } catch (e) { /* sound is never allowed to break the game */ }
}


// ---- background music: an endless, generated ambient loop (slow pad chords with a few soft bell notes)
const MUSIC_CHORDS = [[45, 57, 60, 64], [41, 57, 60, 65], [48, 55, 60, 64], [43, 55, 59, 62]];   // Am  F  C  G
const MUSIC_BELLS = [69, 72, 74, 76, 79, 81];
const midiHz = m => 440 * Math.pow(2, (m - 69) / 12);
let music = null;
function musicVolume() { return Math.max(0, Math.min(1, settings.sound.musicVol === undefined ? 0.4 : settings.sound.musicVol)) * 0.22; }
function startMusic() {
  if (music || !settings.sound.on || !settings.sound.music) return;
  const ac = audio(); if (!ac) return;
  const bus = ac.createGain(); bus.gain.value = 0.0001; bus.gain.linearRampToValueAtTime(musicVolume() || 0.0001, ac.currentTime + 3);
  const M = { bus, ac, next: ac.currentTime + 0.3, i: 0, timer: null, style: musicStyleId() }; music = M;
  if (LOFI_SONGS[M.style]) { startLofi(M, ac, bus); return; }
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; bus.connect(lp); lp.connect(ac.destination);
  const wet = ac.createGain(); wet.gain.value = 0.9; lp.connect(wet); wet.connect(reverbIn(ac));
  const CH = 10;   // seconds per chord
  const note = (hz, t, dur, peak, atk, type) => {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = hz;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + atk); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.05);
  };
  const chord = t => {
    for (const m of MUSIC_CHORDS[M.i % MUSIC_CHORDS.length]) { const hz = midiHz(m); note(hz, t, CH + 3, 0.16, 3.5, 'sine'); note(hz * 1.004, t, CH + 3, 0.08, 3.5, 'triangle'); }
    let bt = t + 1 + Math.random() * 1.5;
    while (bt < t + CH - 1) { if (Math.random() < 0.75) note(midiHz(MUSIC_BELLS[Math.floor(Math.random() * MUSIC_BELLS.length)]), bt, 3.2, 0.05, 0.02, 'sine'); bt += 2 + Math.random() * 3; }
    M.i++;
  };
  M.timer = setInterval(() => { try { while (M.next < ac.currentTime + 3) { chord(M.next); M.next += CH; } } catch (e) {} }, 500);
}
// v0.93.1 "Cosmic low-fi": a generated lo-fi loop. Swung drums, a warm electric-piano chord on every bar, a soft bass, tape wobble, vinyl crackle and a few shimmering high notes
// with a long reverb. Same offline approach as the ambient loop (no files). Chords are 7ths and 9ths so it never sounds finished.
const LOFI_PROGS = [
  [[50, 57, 60, 64, 67], [43, 55, 59, 62, 65], [48, 55, 59, 64, 67], [45, 57, 60, 64, 67]],     // Dm9  Gm7  Cmaj7  Am9 (voicings as MIDI)
  [[53, 60, 64, 67, 71], [52, 59, 62, 67, 71], [50, 57, 60, 64, 67], [48, 55, 59, 64, 67]],     // Fmaj9  Em7  Dm9  Cmaj7
  [[45, 57, 60, 64, 67], [41, 57, 60, 64, 69], [48, 55, 59, 62, 67], [43, 55, 59, 62, 66]]];    // Am9  Fmaj7  Cmaj7  G6
const LOFI_SPARK = [74, 76, 79, 81, 83, 86];
// v0.96.18 more generated songs. Each is a small recipe read by startLofi: tempo, swing, chord loops (MIDI voicings), the keys voice, the drum pattern, the tape colour and extras.
const LOFI_SONGS = {
  lofi: { label: 'Cosmic low-fi (beat, electric piano, vinyl)', bpm: 74, swing: 0.58, lp: 3200, voice: 'epiano', drums: 'lofi', progs: null },
  boombap: { label: 'Dusty boom-bap (hip-hop beat, chopped keys)', bpm: 86, swing: 0.6, lp: 2600, voice: 'stab', drums: 'boombap', sub: true,
    progs: [[[45, 57, 60, 64, 67], [45, 57, 60, 64, 67], [41, 57, 60, 64, 69], [43, 55, 59, 62, 65]], [[50, 57, 60, 64, 69], [50, 57, 60, 64, 69], [48, 55, 59, 64, 67], [43, 55, 58, 62, 65]]] },
  rain: { label: 'Rainy window (soft keys, rain, no drums)', bpm: 66, swing: 0.55, lp: 2400, voice: 'epiano', drums: 'rim', rain: true,
    progs: [[[48, 55, 59, 64, 67], [45, 55, 60, 64, 67], [41, 55, 60, 64, 69], [43, 55, 59, 62, 67]], [[53, 60, 64, 67, 71], [52, 59, 62, 67, 71], [45, 57, 60, 64, 67], [43, 55, 59, 62, 66]]] },
  jazzhop: { label: 'Midnight jazz-hop (9ths and 13ths, brush hats)', bpm: 80, swing: 0.62, lp: 3600, voice: 'epiano', drums: 'brush', walk: true,
    progs: [[[50, 60, 64, 67, 72], [43, 59, 62, 65, 69], [48, 59, 62, 67, 71], [45, 57, 60, 67, 71]], [[52, 59, 62, 67, 72], [45, 57, 61, 67, 71], [50, 57, 60, 64, 69], [43, 59, 62, 65, 71]]] },
  arcade: { label: 'Arcade chill (soft chiptune, light beat)', bpm: 90, swing: 0.5, lp: 4200, voice: 'chip', drums: 'lofi', arp: true,
    progs: [[[48, 55, 60, 64, 67], [45, 52, 57, 60, 64], [41, 48, 53, 57, 60], [43, 50, 55, 59, 62]], [[45, 52, 57, 60, 64], [41, 48, 53, 57, 60], [48, 55, 60, 64, 67], [43, 50, 55, 59, 62]]] },
  golden: { label: 'Golden hour (warm pluck, easy groove)', bpm: 92, swing: 0.57, lp: 3800, voice: 'pluck', drums: 'lofi',
    progs: [[[48, 55, 59, 64, 67], [43, 55, 59, 62, 69], [45, 57, 60, 64, 67], [41, 57, 60, 64, 65]], [[53, 60, 64, 67, 71], [48, 59, 64, 67, 71], [50, 57, 62, 65, 69], [43, 55, 59, 62, 65]]] }
};
const musicStyleId = () => LOFI_SONGS[settings.sound.musicStyle] ? settings.sound.musicStyle : 'ambient';
function startLofi(M, ac, bus) {
  const S = LOFI_SONGS[M.style] || LOFI_SONGS.lofi, BPM = S.bpm, BEAT = 60 / BPM, BAR = BEAT * 4, SWING = S.swing, PROGS = S.progs || LOFI_PROGS;
  const so = () => settings.sound;
  // tape colour: gentle saturation and a low-pass so everything sits a little dull and warm
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = S.lp; lp.Q.value = 0.4;
  const sat = ac.createWaveShaper(); { const n = 256, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n / 2) - 1; c[i] = Math.tanh(x * 1.8); } sat.curve = c; }
  const wowLfo = ac.createOscillator(), wowAmt = ac.createGain(); wowLfo.frequency.value = 0.35; wowAmt.gain.value = 9; wowLfo.connect(wowAmt); wowLfo.start();   // tape wobble in cents
  bus.disconnect(); bus.connect(sat); sat.connect(lp); lp.connect(ac.destination); const wet = ac.createGain(); wet.gain.value = 0.7; lp.connect(wet); wet.connect(reverbIn(ac));
  M.extra = [wowLfo];
  const noiseBuf = (() => { const b = ac.createBuffer(1, ac.sampleRate * 1, ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; })();
  const noise = (t, dur, type, freq, peak) => { const o = ac.createBufferSource(); o.buffer = noiseBuf; const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; const g = ac.createGain();
    g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(f); f.connect(g); g.connect(bus); o.start(t, Math.random() * 0.5); o.stop(t + dur + 0.02); };
  const kick = (t, v) => { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(115, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34); o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.4); };
  const keys = (hz, t, dur, peak) => {
    if (S.voice !== 'epiano') {   // stab = short, bright, chopped-sample keys; chip = soft square arps; pluck = warm guitar-like pluck
      const [type, fall, mult] = S.voice === 'stab' ? ['triangle', 0.55, 1] : S.voice === 'chip' ? ['square', 0.9, 1] : ['triangle', 1.6, 1];
      const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter(); o.type = type; o.frequency.value = hz * mult; wowAmt.connect(o.detune); f.type = 'lowpass'; f.frequency.setValueAtTime(S.voice === 'chip' ? 2400 : 3000, t); f.frequency.exponentialRampToValueAtTime(700, t + fall);
      const pk = S.voice === 'chip' ? peak * 0.42 : peak * 1.1; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(pk, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + fall);
      o.connect(f); f.connect(g); g.connect(bus); o.start(t); o.stop(t + fall + 0.05); return;
    }
    // electric piano: a sine plus a quick bell-ish overtone, both with a soft attack and a slow fall
    for (const [mult, p, type] of [[1, peak, 'sine'], [2.005, peak * 0.22, 'sine'], [4.01, peak * 0.05, 'triangle']]) {
      const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = hz * mult; wowAmt.connect(o.detune);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(p, t + 0.012); g.gain.exponentialRampToValueAtTime(p * 0.35, t + 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.05); }
  };
  const bass = (hz, t, dur) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = hz; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.34, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.05); };
  const spark = (hz, t) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = hz; wowAmt.connect(o.detune); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.045, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.4); o.connect(g); g.connect(bus); o.start(t); o.stop(t + 3.5); };
  const whoosh = t => { const o = ac.createBufferSource(); o.buffer = noiseBuf; o.loop = true; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 5; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(2600, t + 6); const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 3); g.gain.linearRampToValueAtTime(0.0001, t + 7); o.connect(f); f.connect(g); g.connect(bus); o.start(t); o.stop(t + 7.1); };
  const bar = t => {
    const prog = PROGS[Math.floor(M.i / 8) % PROGS.length], ch = prog[M.i % 4], j = () => (Math.random() - 0.5) * 0.018;   // a little human timing
    ch.forEach((m, k) => keys(midiHz(m), t + k * 0.018 + j(), BAR * 1.05, 0.085));   // strummed chord
    bass(midiHz(ch[0] - 12), t, BEAT * 1.8); if (Math.random() < 0.7) bass(midiHz(ch[0] - 12 + (Math.random() < 0.5 ? 0 : 7)), t + BEAT * 2.5 + BEAT * (SWING - 0.5), BEAT * 1.2);
    if (S.arp) for (let k = 0; k < 8; k++) if (Math.random() < 0.7) keys(midiHz(ch[k % ch.length] + 12), t + k * BEAT / 2 + (k % 2 ? (SWING - 0.5) * BEAT : 0) + j(), BEAT, 0.05);   // soft chip arpeggio
    if (S.walk) for (let k = 1; k < 4; k++) if (Math.random() < 0.8) bass(midiHz(ch[0] - 12 + [0, 2, 4, 7, 5][Math.floor(Math.random() * 5)]), t + k * BEAT + j(), BEAT * 0.9);   // a loose walking bass line
    if (S.sub) kick(t + BEAT * 2.75 + j(), 0.18);
    if (so().musicBeat !== false) {
      if (S.drums === 'boombap') {
        kick(t + j(), 0.62); kick(t + BEAT * 1.75 + j(), 0.46); if (Math.random() < 0.7) kick(t + BEAT * 2.5 + j(), 0.4); if (Math.random() < 0.35) kick(t + BEAT * 3.5 + j(), 0.3);
        noise(t + BEAT + j(), 0.16, 'bandpass', 1300, 0.34); noise(t + BEAT * 3 + j(), 0.18, 'bandpass', 1300, 0.38);   // snare on 2 and 4, cracked and a little lower
        for (let e = 0; e < 8; e++) { const off = (e % 2 ? SWING : 0) + Math.floor(e / 2); noise(t + off * BEAT + j(), 0.04, 'highpass', 8000, e % 2 ? 0.035 : 0.075); }
      } else if (S.drums === 'rim') {
        noise(t + BEAT + j(), 0.05, 'bandpass', 3400, 0.12); noise(t + BEAT * 3 + j(), 0.05, 'bandpass', 3400, 0.12); if (Math.random() < 0.5) noise(t + BEAT * 2.5 + j(), 0.04, 'bandpass', 3400, 0.06);   // quiet rim ticks, no kick
      } else if (S.drums === 'brush') {
        kick(t + j(), 0.34); noise(t + BEAT + j(), 0.28, 'bandpass', 2400, 0.1); noise(t + BEAT * 3 + j(), 0.28, 'bandpass', 2400, 0.1);
        for (let e = 0; e < 8; e++) { const off = (e % 2 ? SWING : 0) + Math.floor(e / 2); if (Math.random() < 0.85) noise(t + off * BEAT + j(), 0.09, 'highpass', 5000, e % 2 ? 0.05 : 0.025); }
      } else {
        kick(t + j(), 0.5); if (Math.random() < 0.6) kick(t + BEAT * 2.5 + j(), 0.34); kick(t + BEAT * 2 + j(), 0.28 * (Math.random() < 0.4 ? 1 : 0));
        noise(t + BEAT + j(), 0.2, 'bandpass', 1800, 0.22); noise(t + BEAT * 3 + j(), 0.22, 'bandpass', 1800, 0.24);   // soft snare on 2 and 4
        for (let e = 0; e < 8; e++) { const off = (e % 2 ? SWING : 0) + Math.floor(e / 2); noise(t + off * BEAT + j(), 0.05, 'highpass', 7000, 0.04 + Math.random() * 0.05); }
      }
    }
    for (let k = 0; k < 4; k++) if (Math.random() < 0.28) spark(midiHz(LOFI_SPARK[Math.floor(Math.random() * LOFI_SPARK.length)]), t + BEAT * (k + Math.random()));
    for (let k = 0; k < 6; k++) if (Math.random() < 0.7) noise(t + Math.random() * BAR, 0.012, 'highpass', 1500, 0.07 + Math.random() * 0.08);   // vinyl pops
    if (M.i % 16 === 7) whoosh(t);
    M.i++;
  };
  M.timer = setInterval(() => { try { while (M.next < ac.currentTime + 2.5) { const t = M.next; M.next += BAR; try { bar(t); } catch (e) { console.warn('lofi bar', e); } } } catch (e) {} }, 400);
  // constant faint vinyl hiss
  const hiss = ac.createBufferSource(); hiss.buffer = noiseBuf; hiss.loop = true; const hf = ac.createBiquadFilter(); hf.type = 'highpass'; hf.frequency.value = 5000; const hg = ac.createGain(); hg.gain.value = 0.012; hiss.connect(hf); hf.connect(hg); hg.connect(bus); hiss.start(); M.extra.push(hiss);
  if (S.rain) {   // steady rain: filtered noise with a slow swell, plus the odd drop
    const rn = ac.createBufferSource(); rn.buffer = noiseBuf; rn.loop = true; const rf = ac.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 2400; rf.Q.value = 0.5; const rg = ac.createGain(); rg.gain.value = 0.05;
    const sw = ac.createOscillator(), sg = ac.createGain(); sw.frequency.value = 0.08; sg.gain.value = 0.018; sw.connect(sg); sg.connect(rg.gain); sw.start(); rn.connect(rf); rf.connect(rg); rg.connect(bus); rn.start(); M.extra.push(rn, sw); }
}
function stopMusic() {
  if (!music) return; const M = music; music = null; clearInterval(M.timer); setTimeout(() => { try { (M.extra || []).forEach(x => x.stop()); } catch (e) {} }, 1600);
  try { M.bus.gain.cancelScheduledValues(M.ac.currentTime); M.bus.gain.setValueAtTime(M.bus.gain.value, M.ac.currentTime); M.bus.gain.linearRampToValueAtTime(0.0001, M.ac.currentTime + 1.2); setTimeout(() => { try { M.bus.disconnect(); } catch (e) {} }, 1500); } catch (e) {}
}
function musicSettingsChanged() { if (music && music.style !== musicStyleId()) stopMusic(); if (settings.sound.on && settings.sound.music) { if (music) { try { music.bus.gain.setTargetAtTime(musicVolume() || 0.0001, music.ac.currentTime, 0.2); } catch (e) {} } else startMusic(); } else stopMusic(); }
// browsers only allow audio after a click or key press, so the music begins on the first one
let parRaf = 0;
document.addEventListener('mousemove', e => {
  if (document.body.dataset.matmotion !== 'parallax' || parRaf) return;
  parRaf = requestAnimationFrame(() => { parRaf = 0; const m = document.getElementById('mat'); if (!m) return;
    m.style.setProperty('--mx', ((e.clientX / innerWidth - 0.5) * -2).toFixed(3)); m.style.setProperty('--my', ((e.clientY / innerHeight - 0.5) * -2).toFixed(3)); });
});
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => { if (!music) startMusic(); }, { capture: true }));
