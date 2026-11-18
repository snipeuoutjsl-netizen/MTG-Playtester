// ---------------------------------------------------------------- v0.99.37 printings (alternate art) and "Buy this deck"
// Every printing of a card is listed by Scryfall (one search, unique=prints). Choosing one saves its picture as this deck's art for the card (the same per-deck
// art store as your own pictures, 'cart:<deck>|<card>') and remembers which printing it is (set, collector number, TCGplayer product id), so "Buy this deck"
// can ask TCGplayer for exactly that printing. Nothing is downloaded until you open the picker for a card.
const PRINTS_KEY = 'mtgpt.prints';
const printsCache = new Map();   // normalized card name -> [print] for this session
function deckPrints(deck) { const all = lsGet(PRINTS_KEY, {}) || {}; return all[deck] || {}; }
function printFor(deck, name) { return deckPrints(deck)[imgKey(name)] || null; }
function setPrintMeta(deck, name, p) {
  const all = lsGet(PRINTS_KEY, {}) || {}; const d = all[deck] || (all[deck] = {});
  if (p) d[imgKey(name)] = p; else delete d[imgKey(name)];
  if (!Object.keys(d).length) delete all[deck];
  lsSet(PRINTS_KEY, all);
}
function forgetDeckPrints(deck) { const all = lsGet(PRINTS_KEY, {}) || {}; if (all[deck]) { delete all[deck]; lsSet(PRINTS_KEY, all); } }
const printLabel = p => p ? `${p.setName || String(p.set).toUpperCase()} #${p.cn}${p.year ? ' (' + p.year + ')' : ''}` : '';

async function fetchPrints(name) {
  const key = imgKey(name); if (printsCache.has(key)) return printsCache.get(key);
  const q = `!"${frontName(name).replace(/"/g, '')}" include:extras`;
  let url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&unique=prints&order=released&dir=desc`, out = [];
  for (let page = 0; url && page < 6; page++) {   // Scryfall pages hold 175 cards; a few pages cover even Lightning Bolt
    const r = await fetch(url, { headers: { Accept: 'application/json' } }); if (!r.ok) { if (r.status === 404) break; throw new Error('Scryfall answered ' + r.status); }
    const j = await r.json();
    for (const c of j.data || []) {
      const face = c.image_uris ? c : (c.card_faces || []).find(f => f.image_uris); if (!face) continue;
      out.push({ id: c.id, set: c.set, setName: c.set_name, cn: c.collector_number, tcg: c.tcgplayer_id || null, year: (c.released_at || '').slice(0, 4), lang: c.lang,
        small: face.image_uris.small || face.image_uris.normal, normal: face.image_uris.normal || face.image_uris.large, finishes: c.finishes || [],
        ...(c.card_faces && c.card_faces.length > 1 && c.card_faces[1].image_uris ? { backName: c.card_faces[1].name, backNormal: c.card_faces[1].image_uris.normal || c.card_faces[1].image_uris.large } : {}) });   // a transforming card: its back face's picture of the same printing
    }
    url = j.has_more ? j.next_page : null; if (url) await sleep(110);   // Scryfall asks for no more than about ten requests a second
  }
  printsCache.set(key, out); return out;
}

function openPrintPicker(deck, name, after) {
  const m = modal(`Printings: ${name}`, { width: 980, onClose: after });
  const cur = printFor(deck, name), status = h('div', { class: 'small muted', text: 'Loading every printing from Scryfall…' }), grid = h('div', { class: 'print-grid' });
  m.body.append(h('p', { class: 'small muted', text: 'Pick the printing (art) to use for this card in this deck. It is shown on the table, in your hand and in the preview, and "Buy this deck" asks the store for exactly this printing.' }), status, grid);
  m.foot.append(h('button', { text: 'Use the default art', disabled: !cur, onclick: async () => { await resetCustomArt(deck, name); setPrintMeta(deck, name, null); m.close(); render(); } }), h('button', { class: 'primary', text: 'Close', onclick: () => m.close() }));
  fetchPrints(name).then(list => {
    if (!list.length) { status.textContent = 'Scryfall has no printings with pictures for this card.'; return; }
    status.textContent = `${list.length} printing${list.length === 1 ? '' : 's'}${cur ? ' — in use: ' + printLabel(cur) : ''}. Click one to use it.`;
    grid.replaceChildren(...list.map(p => {
      const on = cur && cur.id === p.id;
      const cell = h('button', { class: 'print-cell' + (on ? ' on' : ''), title: `${p.setName} #${p.cn}${p.tcg ? '' : ' (not sold on TCGplayer)'}` },
        h('img', { src: p.small, alt: `${name} — ${p.setName}`, loading: 'lazy', draggable: 'false' }),
        h('span', { class: 'print-set', text: `${String(p.set).toUpperCase()} #${p.cn}` }), h('span', { class: 'print-year muted small', text: `${p.year}${p.lang && p.lang !== 'en' ? ' · ' + p.lang.toUpperCase() : ''}` }));
      cell.addEventListener('click', async () => {
        status.textContent = `Downloading ${p.setName} #${p.cn}…`;
        try {
          const r = await fetch(p.normal); if (!r.ok) throw new Error('picture ' + r.status);
          const pm = { id: p.id, set: p.set, setName: p.setName, cn: p.cn, tcg: p.tcg, year: p.year };
          await setCustomArt(deck, name, await r.blob(), pm);
          if (p.backNormal && p.backName) { const rb = await fetch(p.backNormal); if (rb.ok) await setCustomArt(deck, p.backName, await rb.blob(), pm); }   // the back face shows the same printing once it transforms
          m.close(); render(); toast('Printing chosen', `${name}: ${printLabel(printFor(deck, name))}`);
        } catch (e) { status.textContent = 'Could not download that picture (' + e.message + '). Check the internet connection and try again.'; }
      });
      return cell;
    }));
  }).catch(e => { status.textContent = 'Could not reach Scryfall (' + e.message + '). The printings list needs an internet connection.'; });
}

// ---- Buy this deck: TCGplayer Mass Entry, prefilled. Lines are "qty-productId" for a chosen printing (exact product), otherwise "qty Card Name" (TCGplayer picks).
// The page reads ?productline=Magic&c= with lines joined by "||"; a very long list is copied to the clipboard instead (the address would be too long).
const TCG_MASS = 'https://www.tcgplayer.com/massentry?productline=Magic&c=';
function buyLines(deck, withSide) {
  const tot = new Map();
  for (const x of deck.main.concat(withSide ? deck.side : [])) { const r = resolve(x.name), n = r ? r.name : x.name; tot.set(n, (tot.get(n) || 0) + (x.qty || 1)); }
  return [...tot].map(([n, q]) => { const p = printFor(deck.name, n); return { name: n, qty: q, p, tcgLine: p && p.tcg ? `${q}-${p.tcg}` : `${q} ${n}`, textLine: p ? `${q} ${n} [${String(p.set).toUpperCase()}] ${p.cn}` : `${q} ${n}` }; });
}
function openBuyDeck(deck) {
  const m = modal(`Buy this deck: ${deck.name}`, { width: 620 });
  const side = h('input', { type: 'checkbox' }); side.checked = !!deck.side.length;
  const info = h('div', { class: 'small' });
  const draw = () => {
    const ls = buyLines(deck, side.checked), exact = ls.filter(l => l.p && l.p.tcg).length, cards = ls.reduce((a, l) => a + l.qty, 0);
    info.replaceChildren(h('p', { text: `${cards} cards (${ls.length} different). ${exact ? `${exact} with the printing you chose — TCGplayer is asked for exactly that one.` : 'No printings chosen: TCGplayer picks a printing for each card (choose them in Card art & printings).'}` }));
  };
  side.addEventListener('change', draw);
  const copy = async (txt, what) => { try { await navigator.clipboard.writeText(txt); toast('Copied', what); } catch (e) { const ta = h('textarea', { style: 'position:fixed;opacity:0' }); ta.value = txt; document.body.append(ta); ta.select(); try { document.execCommand('copy'); toast('Copied', what); } catch (er) { toast('Could not copy', 'Select the list and copy it yourself.'); } ta.remove(); } };
  m.body.append(h('p', { class: 'small muted', text: 'Opens TCGplayer Mass Entry in your browser with this list filled in. Review it there and press Add to Cart; nothing is bought until you check out. Prices and stock come from TCGplayer.' }),
    h('label', { class: 'teachopt' }, side, h('span', null, h('b', { text: 'Include the sideboard' }))), info);
  m.foot.append(
    h('button', { text: 'Copy list with set codes', title: 'For any store that takes a pasted list (Card Kingdom, Mana Pool, a local store...)', onclick: () => copy(buyLines(deck, side.checked).map(l => l.textLine).join('\n'), 'The list (with set and collector number for chosen printings) is on the clipboard.') }),
    h('button', { class: 'primary', text: 'Open on TCGplayer', onclick: () => {
      const ls = buyLines(deck, side.checked), url = TCG_MASS + encodeURIComponent(ls.map(l => l.tcgLine).join('||'));
      if (url.length > 7800) { copy(ls.map(l => l.textLine).join('\n'), 'The list is too long for a link, so it is on the clipboard: paste it into the Mass Entry box that just opened.'); window.open(TCG_MASS, '_blank'); }
      else window.open(url, '_blank');
      m.close(); } }),
    h('button', { text: 'Close', onclick: () => m.close() }));
  draw();
}
