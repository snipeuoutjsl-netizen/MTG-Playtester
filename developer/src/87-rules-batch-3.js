// ---- v0.99.80 rules batch 3: sentences the Remember audit still found without an effect behind them
// Prevention shields (CR 615), switching power and toughness (CR 613.4d), +X/+X and -X/-X pumps, "exile it instead if it would die",
// "you may play that card this turn" after a card was exiled, and "gain control … until end of turn" on the goldfish table.

// CR 615.1 a prevention shield: { kind: 'shield', who: 'you' | targetId: <permanent>, n: number|Infinity, once?: true (the next time only) }
function preventDamage(key, n, src) {
  if (!state || !(n > 0)) return n;
  if ((state.fx || []).some(e => e.kind === 'noprevent')) return n;   // CR 615.12 "damage can't be prevented"
  let left = n;
  for (const e of (state.fx || []).filter(e => e.kind === 'shield' && (key === 'you' ? e.who === 'you' : e.targetId === key))) {
    if (left <= 0) break;
    const take = Math.min(left, e.n); left -= take; e.n -= take;
    log(`${e.srcName || 'A shield'}: prevented ${take} damage to ${key === 'you' ? 'you' : fxTargetName(e)} (CR 615)`);
    if (e.once || e.n <= 0) state.fx = state.fx.filter(x => x !== e);
  }
  return left;
}
function addShield(where, n, src, text, once) {
  const o = { kind: 'shield', n, once: !!once, until: 'eot', srcName: src, text };
  if (where === 'you') o.who = 'you'; else o.targetId = where;
  return addFx(o);
}
// a permanent's power, read for "where X is its power"
function b3Power(id) { const f = findCard(id); return f && f.zone === 'battlefield' ? Math.max(0, ptCalc(f.card).p) : 0; }

function batch3Options(t, sents, obj, src, out, drop) {
  if (!state) return;
  const perms = () => (obj.targets || []).filter(x => !x.gone && x.kind === 'perm');
  const players = () => (obj.targets || []).filter(x => !x.gone && x.kind === 'player');
  const srcPerm = () => { const f = obj.sourceId != null ? findCard(obj.sourceId) : null; return f && f.zone === 'battlefield' ? f.card : null; };
  const word = (s) => s.replace(/\.$/, '');

  // 1. CR 615.7 "Prevent the next N damage that would be dealt to <who> this turn." / "Prevent all damage that would be dealt to <who> this turn." /
  //    "The next time a source of your choice would deal damage to <who> this turn, prevent that damage."
  for (const s of sents) {
    let m, n = null, once = false, who = null;
    if ((m = /^prevent the next (\d+|x) damage that would be dealt to (.+?) this turn\.?$/i.exec(s))) { n = /^x$/i.test(m[1]) ? (obj.xValue || 0) : +m[1]; who = m[2]; }
    else if ((m = /^prevent all damage that would be dealt to (.+?) this turn\.?$/i.exec(s))) { n = Infinity; who = m[1]; }
    else if ((m = /^the next time a source of your choice would deal damage to (.+?) this turn, prevent that damage\.?$/i.exec(s))) { n = Infinity; once = true; who = m[1]; }
    if (n == null) continue;
    const w = who.toLowerCase(), amount = n === Infinity ? (once ? 'the next damage from one source' : 'all damage') : `the next ${n} damage`;
    let label, fn;
    if (/^you$/.test(w)) { label = `Prevent ${amount} that would be dealt to you this turn`; fn = () => { snap(); addShield('you', n, src, word(s), once); log(`${src}: ${amount} that would be dealt to you this turn is prevented`); render(); }; }
    else if (/^(?:~|him|her|it|this (?:creature|permanent|planeswalker))$/.test(w)) { label = `Prevent ${amount} that would be dealt to ${src} this turn`; fn = () => { const c = srcPerm(); if (!c) { toast('Not on the battlefield', `${src} is no longer on the battlefield.`); return; } snap(); addShield(c.id, n, src, word(s), once); log(`${src}: ${amount} that would be dealt to it this turn is prevented`); render(); }; }
    else if (/\btarget\b|^any target$/.test(w)) {
      const ts = (obj.targets || []).filter(x => !x.gone); if (!ts.length && !/^any target$/.test(w) && !/\btarget\b/.test(w)) continue;
      label = ts.length ? `Prevent ${amount} that would be dealt to ${ts.map(x => x.name).join(', ')} this turn` : `Prevent ${amount} that would be dealt to the target this turn`;
      fn = () => { snap(); for (const x of ts) { if (x.kind === 'player' && x.id === 'you') addShield('you', n, src, word(s), once); else if (x.kind === 'perm') { const f = findCard(x.id); if (f && f.zone === 'battlefield') addShield(x.id, n, src, word(s), once); } else log(`${src}: ${x.name} is on your opponent's side: apply the prevention at the table`); }
        log(`${src}: ${amount} that would be dealt to ${ts.map(x => x.name).join(', ') || 'the target'} this turn is prevented`); render(); };
    } else continue;
    out.push({ covers: [s], full: sents.length === 1, label, fn });
    drop.push(new RegExp('^Remember \\(until end of turn\\): ' + s.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }

  // 2. CR 613.4d "Switch <its> power and toughness until end of turn." (applied after every other change, see ptCalc)
  { const ss = sents.find(x => /^switch (?:~'s|this creature's|its|target creature's|that creature's|each creature's) power and toughness until end of turn\.?$/i.test(x));
    if (ss) { const tgt = /target creature's/i.test(ss), each = /each creature's/i.test(ss);
      const ids = () => each ? state.battlefield.filter(c => permZone(c) === 'creatures').map(c => c.id) : tgt ? perms().map(x => x.id) : (srcPerm() ? [srcPerm().id] : []);
      const nm = each ? 'Each creature' : tgt ? (perms().map(x => x.name).join(', ') || 'Target creature') : src;
      out.push({ covers: [ss], full: sents.length === 1, label: `Switch ${nm}'s power and toughness until end of turn`, fn: () => { const l = ids(); if (!l.length) { toast('No creature', 'There is no creature to switch.'); return; } snap(); for (const id of l) addFx({ kind: 'switch', targetId: id, until: 'eot', srcName: src, text: 'power and toughness switched' }); log(`${src}: ${nm}: power and toughness switched until end of turn (CR 613.4d)`); render(); } });
      drop.push(/^Remember \(until end of turn\): Switch /i); } }

  // 3. "<who> gets +X/+X until end of turn[, where X is its power]" and -X/-X (X from the spell, or the creature's own power)
  for (const s of sents) {
    const m = /^(target creature(?: you control)?|~|this creature|it|that creature|enchanted creature|equipped creature) gets ([+-])(x|\d+)\/([+-])(x|\d+) until end of turn(?:, where x is (its power|[^.]+))?\.?$/i.exec(s);
    if (!m || !/x/i.test(m[3] + m[5])) continue;
    const ownPower = /^its power$/i.test(m[6] || ''); if (m[6] && !ownPower) continue;   // other "where X is …" are read by applyWhereX before this
    if (!ownPower && obj.xValue == null) continue;
    const subj = m[1].toLowerCase();
    const who = () => /^target/.test(subj) ? perms().map(x => ({ id: x.id, name: x.name })) : /^(?:enchanted|equipped)/.test(subj) ? (() => { const g = srcPerm(), host = g && g.att != null ? findCard(g.att) : null; return host ? [{ id: host.card.id, name: host.card.name }] : []; })() : (srcPerm() ? [{ id: srcPerm().id, name: src }] : []);
    const val = (id, sign, part) => sign * (/x/i.test(part) ? (ownPower ? b3Power(id) : obj.xValue) : +part);
    const sp = m[2] === '-' ? -1 : 1, st = m[4] === '-' ? -1 : 1, xs = ownPower ? 'X is its power' : 'X = ' + obj.xValue;
    out.push({ covers: [s], full: sents.length === 1, label: `${who().map(x => x.name).join(', ') || m[1]} gets ${m[2]}${m[3].toUpperCase()}/${m[4]}${m[5].toUpperCase()} until end of turn (${xs})`, fn: () => {
      const l = who(); if (!l.length) { toast('No creature', 'There is no creature to change.'); return; } snap();
      for (const x of l) { const p = val(x.id, sp, m[3]), tt = val(x.id, st, m[5]); addFx({ kind: 'pt', targetId: x.id, p, t: tt, until: 'eot', srcName: src, srcId: obj.sourceId || null }); log(`${src}: ${x.name} gets ${sgnN(p)}/${sgnN(tt)} until end of turn`); }
      runToughnessSBA(); render(); } });
    drop.push(/^Remember \(until end of turn\): .*gets [+-]X\//i);
  }

  // 4. CR 614.1a "If a creature dealt damage this way would die this turn, exile it instead." / "If that creature or planeswalker would die …" / "If a creature would die this turn, exile it instead."
  { const es = sents.find(x => /^if (?:a creature|a permanent|a creature or planeswalker|that creature or planeswalker|that permanent|that creature) (?:dealt damage this way )?would die this turn, exile it instead\.?$/i.test(x));
    if (es) { const all = /^if a creature would die this turn/i.test(es), dealt = /dealt damage this way/i.test(es);
      out.push({ early: true, covers: [es], full: sents.length === 1, label: all ? 'This turn, a creature that would die is exiled instead' : perms().length ? `If ${perms().map(x => x.name).join(', ')} would die this turn, it is exiled instead` : dealt ? 'A creature dealt damage this way that would die this turn is exiled instead' : 'If the creature would die this turn, it is exiled instead', fn: () => {
        if (all) { addFx({ kind: 'dieexile', until: 'eot', srcName: src, text: 'If a creature would die this turn, exile it instead' }); log(`${src}: creatures that would die this turn are exiled instead`); render(); return; }
        if (dealt && !perms().length) { addFx({ kind: 'dieexile', dealtBy: src, until: 'eot', srcName: src, text: `If a creature dealt damage by ${src} would die this turn, exile it instead` }); log(`${src}: a creature dealt damage this way that would die this turn is exiled instead`); render(); return; }
        const ids = new Set(perms().map(x => x.id));
        for (const id of ids) { const f = findCard(id); if (f && f.zone === 'battlefield') f.card.dieExileTurn = state.turn; }
        log(`${src}: ${ids.size ? 'if ' + [...ids].map(id => (findCard(id) || { card: { name: '?' } }).card.name).join(', ') + ' would die this turn, it is exiled instead' : 'no creature of yours was dealt damage this way'}`); render(); } });
      drop.push(/^Remember \(until end of turn\): If .*would die this turn, exile it instead/i); } }

  // 5. impulse draw told in two sentences: "Exile the top two cards …, then choose one of them. You may play that card this turn." (Party Thrasher, Jaya…)
  { const ps = sents.find(x => /^(?:until end of turn, )?you may (play|cast) (that card|those cards|the exiled cards?|cards exiled this way|it|them)(?: this turn| until end of turn| until the end of your next turn)?\.?$/i.test(x));
    const prev = ps ? sents[sents.indexOf(ps) - 1] || '' : '';
    if (ps && !/\bmill\b|graveyard/i.test(prev) && !/\bexile the top (?:card|(?:a|one|two|three|four|five|six|seven|x|\d+) cards) of your library\.?$/i.test(prev)) {
      const cast = /you may cast/i.test(ps), many = /those|them|cards/i.test(ps), next = /next turn/i.test(ps);
      out.push({ covers: [ps], label: `Choose the exiled card${many ? 's' : ''} you may ${cast ? 'cast' : 'play'} ${next ? 'until the end of your next turn' : 'this turn'}`, fn: () => {
        const pool = state.exile.filter(c => !mayPlayNow(c)).slice(-8).reverse();
        if (!pool.length) { toast('Nothing exiled', 'There is no card in exile to choose.'); return; }
        const mm = modal(`${src}: you may ${cast ? 'cast' : 'play'} ${many ? 'these' : 'this'} ${next ? 'until the end of your next turn' : 'this turn'}`, { width: 520 });
        const pick = new Set([pool[0].id]);
        const draw = () => mm.body.replaceChildren(h('div', { class: 'muted', text: many ? 'The newest cards in exile are listed first. Tick each card this effect lets you play.' : 'The newest card in exile is listed first. Choose the card this effect lets you play.' }),
          ...pool.map(c => h('label', { class: 'row' }, h('input', { type: many ? 'checkbox' : 'radio', name: 'b3pick', checked: pick.has(c.id), onchange: () => { if (!many) pick.clear(); if (pick.has(c.id) && many) pick.delete(c.id); else pick.add(c.id); draw(); } }), h('span', { class: 'nm' }, c.name, ' ', symbols((cardInfo(c.name) || {}).mc || '')))));
        draw();
        mm.foot.append(h('button', { text: 'Cancel', onclick: () => mm.close() }), h('button', { class: 'primary', text: 'Confirm', onclick: () => { mm.close(); snap(); const got = [];
          for (const c of pool) if (pick.has(c.id)) { if (next) c.mayPlayUntil = state.turn + 1; else c.mayPlayTurn = state.turn; if (cast) c.mayCastOnly = true; got.push(c.name); }
          log(`${src}: you may ${cast ? 'cast' : 'play'} ${got.join(', ') || 'nothing'} ${next ? 'until the end of your next turn' : 'this turn'} (from the exile pile)`); render(); } }));
      } });
      drop.push(/^Remember \(until end of turn\): (?:Until end of turn, )?You may (?:play|cast) /i);
    } }

  // 6. "Gain control of target creature until end of turn." The goldfish table has no opponent creatures: your own stays yours, an opponent's is played out at the real table
  { const gs = sents.find(x => /^(?:until end of turn, )?gain control of target ([a-z ]+?)(?: an opponent controls)?(?: until end of turn)?\.?$/i.test(x) && /until end of turn/i.test(x));
    if (gs) { const mine = perms(); out.push({ covers: [gs], full: sents.length === 1, label: mine.length ? `Gain control of ${mine.map(x => x.name).join(', ')} until end of turn (you already control it)` : 'Gain control of the creature until end of turn (your opponent\'s creature: move it at the real table)', fn: () => {
      if (mine.length) log(`${src}: you already control ${mine.map(x => x.name).join(', ')}; nothing changes`);
      else { addFx({ kind: 'note', until: 'eot', srcName: src, text: 'You control the stolen creature until end of turn (opponent\'s creature, play it out at the table)' }); log(`${src}: gain control of your opponent's creature until end of turn (apply it at the real table)`); } render(); } });
      drop.push(/^Remember \(until end of turn\): (?:Until end of turn, )?gain control of /i); } }
}
