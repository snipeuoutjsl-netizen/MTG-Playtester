// ---------------------------------------------------------------- token art + token glossary (v0.98.0)
// Tokens have no official art in this app (it ships no card images). Every token gets generic art drawn here from its own data
// (colours, types, subtypes, P/T), and the player can give any token name their own picture. Custom pictures live in IndexedDB ('tart:<name>').
let tokenGenericArt = lsGet('mtgpt.tokenArt', true);
const TOKART = new Map();          // normalized token name -> { front, custom: true }
const GENERIC_ART_CACHE = new Map();
const TOKIMG = new Map();          // normalized token name -> { front } : official token picture downloaded from Scryfall (cached in IndexedDB as 'timg:<name>')
const tokMissing = new Set();      // token names Scryfall had no picture for this session
const tokJob = { running: false, cancel: false, done: 0, total: 0 };
const tokKey = name => norm(String(name || ''));
async function loadTokenArt() {
  let n = 0;
  try {
    const keys = await idbKeys('tart:'); if (!keys.length) return 0;
    const rec = await idbGetMany(keys);
    for (const k of keys) { const b = rec[k]; if (!b) continue; const mk = k.slice(5), old = TOKART.get(mk); if (old) URL.revokeObjectURL(old.front); TOKART.set(mk, { front: URL.createObjectURL(b), custom: true }); n++; }
  } catch (e) { /* storage unavailable: custom token art is simply not loaded */ }
  return n;
}
async function loadTokenImgs(names) {
  const keys = [...new Set(names.map(tokKey))].filter(k => !TOKIMG.has(k)); if (!keys.length) return 0;
  const got = await idbGetMany(keys.map(k => 'timg:' + k)); let n = 0;
  for (const k of keys) { const b = got['timg:' + k]; if (b) { TOKIMG.set(k, { front: URL.createObjectURL(b) }); n++; } }
  return n;
}
// Scryfall lists the official token cards too: search for the token by name, then pick the one that matches this token's P/T, colours and type.
async function fetchScryfallToken(d) {
  const r = await netFetch('https://api.scryfall.com/cards/search?q=' + encodeURIComponent(`!"${d.name}" t:token`) + '&unique=art');
  if (r.status === 404) return null;
  const list = ((await r.json()).data || []).filter(c => c.image_uris || (c.card_faces && c.card_faces[0] && c.card_faces[0].image_uris)); if (!list.length) return null;
  const cs = (d.col || []).slice().sort().join(''), sc = c => { const f = c.card_faces && c.card_faces[0] || c, pt = f.power != null ? f.power + '/' + f.toughness : ''; return (pt === (d.pt || '') ? 4 : 0) + ((f.colors || c.colors || []).slice().sort().join('') === cs ? 2 : 0) + (String(f.type_line || c.type_line || '').includes(d.name) ? 1 : 0); };
  return list.reduce((b, c) => sc(c) > sc(b) ? c : b, list[0]);
}
async function downloadTokenArt(defs, onProgress) {
  if (tokJob.running) { if (onProgress) onProgress('busy', tokJob.done, tokJob.total, 0); return; }
  const todo = []; const seen = new Set(); for (const d of defs) { const k = tokKey(d.name); if (!seen.has(k) && !TOKIMG.has(k) && !tokMissing.has(k)) { seen.add(k); todo.push(d); } }
  if (!todo.length) { if (onProgress) onProgress('done', 0, 0, 0); return; }
  if (navigator.onLine === false) { if (onProgress) onProgress('offline', 0, 0, 0); return; }
  tokJob.running = true; tokJob.cancel = false; tokJob.done = 0; tokJob.total = todo.length; let ok = 0, err = null;
  for (const d of todo) {
    if (tokJob.cancel) break;
    try {
      const c = await fetchScryfallToken(d), u = c ? cardImageUrls(c).front : null;
      if (!u) tokMissing.add(tokKey(d.name));
      else { const blob = await fetchBlob(u), k = tokKey(d.name); try { await idbSet('timg:' + k, blob); } catch (e) { /* kept for this session only */ } TOKIMG.set(k, { front: URL.createObjectURL(blob) }); ok++; }
    } catch (e) { err = e; if (e && e.status === 429) break; }
    tokJob.done++; if (onProgress) onProgress('run', tokJob.done, tokJob.total, ok);
    await sleep(110);
  }
  tokJob.running = false; if (ok) render();
  if (onProgress) onProgress(err ? 'error' : tokJob.cancel ? 'stopped' : 'done', tokJob.done, tokJob.total, ok, err && err.reason);
}
async function setTokenArt(name, file) {
  const blob = await fitArt(file), k = tokKey(name), old = TOKART.get(k);
  try { await idbSet('tart:' + k, blob); } catch (e) { toast('Not saved', 'This picture is used for now, but the browser would not store it, so it will be gone next time.'); }
  if (old) URL.revokeObjectURL(old.front);
  TOKART.set(k, { front: URL.createObjectURL(blob), custom: true });
}
async function resetTokenArt(name) {
  const k = tokKey(name), old = TOKART.get(k); if (old) URL.revokeObjectURL(old.front); TOKART.delete(k);
  try { await idbDelete(['tart:' + k]); } catch (e) { /* ignore */ }
}
const GEN_FRAME = { W: ['#efe7cf', '#bfb289'], U: ['#5d8fcb', '#274e82'], B: ['#5b5163', '#241f2b'], R: ['#d5674b', '#7d2a1b'], G: ['#5f9c68', '#25512d'], C: ['#a7b1bc', '#59636e'], M: ['#e0c36a', '#8d6f1e'] };
// Simple original icons, drawn in a 100x100 box centred on the art window.
const GEN_ICONS = {
  chest: '<rect x="14" y="40" width="72" height="42" rx="4"/><path d="M14 40 Q50 6 86 40Z"/><rect x="42" y="46" width="16" height="18" rx="3" class="d"/>',
  apple: '<circle cx="50" cy="56" r="32"/><path d="M50 26 Q52 10 66 8 Q64 24 50 26Z" class="d"/>',
  magnifier: '<circle cx="42" cy="42" r="28" fill="none" stroke-width="9"/><path d="M63 63 L90 90" stroke-width="12" stroke-linecap="round"/>',
  drop: '<path d="M50 8 Q86 50 76 70 Q66 92 50 92 Q34 92 24 70 Q14 50 50 8Z"/>',
  crystal: '<path d="M50 6 L84 32 L84 68 L50 94 L16 68 L16 32Z"/><path d="M50 6 L50 94 M16 32 L84 68 M84 32 L16 68" class="d" fill="none" stroke-width="3"/>',
  coin: '<circle cx="50" cy="50" r="40"/><circle cx="50" cy="50" r="27" class="d" fill="none" stroke-width="5"/>',
  map: '<path d="M10 22 L36 12 L64 22 L90 12 L90 78 L64 88 L36 78 L10 88Z"/><path d="M26 56 Q44 30 62 54 L74 40" class="d" fill="none" stroke-width="4" stroke-dasharray="6 5"/>',
  gear: '<circle cx="50" cy="50" r="30"/><g stroke-width="14" stroke-linecap="butt"><path d="M50 6V22M50 78V94M6 50H22M78 50H94M19 19L30 30M70 70L81 81M81 19L70 30M30 70L19 81"/></g><circle cx="50" cy="50" r="11" class="d"/>',
  gem: '<path d="M50 6 L80 40 L50 94 L20 40Z"/><path d="M20 40 H80 M50 6 L38 40 L50 94 L62 40Z" class="d" fill="none" stroke-width="3"/>',
  pod: '<ellipse cx="50" cy="44" rx="30" ry="28"/><path d="M26 66 L12 92 M42 72 L38 94 M58 72 L62 94 M74 66 L88 92" stroke-width="7" stroke-linecap="round"/>',
  egg: '<path d="M50 8 Q84 34 80 64 Q76 92 50 92 Q24 92 20 64 Q16 34 50 8Z"/><path d="M30 58 L42 48 L52 62 L64 46 L72 56" class="d" fill="none" stroke-width="4"/>',
  blob: '<circle cx="50" cy="46" r="26"/><path d="M26 60 Q10 74 14 92 M42 70 Q36 86 40 96 M58 70 Q64 86 60 96 M74 60 Q90 74 86 92" stroke-width="7" fill="none" stroke-linecap="round"/><circle cx="42" cy="42" r="5" class="d"/><circle cx="58" cy="42" r="5" class="d"/>',
  shield: '<path d="M50 6 L88 18 L88 50 Q88 80 50 94 Q12 80 12 50 L12 18Z"/><path d="M50 22 V80 M26 44 H74" class="d" fill="none" stroke-width="6"/>',
  skull: '<path d="M50 8 Q86 8 86 44 Q86 60 74 66 L74 86 L26 86 L26 66 Q14 60 14 44 Q14 8 50 8Z"/><circle cx="36" cy="46" r="9" class="d"/><circle cx="64" cy="46" r="9" class="d"/><path d="M46 62 H54 M40 86 V74 M50 86 V74 M60 86 V74" class="d" fill="none" stroke-width="4"/>',
  wing: '<path d="M8 70 Q20 20 62 12 Q54 28 70 30 Q58 40 78 46 Q64 52 90 66 Q60 64 48 80 Q36 66 8 70Z"/>',
  paw: '<ellipse cx="50" cy="66" rx="24" ry="20"/><ellipse cx="20" cy="42" rx="9" ry="12"/><ellipse cx="38" cy="26" rx="9" ry="13"/><ellipse cx="62" cy="26" rx="9" ry="13"/><ellipse cx="80" cy="42" rx="9" ry="12"/>',
  leaf: '<path d="M14 86 Q8 30 50 12 Q92 14 88 52 Q80 90 14 86Z"/><path d="M14 86 Q40 56 76 30" class="d" fill="none" stroke-width="4"/>',
  flame: '<path d="M50 6 Q68 30 62 44 Q80 40 80 64 Q80 94 50 94 Q20 94 20 64 Q20 44 38 38 Q34 24 50 6Z"/>',
  bust: '<circle cx="50" cy="32" r="20"/><path d="M12 92 Q14 56 50 54 Q86 56 88 92Z"/>',
  ghost: '<path d="M20 90 V44 Q20 8 50 8 Q80 8 80 44 V90 L68 78 L56 90 L44 78 L32 90Z"/><circle cx="40" cy="42" r="6" class="d"/><circle cx="60" cy="42" r="6" class="d"/>',
  cog: '<rect x="20" y="30" width="60" height="44" rx="6"/><circle cx="36" cy="82" r="9"/><circle cx="64" cy="82" r="9"/><rect x="40" y="14" width="20" height="16" class="d"/>'
};
function genericIconFor(name, subs, types) {
  const w = (String(name) + ' ' + (subs || []).join(' ')).toLowerCase();
  const T = [['treasure', 'chest'], ['food', 'apple'], ['clue', 'magnifier'], ['blood', 'drop'], ['powerstone', 'crystal'], ['gold', 'coin'], ['map', 'map'], ['junk', 'gear'], ['shard', 'gem'], ['lander', 'pod'], ['incubator', 'egg'], ['spawn', 'blob'], ['scion', 'blob'],
    ['spirit|ghost|illusion|shade|specter|spectre', 'ghost'], ['zombie|skeleton|rat|vampire|horror|bat', 'skull'], ['bird|thopter|angel|faerie|dragon|drake|pegasus|phoenix|wing|griffin|sphinx|hawk', 'wing'],
    ['soldier|knight|human|warrior|cleric|monk|samurai|citizen|army|dwarf|noble', 'shield'], ['elemental|devil|imp|demon|hellion|fire|lava', 'flame'], ['saproling|plant|treefolk|elf|druid|insect|fungus|ent', 'leaf'],
    ['beast|wolf|cat|dog|bear|boar|squirrel|rhino|snake|lizard|ape|elephant|spider|goblin|ogre|kavu|hydra|wurm|worm|fish|crab|turtle', 'paw'], ['servo|construct|golem|myr|robot|assembly|vehicle|powerstone|clue|dinosaur', 'cog']];
  for (const [re, ic] of T) if (new RegExp('\\b(?:' + re + ')\\b').test(w)) return ic;
  return (types || []).includes('Creature') ? 'bust' : 'gem';
}
const xmlEsc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
function genericTokenArt(d) {
  const key = [d.name, d.pt || '', (d.col || []).join(''), (d.types || []).join(''), (d.subs || []).join(' ')].join('|');
  if (GENERIC_ART_CACHE.has(key)) return GENERIC_ART_CACHE.get(key);
  const col = d.col || [], fk = col.length > 1 ? 'M' : col.length === 1 ? col[0] : 'C', [lt, dk] = GEN_FRAME[fk] || GEN_FRAME.C;
  const dark = fk === 'W' ? '#2b2618' : '#fff', icon = GEN_ICONS[genericIconFor(d.name, d.subs, d.types)];
  const tl = (d.type || ('Token ' + (d.types || []).join(' '))).replace(/^Token\s*/, 'Token ');
  const nm = xmlEsc(d.name), nameSize = nm.length > 18 ? 17 : 22;
  const pt = d.pt ? `<g><rect x="168" y="304" width="66" height="34" rx="8" fill="#000" fill-opacity=".6" stroke="${lt}" stroke-width="2"/><text x="201" y="328" text-anchor="middle" font-size="22" font-weight="700" fill="#fff" font-family="Georgia,serif">${xmlEsc(d.pt)}</text></g>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 350" width="250" height="350"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${lt}"/><stop offset="1" stop-color="${dk}"/></linearGradient><radialGradient id="a" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="${lt}" stop-opacity=".95"/><stop offset="1" stop-color="${dk}"/></radialGradient>
<style>.i path,.i circle,.i rect,.i ellipse{fill:${fk === 'W' ? '#4a3f22' : '#f4efe2'};stroke:${fk === 'W' ? '#4a3f22' : '#f4efe2'};stroke-width:0}.i .d{fill:${dk};stroke:${dk}}.i [fill=none]{fill:none!important}.i [stroke-width]{stroke:${fk === 'W' ? '#4a3f22' : '#f4efe2'}}.i .d[stroke-width]{stroke:${dk}}</style></defs>
<rect width="250" height="350" rx="14" fill="#14120f"/><rect x="7" y="7" width="236" height="336" rx="11" fill="url(#g)"/>
<rect x="17" y="16" width="216" height="34" rx="7" fill="#000" fill-opacity=".5"/><text x="125" y="40" text-anchor="middle" font-size="${nameSize}" font-weight="700" fill="${dark === '#fff' ? '#fff' : '#fff'}" font-family="Georgia,serif">${nm}</text>
<rect x="17" y="58" width="216" height="222" rx="8" fill="url(#a)" stroke="#000" stroke-opacity=".6" stroke-width="2"/><g class="i" transform="translate(50 82) scale(1.5)">${icon}</g>
<rect x="17" y="288" width="216" height="26" rx="6" fill="#000" fill-opacity=".5"/><text x="125" y="307" text-anchor="middle" font-size="14" fill="#fff" font-family="Georgia,serif">${xmlEsc(tl.length > 30 ? tl.slice(0, 29) + '\u2026' : tl)}</text>
<text x="24" y="334" font-size="10" fill="#fff" fill-opacity=".75" font-family="sans-serif" letter-spacing="1.5">GENERIC TOKEN</text>${pt}</svg>`;
  const url = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  GENERIC_ART_CACHE.set(key, url);
  return url;
}
// The art for a token card (c.tk) or a token definition: the player's own picture wins, then the generic art. null = plain text tile.
function tokenArtFor(c) {
  if (!showImages) return null;
  const tk = c.tk || c, name = c.name || tk.name;
  const mine = TOKART.get(tokKey(name)); if (mine) return { front: mine.front, back: null, custom: true };
  const off = TOKIMG.get(tokKey(name)); if (off) return { front: off.front, back: null, official: true };
  if (!tokenGenericArt) return null;
  return { front: genericTokenArt({ name, pt: tk.pt, col: tk.col, types: tk.types, subs: tk.subs, type: tk.type }), back: null, generic: true };
}
const cardArt = c => c.token ? tokenArtFor(c) : (showImages ? imgFor(c.name) : null);
// Everything the glossary can list: the deck's own tokens first, then every official token in the loaded data (one row per name), then the built-in presets.
function tokenGlossaryEntries() {
  const seen = new Set(), out = [];
  const add = (d, grp) => { const k = tokKey(d.name); if (!d.name || seen.has(k)) return; seen.add(k); out.push(Object.assign({ grp }, d)); };
  try { for (const d of deckTokenDefs()) add(d, 'In your deck'); } catch (e) { /* no deck loaded */ }
  for (const k of Object.keys(TOKEN_PRE)) { const p = TOKEN_PRE[k], nm = k.replace(/\b\w/g, x => x.toUpperCase()), isC = (p.types || []).includes('Creature'); add({ name: nm, pt: p.pt || '', col: [], types: p.types, subs: [k.split(' ').pop()], tx: p.tx, type: `Token ${p.types.join(' ')} \u2014 ${nm}` }, 'Common'); }
  const rows = []; TOKENDB.forEach(a => { const r = a[0]; if (r) rows.push(r); }); rows.sort((x, y) => x.n.localeCompare(y.n));
  for (const r of rows) { const tl = r.t.replace(/^(?!Token)/, 'Token '), ty = ['Creature', 'Artifact', 'Enchantment', 'Land'].filter(w => new RegExp('\\b' + w + '\\b').test(tl.split('\u2014')[0])); add({ name: r.n, pt: r.pt || '', col: r.col || [], types: ty, subs: (tl.split('\u2014')[1] || r.n).trim().toLowerCase().split(/\s+/), tx: (r.tx || '').replace(/\([^)]*\)/g, '').replace(/\n{2,}/g, '\n').trim(), type: tl }, 'All tokens'); }
  return out;
}
function openTokenGlossary() {
  const m = modal('Token glossary', { width: 940 });
  const all = tokenGlossaryEntries(), grid = h('div', { class: 'cart-grid tg-grid' }), note = h('div', { class: 'small', style: 'color:var(--gold);min-height:18px;margin:4px 0' });
  let q = '', shown = 60;
  const search = h('input', { type: 'search', placeholder: 'Search tokens (name, type, ability)…', style: 'flex:1;min-width:160px' });
  const gen = h('input', { type: 'checkbox' }); gen.checked = tokenGenericArt;
  gen.addEventListener('change', () => { tokenGenericArt = gen.checked; lsSet('mtgpt.tokenArt', tokenGenericArt); draw(); render(); });
  const more = h('button', { text: 'Show more', onclick: () => { shown += 60; draw(); } });
  const pick = cb => { const inp = h('input', { type: 'file', accept: 'image/*', style: 'display:none' }); inp.addEventListener('change', () => { const f = inp.files[0]; inp.remove(); if (f) cb(f); }); document.body.append(inp); inp.click(); };
  const draw = () => {
    const f = all.filter(d => !q || (d.name + ' ' + d.type + ' ' + (d.tx || '')).toLowerCase().includes(q));
    const vis = f.slice(0, shown); let grp = '';
    grid.replaceChildren(...vis.flatMap(d => {
      const art = tokenArtFor({ name: d.name, tk: d }), mine = TOKART.has(tokKey(d.name)), off = !mine && TOKIMG.has(tokKey(d.name)), au = tokenAbilityAudit(d), okN = au.filter(a => a.st === 'ok').length;
      const head = d.grp !== grp ? (grp = d.grp, [h('div', { class: 'fhead', style: 'grid-column:1/-1', text: d.grp })]) : [];
      const thumb = h('div', { class: 'cart-thumb' + (art ? '' : ' none') + (mine ? ' mine' : ''), style: art ? `background-image:url("${art.front}")` : '' }, art ? null : h('span', { text: d.name }), mine ? h('i', { class: 'cart-mine', text: 'custom' }) : off ? h('i', { class: 'cart-mine', text: 'official' }) : null);
      return head.concat([h('div', { class: 'cart-cell' }, thumb, h('div', { class: 'cart-name', title: d.type + (d.tx ? '\n' + d.tx : ''), text: d.name + (d.pt ? ' ' + d.pt : '') }),
        au.length ? h('div', { class: 'small muted', title: au.map(a => (a.st === 'ok' ? '\u2713 ' : a.st === 'part' ? '\u25d0 ' : '\u2717 ') + a.line).join('\n'), text: `abilities ${okN}/${au.length} \u2713` }) : h('div', { class: 'small muted', text: 'no abilities' }),
        h('div', { class: 'cart-btns' }, h('button', { text: mine ? 'Change\u2026' : 'Add art\u2026', onclick: () => pick(async fl => { try { note.textContent = 'Saving\u2026'; await setTokenArt(d.name, fl); note.textContent = `Saved art for ${d.name}.`; draw(); render(); } catch (e) { note.textContent = 'Could not read that picture.'; } }) }),
          mine ? h('button', { text: 'Reset', onclick: async () => { await resetTokenArt(d.name); note.textContent = `${d.name} is back to the generic art.`; draw(); render(); } }) : null))]);
    }));
    more.hidden = shown >= f.length; count.textContent = `${f.length} token${f.length === 1 ? '' : 's'} \u00b7 ${[...TOKART.keys()].length} with your own art`;
  };
  const count = h('span', { class: 'small muted' });
  const prog = (st, done, total, ok, why) => { note.textContent = st === 'run' ? `Downloading token pictures\u2026 ${done}/${total}` : st === 'busy' ? 'A token picture download is already running (' + done + '/' + total + '). Try again when it finishes.' : st === 'offline' ? 'Offline: connect to the internet to download token pictures.' : st === 'error' ? `Stopped: ${why || 'could not reach Scryfall'}. ${ok} saved.` : st === 'stopped' ? `Stopped. ${ok} saved.` : total ? `Done: ${ok} of ${total} token pictures downloaded (the rest have none on Scryfall).` : 'Nothing new to download.'; if (st !== 'run') draw(); };
  const dlDeck = h('button', { text: 'Download art for my deck\u2019s tokens', title: 'Fetches the official token pictures from Scryfall, the same way card pictures are fetched', onclick: () => downloadTokenArt(all.filter(d => d.grp === 'In your deck'), prog) });
  const dlAll = h('button', { text: 'Download art for all tokens', onclick: async () => { if (all.length < 80 || await appAsk('Download token art', `Download pictures for ${all.length} tokens from Scryfall? It takes a few minutes.`, 'Download')) downloadTokenArt(all, prog); } });
  const dlStop = h('button', { text: 'Stop', onclick: () => { tokJob.cancel = true; } });
  search.addEventListener('input', () => { q = search.value.trim().toLowerCase(); shown = 60; draw(); });
  m.body.append(h('p', { class: 'small muted', text: 'Every token has generic art drawn by this app (the app ships no official art). Press a Download button to fetch the official token pictures from Scryfall, the same way card pictures are fetched, or add your own picture to any token your own picture; it always wins over the others. It is used wherever that token appears (on the table, in the preview, in stacks). The picture is stored on this computer only. Art is per token name, so one picture covers every Soldier you make.' }),
    h('div', { class: 'cart-bar' }, search, h('label', { class: 'small', style: 'white-space:nowrap' }, gen, ' Show generic art on tokens'), count), h('div', { class: 'cart-bar' }, dlDeck, dlAll, dlStop), note, grid, h('div', { class: 'row', style: 'justify-content:center' }, more));
  m.foot.append(h('button', { class: 'primary', text: 'Done', onclick: () => m.close() }));
  draw();
}
