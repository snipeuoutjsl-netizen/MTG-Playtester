// ---- v0.99.91 Practice opponent: the goldfish can fight back. Off by default ("Goldfish").
// Between your turns the opponent takes a turn of its own: it attacks you (a clock that grows), and sometimes destroys your best creature.
// On your turn a Control opponent may counter a spell you cast (its Counterspell goes on the stack, so you can respond to it), and an
// Aggro or Midrange opponent may chump-block your biggest attacker. Everything it does is logged and shown; Undo takes it back.
// Kept in 'mtgpt.practice' = { style: 'off'|'aggro'|'midrange'|'control', level: 1|2|3 }.
const PRACTICE_STYLES = [
  ['off', 'Goldfish', 'The opponent does nothing: the classic goldfish.'],
  ['aggro', 'Aggro', 'Attacks every turn and hits harder each turn; chump-blocks now and then.'],
  ['midrange', 'Midrange', 'A steadier clock, blocks your biggest attacker, and kills a creature every other turn.'],
  ['control', 'Control', 'Counters some of your spells (you can respond), removes threats, and attacks only late.']];
function practice() { const v = lsGet('mtgpt.practice', null) || {}; return { style: PRACTICE_STYLES.some(s => s[0] === v.style) ? v.style : 'off', level: [1, 2, 3].includes(v.level) ? v.level : 2 }; }
const practiceOn = () => !!state && !state.puzzle && practice().style !== 'off';
function pRand() { return Math.random(); }
// the opponent's turn, played between two of yours. k = how many turns the opponent has had (1 after your first turn)
function practiceOppTurn() {
  if (!practiceOn()) return;
  const P = practice(), k = (state.oppTurns = (state.oppTurns || 0) + 1), mult = [0, .6, 1, 1.4][P.level], done = [];
  const clock = { aggro: [0, 0, 2, 3, 5, 6, 7], midrange: [0, 0, 0, 2, 3, 4, 5], control: [0, 0, 0, 0, 0, 2, 3] }[P.style] || [];
  const dmg = Math.round((clock[Math.min(k, clock.length - 1)] || 0) * mult);
  state.pOpp = { counters: P.style === 'control' && k >= 2 ? (P.level === 3 ? 2 : 1) : 0, blocks: (P.style === 'aggro' || P.style === 'midrange') && k >= 2 ? 1 : 0 };
  if (dmg > 0) { const d = preventDamage('you', dmg, 'Opponent'); if (d > 0) { changeLife(-d, true); done.push(`attacks you for ${d}`); } else done.push(`attacks you, but the damage is prevented`); }
  const every = { midrange: P.level === 3 ? 2 : 2, control: P.level === 3 ? 2 : 3, aggro: P.level === 3 ? 4 : 0 }[P.style] || 0, from = P.style === 'control' ? 3 : 3;
  if (every && k >= from && (k - from) % every === 0) {
    const tgt = state.battlefield.filter(c => permZone(c) === 'creatures' && !c.opp && !hasKw(c, 'hexproof') && !hasKw(c, 'shroud') && !hasKw(c, 'indestructible')).sort((a, b) => ptCalc(b).p - ptCalc(a).p || ((cardInfo(b.name) || {}).cmc || 0) - ((cardInfo(a.name) || {}).cmc || 0))[0];
    if (tgt) { try { destroyPerm(tgt, 'Opponent\u2019s removal'); } catch (e) { moveCard(tgt.id, 'graveyard'); } done.push(`destroys your ${tgt.name}`); }
  }
  const msg = done.length ? `Opponent's turn ${k}: it ${done.join(' and ')}.` : `Opponent's turn ${k}: it does nothing you can see.`;
  log(msg); toast(`Opponent (${PRACTICE_STYLES.find(s => s[0] === P.style)[1]})`, msg.replace(/^Opponent's turn \d+: it /, '').replace(/^./, c => c.toUpperCase()));
}
// a spell you cast: a Control opponent may answer it with a Counterspell on the stack (you get priority to respond)
function practiceOnCast(c) {
  if (!practiceOn() || !c || c.opp || c.ability || c.copy) return;
  const P = practice(), po = state.pOpp || {}; if (!(po.counters > 0)) return;
  const mv = (cardInfo(c.name) || {}).cmc || 0, minMv = [0, 3, 2, 1][P.level], chance = [0, .45, .65, .85][P.level];
  if (mv < minMv || pRand() > chance) return;
  po.counters--; state.pOpp = po;
  setTimeout(() => { if (!state || !state.stack.some(x => x.id === c.id)) return;
    castOppSpell('Counterspell', 'Instant'); const top = state.stack[state.stack.length - 1]; if (top && top.opp) { top.oppFx = { kind: 'counter', targetId: c.id, targetName: c.name }; top.text = `Counter target spell (${c.name}).`; }
    log(`Practice opponent: casts Counterspell targeting your ${c.name}. You may respond.`); render(); }, 250);
}
// resolving the practice opponent's own spells (the ones it chose itself)
function practiceResolve(c) {
  if (!c || !c.oppFx) return false;
  if (c.oppFx.kind === 'counter') { const t = state.stack.find(x => x.id === c.oppFx.targetId);
    if (t) { counterStackObject(t.id, 'Opponent’s Counterspell'); log(`Opponent's Counterspell counters your ${c.oppFx.targetName}`); }
    else log(`Opponent's Counterspell has no target left and does nothing`); render(); return true; }
  return false;
}
// combat: an Aggro or Midrange opponent chump-blocks your biggest attacker it is able to block (not flying, not menace)
function practiceBlock(attackers) {
  if (!practiceOn()) return null; const P = practice(), po = state.pOpp || {}; if (!(po.blocks > 0)) return null;
  const chance = (P.style === 'midrange' ? .6 : .4) + (P.level - 2) * .2; if (pRand() > chance) return null;
  const cands = attackers.map(id => (findCard(id) || {}).card).filter(c => c && !hasKw(c, 'flying') && !hasKw(c, 'menace') && !hasKw(c, "can't be blocked") && !hasKw(c, 'shadow')).sort((a, b) => ptCalc(b).p - ptCalc(a).p);
  if (!cands.length) return null; po.blocks--; state.pOpp = po; return cands[0].id;
}
function openPractice() {
  const m = modal('Practice opponent', { width: 560 }); const box = h('div', { class: 'pr-grid' });
  const draw = () => { const P = practice();
    box.replaceChildren(...PRACTICE_STYLES.map(([k, l, d]) => h('button', { class: 'pr-card' + (P.style === k ? ' on' : ''), onclick: () => { lsSet('mtgpt.practice', { style: k, level: P.level }); draw(); render(); } }, h('b', { text: l }), h('span', { class: 'small muted', text: d }))),
      h('div', { class: 'pr-lvl' }, h('span', { class: 'small', text: 'How hard: ' }), ...[[1, 'Easy'], [2, 'Normal'], [3, 'Hard']].map(([v, l]) => h('button', { class: P.level === v ? 'primary' : '', text: l, onclick: () => { lsSet('mtgpt.practice', { style: P.style, level: v }); draw(); } })))); };
  m.body.append(h('p', { class: 'small muted', text: 'Practise against an opponent that fights back. Its turn happens between yours (you see what it did in a note and the log); on your turn it may counter a spell or block. Undo works as usual. Puzzles always use the goldfish.' }), box);
  m.foot.append(h('button', { class: 'primary', text: 'Done', onclick: () => m.close() })); draw();
}
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('#btnPractice'); if (!b) return; try { document.getElementById('gameMenu').hidden = true; } catch (er) {} openPractice(); });
// the opponent's life box says who you are playing against
function practiceHud() { const l = document.querySelector('#oppBox .hudlabel'); if (!l) return; const P = practice(), on = practiceOn(); const t = on ? `Opp · ${PRACTICE_STYLES.find(s => s[0] === P.style)[1]}` : 'Opp'; if (l.textContent !== t) { l.textContent = t; l.title = on ? 'Practice opponent: Game tools → Practice opponent' : ''; } }
