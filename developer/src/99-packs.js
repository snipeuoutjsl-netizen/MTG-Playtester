// ---- v0.99.106 Packs. Winning a game earns a pack, and so does solving a puzzle for the first time. A pack is 15 cards from a real set,
// laid out like a booster: 10 commons, 3 uncommons, 1 rare (a mythic about 1 time in 8, when the set has mythics) and 1 basic land; about
// one pack in three has a foil in place of a common. The cards come from Scryfall: the set's booster cards are looked up once (search
// "set:<code> is:booster") and kept in this browser, so later packs of that set open without waiting. Opened cards go to the Collection
// (src/99-collection.js). Packs you have not opened yet are kept and can be opened any time from the Library.
const PACK_KEY = 'mtgpt.packs', COLL_KEY = 'mtgpt.collection';
const PACK_SRC = { fetchJson: url => netFetch(url).then(r => r.ok ? r.json() : null) };   // the tests serve real card objects through this
function packState() { const v = lsGet(PACK_KEY, null) || {}; return { bank: Math.max(0, +v.bank || 0), opened: +v.opened || 0, earned: Array.isArray(v.earned) ? v.earned.slice(-30) : [], lastSet: v.lastSet || 'random' }; }
function packSave(p) { lsSet(PACK_KEY, p); }
function packsToOpen() { return packState().bank; }
function earnPack(why) {
  const p = packState(); p.bank++; p.earned.push({ why, at: Date.now() }); packSave(p);
  try { log(`You earned a pack: ${why}`); } catch (e) {}
  try { if (typeof hallOpen === 'function' && hallOpen()) drawHall(); } catch (e) {}
  return p.bank;
}
// ---- the sets a pack can come from: Scryfall's main expansions and core sets, newest first (kept for a week)
async function packSets() {
  const c = lsGet('mtgpt.packSets', null); if (c && Array.isArray(c.list) && c.list.length && Date.now() - c.at < 7 * 86400000) return c.list;
  const j = await PACK_SRC.fetchJson('https://api.scryfall.com/sets'); if (!j || !Array.isArray(j.data)) return c && c.list || [];
  const today = new Date().toISOString().slice(0, 10);
  const list = j.data.filter(s => ['expansion', 'core'].includes(s.set_type) && !s.digital && s.released_at && s.released_at <= today && (s.card_count || 0) >= 150)
    .sort((a, b) => b.released_at.localeCompare(a.released_at)).slice(0, 40).map(s => ({ code: s.code, name: s.name, date: s.released_at }));
  lsSet('mtgpt.packSets', { at: Date.now(), list }); return list;
}
// ---- one set's cards by rarity (IndexedDB; the six sets used most recently are kept)
function packEntry(o) {
  const f = o.card_faces || [], img = o.image_uris ? (o.image_uris.normal || o.image_uris.large) : (f[0] && f[0].image_uris && f[0].image_uris.normal) || '';
  const back = !o.image_uris && f[1] && f[1].image_uris ? f[1].image_uris.normal : '';
  let rec = null; try { rec = compact(o); } catch (e) { rec = null; }
  return { n: o.name, cn: o.collector_number, r: o.rarity, set: o.set, sn: o.set_name, img, back, basic: /\bBasic\b.*\bLand\b/.test(o.type_line || ''), rec };
}
async function packSearchAll(q) {
  let url = 'https://api.scryfall.com/cards/search?unique=prints&q=' + encodeURIComponent(q), out = [];
  for (let page = 0; url && page < 8; page++) { const j = await PACK_SRC.fetchJson(url); if (!j || !Array.isArray(j.data)) break; out = out.concat(j.data); url = j.has_more ? j.next_page : null; if (url) await sleep(110); }
  return out;
}
async function packPool(code) {
  let pool = null; try { pool = await idbGet('pool:' + code); } catch (e) { pool = null; }
  if (pool && pool.v === 1 && pool.common && pool.common.length >= 10) return pool;
  const cards = (await packSearchAll(`set:${code} is:booster`)).map(packEntry);
  let lands = cards.filter(c => c.basic);
  if (!lands.length) { await sleep(110); lands = (await packSearchAll(`set:${code} type:basic`)).map(packEntry); }
  pool = { v: 1, code, name: (cards[0] || {}).sn || code, common: [], uncommon: [], rare: [], mythic: [], land: lands };
  for (const c of cards) if (!c.basic && pool[c.r]) pool[c.r].push(c);
  if (pool.common.length < 10 || pool.uncommon.length < 3 || !pool.rare.length) return null;
  try { await idbSet('pool:' + code, pool); const keep = lsGet('mtgpt.packPools', []).filter(x => x !== code); keep.unshift(code); for (const old of keep.slice(6)) idbDelete(['pool:' + old]).catch(() => {}); lsSet('mtgpt.packPools', keep.slice(0, 6)); } catch (e) { /* kept in memory only */ }
  return pool;
}
// ---- what is in one pack (rng = Math.random unless the tests pass their own)
function packFromPool(pool, rng = Math.random) {
  const pick = (list, n, avoid) => { const out = [], seen = new Set(avoid || []); for (let g = 0; out.length < n && g < 400; g++) { const c = list[Math.floor(rng() * list.length)]; if (!c || seen.has(c.n)) continue; seen.add(c.n); out.push(c); } return out; };
  const commons = pick(pool.common, 10), uncommons = pick(pool.uncommon, 3);
  const rareSlot = pool.mythic.length && rng() < 1 / 8 ? pick(pool.mythic, 1) : pick(pool.rare, 1);
  const land = pool.land.length ? pick(pool.land, 1) : pick(pool.common, 1, commons.map(c => c.n));
  const cards = [...land.map(c => ({ ...c, slot: 'land' })), ...commons.map(c => ({ ...c, slot: 'common' })), ...uncommons.map(c => ({ ...c, slot: 'uncommon' }))];
  if (rng() < 1 / 3) {   // a foil of any rarity takes the place of a common
    const x = rng(), from = x < 0.7 ? pool.common : x < 0.9 ? pool.uncommon : x < 0.98 || !pool.mythic.length ? pool.rare : pool.mythic;
    const f = pick(from, 1); if (f.length) { const i = cards.findIndex(c => c.slot === 'common'); cards.splice(i, 1); cards.push({ ...f[0], slot: 'foil', foil: true }); }
  }
  cards.push(...rareSlot.map(c => ({ ...c, slot: c.r })));   // the rare (or mythic) is last, as in a real pack
  return cards;
}
// ---- the collection (localStorage: one entry per printing)
function collState() { const v = lsGet(COLL_KEY, null) || {}; return { cards: v.cards || {}, seen: +v.seen || 0 }; }
function collAdd(cards) {
  const c = collState(), now = Date.now();
  for (const x of cards) { const k = x.set + '#' + x.cn, e = c.cards[k] || { n: x.n, set: x.set, sn: x.sn, cn: x.cn, r: x.r, img: x.img, back: x.back || '', c: 0, f: 0, t: now };
    if (x.foil) e.f++; else e.c++; e.last = now; c.cards[k] = e; }
  lsSet(COLL_KEY, c);
  try { const recs = cards.filter(x => x.rec && !cardInfo(x.n)); if (recs.length) { for (const x of recs) META.set(norm(x.n), normFaces(Object.assign({}, x.rec))); saveMeta(); } } catch (e) { /* card data: the rules engine can read the cards you opened */ }
}
// ---- opening one: choose the set, look it up, make the pack, take it from the bank, add the cards, then show the opening
async function openPack(setCode) {
  const p = packState(); if (p.bank < 1) { toast('No packs to open', 'Win a game or solve a puzzle for the first time to earn a pack.'); return null; }
  if (navigator.onLine === false) { toast('Packs need the internet', 'The cards in a pack come from Scryfall. Connect and try again; your packs are kept.'); return null; }
  let sets = []; try { sets = await packSets(); } catch (e) { sets = []; }
  if (!sets.length) { toast('Could not reach Scryfall', (typeof lastNetReason !== 'undefined' && lastNetReason) || 'The set list could not be loaded. Your packs are kept; try again later.'); return null; }
  const tryCodes = setCode && setCode !== 'random' ? [setCode] : sets.map(s => s.code).sort(() => Math.random() - 0.5).slice(0, 4);
  let pool = null; for (const code of tryCodes) { try { pool = await packPool(code); } catch (e) { pool = null; } if (pool) break; }
  if (!pool) { toast('Could not open the pack', 'The set\'s cards could not be loaded. Your pack is kept; try again or choose another set.'); return null; }
  const cards = packFromPool(pool); { const have = collState().cards; for (const x of cards) x.isNew = !have[x.set + '#' + x.cn]; }
  const q = packState(); q.bank = Math.max(0, q.bank - 1); q.opened++; q.lastSet = setCode || 'random'; packSave(q);
  collAdd(cards);
  return { set: pool.code, setName: pool.name, cards };
}
