// ---------------------------------------------------------------- card images (Scryfall -> cached offline in IndexedDB)
const IMG = new Map();            // normalized card name -> { front, back, remote }  (blob: URLs, or remote URLs if caching was blocked)
const imgMissing = new Set();     // names Scryfall could not find this session
let showImages = lsGet('mtgpt.showImages', true);
let autoImages = lsGet('mtgpt.autoImages', true);
const imgJob = { running: false, cancel: false, done: 0, total: 0 };
let imgUi = null;                 // callback that refreshes the Images dialog if it is open
const sleep = ms => new Promise(r => setTimeout(r, ms));
const frontName = n => String(n).split(' // ')[0];
const imgKey = name => norm(name);
// Custom card art (v0.69): the player's own images, stored per deck and per card in IndexedDB ('cart:<deck>|<card>').
const CUSTOM = new Map();         // `${deck}|${normalized name}` -> { front, back: null, custom: true }
const customMapKey = (deck, name) => deck + '|' + imgKey(name);
const imgFor = (name, deck) => { const d = deck === undefined ? lsGet('mtgpt.current', null) : deck; if (d && CUSTOM.size) { const c = CUSTOM.get(customMapKey(d, name)); if (c) return c; } const e = IMG.get(imgKey(name)); if (e) return e; const fr = FACES.get(imgKey(name)); if (fr) { const pe = IMG.get(imgKey(fr.bf)) || IMG.get(imgKey(fr.bf.split(' // ')[0])); if (pe && fr.half) return pe; if (pe && pe.back) return { ...pe, front: pe.back, back: pe.front }; } return null; };

async function idbGetMany(keys) {
  try {
    const db = await idb();
    return await new Promise((res, rej) => {
      const st = db.transaction('kv').objectStore('kv');
      const out = {}; let n = keys.length;
      if (!n) return res(out);
      keys.forEach(k => { const q = st.get(k); q.onsuccess = () => { out[k] = q.result; if (--n === 0) res(out); }; q.onerror = () => rej(q.error); });
    });
  } catch (e) { return {}; }
}
async function idbKeys(prefix) {
  try {
    const db = await idb();
    return await new Promise((res, rej) => {
      const q = db.transaction('kv').objectStore('kv').getAllKeys(IDBKeyRange.bound(prefix, prefix + '￿'));
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
  } catch (e) { return []; }
}
async function idbDelete(keys) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction('kv', 'readwrite'); const st = tx.objectStore('kv');
    keys.forEach(k => st.delete(k));
    tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
  });
}

function setImgEntry(key, rec) {
  const old = IMG.get(key);
  if (old) for (const u of [old.front, old.back]) if (u && u.startsWith('blob:')) URL.revokeObjectURL(u);
  const e = { front: null, back: null, remote: false };
  if (rec.front) e.front = URL.createObjectURL(rec.front); else if (rec.frontUrl) { e.front = rec.frontUrl; e.remote = true; }
  if (rec.back) e.back = URL.createObjectURL(rec.back); else if (rec.backUrl) { e.back = rec.backUrl; e.remote = true; }
  if (rec.meta && !META.has(key)) META.set(key, rec.meta);
  if (e.front) IMG.set(key, e);
  if (!cardCount && rec.meta) updateDbStatus();
}

async function loadCachedImages(names) {
  const keys = [...new Set(names.map(imgKey))].filter(k => !IMG.has(k));
  if (!keys.length) return 0;
  const got = await idbGetMany(keys.map(k => 'img:' + k));
  let n = 0;
  for (const k of keys) { const rec = got['img:' + k]; if (rec) { setImgEntry(k, rec); n++; } }
  return n;
}

function deckNameList(deck) {
  const out = new Set();
  for (const { name } of [...deck.main, ...deck.side]) { const r = resolve(name); out.add(r ? r.name : name); }
  return [...out];
}
function currentDeckNames() { const d = getCurrentDeck(); return d ? deckNameList(d) : []; }
function allDeckNames() {
  const out = new Set();
  for (const text of Object.values(loadDecks()).map(d => d.text)) for (const n of deckNameList(parseDeck(text))) out.add(n);
  return [...out];
}

// ---- network (v0.71): every download goes through netFetch, which retries politely and says WHY it failed in plain words.
let lastNetReason = '';
function netReason(e, host) {
  const site = host || 'the website';
  if (navigator.onLine === false) return 'This computer is offline.';
  const st = e && e.status;
  if (st === 429) return `${site} asked the app to slow down (too many requests). Wait a minute, then press retry.`;
  if (st === 403 || st === 401) return `${site} refused the request (HTTP ${st}). A VPN, proxy, firewall or network filter is the usual cause.`;
  if (st >= 500) return `${site} is having problems right now (HTTP ${st}). Try again later.`;
  if (st) return `${site} answered with HTTP ${st}.`;
  return `Could not connect to ${site}. Check the internet connection, VPN, firewall or antivirus; the site may also be blocked on this network.`;
}
async function netFetch(url, tries = 3) {
  const host = (() => { try { return new URL(url).hostname; } catch (x) { return 'the website'; } })();
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok || r.status === 404) return r;
      last = Object.assign(new Error('HTTP ' + r.status), { status: r.status });
      if (r.status === 429 || r.status >= 500) { const ra = +r.headers.get('retry-after'); await sleep(Math.min(8000, (ra > 0 ? ra * 1000 : 1500 * (i + 1)))); continue; }
      break;
    } catch (e) { last = e; await sleep(800 * (i + 1)); }
  }
  last.reason = netReason(last, host); lastNetReason = last.reason;
  throw last;
}
async function fetchScryfallCard(name) {
  const get = async n => {
    const r = await netFetch('https://api.scryfall.com/cards/named?exact=' + encodeURIComponent(n));
    if (r.status === 404) return null;
    return r.json();
  };
  let card = await get(name);
  if (!card && name.includes(' // ')) { await sleep(100); card = await get(frontName(name)); }
  return card;
}
function cardImageUrls(card) {
  if (card.image_uris) return { front: card.image_uris.normal || card.image_uris.large || card.image_uris.small, back: null };
  const f = card.card_faces || [];
  const pick = x => x && x.image_uris && (x.image_uris.normal || x.image_uris.large || x.image_uris.small);
  return { front: pick(f[0]), back: pick(f[1]) };
}
async function fetchBlob(url) {
  const r = await netFetch(url, 2);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.blob();
}

function imgSummary() {
  const names = currentDeckNames();
  const have = names.filter(n => IMG.has(imgKey(n))).length;
  return { have, total: names.length };
}
function setImgStatus(msg) {
  const el = $('#imgStatus');
  if (el) {
    if (imgJob.running) el.textContent = `Images ${imgJob.done}/${imgJob.total}…`;
    else if (msg) el.textContent = msg;
    else {
      const { have, total } = imgSummary();
      el.dataset.state = total && have === total ? 'ok' : 'warn';
      el.textContent = total ? (have === total ? 'Images ready' : `Images ${have}/${total}`) : '';
    }
  }
  { const el2 = $('#imgStatus'); if (el2) { const bad = /offline|stopped/i.test(el2.textContent); el2.title = bad ? (lastNetReason || 'Pictures could not be fetched right now.') + ' Click to try again. Pictures you already saved are still used.' : 'Card pictures come from Scryfall. Click to check for missing ones.'; el2.style.cursor = 'pointer'; } }
  if (imgUi) imgUi();
}

async function downloadImages(names) {
  if (imgJob.running) return;
  const todo = [...new Set(names)].filter(n => !imgMissing.has(imgKey(n)) && (!IMG.has(imgKey(n)) || !cardInfo(n)));
  if (!todo.length) { setImgStatus(); return; }
  if (navigator.onLine === false) { setImgStatus('Images: offline'); return; }
  imgJob.running = true; imgJob.cancel = false; imgJob.done = 0; imgJob.total = todo.length;
  setImgStatus();
  let netErr = null;
  for (const name of todo) {
    if (imgJob.cancel) break;
    try {
      const card = await fetchScryfallCard(name);
      if (card) { setMeta(card, name); saveMeta(); }
      const u = card ? cardImageUrls(card) : null;
      if (IMG.has(imgKey(name))) { /* already cached; only wanted the card data */ }
      else if (!u || !u.front) imgMissing.add(imgKey(name));
      else {
        const rec = { frontUrl: u.front, backUrl: u.back || null, ts: Date.now(), meta: compact(card) };
        try { rec.front = await fetchBlob(u.front); if (u.back) rec.back = await fetchBlob(u.back); }
        catch (e) { delete rec.front; delete rec.back; }   // image host blocked saving: fall back to showing it online only
        try { await idbSet('img:' + imgKey(name), rec); } catch (e) { /* keep in memory */ }
        setImgEntry(imgKey(name), rec);
      }
    } catch (e) { netErr = e; break; }
    imgJob.done++;
    setImgStatus();
    if (imgJob.done % 4 === 0) render();
    await sleep(100);   // Scryfall asks for 50-100 ms between requests
  }
  const stopped = imgJob.cancel;
  imgJob.running = false;
  render();
  if (netErr) { lastNetReason = netErr.reason || netReason(netErr, 'Scryfall'); setImgStatus('Images: offline'); toast('Pictures could not be downloaded', lastNetReason); }
  else if (stopped) setImgStatus('Images: stopped');
  else setImgStatus();
}

function maybeAutoDownload() {
  if (!autoImages || !showImages) return;
  const names = currentDeckNames();
  if (names.length) downloadImages(names);
}

async function prepareImages() {
  const n = await loadCachedImages(currentDeckNames());
  if (n) render();
  setImgStatus();
  maybeAutoDownload();
}

