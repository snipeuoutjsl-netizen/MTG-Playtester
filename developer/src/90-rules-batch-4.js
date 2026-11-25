// ---- v0.99.84 rules batch 4: what the Remember audit still found most often
// "… of your choice" (CR 105.1 colours / 205.3 types): ask, then read the sentence with the answer in it.
// "until your next turn" / "this turn" allowances: no maximum hand size (CR 402.2), cast as though it had flash (CR 702.8),
// "… unless <condition>", Vehicles and "it" becoming artifact creatures, "Those creatures gain …" after a group,
// and combat requirements on your opponent's creatures, which are kept as notes for the real table (CR 508.1d / 509.1c).
const B4_COLORS = ['white', 'blue', 'black', 'red', 'green'];
const B4_BASICS = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'];
function b4Choose(title, note, list, cb) {
  const m = modal(title, { width: 420 });
  m.body.append(h('div', { class: 'psub', text: note }), h('div', { class: 'row', style: 'flex-wrap:wrap;gap:8px;margin-top:8px' }, ...list.map(v => h('button', { text: v.charAt(0).toUpperCase() + v.slice(1), onclick: () => { m.close(); cb(v); } }))));
  m.foot.append(h('button', { text: 'Cancel', onclick: () => m.close() }));
}
// run what a sentence offers once the choice is in it: one effect is applied, several are offered, none becomes a note in Active effects
function b4RunSentence(s, obj, src) {
  let os = []; try { os = effectOptions(s, Object.assign({}, obj, { _tgtAsked: true, _noRemCheck: true })).filter(o => o && !o.hidden && !/^Remember/.test(o.label || '')); } catch (e) { os = []; }
  if (os.length === 1) { os[0].fn(); return; }
  if (!os.length) { snap(); addFx({ kind: 'note', until: /until your next turn/i.test(s) ? 'yourNextTurn' : 'eot', turn: state.turn, srcName: src, text: s.replace(/\.$/, '') }); log(`${src}: ${s.replace(/\.$/, '')}`); render(); return; }
  const m = modal(src, { width: 460 }); m.body.append(h('div', { class: 'psub', text: s }), ...os.map(o => h('div', { class: 'row' }, h('span', { class: 'nm', text: o.label }), h('button', { class: 'primary', text: 'Apply', onclick: ev => { o.fn(); ev.target.disabled = true; } }))));
  m.foot.append(h('button', { class: 'primary', text: 'Done', onclick: () => m.close() }));
}
function b4Vehicle(c, src) {
  const i = cardInfo(c.name); c.becomes = { pt: (i && i.pt) || '0/0', types: ['artifact', 'creature'], subs: (cardInfo(c.name) || {}).t && /Vehicle/.test(cardInfo(c.name).t) ? ['vehicle'] : [], kws: [] };
  addFx({ kind: 'delayed', when: 'end', action: 'unbecome', targetId: c.id, targetName: c.name, text: `${c.name}: it stops being a creature.`, srcName: src });
}

function batch4Options(t, sents, obj, src, out, drop) {
  if (!state) return;
  const perms = () => (obj.targets || []).filter(x => !x.gone && x.kind === 'perm');
  const srcPerm = () => { const f = obj.sourceId != null ? findCard(obj.sourceId) : null; return f && f.zone === 'battlefield' ? f.card : null; };
  const esc = x => x.slice(0, 24).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const remDrop = s => drop.push(new RegExp('^Remember \\([^)]*\\): ' + esc(s), 'i'));

  for (let i = 0; i < sents.length; i++) {
    const s = sents[i], prev = sents[i - 1] || ''; let m;

    // 1. "of your choice": a colour or a basic land type, asked as it resolves
    if ((m = /\b(the color of your choice|a color of your choice|the color or colors of your choice|the basic land type of your choice)\b/i.exec(s))) {
      const land = /land type/i.test(m[1]), list = land ? B4_BASICS : B4_COLORS;
      out.push({ covers: [s], full: sents.length === 1, label: `Choose ${land ? 'a basic land type' : 'a color'}: ${s.replace(/\.$/, '')}`, fn: () => b4Choose(`${src}: choose ${land ? 'a basic land type' : 'a color'}`, s, list, v => {
        const s2 = s.replace(m[1], land ? v : /colors/.test(m[1]) ? v : v); log(`${src}: chose ${v}`); b4RunSentence(s2, obj, src); }) });
      remDrop(s); continue;
    }
    // 2. "You have no maximum hand size until your next turn / this turn / for the rest of the game"
    if ((m = /^you have no maximum hand size(?: (until your next turn|until end of turn|this turn|for the rest of the game))?\.?$/i.exec(s))) {
      const u = !m[1] || /rest of the game/i.test(m[1]) ? 'permanent' : /next turn/i.test(m[1]) ? 'yourNextTurn' : 'eot';
      out.push({ covers: [s], full: sents.length === 1, label: `You have no maximum hand size ${u === 'permanent' ? 'for the rest of the game' : u === 'eot' ? 'this turn' : 'until your next turn'}`, fn: () => { snap(); addFx({ kind: 'nomaxhand', until: u, turn: state.turn, srcName: src, text: 'No maximum hand size' }); log(`${src}: you have no maximum hand size ${u === 'eot' ? 'this turn' : u === 'permanent' ? 'for the rest of the game' : 'until your next turn'}`); render(); } });
      remDrop(s); continue;
    }
    // 3. "You may cast spells this turn as though they had flash." (also "creature spells", "noncreature spells")
    if ((m = /^(?:until end of turn, )?you may cast (spells|creature spells|noncreature spells|artifact spells|instant and sorcery spells|sorcery spells) (?:this turn )?as though they had flash(?: this turn| until end of turn)?\.?$/i.exec(s))) {
      const kind = m[1].toLowerCase();
      out.push({ covers: [s], full: sents.length === 1, label: `You may cast ${kind} this turn as though they had flash`, fn: () => { snap(); addFx({ kind: 'flashall', what: kind, until: 'eot', srcName: src, text: `${kind} as though they had flash` }); log(`${src}: you may cast ${kind} this turn as though they had flash`); render(); } });
      remDrop(s); continue;
    }
    // 4. "Then discard a card unless you attacked this turn." — the condition decides whether the sentence happens at all
    if ((m = /^(?:then )?(.+?) unless (.+?)\.?$/i.exec(s)) && !/\bpays?\b|\bsacrifices?\b|\bdiscards?\b.*\bunless\b.*\b(?:pays?|discards?)\b/i.test(m[2])) {
      let v = null; try { v = evalCond(m[2], srcPerm()); } catch (e) { v = null; }
      if (v !== null) {
        const rest = m[1].charAt(0).toUpperCase() + m[1].slice(1) + '.';
        if (v) out.push({ covers: [s], label: `${rest.replace(/\.$/, '')}: not done (${m[2]})`, fn: () => log(`${src}: ${m[2]}, so ${m[1]} does not happen`) });
        else { let os = []; try { os = effectOptions(rest, Object.assign({}, obj, { _noRemCheck: true })).filter(o => !/^Remember/.test(o.label || '')); } catch (e) { os = []; }
          if (os.length) for (const o of os) out.push(Object.assign({}, o, { covers: [s], full: false })); else continue; }
        remDrop(s); continue;
      }
    }
    // 5. "Vehicles you control become artifact creatures until end of turn." / "it becomes an artifact creature until end of turn"
    if (/^vehicles you control become artifact creatures until end of turn\.?$/i.test(s)) {
      out.push({ covers: [s], full: sents.length === 1, label: 'Your Vehicles become artifact creatures until end of turn', fn: () => { const vs = state.battlefield.filter(c => /\bVehicle\b/.test((cardInfo(c.name) || {}).t || '')); if (!vs.length) { toast('No Vehicles', 'You control no Vehicles.'); return; } snap(); for (const c of vs) b4Vehicle(c, src); log(`${src}: ${vs.map(c => c.name).join(', ')} become artifact creatures until end of turn`); render(); } });
      remDrop(s); continue;
    }
    if (/^(?:it|that vehicle|target vehicle|that artifact) becomes an artifact creature until end of turn\.?$/i.test(s)) {
      const c0 = () => perms()[0] ? (findCard(perms()[0].id) || {}).card : /^it/i.test(s) && obj.lastTargetId ? (findCard(obj.lastTargetId) || {}).card : srcPerm();
      out.push({ covers: [s], full: sents.length === 1, label: `${(c0() || { name: 'It' }).name} becomes an artifact creature until end of turn`, fn: () => { const c = c0(); if (!c) { toast('Not there', 'That permanent is not on the battlefield.'); return; } snap(); b4Vehicle(c, src); log(`${src}: ${c.name} becomes an artifact creature until end of turn`); render(); } });
      remDrop(s); continue;
    }
    // 6. "Those creatures gain vigilance until end of turn." after "Creatures you control get +1/+1 until end of turn."
    if ((m = /^those creatures gain ([a-z ,]+?) until end of turn\.?$/i.exec(s)) && /\b(?:creatures|each creature|creature) you control\b/i.test(prev)) {
      const kws = kwsIn(m[1]); if (!kws.length) continue;
      out.push({ covers: [s], label: `Creatures you control gain ${kws.join(', ')} until end of turn`, fn: () => { snap(); for (const c of state.battlefield.filter(c => permZone(c) === 'creatures')) for (const kw of kws) addFx({ kind: 'kw', kw, targetId: c.id, until: 'eot', srcName: src }); log(`${src}: creatures you control gain ${kws.join(', ')} until end of turn`); render(); } });
      remDrop(s); continue;
    }
    // 7. combat requirements and restrictions this turn (CR 508.1d, 509.1c): on your opponent's creatures they are for the real table;
    //    on yours they are kept in Active effects so you see them when you attack
    if (/^(?:target creature|that creature|it|target creature an opponent controls|all creatures able to block target creature|target creature defending player controls) (?:blocks (?:~|this creature|it)? ?this turn if able|blocks this turn if able|attacks this turn if able|can't attack or block this turn|can't block this turn|can't attack this turn|this turn do so|must block this turn if able)\.?$/i.test(s) || /^all creatures able to block (?:target creature|~|this creature) this turn do so\.?$/i.test(s) || /^they gain haste until end of turn\.?$/i.test(s)) {
      const mine = perms().filter(x => (findCard(x.id) || {}).zone === 'battlefield');
      out.push({ covers: [s], full: sents.length === 1, label: mine.length ? `${mine.map(x => x.name).join(', ')}: ${s.replace(/^[^ ]+ [^ ]+ /, '').replace(/\.$/, '')}` : `For the real table: ${s.replace(/\.$/, '')}`, fn: () => {
        snap(); if (mine.length) for (const x of mine) addFx({ kind: 'note', targetId: x.id, until: 'eot', srcName: src, text: s.replace(/\.$/, '') });
        else addFx({ kind: 'note', until: 'eot', srcName: src, text: s.replace(/\.$/, '') + ' (your opponent\'s creatures)' });
        log(`${src}: ${s.replace(/\.$/, '')}${mine.length ? '' : ' (your opponent\'s creatures: apply it at the real table)'}`); render(); } });
      remDrop(s); continue;
    }
  }
}
// CR 402.2 the maximum hand size, with "no maximum hand size until your next turn" effects
function fxNoMaxHand() { return !!state && (state.fx || []).some(e => e.kind === 'nomaxhand'); }
// CR 702.8 "as though it had flash" for this turn
function fxFlashAll(c) {
  if (!state) return false; const i = c && cardInfo(c.name); if (!i || i.land) return false; const t = (i.t || '').split(' // ')[0];
  return (state.fx || []).some(e => e.kind === 'flashall' && (e.what === 'spells' || (e.what === 'creature spells' && /\bCreature\b/.test(t)) || (e.what === 'noncreature spells' && !/\bCreature\b/.test(t)) || (e.what === 'artifact spells' && /\bArtifact\b/.test(t)) || (e.what === 'sorcery spells' && /\bSorcery\b/.test(t)) || (e.what === 'instant and sorcery spells' && /\b(?:Instant|Sorcery)\b/.test(t))));
}
