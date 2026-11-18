// ---- "Mill N cards. If you do, you may put a <kind> card from among them into your hand / onto the battlefield." (CR 701.17a, 608.2c, 603.4 "that many")
// "that many" is the amount carried by the event that triggered the ability (combat damage dealt, life gained or lost: obj.amt).
// "from among them" means only the cards that this very mill put into the graveyard, not the rest of the graveyard.
const MILL_AMONG_S1 = /^(you may )?mill (a|an|one|two|three|four|five|six|seven|eight|nine|ten|x|\d+|that many) cards?$/i;
const MILL_AMONG_S2 = /^if you do,? (you may )?(put|return) (a|an|up to (?:one|two|three|\d+)) ([a-z\- ]*?)cards?(?: with mana value (\d+) or (less|greater))? from among (?:them|the milled cards|those cards)(?: into your hand| onto the battlefield)$/i;
function millAmongKind(words) {
  const w = String(words || '').trim().toLowerCase(); if (!w || /^(?:permanent|nonland permanent)$/.test(w) && false) return () => true;
  const neg = /^non-?(\w+)$/.exec(w); if (neg) return c => !pcPermIsCard(c, neg[1]);
  if (/^(?:permanent)?$/.test(w)) return () => true;
  if (/^(?:land|creature|artifact|enchantment|instant|sorcery|planeswalker|battle)$/.test(w)) return c => pcPermIsCard(c, w);
  return null;
}
function millAmongOptions(tx, obj) {
  if (!state) return null; const sents = MASS_SENTS(tx).map(s => s.replace(/\.$/, '').replace(selfNameRe((obj && obj.sourceName) || '~'), '~')); if (sents.length !== 2) return null;
  const a = MILL_AMONG_S1.exec(sents[0]), b = MILL_AMONG_S2.exec(sents[1]); if (!a || !b) return null;
  const kindFn = millAmongKind(b[4]); if (!kindFn) return null;
  const word = a[2].toLowerCase(), thatMany = word === 'that many', src = (obj && obj.sourceName) || 'Ability';
  if (thatMany && obj && obj.sourceId === -1) return [{ full: true, label: 'mill that many; if you do, take a card from among them' }];   // reading the card (not resolving it): the amount comes from the trigger event
  if (/^x$/.test(word) || (thatMany && !(obj && obj.amt >= 0))) return null;   // an unknown amount cannot be read, so it stays honestly "part"
  const n = thatMany ? obj.amt : MASS_NUM(word), mayMill = !!a[1], mayTake = !!b[1], cap = /^up to/i.test(b[3]) ? (MASS_NUM(b[3].replace(/^up to /i, '')) || 1) : 1;
  const mv = b[5] != null ? +b[5] : null, dest = /onto the battlefield/i.test(sents[1]) ? 'battlefield' : 'hand', kindTxt = (b[4] || '').trim();
  const take = milled => {
    const ok = milled.filter(c => state.graveyard.some(g => g.id === c.id) && kindFn(c) && (mv == null || (() => { const v = c.token ? 0 : ((cardInfo(c.name) || {}).cmc || 0); return b[6].toLowerCase() === 'less' ? v <= mv : v >= mv; })()));
    if (!ok.length) { log(`${src}: no ${kindTxt || 'matching'} card among the milled cards`); render(); return; }
    const m = modal(`${src}: take a card?`, { width: 520, sticky: true, noClose: true }); const left = { n: cap };
    m.body.append(h('div', { class: 'psub', text: `Milled ${milled.length}: ${milled.map(c => c.name).join(', ')}. Choose ${cap === 1 ? 'a' : 'up to ' + cap} ${kindTxt || ''} card${cap === 1 ? '' : 's'} from among them to put ${dest === 'hand' ? 'into your hand' : 'onto the battlefield'}.` }));
    for (const c of ok) { const row = h('div', { class: 'row' }, h('span', { class: 'nm', text: c.name }), h('button', { class: 'primary', text: dest === 'hand' ? 'Put in hand' : 'Put onto battlefield', onclick: () => {
      moveCard(c.id, dest); log(`${src}: ${c.name} from among the milled cards goes ${dest === 'hand' ? 'into your hand' : 'onto the battlefield'}`); row.remove(); left.n--; if (left.n <= 0) { m.close(); render(); } else render(); } })); m.body.append(row); }
    m.foot.append(h('button', { text: mayTake ? "Don't take one" : 'Done', onclick: () => { m.close(); render(); } }));
  };
  const run = () => { snap(); const milled = state.library.slice(0, n); if (!milled.length) { log(`${src}: library is empty, nothing was milled`); render(); return; }
    for (const c of milled) moveCardQuiet(c.id, 'graveyard'); log(`${src}: milled ${milled.length}: ${milled.map(c => c.name).join(', ')}`); render(); take(milled); };
  const label = `${mayMill ? 'You may mill' : 'Mill'} ${n}${thatMany ? ' (that many)' : ''}; if you do, ${mayTake ? 'you may put' : 'put'} ${cap === 1 ? 'a' : 'up to ' + cap} ${kindTxt ? kindTxt + ' ' : ''}card from among them ${dest === 'hand' ? 'into your hand' : 'onto the battlefield'}`;
  return [{ full: true, label, fn: () => {
    if (!mayMill) { run(); return; }
    const m = modal(`${src}: mill ${n}?`, { width: 440, sticky: true, noClose: true }); m.body.append(h('div', { class: 'psub', text: `You may mill ${n} card${n === 1 ? '' : 's'}${thatMany ? ' (that many: the amount from the trigger)' : ''}. If you do, you may take a ${kindTxt || ''} card from among them.` }));
    m.foot.append(h('button', { text: "Don't mill", onclick: () => { m.close(); log(`${src}: you chose not to mill, so "if you do" does nothing (CR 608.2c)`); } }), h('button', { class: 'primary', text: `Mill ${n}`, onclick: () => { m.close(); run(); } })); } }];
}
