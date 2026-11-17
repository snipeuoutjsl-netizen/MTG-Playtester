// ---------------------------------------------------------------- attachments (v0.64)
// Equipment and Auras are linked to the permanent they are attached to with c.att (the host's id). Rule 301.5 / 303.4:
// Equipment can only be attached to a creature; an Aura goes to the graveyard when what it enchants is gone (704.5m);
// an Equipment simply becomes unattached (704.5n). Bonuses are read from "Equipped/Enchanted creature gets ..." in parseStaticCard.
const isAuraCard = c => !!c && !c.token && /\bAura\b/.test(frontType(c));
const isEquipmentCard = c => !!c && !c.token && /\bEquipment\b/.test(frontType(c));
function hostOf(c) { return state && c && c.att ? state.battlefield.find(x => x.id === c.att) || null : null; }
function attachmentsOf(host) { return state && host ? state.battlefield.filter(x => x.att === host.id) : []; }
function attachTo(attId, hostId, src) {
  const a = findCard(attId), t = findCard(hostId);
  if (!a || a.zone !== 'battlefield' || !t || t.zone !== 'battlefield' || a.card.id === t.card.id) return false;
  if (isEquipmentCard(a.card) && permZone(t.card) !== 'creatures') { toast("Can't attach", `${a.card.name} is Equipment, so it can only be attached to a creature (rule 301.5c).`); return false; }
  snap(); const prev = hostOf(a.card); a.card.att = t.card.id;
  log(`${src ? src + ': ' : ''}${a.card.name} attached to ${t.card.name}${prev && prev.id !== t.card.id ? ` (it was on ${prev.name})` : ''}`);
  sfx && sfx('enter'); render(); return true;
}
function unattach(attId) { const a = findCard(attId); if (!a || !a.card.att) return; snap(); const h0 = hostOf(a.card); delete a.card.att; log(`${a.card.name} unattached${h0 ? ' from ' + h0.name : ''}`); render(); }
// Called when a permanent leaves the battlefield: Auras that were on it fall off (704.5m), Equipment becomes unattached (704.5n).
function detachFrom(c) {
  if (!state) return;
  delete c.att;
  for (const x of state.battlefield.slice()) if (x.att === c.id) {
    if (bestowHostLeft(x)) continue;
    if (isAuraCard(x)) { log(`${x.name} is put into the graveyard: what it enchanted (${c.name}) left the battlefield`); leaveBattlefield(x, 'graveyard'); }
    else { delete x.att; log(`${x.name} became unattached (${c.name} left the battlefield)`); }
  }
}
function auraHostOk(x, what) {
  const p = permTypeInfo(x); let ok = true, any = false;
  for (const w of what.split(/\s+/)) {
    const nm = w.match(/^non-?(\w+)$/);
    if (nm) { any = true; if (p.types.has(nm[1])) ok = false; }
    else if (['creature', 'land', 'artifact', 'enchantment', 'planeswalker', 'permanent', 'legendary'].includes(w)) { any = true; if (!p.types.has(w)) ok = false; }
    else if (/^(?:you|control|a|an|that|with|your|the)$/.test(w)) continue;
    else if (p.subs.has(w) || p.subs.has(w.replace(/s$/, ''))) { any = true; }
  }
  return any && ok;
}
function openAttachChoice(cardId) {
  const f = findCard(cardId); if (!f || f.zone !== 'battlefield') return;
  const c = f.card, em = cardText(c).match(/^Enchant ([^\n]+)/mi), what = (em ? em[1] : 'creature').toLowerCase().replace(/\s*\(.*$/, '');
  if (!em || /graveyard|opponent|don'?t control|\bplayer\b/.test(what)) { log(`${c.name}: enchants "${what}", which the app cannot attach to - track it by hand`); toast('Attach by hand', `${c.name} enchants "${what}". The app can't attach to that; use the card menu (Attach to…) if it is a permanent you control.`); if (state.pendingTriggers.length) resolvePendingTrigger(); return; }
  const cands = state.battlefield.filter(x => x.id !== c.id && auraHostOk(x, what.replace(/\s+you control$/, '')));
  if (!cands.length) { snap(); log(`${c.name} has nothing to enchant, so it is put into the graveyard (rule 704.5m)`); toast('No legal host', `${c.name} enchants ${what} and you control none, so it goes to the graveyard.`); leaveBattlefield(c, 'graveyard'); render(); if (state.pendingTriggers.length) resolvePendingTrigger(); return; }
  const m = modal(`${c.name}: enchant what?`, { width: 520, sticky: true, noClose: true });
  m.body.append(h('div', { class: 'psub', text: `Enchant ${what}. Choose what it is attached to. While it stays attached, its “Enchanted … gets …” bonuses apply to that permanent.` }));
  const done = () => { m.close(); render(); if (state.pendingTriggers.length) resolvePendingTrigger(); };
  for (const x of cands) m.body.append(h('div', { class: 'row' }, h('span', { class: 'nm', text: x.name + (x.tapped ? ' (tapped)' : '') }), h('button', { class: 'primary', text: 'Attach here', onclick: () => { attachTo(c.id, x.id); done(); } })));
  m.foot.append(h('button', { text: 'No host: put it in the graveyard', onclick: () => { snap(); log(`${c.name} was put into the graveyard (no host chosen)`); leaveBattlefield(c, 'graveyard'); done(); } }));
}
function openAttachPicker(c) {
  const hosts = state.battlefield.filter(x => x.id !== c.id && (isEquipmentCard(c) ? permZone(x) === 'creatures' : true));
  if (!hosts.length) { toast('Nothing to attach to', 'There is no valid permanent on the battlefield.'); return; }
  const m = modal(`Attach ${c.name} to…`, { width: 480 });
  for (const x of hosts) m.body.append(h('div', { class: 'row' }, h('span', { class: 'nm', text: x.name + (x.id === c.att ? ' (current)' : '') }), h('button', { class: 'primary', text: 'Attach', onclick: () => { m.close(); attachTo(c.id, x.id); } })));
  m.foot.append(h('button', { text: 'Cancel', onclick: () => m.close() }));
}
// "Living weapon": a 0/0 black Phyrexian Germ token enters and the Equipment is attached to it (rule 702.92).
function livingWeapon(c) {
  const g = newCard('Phyrexian Germ', { token: true, tk: { pt: '0/0', subs: ['phyrexian', 'germ'], col: ['B'], tx: '', types: ['Creature'], type: 'Token Creature — Phyrexian Germ', legendary: false } });
  g.id = state.nextId++; c.att = g.id;
  enterBattlefield(g, { from: 'effect', logMsg: `${c.name}: living weapon - created a 0/0 black Phyrexian Germ token and attached ${c.name} to it` });
}
function countEachMulti(per) {
  const t = String(per).toLowerCase();
  if (/\band\/or\b/.test(t)) { const ws = t.replace(/\s+you control.*$/, '').split(/\s+and\/or\s+/).map(w => w.trim().replace(/s$/, '')); return state.battlefield.filter(c => ws.some(w => permTypeInfo(c).types.has(w))).length; }
  return countForEach(t);
}

