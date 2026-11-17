// ---------------------------------------------------------------- effect durations and delayed effects (v0.49)
// Everything that lasts for a while lives in ONE ledger, state.fx, so the app always knows what is active, on what,
// and when it ends:
//   pt        {targetId,p,t}         "gets +2/+2 until end of turn"
//   kw        {targetId,kw}          "gains flying until your next turn"
//   note      {text,[targetId]}      anything else that lasts ("can't block this turn") - a reminder with a timer
//   delayed   {when,action,...}      "at the beginning of the next end step, exile it" / "at your next upkeep, draw a card"
//   exileUntil{cardId,srcId}         "exile target permanent until ~ leaves the battlefield"
// until: 'eot' (cleanup step), 'yourNextTurn' (your next untap step), 'srcLeaves' (the source leaves), 'manual'.
const sgnN = n => (n >= 0 ? '+' : '') + n;
const UNTIL_WORDS = { eot: 'until end of turn', yourNextTurn: 'until your next turn', srcLeaves: 'while the source stays on the battlefield', manual: 'until you remove it' };
const DUR_RE = /\b(?:until end of turn|until your next turn|this turn)\b/i;
const durKey = t => (/until your next turn/i.test(t) ? 'yourNextTurn' : 'eot');
const stepIndex = id => STEPS.findIndex(s => s.id === id);
function addFx(o) {
  if (!state) return null;
  state.fx = state.fx || [];
  const e = Object.assign({ id: state.nextId++, turn: state.turn, step: state.step }, o.kind === 'delayed' || o.kind === 'exileUntil' ? {} : { until: 'eot' }, o);
  if (e.targetId && !e.targetName) { const f = findCard(e.targetId); if (f) e.targetName = f.card.name; }
  state.fx.push(e); return e;
}
function fxOn(c, kind) { return state && state.fx && c ? state.fx.filter(e => e.targetId === c.id && (!kind || e.kind === kind)) : []; }
function fxTargetName(e) { return e.targetName || (() => { const f = e.targetId ? findCard(e.targetId) : null; return f ? f.card.name : 'a permanent'; })(); }
function fxLabel(e) {
  switch (e.kind) {
    case 'pt': return `${fxTargetName(e)} gets ${sgnN(e.p)}/${sgnN(e.t)}`;
    case 'kw': return `${fxTargetName(e)} has ${e.kw}`;
    case 'delayed': return `${e.when === 'end' ? 'At the next end step' : 'At the next upkeep'}: ${e.text}`;
    case 'exileUntil': return `${e.cardName} stays exiled`;
    default: return e.text || 'Effect';
  }
}
function fxEnds(e) {
  if (e.kind === 'delayed') return e.when === 'end' ? 'fires at the beginning of the end step' : 'fires at the beginning of the next upkeep';
  if (e.kind === 'exileUntil') return `until ${e.srcName} leaves the battlefield`;
  return UNTIL_WORDS[e.until] || '';
}
function endFx(pred, why) {
  if (!state || !state.fx || !state.fx.length) return;
  const gone = state.fx.filter(pred); if (!gone.length) return;
  state.fx = state.fx.filter(e => !gone.includes(e));
  for (const e of gone) log(`Ended (${why}): ${fxLabel(e)}`);
}
// A permanent left the battlefield: its own effects end, and effects that last "while the source stays" end too.
function fxOnLeave(c) {
  if (!state || !state.fx || !state.fx.length) return;
  endFx(e => e.targetId === c.id && ['pt', 'kw', 'note'].includes(e.kind), 'it left the battlefield');
  state.fx = state.fx.filter(e => !(e.kind === 'delayed' && e.targetId === c.id && (e.action === 'exile' || e.action === 'sacrifice' || e.action === 'returnHand')));
  const rel = state.fx.filter(e => e.srcId === c.id && (e.until === 'srcLeaves' || e.kind === 'exileUntil'));
  if (!rel.length) return;
  state.fx = state.fx.filter(e => !rel.includes(e));
  for (const e of rel) {
    if (e.kind === 'exileUntil') {
      const f = e.cardId ? findCard(e.cardId) : null;
      if (f && f.zone === 'exile') { state.exile.splice(f.idx, 1); f.card.counters = { plus: 0, minus: 0 }; log(`${e.srcName} left the battlefield: ${f.card.name} returns from exile`); enterBattlefield(f.card, { from: 'exile' }); }
      else { log(`${e.srcName} left the battlefield: ${e.cardName} returns (put it back at the table)`); toast(`${e.cardName} returns`, `${e.srcName} left the battlefield, so ${e.cardName} comes back. It is not tracked here: put it back by hand.`); }
    } else { log(`Ended (${e.srcName} left the battlefield): ${fxLabel(e)}`); if (e.kind === 'note' && teach('durationHints')) toast('Effect ended', `${e.srcName} left the battlefield: ${fxLabel(e)}.`); }
  }
}
function delayedDue(e, when) { return e.kind === 'delayed' && e.when === when && (e.turn < state.turn || (when === 'end' && e.step < stepIndex('end')) || (when === 'main1' && e.step < stepIndex('main1')) || (when === 'endcombat' && e.step < stepIndex('end_combat'))); }
// Fire the delayed triggers that are due at the beginning of this upkeep / end step.
function runDelayed(when) {
  if (!state || !state.fx || !state.fx.length) return;
  const due = state.fx.filter(e => delayedDue(e, when)); if (!due.length) return;
  state.fx = state.fx.filter(e => !due.includes(e));
  const where = when === 'main1' ? 'precombat main phase' : when === 'end' ? 'end step' : when === 'endcombat' ? 'end of combat' : 'upkeep';
  for (const e of due) {
    const f = e.targetId ? findCard(e.targetId) : null, nm = e.targetName || (f && f.card.name) || 'it';
    if (e.mana) { for (const [k, n] of Object.entries(e.mana)) state.manaPool[k] = (state.manaPool[k] || 0) + n; log(`${e.srcName}: delayed trigger at the beginning of the ${where}: added ${Object.entries(e.mana).map(([k, n]) => '{' + k + '}'.repeat(1) + (n > 1 ? '×' + n : '')).join('')} to your mana pool`); toast('Delayed mana', `${e.srcName}: ${e.text}`); continue; }
    if (e.action === 'exile') { if (f && f.zone === 'battlefield') { log(`${e.srcName}: ${nm} was exiled at the beginning of the ${where}`); delete f.card.exileInstead; leaveBattlefield(f.card, 'exile'); } }
    else if (e.action === 'sacrifice') { if (f && f.zone === 'battlefield') { log(`${e.srcName}: ${nm} was sacrificed at the beginning of the ${where}`); leaveBattlefield(f.card, 'graveyard'); } }
    else if (e.action === 'returnHand') { if (f && f.zone === 'battlefield') { log(`${e.srcName}: ${nm} returned to its owner's hand at the beginning of the ${where}`); leaveBattlefield(f.card, 'hand'); } }
    else if (e.action === 'returnBf') {
      if (f && f.zone === 'exile') { state.exile.splice(f.idx, 1); f.card.counters = { plus: 0, minus: 0 }; enterBattlefield(f.card, { from: 'exile', logMsg: `${e.srcName}: ${nm} returns to the battlefield at the beginning of the ${where}` }); }
      else log(`${e.srcName}: ${nm} is not in exile, so it cannot return`);
    } else if (e.draw && !teach('triggerPrompts')) { const n = drawCards(e.draw); log(`${e.srcName}: delayed trigger, drew ${n}`); }
    else queueTrigger({ kind: 'ability', cardId: 0, cardName: e.srcName, text: e.text, effect: e.text, special: null, optional: false, why: `${e.srcName} created a delayed trigger earlier: it fires at the beginning of this ${where}.` });
  }
}
function addTempPT(id, p, t, extra) {
  const f = findCard(id); if (!f || f.zone !== 'battlefield') return;
  snap(); addFx(Object.assign({ kind: 'pt', targetId: id, p, t, srcName: 'manual' }, extra || {}));
  log(`${f.card.name} gets ${sgnN(p)}/${sgnN(t)} ${UNTIL_WORDS[(extra && extra.until) || 'eot']}`); render();
}
function addKwFx(id, kw, extra) {
  const f = findCard(id); if (!f || f.zone !== 'battlefield') return;
  snap(); addFx(Object.assign({ kind: 'kw', targetId: id, kw, srcName: 'manual' }, extra || {}));
  log(`${f.card.name} gains ${kw} ${UNTIL_WORDS[(extra && extra.until) || 'eot']}`); render();
}
// ---- reading durations out of rules text
const DELAY_RE_B = /^(.+?)\s+at the beginning of (the next end step|your next end step|the end step|the next turn's upkeep|your next upkeep|the next upkeep)\b/i;
const DELAY_RE_A = /\bat the beginning of (the next end step|your next end step|the end step|the next turn's upkeep|your next upkeep|the next upkeep)[^,]*,\s*(.+)$/i;
function delayedFromSentence(s) {
  let m, when, act;
  if ((m = s.match(/^at the beginning of /i)) && (m = s.match(DELAY_RE_A))) { when = m[1]; act = m[2]; }
  else if ((m = s.match(DELAY_RE_B))) { when = m[2]; act = m[1]; }
  else return null;
  act = act.replace(/\.$/, '').trim();
  const out = { when: /upkeep/i.test(when) ? 'upkeep' : 'end', text: act.charAt(0).toUpperCase() + act.slice(1) + '.', action: null, draw: 0 };
  let a;
  if (/^(?:you may )?exile (?:it|that creature|that card|them|~|this \w+)\b/i.test(act) && !/\bfrom\b/i.test(act)) out.action = 'exile';
  else if (/^sacrifice (?:it|that creature|them|~|this \w+)\b/i.test(act)) out.action = 'sacrifice';
  else if (/^return (?:it|that card|that creature|them|~|this \w+) to the battlefield\b/i.test(act)) out.action = 'returnBf';
  else if (/^return (?:it|that card|that creature|them|~|this \w+) to (?:its owner's|your) hand\b/i.test(act)) out.action = 'returnHand';
  else if ((a = act.match(/^(?:you )?draw (a|an|one|two|three|four|five|\d+) cards?\b/i))) out.draw = numOf(a[1]);
  return out;
}
const KW_LIST_RE = /\bgains?\s+([a-z ,]+?)(?=\s+until\b|\s+this turn|\.|$)/i;
function kwsIn(text) { return String(text).toLowerCase().split(/,\s*(?:and\s+)?|\s+and\s+/).map(x => x.trim()).filter(k => GRANTABLE.includes(k)); }
// Options for the effect panel from one sentence: temporary pumps and keywords, delayed triggers, or a timed reminder.
// targets = [{id,name}] the sentence is about (chosen targets); without them the source ("this creature") or a group is used.
function durationOptions(sentence, obj, targets) {
  const s = String(sentence).replace(/’/g, "'").trim(), src = obj.sourceName || 'this', out = [];
  if (!s) return out;
  const until = durKey(s), uw = UNTIL_WORDS[until], isDur = DUR_RE.test(s);
  let who = (targets && targets.length) ? targets : null, group = null, m;
  if (!who) {
    if (/^(other )?creatures you control\b/i.test(s)) group = { other: /^other/i.test(s) };
    else if (obj.sourceId && /^(?:~|this \w+|it)\b/i.test(s)) who = [{ id: obj.sourceId, name: src }];
  }
  const apply = (mk) => () => {
    const ids = group ? state.battlefield.filter(c => permZone(c) === 'creatures' && !(group.other && c.id === obj.sourceId)).map(c => c.id) : who.map(t => t.id);
    snap();
    for (const id of ids) { const f = findCard(id); if (f && f.zone === 'battlefield') { addFx(Object.assign({ targetId: id, until, srcName: obj.sourceName || 'effect', srcId: obj.sourceId || null }, mk)); } }
    log(`${obj.sourceName || 'Effect'}: ${group ? 'creatures you control' : who.map(t => t.name).join(', ')} — ${mk.kind === 'pt' ? sgnN(mk.p) + '/' + sgnN(mk.t) : mk.kw} ${uw}`); render();
  };
  const nameOf = () => group ? 'Creatures you control' : who.map(t => t.name).join(', ');
  let handled = false;
  if (isDur && (who || group)) {
    if ((m = s.match(/\bgets? ([+-]\d+)\/([+-]\d+)/i))) { const p = +m[1], t = +m[2]; out.push({ label: `${nameOf()} ${group ? 'get' : 'gets'} ${sgnN(p)}/${sgnN(t)} ${uw}`, fn: apply({ kind: 'pt', p, t }) }); handled = true; }
    if ((m = s.match(KW_LIST_RE))) for (const kw of kwsIn(m[1])) { out.push({ label: `${nameOf()} ${group ? 'gain' : 'gains'} ${kw} ${uw}`, fn: apply({ kind: 'kw', kw }) }); handled = true; }
  }
  const dl = delayedFromSentence(s);
  if (dl) {
    const tg = (targets && targets[0]) || (obj.sourceId ? { id: obj.sourceId, name: src } : null);
    out.push({ label: `Create delayed trigger: ${dl.text.replace(/\.$/, '')} at the beginning of the ${dl.when === 'end' ? 'next end step' : 'next upkeep'}`, fn: () => {
      if (dl.draw && obj._delayedSet) { toast('Already set', 'That delayed draw is already waiting for the next upkeep.'); return; }
      if (dl.draw) obj._delayedSet = true;
      snap(); addFx({ kind: 'delayed', when: dl.when, action: dl.action, draw: dl.draw, text: dl.text, srcName: obj.sourceName || 'effect', srcId: obj.sourceId || null, targetId: tg ? tg.id : null, targetName: tg ? tg.name : '' });
      log(`${obj.sourceName || 'Effect'}: delayed trigger created — ${dl.text} (${dl.when === 'end' ? 'next end step' : 'next upkeep'})`); render();
    } });
    handled = true;
  }
  if (!handled && isDur && !/^\s*(?:when|whenever|at)\b/i.test(s)) {
    const first = who && who[0];
    out.push({ label: `Remember (${uw}): ${s.length > 90 ? s.slice(0, 87) + '…' : s}`, fn: () => { snap(); addFx({ kind: 'note', text: s.replace(/\.$/, ''), until, srcName: obj.sourceName || 'effect', srcId: obj.sourceId || null, targetId: first ? first.id : null }); log(`${obj.sourceName || 'Effect'}: will remember — ${s} (${uw})`); render(); } });
  }
  return out;
}
// ---- the panel
function openEffects() {
  if (!state) return;
  const m = modal('Active effects', { width: 640 });
  const list = h('div', { class: 'prelist' });
  const draw = () => {
    const fx = state.fx || [];
    list.replaceChildren(...(fx.length ? fx.map(e => h('div', { class: 'row fxrow' },
      h('span', { class: 'nm' }, h('b', { text: fxLabel(e) }), h('span', { class: 'muted small', text: ` — ${fxEnds(e)}${e.srcName && e.srcName !== 'manual' ? ' (from ' + e.srcName + ')' : ''}` })),
      h('button', { text: 'Remove', onclick: () => { snap(); state.fx = state.fx.filter(x => x !== e); log(`Effect removed by hand: ${fxLabel(e)}`); draw(); render(); } })))
      : [h('div', { class: 'muted small', text: 'Nothing lasting is active right now.' })]));
  };
  m.body.append(...[teach('durationHints') ? h('div', { class: 'psub', text: 'Effects that last a while. “Until end of turn” effects end in the cleanup step, “until your next turn” effects end when your next turn begins, and delayed triggers fire at the beginning of the step they name. You can remove one by hand if the app got it wrong.' }) : null, list].filter(Boolean));
  m.foot.append(h('button', { class: 'primary', text: 'Close', onclick: () => m.close() }));
  draw();
}

// How the live power/toughness differs from the printed one: 'up' (bigger), 'down' (smaller), 'dyn' (defined by the game state), '' (unchanged)
function ptDelta(r) {
  if (r.dynamic || r.unknown) return 'dyn';
  if (r.bp != null && r.bt != null) { if (r.p < r.bp || r.t < r.bt) return 'down'; if (r.p > r.bp || r.t > r.bt) return 'up'; }
  return r.modified ? 'up' : '';
}
const lastPT = new Map();   // card id -> last P/T text shown, so a change can flash
function ptTitle(c, r) { const info = c.token ? null : cardInfo(c.name); return `Printed ${(c.token ? c.tk.pt : info && info.pt) || '?'}, now ${r.p}/${r.t}${r.unknown ? '?' : ''}` + (r.why.length ? ': ' + r.why.join('; ') : ''); }
function ptOverlay(c, r, extraClass) {   // the box that covers the printed power/toughness on a card picture
  const d = ptDelta(r), txt = `${r.p}/${r.t}${r.unknown ? '?' : ''}`;
  return h('div', { class: 'ptbox pt-' + (d || 'same') + (extraClass || ''), text: txt, 'data-len': String(txt.length), title: ptTitle(c, r) });
}
function ptNoteRow(c) {
  if (!state || permZone(c) !== 'creatures') return null;
  const r = ptCalc(c);
  if (!r.dynamic && !r.modified && !r.unknown) return null;
  return h('div', { text: `Power/toughness now ${ptText(c)}: ${r.why.join('; ')}.` });
}
// State-based action: a creature with toughness 0 or less is put into its owner's graveyard.
let sbaRunning = false, sbaFlush = false;
function runToughnessSBA() {
  if (sbaRunning || !state || state.phase === 'idle') return;
  sbaRunning = true;
  try {
    // v0.82 more state-based actions (rule 704.5): +1/+1 and -1/-1 counters on one permanent cancel; a planeswalker with no loyalty is put into its owner's graveyard;
    // ten poison counters, or trying to draw from an empty library, means you lose.
    for (const c of state.battlefield) { const k = c.counters; if (k && k.plus > 0 && k.minus > 0) { const n = Math.min(k.plus, k.minus); k.plus -= n; k.minus -= n; log(`${c.name}: ${n} +1/+1 and ${n} -1/-1 counter${n === 1 ? '' : 's'} removed (state-based action)`); } }
    for (let g2 = 0; g2 < 10; g2++) {
      const pw = state.battlefield.find(c => c.loyalty !== undefined && c.loyalty <= 0 && permTypeInfo(c).types.has('planeswalker')); if (!pw) break;
      log(`${pw.name} has no loyalty counters: put into the graveyard (state-based action)`); toast(`${pw.name} dies`, 'A planeswalker with loyalty 0 is put into its owner\'s graveyard.'); leaveBattlefield(pw, 'graveyard'); sbaFlush = true;
    }
    if (state.phase === 'play') {
      if (state.gs && (state.gs.poison || 0) >= 10 && !state.lossShown) { state.lossShown = 'poison'; log('You have ten or more poison counters: you lose the game (state-based action)'); lethalFx('you', 'Ten poison counters', 'In a real game you would lose here.'); }
      if (state.drewEmpty && !state.lossShown) { state.lossShown = 'library'; log('You tried to draw from an empty library: you lose the game (state-based action)'); lethalFx('you', 'Drew from an empty library', 'In a real game you would lose here.'); }
    }
    for (let guard = 0; guard < 20; guard++) {
      const dead = state.battlefield.find(c => permZone(c) === 'creatures' && (c.token || cardInfo(c.name)) && (() => { const r = ptCalc(c); return !r.unknown && (r.t <= 0 || ((c.dmg || 0) >= r.t && !hasKw(c, 'indestructible'))); })());
      if (!dead) break;
      { const lethal = (dead.dmg || 0) > 0 && ptCalc(dead).t > 0;
        log(lethal ? `${dead.name} has lethal damage marked on it (${dead.dmg}): destroyed (state-based action)` : `${dead.name} has toughness 0 or less: put into the graveyard (state-based action)`);
        toast(`${dead.name} dies`, lethal ? 'A creature with damage marked equal to or greater than its toughness is destroyed.' : 'A creature with toughness 0 or less is put into its owner’s graveyard.'); }
      leaveBattlefield(dead, 'graveyard'); sbaFlush = true;
    }
  } finally { sbaRunning = false; }
  if (sbaFlush) setTimeout(() => { sbaFlush = false; flushTriggers(); }, 0);
}
function attackBlock(c) {   // why this creature cannot attack right now ('' = it can)
  if (c.tapped) return 'It is tapped.';
  if (isSick(c)) return 'Summoning sickness: it came under your control this turn (and has no haste).';
  if (hasKw(c, 'defender')) return 'Defender: this creature cannot attack.';
  { const gb = globalAttackBlock(c); if (gb) return gb; }
  { const cb = statics().find(e => e.kind === 'cant' && e.attack && e.subj.test(c)); if (cb) return `${cb.g.name}: this creature can't attack.`; }
  return '';
}
function eligibleAttackers() { return state ? state.battlefield.filter(c => permZone(c) === 'creatures' && !attackBlock(c)) : []; }
// CR 103.6a: "If ~ is in your opening hand, you may begin the game with it on the battlefield."  CR 103.5b: "Any time you could mulligan and ~ is in your hand, you may exile all the cards from your hand, then draw that many cards."
const selfTxt = c => String(cardText(c) || '').replace(/\([^)]*\)/g, ' ').replace(/\u2019/g, "'").replace(selfNameRe(c.name), '~').replace(/\bthis card\b/gi, '~');
function beginsOnBattlefield(c) { return /if ~ is in your opening hand, you may begin the game with it on the battlefield/i.test(selfTxt(c)); }
function mulliganHandSwap(c) { return /any time you could mulligan and ~ is in your hand, you may exile all the cards from your hand, then draw that many cards/i.test(selfTxt(c)); }
// "Enter tapped as a copy of any land on the battlefield" is a clone-style replacement effect (CR 614.12, 707.2).
function entersAsLandCopy(c) { return /you may have ~ enter (?:the battlefield )?tapped as a copy of any land on the battlefield/i.test(selfTxt(c)); }   // v0.96.26 current Oracle wording drops "the battlefield"
function landETBTrigger(c) {
  const tx=cardText(c); let m=tx.match(/enters(?: the battlefield)?[^.]*\bscry\s+(\d+)/i);
  if(m) return {kind:'ability',cardId:c.id,cardName:c.name,special:'scry',n:+m[1],optional:false,why:'A land with an enters-the-battlefield trigger.',text:`When ${c.name} enters, scry ${m[1]}.`,effect:`Scry ${m[1]}.`};
  m=tx.match(/enters(?: the battlefield)?[^.]*\bsurveil\s+(\d+)/i);
  if(m) return {kind:'ability',cardId:c.id,cardName:c.name,special:'surveil',n:+m[1],optional:false,why:'A land with an enters-the-battlefield trigger.',text:`When ${c.name} enters, surveil ${m[1]}.`,effect:`Surveil ${m[1]}.`};
  return null;
}
function triggeredAbilityFor(c){
  const tx=cardText(c); if(!tx)return null;
  const m=tx.match(/((?:When|Whenever|At the beginning|At the end)[^.]*\.)/i);
  if(!m)return null;
  return {kind:'ability',cardId:c.id,text:m[1]};
}
