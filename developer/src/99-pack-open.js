// ---- v0.99.106 Opening a pack. A screen over everything: the pack (the app's own wrapper: no Magic logos or set symbols), a set to
// choose (Random set by default), then tear it: the top strip comes off, the cards spill out face down, and you flip them one at a
// time (the rare is last, as in a real pack) or Reveal all. Rares, mythics and foils light up as they turn. The cards were already
// added to your Archive when the pack was torn, so closing early loses nothing.
const PK_RARITY = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', mythic: 'Mythic rare', land: 'Basic land' };
let pkOpenNow = null;
const pkTxt = x => h('div', { class: 'pk-txt' }, h('b', { text: x.n }), h('span', { text: (x.rec && x.rec.mc) || '' }), h('i', { text: (x.rec && x.rec.t) || '' }));
const pkImg = x => { const im = h('img', { src: x.img, alt: x.n, draggable: 'false' }); im.addEventListener('error', () => { const f = im.parentElement; if (f) { f.classList.remove('img'); im.replaceWith(pkTxt(x)); } }); return im; };   // a picture that can't load (offline) shows the card's words
const pkSvg = (cls, html) => { const d = h('div', { class: cls }); d.innerHTML = html; return d; };
function openPackScreen() {
  if (document.querySelector('.pk-ov')) return;
  try { const n = packBackPay(); if (n) toast('Packs for your solved puzzles', `You had solved ${n} puzzle${n === 1 ? '' : 's'} before packs existed: ${n} pack${n === 1 ? ' was' : 's were'} added.`); } catch (e) {}
  const motion = animOn('ui') !== false && !document.body.classList.contains('a11y-calm') && !reducedMotion();
  const ov = h('div', { class: 'pk-ov', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Open a pack' });
  const close = () => { document.removeEventListener('keydown', onKey, true); ov.classList.add('leaving'); setTimeout(() => ov.remove(), motion ? 260 : 0); pkOpenNow = null; try { if (typeof hallOpen === 'function' && hallOpen()) drawHall(); } catch (e) {} };
  const onKey = e => { if (!ov.isConnected) { document.removeEventListener('keydown', onKey, true); return; } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); const z = ov.querySelector('.pk-zoom.on'); if (z) z.classList.remove('on'); else close(); } };
  document.addEventListener('keydown', onKey, true);
  const zoom = h('div', { class: 'pk-zoom' }); zoom.addEventListener('click', () => zoom.classList.remove('on'));
  const head = h('div', { class: 'pk-head' }), stage = h('div', { class: 'pk-stage' }), foot = h('div', { class: 'pk-foot' });
  ov.append(h('button', { class: 'pk-x', type: 'button', text: '✕', title: 'Close (Esc)', 'aria-label': 'Close', onclick: close }), head, stage, foot, zoom);
  document.body.append(ov); pkOpenNow = { ov, close };
  const setSel = h('select', { class: 'pk-set', 'aria-label': 'Which set' }, h('option', { value: 'random', text: 'Random set' }));
  packSets().then(list => { for (const s of list) setSel.append(h('option', { value: s.code, text: `${s.name} (${s.date.slice(0, 4)})` })); const last = packState().lastSet; if (last && [...setSel.options].some(o => o.value === last)) setSel.value = last; upd(); }).catch(() => {});
  const wrapLabel = h('span', { class: 'pk-wrap-set' });
  const upd = () => { const o = setSel.options[setSel.selectedIndex]; wrapLabel.textContent = o ? o.textContent.replace(/ \(\d{4}\)$/, '') : 'Random set'; };
  setSel.addEventListener('change', upd); upd();
  const wrapper = () => h('button', { class: 'pk-pack', type: 'button', title: 'Tear it open', 'aria-label': 'Tear the pack open' },
    h('i', { class: 'pk-strip' }, h('i', { class: 'pk-notch' })),
    h('div', { class: 'pk-face' }, pkSvg('pk-logo', HALL_LOGO), wrapLabel),   // the wrapper is the logo alone (and the set it is from)
    h('i', { class: 'pk-crimp' }));
  const choose = () => {
    const n = packsToOpen(); ov.classList.remove('revealing');
    head.replaceChildren(h('div', { class: 'lib-cap', text: 'Packs' }), h('h2', { text: n ? `You have ${n} pack${n === 1 ? '' : 's'} to open` : 'No packs to open' }),
      h('p', { class: 'pk-sub', text: n ? 'Choose a set, then tear the pack open. Each pack holds 10 commons, 3 uncommons, a rare (sometimes a mythic) and a basic land; about one in three has a foil.' : 'Win a game, or solve a puzzle for the first time, to earn a pack. Your opened cards are in the Archive.' }));
    if (!n) { stage.replaceChildren(h('div', { class: 'pk-empty', text: '0' })); foot.replaceChildren(h('button', { class: 'lib-btn ghost', text: 'View the Archive', onclick: () => { close(); openCollection(); } }), h('button', { class: 'lib-btn ghost', text: 'Close', onclick: close })); return; }
    const pack = wrapper(); pack.addEventListener('click', () => tear(pack));
    stage.replaceChildren(h('div', { class: 'pk-packwrap' }, pack, h('div', { class: 'pk-hint', text: 'Click the pack to tear it open' })));
    foot.replaceChildren(h('label', { class: 'pk-setrow' }, h('span', { text: 'Set' }), setSel), h('button', { class: 'lib-btn gold', text: 'Tear it open', onclick: () => tear(pack) }), h('button', { class: 'lib-btn ghost', text: 'View the Archive', onclick: () => { close(); openCollection(); } }));
  };
  let busy = false;
  const tear = async pack => {
    if (busy) return; busy = true; pack.classList.add('shaking'); pack.disabled = true; const tb = foot.querySelector('.lib-btn.gold'); if (tb) tb.disabled = true;
    const hint = stage.querySelector('.pk-hint'); if (hint) { hint.textContent = ''; hint.classList.remove('pk-err'); }
    // v0.99.108 a loading bar: a pack's cards come from Scryfall, and the first pack of a set downloads that set's card list
    const fill = h('i', { class: 'pk-load-fill' }), msg = h('div', { class: 'pk-load-msg', text: 'Starting…' });
    const load = h('div', { class: 'pk-load', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0', 'aria-label': 'Opening the pack' },
      h('div', { class: 'pk-load-bar' }, fill), msg,
      h('div', { class: 'pk-load-why', text: 'Why this takes a moment: the cards in a pack come from Scryfall, the free online card database. The first pack from a set downloads that set\'s card list (often 300 or more cards, a few seconds). It is kept on this device, so later packs from the same set open at once.' }));
    stage.querySelector('.pk-packwrap').append(load);
    const prog = (f, text) => { const v = Math.round(Math.max(0, Math.min(1, f)) * 100); fill.style.width = v + '%'; load.setAttribute('aria-valuenow', String(v)); if (text) msg.textContent = text; };
    let res = null; try { res = await openPack(setSel.value, prog); } catch (e) { console.error(e); res = null; }
    load.remove();
    busy = false; if (tb) tb.disabled = false; if (!ov.isConnected) return;
    if (!res) { pack.classList.remove('shaking'); pack.disabled = false; if (hint) { hint.textContent = packLastError || 'The pack could not be opened. Try again.'; hint.classList.add('pk-err'); } return; }
    try { sfx('shuffle'); } catch (e) {}
    pack.classList.remove('shaking'); pack.classList.add('torn');
    setTimeout(() => reveal(res), motion ? 700 : 0);
  };
  const cardEl = (x, i) => {
    const inner = h('div', { class: 'pk-inner' },
      pkSvg('pk-back', HALL_LOGO),
      h('div', { class: 'pk-front' + (x.img ? ' img' : '') }, x.img ? pkImg(x) : h('div', { class: 'pk-txt' }, h('b', { text: x.n }), h('span', { text: (x.rec && x.rec.mc) || '' }), h('i', { text: (x.rec && x.rec.t) || '' })), x.foil ? h('i', { class: 'pk-foil' }) : null));
    const el = h('button', { class: `pk-card r-${x.foil ? 'foil' : x.slot}`, type: 'button', style: `--i:${i}`, 'aria-label': `Card ${i + 1}, face down. Click to turn it over.` }, inner,
      h('div', { class: 'pk-tag' }, h('span', { text: x.foil ? `Foil ${(PK_RARITY[x.r] || x.r).toLowerCase()}${x.god && x.alt ? ' · full art' : ''}` : PK_RARITY[x.slot] || PK_RARITY[x.r] || x.r }), x.isNew ? h('em', { text: 'New' }) : null));
    el.addEventListener('click', () => { if (!el.classList.contains('up')) flip(el, x); else { zoom.replaceChildren(x.img ? h('img', { src: x.img, alt: x.n }) : h('div', { class: 'pk-txt big' }, h('b', { text: x.n }), h('i', { text: (x.rec && x.rec.t) || '' }), h('p', { text: (x.rec && x.rec.tx) || '' }))); zoom.classList.add('on'); } });
    return el;
  };
  let left = 0, resNow = null;
  const flip = (el, x) => { if (el.classList.contains('up')) return; el.classList.add('up'); el.setAttribute('aria-label', `${x.n}, ${PK_RARITY[x.slot] || x.r}${x.isNew ? ', new' : ''}`); left--;
    try { sfx(/rare|mythic|foil/.test(x.slot) || x.foil ? 'win' : 'draw'); } catch (e) {}
    if (!left) done(); };
  const done = () => { const r = resNow, nNew = r.cards.filter(c => c.isNew).length, more = packsToOpen();
    foot.replaceChildren(h('span', { class: 'pk-added', text: `Added to your Archive: ${r.cards.length} cards${nNew ? `, ${nNew} new` : ''}.` }),
      more ? h('button', { class: 'lib-btn gold', text: `Open another (${more} left)`, onclick: () => choose() }) : null,
      h('button', { class: 'lib-btn ghost', text: 'View the Archive', onclick: () => { close(); openCollection(); } }), h('button', { class: 'lib-btn ghost', text: 'Close', onclick: close })); };
  const reveal = res => {
    resNow = res; left = res.cards.length; ov.classList.add('revealing'); ov.classList.toggle('god', !!res.god);
    head.replaceChildren(h('div', { class: 'lib-cap', text: res.setName }), h('h2', { text: res.god ? '✦ A God Pack ✦' : 'Your pack' }), h('p', { class: 'pk-sub', text: res.god ? 'About 1 pack in 100: every card is a foil, in the set\'s full-art, borderless and showcase printings where it has them.' : 'Click a card to turn it over. The rare is last.' }));
    if (res.god) { try { sfx('win'); } catch (e) {} }
    const grid = h('div', { class: 'pk-grid' }, res.cards.map(cardEl)); stage.replaceChildren(grid);
    const all = h('button', { class: 'lib-btn gold', text: 'Reveal all', onclick: () => { all.disabled = true; [...grid.children].forEach((el, i) => setTimeout(() => flip(el, res.cards[i]), motion ? i * 110 : 0)); } });
    foot.replaceChildren(all);
    pkFit(grid);
  };
  choose();
  window.addEventListener('resize', () => { const g = ov.querySelector('.pk-grid'); if (g) pkFit(g); });
}
// the biggest card size at which the 15 cards fit the stage (5 x 3 on a wide screen, 3 x 5 upright; scrolls on a tiny screen)
function pkFit(grid) {
  const st = grid.parentElement; if (!st) return; const W = st.clientWidth - 8, H = st.clientHeight - 8, n = grid.children.length;
  let best = 60; for (const cols of [8, 5, 4, 3]) { const rows = Math.ceil(n / cols), cw = Math.min((W - (cols - 1) * 12) / cols, ((H - (rows - 1) * 34) / rows - 26) / 1.395); if (cw > best) best = cw; }
  grid.style.setProperty('--cw', Math.max(60, Math.min(230, Math.floor(best))) + 'px');
}
