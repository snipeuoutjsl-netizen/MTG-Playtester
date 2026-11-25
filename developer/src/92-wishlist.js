// ---- v0.99.85 Card wishlist: cards you want, each with the printing (art) you want, bought in one go on TCGplayer
// Kept in this browser ('mtgpt.wishlist'): [{ name, qty, p: { id, set, setName, cn, tcg, year, small } | null }].
// A chosen printing is sent to TCGplayer as its exact product ("qty-productId"); without one TCGplayer picks ("qty Card Name").
const WISH_KEY = 'mtgpt.wishlist';
function wishLoad() { const l = lsGet(WISH_KEY, []); return Array.isArray(l) ? l.filter(x => x && x.name) : []; }
function wishSave(l) { lsSet(WISH_KEY, l); }
function wishAdd(name, qty) {
  const r = resolve(name), nm = r ? r.name : String(name || '').trim(); if (!nm) return null;
  const l = wishLoad(), have = l.find(x => imgKey(x.name) === imgKey(nm));
  if (have) have.qty = Math.min(99, (have.qty || 1) + (qty || 1)); else l.push({ name: nm, qty: qty || 1, p: null });
  wishSave(l); return nm;
}
function wishLines(l) { return l.map(x => ({ name: x.name, qty: x.qty || 1, p: x.p, tcgLine: x.p && x.p.tcg ? `${x.qty || 1}-${x.p.tcg}` : `${x.qty || 1} ${x.name}`, textLine: x.p ? `${x.qty || 1} ${x.name} [${String(x.p.set).toUpperCase()}] ${x.p.cn}` : `${x.qty || 1} ${x.name}` })); }
// card names for the suggestions under the box (the loaded card data), best matches first
function wishSuggest(q) {
  const t = String(q || '').trim().toLowerCase(); if (t.length < 2) return [];
  const out = []; for (const c of CARDS.values()) { const n = c.name || ''; const i = n.toLowerCase().indexOf(t); if (i < 0) continue; out.push([i === 0 ? 0 : 1, n.length, n]); if (out.length > 400) break; }
  return [...new Set(out.sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(x => x[2]))].slice(0, 8);
}
// the printing picker for the wishlist: the same Scryfall list as a deck's art, but it only remembers which printing you want
function wishPickPrint(name, after) {
  const m = modal(`Wishlist printing: ${name}`, { width: 980, onClose: after });
  const l = wishLoad(), item = l.find(x => imgKey(x.name) === imgKey(name)), cur = item && item.p;
  const status = h('div', { class: 'small muted', text: 'Loading every printing from Scryfall…' }), grid = h('div', { class: 'print-grid' });
  m.body.append(h('p', { class: 'small muted', text: 'Pick the printing you want to buy. TCGplayer is then asked for exactly that one.' }), status, grid);
  m.foot.append(h('button', { text: 'Any printing', disabled: !cur, onclick: () => { const l2 = wishLoad(), it = l2.find(x => imgKey(x.name) === imgKey(name)); if (it) { it.p = null; wishSave(l2); } m.close(); } }), h('button', { class: 'primary', text: 'Close', onclick: () => m.close() }));
  fetchPrints(name).then(list => {
    if (!list.length) { status.textContent = 'Scryfall has no printings with pictures for this card.'; return; }
    status.textContent = `${list.length} printing${list.length === 1 ? '' : 's'}${cur ? ' — wanted: ' + printLabel(cur) : ''}. Click one to want it.`;
    grid.replaceChildren(...list.map(p => { const cell = h('button', { class: 'print-cell' + (cur && cur.id === p.id ? ' on' : ''), title: `${p.setName} #${p.cn}${p.tcg ? '' : ' (not sold on TCGplayer)'}` },
      h('img', { src: p.small, alt: `${name} — ${p.setName}`, loading: 'lazy', draggable: 'false' }), h('span', { class: 'print-set', text: `${String(p.set).toUpperCase()} #${p.cn}` }), h('span', { class: 'print-year muted small', text: p.year + (p.tcg ? '' : ' · not on TCGplayer') }));
      cell.addEventListener('click', () => { const l2 = wishLoad(), it = l2.find(x => imgKey(x.name) === imgKey(name)); if (it) { it.p = { id: p.id, set: p.set, setName: p.setName, cn: p.cn, tcg: p.tcg, year: p.year, small: p.small }; wishSave(l2); } m.close(); toast('Printing chosen', `${name}: ${printLabel(p)}`); });
      return cell; }));
  }).catch(e => { status.textContent = 'Could not reach Scryfall (' + e.message + '). The printings list needs an internet connection.'; });
}
function openWishlist() {
  const m = modal('Card wishlist', { width: 760 });
  const inp = h('input', { type: 'text', placeholder: 'Add a card… (type its name)', autocomplete: 'off', style: 'flex:1;min-width:0' });
  const sug = h('div', { class: 'wl-sug' }), list = h('div', { class: 'wl-list' }), sum = h('div', { class: 'small muted wl-sum' });
  const add = (n) => { const nm = wishAdd(n || inp.value); if (!nm) return; if (!cardInfo(nm)) toast('Added', `${nm} is not in the loaded card data; it is on the list as typed.`); inp.value = ''; sug.replaceChildren(); draw(); inp.focus(); };
  inp.addEventListener('input', () => sug.replaceChildren(...wishSuggest(inp.value).map(n => h('button', { class: 'wl-sug-b', text: n, onclick: () => add(n) }))));
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const first = sug.querySelector('button'); add(first && !resolve(inp.value) ? first.textContent : inp.value); } });
  const thumb = x => { const src = x.p && x.p.small ? x.p.small : (() => { try { const i = imgFor(x.name); return i && i.front; } catch (e) { return null; } })(); return src ? h('img', { class: 'wl-img', src, alt: '', loading: 'lazy', draggable: 'false' }) : h('div', { class: 'wl-img wl-noimg', text: (x.name || '?').charAt(0) }); };
  const draw = () => {
    const l = wishLoad();
    list.replaceChildren(...(l.length ? l.map((x, i) => {
      const set = q => { const l2 = wishLoad(); if (!l2[i]) return; l2[i].qty = Math.max(1, Math.min(99, q)); wishSave(l2); draw(); };
      return h('div', { class: 'wl-row' }, thumb(x),
        h('div', { class: 'wl-txt' }, h('b', { text: x.name }), h('span', { class: 'small muted', text: x.p ? printLabel(x.p) + (x.p.tcg ? '' : ' (not on TCGplayer: sent by name)') : 'Any printing' })),
        h('div', { class: 'wl-qty' }, h('button', { text: '−', 'aria-label': 'One fewer', onclick: () => set((x.qty || 1) - 1) }), h('span', { text: String(x.qty || 1) }), h('button', { text: '+', 'aria-label': 'One more', onclick: () => set((x.qty || 1) + 1) })),
        h('button', { text: 'Choose art', onclick: () => wishPickPrint(x.name, draw) }),
        h('button', { class: 'danger', text: 'Remove', onclick: () => { const l2 = wishLoad(); l2.splice(i, 1); wishSave(l2); draw(); } }));
    }) : [h('div', { class: 'muted wl-empty', text: 'Nothing on your wishlist yet. Type a card name above to add it, then choose the art you want.' })]));
    const n = l.reduce((a, x) => a + (x.qty || 1), 0), exact = l.filter(x => x.p && x.p.tcg).length;
    sum.textContent = l.length ? `${n} card${n === 1 ? '' : 's'} (${l.length} different)${exact ? ` · ${exact} with the exact printing you chose` : ''}` : '';
    buy.disabled = !l.length; cp.disabled = !l.length; clr.disabled = !l.length;
  };
  const copy = async (txt, what) => { try { await navigator.clipboard.writeText(txt); toast('Copied', what); } catch (e) { toast('Could not copy', 'Select the list and copy it yourself.'); } };
  const cp = h('button', { text: 'Copy list', title: 'With set and collector number, for any store that takes a pasted list', onclick: () => copy(wishLines(wishLoad()).map(l => l.textLine).join('\n'), 'Your wishlist is on the clipboard.') });
  const clr = h('button', { class: 'danger', text: 'Clear', onclick: async () => { if (await appAsk('Clear the wishlist', 'Remove every card from your wishlist?', 'Clear', true)) { wishSave([]); draw(); } } });
  const buy = h('button', { class: 'primary', text: 'Buy on TCGplayer', onclick: () => {
    const ls = wishLines(wishLoad()), url = TCG_MASS + encodeURIComponent(ls.map(l => l.tcgLine).join('||'));
    if (url.length > 7800) { copy(ls.map(l => l.textLine).join('\n'), 'The list is too long for a link, so it is on the clipboard: paste it into the Mass Entry box that just opened.'); window.open(TCG_MASS, '_blank'); }
    else window.open(url, '_blank'); } });
  m.body.append(h('p', { class: 'small muted', text: 'Cards you want, with the art you want. Buy on TCGplayer opens their Mass Entry with the list filled in; nothing is bought until you check out there.' }),
    h('div', { class: 'setrow' }, inp, h('button', { text: 'Add', onclick: () => add() })), sug, list, sum);
  m.foot.append(clr, cp, buy, h('button', { text: 'Close', onclick: () => m.close() }));
  draw(); setTimeout(() => inp.focus(), 30);
}
