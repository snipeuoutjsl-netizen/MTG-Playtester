// ---------------------------------------------------------------- v0.97.6 rules text: effects that depend on each other (CR 608.2c, 608.2b, 609.3)
// "Destroy up to one target nonland permanent. Its controller creates a tapped Powerstone token." is ONE effect with two linked parts, not two separate buttons:
//   - the second sentence refers to the object the first one acted on ("its controller", "that creature's owner"), so with no target chosen nothing happens (CR 608.2b/609.3);
//   - the second part is done by THAT object's controller: your opponent's permanent -> your opponent gets the token / life (it is not tracked here);
//   - a first part that fails (an indestructible permanent) does not stop the second ("unless it says 'if you do'"), CR 608.2c.
const DEPENDENT_RE = /^(?:(?:its|that [a-z]+'s|their|the [a-z]+'s) (?:controller|owner)|that player)\b\s*/i;
function targetSide(t) {   // whose permanent / spell is it?  'me' | 'opp' | null
  if (!t) return null; if (t.kind === 'opp') return 'opp';
  if (t.kind === 'spell') { const sp = state.stack.find(x => x.id === t.id); return sp ? (sp.opp ? 'opp' : 'me') : null; }
  if (t.kind === 'perm' || t.kind === 'gy') return findCard(t.id) ? 'me' : null; return null;
}
function linkedDependentOptions(tx, obj) {
  if (!state) return null;
  const clean = String(tx || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const sents = clean.split(/(?<=[.!?])\s+/).map(x => x.trim()).filter(Boolean);
  const j = sents.findIndex((x, i) => i > 0 && DEPENDENT_RE.test(x)); if (j < 1) return null;
  const A = sents.slice(0, j).join(' '), B = sents[j].replace(DEPENDENT_RE, 'You ').replace(/\btheir (library|hand|graveyard)\b/gi, 'your $1'), rest = sents.slice(j + 1).join(' ');
  const needsTarget = /\btarget\b/i.test(A);
  if (needsTarget && obj && obj.ability && !(obj.targets || []).length) return [{ full: true, label: 'No target was chosen: nothing happens (its second part depends on it)', fn: () => { log(`${(obj && obj.sourceName) || 'Ability'}: no target was chosen, so nothing happens (its second part refers to that object, CR 608.2b)`); } }];
  const aO = effectOptionsBase(A, obj).filter(o => typeof o.fn === 'function' && !o.hidden), bO = effectOptionsBase(B, obj).filter(o => typeof o.fn === 'function' && !o.hidden);
  if (aO.length !== 1 || bO.length !== 1) return null;
  const a = aO[0], b = bO[0], src = (obj && obj.sourceName) || 'Ability';
  const label = `${a.label}; then its controller: ${String(b.label).replace(/^(?:You |Create)/, m => m === 'Create' ? 'creates' : '').replace(/^creates /, 'creates ')}`;
  const full = { full: true, label, fn: () => {
    const tg = obj && (obj.targets || []).find(t => !t.gone);
    if (needsTarget && !tg) { log(`${src}: no target was chosen, so nothing happens (its second part refers to that object, CR 608.2b)`); toast(`${src}`, 'No target was chosen, so nothing happens.'); return; }
    const side = needsTarget ? targetSide(tg) : 'me';
    if (needsTarget && !side) { log(`${src}: its target is gone, so the ability does nothing (CR 608.2b)`); return; }
    a.fn();
    if (side === 'opp') {   // your opponent's permanent: its controller is your opponent
      const n = (String(b.label).match(/(\d+) life/) || [])[1]; const gain = /\bgain/i.test(b.label), lose = /\blose/i.test(b.label);
      if (n && gain) changeOppLife(+n); else if (n && lose) changeOppLife(-n);
      else { log(`${src}: its controller (your opponent) does the second part: ${B.replace(/^You /, '')} — apply it at the table (opponent permanents are not tracked)`); toast(`${src}`, `Your opponent's permanent: its controller does the second part (${b.label}). Apply it at the table.`); }
      return;
    }
    b.fn();
  } };
  const out = [full];
  if (rest) for (const o of effectOptionsBase(rest, obj)) out.push(o);
  return out;
}

// ---- "If you do, ..." / "When you do, ..." (CR 608.2c, 603.12): the second part happens only if the first part was actually done.
// The first part may open its own window (choose a card to discard...), so we wait for it to settle and then compare the game before and after.
const IFDO_RE = /^(?:if you do|when you do|if you did|if you can|if they do),?\s*/i;
const stateSig = () => state ? [state.hand.length, state.library.length, state.graveyard.length, state.exile.length, state.battlefield.length, state.stack.length, state.life, state.oppLife, Object.values(state.manaPool || {}).reduce((a, b) => a + b, 0), state.battlefield.reduce((a, c) => a + (c.counters ? (c.counters.plus || 0) + (c.counters.minus || 0) : 0), 0)].join('|') : '';
function afterSettled(cb, tries = 0) {
  if (document.querySelector('#modalRoot .backdrop:not(.dock)') && tries < 600) { setTimeout(() => afterSettled(cb, tries + 1), 150); return; }
  cb();
}
function ifYouDoOptions(tx, obj) {
  if (!state) return null;
  const clean = String(tx || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const sents = clean.split(/(?<=[.!?])\s+/).map(x => x.trim()).filter(Boolean);
  if (typeof parseDrawDiscard === 'function' && parseDrawDiscard(clean)) return null;   // discard/draw pairs have their own reader
  const j = sents.findIndex((x, i) => i > 0 && IFDO_RE.test(x)); if (j < 1) return null;
  const A = sents.slice(0, j).join(' '), B = sents[j].replace(IFDO_RE, ''), rest = sents.slice(j + 1).join(' ');
  const B1 = B[0].toUpperCase() + B.slice(1);
  if (!rest && /^you may pay (?:\{[^}]+\})+\.?$/i.test(A) && typeof mayPayOptions === 'function' && mayPayOptions([A, sents[j]], obj)) return null;   // v0.99.72 a mana / energy payment is made by the payment reader, not asked about
  const aO = effectOptionsBase(A, obj).filter(o => typeof o.fn === 'function' && !o.hidden), bO = effectOptionsBase(B1, obj).filter(o => typeof o.fn === 'function' && !o.hidden);
  if (aO.length === 0 && bO.length === 1) {   // the first part is something the app cannot do for you (sacrifice, behold ...): do it by hand, then say whether you did
    const b = bO[0], src0 = (obj && obj.sourceName) || 'Ability', aTxt = A.replace(/\.$/, '');
    return [{ full: true, label: `If you ${(t0 => t0[0].toLowerCase() + t0.slice(1))(aTxt.replace(/^you may /i, ''))}: ${String(b.label).replace(/^./, c => c.toLowerCase())}`, fn: () => {
      const m = modal(`${src0}: did you do it?`, { width: 480, sticky: true, noClose: true }); m.body.append(h('div', { class: 'psub', text: `${A}` }), h('div', { class: 'psub', text: `Do the first part by hand (card menus), then answer. The "if you do" part only happens if you did it.` }));
      m.foot.append(h('button', { text: "I didn't", onclick: () => { m.close(); log(`${src0}: the first part was not done, so "if you do" does nothing (CR 608.2c)`); } }), h('button', { class: 'primary', text: 'I did it', onclick: () => { m.close(); b.fn(); } }));
    } }];
  }
  if (aO.length !== 1 || bO.length !== 1) return null;
  const a = aO[0], b = bO[0], src = (obj && obj.sourceName) || 'Ability';
  const full = { full: true, label: `${a.label}. If you do: ${String(b.label).replace(/^./, c => c.toLowerCase())}`, fn: () => {
    const before = stateSig(); a.fn();
    afterSettled(() => { if (stateSig() === before) { log(`${src}: you didn't do the first part, so "if you do" does nothing (CR 608.2c)`); toast(`${src}`, `The first part was not done, so the "if you do" part does not happen.`); return; } b.fn(); });
  } };
  const out = [full]; if (rest) for (const o of effectOptionsBase(rest, obj)) out.push(o); return out;
}

// ---- "Create a ... token. You may attach this Equipment to that token." (CR 701.3, 301.5, 303.4): the second sentence acts on what the first one made.
// An unattached Equipment gives nothing (it only affects the creature it is attached to), so the attach is a choice the player makes right after the token appears.
const ATTACH_AFTER_RE = /^you may attach (?:this|~|it)(?: (?:equipment|aura|permanent|artifact))? to (?:that|the|it|one of them|that token|that creature|the token)(?: token| creature)?$/i;
function attachAfterCreateOptions(tx, obj) {
  if (!state || !obj || !obj.sourceId) return null;
  const clean = String(tx || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const sents = clean.split(/(?<=[.!?])\s+/).map(x => x.trim().replace(/[.!?]$/, '')).filter(Boolean);
  const j = sents.findIndex((x, i) => i > 0 && ATTACH_AFTER_RE.test(x.replace(selfNameRe(obj.sourceName || ''), '~'))); if (j < 1) return null;
  const A = sents.slice(0, j).join('. ') + '.', rest = sents.slice(j + 1).join('. ');
  const aO = effectOptionsBase(A, obj).filter(o => typeof o.fn === 'function' && !o.hidden); if (aO.length !== 1) return null;
  const a = aO[0], src = obj.sourceName || 'Ability';
  const full = { full: true, label: `${a.label}; then you may attach ${src} to it`, fn: () => {
    const before = new Set(state.battlefield.map(c => c.id)); a.fn();
    afterSettled(() => {
      const made = state.battlefield.filter(c => !before.has(c.id)); if (!made.length) { log(`${src}: nothing was created, so there is nothing to attach to`); return; }
      const f = findCard(obj.sourceId); if (!f || f.zone !== 'battlefield') { log(`${src} is no longer on the battlefield, so it cannot be attached`); return; }
      const attach = t => { if (attachTo(f.card.id, t.id, src)) log(`${src} is attached to ${t.name} (it now gives its bonus to that creature)`); render(); flushTriggers(); };
      const m = modal(`${src}: attach it?`, { width: 480, sticky: true, noClose: true });
      m.body.append(h('div', { class: 'psub', text: `${src} stays unattached unless you attach it now, and an unattached Equipment gives nothing. No player may act between the token appearing and this choice.` }));
      for (const t of made) m.body.append(h('div', { class: 'row' }, h('span', { class: 'nm', text: `${t.name} (${ptText(t)})` }), h('button', { class: 'primary', text: 'Attach to this', onclick: () => { m.close(); attach(t); } })));
      m.foot.append(h('button', { text: "Don't attach", onclick: () => { m.close(); log(`${src}: you chose not to attach it`); render(); } }));
    });
  } };
  const out = [full]; if (rest) for (const o of effectOptionsBase(rest, obj)) out.push(o); return out;
}
