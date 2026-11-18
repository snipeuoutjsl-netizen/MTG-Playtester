// v0.99.1 One place that shuffles your library (CR 701.20): it randomises state.library, counts the shuffle, and plays a riffle animation over the library pile.
// "Shuffle ... into your library" effects (Blightsteel Colossus, Timetwister-style hand and graveyard shuffles) are read from the rules text here too (CR 701.20a, 400.3).
function shuffleLib(o = {}) {
  if (!state) return;
  shuffle(state.library); state.shuffles = (state.shuffles || 0) + 1;
  if (!o.quiet) { try { riffleAnimation(); } catch (e) {} }
}
function riffleAnimation() {
  if (!animOn('shuffle') || typeof document === 'undefined') return;
  const el = document.querySelector('#libstack'); if (!el) return; const r = el.getBoundingClientRect(); if (!r.width) return;
  const back = el.querySelector('.cardback'), cs = back ? getComputedStyle(back) : null, w = Math.max(40, r.width * 0.78), hgt = Math.max(56, r.height * 0.82);
  const layer = h('div', { style: 'position:fixed;left:0;top:0;width:0;height:0;z-index:9000;pointer-events:none' }); document.body.append(layer);
  const mk = i => { const d = h('div', { class: 'cardback shufcard', style: `position:absolute;left:${r.left + (r.width - w) / 2}px;top:${r.top + (r.height - hgt) / 2}px;width:${w}px;height:${hgt}px;margin:0;` }); if (cs) { d.style.backgroundImage = cs.backgroundImage; d.style.backgroundSize = cs.backgroundSize; d.style.backgroundPosition = cs.backgroundPosition; } layer.append(d); return d; };
  const n = 8, cards = []; for (let i = 0; i < n; i++) cards.push(mk(i)); const sp = aspd(), T = ms => ms / sp;
  // Each riffle: the pile splits into two halves, which slide apart, lean in and interleave back into one pile. Three riffles, then a final square-up.
  const half = w * 0.42, rounds = 3, per = 340; let t = 0; const anims = [];
  cards.forEach((d, i) => {
    const left = i % 2 === 0, k = Math.floor(i / 2), dir = left ? -1 : 1, kf = [{ transform: 'translate(0,0) rotate(0deg)' }]; let off = 0;
    for (let rd = 0; rd < rounds; rd++) {
      kf.push({ transform: `translate(${dir * half}px, ${-k * 2}px) rotate(${dir * -5}deg)`, offset: (rd * per + per * 0.4) / (rounds * per + 160) });
      kf.push({ transform: `translate(${dir * half * 0.35}px, ${-(n / 2 - k) * 5 - (left ? 0 : 3)}px) rotate(${dir * -9}deg)`, offset: (rd * per + per * 0.72) / (rounds * per + 160) });
      kf.push({ transform: `translate(0px, ${-(i) * 1.2}px) rotate(0deg)`, offset: ((rd + 1) * per) / (rounds * per + 160) });
    }
    kf.push({ transform: 'translate(0,0) rotate(0deg)', offset: 1 });
    anims.push(d.animate(kf, { duration: T(rounds * per + 160), easing: 'ease-in-out', fill: 'forwards' }));
  });
  setTimeout(() => layer.remove(), T(rounds * per + 260));
}
// "Shuffle it / this card / ~ into its owner's library", "Shuffle your hand into your library", "Shuffle your hand and graveyard into your library".
function shuffleIntoOptions(tx, obj) {
  if (!state) return null; const T = String(tx || '').replace(/’/g, "'").replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim(); const src = (obj && obj.sourceName) || 'Ability';
  let m;
  if ((m = /^(?:then )?shuffle (?:(your|their) )?((?:hand|graveyard)(?:(?:, | and )(?:your )?(?:hand|graveyard))*) into (?:your|their) library\.?$/i.exec(T))) {
    const zones = [/hand/i.test(m[2]) ? 'hand' : null, /graveyard/i.test(m[2]) ? 'graveyard' : null].filter(Boolean);
    return [{ label: `Shuffle your ${zones.join(' and ')} into your library`, fn: () => { snap(); let n = 0; for (const z of zones) { const cards = state[z].splice(0); n += cards.length; for (const c of cards) { if (c.token) continue; state.library.push(c); } } shuffleLib(); log(`${src}: ${zones.join(' and ')} (${n} card${n === 1 ? '' : 's'}) shuffled into the library`); render(); } }];
  }
  if ((m = /^shuffle (?:it|this card|that card|~|this \w+) into (?:its owner's|your|their) library\.?$/i.exec(T)) && obj && obj.sourceId) {
    return [{ label: `Shuffle ${src} into its owner's library`, fn: () => { const f = findCard(obj.sourceId); if (!f) { log(`${src} is not in a zone it can be shuffled from`); return; } snap(); if (f.card.token) { moveCard(f.card.id, 'graveyard'); return; } moveCard(f.card.id, 'library'); shuffleLib(); log(`${src}: shuffled into the library`); render(); } }];
  }
  return null;
}
