// ---- v0.99.101 The deck box. The Library's deck page shows the deck in a 3D deck box between its name and Begin goldfish.
// It floats and turns toward the pointer, and the lid lifts a little on hover. Clicking it opens the lid and the cards fly out
// of the box onto the screen, grouped by card type in mana-value order (one stack per card, its copies fanned down).
// Clicking a card shows it large. Close, Escape or a click on the backdrop sends the cards back into the box and shuts the lid.
const LBX_GROUPS = [['Creatures', ['Creature']], ['Planeswalkers & Battles', ['Planeswalker', 'Battle']], ['Instants & Sorceries', ['Instant', 'Sorcery']], ['Artifacts', ['Artifact']], ['Enchantments', ['Enchantment']], ['Other', ['Other', 'Unknown']], ['Lands', ['Land']]];
function libBoxEl(deckName, deck, cols, opts = {}) {   // opts.onPick: the click picks the deck (the shelf) instead of opening the box; opts.label: shown under the box
  const a = DECKBOX_COL[cols[0] || ''], b = DECKBOX_COL[cols[1] || cols[0] || ''], im = imgFor(deckArtName(deckName, deck), deckName);
  const face = (cls, ...kids) => h('div', { class: 'lbx-f ' + cls }, ...kids);
  const box = h('div', { class: 'lbx', style: `--ca:${a[1]};--cad:${a[0]};--cb:${b[1]};--cbd:${b[0]}` },
    face('front',
      h('div', { class: 'lbx-art' + (im ? '' : ' none'), style: im ? `background-image:url("${im.front}")` : '' }, im ? null : h('span', { text: (deckName.trim()[0] || '?').toUpperCase() })),
      h('div', { class: 'lbx-label' }, h('b', { text: deckName }), libPips(cols, 'sm'))),
    face('back'), face('left', h('span', { text: deckName })), face('right', h('span', { text: `${sum(deck.main)} cards` })), face('bottom'),
    face('inner'),   // the top of the deck inside the box (card backs), seen when the lid is up
    h('div', { class: 'lbx-lid' }, face('ltop'), face('lfront'), face('lleft'), face('lright')));
  const zone = h('button', { class: 'lib-box', type: 'button', title: 'Open the box to lay out every card', 'aria-label': `Deck box for ${deckName}. Open it to see every card.` },
    h('div', { class: 'lbx-float' }, box), h('i', { class: 'lbx-shadow', 'aria-hidden': 'true' }));
  if (opts.label) zone.append(opts.label);
  if (opts.onPick) { zone.title = `${deckName}: open its page`; zone.setAttribute('aria-label', `${deckName}. Open its page.`); }
  tiltWith(zone, box);
  zone.addEventListener('click', () => opts.onPick ? opts.onPick() : libOpenBox(zone, deckName, deck));
  return zone;
}
function libBoxCards(deck) {
  const tot = new Map();
  for (const x of deck.main) { const rec = resolve(x.name), nm = rec ? rec.name : x.name, o = tot.get(nm) || { name: nm, rec, qty: 0 }; o.qty += (x.qty || 1); tot.set(nm, o); }
  const typeOf = c => { const rec = c.rec; if (rec ? rec.land : BASIC_LANDS.has(norm(c.name))) return 'Land'; if (!rec) return 'Unknown'; const front = String(rec.t || '').split(' // ')[0]; return ['Creature', 'Planeswalker', 'Battle', 'Instant', 'Sorcery', 'Artifact', 'Enchantment'].find(x => front.includes(x)) || 'Other'; };
  const all = [...tot.values()].map(c => Object.assign(c, { type: typeOf(c), mv: (c.rec && +c.rec.cmc) || 0 }));
  return LBX_GROUPS.map(([title, types]) => [title, all.filter(c => types.includes(c.type)).sort((x, y) => x.mv - y.mv || x.name.localeCompare(y.name))]).filter(g => g[1].length);
}
function libOpenBox(zone, deckName, deck) {
  const hall = zone.closest('#hall'); if (!hall || hall.querySelector('.lbx-ov')) return;
  const motion = animOn('ui') !== false && !document.body.classList.contains('a11y-calm') && !reducedMotion();
  // v0.99.102 pointing at a card shows it enlarged in a column of its own on the right (never over the stacks); touch screens keep tap-to-enlarge
  const hover = !!(window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches) && window.innerWidth >= 900;
  const peek = hover ? h('aside', { class: 'lbx-peek', 'aria-live': 'polite' }) : null;
  const peekIdle = () => peek && peek.replaceChildren(h('div', { class: 'lbx-peek-idle' }, h('div', { class: 'lbx-peek-blank' }), h('span', { text: 'Point at a card to see it here' })));
  let peekName = null, peekT = 0;
  const peekShow = c => { if (!peek) return; clearTimeout(peekT); if (!c) { peekT = setTimeout(() => { peekName = null; peekIdle(); }, 250); return; } if (peekName === c.name) return; peekName = c.name;
    const im = imgFor(c.name, deckName), info = cardInfo(c.name), rec = c.rec || info;
    const pic = im ? h('img', { class: 'lbx-peek-img', src: im.front, alt: c.name }) : h('div', { class: 'lbx-peek-txt' }, h('b', { text: c.name }), rec && rec.mc ? h('div', {}, symbols(String(rec.mc).split(' // ')[0])) : null, h('i', { text: rec ? String(rec.t || '').split(' // ')[0] : '' }), info && info.tx ? h('p', { text: info.tx }) : null, rec && rec.pt ? h('div', { text: rec.pt }) : null);
    peek.replaceChildren(h('div', { class: 'lbx-peek-in' }, pic, im && im.back ? h('img', { class: 'lbx-peek-back', src: im.back, alt: 'Back face', title: 'Back face' }) : null,
      h('div', { class: 'lbx-peek-cap' }, h('b', { text: `${c.qty} × ${c.name}` }), h('span', { text: rec ? String(rec.t || '').replace(/ \/\/ /g, '  //  ') : '' })))); };
  peekIdle();
  const grid = h('div', { class: 'lbx-grid' }), body = h('div', { class: 'lbx-body' }, grid), zoom = h('div', { class: 'lbx-zoom', role: 'dialog', 'aria-label': 'Card' });
  const showCard = c => {
    const im = imgFor(c.name, deckName), info = cardInfo(c.name);
    let side = 0;
    const pic = im ? h('img', { src: im.front, alt: c.name, title: im.back ? 'Click to flip' : '' }) : null;
    if (pic && im.back) pic.addEventListener('click', e => { e.stopPropagation(); side ^= 1; pic.src = side ? im.back : im.front; });
    zoom.replaceChildren(h('div', { class: 'lbx-zoom-in' },
      pic || h('div', { class: 'lbx-zoom-txt' }, h('b', { text: c.name }), info && info.mc ? h('div', {}, symbols(info.mc)) : null, h('i', { text: info ? info.t : '(no card data)' }), info && info.tx ? h('p', { text: info.tx }) : null, info && info.pt ? h('div', { text: info.pt }) : null),
      h('div', { class: 'lbx-zoom-cap', text: `${c.qty} × ${c.name}` })));
    zoom.classList.add('on');
  };
  const stackEl = c => {
    const show = Math.min(c.qty, 4), im = imgFor(c.name, deckName);
    const st = h('button', { class: 'lbx-stack', type: 'button', style: `--n:${show}`, title: `${c.qty} × ${c.name}`, 'aria-label': `${c.qty} × ${c.name}. Show it large.` });
    for (let i = 0; i < show; i++) {
      const f = h('div', { class: 'lbx-card' + (im ? ' img' : ''), style: `--i:${i}` });
      if (im) { const img = h('img', { src: im.front, alt: '', draggable: 'false' }); img.addEventListener('error', () => { img.remove(); f.classList.remove('img'); f.append(h('b', { text: c.name })); }); f.append(img); }
      else f.append(h('b', { text: c.name }), h('span', { text: (c.rec && c.rec.mc) || '' }), h('i', { text: (c.rec && c.rec.t) || '' }));
      st.append(f);
    }
    if (motion && !flown) st.style.opacity = '0';   // hidden until they fly out of the box
    if (c.qty > 1) st.append(h('em', { class: 'lbx-qty', text: '×' + c.qty }));
    st.addEventListener('click', e => { e.stopPropagation(); showCard(c); });
    st.addEventListener('pointerenter', () => peekShow(c)); st.addEventListener('pointerleave', () => peekShow(null)); st.addEventListener('focus', () => peekShow(c));
    return st;
  };
  const build = () => grid.replaceChildren(...libBoxCards(deck).map(([title, list]) =>
    h('div', { class: 'lbx-group' }, h('div', { class: 'lbx-gh', text: `${title} · ${list.reduce((n, c) => n + c.qty, 0)}` }), h('div', { class: 'lbx-stacks' }, ...list.map(stackEl)))));
  // the biggest card size at which the whole deck fits without scrolling (a phone, or a 100-card list, scrolls at the smallest size)
  const fit = () => { if (!ov.isConnected) return; const H = body.clientHeight, small = window.innerWidth < 760;
    let cw = 150; for (; cw > (small ? 58 : 66); cw -= 3) { grid.style.setProperty('--cw', cw + 'px'); if (grid.scrollHeight <= H - 4 && grid.scrollWidth <= body.clientWidth) break; } };
  let closing = false, flown = false;
  const centre = r => [r.left + r.width / 2, r.top + r.height / 2];
  // v0.99.101 the cards come out the way the game deals a hand from the library: one at a time, small and turned, growing to full
  // size where they land, with the draw sound. The first seven come at the opening-hand pace, the rest faster so a big deck is quick.
  const dealAt = (i, n) => i < 7 ? i * 170 : 7 * 170 + (i - 7) * Math.max(24, Math.min(70, 1600 / Math.max(1, n - 7)));   // the rest of the deck lands within about 1.6 s
  const fly = (out, done) => {
    const stacks = [...grid.querySelectorAll('.lbx-stack')]; if (!motion || !stacks.length) { stacks.forEach(s => { s.style.opacity = ''; }); done && done(); return; }
    const [bx, by] = centre(zone.getBoundingClientRect());
    let last = 0;
    stacks.forEach((s, i) => { const [sx, sy] = centre(s.getBoundingClientRect()), dx = (bx - sx).toFixed(0), dy = (by - sy).toFixed(0);
      if (out) { const delay = dealAt(i, stacks.length); last = delay + 560; s.style.opacity = '';
        wa(s, [{ translate: `${dx}px ${dy}px`, scale: '.4', rotate: '-10deg', opacity: 0 }, { opacity: 1, offset: 0.12 }, { translate: '0px 0px', scale: '1', rotate: '0deg', opacity: 1 }], { duration: 560, delay, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
        if (i < 7 || i % 3 === 0) setTimeout(() => { if (ov.isConnected && !closing) try { sfx('draw'); } catch (e) {} }, delay / aspd()); }
      else { const delay = (stacks.length - 1 - i) * 22; last = Math.max(last, delay + 420);
        wa(s, [{ translate: '0px 0px', scale: '1', rotate: '0deg', opacity: 1 }, { opacity: 1, offset: 0.7 }, { translate: `${dx}px ${dy}px`, scale: '.3', rotate: '10deg', opacity: 0 }], { duration: 420, delay, easing: 'cubic-bezier(.5,0,.75,.4)', fill: 'forwards' }); } });
    setTimeout(() => done && done(), last / aspd() + 40);
  };
  const close = () => {
    if (closing) return; closing = true; document.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', fit);
    zoom.classList.remove('on'); ov.classList.add('leaving');
    ghost.classList.remove('rest');
    const end = () => { ov.remove(); zone.classList.remove('hid'); try { zone.focus({ preventScroll: true }); } catch (e) {} };
    fly(false, () => { ghost.classList.remove('open'); ov.classList.add('gone'); if (motion) setTimeout(end, 460 / aspd()); else end(); });
  };
  const onKey = e => { if (!ov.isConnected) { document.removeEventListener('keydown', onKey, true); return; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (zoom.classList.contains('on')) zoom.classList.remove('on'); else close(); } };
  const ov = h('div', { class: 'lbx-ov', role: 'dialog', 'aria-modal': 'true', 'aria-label': `${deckName}: every card in the deck` },
    h('div', { class: 'lbx-bar' },
      h('div', { class: 'lbx-bar-t' }, h('div', { class: 'lib-cap', text: 'The box, opened' }), h('h2', { text: deckName }), h('span', { class: 'lib-muted', text: `${sum(deck.main)} cards · by card type, in mana-value order · point at a card to see it enlarged, click to see it full size` })),
      h('button', { class: 'lib-btn ghost lbx-x', text: 'Close the box', onclick: () => close() })),
    h('div', { class: 'lbx-main' + (peek ? ' peeking' : '') }, body, peek), zoom);
  ov.addEventListener('click', e => { if (e.target === ov || e.target === body || e.target === grid) close(); });
  zoom.addEventListener('click', () => zoom.classList.remove('on'));
  document.addEventListener('keydown', onKey, true);
  // the box itself stays in sight above the dark backdrop while the cards come out of it (a copy at the same place on screen)
  const zr = zone.getBoundingClientRect(), ghost = zone.cloneNode(true);
  ghost.classList.remove('open'); ghost.classList.add('lbx-ghost'); ghost.setAttribute('aria-hidden', 'true'); ghost.tabIndex = -1;
  ghost.style.cssText = `position:fixed;left:${zr.left}px;top:${zr.top}px;width:${zr.width}px;height:${zr.height}px;margin:0`;
  build(); hall.append(ov); ov.append(ghost); fit(); zone.classList.add('hid');
  requestAnimationFrame(() => requestAnimationFrame(() => ghost.classList.add('open')));
  const go = () => { if (!ov.isConnected) return; flown = true; fly(true, () => { if (!closing) ghost.classList.add('rest'); }); const x = ov.querySelector('.lbx-x'); if (x) x.focus({ preventScroll: true }); };
  if (motion) setTimeout(go, 560 / aspd()); else go();   // the lid opens first, then the cards come out
  window.addEventListener('resize', fit);
  try { loadCachedImages(deck.main.map(x => x.name)).then(n => { if (n && ov.isConnected && !closing) { build(); fit(); } }); } catch (e) {}
}
