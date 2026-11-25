// ---------------------------------------------------------------- v0.96.21 dice and coins that tumble to the real result, and the end-of-game "Next round" screen
// CR 705.1 To flip a coin, the player flips a coin that has an equal chance of landing heads or tails (the player who flips wins the flip on heads here).
// CR 706.2 To roll a die with N sides, a random integer from 1 to N is chosen (every result equally likely). The result is picked FIRST, from the browser's
//          cryptographic random source, and the animation is built to land on exactly that face, so what you see is what the game used.
function rngInt(n) {   // uniform 1..n with no modulo bias
  n = Math.max(1, Math.floor(n)); const lim = Math.floor(0x100000000 / n) * n, buf = new Uint32Array(1);
  try { do { crypto.getRandomValues(buf); } while (buf[0] >= lim); return (buf[0] % n) + 1; } catch (e) { return Math.floor(Math.random() * n) + 1; }
}
const DIE_FACE_ROT = { 1: [0, 0], 2: [-90, 0], 3: [0, -90], 4: [0, 90], 5: [90, 0], 6: [0, 180] };   // [rotateX, rotateY] that bring each cube face to the front
function rngStage() {
  let st = $('#rngStage'); if (st) st.remove();
  st = h('div', { id: 'rngStage', class: 'rngstage' }); document.body.appendChild(st);
  st.addEventListener('click', () => st.remove()); setTimeout(() => { if (st.isConnected) st.remove(); }, 9000);
  return st;
}
function coinAnim(heads, done) {
  const quick = !animOn('dice');
  const st = rngStage(), coin = h('div', { class: 'coin3d' }, h('div', { class: 'cface heads', text: 'H' }), h('div', { class: 'cface tails', text: 'T' }), h('div', { class: 'cedge' }));
  const lab = h('div', { class: 'rnglabel', text: 'Flipping…' }); st.append(h('div', { class: 'coinwrap' }, coin), lab);
  const spins = 5 + rngInt(3), end = spins * 360 + (heads ? 0 : 180), T = 1700 + spins * 120;
  const fin = () => { lab.textContent = heads ? 'Heads' : 'Tails'; lab.classList.add('show'); coin.style.transform = `rotateX(${end}deg)`; if (done) done(); setTimeout(() => { if (st.isConnected) st.classList.add('out'); setTimeout(() => st.remove(), 400); }, 1400); };
  if (quick) { fin(); return; }
  const a = wa(coin.parentElement, [{ transform: 'translateY(40px) scale(.7)' }, { transform: 'translateY(-150px) scale(1.15)', offset: 0.45 }, { transform: 'translateY(0) scale(1)' }], { duration: T, easing: 'cubic-bezier(.3,.1,.4,1)' });
  const b = wa(coin, [{ transform: 'rotateX(0deg)' }, { transform: `rotateX(${end}deg)` }], { duration: T, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' });
  b.onfinish = fin;
}
function dieEl(sides, value, quick) {
  const wrap = h('div', { class: 'diewrap' });
  if (sides === 6) {
    const cube = h('div', { class: 'die3d' }); const faces = { 1: 'f1', 2: 'f2', 3: 'f3', 4: 'f4', 5: 'f5', 6: 'f6' };
    for (let n = 1; n <= 6; n++) cube.append(h('div', { class: 'dface ' + faces[n] }, ...Array.from({ length: n }, () => h('i'))));
    wrap.append(cube); wrap._spin = (T) => { const [rx, ry] = DIE_FACE_ROT[value], X = rx + 360 * (2 + rngInt(2)), Y = ry + 360 * (2 + rngInt(2));
      const a = wa(cube, [{ transform: 'rotateX(' + rngInt(360) + 'deg) rotateY(' + rngInt(360) + 'deg)' }, { transform: `rotateX(${X}deg) rotateY(${Y}deg)` }], { duration: T, easing: 'cubic-bezier(.15,.75,.25,1)', fill: 'forwards' }); return a; };
    wrap._set = () => { const [rx, ry] = DIE_FACE_ROT[value]; cube.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`; };
  } else {
    const shape = h('div', { class: 'dshape s' + ([4, 8, 10, 12, 20].includes(sides) ? sides : 'x') }, h('span', { class: 'dnum', text: '?' }));
    wrap.append(shape); wrap._spin = (T) => {
      const a = wa(shape, [{ transform: 'rotate3d(1,1,0,0deg) rotateZ(0deg)' }, { transform: 'rotate3d(1,1,0,1080deg) rotateZ(' + (rngInt(2) ? 360 : -360) + 'deg)' }], { duration: T, easing: 'cubic-bezier(.15,.75,.25,1)', fill: 'forwards' });
      let t0 = performance.now(), last = 0; const tick = () => { const el = performance.now() - t0; if (el >= T) { shape.querySelector('.dnum').textContent = value; return; } const gap = 45 + 260 * Math.pow(el / T, 2.2); if (el - last > gap) { last = el; shape.querySelector('.dnum').textContent = rngInt(sides); } requestAnimationFrame(tick); }; tick(); return a; };
    wrap._set = () => { shape.querySelector('.dnum').textContent = value; };
  }
  return wrap;
}
function rollDiceUI(sides, count, done) {
  sides = Math.max(2, Math.min(1000, Math.floor(sides) || 6)); count = Math.max(1, Math.min(20, Math.floor(count) || 1));
  const results = Array.from({ length: count }, () => rngInt(sides)), total = results.reduce((a, b) => a + b, 0);
  const label = `${count > 1 ? count : 'a '}d${sides}`;
  const shown = Math.min(count, 6), quick = !animOn('dice');
  const st = rngStage(), row = h('div', { class: 'dicerow' }), lab = h('div', { class: 'rnglabel', text: 'Rolling…' });
  const els = results.slice(0, shown).map(v => dieEl(sides, v, quick)); row.append(...els); st.append(row, lab);
  const finish = () => { els.forEach(e => e._set()); lab.textContent = count === 1 ? String(results[0]) : `${results.join(' + ')}${count > shown ? ' …' : ''} = ${total}`; lab.classList.add('show');
    log(`Rolled ${label}: ${count === 1 ? results[0] : results.join(', ') + ' (total ' + total + ')'}`); if (done) done(results, total);
    setTimeout(() => { if (st.isConnected) st.classList.add('out'); setTimeout(() => st.remove(), 400); }, 1800); };
  if (quick) { finish(); return results; }
  const T = 1800; let last = null; els.forEach((e, i) => { last = e._spin(T + i * 150); }); (last || { }).onfinish = finish; setTimeout(() => { if (st.isConnected && !lab.classList.contains('show')) finish(); }, T + 1200);
  return results;
}
// "Flip a coin" for card effects: the result is chosen first (heads = you win the flip), the coin lands on it, then the effect continues.
function flipCoinUI(done) { const heads = rngInt(2) === 1; coinAnim(heads, () => { try { log(`Coin flip: ${heads ? 'heads' : 'tails'}`); } catch (e) {} done && done(heads); }); return heads; }
const DIE_WORDS = { four: 4, six: 6, eight: 8, ten: 10, twelve: 12, twenty: 20, hundred: 100 };
// "Roll a d20", "roll two six-sided dice", "roll a d6": the app rolls and shows the result; the card's table is for you to apply.
function rollOptionsFor(tx, src) {
  const out = [], t = String(tx || '').replace(/\([^)]*\)/g, ' ');
  const m = t.match(/\broll (a|an|one|two|three|four|\d+)\s+(?:(?:d(\d+))|(?:(four|six|eight|ten|twelve|twenty)-sided)|(?:(\d+)-sided))\s*(?:die|dice)?/i);
  if (m) { const n = /^\d+$/.test(m[1]) ? +m[1] : ({ a: 1, an: 1, one: 1, two: 2, three: 3, four: 4 })[m[1].toLowerCase()] || 1, sides = m[2] ? +m[2] : m[4] ? +m[4] : DIE_WORDS[m[3].toLowerCase()];
    out.push({ label: `Roll ${n > 1 ? n + ' ' : 'a '}d${sides}${n > 1 ? ' (dice)' : ''}`, full: true, fn: () => rollDiceUI(sides, n, (r, tot) => toast(`${src}: rolled ${tot}`, `${n > 1 ? r.join(' + ') + ' = ' + tot : 'Result: ' + tot}. Apply the card's result table.`)) }); }
  return out;
}
function openDiceCoin() {
  const m = modal('Dice & coin', { width: 420 }); let n = 1;
  const cnt = h('select', null, ...[1, 2, 3, 4, 5, 6, 8, 10].map(v => h('option', { value: v, text: v + (v === 1 ? ' die' : ' dice') }))); cnt.addEventListener('change', () => { n = +cnt.value; });
  const go = s => h('button', { text: 'd' + s, onclick: () => { m.close(); rollDiceUI(s, n); } });
  m.body.append(h('div', { class: 'psub', text: 'Rolls use a true random number; the die or coin you see lands on exactly that result. Results go in the game log.' }),
    h('div', { class: 'setrow' }, h('label', { text: 'How many' }), cnt),
    h('div', { class: 'dicebtns' }, ...[4, 6, 8, 10, 12, 20, 100].map(go)),
    h('div', { style: 'margin-top:10px' }, h('button', { class: 'primary', text: 'Flip a coin', onclick: () => { m.close(); flipCoinUI(); } })));
  m.foot.append(h('button', { text: 'Close', onclick: () => m.close() }));
}
// ---- game over: "Next round"
let matchRecord = { w: 0, l: 0 };
function gameIsOver() { return !!document.getElementById('gameEndBox'); }
function clearPromptsForGameEnd() {   // v0.99.71 a trigger or choice that was open (Psychic Frog's draw after the lethal hit) must not sit over the result
  document.querySelectorAll('#modalRoot .backdrop').forEach(b => { if (!b.querySelector('#gameEndBox')) b.remove(); });
}
function showGameEnd(which, title, sub) {
  if (state && state.puzzle) { puzzleResult(which !== 'you', title); return; }   // v0.99.90 a puzzle has its own ending
  if (!state || $("#gameEndBox") || window.__noGameEnd) return;
  clearPromptsForGameEnd();
  const won = which !== 'you'; won ? matchRecord.w++ : matchRecord.l++;
  if (won) earnPack(`you won a game with ${currentDeckName() || 'your deck'}`);   // v0.99.106 a win earns a pack
  const name = currentDeckName(); let rc = null; try { rc = recapFinish(won, title || ''); } catch (e) { rc = null; }   // v0.99.89 the game's recap page
  const m = modal(won ? 'You won the game' : 'You lost the game', { width: 560, sticky: true });
  m.el.id = 'gameEndBox'; m.el.classList.add(won ? 'ge-win' : 'ge-loss');
  m.body.append(h('div', { class: 'ge-big', text: won ? 'Victory' : 'Defeat' }), h('div', { class: 'ge-sub', text: title ? title + (sub ? ': ' + sub : '') : (won ? 'The opponent is at 0 life.' : 'You are at 0 life.') }),
    h('div', { class: 'ge-rec', text: `This session: ${matchRecord.w} won, ${matchRecord.l} lost` }),
    rc ? recapEl(rc) : null,
    won ? h('button', { class: 'ge-pack', title: 'Tear open the pack this win earned (it is kept if you open it later)', onclick: () => { m.close(); openPackScreen(); } }, h('span', { class: 'ge-pack-i', 'aria-hidden': 'true' }), h('b', { text: 'You earned a pack' }), h('span', { text: 'Tear it open' })) : null,
    h('div', { class: 'ge-btns' },
      h('button', { class: 'primary', text: 'Next round: same deck', title: 'Shuffle up and start a new game with the same list', onclick: () => { m.close(); startGame(); } }),
      name ? h('button', { text: 'Sideboard, then play', title: 'Swap cards between your main deck and sideboard, then start the next game', onclick: () => { m.close(); let started = false; openSideboarding(name, () => { if (!started) { started = true; startGame(); } }); } }) : null,
      h('button', { text: 'Choose another deck', onclick: () => { m.close(); try { openHall(); } catch (e) {} } })));
  m.foot.append(h('button', { text: 'Keep playing', title: 'Close this and carry on (use Undo if the result was a misclick)', onclick: () => { m.close(); setTimeout(() => { flushTriggers(); render(); }, 0); } }));
}
