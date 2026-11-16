'use strict';
/* MTG Playtester - offline solo goldfish tester.
   Card data comes from a Scryfall bulk file the user loads once; everything stays in the browser. */
(function () {

// ---------------------------------------------------------------- helpers
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    e.append(kid);
  }
  return e;
}

function rnd(n) {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return Math.floor(a[0] / 4294967296 * n);
}
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const norm = s => String(s).toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();

const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode etc. */ } };

// IndexedDB holds the (large) card list
let idbOk = true;
function idb() {
  return new Promise((res, rej) => {
    if (!window.indexedDB) return rej(new Error('no indexedDB'));
    const r = indexedDB.open('mtgpt', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet(key) {
  try {
    const db = await idb();
    return await new Promise((res, rej) => {
      const q = db.transaction('kv').objectStore('kv').get(key);
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    });
  } catch (e) { idbOk = false; return undefined; }
}
async function idbSet(key, val) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(val, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

// ---------------------------------------------------------------- card data
let CARDS = new Map();      // normalized name -> compact card
let cardCount = 0;

const SKIP_LAYOUTS = new Set(['token', 'double_faced_token', 'emblem', 'art_series', 'vanguard', 'scheme', 'planar', 'augment', 'host']);

function compact(o) {
  const faces = o.card_faces && o.card_faces.length ? o.card_faces : null;
  const text = o.oracle_text != null ? o.oracle_text : (faces ? faces.map(f => f.oracle_text || '').join('\n//\n') : '');
  const mana = o.mana_cost != null && o.mana_cost !== '' ? o.mana_cost : (faces ? faces.map(f => f.mana_cost || '').filter(Boolean).join(' // ') : '');
  const type = o.type_line || (faces ? faces.map(f => f.type_line || '').join(' // ') : '');
  const front = type.split(' // ')[0];
  const colors = o.colors || (faces && faces[0].colors) || [];
  const pow = o.power != null ? o.power : (faces && faces[0].power);
  const tou = o.toughness != null ? o.toughness : (faces && faces[0].toughness);
  const c = { name: o.name, mc: mana, cmc: o.cmc || 0, t: type, tx: text, col: colors, land: /\bLand\b/.test(front) };
  if (pow != null && tou != null) c.pt = pow + '/' + tou;
  if (o.loyalty) c.pt = 'Loyalty ' + o.loyalty;
  if (o.legalities && o.legalities.modern === 'legal') c.mod = 1;   // used by the coverage scan to focus on cards people play
  if (o.legalities) { const L = { standard: 's', pioneer: 'p', modern: 'm', legacy: 'l', vintage: 'v', pauper: 'u', commander: 'c' }; let lg = ''; for (const [k, ch] of Object.entries(L)) { const v = o.legalities[k]; if (v === 'legal' || (k === 'vintage' && v === 'restricted')) lg += ch; } if (lg) c.lg = lg; }   // format legality letters (v0.63) for the per-format scan
  if (faces) c.faces = faces.map(f => f.name);
  if (o.produced_mana && o.produced_mana.length) c.prod = o.produced_mana;
  return c;
}

function buildIndex(list) {
  const m = new Map();
  for (const c of list) {
    m.set(norm(c.name), c);
    if (c.faces) for (const f of c.faces) { const k = norm(f); if (!m.has(k)) m.set(k, c); }
  }
  return m;
}

function installCards(list) {
  CARDS = buildIndex(list);
  cardCount = list.length;
  updateDbStatus();
}

function updateDbStatus(msg) {
  const el = $('#dbStatus');
  el.dataset.state = (cardCount || META.size) ? 'ok' : 'warn';
  if (msg) { el.textContent = msg; return; }
  if (cardCount) el.textContent = `Card data: ${cardCount.toLocaleString()} cards`;
  else if (META.size) el.textContent = `Card data: ${deckMetaCount().toLocaleString()} deck cards (from Scryfall lookups)`;
  else el.textContent = 'No card data loaded (names only)';
  el.title = cardCount ? 'Full Scryfall Oracle data is loaded.' : META.size ? 'Rules text and types were saved when the card images were downloaded. Load the full Oracle file in Card data… to cover every card.' : 'Open Tools → Card data… to download card data, or Images… to fetch images for this deck.';
}

async function importCardData(file) {
  try {
    updateDbStatus('Reading file… (large files take a moment)');
    let text;
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    if (head[0] === 0x1f && head[1] === 0x8b && typeof DecompressionStream !== 'undefined') {   // gzip-compressed copy
      text = await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).text();
    } else if (head[0] === 0x50 && head[1] === 0x4b) {
      alert('That is a .zip file. Extract it first, or use the "Download from Scryfall" button instead.'); updateDbStatus(); return;
    } else text = await file.text();
    updateDbStatus('Parsing…');
    await new Promise(r => setTimeout(r, 30));
    let raw;
    try { raw = JSON.parse(text.replace(/^\uFEFF/, '')); } catch (e) {
      alert('That file is not valid JSON (it starts with: "' + text.slice(0, 40).replace(/\s+/g, ' ') + '"). Try the "Download from Scryfall" button instead.'); updateDbStatus(); return;
    }
    if (!Array.isArray(raw)) { alert('Unexpected format. Use the "Oracle Cards" bulk file from Scryfall.'); updateDbStatus(); return; }
    updateDbStatus('Indexing cards…');
    await new Promise(r => setTimeout(r, 30));
    const out = []; const seen = new Set();
    for (const o of raw) {
      if (!o || !o.name) continue;
      if (SKIP_LAYOUTS.has(o.layout)) continue;
      const k = norm(o.name);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(compact(o));
    }
    if (!out.length) { alert('No cards found in that file.'); updateDbStatus(); return; }
    installCards(out);
    let saved = true;
    try { await idbSet('cards', out); } catch (e) { saved = false; }
    updateDbStatus();
    if (!saved) alert('Cards loaded, but your browser would not save them. You will need to load the file again next time.');
    render();
    prepareImages();
  } catch (e) {
    console.error(e);
    alert('Could not load card data: ' + e.message);
    updateDbStatus();
  }
}

const META = new Map();   // card data picked up from Scryfall lookups (used when no bulk file is loaded)
try { const m = JSON.parse(localStorage.getItem('mtgpt.meta') || '{}'); for (const k in m) META.set(k, m[k]); } catch (e) { /* ignore */ }
function saveMeta() { try { localStorage.setItem('mtgpt.meta', JSON.stringify(Object.fromEntries(META))); } catch (e) { /* ignore */ } }
function setMeta(card, asked) {
  const c = compact(card);
  for (const k of [norm(card.name), asked && norm(asked), ...(c.faces || []).map(norm)]) if (k) META.set(k, c);
  if (!cardCount) updateDbStatus();
}
function deckMetaCount() { return new Set([...META.values()].map(c => c.name)).size; }
function cardInfo(name) { const k = norm(name); return CARDS.get(k) || META.get(k) || null; }

function resolve(name) {
  let k = norm(name);
  let c = CARDS.get(k) || META.get(k);
  if (!c && k.includes('/')) { const k2 = norm(k.replace(/\s*\/+\s*/, ' // ')); c = CARDS.get(k2) || META.get(k2); }
  return c || null;
}
function cardText(c) { if (c && c.token) return (c.tk && c.tk.tx) || ''; const i = c && cardInfo(c.name); const b = i && i.tx ? i.tx : ''; return c && c.gained && c.gained.length ? b + '\n' + c.gained.join('\n') : b; }
function isSpellCard(c) {
  const i = c && cardInfo(c.name);
  // Every known nonland card is cast as a spell; lands are played directly.
  return !!(i && !i.land && i.t);
}
function isPermanentCard(c) {
  const i = c && cardInfo(c.name);
  if (!i || !i.t) return false;
  return /\b(Creature|Artifact|Enchantment|Planeswalker|Battle)\b/.test((i.t || '').split(' // ')[0]);
}
function usesDomain(c) {
  const tx = cardText(c);
  return /\bdomain\b|basic land types among lands you control|number of basic land types/i.test(tx);
}
function isMainPhase() {
  return !!state && state.phase === 'play' && (state.step === MAIN1 || state.step === MAIN2);
}
function canPlaySorcerySpeedNow() {
  return isMainPhase() && state.stack.length === 0 && !state.phasePause && !state.discarding;
}
// Land drops (v0.63): one per turn, plus every "You may play an additional land" / "two additional lands" on your permanents
// (rule 305.2: the extra plays are cumulative and are only an allowance, never forced).
function landDropsAllowed() {
  let n = 1;
  for (const c of state.battlefield) {
    const tx = cardText(c) || ''; if (!tx) continue;
    for (const m of tx.matchAll(/you may play (an|one|two|three|\d+) additional lands? (?:on each of your turns|this turn)/gi)) n += wnum(m[1]) || 1;
  }
  return n + (state.extraLandDrops || 0);
}
function landDropUsed() { return !!state.landPlayedThisTurn && (state.landsPlayed || 0) >= landDropsAllowed(); }
function canPlayLandNow() {
  return canPlaySorcerySpeedNow() && !landDropUsed();
}
function canCastNow(c) {
  if (!state || state.phase !== 'play' || state.phasePause || state.discarding) return false;
  // No player receives priority during untap or the normal cleanup step.
  if (state.step === 0 || state.step === CLEANUP) return false;
  if (state.stack.length) return isInstantSpeed(c);
  return isInstantSpeed(c) || canPlaySorcerySpeedNow();
}
// ---- keywords that change what you may do (v0.27)
// A keyword counts when it sits in a keyword list line ("Flying, haste") or is granted by a permanent you control
// ("Each creature you control has vigilance if it's white"). Mentions inside rules text ("gains haste") are ignored.
function kwLine(text, kw) {
  const clean = String(text || '').replace(/\([^)]*\)/g, '');
  for (const line of clean.split('\n')) {
    const l = line.trim();
    if (!l || /[.:;]/.test(l)) continue;
    if (l.split(/,\s*|\s+and\s+/).some(p => p.trim().toLowerCase() === kw)) return true;
  }
  return false;
}
// ---- static ability engine (v0.34) -------------------------------------------------------------------------
// Every permanent's rules text is parsed once into effects; each effect has a SUBJECT matcher ("each nonland permanent
// you control", "other Dragons you control", "white creatures you control", ...). Colours, keyword grants and
// power/toughness all go through the same matcher, so a static ability affects every permanent it applies to,
// not just the cards it was first tested with.
const COLOR_LETTER = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
const COLOR_NAME = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' };
const SUBJECT_TYPES = ['creature', 'permanent', 'artifact', 'enchantment', 'land', 'planeswalker', 'battle'];
function singularWord(w) { w = w.toLowerCase(); if (/(?:us|is)$/.test(w)) return w; if (w === 'elves') return 'elf'; if (/ves$/.test(w)) return w.replace(/ves$/, 'f'); if (/ies$/.test(w)) return w.replace(/ies$/, 'y'); if (/s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1); return w; }
function printedColors(c) { const i = c && !c.token ? cardInfo(c.name) : null; return (i && i.col) || []; }
function permTypeInfo(c) {   // lowercase type words and subtypes of a permanent
  if (c.token) return { types: new Set(c.tk && c.tk.types ? [...c.tk.types.map(x => x.toLowerCase()), 'permanent'] : c.tk && c.tk.pt ? ['creature', 'permanent'] : ['artifact', 'permanent']), subs: new Set([...((c.tk && c.tk.subs) || []), ...(c.addSubs || [])]), legendary: !!(c.tk && c.tk.legendary), basic: false, changeling: false };
  const t = frontType(c), parts = t.split('—');
  const types = new Set(); for (const w of (parts[0] || '').split(/\s+/)) if (w) types.add(w.toLowerCase());
  types.add('permanent');
  const subs = new Set(); for (const w of (parts[1] || '').split(/\s+/)) if (w) subs.add(w.toLowerCase());
  for (const w of (c.addSubs || [])) subs.add(w);
  return { types, subs, legendary: types.has('legendary'), basic: types.has('basic'), changeling: kwLine(cardText(c), 'changeling') };
}
let inColorEval = false;
function onBattlefield(c) { return !!state && state.battlefield.some(x => x.id === c.id); }
// Turn a phrase like "each other white creature you control" into a test function; null if it cannot be understood.
function parseSubject(raw, g) {
  let s = String(raw).toLowerCase().replace(/[’]/g, "'").replace(/\.$/, '').trim();
  const nm = g.name.split(' // ')[0].toLowerCase();
  if (s === nm || s === '~' || s === 'this creature' || s === 'this permanent') return { self: true, test: c => c.id === g.id };
  if (/opponent/.test(s) || /\b(that|with|target|enchanted|equipped|attached|named|who|whose|which|dealt|not)\b/.test(s)) return null;
  const mine = /\byou control\b/.test(s), general = /^(each|all|every)\b/.test(s) || /^other\b/.test(s);
  if (!mine && !general && !/^(creatures|lands|artifacts|enchantments|permanents|planeswalkers)\b/.test(s)) return null;
  s = s.replace(/^(each|all|every)\s+/, '').replace(/\s+you control$/, '').replace(/^(?:a|an)\s+/, '');
  let other = false; if (/^other\s+/.test(s)) { other = true; s = s.replace(/^other\s+/, ''); }
  const conds = []; let noun = null, sub = null;
  for (const w of s.split(/\s+/)) {
    if (!w) continue;
    if (COLOR_LETTER[w]) { conds.push(c => effColors(c).includes(COLOR_LETTER[w])); continue; }
    let m;
    if ((m = w.match(/^non(white|blue|black|red|green)$/))) { conds.push(c => !effColors(c).includes(COLOR_LETTER[m[1]])); continue; }
    if (w === 'multicolored') { conds.push(c => effColors(c).length > 1); continue; }
    if (w === 'monocolored') { conds.push(c => effColors(c).length === 1); continue; }
    if (w === 'colorless') { conds.push(c => effColors(c).length === 0); continue; }
    if ((m = w.match(/^non(land|creature|artifact|enchantment|basic|token|legendary)$/))) { const k = m[1]; conds.push(c => k === 'token' ? !c.token : k === 'basic' ? !permTypeInfo(c).basic : k === 'legendary' ? !permTypeInfo(c).legendary : !permTypeInfo(c).types.has(k)); continue; }
    if (w === 'legendary') { conds.push(c => permTypeInfo(c).legendary); continue; }
    if (w === 'basic') { conds.push(c => permTypeInfo(c).basic); continue; }
    if (w === 'tapped') { conds.push(c => !!c.tapped); continue; }
    if (w === 'untapped') { conds.push(c => !c.tapped); continue; }
    if (w === 'attacking') { conds.push(c => !!(state && state.combat && state.combat.attackers && state.combat.attackers.some(a => (a.id ?? a) === c.id))); continue; }
    const sg = singularWord(w);
    if (SUBJECT_TYPES.includes(sg)) { if (noun) conds.push(c => permTypeInfo(c).types.has(noun)); noun = sg; continue; }
    if (sub) return null;
    sub = sg;
  }
  if (noun) conds.push(c => permTypeInfo(c).types.has(noun));
  if (sub) conds.push(c => { const p = permTypeInfo(c); return p.subs.has(sub) || (p.changeling && p.types.has('creature')); });
  if (!noun && !sub && !conds.length) return null;
  return { self: false, test: c => !(other && c.id === g.id) && conds.every(f => f(c)) };
}
// Parse the rules text of every permanent on the battlefield into effect records (cached by battlefield contents).
let _stx = { sig: '', list: [] };
function parseStaticCard(g) {
  const list = [];
  {
    if (g.token) return list;
    const info = cardInfo(g.name); if (!info || !info.tx) return list;
    const nm = g.name.split(' // ')[0];
    const tx = info.tx.replace(/,\n/g, ', ').replace(/’/g, "'").replace(selfNameRe(nm.replace(/’/g, "'")), '~').replace(/\([^)]*\)/g, '');
    for (const raw of tx.split('\n')) {
      { const l0 = raw.trim().replace(/\.$/, ''), hadD = /^delirium\s*[\u2014-]/i.test(l0), l1 = l0.replace(/^delirium\s*[\u2014-]\s*/i, ''), dm = l1.match(/^(?:as long as there are (\w+) or more card types among cards in your graveyard,\s*)?~\s+(.+)$/i);
        if (dm && !dm[1] && !hadD) { /* not a delirium line */ } else
        if (dm) {
          const n = dm[1] ? numw(dm[1]) : 4; let p = 0, t = 0; const kws = [], other = [];
          for (const part of dm[2].split(/,\s*(?:and\s+)?|\s+and\s+(?=has|have|gets?|attacks)/i)) {
            const x = part.trim(); let q; if (!x) continue;
            if ((q = x.match(/^gets? ([+-]\d+)\/([+-]\d+)$/i))) { p += +q[1]; t += +q[2]; }
            else if ((q = x.match(/^(?:has|have) (.+)$/i))) { for (const k of q[1].toLowerCase().split(/\s+and\s+/)) { if (GRANTABLE.includes(k.trim())) kws.push(k.trim()); else other.push(k.trim()); } }
            else other.push(x);
          }
          list.push({ line: l0, kind: 'cond', g, cond: 'delirium', n, p, t, kws, other }); continue;
        } }
      { const cm = raw.trim().replace(/\.$/, '').match(/^~ gets ([+-]\d+)\/([+-]\d+) as long as you control an? ([A-Za-z]+)$/i);   // Wild Nacatl-style (v0.63)
        if (cm) { list.push({ line: raw.trim().replace(/\.$/, ''), kind: 'cond', g, cond: 'ctrl', need: cm[3], n: 0, p: +cm[1], t: +cm[2], kws: [], other: [] }); continue; } }
      { const l = raw.trim().replace(/\.$/, '').replace(/,?\s*"[^"]*"/g, '').trim(), am = l.match(/^(equipped|enchanted) (creature|permanent|land|artifact)(?: you control)? (.+)$/i);   // attachment bonuses (v0.64)
        if (am) {
          const subj = { self: false, attach: true, test: c => g.att === c.id };
          for (const part of am[3].split(/\s+and\s+(?=gets?\b|has\b|have\b)/i)) {
            const x = part.trim(); let q;
            if ((q = x.match(/^gets? ([+-]\d+)\/([+-]\d+)(?: for each (.+))?$/i))) { const per = q[3]; list.push({ line: l, kind: 'pt', g, subj, p: +q[1], t: +q[2], perFn: per ? () => countEachMulti(per) : null, perText: per || '' }); }
            else if ((q = x.match(/^can't (attack(?: or block)?|block)$/i))) { list.push({ line: l, kind: 'cant', g, subj, attack: /attack/i.test(q[1]), block: /block/i.test(q[1]) }); }
            else if ((q = x.match(/^(?:has|have) (.+)$/i))) { const kws = q[1].toLowerCase().split(/\s*(?:,|\band\b)\s*/).map(k => k.trim()).filter(k => GRANTABLE.includes(k)); if (kws.length) list.push({ line: l, kind: 'kw', g, subj, items: [{ kws, cond: null }] }); }
          }
          continue;
        } }
      const line = raw.trim().replace(/\.$/, ''); if (!line || /"/.test(line) || /^(as long as|if|when|whenever|at |until)/i.test(line) || /\bas long as\b|\buntil\b/i.test(line)) continue;
      let m;
      // colour: "Each nonland permanent you control is all colors."
      if ((m = line.match(/^(.+?) (?:is|are) (all colors|every color|all five colors|colorless|(?:white|blue|black|red|green)(?:(?:,| and| or)\s*(?:white|blue|black|red|green))*)( in addition to (?:its|their|that creature's) other colors)?$/i))) {
        const subj = parseSubject(m[1].replace(/^~$/, nm), g);
        if (subj) { const w = m[2].toLowerCase(); const cols = /all |every/.test(w) ? ['W', 'U', 'B', 'R', 'G'] : /colorless/.test(w) ? [] : (w.match(/white|blue|black|red|green/g) || []).map(x => COLOR_LETTER[x]); list.push({ line, kind: 'color', g, subj, cols, add: !!m[3] || /all |every/.test(w) }); continue; }
      }
      // keyword grants: "Each creature you control has vigilance if it's white, hexproof if it's blue, ..."
      if ((m = line.match(/^(.+?) (?:has|have) (.+)$/i)) && !/\b(counter|target|can't|cannot|may|and (?:it|they) (?:has|have))\b/i.test(m[2])) {
        const subj = parseSubject(m[1], g);
        if (subj && !subj.self) {
          const items = [];
          for (const it of m[2].split(/,\s*(?:and\s+)?/)) {
            const im = it.trim().match(/^(.+?)(?: if it['’]s (.+))?$/i); if (!im) continue;
            const kws = im[1].toLowerCase().split(/\s+and\s+/).map(x => x.trim()).filter(k => GRANTABLE.includes(k));
            if (kws.length) items.push({ kws, cond: im[2] ? im[2].trim().toLowerCase() : null });
          }
          if (items.length) { list.push({ line, kind: 'kw', g, subj, items }); continue; }
        }
      }
      // power / toughness: "Other Dragons you control get +1/+1."
      if ((m = line.match(/^(.+?) gets? ([+-]\d+)\/([+-]\d+)$/i))) {
        const subj = parseSubject(m[1], g);
        if (subj && !subj.self) { list.push({ line, kind: 'pt', g, subj, p: +m[2], t: +m[3] }); continue; }
      }
    }
  }
  return list;
}
function statics() {
  if (!state) return [];
  const sig = state.battlefield.map(c => c.id + ':' + c.name + ':' + (c.att || '')).join('|');
  if (_stx.sig === sig) return _stx.list;
  const list = [];
  for (const g of state.battlefield) list.push(...parseStaticCard(g));
  _stx = { sig, list };
  return list;
}
function condHolds(cond, c) {
  if (!cond) return true;
  const cols = effColors(c); let m;
  if ((m = cond.match(/^(white|blue|black|red|green)$/))) return cols.includes(COLOR_LETTER[m[1]]);
  if (cond === 'multicolored') return cols.length > 1;
  if (cond === 'monocolored') return cols.length === 1;
  if (cond === 'colorless') return cols.length === 0;
  if ((m = cond.match(/^(?:an?\s+)?([a-z]+)$/))) { const p = permTypeInfo(c), sg = singularWord(m[1]); return p.subs.has(sg) || p.types.has(sg) || (p.changeling && p.types.has('creature')); }
  return false;
}
function colorEffectsFor(c) {   // [{g, cols, add}] of colour effects that currently apply to c
  if (!state || inColorEval || !onBattlefield(c)) return [];
  inColorEval = true;
  try { return statics().filter(e => e.kind === 'color' && e.subj.test(c)); } finally { inColorEval = false; }
}
function effColors(c) {
  const base = printedColors(c);
  const fx = colorEffectsFor(c);
  if (!fx.length) return base;
  let cols = new Set(base);
  for (const e of fx) { if (!e.add) cols = new Set(); for (const x of e.cols) cols.add(x); }
  return ['W', 'U', 'B', 'R', 'G'].filter(x => cols.has(x));
}
// Which permanent (if any) grants `kw` to creature c through a static ability such as
// "Each creature you control has vigilance if it's white." Conditions use the creature's CURRENT colours and types.
function deliriumCount() { return cardTypesInGraveyard().size; }
function usesDelirium(c) { return !!c && !c.token && /\bdelirium\b|card types among cards in your graveyard/i.test(cardText(c)); }
function condHolds2(e) {
  if (e.cond === 'ctrl') { const w = e.need.toLowerCase(); return state.battlefield.some(c => { const p = permTypeInfo(c); return p.types.has(w) || p.subs.has(w) || [...p.subs].some(x => x.toLowerCase() === w); }); }
  return deliriumCount() >= (e.n || 4);
}
function kwGrant(c, kw) {
  if (!state || !c || permZone(c) !== 'creatures' || !onBattlefield(c)) return null;
  for (const e of statics()) if (e.kind === 'cond' && e.g.id === c.id && e.kws.includes(kw) && condHolds2(e)) return 'its delirium ability';
  for (const e of statics()) {
    if (e.kind !== 'kw' || !e.subj.test(c)) continue;
    for (const it of e.items) if (it.kws.includes(kw) && condHolds(it.cond, c)) return e.g.name;
  }
  return null;
}
function hasKw(c, kw) {
  if (!c) return false;
  if (state && state.fx && state.fx.some(e => e.kind === 'kw' && e.targetId === c.id && e.kw === kw)) return true;   // "gains haste until end of turn"
  if (kw === 'haste' && c.suspHaste && state && state.battlefield.includes(c)) return true;   // cast from suspend
  if (kwLine(cardText(c), kw)) return true;
  return !!kwGrant(c, kw);
}
const GRANTABLE = ['flying', 'first strike', 'double strike', 'deathtouch', 'haste', 'hexproof', 'indestructible', 'lifelink', 'menace', 'reach', 'trample', 'vigilance', 'defender'];
// Keywords a creature has only because of other permanents' static abilities (shown in the preview).
function grantedKeywords(c) {
  const out = [];
  if (!state || !c || c.tapped === undefined && !c.id) return out;
  for (const kw of GRANTABLE) {
    if (kwLine(cardText(c), kw)) continue;
    let from = kwGrant(c, kw);
    if (!from) { const fe = fxOn(c, 'kw').find(e => e.kw === kw); if (fe) from = `${fe.srcName && fe.srcName !== 'manual' ? fe.srcName : 'an effect'}, ${UNTIL_WORDS[fe.until]}`; }
    if (from) out.push({ kw, from });
  }
  return out;
}
function staticNote(c) {
  if (!state || !c || !state.battlefield.some(x => x.id === c.id)) return null;
  const rows = [];
  { const fx = colorEffectsFor(c); if (fx.length) { const cols = effColors(c); rows.push(h('div', { text: `Colours: ${cols.length === 5 ? 'all five' : cols.length ? cols.map(x => COLOR_NAME[x]).join(', ') : 'colourless'} (from ${[...new Set(fx.map(e => e.g.name))].join(', ')}).` })); } }
  const g = grantedKeywords(c), by = new Map();
  for (const x of g) by.set(x.from, [...(by.get(x.from) || []), x.kw]);
  for (const [from, kws] of by) rows.push(h('div', { text: `Gains ${kws.join(', ')} (from ${from}).` }));
  for (const e of fxOn(c)) { if (e.kind === 'kw') continue; rows.push(h('div', { text: e.kind === 'delayed' ? `Waiting: ${e.text} ${fxEnds(e)}${e.srcName ? ' (from ' + e.srcName + ')' : ''}.` : `${e.kind === 'pt' ? sgnN(e.p) + '/' + sgnN(e.t) : e.text} ${UNTIL_WORDS[e.until] || ''}${e.srcName && e.srcName !== 'manual' ? ' (from ' + e.srcName + ')' : ''}.` })); }
  for (const e of statics()) if (e.kind === 'cond' && e.g.id === c.id) {
    if (e.cond === 'ctrl') { const on = condHolds2(e); rows.push(h('div', { text: `${e.line}: ${on ? 'ACTIVE' : 'not active'} (you ${on ? 'do' : 'do not'} control a ${e.need}).` })); continue; }
    const n = deliriumCount(), on = n >= e.n, eff = [(e.p || e.t) ? `${e.p >= 0 ? '+' : ''}${e.p}/${e.t >= 0 ? '+' : ''}${e.t}` : '', ...e.kws, ...e.other].filter(Boolean).join(', ');
    rows.push(h('div', { text: `Delirium ${on ? 'ACTIVE' : 'not active'}: ${n} of ${e.n} card types in your graveyard. While active: ${eff}.${e.other.length ? ' (“' + e.other.join('; ') + '” is not enforced by the app.)' : ''}` }));
  }
  const pr = ptNoteRow(c); if (pr) rows.push(pr);
  return rows.length ? h('div', { class: 'staticnote' }, h('div', { class: 'kwlabel', text: 'Static abilities affecting this card' }), ...rows) : null;
}
function isInstantSpeed(c) {
  const i = c && cardInfo(c.name); if (!i || i.land) return false;
  const t=(i.t||'').split(' // ')[0];
  return /\bInstant\b/.test(t) || kwLine(i.tx, 'flash');
}
// Summoning sickness: a creature that has not been under your control since your most recent turn began
// cannot attack or use {T} abilities, unless it has haste. (Goldfish: only your own turns exist.)
const SICK_TEXT = "Summoning Sickness - this creature can't attack or activate its abilities";
function isSick(c) {
  if (!state || !c || permZone(c) !== 'creatures') return false;
  if (!c.token && !cardInfo(c.name)) return false;
  if (c.sickManual === 'off') return false;
  if (c.sickManual === 'on') return true;
  if (c.enteredTurn !== state.turn) return false;
  return !hasKw(c, 'haste');
}
// ---- dynamic power / toughness (v0.30)
// Order used: printed values, or a characteristic-defining ability ("power is equal to the number of ...") for "*" values,
// then +1/+1 and -1/-1 counters, then anthems from other permanents ("Creatures you control get +1/+1").
const CARD_TYPE_WORDS = ['Artifact', 'Battle', 'Creature', 'Enchantment', 'Instant', 'Land', 'Planeswalker', 'Sorcery', 'Kindred', 'Tribal'];
function graveyardTypes() {
  const out = new Set();
  if (!state) return [];
  for (const c of state.graveyard) {
    if (c.token) continue;
    const i = cardInfo(c.name); if (!i || !i.t) continue;
    const front = i.t.split(' // ')[0].split('—')[0];
    for (const t of CARD_TYPE_WORDS) if (new RegExp('\\b' + t + '\\b').test(front)) out.add(t === 'Tribal' ? 'Kindred' : t);
  }
  return [...out].sort();
}
function countExpr(expr) {
  if (!state) return null;
  expr = String(expr).trim().replace(/\.$/, '').replace(/^(?:the )?number of\s+/i, '');
  let m;
  if (/basic land types? among lands you control/i.test(expr)) { const l = domainTypeList(); return { n: l.length, why: `${l.length} basic land type${l.length === 1 ? '' : 's'} among your lands${l.length ? ' (' + l.join(', ') + ')' : ''}` }; }
  if (/card types? among cards in (?:all graveyards|your graveyard)/i.test(expr)) { const l = graveyardTypes(); return { n: l.length, why: `${l.length} card type${l.length === 1 ? '' : 's'} in graveyards${l.length ? ' (' + l.join(', ') + ')' : ''}` }; }
  if (/^cards? (?:you own )?in exile$|^cards? in exile that you own$/i.test(expr) || /^cards? you own in exile$/i.test(expr)) { const n = state.exile.length; return { n, why: `${n} card${n === 1 ? '' : 's'} you own in exile` }; }
  if ((m = expr.match(/^(creature|land|artifact|enchantment|planeswalker|instant|sorcery) cards? in (your|all) graveyards?$/i))) {
    const t = m[1].toLowerCase(), n = state.graveyard.filter(x => !x.token && new RegExp('\\b' + t + '\\b', 'i').test(frontType(x))).length;
    return { n, why: `${n} ${t} card${n === 1 ? '' : 's'} in your graveyard` };
  }
  if (/^cards? in your hand$/i.test(expr)) return { n: state.hand.length, why: `${state.hand.length} cards in your hand` };
  if (/^cards? in your graveyard$/i.test(expr)) return { n: state.graveyard.length, why: `${state.graveyard.length} cards in your graveyard` };
  if (/^cards? in your library$/i.test(expr)) return { n: state.library.length, why: `${state.library.length} cards in your library` };
  if (/^your life total$|^life you have$/i.test(expr)) return { n: Math.max(0, state.life), why: `your life total (${state.life})` };
  // "<subject> you control": creatures, lands, Elves, other artifacts, legendary creatures, ...
  if (/\byou control\b/i.test(expr)) {
    const subj = parseSubject(expr, { id: -1, name: '' });
    if (subj) { const n = state.battlefield.filter(x => subj.test(x)).length; return { n, why: `${n} ${expr.replace(/\s+you control$/i, '')} you control` }; }
  }
  return null;
}
function cdaValues(c) {
  const i = cardInfo(c.name); if (!i || !i.tx) return null;
  const tx = i.tx.replace(new RegExp(i.name.split(' // ')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '~').replace(/’/g, "'");
  let m;
  if ((m = tx.match(/power and toughness are each equal to (?:the )?(.+?)(?:\.|$)/im))) { const pm = m[1].match(/^(.+?) (plus|minus) (\d+)$/i); const r = countExpr(pm ? pm[1] : m[1]); const k = pm ? (/plus/i.test(pm[2]) ? 1 : -1) * +pm[3] : 0; return r && { p: r.n + k, t: r.n + k, why: [r.why + (k ? ` ${k > 0 ? 'plus' : 'minus'} ${Math.abs(k)}` : '')] }; }
  if ((m = tx.match(/power is equal to (?:the )?(.+?) and its toughness is equal to (?:the )?(.+?)(?:\.|$)/im))) {
    const rp = countExpr(m[1]); if (!rp) return null;
    const tm = m[2].match(/^that number(?: plus (\d+))?$/i);
    const rt = tm ? { n: rp.n + (tm[1] ? +tm[1] : 0) } : countExpr(m[2]);
    return rt && { p: rp.n, t: rt.n, why: [rp.why + (tm && tm[1] ? `; toughness is that number plus ${tm[1]}` : '')] };
  }
  if ((m = tx.match(/power is equal to (?:the )?(.+?)(?:\.|$)/im))) { const r = countExpr(m[1]); return r && { p: r.n, why: [r.why] }; }
  if ((m = tx.match(/toughness is equal to (?:the )?(.+?)(?:\.|$)/im))) { const r = countExpr(m[1]); return r && { t: r.n, why: [r.why] }; }
  return null;
}
function ptCalc(c) {
  const pt = c.token ? (c.tk && c.tk.pt) : (cardInfo(c.name) || {}).pt;
  const parts = String(pt || '').split('/');
  const out = { p: 0, t: 0, unknown: false, dynamic: false, modified: false, why: [] };
  const sides = [parts[0], parts[1]];
  let cda = null;
  if (sides.some(x => x && /\*/.test(x))) cda = cdaValues(c);
  ['p', 't'].forEach((k, ix) => {
    const raw = sides[ix];
    if (raw && /\*/.test(raw)) {
      if (cda && cda[k] !== undefined) { out[k] = cda[k]; out.dynamic = true; }
      else { out[k] = 0; out.unknown = true; }
    } else { const n = parseInt(raw, 10); out[k] = isNaN(n) ? 0 : n; }
  });
  { const bp = parseInt(sides[0], 10), bt = parseInt(sides[1], 10); out.bp = isNaN(bp) || /\*/.test(sides[0] || '') ? null : bp; out.bt = isNaN(bt) || /\*/.test(sides[1] || '') ? null : bt; }
  if (cda && out.dynamic) out.why.push(...cda.why);
  if (out.unknown) out.why.push('Power/toughness depends on something the app cannot read; shown as 0. Adjust with counters if needed.');
  const cc = typeof c.counters === 'number' ? { plus: c.counters, minus: 0 } : (c.counters || {});
  const net = (cc.plus || 0) - (cc.minus || 0);
  if (state) for (const e of fxOn(c, 'pt')) { out.p += e.p; out.t += e.t; out.modified = true; out.why.push(`${sgnN(e.p)}/${sgnN(e.t)} ${UNTIL_WORDS[e.until] || ''}${e.srcName && e.srcName !== 'manual' ? ' (' + e.srcName + ')' : ''}`); }
  if (net) { out.p += net; out.t += net; out.modified = true; out.why.push(`${net > 0 ? '+' : ''}${net}/${net > 0 ? '+' : ''}${net} from counters`); }
  if (state && onBattlefield(c)) for (const e of statics()) {
    if (e.kind !== 'pt' || !e.subj.test(c)) continue;
    const mul = e.perFn ? e.perFn() : 1, ep = e.p * mul, et = e.t * mul;
    out.p += ep; out.t += et; out.modified = true; out.why.push(`${ep >= 0 ? '+' : ''}${ep}/${et >= 0 ? '+' : ''}${et} from ${e.g.name}${e.perFn ? ' (' + mul + ' × ' + (e.p >= 0 ? '+' : '') + e.p + '/' + (e.t >= 0 ? '+' : '') + e.t + ' for each ' + e.perText + ')' : ''}`);
  }
  if (state && onBattlefield(c)) for (const e of statics()) {
    if (e.kind !== 'cond' || e.g.id !== c.id || !(e.p || e.t) || !condHolds2(e)) continue;
    out.p += e.p; out.t += e.t; out.modified = true; out.why.push(`${e.p >= 0 ? '+' : ''}${e.p}/${e.t >= 0 ? '+' : ''}${e.t} from ${e.cond === 'ctrl' ? 'controlling a ' + e.need : 'delirium (' + deliriumCount() + ' card types in your graveyard)'}`);
  }
  return out;
}
function powerOf(c) { const r = ptCalc(c); return { n: Math.max(0, r.p), star: r.unknown }; }
function ptText(c) { const r = ptCalc(c); return `${r.p}/${r.t}${r.unknown ? '?' : ''}`; }
// ---------------------------------------------------------------- effect durations and delayed effects (v0.49)
// Everything that lasts for a while lives in ONE ledger, state.fx, so the app always knows what is active, on what,
// and when it ends:
//   pt        {targetId,p,t}         "gets +2/+2 until end of turn"
//   kw        {targetId,kw}          "gains flying until your next turn"
//   note      {text,[targetId]}      anything else that lasts ("can't block this turn") - a reminder with a timer
//   delayed   {when,action,...}      "at the beginning of the next end step, exile it" / "at your next upkeep, draw a card"
//   exileUntil{cardId,srcId}         "exile target permanent until ~ leaves the battlefield"
// until: 'eot' (cleanup step), 'yourNextTurn' (your next untap step), 'srcLeaves' (the source leaves), 'manual'.
const sgnN = n => (n >= 0 ? '+' : '') + n;
const UNTIL_WORDS = { eot: 'until end of turn', yourNextTurn: 'until your next turn', srcLeaves: 'while the source stays on the battlefield', manual: 'until you remove it' };
const DUR_RE = /\b(?:until end of turn|until your next turn|this turn)\b/i;
const durKey = t => (/until your next turn/i.test(t) ? 'yourNextTurn' : 'eot');
const stepIndex = id => STEPS.findIndex(s => s.id === id);
function addFx(o) {
  if (!state) return null;
  state.fx = state.fx || [];
  const e = Object.assign({ id: state.nextId++, turn: state.turn, step: state.step }, o.kind === 'delayed' || o.kind === 'exileUntil' ? {} : { until: 'eot' }, o);
  if (e.targetId && !e.targetName) { const f = findCard(e.targetId); if (f) e.targetName = f.card.name; }
  state.fx.push(e); return e;
}
function fxOn(c, kind) { return state && state.fx && c ? state.fx.filter(e => e.targetId === c.id && (!kind || e.kind === kind)) : []; }
function fxTargetName(e) { return e.targetName || (() => { const f = e.targetId ? findCard(e.targetId) : null; return f ? f.card.name : 'a permanent'; })(); }
function fxLabel(e) {
  switch (e.kind) {
    case 'pt': return `${fxTargetName(e)} gets ${sgnN(e.p)}/${sgnN(e.t)}`;
    case 'kw': return `${fxTargetName(e)} has ${e.kw}`;
    case 'delayed': return `${e.when === 'end' ? 'At the next end step' : 'At the next upkeep'}: ${e.text}`;
    case 'exileUntil': return `${e.cardName} stays exiled`;
    default: return e.text || 'Effect';
  }
}
function fxEnds(e) {
  if (e.kind === 'delayed') return e.when === 'end' ? 'fires at the beginning of the end step' : 'fires at the beginning of the next upkeep';
  if (e.kind === 'exileUntil') return `until ${e.srcName} leaves the battlefield`;
  return UNTIL_WORDS[e.until] || '';
}
function endFx(pred, why) {
  if (!state || !state.fx || !state.fx.length) return;
  const gone = state.fx.filter(pred); if (!gone.length) return;
  state.fx = state.fx.filter(e => !gone.includes(e));
  for (const e of gone) log(`Ended (${why}): ${fxLabel(e)}`);
}
// A permanent left the battlefield: its own effects end, and effects that last "while the source stays" end too.
function fxOnLeave(c) {
  if (!state || !state.fx || !state.fx.length) return;
  endFx(e => e.targetId === c.id && ['pt', 'kw', 'note'].includes(e.kind), 'it left the battlefield');
  state.fx = state.fx.filter(e => !(e.kind === 'delayed' && e.targetId === c.id && (e.action === 'exile' || e.action === 'sacrifice' || e.action === 'returnHand')));
  const rel = state.fx.filter(e => e.srcId === c.id && (e.until === 'srcLeaves' || e.kind === 'exileUntil'));
  if (!rel.length) return;
  state.fx = state.fx.filter(e => !rel.includes(e));
  for (const e of rel) {
    if (e.kind === 'exileUntil') {
      const f = e.cardId ? findCard(e.cardId) : null;
      if (f && f.zone === 'exile') { state.exile.splice(f.idx, 1); f.card.counters = { plus: 0, minus: 0 }; log(`${e.srcName} left the battlefield: ${f.card.name} returns from exile`); enterBattlefield(f.card, { from: 'exile' }); }
      else { log(`${e.srcName} left the battlefield: ${e.cardName} returns (put it back at the table)`); toast(`${e.cardName} returns`, `${e.srcName} left the battlefield, so ${e.cardName} comes back. It is not tracked here: put it back by hand.`); }
    } else { log(`Ended (${e.srcName} left the battlefield): ${fxLabel(e)}`); if (e.kind === 'note' && teach('durationHints')) toast('Effect ended', `${e.srcName} left the battlefield: ${fxLabel(e)}.`); }
  }
}
function delayedDue(e, when) { return e.kind === 'delayed' && e.when === when && (e.turn < state.turn || (when === 'end' && e.step < stepIndex('end'))); }
// Fire the delayed triggers that are due at the beginning of this upkeep / end step.
function runDelayed(when) {
  if (!state || !state.fx || !state.fx.length) return;
  const due = state.fx.filter(e => delayedDue(e, when)); if (!due.length) return;
  state.fx = state.fx.filter(e => !due.includes(e));
  const where = when === 'end' ? 'end step' : 'upkeep';
  for (const e of due) {
    const f = e.targetId ? findCard(e.targetId) : null, nm = e.targetName || (f && f.card.name) || 'it';
    if (e.action === 'exile') { if (f && f.zone === 'battlefield') { log(`${e.srcName}: ${nm} was exiled at the beginning of the ${where}`); delete f.card.exileInstead; leaveBattlefield(f.card, 'exile'); } }
    else if (e.action === 'sacrifice') { if (f && f.zone === 'battlefield') { log(`${e.srcName}: ${nm} was sacrificed at the beginning of the ${where}`); leaveBattlefield(f.card, 'graveyard'); } }
    else if (e.action === 'returnHand') { if (f && f.zone === 'battlefield') { log(`${e.srcName}: ${nm} returned to its owner's hand at the beginning of the ${where}`); leaveBattlefield(f.card, 'hand'); } }
    else if (e.action === 'returnBf') {
      if (f && f.zone === 'exile') { state.exile.splice(f.idx, 1); f.card.counters = { plus: 0, minus: 0 }; enterBattlefield(f.card, { from: 'exile', logMsg: `${e.srcName}: ${nm} returns to the battlefield at the beginning of the ${where}` }); }
      else log(`${e.srcName}: ${nm} is not in exile, so it cannot return`);
    } else if (e.draw && !teach('triggerPrompts')) { const n = drawCards(e.draw); log(`${e.srcName}: delayed trigger, drew ${n}`); }
    else queueTrigger({ kind: 'ability', cardId: 0, cardName: e.srcName, text: e.text, effect: e.text, special: null, optional: false, why: `${e.srcName} created a delayed trigger earlier: it fires at the beginning of this ${where}.` });
  }
}
function addTempPT(id, p, t, extra) {
  const f = findCard(id); if (!f || f.zone !== 'battlefield') return;
  snap(); addFx(Object.assign({ kind: 'pt', targetId: id, p, t, srcName: 'manual' }, extra || {}));
  log(`${f.card.name} gets ${sgnN(p)}/${sgnN(t)} ${UNTIL_WORDS[(extra && extra.until) || 'eot']}`); render();
}
function addKwFx(id, kw, extra) {
  const f = findCard(id); if (!f || f.zone !== 'battlefield') return;
  snap(); addFx(Object.assign({ kind: 'kw', targetId: id, kw, srcName: 'manual' }, extra || {}));
  log(`${f.card.name} gains ${kw} ${UNTIL_WORDS[(extra && extra.until) || 'eot']}`); render();
}
// ---- reading durations out of rules text
const DELAY_RE_B = /^(.+?)\s+at the beginning of (the next end step|your next end step|the end step|the next turn's upkeep|your next upkeep|the next upkeep)\b/i;
const DELAY_RE_A = /\bat the beginning of (the next end step|your next end step|the end step|the next turn's upkeep|your next upkeep|the next upkeep)[^,]*,\s*(.+)$/i;
function delayedFromSentence(s) {
  let m, when, act;
  if ((m = s.match(/^at the beginning of /i)) && (m = s.match(DELAY_RE_A))) { when = m[1]; act = m[2]; }
  else if ((m = s.match(DELAY_RE_B))) { when = m[2]; act = m[1]; }
  else return null;
  act = act.replace(/\.$/, '').trim();
  const out = { when: /upkeep/i.test(when) ? 'upkeep' : 'end', text: act.charAt(0).toUpperCase() + act.slice(1) + '.', action: null, draw: 0 };
  let a;
  if (/^(?:you may )?exile (?:it|that creature|that card|them|~|this \w+)\b/i.test(act) && !/\bfrom\b/i.test(act)) out.action = 'exile';
  else if (/^sacrifice (?:it|that creature|them|~|this \w+)\b/i.test(act)) out.action = 'sacrifice';
  else if (/^return (?:it|that card|that creature|them|~|this \w+) to the battlefield\b/i.test(act)) out.action = 'returnBf';
  else if (/^return (?:it|that card|that creature|them|~|this \w+) to (?:its owner's|your) hand\b/i.test(act)) out.action = 'returnHand';
  else if ((a = act.match(/^(?:you )?draw (a|an|one|two|three|four|five|\d+) cards?\b/i))) out.draw = numOf(a[1]);
  return out;
}
const KW_LIST_RE = /\bgains?\s+([a-z ,]+?)(?=\s+until\b|\s+this turn|\.|$)/i;
function kwsIn(text) { return String(text).toLowerCase().split(/,\s*(?:and\s+)?|\s+and\s+/).map(x => x.trim()).filter(k => GRANTABLE.includes(k)); }
// Options for the effect panel from one sentence: temporary pumps and keywords, delayed triggers, or a timed reminder.
// targets = [{id,name}] the sentence is about (chosen targets); without them the source ("this creature") or a group is used.
function durationOptions(sentence, obj, targets) {
  const s = String(sentence).replace(/’/g, "'").trim(), src = obj.sourceName || 'this', out = [];
  if (!s) return out;
  const until = durKey(s), uw = UNTIL_WORDS[until], isDur = DUR_RE.test(s);
  let who = (targets && targets.length) ? targets : null, group = null, m;
  if (!who) {
    if (/^(other )?creatures you control\b/i.test(s)) group = { other: /^other/i.test(s) };
    else if (obj.sourceId && /^(?:~|this \w+|it)\b/i.test(s)) who = [{ id: obj.sourceId, name: src }];
  }
  const apply = (mk) => () => {
    const ids = group ? state.battlefield.filter(c => permZone(c) === 'creatures' && !(group.other && c.id === obj.sourceId)).map(c => c.id) : who.map(t => t.id);
    snap();
    for (const id of ids) { const f = findCard(id); if (f && f.zone === 'battlefield') { addFx(Object.assign({ targetId: id, until, srcName: obj.sourceName || 'effect', srcId: obj.sourceId || null }, mk)); } }
    log(`${obj.sourceName || 'Effect'}: ${group ? 'creatures you control' : who.map(t => t.name).join(', ')} — ${mk.kind === 'pt' ? sgnN(mk.p) + '/' + sgnN(mk.t) : mk.kw} ${uw}`); render();
  };
  const nameOf = () => group ? 'Creatures you control' : who.map(t => t.name).join(', ');
  let handled = false;
  if (isDur && (who || group)) {
    if ((m = s.match(/\bgets? ([+-]\d+)\/([+-]\d+)/i))) { const p = +m[1], t = +m[2]; out.push({ label: `${nameOf()} ${group ? 'get' : 'gets'} ${sgnN(p)}/${sgnN(t)} ${uw}`, fn: apply({ kind: 'pt', p, t }) }); handled = true; }
    if ((m = s.match(KW_LIST_RE))) for (const kw of kwsIn(m[1])) { out.push({ label: `${nameOf()} ${group ? 'gain' : 'gains'} ${kw} ${uw}`, fn: apply({ kind: 'kw', kw }) }); handled = true; }
  }
  const dl = delayedFromSentence(s);
  if (dl) {
    const tg = (targets && targets[0]) || (obj.sourceId ? { id: obj.sourceId, name: src } : null);
    out.push({ label: `Create delayed trigger: ${dl.text.replace(/\.$/, '')} at the beginning of the ${dl.when === 'end' ? 'next end step' : 'next upkeep'}`, fn: () => {
      snap(); addFx({ kind: 'delayed', when: dl.when, action: dl.action, draw: dl.draw, text: dl.text, srcName: obj.sourceName || 'effect', srcId: obj.sourceId || null, targetId: tg ? tg.id : null, targetName: tg ? tg.name : '' });
      log(`${obj.sourceName || 'Effect'}: delayed trigger created — ${dl.text} (${dl.when === 'end' ? 'next end step' : 'next upkeep'})`); render();
    } });
    handled = true;
  }
  if (!handled && isDur && !/^\s*(?:when|whenever|at)\b/i.test(s)) {
    const first = who && who[0];
    out.push({ label: `Remember (${uw}): ${s.length > 90 ? s.slice(0, 87) + '…' : s}`, fn: () => { snap(); addFx({ kind: 'note', text: s.replace(/\.$/, ''), until, srcName: obj.sourceName || 'effect', srcId: obj.sourceId || null, targetId: first ? first.id : null }); log(`${obj.sourceName || 'Effect'}: will remember — ${s} (${uw})`); render(); } });
  }
  return out;
}
// ---- the panel
function openEffects() {
  if (!state) return;
  const m = modal('Active effects', { width: 640 });
  const list = h('div', { class: 'prelist' });
  const draw = () => {
    const fx = state.fx || [];
    list.replaceChildren(...(fx.length ? fx.map(e => h('div', { class: 'row fxrow' },
      h('span', { class: 'nm' }, h('b', { text: fxLabel(e) }), h('span', { class: 'muted small', text: ` — ${fxEnds(e)}${e.srcName && e.srcName !== 'manual' ? ' (from ' + e.srcName + ')' : ''}` })),
      h('button', { text: 'Remove', onclick: () => { snap(); state.fx = state.fx.filter(x => x !== e); log(`Effect removed by hand: ${fxLabel(e)}`); draw(); render(); } })))
      : [h('div', { class: 'muted small', text: 'Nothing lasting is active right now.' })]));
  };
  m.body.append(...[teach('durationHints') ? h('div', { class: 'psub', text: 'Effects that last a while. “Until end of turn” effects end in the cleanup step, “until your next turn” effects end when your next turn begins, and delayed triggers fire at the beginning of the step they name. You can remove one by hand if the app got it wrong.' }) : null, list].filter(Boolean));
  m.foot.append(h('button', { class: 'primary', text: 'Close', onclick: () => m.close() }));
  draw();
}

// How the live power/toughness differs from the printed one: 'up' (bigger), 'down' (smaller), 'dyn' (defined by the game state), '' (unchanged)
function ptDelta(r) {
  if (r.dynamic || r.unknown) return 'dyn';
  if (r.bp != null && r.bt != null) { if (r.p < r.bp || r.t < r.bt) return 'down'; if (r.p > r.bp || r.t > r.bt) return 'up'; }
  return r.modified ? 'up' : '';
}
const lastPT = new Map();   // card id -> last P/T text shown, so a change can flash
function ptTitle(c, r) { const info = c.token ? null : cardInfo(c.name); return `Printed ${(c.token ? c.tk.pt : info && info.pt) || '?'}, now ${r.p}/${r.t}${r.unknown ? '?' : ''}` + (r.why.length ? ': ' + r.why.join('; ') : ''); }
function ptOverlay(c, r, extraClass) {   // the box that covers the printed power/toughness on a card picture
  const d = ptDelta(r), txt = `${r.p}/${r.t}${r.unknown ? '?' : ''}`;
  return h('div', { class: 'ptbox pt-' + (d || 'same') + (extraClass || ''), text: txt, 'data-len': String(txt.length), title: ptTitle(c, r) });
}
function ptNoteRow(c) {
  if (!state || permZone(c) !== 'creatures') return null;
  const r = ptCalc(c);
  if (!r.dynamic && !r.modified && !r.unknown) return null;
  return h('div', { text: `Power/toughness now ${ptText(c)}: ${r.why.join('; ')}.` });
}
// State-based action: a creature with toughness 0 or less is put into its owner's graveyard.
let sbaRunning = false, sbaFlush = false;
function runToughnessSBA() {
  if (sbaRunning || !state || state.phase === 'idle') return;
  sbaRunning = true;
  try {
    for (let guard = 0; guard < 20; guard++) {
      const dead = state.battlefield.find(c => permZone(c) === 'creatures' && (c.token || cardInfo(c.name)) && (() => { const r = ptCalc(c); return !r.unknown && (r.t <= 0 || ((c.dmg || 0) >= r.t && !hasKw(c, 'indestructible'))); })());
      if (!dead) break;
      { const lethal = (dead.dmg || 0) > 0 && ptCalc(dead).t > 0;
        log(lethal ? `${dead.name} has lethal damage marked on it (${dead.dmg}): destroyed (state-based action)` : `${dead.name} has toughness 0 or less: put into the graveyard (state-based action)`);
        toast(`${dead.name} dies`, lethal ? 'A creature with damage marked equal to or greater than its toughness is destroyed.' : 'A creature with toughness 0 or less is put into its owner’s graveyard.'); }
      leaveBattlefield(dead, 'graveyard'); sbaFlush = true;
    }
  } finally { sbaRunning = false; }
  if (sbaFlush) setTimeout(() => { sbaFlush = false; flushTriggers(); }, 0);
}
function attackBlock(c) {   // why this creature cannot attack right now ('' = it can)
  if (c.tapped) return 'It is tapped.';
  if (isSick(c)) return 'Summoning sickness: it came under your control this turn (and has no haste).';
  if (hasKw(c, 'defender')) return 'Defender: this creature cannot attack.';
  { const cb = statics().find(e => e.kind === 'cant' && e.attack && e.subj.test(c)); if (cb) return `${cb.g.name}: this creature can't attack.`; }
  return '';
}
function eligibleAttackers() { return state ? state.battlefield.filter(c => permZone(c) === 'creatures' && !attackBlock(c)) : []; }
function isLeyline(c) { return /\bopening hand\b/i.test(cardText(c)) && /\bLeyline\b/i.test(cardText(c)); }
function isSerumPowder(c) { return norm(c.name)==='serum powder'; }
function landETBTrigger(c) {
  const tx=cardText(c); let m=tx.match(/enters(?: the battlefield)?[^.]*\bscry\s+(\d+)/i);
  if(m) return {kind:'ability',cardId:c.id,cardName:c.name,special:'scry',n:+m[1],optional:false,why:'A land with an enters-the-battlefield trigger.',text:`When ${c.name} enters, scry ${m[1]}.`,effect:`Scry ${m[1]}.`};
  m=tx.match(/enters(?: the battlefield)?[^.]*\bsurveil\s+(\d+)/i);
  if(m) return {kind:'ability',cardId:c.id,cardName:c.name,special:'surveil',n:+m[1],optional:false,why:'A land with an enters-the-battlefield trigger.',text:`When ${c.name} enters, surveil ${m[1]}.`,effect:`Surveil ${m[1]}.`};
  return null;
}
function triggeredAbilityFor(c){
  const tx=cardText(c); if(!tx)return null;
  const m=tx.match(/((?:When|Whenever|At the beginning|At the end)[^.]*\.)/i);
  if(!m)return null;
  return {kind:'ability',cardId:c.id,text:m[1]};
}
// ---------------------------------------------------------------- triggered abilities (v0.23)
// A triggered ability has an event ("when X happens") and an effect. When the event happens the ability
// is put on the stack the next time a player would get priority, then resolves like a spell.
const TRIG_CACHE = new Map();
const MAIN_STEPS = [[/\b(?:precombat|first) main phase\b/, 'main1'], [/\b(?:postcombat|second) main phase\b/, 'main2'], [/\bupkeep\b/, 'upkeep'], [/\bdraw step\b/, 'draw'], [/\bend step\b/, 'end']];
// Legendary cards such as "Phlage, Titan of Fire's Fury" refer to themselves by the part before the comma ("When Phlage enters..."),
// so a self-reference matches either the full name or that short name (rule 201.4 / Oracle wording).
function selfNameRe(full) {
  const f = String(full || '').split(' // ')[0], esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), short = f.includes(',') ? f.split(',')[0].trim() : '';
  return new RegExp(short && short.length > 2 ? '(?:' + esc(f) + '|' + esc(short) + ')' : esc(f), 'gi');
}
function parseTriggers(c) {
  if (!c || c.token) return [];
  const info = cardInfo(c.name);
  if (!info || !info.tx) return [];
  const key = norm(c.name);
  if (TRIG_CACHE.has(key)) return TRIG_CACHE.get(key);
  const out = [];
  const nameRe = selfNameRe(info.name);
  for (const raw of info.tx.replace(/\n(?=\s*[\u2022\u2023])/g, ' ').split('\n')) {
    const line = raw.trim();
    const lm = line.match(/^(?:([A-Z][A-Za-z' ]+) — )?((?:When|Whenever|At)\b.*)$/s);
    if (!lm) continue;
    const body = lm[2].replace(nameRe, '~');
    const cm = body.match(/^((?:When|Whenever|At)\b[^,]*),\s*(.*)$/s);
    if (!cm) continue;
    const cond = cm[1].toLowerCase(), word = lm[1] || '';
    let ev = null, filter = '', zone = null, from = null, cyc = false, dis = false, another = false;
    if (/^at\b/.test(cond)) {
      if (!/opponent|\bnext\b/.test(cond)) {
        if (/end of combat/.test(cond)) ev = 'step:end_combat';
        else if (/beginning of combat/.test(cond)) ev = 'step:begin_combat';
        else for (const [re, id] of MAIN_STEPS) if (re.test(cond)) { ev = 'step:' + id; break; }
      }
    } else if (/^(?:when|whenever) you cast (?:this spell|~)/.test(cond)) ev = 'cast-self';
    else if (/^(?:when|whenever) you cast /.test(cond)) { ev = 'cast'; filter = cond.replace(/^(?:when|whenever) you cast /, ''); }
    else if (/^(?:when|whenever) (?:~|this \w+) enters/.test(cond)) ev = 'etb-self';
    else if (word === 'Landfall' || /\ba land (?:you control )?enters|land enters the battlefield under your control/.test(cond)) ev = 'landfall';
    else if (/^(?:when|whenever) (?:another|a|an|one or more) .*enters/.test(cond) && !/opponent/.test(cond)) { ev = 'etb-other'; filter = cond; }
    else if (/^(?:when|whenever) (?:~|this \w+) attacks/.test(cond)) ev = 'attack-self';
    else if (/creatures? you control attacks?/.test(cond)) ev = 'attack-any';
    else if (/^(?:when|whenever) (?:~|this \w+) (?:dies|is put into a graveyard from the battlefield)/.test(cond)) ev = 'dies-self';
    else if (/^(?:when|whenever) (?:another|a) .*dies/.test(cond) && !/opponent/.test(cond)) { ev = 'dies-other'; filter = cond; }
    else if (/^whenever you draw/.test(cond)) ev = 'draw';
    else if (/^whenever an opponent draws a card/.test(cond)) ev = 'opp-draw';
    else if (/^(?:when|whenever) (?:~|this \w+) leaves the battlefield/.test(cond)) ev = 'leaves-self';
    else if (/^whenever you gain life/.test(cond)) ev = 'lifegain';
    else if (/^(?:when|whenever) (?:~|this \w+) deals combat damage to (?:a player|an opponent|a creature or player|a player or planeswalker)/.test(cond)) ev = 'combat-damage-self';
    else if (/^(?:when|whenever) (?:one or more |a |an )?(?:other )?creatures? you control deals? combat damage to (?:a player|an opponent)/.test(cond)) ev = 'combat-damage-any';
    if (!ev && /^(?:when|whenever) (?:~|this \w+) enters(?: the battlefield)? or attacks/.test(cond)) ev = 'etb-self';
    if (!ev) {   // v0.64: graveyard, discard/cycle, mana, life loss
      let q;
      if ((q = cond.match(/^(?:when|whenever) (?:~|this \w+) is put into (?:your|a) graveyard from (anywhere|your library|your hand)/))) { ev = 'gy-self'; from = q[1]; zone = 'graveyard'; }
      else if ((q = cond.match(/^(?:when|whenever) (?:a|an|another|one or more) (.+?)(?: cards?| creatures?)? (?:is|are) put into your graveyard from (anywhere|the battlefield|your library|your hand)/))) { ev = 'gy-other'; filter = q[1] + (/creature/.test(cond.slice(q.index, q[0].length)) && !/creature/.test(q[1]) ? ' creature' : ''); from = q[2]; }
      else if ((q = cond.match(/^(?:when|whenever) you (cycle or discard|discard|cycle) (?:(?:a|an|another|one or more|this or another) )?(?:other )?(?:([a-z ]+?) )?cards?/))) { ev = 'discard'; cyc = /cycle/.test(q[1]); dis = /discard/.test(q[1]); another = /another|other/.test(cond); filter = (q[2] || '').trim(); }
      else if ((q = cond.match(/^(?:when|whenever) you tap (?:~|this \w+) for mana/))) ev = 'tap-self';
      else if ((q = cond.match(/^(?:when|whenever) you lose life/))) ev = 'lifeloss';
    }
    if (/^if (?:~|this \w+) is in your graveyard\b/i.test(cm[2]) || (ev === 'gy-self')) zone = 'graveyard';
    out.push({ ev, cond: cm[1], effect: cm[2], line: body, filter, optional: /\byou may\b/i.test(cm[2]), special: null, zone, from, cyc, dis, another });
    if (ev === 'etb-self' && /enters(?: the battlefield)? or attacks/.test(cond)) out.push({ ev: 'attack-self', cond: cm[1], effect: cm[2], line: body, filter, optional: /\byou may\b/i.test(cm[2]), special: null });
    if (ev === 'etb-self' && /\band whenever an opponent draws a card/i.test(cond)) out.push({ ev: 'opp-draw', cond: cm[1], effect: cm[2], line: body, filter, optional: /\byou may\b/i.test(cm[2]), special: null });
  }
  if (/\bcascade\b/i.test(info.tx)) out.push({ ev: 'cast-self', cond: 'When you cast this spell', effect: 'Cascade: exile cards from the top of your library until you exile a nonland card with lesser mana value. You may cast it without paying its mana cost. Put the exiled cards on the bottom of your library in a random order.', line: 'Cascade (keyword): exile cards from the top of your library until you exile a nonland card with lesser mana value. You may cast it free.', filter: '', optional: true, special: 'cascade' });
  if (/\bprowess\b/i.test(info.tx)) out.push({ ev: 'cast', cond: 'Prowess: whenever you cast a noncreature spell', effect: 'This creature gets +1/+1 until end of turn.', line: 'Prowess (keyword): whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.', filter: 'noncreature spell', optional: false, special: 'prowess' });
  TRIG_CACHE.set(key, out);
  return out;
}
function frontType(c) { const i = c && !c.token && cardInfo(c.name); return i && i.t ? i.t.split(' // ')[0] : ''; }
function filterMatches(filter, card) {
  const t = frontType(card);
  if (!t) return true;
  const f = filter.toLowerCase();
  if (/\bnoncreature\b/.test(f) && /\bCreature\b/.test(t)) return false;
  const words = [['instant or sorcery', /\b(Instant|Sorcery)\b/], ['instant', /\bInstant\b/], ['sorcery', /\bSorcery\b/], ['artifact', /\bArtifact\b/], ['enchantment', /\bEnchantment\b/], ['planeswalker', /\bPlaneswalker\b/], ['land', /\bLand\b/], ['creature', /\bCreature\b/]];
  const mentioned = words.filter(([w]) => new RegExp('(?<!non)\\b' + w + '\\b').test(f));
  if (!mentioned.length) return true;
  return mentioned.some(([, re]) => re.test(t));
}
function fireTrigger(ev, ctx = {}) {
  if (state && ev === 'step' && ctx.id === 'upkeep') { runDelayed('upkeep'); suspendUpkeep(); }
  if (!state || !teach('triggerPrompts')) return;
  const inGy = x => state.graveyard.some(g => g.id === x.id);
  const add = (src, t, why) => { if ((t.zone === 'graveyard') !== inGy(src)) return; state.pendingTriggers.push({ kind: 'ability', cardId: src.id, cardName: src.name, text: t.line, effect: t.effect, special: t.special, optional: t.optional, why }); };
  const bf = state.battlefield.concat(state.graveyard.filter(g => parseTriggers(g).some(t => t.zone === 'graveyard')));
  if (ev === 'step') {
    const label = STEPS.find(x => x.id === ctx.id)?.label || ctx.id;
    for (const c of bf) for (const t of parseTriggers(c)) if (t.ev === 'step:' + ctx.id) add(c, t, `It is the ${label.toLowerCase()} of your turn, so this "at the beginning of…" ability triggers now.`);
  } else if (ev === 'etb') {
    const e = ctx.card;
    for (let t of parseTriggers(e)) if (t.ev === 'etb-self' && !(isLandName(e.name) && /\b(scry|surveil)\s+\d+/i.test(t.effect))) add(e, e.xValue !== undefined ? { ...t, effect: t.effect.replace(/\bX\b/g, String(e.xValue)), line: t.line.replace(/\bX\b/g, String(e.xValue)) } : t, `${e.name} entered the battlefield, so its "enters the battlefield" ability triggers.`);
    for (const c of bf) for (const t of parseTriggers(c)) {
      if (t.ev === 'landfall' && isLandName(e.name)) add(c, t, `A land (${e.name}) entered the battlefield under your control: landfall.`);
      else if (t.ev === 'etb-other' && c.id !== e.id && filterMatches(t.filter, e)) add(c, t, `${e.name} entered the battlefield and matches this ability's condition.`);
    }
  } else if (ev === 'cast') {
    const sp = ctx.card;
    for (const t of parseTriggers(sp)) if (t.ev === 'cast-self') add(sp, t, `You cast ${sp.name}. "When you cast this spell" abilities trigger immediately and go on the stack above the spell, so they resolve first.`);
    for (const c of bf) for (const t of parseTriggers(c)) if (t.ev === 'cast' && filterMatches(t.filter, sp)) add(c, t, `You cast ${sp.name}, which matches "${t.filter || 'a spell'}".`);
  } else if (ev === 'attack') {
    const atk = ctx.cards || [];
    for (const a of atk) for (const t of parseTriggers(a)) if (t.ev === 'attack-self') add(a, t, `${a.name} was declared as an attacker.`);
    if (atk.length) for (const c of bf) for (const t of parseTriggers(c)) if (t.ev === 'attack-any') add(c, t, 'You declared attackers.');
  } else if (ev === 'dies') {
    const d = ctx.card;
    for (const t of parseTriggers(d)) if (t.ev === 'dies-self') add(d, t, `${d.name} was put into a graveyard from the battlefield (it died).`);
    for (const c of bf) if (c.id !== d.id) for (const t of parseTriggers(c)) if (t.ev === 'dies-other' && filterMatches(t.filter, d)) add(c, t, `${d.name} died and matches this ability's condition.`);
  } else if (ev === 'draw') {
    for (const c of bf) for (const t of parseTriggers(c)) if (t.ev === 'draw') add(c, t, 'You drew a card.');
  } else if (ev === 'oppdraw') {
    for (const c of bf) for (const t of parseTriggers(c)) if (t.ev === 'opp-draw') add(c, t, 'Your opponent drew a card (not the first one of their draw step), so this ability triggers.');
  } else if (ev === 'leaves') {
    const d = ctx.card;
    for (const t of parseTriggers(d)) if (t.ev === 'leaves-self') add(d, t, `${d.name} left the battlefield.`);
  } else if (ev === 'lifegain') {
    for (const c of bf) for (const t of parseTriggers(c)) if (t.ev === 'lifegain') add(c, t, `You gained ${ctx.amount || ''} life.`);
  } else if (ev === 'gyenter') {
    const d = ctx.card, from = ctx.from;
    const fromOk = f => !f || f === 'anywhere' || (f === 'the battlefield' && from === 'battlefield') || (f === 'your library' && from === 'library') || (f === 'your hand' && from === 'hand');
    for (const t of parseTriggers(d)) if (t.ev === 'gy-self' && fromOk(t.from)) add(d, t, `${d.name} was put into your graveyard from ${from === 'battlefield' ? 'the battlefield' : from === 'stack' ? 'the stack' : 'your ' + from}.`);
    for (const c of bf) for (const t of parseTriggers(c)) if (t.ev === 'gy-other' && c.id !== d.id && fromOk(t.from) && filterMatches(t.filter, d)) add(c, t, `${d.name} was put into your graveyard from ${from === 'stack' ? 'the stack' : from === 'battlefield' ? 'the battlefield' : 'your ' + from}, which matches "${t.filter}".`);
  } else if (ev === 'discard') {
    const d = ctx.card, how = ctx.how;
    for (const c of bf) for (const t of parseTriggers(c)) if (t.ev === 'discard' && !(t.another && c.id === d.id) && ((how === 'cycle' && (t.cyc || t.dis)) || (how === 'discard' && t.dis)) && filterMatches(t.filter, d)) add(c, t, `You ${how === 'cycle' ? 'cycled' : 'discarded'} ${d.name}.`);
  } else if (ev === 'tapmana') {
    const d = ctx.card;
    for (const t of parseTriggers(d)) if (t.ev === 'tap-self') add(d, t, `You tapped ${d.name} for mana.`);
  } else if (ev === 'lifeloss') {
    for (const c of bf) for (const t of parseTriggers(c)) if (t.ev === 'lifeloss') add(c, t, `You lost ${ctx.amount || ''} life.`);
  } else if (ev === 'combatdmg') {
    const a = ctx.card;
    for (const t of parseTriggers(a)) if (t.ev === 'combat-damage-self') add(a, t, `${a.name} dealt combat damage to the opponent.`);
    for (const c of bf) for (const t of parseTriggers(c)) if (t.ev === 'combat-damage-any') add(c, t, `${a.name} (a creature you control) dealt combat damage to the opponent.`);
  }
}
function flushTriggers() { if (state && state.pendingTriggers.length && !state.phasePause && !state.discarding && !costHold) resolvePendingTrigger(); }
function permanentEntered(c) {
  if (!state || !c) return;
  c.enteredTurn = state.turn;
  if (isPlaneswalker(c) && c.loyalty === undefined) {
    const info = cardInfo(c.name), m = info && info.pt && String(info.pt).match(/(\d+)/);
    c.loyalty = m ? +m[1] : 0;
    log(`${c.name} entered with ${c.loyalty} loyalty counters`);
  }
  const dup = legendDuplicates(c);
  fireTrigger('etb', { card: c });   // triggers still happen even if the new permanent is about to be put into the graveyard
  if (dup.length) openLegendRule(c, dup);
}
// ---- legend rule (state-based action): two or more legendary permanents with the same name -> keep one, the rest go to the graveyard
let legendOpen = false;
function legendDuplicates(c) {
  if (!/\bLegendary\b/.test(frontType(c))) return [];
  return state.battlefield.filter(x => !x.token && norm(x.name) === norm(c.name));
}
function openLegendRule(c, list) {
  if (list.length < 2 || legendOpen) return;
  legendOpen = true;
  const m = modal('Legend rule', { width: 540, sticky: true, noClose: true });
  m.body.append(
    h('div', { class: 'psub', text: `You control ${list.length} legendary permanents named ${c.name}. This is a state-based action: you choose one to keep, and the rest are put into their owner’s graveyard right away. It does not use the stack.` }),
    teach('rulesHints') ? h('div', { class: 'muted small', text: 'It is the name that matters, not the card. Only legendary permanents you control are affected. Enter-the-battlefield abilities of the new copy have already triggered, so keeping the old one does not undo them.' }) : null);
  const box = h('div', { class: 'prelist' });
  for (const x of list) {
    const tag = x.id === c.id ? 'the new one' : 'already in play';
    const extra = [x.tapped ? 'tapped' : 'untapped', (x.counters && (x.counters.plus || x.counters.minus)) ? 'has counters' : '', x.loyalty !== undefined ? `loyalty ${x.loyalty}` : ''].filter(Boolean).join(', ');
    box.append(h('div', { class: 'row' }, h('span', { class: 'nm', text: `${x.name} (${tag}; ${extra})` }), h('button', { class: 'primary', text: 'Keep this one', onclick: () => {
      snap();
      for (const o of list) if (o.id !== x.id) { const i = state.battlefield.findIndex(b => b.id === o.id); if (i >= 0) { log(`Legend rule: ${o.name} put into the graveyard (kept the ${x.id === c.id ? 'new' : 'old'} one)`); leaveBattlefield(o, 'graveyard'); } }
      legendOpen = false; m.close(); render(); resolvePendingTrigger();
    } })));
  }
  m.body.append(box);
}
// ---- modal cards: "Choose one —", "Choose two —", "Choose one or both —", "Choose up to one —", Spree (v0.38) ----------------
// Modes are chosen as the spell is cast (or as the ability goes on the stack), BEFORE paying costs (rule 601.2b), and
// the chosen modes resolve in the order they are printed (rule 700.2).
function parseModal(tx) {
  tx = String(tx || '').replace(/\s*\n\s*(?=[•‣])/g, ' ').replace(/,\n/g, ', ');
  let m;
  const spreeLines = tx.split('\n').map(l => l.trim()).filter(l => /^\+\s*(?:\{[^}]+\})+\s*—/.test(l));
  if (/^\s*Spree\b/im.test(tx) && spreeLines.length) {
    const modes = spreeLines.map(l => { const mm = l.match(/^\+\s*((?:\{[^}]+\})+)\s*—\s*(.+)$/); return { text: mm[2].trim(), cost: mm[1] }; });
    return { spree: true, min: 1, max: modes.length, label: 'one or more additional costs (Spree)', modes, kind: 'spell' };
  }
  m = tx.match(/\bchoose (one or both|one or more|up to (?:one|two|three|four)|one|two|three|four)\b[^•—]*—\s*/i);
  if (!m || !/•/.test(tx)) return null;
  const word = m[1].toLowerCase(), after = tx.slice(m.index + m[0].length);
  const modes = ('• ' + after).split(/\s*•\s*/).slice(1).map(x => ({ text: x.trim().replace(/\s+$/, '') })).filter(x => x.text);
  if (modes.length < 2) return null;
  const N = { one: 1, two: 2, three: 3, four: 4 };
  let min, max, label = word;
  if (word === 'one or both') { min = 1; max = 2; }
  else if (word === 'one or more') { min = 1; max = modes.length; }
  else if (/^up to /.test(word)) { min = 0; max = N[word.slice(7)]; }
  else { min = max = N[word]; }
  // What kind of ability is this "choose one" part of? Look at the words that lead into it on the same line.
  const lead = tx.slice(tx.lastIndexOf('\n', m.index) + 1, m.index);
  const kind = /\b(?:when|whenever|at the beginning of)\b/i.test(lead) ? 'trigger' : lead.includes(':') ? 'ability' : 'spell';
  return { spree: false, min, max, label, modes, kind };
}
// The mode choice made while CASTING: only a real spell (instant/sorcery) has one. A permanent's
// "choose one" belongs to a triggered or activated ability and is chosen when that ability goes on the stack.
function spellModal(c) {
  const md = parseModal(cardText(c)); if (!md) return null;
  if (md.spree) return md;
  if (md.kind !== 'spell') return null;
  return /\b(?:Instant|Sorcery)\b/.test(frontType(c)) || !frontType(c) ? md : null;
}
// Text of the chosen modes (in printed order), used as the text of the spell/ability as it resolves.
function modalText(md, idxs) { return [...idxs].sort((a, b) => a - b).map(i => md.modes[i].text).join(' '); }
function mergeGeneric(cost) { let n = 0; const rest = []; for (const m of String(cost || '').match(/\{[^}]+\}/g) || []) { if (/^\{\d+\}$/.test(m)) n += +m.slice(1, -1); else rest.push(m); } return (n ? `{${n}}` : '') + rest.join(''); }
function modalCost(md, idxs) { return md.spree ? idxs.map(i => md.modes[i].cost).join('') : ''; }
function openModeChoice(name, md, cb, baseCost) {
  const chosen = new Set();
  const m = modal(`${name}: choose ${md.spree ? 'additional costs' : md.min === md.max ? md.max === 1 ? 'one mode' : md.max + ' modes' : md.label}`, { width: 640, sticky: true });
  const info = h('div', { class: 'psub' });
  const total = h('div', { class: 'muted small' });
  const ok = h('button', { class: 'primary', text: md.spree ? 'Choose and continue' : 'Choose', disabled: true });
  const rows = [];
  const refresh = () => {
    const n = chosen.size;
    info.textContent = md.spree ? `Pick one or more extras. Each one adds its cost to the spell. (${n} chosen)` : md.min === md.max ? `Choose ${md.max}. (${n} of ${md.max} chosen)` : `Choose ${md.min === 0 ? 'up to ' + md.max : md.label.replace(/^./, c => c.toLowerCase())}. (${n} chosen)`;
    for (const r of rows) r.box.disabled = !chosen.has(r.i) && n >= md.max;
    ok.disabled = n < md.min || n > md.max;
    if (md.spree) total.textContent = `Total cost: ${mergeGeneric((baseCost || '') + modalCost(md, [...chosen])).replace(/[{}]/g, '') || '0'}`;
  };
  md.modes.forEach((mo, i) => {
    const box = h('input', { type: 'checkbox' });
    box.addEventListener('change', () => { if (box.checked) chosen.add(i); else chosen.delete(i); refresh(); });
    const eff = recognizedEffects(mo.text);
    rows.push({ i, box });
    m.body.append(h('label', { class: 'mode-row' }, box, h('span', { class: 'mode-txt' }, h('b', { text: md.spree ? `+${mo.cost.replace(/[{}]/g, '')}  ` : `Mode ${i + 1}  ` }), mo.text, h('span', { class: 'muted small', text: eff.length ? `  — the app can apply: ${eff.join('; ')}` : '  — you apply this one by hand' }))));
  });
  m.body.prepend(info);
  m.body.append(total, teach('rulesHints') ? h('div', { class: 'muted small', text: 'Modes are chosen as you cast the spell, before you pay. You cannot pick the same mode twice, and the chosen modes happen in the order they are printed.' }) : null);
  ok.addEventListener('click', () => { m.close(); cb([...chosen].sort((a, b) => a - b)); });
  m.foot.append(h('button', { text: 'Cancel', onclick: () => m.close() }), ok);
  refresh();
}

function openTriggerBatch(batch) {
  const m = modal(batch.length > 1 ? `${batch.length} triggered abilities` : 'Triggered ability', { width: 640, sticky: true, noClose: true });
  const remaining = [...batch], placed = [];
  const body = m.body;
  const finish = () => {
    m.close();
    if (placed.length) { render(); openStack(); }
    else { render(); resolvePendingTrigger(); }
  };
  const put = t => {
    const md = parseModal(t.effect);
    if (md) { openModeChoice(t.cardName, md, idxs => putWith(t, modalText(md, idxs))); return; }
    putWith(t, t.effect);
  };
  const putWith = (t, text) => {
    const specs = t.special ? [] : parseTargetSpecs(text);
    if (specs.length) {   // a trigger's targets are chosen as it goes on the stack
      chooseTargets(t.cardName, specs, picked => pushWith(t, text, picked), { srcId: t.cardId, onCancel: () => {} }); return;
    }
    pushWith(t, text, null);
  };
  const pushWith = (t, text, picked) => {
    remaining.splice(remaining.indexOf(t), 1);
    const obj = { ability: true, trigger: true, id: state.nextId++, name: `${t.cardName} — trigger`, sourceId: t.cardId, sourceName: t.cardName, text, special: t.special, n: t.n };
    if (picked) { obj.targets = picked; obj._tgtAsked = true; if (picked[0] && picked[0].kind === 'player') obj.target = picked[0].id; }
    state.stack.push(obj);
    state.priority = { active: true, passed: false };
    placed.push(t);
    log(`${t.cardName}: triggered ability put on the stack`);
    if (!remaining.length) finish(); else draw();
  };
  const skip = t => { remaining.splice(remaining.indexOf(t), 1); log(`${t.cardName}: trigger ${t.optional ? 'declined' : 'did not apply'}`); if (!remaining.length) finish(); else draw(); };
  const draw = () => {
    body.replaceChildren(...[
      teach('stackGuidance') ? h('div', { class: 'psub', text: remaining.length > 1 ? 'Several abilities triggered at once. You choose the order they go on the stack. The LAST one you put on the stack resolves FIRST.' : 'A triggered ability goes on the stack, then resolves like a spell. Read it: if it says "you may", or has a condition, decide whether it applies.' }) : null,
      ...remaining.map(t => h('div', { class: 'trig' },
        h('div', { class: 'trig-src', text: t.cardName }),
        h('div', { class: 'muted small', text: t.why }),
        h('div', { class: 'trig-text', text: t.text }),
        h('div', { class: 'pbtns' },
          h('button', { class: 'primary', text: 'Put on the stack', onclick: () => put(t) }),
          h('button', { text: t.optional ? 'Choose not to' : "Doesn't apply", onclick: () => skip(t) })))),
      placed.length ? h('div', { class: 'muted small', text: 'On the stack so far (bottom to top): ' + placed.map(t => t.cardName).join(', ') }) : null
    ].filter(Boolean));
  };
  draw();
}
const NUMW = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
const numOf = w => NUMW[String(w).toLowerCase()] || parseInt(w, 10) || 1;
// ---- the one list of effects the app can apply for a piece of rules text (used by the game AND by the card reader)
const WORD_NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const wnum = w => /^x$/i.test(w) ? 'X' : (WORD_NUM[String(w).toLowerCase()] || parseInt(w, 10) || 1);
function effectOptions(tx, obj) {
  obj = obj || {}; tx = String(tx || '');
  if (/\bchoose (?:one|two|up to one|up to two|one or both)\b[^\u2022]*\u2014/i.test(tx) && /\u2022/.test(tx)) {   // modal: offer each mode separately
    const modes = tx.split(/\s*\u2022\s*/).slice(1), out = [];
    modes.forEach((md, i) => { for (const o of effectOptions(md, obj)) out.push(o.label ? { ...o, label: `Mode ${i + 1}: ${o.label}` } : o); });
    return out;
  }
  const src = obj.sourceName || '~';
  const txs = tx.replace(new RegExp(src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '~');
  const opts = []; let mm;
  const bound = obj.targets && obj.targets.length ? targetedOptions(tx, obj) : [];
  const pl = n => (n === 1 ? '' : 's');
  if (/pay any amount of life/i.test(tx) && /draw that many/i.test(tx)) opts.push({ special: 'payLifeDraw', summary: 'pay life and draw' });
  if (obj.special === 'cascade') opts.push({ special: 'cascade', summary: 'cascade' });
  if (obj.special === 'sacSelf' && obj.sourceId) opts.push({ label: `Sacrifice ${obj.sourceName}`, fn: () => { const f = findCard(obj.sourceId); if (f && f.zone === 'battlefield') { log(`${obj.sourceName}: sacrificed (evoke)`); moveCard(f.card.id, 'graveyard'); } else toast('Already gone', `${obj.sourceName} is no longer on the battlefield.`); } });
  const delayed = /\bat the beginning of (?:the )?next (?:turn's )?upkeep\b/i.test(tx);
  if (/look at the top card of target player'?s library/i.test(tx)) opts.push({ special: 'lookTop', summary: 'look at the top card' });
  if (delayed && /\bdraw a card\b/i.test(tx)) opts.push({ special: 'delayedDraw', summary: 'draw a card next upkeep' });
  if (!delayed && !/opponent/i.test(tx) && (mm = tx.match(/\b(?:you draw|draws?)\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+|X)\s+cards?/i))) { const n = wnum(mm[1]); opts.push({ label: `Draw ${n} card${pl(n)}`, fn: () => { snap(); if (dredgeOptions().length && teach('dredgePrompts')) { askDredge(+n || 0); return; } const d = drawCards(+n || 0); log(`${src}: drew ${d}`); render(); } }); }
  if ((mm = txs.match(/\byou gain (an?|\d+) life for each ([^.,]+)/i))) { const per = /^\d+$/.test(mm[1]) ? +mm[1] : 1, n = per * (countForEach(mm[2]) || 0); opts.push({ label: `Gain ${n} life (${per} for each ${mm[2].trim()})`, fn: () => changeLife(n, true) }); }
  else if ((mm = tx.match(/\byou gain (\d+|X) life/i)) && mm[1] !== 'X') { const v = +mm[1]; opts.push({ label: `Gain ${v} life`, fn: () => changeLife(v, true) }); }
  if ((mm = tx.match(/\byou lose (\d+|X) life/i)) && mm[1] !== 'X') { const v = +mm[1]; opts.push({ label: `Lose ${v} life`, fn: () => changeLife(-v) }); }
  if (!bound.length && (mm = tx.match(/\b(?:each opponent|target opponent|an opponent) loses (\d+) life/i))) { const v = +mm[1]; opts.push({ label: `Opponent loses ${v} life`, fn: () => changeOppLife(-v) }); }
  if (!bound.length && (mm = tx.match(/\bdeals? (\d+) damage to (?:any target|target (?:opponent|player)|each opponent|target creature or (?:player|planeswalker)|target player or planeswalker)/i))) { const v = +mm[1]; opts.push({ label: `Deal ${v} damage to the opponent`, fn: () => changeOppLife(-v) }); }
  for (const sent of txs.replace(/\([^)]*\)/g, '').replace(/\n/g, ' ').split(/(?<=\.)\s+/)) { if (bound.length && /\btarget\b/i.test(sent)) continue; opts.push(...durationOptions(sent, obj, (obj.targets || []).filter(t => t.kind === 'perm' && !t.gone).map(t => ({ id: t.id, name: t.name })))); }
  if ((mm = tx.match(/\b(scry|surveil)\s+(\d+)/i))) { const w = mm[1], v = +mm[2]; opts.push({ label: `${w[0].toUpperCase() + w.slice(1)} ${v}`, fn: () => openScry(v, /surveil/i.test(w), obj && obj.name ? `${obj.name}: ${w.toLowerCase()} ${v}.` : '') }); }
  if ((mm = txs.match(/\bmills? (\d+|X) cards?|\bmill (\d+)\b/i)) && !/opponent/i.test(tx) && !isNaN(+(mm[1] || mm[2]))) { const v = +(mm[1] || mm[2]); opts.push({ label: `Mill ${v}`, fn: () => millCards(v) }); }
  if ((mm = txs.match(/\bremove (an?|one|two|three|four|five|\d+) ([a-z][a-z-]*) counters? from (?:~|this \w+\b)/i)) && obj.sourceId && mm[2].toLowerCase() !== 'all') { const v = /^\d+$/.test(mm[1]) ? +mm[1] : (TOKEN_NUMW[mm[1].toLowerCase()] || 1), kd = mm[2].toLowerCase(); opts.push({ label: `Remove ${v === 1 ? 'an' : v} ${kd} counter${pl(v)} from ${src}`, fn: () => addCounter(obj.sourceId, -v, kd === 'plus' ? 'plus' : kd) }); }
  if (obj.sourceId && /\byou may exile (?:it|~)\b/i.test(txs)) {
    const combo = /\byou may exile (?:it|~)\b[^.]*\.\s*If you do, create\b/i.test(txs), defs = combo ? tokenDefsFromText(txs, src).filter(d => !d.amassOnly) : [];
    opts.push({ label: combo && defs.length ? `Exile ${src}, then create ${defs.map(d => d.name).join(', ')}` : `Exile ${src}`, fn: () => { const f = findCard(obj.sourceId); if (f && (f.zone === 'battlefield' || f.zone === 'graveyard')) { log(`${src}: exiled`); moveCard(f.card.id, 'exile'); for (const d of defs) makeTokensFromDef(d, typeof d.count === 'number' ? d.count : 1, src); } else toast('Already gone', `${src} is no longer on the battlefield, so you cannot exile it.`); } });
  }
  if ((mm = txs.match(/put (a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+) \+1\/\+1 counters? on (?:~|this \w+\b|it\b)/i)) && obj.sourceId) { const v = wnum(mm[1]); opts.push({ label: v === 1 ? 'Add a +1/+1 counter' : `Add ${v} +1/+1 counters`, fn: () => addCounter(obj.sourceId, v, 'plus') }); }
  { const sp0 = parseTargetSpecs(tx);
    for (const d of tokenDefsFromText(tx, src)) {
      if (d.amassOnly) continue;
      if (obj.sourceId && /\byou may exile (?:it|~)\b[^.]*\.\s*If you do, create\b/i.test(txs)) continue;   // offered together with the exile option
      const lbl = (n) => `Create ${n === 'X' ? 'X' : n} ${d.pt ? d.pt + ' ' : ''}${d.name} token${n === 1 ? '' : 's'}`;
      const ix = sp0.findIndex(sp => sp.kind === 'player'), tgt = ix >= 0 && /\btarget (?:player|opponent) creates?\b/i.test(tx) ? (obj.targets || []).find(t => t.spec === ix) : null;
      if (tgt && tgt.id === 'opp') { opts.push({ label: `Opponent creates ${d.count} ${d.pt ? d.pt + ' ' : ''}${d.name} token${d.count === 1 ? '' : 's'} (their side is not tracked: log only)`, fn: () => log(`${src}: opponent creates ${d.count} ${d.name} token${d.count === 1 ? '' : 's'}`) }); continue; }
      opts.push({ label: lbl(d.count), fn: () => { let n = d.count; if (n === 'X') { n = parseInt(prompt(`How many ${d.name} tokens (X)?`, '1'), 10) || 0; } if (n > 0) makeTokensFromDef(d, n, src); } });
    } }
  const txNq = tx.replace(/"[^"]*"/g, ' ');
  if (!/^\{T\}/.test(tx) && (mm = txNq.match(/\badd ((?:\{[WUBRGC]\})+)/i)) && !/for each|any number/i.test(tx)) { const cols = [...mm[1].matchAll(/\{([WUBRGC])\}/g)].map(x => x[1]); opts.push({ label: `Add ${cols.join('')}`, fn: () => { snap(); for (const col of cols) addFloatingMana(col); render(); } }); }
  if ((mm = txNq.match(/\badd (two|three|four|five|\d+) mana of any (one )?color\b/i))) { const nn = wordN(mm[1]); opts.push({ label: `Add ${nn} mana of any one color`, fn: () => openManaChoice({ name: src }, col => { if (col) { snap(); addFloatingMana(col, nn); render(); } }, ['W', 'U', 'B', 'R', 'G']) }); }
  if ((mm = txNq.match(/\badd (two|three|four|five|\d+) mana in any combination of colors\b/i))) { const nn = wordN(mm[1]); opts.push({ label: `Add ${nn} mana in any combination of colors`, fn: () => { let left = nn; const next = () => { if (left <= 0) return; openManaChoice({ name: src + ` (${left} left)` }, col => { if (col) { snap(); addFloatingMana(col, 1); left--; render(); next(); } }, ['W', 'U', 'B', 'R', 'G']); }; next(); } }); }
  if (/\btake an extra turn after this one\b/i.test(tx)) opts.push({ label: 'Take an extra turn after this one', fn: () => { state.extraTurns = (state.extraTurns || 0) + 1; log(`${src}: you will take an extra turn after this one`); toast('Extra turn', 'You take another turn right after this one (rule 500.7). In a goldfish every turn is already yours; the log notes it.'); } });
  if (/\badd one mana of any color\b/i.test(txNq)) opts.push({ label: 'Add one mana of any color', fn: () => openManaChoice({ name: src }, col => { if (col) { snap(); addFloatingMana(col); render(); } }, ['W', 'U', 'B', 'R', 'G']) });
  if (obj.sourceId && (mm = tx.match(/\bgains? \"([^\"]+(?:\"[^\"]*\"[^\"]*)?)\"\s*\.?\s*$/i)) && /^[^"]* gains? "/.test(tx.replace(new RegExp((obj.sourceName||'~').replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'),'~'))) { const gl = mm[1]; opts.push({ label: `${src} gains "${gl}"`, fn: () => { const f = findCard(obj.sourceId); if (f && f.zone === 'battlefield') { snap(); f.card.gained = (f.card.gained || []).concat([gl]); log(`${src} gains "${gl}"`); render(); } } }); return [opts[opts.length - 1]]; }
  // v0.65 graveyard-based effects
  if (/\bshuffles? (?:your|their) graveyard into (?:your|their) library\b/i.test(tx)) opts.push({ label: 'Shuffle your graveyard into your library', fn: () => { snap(); state.library.push(...state.graveyard.splice(0)); shuffleLibrary(); log(`${src}: graveyard shuffled into the library`); render(); } });
  if (obj.sourceId && /\byou may put it onto the battlefield\b/i.test(txs)) opts.push({ label: `Put ${src} onto the battlefield`, fn: () => { const f = findCard(obj.sourceId); if (f && f.zone === 'graveyard') { snap(); state.graveyard.splice(f.idx, 1); enterBattlefield(f.card, { from: 'graveyard', logMsg: `${src}: put onto the battlefield from the graveyard` }); render(); flushTriggers(); } else toast('Not in graveyard', `${src} is no longer in your graveyard.`); } });
  if (obj.sourceId && (mm = txs.match(/you may exile an? ([a-z]+) creature card other than ~ from your graveyard\. If you do, return ~ to the battlefield/i))) { const col = mm[1].toLowerCase(); opts.push({ label: `Exile a ${col} creature card from your graveyard to return ${src}`, fn: () => { const f = findCard(obj.sourceId); if (!f || f.zone !== 'graveyard') { toast('Not in graveyard', `${src} is no longer in your graveyard.`); return; } const cards = state.graveyard.filter(x => x.id !== f.card.id && descMatchesCard(col + ' creature', x.name)); if (!cards.length) { toast('Nothing to exile', `You need another ${col} creature card in your graveyard.`); return; } openPickCards({ title: `${src}: exile a ${col} creature card`, note: `Exile one to return ${src} to the battlefield.`, cards, max: 1, done: picked => { if (!picked.length) return; snap(); const x = picked[0], i = state.graveyard.findIndex(g => g.id === x.id); if (i >= 0) state.exile.push(...state.graveyard.splice(i, 1)); const f2 = findCard(obj.sourceId); if (f2 && f2.zone === 'graveyard') { state.graveyard.splice(f2.idx, 1); enterBattlefield(f2.card, { from: 'graveyard', logMsg: `${src}: exiled ${x.name} and returned to the battlefield` }); } render(); flushTriggers(); } }); } }); }
  // v0.63 generic effects
  { const se = searchEffect(tx, src, obj); if (se && !(/\{T\}, Sacrifice/i.test(tx))) opts.push(se);
    const ge = graveReturnEffect(tx, src); if (ge && !bound.length) opts.push(ge);
    if (/flip a coin/i.test(tx)) { const lm = tx.match(/if you lose the flip,[^.]*?deals? (\d+) damage to you/i); opts.push({ label: lm ? `Flip a coin (lose: take ${lm[1]} damage)` : 'Flip a coin', fn: () => { const win = flipCoin(); log(`${src}: coin flip - you ${win ? 'win' : 'lose'} the flip`); toast('Coin flip', win ? 'You won the flip.' : 'You lost the flip.' + (lm ? ` ${src} deals ${lm[1]} damage to you.` : '')); if (!win && lm) changeLife(-+lm[1], true); } }); }
    else if ((mm = txs.match(/\b(?:~|it) deals? (\d+) damage to you\b/i))) { const v = +mm[1], cond = /if ~ is tapped/i.test(txs); opts.push({ label: `${cond ? 'If tapped: ' : ''}take ${v} damage`, fn: () => { if (cond) { const f = obj.sourceId && findCard(obj.sourceId); if (f && !f.card.tapped) { toast('Not tapped', `${src} is untapped, so it deals no damage.`); return; } } changeLife(-v, true); } }); }
    if (obj.sourceId && /\buntap (?:~|this \w+)\b/i.test(txs)) opts.push({ label: `Untap ${src}`, fn: () => { const f = findCard(obj.sourceId); if (f && f.zone === 'battlefield' && f.card.tapped) toggleTap(f.card.id); } });
    if (obj.sourceId && /^(?:then )?(?:you may )?sacrifice (?:~|it|this \w+)(?: unless it escaped)?\.?$/i.test(txs.trim().replace(/^.*\.\s+(?=then sacrifice)/i, ''))) opts.push({ label: `Sacrifice ${src}`, fn: () => { const f = findCard(obj.sourceId); if (f && f.zone === 'battlefield') { log(`${src}: sacrificed`); moveCard(f.card.id, 'graveyard'); } } });
    if (obj.sourceId && (mm = txs.match(/return ~ from your graveyard to (your hand|the battlefield)/i))) opts.push({ label: `Return ${src} from the graveyard to ${mm[1].toLowerCase()}`, fn: () => { const f = findCard(obj.sourceId); if (f && f.zone === 'graveyard') moveCard(f.card.id, /hand/i.test(mm[1]) ? 'hand' : 'battlefield'); } });
    if (obj.sourceId && (mm = txs.match(/put (a|an|one|two|three|\d+) ([a-z]+) counters? on (?:~|this \w+)/i)) && !/\+1\/\+1/.test(mm[0]) && mm[2].toLowerCase() !== 'a') { const v = wnum(mm[1]), kd = mm[2].toLowerCase(); opts.push({ label: `Put ${v === 1 ? 'a' : v} ${kd} counter${v === 1 ? '' : 's'} on ${src}`, fn: () => addCounter(obj.sourceId, v, kd) }); }
  }
  return bound.concat(opts);
}
function openAbilityEffect(obj, done) {
  const tx = obj.text || '';
  if (obj.special === 'suspendTick') {
    const f = findCard(obj.sourceId);
    if (f && f.zone === 'exile' && f.card.timeCounters > 0) {
      f.card.timeCounters--; const n = f.card.timeCounters;
      log(`${f.card.name}: removed a time counter (${n} left)`);
      if (n === 0) state.pendingTriggers.push({ kind: 'ability', cardId: f.card.id, cardName: f.card.name, special: 'suspendCast', optional: true, text: `Suspend — When the last time counter is removed from ${f.card.name}, you may cast it without paying its mana cost.`, effect: 'Cast it for free.', why: 'That was its last time counter.' });
      else toast(`${f.card.name}`, `${n} time counter${n === 1 ? '' : 's'} left.`);
    }
    render(); if (done) done(); return;
  }
  if (obj.special === 'suspendCast') { suspendCastFree(obj.sourceId, done); return; }
  if ((obj.special === 'surveil' || obj.special === 'scry') && obj.n) {
    openScry(obj.n, obj.special === 'surveil', obj.text || '', () => { log(`Resolved: ${obj.name}`); if (done) done(); }); return;
  }
  if (!obj.targets && !obj._tgtAsked) {   // a trigger (or anything put on the stack without targets): choose them now
    const specs = parseTargetSpecs(tx);
    if (specs.length) { obj._tgtAsked = true; chooseTargets(obj.sourceName || 'Effect', specs, picked => { obj.targets = picked; if (picked[0] && picked[0].kind === 'player') obj.target = picked[0].id; openAbilityEffect(obj, done); }, { srcId: obj.sourceId, onCancel: () => openAbilityEffect(obj, done) }); return; }
  }
  const m = modal(obj.sourceName ? `Resolving: ${obj.sourceName}` : 'Ability resolves', { width: 600, sticky: true, noClose: true });
  const opts = effectOptions(tx, obj);
  const delayed = /\bat the beginning of (?:the )?next (?:turn's )?upkeep\b/i.test(tx);
  for (const o of opts) if (o.special === 'delayedDraw' && !obj._delayedSet) { obj._delayedSet = true; addFx({ kind: 'delayed', when: 'upkeep', draw: 1, text: 'Draw a card.', srcName: obj.sourceName, srcId: obj.sourceId || null }); log(`${obj.sourceName}: you will draw a card at the beginning of the next turn's upkeep`); }
  const used = new Set();
  const box = h('div', { class: 'prelist' });
  for (const o of opts) {
    if (o.special === 'delayedDraw') continue;
    if (o.special === 'lookTop') {
      const out = h('span', { class: 'muted small' });
      const go = h('button', { class: 'primary', text: obj.target === 'opp' ? 'Look (opponent)' : 'Look at your top card' });
      go.addEventListener('click', () => {
        go.disabled = true;
        if (obj.target === 'opp') { out.textContent = 'You target an opponent. A goldfish game has no opponent library, so there is nothing to see. The card stays where it is.'; return; }
        const top = state.library[0];
        if (!top) { out.textContent = 'Your library is empty.'; return; }
        const i = cardInfo(top.name);
        out.replaceChildren(h('b', { text: top.name }), ` ${i && i.mc ? i.mc : ''} ${i && i.t ? '· ' + i.t : ''} (it stays on top)`);
        log(`${obj.sourceName}: looked at the top card of your library: ${top.name}`);
      });
      box.append(h('div', { class: 'row' }, h('span', { class: 'nm', text: obj.target === 'opp' ? 'Look at the top card of the opponent’s library' : 'Look at the top card of your library' }), go), h('div', { class: 'row' }, out));
    } else if (o.special === 'payLifeDraw') {
      const inp = h('input', { type: 'number', min: 0, max: Math.max(0, state.life), value: 0, style: 'width:70px' });
      const go = h('button', { class: 'primary', text: 'Pay life and draw' });
      go.addEventListener('click', () => {
        const n = Math.max(0, Math.min(parseInt(inp.value, 10) || 0, state.life));
        if (!n) { toast('Nothing paid', 'You chose to pay 0 life, so you draw nothing.'); return; }
        if (n >= state.life && !confirm(`Paying ${n} life would put you at ${state.life - n}. Continue?`)) return;
        snap(); state.life -= n; const d = drawCards(n); log(`${obj.sourceName}: paid ${n} life, drew ${d}`);
        go.disabled = true; inp.disabled = true; render();
      });
      box.append(h('div', { class: 'row' }, h('span', { class: 'nm', text: 'How much life do you pay?' }), inp, go));
    } else if (o.special === 'cascade') {
      const go = h('button', { class: 'primary', text: 'Resolve cascade…' });
      go.addEventListener('click', () => { m.close(); openCascade(obj, done); });
      box.append(h('div', { class: 'row' }, h('span', { class: 'nm', text: 'Reveal cards until a cheaper nonland card' }), go));
    } else {
      const b = h('button', { text: 'Apply', onclick: () => { if (used.has(o.label)) return; used.add(o.label); b.disabled = true; o.fn(); } });
      box.append(h('div', { class: 'row' }, h('span', { class: 'nm', text: o.label }), b));
    }
  }
  m.body.append(
    h('div', { class: 'psub', text: tx || 'This ability has no text.' }),
    delayed ? h('div', { class: 'psub', text: 'A delayed triggered ability was created. In a real game the next turn is your opponent’s, so you draw during THEIR upkeep. In this goldfish game there is no opponent turn, so you draw at the start of your own next upkeep, before your draw step.' }) : null,
    opts.length ? h('div', { class: 'muted small', text: 'Suggested effects. You decide: click to apply them, or do them by hand with the card menus (targets and choices are up to you).' }) : h('div', { class: 'muted small', text: 'I do not recognise an effect I can apply automatically. Carry it out by hand using the card menus, then press Done.' }),
    box);
  m.foot.append(h('button', { class: 'primary', text: 'Done', onclick: () => { m.close(); log(`Resolved: ${obj.name}`); if (done) done(); } }));
}
function openCascade(obj, done) {
  const src = cardInfo(obj.sourceName), mv = src ? src.cmc : 0;
  snap();
  const seen = []; let hit = null;
  while (state.library.length) {
    const c = state.library.shift(); seen.push(c);
    const i = cardInfo(c.name);
    if (i && !i.land && i.cmc < mv) { hit = c; break; }
  }
  const m = modal(`Cascade ${mv}`, { width: 560, sticky: true, noClose: true });
  const bottom = list => { const l = shuffle([...list]); state.library.push(...l); };
  m.body.append(
    h('div', { class: 'psub', text: hit ? `Exiled ${seen.length} card${seen.length === 1 ? '' : 's'}. The first nonland card with mana value less than ${mv} is ${hit.name}.` : `No nonland card with mana value below ${mv} was found. All ${seen.length} exiled cards go to the bottom.` }),
    h('div', { class: 'prelist' }, seen.map(c => h('div', { class: 'row' }, h('span', { class: 'nm', text: c.name }), c === hit ? h('span', { class: 'ok', text: 'hit' }) : h('span', { class: 'muted small', text: 'bottom' })))));
  const finish = cast => {
    m.close();
    const rest = seen.filter(c => c !== hit || !cast);
    bottom(rest);
    if (cast && hit) { state.stack.push(hit); state.priority = { active: true, passed: false }; log(`Cascade: cast ${hit.name} without paying its mana cost`); fireTrigger('cast', { card: hit }); }
    else log(`Cascade: nothing cast; ${seen.length} cards on the bottom`);
    render();
    if (done) done();
    if (cast && hit) { if (state.pendingTriggers.length) resolvePendingTrigger(); else openStack(); }
  };
  if (hit) m.foot.append(h('button', { text: 'Do not cast', onclick: () => finish(false) }), h('button', { class: 'primary', text: `Cast ${hit.name} free`, onclick: () => finish(true) }));
  else m.foot.append(h('button', { class: 'primary', text: 'OK', onclick: () => finish(false) }));
}

// ---------------------------------------------------------------- static effects (Necrodominance, Rest in Peace, ...)
function staticFx() {
  const fx = { skipDraw: null, maxHand: 7, gyExile: null };
  if (!state) return fx;
  const W = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  for (const c of state.battlefield) {
    const tx = cardText(c);
    if (!tx) continue;
    if (/\bskip your draw step\b/i.test(tx)) fx.skipDraw = fx.skipDraw || c.name;
    if (/you have no maximum hand size/i.test(tx)) fx.maxHand = Infinity;
    const m = tx.match(/your maximum hand size is (\w+)/i);
    if (m) { const v = W[m[1].toLowerCase()] !== undefined ? W[m[1].toLowerCase()] : parseInt(m[1], 10); if (!isNaN(v) && v < fx.maxHand) fx.maxHand = v; }
    if (/would be put into (?:your |a )?graveyard from anywhere, exile/i.test(tx)) fx.gyExile = fx.gyExile || c.name;
  }
  return fx;
}
// ---------------------------------------------------------------- zone changes: ONE way onto and off the battlefield
// Whatever puts a permanent onto the battlefield (playing a land, a spell resolving, a fetch, a reanimation, a token,
// dragging a card by hand) goes through enterBattlefield(); whatever takes one off goes through leaveBattlefield().
// That is where "enters tapped", the shockland question, surveil lands, enters-the-battlefield triggers, landfall, the
// legend rule, replacement effects ("exile it instead"), dies/leaves triggers and the turn memory are handled, once.
function memNote(kind, c) {
  if (!state || !c) return;
  let m = state.mem; if (!m || m.turn !== state.turn) m = state.mem = { turn: state.turn, entered: [], left: [], died: [] };
  m[kind].push({ id: c.id, name: c.name, type: c.token ? 'Token Creature' : (frontType(c) || ''), token: !!c.token });
}
// What happened this turn, e.g. memThisTurn('entered', x => /Creature/.test(x.type)).length
function memThisTurn(kind, pred) {
  const m = state && state.mem; if (!m || m.turn !== state.turn) return [];
  return (m[kind] || []).filter(pred || (() => true));
}
function enterBattlefield(c, o = {}) {
  if (!state || !c) return c;
  // o.from: 'hand' | 'stack' | 'library' | 'graveyard' | 'exile' | 'effect'   o.tapped: force tapped/untapped
  // o.logMsg: logged first   o.afterPlace(c): runs once it is on the battlefield, before any triggers (counters, flags)
  c.counters = c.counters || { plus: 0, minus: 0 };
  sfx(!c.token && isLandName(c.name) ? 'land' : 'enter');
  if (o.logMsg) log(o.logMsg);
  const et = o.tapped !== undefined ? { tapped: !!o.tapped, why: o.why || '' } : (c.token ? { tapped: false, why: '' } : etbTapped(c));
  state.battlefield.push(c);
  applyEtbTapped(c, et);
  etbCounters(c);
  if (isSaga(c)) { try { sagaAdvance(c, true); } catch (e) { console.error(e); } }
  if (!c.token && /\bliving weapon\b/i.test(cardText(c))) { try { livingWeapon(c); } catch (e) { console.error(e); } }
  if (isAuraCard(c) && !c.att && o.from !== 'effect') queueTrigger({ kind: 'attach', cardId: c.id });
  if (!c.token) { const tx0 = (cardText(c) || '').replace(/\u2019/g, "'"); let cm;
    if ((cm = tx0.match(/^If .+ would enter the battlefield, you may discard an? ([a-z]+) card instead\./im))) queueTrigger({ kind: 'discardInstead', cardId: c.id, what: cm[1] });
    else if ((cm = tx0.match(/^As .+ enters the battlefield, choose an? ([^.\n]+)\./im)) && !/\bfrom among\b/i.test(cm[1])) queueTrigger({ kind: 'choose', cardId: c.id, what: cm[1].trim().toLowerCase() }); }
  memNote('entered', c);
  if (o.afterPlace) o.afterPlace(c);
  landEntryTriggers(c, o.from !== 'hand');   // a land you played can be taken back; one put there by an effect cannot
  permanentEntered(c);
  return c;
}
function leaveBattlefield(c, dest = 'graveyard', o = {}) {
  if (!state || !c) return null;
  const i = state.battlefield.findIndex(x => x.id === c.id);
  if (i >= 0) state.battlefield.splice(i, 1);
  memNote('left', c);
  fxOnLeave(c);
  detachFrom(c);
  for (const k of ['tmp', 'tmpKw', 'exileAtEnd', 'target', 'targets', 'dmg', 'xValue', 'modes', 'modeTexts', 'loyalty', 'evoked', 'kicked', 'gained']) delete c[k];
  c.tapped = false; c.counters = { plus: 0, minus: 0 }; c._noCtr = false;
  delete c.chosen;
  if (c.origName) { c.name = c.origName; delete c.origName; }
  if (c.exileInstead && dest !== 'exile') { log(`${c.name} would leave the battlefield, so it is exiled instead`); dest = 'exile'; }
  delete c.exileInstead;
  if (c.token) {   // a token that leaves the battlefield ceases to exist, but it did leave (and may have died)
    log(`Token ${c.name} left the battlefield`);
    if (dest === 'graveyard') { memNote('died', c); fireTrigger('dies', { card: c }); }
    fireTrigger('leaves', { card: c });
    return 'gone';
  }
  if (dest === 'graveyard') { const where = gyPush(c, 'battlefield'); if (where === 'graveyard') memNote('died', c); return where; }
  if (dest === 'exile') state.exile.push(c);
  else if (dest === 'hand') state.hand.push(c);
  else if (dest === 'library') { if (o.pos === 'bottom') state.library.push(c); else state.library.unshift(c); }
  else state[dest].push(c);
  fireTrigger('leaves', { card: c });
  return dest;
}
// Every card going to the graveyard goes through here so replacement effects can apply.
let discardHow = null, silentGy = false;
function gyPush(c, from) {
  if (c.exileInstead && from === 'battlefield') { delete c.exileInstead; delete c.exileAtEnd; state.exile.push(c); log(`${c.name} would leave the battlefield, so it is exiled instead`); fireTrigger('leaves', { card: c }); return 'exile'; }   // (leaveBattlefield normally handles this first)
  const fx = staticFx();
  if (fx.gyExile && !(c.id === undefined)) {
    state.exile.push(c);
    log(`${c.name} would go to the graveyard, but ${fx.gyExile} exiles it instead`);
    toast('Exiled instead', `${fx.gyExile} replaces going to the graveyard.`);
    if (from === 'battlefield') fireTrigger('leaves', { card: c });
    return 'exile';
  }
  state.graveyard.push(c);
  if (from === 'battlefield') { fireTrigger('dies', { card: c }); fireTrigger('leaves', { card: c }); }
  if (!silentGy) { fireTrigger('gyenter', { card: c, from }); if (from === 'hand') fireTrigger('discard', { card: c, how: discardHow || 'discard' }); }
  return 'graveyard';
}

// ---------------------------------------------------------------- planeswalkers
function isPlaneswalker(c) { return /\bPlaneswalker\b/.test(frontType(c)); }
function pwAbilities(c) {
  const info = !c.token && cardInfo(c.name);
  if (!info || !info.tx) return [];
  const out = [];
  for (const line of info.tx.split('\n')) {
    const m = line.trim().match(/^([+−–‒-]?)\s?(\d+|X):\s*(.+)$/);
    if (!m) continue;
    const neg = /[−–‒-]/.test(m[1]), isX = m[2] === 'X', n = isX ? 0 : parseInt(m[2], 10);
    if (!m[1] && n !== 0) continue;
    out.push({ label: (neg ? '−' : m[1] === '+' ? '+' : '') + m[2], cost: isX ? 0 : (neg ? -n : n), neg, isX, text: m[3] });
  }
  return out;
}
function pwBlock(c, ab) {
  if (!canPlaySorcerySpeedNow()) return 'Loyalty abilities can only be activated in your main phase with an empty stack.';
  if (c.activatedTurn === state.turn) return 'You can activate only one loyalty ability per planeswalker each turn.';
  if (ab.neg && !ab.isX && (c.loyalty || 0) < -ab.cost) return 'Not enough loyalty counters to pay this cost.';
  if (ab.isX && (c.loyalty || 0) < 1) return 'Not enough loyalty counters.';
  return '';
}
function checkLoyalty(c) {
  if (!state || !isPlaneswalker(c) || (c.loyalty || 0) > 0) return;
  const f = findCard(c.id);
  if (!f || f.zone !== 'battlefield') return;
  log(`${c.name} has 0 loyalty: put into the graveyard (state-based action)`);
  toast(`${c.name} dies`, 'A planeswalker with 0 loyalty counters is put into its owner’s graveyard.');
  leaveBattlefield(c, 'graveyard');
}
function adjustLoyalty(id, d) {
  const f = findCard(id); if (!f) return; snap();
  f.card.loyalty = Math.max(0, (f.card.loyalty || 0) + d);
  log(`${f.card.name}: loyalty ${d > 0 ? '+' : ''}${d} → ${f.card.loyalty}`);
  checkLoyalty(f.card); render(); flushTriggers();
}
function activatePW(c, ab, x) {
  snap();
  const delta = ab.isX ? -x : ab.cost;
  c.loyalty = Math.max(0, (c.loyalty || 0) + delta);
  c.activatedTurn = state.turn;
  state.stack.push({ ability: true, pw: true, id: state.nextId++, name: `${c.name} (${ab.label})`, sourceId: c.id, sourceName: c.name, text: ab.text });
  state.priority = { active: true, passed: false };
  log(`${c.name}: activated ${ab.isX ? '−' + x : ab.label} (loyalty now ${c.loyalty}); ability on the stack`);
  checkLoyalty(c);
  render();
  openStack();
}
function openLoyalty(c) {
  if (!state || !isPlaneswalker(c)) return;
  const abs = pwAbilities(c);
  const m = modal(`${c.name}: loyalty ${c.loyalty ?? '?'}`, { width: 640, sticky: false });
  m.body.append(h('div', { class: 'psub', text: 'Loyalty abilities cost loyalty counters: + adds them, − removes them (you pay when you activate). Once per turn, only in your main phase with an empty stack, like a sorcery.' }));
  if (!abs.length) m.body.append(h('div', { class: 'muted', text: 'No loyalty abilities were found in the card text. Use the card menu to change loyalty by hand.' }));
  for (const ab of abs) {
    const why = pwBlock(c, ab);
    const xin = ab.isX ? h('input', { type: 'number', min: 1, max: c.loyalty || 1, value: 1, style: 'width:60px' }) : null;
    const go = h('button', { class: 'primary', text: 'Activate', disabled: !!why, title: why });
    go.addEventListener('click', () => { const x = xin ? Math.max(1, Math.min(parseInt(xin.value, 10) || 1, c.loyalty || 1)) : 0; m.close(); activatePW(c, ab, x); });
    m.body.append(h('div', { class: 'row pwrow' }, h('span', { class: 'pwcost', text: ab.label }), h('span', { class: 'nm', text: ab.text }), ...(xin ? [xin] : []), go),
      ...(why ? [h('div', { class: 'muted small', style: 'margin:-2px 0 6px 6px', text: why })] : []));
  }
  m.foot.append(h('button', { text: '−1 loyalty (damage)', onclick: () => { m.close(); adjustLoyalty(c.id, -1); } }), h('button', { text: '+1 loyalty', onclick: () => { m.close(); adjustLoyalty(c.id, 1); } }), h('button', { class: 'primary', text: 'Close', onclick: () => m.close() }));
}

function resolvePendingTrigger(){
  if(!state||!state.pendingTriggers.length||legendOpen)return;
  if(state.pendingTriggers[0].kind==='ability'){
    const batch=[]; while(state.pendingTriggers.length && state.pendingTriggers[0].kind==='ability') batch.push(state.pendingTriggers.shift());
    openTriggerBatch(batch); return;
  }
  const t=state.pendingTriggers.shift();
  if(t.kind==='scry'||t.kind==='surveil') openScry(t.n,t.kind==='surveil',t.text);
  else if(t.kind==='shock') openShockChoice(t.cardId,t.fetched);
  else if(t.kind==='vesuva') openVesuva(t.cardId);
  else if(t.kind==='attach') openAttachChoice(t.cardId);
  else if(t.kind==='discardInstead') openDiscardInstead(t.cardId,t.what);
  else if(t.kind==='choose') openChoose(t.cardId,t.what);
  else if(t.kind==='sagaSac') { state.sagaWait = (state.sagaWait || []).concat([t.cardId]); sagaCheck(); }
}
function openTriggeredAbility(t){
  const c=findCard(t.cardId)?.card; const m=modal('Triggered ability',{width:560,sticky:true});
  m.body.append(h('div',{class:'ptitle',text:c?c.name:'Ability'}),h('div',{class:'psub'},t.text),h('div',{class:'muted small'},teach('triggerPrompts')?'Resolve this trigger before continuing.':''));
  m.foot.append(h('button',{class:'primary',text:'Resolve ability',onclick:()=>{m.close();log(`Resolved triggered ability — ${c?c.name:'unknown source'}`);resolvePendingTrigger();render();}}));
}
function shockLandChoice(c) {
  const tx=cardText(c); return SHOCKS.has(norm(c.name)) || (/pay 2 life/i.test(tx) && /enters.*battlefield/i.test(tx));
}
// Everything a land does as it enters the battlefield by any route (played, fetched, put there by an effect):
// the shockland question and "When this enters, surveil/scry N". Tapped-ness is decided by etbTapped().
function landEntryTriggers(c, fetched) {
  if(!state||!c||!isLandName(c.name)) return;
  if(norm(c.name)==='vesuva' && state.battlefield.some(x=>x.id!==c.id&&isLandName(x.name))) queueTrigger({kind:'vesuva',cardId:c.id});
  if(shockLandChoice(c)) queueTrigger({kind:'shock',cardId:c.id,fetched:!!fetched});
  const etb=landETBTrigger(c); if(etb) queueTrigger(etb);
}
function queueTrigger(t) { if(state && t) state.pendingTriggers.push(t); }
function resumePhase() {
  if(!state) return; state.phasePause=false;
  if(state.pendingTriggers.length) resolvePendingTrigger();
  else render();
}
function stackPriorityMessage(){
  return teach('stackGuidance') ? 'You have priority. You may cast an instant/flash spell or activate an ability before the top object resolves.' : 'Priority is active.';
}
// ---- contextual mana costs ("This spell costs {2} less to cast for each basic land type ...")
// "for each Locus on the battlefield" / "for each Goblin you control": permanents with that type or subtype. ctrl 'you' counts only yours
// (the app only tracks your side, so "on the battlefield" is your permanents too).
function countPermsOf(what) {
  const w = singularWord(String(what).trim().toLowerCase().replace(/^(?:other|another)\s+/, ''));
  if (!w || !state) return 0;
  return state.battlefield.filter(c => { const ti = permTypeInfo(c); return ti.subs.has(w) || ti.types.has(w); }).length;
}
function countForEach(phrase) {
  if (!state) return 0;
  const t = phrase.toLowerCase();
  const bf = state.battlefield;
  const typeOf = c => { const i = cardInfo(c.name); return i && i.t ? i.t.split(' // ')[0] : (c.token ? 'Creature' : ''); };
  if (/basic land type/.test(t)) return domainCount();
  if (/instant and sorcery card/.test(t) || /instant or sorcery card/.test(t)) return state.graveyard.filter(c => /\b(Instant|Sorcery)\b/.test(typeOf(c))).length;
  if (/card in your graveyard/.test(t)) return state.graveyard.length;
  if (/creature (card )?you control|creature on the battlefield/.test(t)) return bf.filter(c => /\bCreature\b/.test(typeOf(c))).length;
  if (/artifact you control/.test(t)) return bf.filter(c => /\bArtifact\b/.test(typeOf(c))).length;
  if (/enchantment you control/.test(t)) return bf.filter(c => /\bEnchantment\b/.test(typeOf(c))).length;
  if (/land you control/.test(t)) return bf.filter(c => isLandName(c.name)).length;
  if (/card in your hand/.test(t)) return state.hand.length;
  { const m = t.match(/^(?:each |an? )?([a-z][a-z'-]*)(?: you control| on the battlefield)?\.?$/); if (m && m[1] !== 'card' && m[1] !== 'permanent') { const n = countPermsOf(m[1]); if (n || /locus|goblin|elf|zombie|spirit|treasure|clue|food|army|orc/.test(m[1])) return n; } }
  return null;   // unsupported wording
}
function symCmc(mc) {
  let n = 0, m; const re = /\{([^}]+)\}/g;
  while ((m = re.exec(mc || ''))) n += /^\d+$/.test(m[1]) ? +m[1] : (m[1].toUpperCase() === 'X' ? 0 : 1);
  return n;
}
// ---------------------------------------------------------------- the cost system (v0.46)
// One model for what it costs to cast a spell or activate an ability (rules 601.2b-h):
//   1. choose HOW to pay: the normal cost, an alternative cost (evoke, "exile a blue card from your hand"...), optional extras (kicker)
//   2. work out the total: printed cost + increases (Thalia) - reductions (Goblin Electromancer, "costs {2} less for each...")
//   3. choose what pays the non-mana parts (which creature to sacrifice, which card to discard...)
//   4. Delve / Convoke / Improvise: cards that pay part of the mana
//   5. pay the mana (floating mana first, then lands)
// Nothing changes in the game until every choice is made; cancelling at any window leaves the game untouched.
const numw = w => (String(w).toLowerCase() === 'another' ? 1 : numOf(w));
const PICK_KINDS = ['sac', 'discard', 'exile', 'tapOther', 'bounce'];

function splitCostParts(t) {
  return String(t || '').replace(/’/g, "'").replace(/\.$/, '')
    .split(/,\s*(?![^{]*\})|\s+and\s+(?=(?:exile|discard|sacrifice|tap|return|pay|remove)\b)/i)
    .map(x => (x || '').trim().replace(/^and\s+/i, '')).filter(Boolean);
}
// "blue card", "creature or artifact", "another creature", "untapped Elf", "land card" -> a filter object
function parseCostFilter(phrase) {
  let s = String(phrase || '').toLowerCase().replace(/\b(?:you control|from your hand|from your graveyard|in your graveyard|on the battlefield)\b/g, ' ').replace(/\bcards?\b/g, ' ').trim();
  const f = { alts: [], other: false, untapped: false, text: String(phrase || '').trim() };
  if (/\b(?:another|other)\b/.test(s)) { f.other = true; s = s.replace(/\b(?:another|other)\b/g, ' '); }
  if (/\buntapped\b/.test(s)) { f.untapped = true; s = s.replace(/\buntapped\b/g, ' '); }
  for (const part of s.split(/\s+or\s+|,\s*/)) {
    const a = { types: [], colors: [], subs: [], nonland: false };
    for (const w0 of part.trim().split(/\s+/)) {
      if (!w0 || w0 === 'a' || w0 === 'an') continue;
      const w = singularWord(w0);
      if (w === 'nonland') a.nonland = true;
      else if (COLOR_LETTER[w]) a.colors.push(COLOR_LETTER[w]);
      else if (TYPE_WORDS.includes(w) || w === 'instant' || w === 'sorcery' || w === 'legendary') a.types.push(w);
      else a.subs.push(w);
    }
    f.alts.push(a);
  }
  if (!f.alts.length) f.alts.push({ types: [], colors: [], subs: [], nonland: false });
  return f;
}
function cardMatchesFilter(c, f, srcId) {
  if (f.other && c.id === srcId) return false;
  if (f.untapped && c.tapped) return false;
  const p = permTypeInfo(c), cols = c.token ? [] : (onBattlefield(c) ? effColors(c) : printedColors(c));
  return f.alts.some(a => (!a.types.length || a.types.some(t => p.types.has(t))) && (!a.colors.length || a.colors.some(x => cols.includes(x)))
    && (!a.subs.length || a.subs.some(sb => p.subs.has(sb))) && (!a.nonland || !p.types.has('land')));
}
// Parse a cost string ("{2}, {T}, Sacrifice a creature") into components.
function parseCostComps(text, short) {
  const nameRe = String(short || '~').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const out = [];
  for (const part of splitCostParts(text)) {
    let m;
    if (/^\{T\}$/i.test(part)) out.push({ k: 'tap' });
    else if (/^(?:\{[^}]+\})+$/.test(part)) out.push({ k: 'mana', mana: part });
    else if (new RegExp('^Sacrifice (?:' + nameRe + '|this \\w+|~|it)$', 'i').test(part)) out.push({ k: 'sacSelf' });
    else if ((m = part.match(new RegExp('^Remove (a|an|one|two|three|\\d+) (\\+1/\\+1|[\\u2212-]1/[\\u2212-]1) counters? from (?:' + nameRe + '|this \\w+|~|it)$', 'i')))) out.push({ k: 'removeCounter', n: numw(m[1]), kind: /^\+/.test(m[2]) ? 'plus' : 'minus' });
    else if ((m = part.match(/^Pay (\d+) life$/i))) out.push({ k: 'life', n: +m[1] });
    else if ((m = part.match(/^Sacrifice (a|an|another|one|two|three|\d+) (.+)$/i))) out.push({ k: 'sac', n: numw(m[1]), f: parseCostFilter((/^another$/i.test(m[1]) ? 'another ' : '') + m[2]), text: part });
    else if (/^Discard (?:this card|~|it)$/i.test(part) || new RegExp('^Discard ' + nameRe + '$', 'i').test(part)) out.push({ k: 'discardSelf' });
    else if ((m = part.match(/^Discard (a|an|one|two|three|\d+) (.+?)s?$/i))) out.push({ k: 'discard', n: numw(m[1]), f: parseCostFilter(m[2]), text: part });
    else if ((m = part.match(/^Exile (a|an|one|two|three|\d+) (.*?)\s*cards? from your (graveyard|hand)$/i))) out.push({ k: 'exile', n: numw(m[1]), zone: m[3].toLowerCase(), f: parseCostFilter(m[2]), text: part });
    else if ((m = part.match(/^Tap (a|an|one|two|three|\d+) untapped (.+?)(?: you control)?$/i))) out.push({ k: 'tapOther', n: numw(m[1]), f: parseCostFilter('untapped ' + m[2]), text: part });
    else if ((m = part.match(/^Return (a|an|one|two|three|\d+) (.+?) you control to (?:its|their) owner'?s? hand$/i))) out.push({ k: 'bounce', n: numw(m[1]), f: parseCostFilter(m[2]), text: part });
    else out.push({ k: 'other', text: part });
  }
  return out;
}
const manaOf = comps => comps.filter(k => k.k === 'mana').map(k => k.mana).join('');

// ---- cards that can pay for a component
function compCands(comp, srcId, taken) {
  const ok = c => !taken.has(c.id) && cardMatchesFilter(c, comp.f, srcId);
  switch (comp.k) {
    case 'sac': case 'bounce': return state.battlefield.filter(ok);
    case 'tapOther': return state.battlefield.filter(c => !c.tapped && ok(c));
    case 'discard': return state.hand.filter(c => c.id !== srcId && ok(c));
    case 'exile': return (comp.zone === 'hand' ? state.hand : state.graveyard).filter(c => c.id !== srcId && ok(c));
  }
  return [];
}
// '' when every component can be paid right now, otherwise a plain-words reason.
function compsFeasible(comps, srcId) {
  if (!state) return '';
  const taken = new Set(); let life = 0;
  for (const comp of comps) {
    if (comp.k === 'life') life += comp.n;
    else if (PICK_KINDS.includes(comp.k)) {
      const c = compCands(comp, srcId, taken);
      if (c.length < comp.n) return `${comp.text} (you do not have ${comp.n === 1 ? 'one' : comp.n} to use)`;
      c.slice(0, comp.n).forEach(x => taken.add(x.id));
    }
  }
  if (life && state.life < life) return `Pay ${life} life (you have ${state.life})`;
  return '';
}

// ---- cost increases and reductions from permanents (Thalia, Goblin Electromancer, Sphere of Resistance...)
function spellSubjTest(subj) {
  const s = String(subj || '').toLowerCase().trim();
  if (!s) return () => true;
  const tests = s.split(/\s+(?:and|or)\s+|,\s*/).map(p0 => {
    let p = p0.trim(), neg = false;
    if (/^non/.test(p)) { neg = true; p = p.slice(3); }
    let f;
    if (COLOR_LETTER[p]) f = c => printedColors(c).includes(COLOR_LETTER[p]);
    else if (p === 'multicolored') f = c => printedColors(c).length > 1;
    else if (p === 'colorless') f = c => printedColors(c).length === 0;
    else if (p === 'historic') f = c => { const t = permTypeInfo(c); return t.types.has('artifact') || t.legendary || t.subs.has('saga'); };
    else f = c => permTypeInfo(c).types.has(p);
    return neg ? c => !f(c) : f;
  });
  return c => tests.some(t => t(c));
}
function costAdjustments(c) {
  const out = []; if (!state || !c) return out;
  const test = (src, dir, amt, subj) => { if (amt > 0 && spellSubjTest(subj)(c)) out.push({ src, dir, amt }); };
  for (const g of state.battlefield) {
    if (g.token) continue;
    const i = cardInfo(g.name); if (!i || !i.tx) continue;
    for (const raw of i.tx.replace(/\([^)]*\)/g, '').replace(/’/g, "'").split('\n')) for (const seg of raw.split(/(?<=\.)\s+/)) {
      const m = seg.trim().match(/^(.*?)\s*\bspells?\s+(you cast\s+|your opponents cast\s+)?cost\s+((?:\{[^}]+\})+)\s+(more|less)\s+to cast\b/i);
      if (!m || /opponents/i.test(m[2] || '')) continue;
      test(g.name, m[4].toLowerCase(), (m[3].match(/\{(\d+)\}/g) || []).reduce((a, x) => a + parseInt(x.slice(1), 10), 0), m[1]);
    }
  }
  for (const mod of (state.costMods || [])) test(mod.label, mod.dir, mod.amt, mod.subj);
  return out;
}
// Returns { base, cost, reduced, increased, why, add, cut } for a card in the current game.
function effectiveCost(c) {
  const i = c && cardInfo(c.name);
  const base = i && i.mc ? i.mc.split(' // ')[0] : '';
  const out = { base, cost: base, reduced: 0, increased: false, why: '', add: 0, cut: 0 };
  if (!base || !state) return out;
  const gm = base.match(/\{(\d+)\}/), g0 = gm ? parseInt(gm[1], 10) : 0;
  const notes = []; let add = 0, cut = 0;
  const tx = (i.tx || '').replace(/\([^)]*\)/g, '');
  const re = /costs?\s+((?:\{[^}]+\})+)\s+less to cast\b[^.]*?\bfor each ([^.]+?)\./i, m = tx.match(re);
  if (m) {
    const per = (m[1].match(/\{(\d+)\}/g) || []).reduce((a, x) => a + parseInt(x.slice(1), 10), 0), n = countForEach(m[2]);
    if (per && n !== null && per * n > 0) { cut += per * n; notes.push(`${n} × {${per}} less (${m[2].replace(/ you control$/, '').replace(/^basic land type among lands$/, 'basic land type')})`); }
  }
  const am = tx.match(/^Affinity for ([a-z ]+?)\s*$/im);
  if (am) { const w = singularWord(am[1].trim().split(/\s+/).pop()), n = state.battlefield.filter(x => { const p = permTypeInfo(x); return p.types.has(w) || p.subs.has(w); }).length; if (n) { cut += n; notes.push(`Affinity: ${n} × {1} less (${am[1].trim()})`); } }
  for (const a of costAdjustments(c)) { if (a.dir === 'more') add += a.amt; else cut += a.amt; notes.push(`${a.src} ${a.dir === 'more' ? '+' : '−'}{${a.amt}}`); }
  out.add = add; out.cut = cut;
  const g1 = Math.max(0, g0 + add - cut), net = g1 - g0;
  if (net !== 0) out.cost = (g1 > 0 ? `{${g1}}` : '') + base.replace(/\{\d+\}/, '');
  out.reduced = Math.abs(net); out.increased = net > 0; out.why = notes.join('; ');
  return out;
}
// The same total adjustments applied to an alternative cost.
function taxed(mana, ec) {
  const p = manaCostParts(mana || '');
  const g = Math.max(0, p.generic + ec.add - ec.cut);
  return (g ? `{${g}}` : '') + p.colors.map(x => `{${x}}`).join('') + p.flexible.map(x => `{${x}}`).join('');
}

// ---- alternative and additional costs, read from the card's text
function altCostsFor(c) {
  const tx = cardText(c).replace(/\([^)]*\)/g, '').replace(/’/g, "'"), out = []; let m;
  for (const raw of tx.split('\n')) {
    const line = raw.trim();
    if ((m = line.match(/^Evoke\s+((?:\{[^}]+\})+)\s*$/i))) out.push({ kind: 'evoke', label: 'Evoke', mana: m[1], comps: [] });
    else if ((m = line.match(/^Evoke—(.+?)\.?$/i))) { const cs = parseCostComps(m[1], c.name); out.push({ kind: 'evoke', label: 'Evoke — ' + m[1].replace(/\.$/, ''), mana: manaOf(cs), comps: cs.filter(k => k.k !== 'mana') }); }
    else if ((m = line.match(/(?:^|\.\s+)(?:(If [^,]+),\s*)?you may ((?:pay|exile|discard|sacrifice|tap|return)\b[^.]*?) rather than pay (?:this spell's|its) mana cost/i))) {
      const cs = parseCostComps(m[2], c.name);
      out.push({ kind: 'alt', label: m[2].charAt(0).toUpperCase() + m[2].slice(1), cond: m[1] || '', mana: manaOf(cs), comps: cs.filter(k => k.k !== 'mana') });
    }
  }
  return out;
}
function additionalCosts(c) {
  const tx = cardText(c).replace(/\([^)]*\)/g, '').replace(/’/g, "'"), req = { mana: '', comps: [] }, optional = []; let m;
  for (const raw of tx.split('\n')) {
    const line = raw.trim();
    if ((m = line.match(/^As an additional cost to cast this spell, (you may )?(.+?)\.?$/i))) {
      const cs = parseCostComps(m[2], c.name), mana = manaOf(cs), rest = cs.filter(k => k.k !== 'mana');
      if (m[1]) optional.push({ label: m[2], mana, comps: rest }); else { req.mana += mana; req.comps.push(...rest); }
    } else if ((m = line.match(/^Kicker\s+((?:\{[^}]+\})+)\s*$/i))) optional.push({ label: 'Kicker', mana: m[1], comps: [], kicker: true });
    else if ((m = line.match(/^Kicker—(.+?)\.?$/i))) { const cs = parseCostComps(m[1], c.name); optional.push({ label: 'Kicker — ' + m[1], mana: manaOf(cs), comps: cs.filter(k => k.k !== 'mana'), kicker: true }); }
  }
  return { req, optional };
}
// Every way this card can be cast right now: { label, mana, comps, alt, ok, why, detail }
function castRoutes(c, extra) {
  const ec = effectiveCost(c), ad = additionalCosts(c), alts = altCostsFor(c);
  const mk = (label, mana, alt, cond) => {
    const comps = ad.req.comps.concat(alt ? alt.comps : []);
    const r = { label, mana: mergeGeneric(mana + (extra || '') + ad.req.mana), comps, alt, cond: cond || '', ok: true, why: '', detail: '' };
    const cw = compsFeasible(comps.filter(k => k.k !== 'other'), c.id);
    if (cw) { r.ok = false; r.why = 'additional'; r.detail = cw; }
    else if (!manaFeasible(c, r.mana)) {
      const total = manaTotal() + manaSources().length; r.ok = false;
      r.why = total < symCmc(r.mana) ? 'amount' : 'color'; r.detail = r.why === 'amount' ? 'not enough mana' : 'not the right colours of mana';
    }
    return r;
  };
  const routes = [mk(alts.length || ad.optional.length ? 'Normal cost' : 'Cast', ec.cost, null)];
  for (const a of alts) routes.push(mk(a.label, a.mana ? taxed(a.mana, ec) : taxed('', ec), a, a.cond));
  return routes;
}
function manaFeasible(c, mana) {
  let cost = mana || '';
  for (const k of reducerKinds(c)) cost = reduceCost(cost, k, reducerCands(k));
  return manaPaymentAllocation(manaCostParts(cost), (state && state.manaPool) || {}, manaSources(), null).ok;
}

// ---- Delve, Convoke, Improvise
function reducerKinds(c) { const tx = cardText(c), k = []; for (const w of ['delve', 'convoke', 'improvise']) if (kwLine(tx, w)) k.push(w); return k; }
function reducerCands(kind) {
  if (!state) return [];
  if (kind === 'delve') return state.graveyard.slice();
  if (kind === 'convoke') return state.battlefield.filter(x => !x.tapped && permTypeInfo(x).types.has('creature'));
  return state.battlefield.filter(x => !x.tapped && permTypeInfo(x).types.has('artifact'));
}
function reduceCost(cost, kind, cards) {
  const p = manaCostParts(cost); let g = p.generic; const cols = p.colors.slice();
  for (const card of cards) {
    if (kind === 'convoke') { const cc = effColors(card), ix = cols.findIndex(x => cc.includes(x)); if (ix >= 0) { cols.splice(ix, 1); continue; } }
    if (g > 0) g--;
  }
  return (g ? `{${g}}` : '') + cols.map(x => `{${x}}`).join('') + p.flexible.map(x => `{${x}}`).join('');
}
const costKey = s => JSON.stringify(manaCostParts(s));
const REDUCER_TEXT = {
  delve: 'Delve: exile cards from your graveyard. Each card exiled pays for {1} of the generic cost.',
  convoke: 'Convoke: tap untapped creatures you control. Each one pays for {1}, or for one mana of a colour it shares with the cost.',
  improvise: 'Improvise: tap untapped artifacts you control. Each one pays for {1} of the generic cost.'
};
function openReducer(c, kind, mana, cands, cb) {
  const m = modal(`${c.name}: ${kind[0].toUpperCase() + kind.slice(1)}`, { width: 600, sticky: true, onCancel: () => {} });
  const sel = new Set(), rows = h('div', { class: 'prelist' }), left = h('div', { class: 'psub' });
  const chosen = () => cands.filter(x => sel.has(x.id));
  const upd = () => { left.replaceChildren('Cost still to pay in mana: ', symbols(reduceCost(mana, kind, chosen())) || 'nothing'); cands.forEach((x, i) => rows.children[i].classList.toggle('sel', sel.has(x.id))); };
  cands.forEach(x => {
    const row = h('div', { class: 'row' }, h('span', { class: 'nm', text: x.name }), h('span', { class: 'muted small', text: kind === 'delve' ? '' : (permTypeInfo(x).types.has('creature') ? effColors(x).join('') || 'colourless' : 'artifact') }));
    row.addEventListener('click', () => {
      if (sel.has(x.id)) sel.delete(x.id);
      else if (costKey(reduceCost(mana, kind, chosen())) !== costKey(reduceCost(mana, kind, chosen().concat([x])))) sel.add(x.id);   // ignore picks that would pay for nothing
      upd();
    });
    rows.append(row);
  });
  m.body.append(h('div', { class: 'psub', text: REDUCER_TEXT[kind] }), left, rows, teach('costGuidance') ? h('div', { class: 'muted small', text: 'Choosing none is fine. Cards you pick are exiled or tapped as you cast the spell, before you pay the remaining mana.' }) : null);
  m.foot.append(h('button', { text: 'Cancel', onclick: () => m.close() }), h('button', { class: 'primary', text: 'Continue', onclick: () => { const ids = chosen(); m.close(); cb(reduceCost(mana, kind, ids), ids.map(x => x.id)); } }));
  upd();
}
function runReducers(c, mana, kinds, cb, picks) {
  picks = picks || [];
  if (!kinds.length || !mana || !/\{/.test(mana)) { cb(mana, picks); return; }
  const kind = kinds[0], rest = kinds.slice(1), cands = reducerCands(kind);
  if (!cands.length || costKey(reduceCost(mana, kind, cands)) === costKey(mana)) { runReducers(c, mana, rest, cb, picks); return; }
  openReducer(c, kind, mana, cands, (m2, ids) => runReducers(c, m2, rest, cb, ids.length ? picks.concat([{ comp: { k: kind }, ids }]) : picks));
}

// ---- choosing the cards that pay a cost
function pickCardsModal(title, intro, cands, n, cb) {
  const m = modal(title, { width: 600, sticky: true, onCancel: () => {} });
  const sel = new Set(), rows = h('div', { class: 'prelist' }), go = h('button', { class: 'primary', text: 'Confirm', disabled: true });
  const upd = () => { cands.forEach((x, i) => rows.children[i].classList.toggle('sel', sel.has(x.id))); go.disabled = sel.size !== n; go.textContent = `Confirm (${sel.size}/${n})`; };
  cands.forEach(x => {
    const i = x.token ? null : cardInfo(x.name);
    const row = h('div', { class: 'row' }, h('span', { class: 'nm', text: x.name + (x.tapped ? ' (tapped)' : '') }), h('span', { class: 'muted small', text: x.token ? 'Token' : (i && i.t) || '' }));
    row.addEventListener('click', () => { if (sel.has(x.id)) sel.delete(x.id); else if (n === 1) { sel.clear(); sel.add(x.id); } else if (sel.size < n) sel.add(x.id); upd(); });
    rows.append(row);
  });
  go.addEventListener('click', () => { const ids = [...sel]; m.close(); cb(ids); });
  m.body.append(h('div', { class: 'psub', text: intro }), rows);
  m.foot.append(h('button', { text: 'Cancel', onclick: () => m.close() }), go);
  upd();
}
// Ask for every non-mana choice, one after another. cb(picks) gets [{comp, ids}]. Nothing is changed yet.
function gatherCosts(src, comps, cb) {
  const need = comps.filter(k => PICK_KINDS.includes(k.k));
  if (!need.length) { cb([]); return; }
  const picks = [], taken = new Set(); let ix = 0;
  const VERB = { sac: 'sacrifice', discard: 'discard', exile: 'exile', tapOther: 'tap', bounce: 'return to your hand' };
  const next = () => {
    if (ix >= need.length) { cb(picks); return; }
    const comp = need[ix++], cands = compCands(comp, src.id, taken);
    const done = ids => { ids.forEach(x => taken.add(x)); picks.push({ comp, ids }); next(); };
    if (cands.length < comp.n) { toast('Cannot pay the cost', comp.text); return; }
    if (cands.length === comp.n) { done(cands.map(x => x.id)); return; }
    pickCardsModal(`${src.name}: ${comp.text}`, `Choose ${comp.n} to ${VERB[comp.k]}. This is part of the cost, so it happens as you ${src.ability ? 'activate the ability' : 'cast the spell'}, before it goes on the stack.`, cands, comp.n, done);
  };
  next();
}
let snapMuted = false, costHold = false;
// Do the payments. One undo step covers the whole cast; triggers they cause wait until the spell is on the stack.
function applyPicks(src, picks) {
  for (const p of picks) for (const id of p.ids) {
    const f = findCard(id); if (!f) continue;
    const nm = f.card.name;
    switch (p.comp.k) {
      case 'sac': log(`${src.name}: sacrificed ${nm} as a cost`); moveCard(id, 'graveyard'); break;
      case 'discard': log(`${src.name}: discarded ${nm} as a cost`); moveCard(id, 'graveyard'); break;
      case 'exile': log(`${src.name}: exiled ${nm} from your ${p.comp.zone} as a cost`); moveCard(id, 'exile'); break;
      case 'delve': log(`${src.name}: delved ${nm} (exiled from your graveyard)`); moveCard(id, 'exile'); break;
      case 'tapOther': case 'convoke': case 'improvise': f.card.tapped = true; log(`${src.name}: tapped ${nm} as a cost${p.comp.k === 'tapOther' ? '' : ' (' + p.comp.k + ')'}`); break;
      case 'bounce': log(`${src.name}: returned ${nm} to your hand as a cost`); moveCard(id, 'hand'); break;
    }
  }
}
function applyCostInfo(c, ci) {
  snapMuted = true; costHold = true;
  try {
    if (ci.life) { state.life -= ci.life; log(`${c.name}: paid ${ci.life} life as a cost`); }
    applyPicks(c, ci.picks || []);
    if (ci.evoked) { c.evoked = true; log(`${c.name}: cast for its evoke cost`); }
    else if (ci.alt) log(`${c.name}: cast using an alternative cost (${ci.label})`);
    if (ci.kicked && ci.kicked.length) { c.kicked = true; log(`${c.name}: kicked`); }
  } finally { snapMuted = false; costHold = false; }
}
function applyCostPicks(src, picks, life) {
  snapMuted = true; costHold = true;
  try { if (life) { state.life -= life; log(`${src.name}: paid ${life} life as a cost`); } applyPicks(src, picks || []); }
  finally { snapMuted = false; costHold = false; }
}

// ---- casting: choose how to pay, then pay
function startCast(c, reopen, modes, md) {
  const extra = md && modes ? modalCost(md, modes) : '';
  const routes = castRoutes(c, extra), opts = additionalCosts(c).optional;
  if (!routes.some(r => r.ok)) {
    const r0 = routes[0];
    toast('Cannot cast this spell', r0.why === 'additional' ? `You cannot pay the additional cost: ${r0.detail}.` : r0.why === 'color' ? 'You do not have the right colours of mana.' : 'Not enough mana (floating mana plus untapped lands).');
    return;
  }
  const go = (route, kicks) => runCast(c, reopen, modes, route, kicks);
  if (routes.length > 1 || opts.length) { openCostChooser(c, routes, opts, go); return; }
  go(routes[0], []);
}
function openCostChooser(c, routes, opts, go) {
  const m = modal(`Cast ${c.name}: how do you pay?`, { width: 640, sticky: true, onCancel: () => {} });
  let sel = routes.findIndex(r => r.ok); const kicks = new Set();
  const list = h('div', { class: 'prelist' }), ec = effectiveCost(c);
  const draw = () => {
    list.replaceChildren(...routes.map((r, i) => {
      const row = h('div', { class: 'row' + (i === sel ? ' sel' : '') + (r.ok ? '' : ' dim') },
        h('span', { class: 'nm' }, r.label, ' ', r.mana ? symbols(r.mana) : ''),
        h('span', { class: 'muted small', text: r.ok ? (r.cond ? `Only if: ${r.cond.replace(/^If /i, '')}` : '') : `Cannot pay: ${r.detail}` }));
      if (r.ok) row.addEventListener('click', () => { sel = i; draw(); });
      return row;
    }));
  };
  m.body.append(h('div', { class: 'psub', text: 'Choose how to pay for this spell.' }), list);
  if (ec.why) m.body.append(h('div', { class: 'costnote' }, 'Total cost is already adjusted: ', ec.why));
  opts.forEach((o, i) => {
    const cb = h('input', { type: 'checkbox' });
    cb.addEventListener('change', () => { if (cb.checked) kicks.add(i); else kicks.delete(i); });
    m.body.append(h('label', { class: 'teachopt' }, cb, h('span', null, h('b', { text: 'Optional: ' + o.label + ' ' }), o.mana ? symbols(o.mana) : '', h('span', { class: 'muted small', text: o.comps.length ? ' ' + o.comps.map(k => k.text || '').join(', ') : '' }))));
  });
  if (teach('costGuidance')) m.body.append(h('div', { class: 'muted small', style: 'margin-top:8px' },
    'Casting order (rule 601.2): you choose modes and targets, then HOW to pay (normal cost, an alternative cost instead of the mana cost, optional extras like kicker), then the game adds cost increases and subtracts reductions to get the total, then you pay it. Alternative costs still get taxes added (Thalia makes Force of Will cost {1} more even when you pitch a card).'));
  m.foot.append(h('button', { text: 'Cancel', onclick: () => m.close() }), h('button', { class: 'primary', text: 'Continue', onclick: () => {
    if (sel < 0 || !routes[sel].ok) return;
    m.close(); go(routes[sel], [...kicks].map(i => opts[i]));
  } }));
  draw();
}
function runCast(c, reopen, modes, route, kicks) {
  const id = c.id; let mana = route.mana; const comps = route.comps.slice(), kicked = [];
  for (const k of kicks) { if (k.mana) mana = mergeGeneric(mana + k.mana); comps.push(...k.comps); kicked.push(k.label); }
  const why = compsFeasible(comps.filter(k => k.k !== 'other'), id);
  if (why) { toast('Cannot pay the cost', why); return; }
  if (!manaFeasible(c, mana)) { toast('Cannot cast this spell', 'Not enough mana for that way of paying.'); return; }
  const manual = comps.filter(k => k.k === 'other').map(k => k.text);
  gatherCosts(c, comps, picks => {
    runReducers(c, mana, reducerKinds(c), (mana2, rpicks) => {
      const ci = { picks: picks.concat(rpicks), life: comps.filter(x => x.k === 'life').reduce((a, x) => a + x.n, 0), alt: route.alt ? route.alt.kind : null, label: route.label, kicked, evoked: !!(route.alt && route.alt.kind === 'evoke') };
      const finish = ids => { commitSpellToStack(id, ids, reopen, undefined, modes, ci); if (manual.length) toast('Other costs', `Pay the rest of the cost yourself: ${manual.join(', ')}.`); };
      const full = mergeGeneric(mana2);
      if ((!route.alt && !effectiveCost(c).base) || (symCmc(full) === 0 && !/\{[WUBRGCXSP]/i.test(full))) { finish([]); return; }
      if (teach('stackGuidance')) { openManaPayment(c, finish, full); return; }
      const plan = manaPaymentAllocation(manaCostParts(full), state.manaPool || {}, manaSources(), null);
      if (!plan.ok) { toast('Cannot cast this spell', 'Not enough mana.'); return; }
      state.manaPool = plan.pool;
      finish(plan.used.map(i => manaSources()[i].card.id));
    });
  });
}

// ---- cycling (from hand, any time you have priority): the cost is paid and the card discarded, "draw a card" goes on the stack
function cyclingFor(c) {
  const tx = cardText(c).replace(/\([^)]*\)/g, ''); let m;
  for (const raw of tx.split('\n')) {
    const line = raw.trim();
    if ((m = line.match(/^Cycling\s+((?:\{[^}]+\})+)\s*$/i))) return { label: 'Cycling ' + m[1], comps: [{ k: 'mana', mana: m[1] }] };
    if ((m = line.match(/^Cycling—(.+?)\.?$/i))) return { label: 'Cycling — ' + m[1], comps: parseCostComps(m[1], c.name) };
  }
  return null;
}
// ---- suspend (v0.55, rule 702.62): exile from hand with N time counters; remove one each upkeep; cast it free when the last is gone
function suspendFor(c) {
  const tx = cardText(c).replace(/\([^)]*\)/g, ''); let m;
  for (const raw of tx.split('\n')) if ((m = raw.trim().match(/^Suspend\s+(\d+)\s*[—–-]\s*((?:\{[^}]+\})+)/i))) return { n: +m[1], cost: m[2] };
  return null;
}
function suspendCard(id) {
  const f = findCard(id); if (!f || f.zone !== 'hand') return;
  const su = suspendFor(f.card); if (!su) return; const c = f.card;
  if (!canCastNow(c)) { toast('Cannot suspend now', 'You may suspend a card any time you could begin to cast it: instants and flash cards at any time you have priority, everything else in your main phase with an empty stack.'); return; }
  if (!manaPaymentAllocation(manaCostParts(su.cost), state.manaPool || {}, manaSources(), null).ok) { toast('Cannot suspend', 'Not enough mana for the suspend cost.'); return; }
  const finish = ids => {
    if (!findCard(id)) return;
    snap(); tapManaIds(ids || []);
    snapMuted = true; try { moveCard(id, 'exile'); } finally { snapMuted = false; }
    const g = findCard(id); if (g) g.card.timeCounters = su.n;
    log(`${c.name}: suspended — exiled with ${su.n} time counter${su.n === 1 ? '' : 's'} (suspend cost ${su.cost})`);
    toast(`${c.name} suspended`, `It has ${su.n} time counter${su.n === 1 ? '' : 's'}. At the beginning of each of your upkeeps one is removed; when the last is gone you cast it for free${/Creature/.test(frontType(c) || '') ? ' and it has haste' : ''}.`);
    render();
  };
  if (teach('stackGuidance')) { openManaPayment(c, finish, su.cost, 'Pay and suspend'); return; }
  const plan = manaPaymentAllocation(manaCostParts(su.cost), state.manaPool || {}, manaSources(), null);
  state.manaPool = plan.pool; finish(plan.used.map(i => manaSources()[i].card.id));
}
function suspendUpkeep() {   // upkeep: every suspended card in exile gets its "remove a time counter" trigger (always, even with prompts off: it is game state)
  if (!state) return;
  for (const c of state.exile) if (c.timeCounters > 0) state.pendingTriggers.push({ kind: 'ability', cardId: c.id, cardName: c.name, special: 'suspendTick', optional: false,
    text: `Suspend — At the beginning of your upkeep, if ${c.name} is suspended, remove a time counter from it (${c.timeCounters} now).`, effect: 'Remove a time counter.', why: 'A suspended card in exile loses a time counter at the start of each of your upkeeps.' });
}
function suspendCastFree(id, done) {
  const f = findCard(id); if (!f || f.zone !== 'exile') { if (done) done(); return; }
  const c = f.card, md = spellModal(c);
  const fail = why => { log(`${c.name}: could not be cast (${why}); it stays in exile`); toast('Not cast', `${c.name} could not be cast (${why}), so it stays in exile with no time counters (rule 702.62).`); if (done) done(); };
  const go = modes => {
    const ft = frontType(c), castText = md && modes ? modalText(md, modes) : cardText(c);
    const specs = (!ft || /\b(?:Instant|Sorcery)\b/.test(ft)) ? parseTargetSpecs(castText) : [];
    const put = picked => {
      const g = findCard(id); if (!g || g.zone !== 'exile') { if (done) done(); return; }
      snap(); state.exile.splice(g.idx, 1); const cc = g.card; delete cc.timeCounters;
      if (picked) { cc.targets = picked; const gy = picked.find(t => t.kind === 'gy'); if (gy && RETURN_RE.test(cardText(cc).replace(/\n/g, ' '))) cc.target = { id: gy.id, name: gy.name }; else delete cc.target; } else { delete cc.targets; delete cc.target; }
      if (modes && md) { cc.modes = modes; cc.modeTexts = modes.map(i => md.modes[i].text); }
      const inf = cardInfo(cc.name); if (inf && /\{X\}/.test(inf.mc || '')) cc.xValue = 0;
      if (/\bCreature\b/.test(frontType(cc) || '')) cc.suspHaste = true;
      sfx('cast'); state.stack.push(cc); state.priority = { active: true, passed: false };
      log(`Suspend: cast ${cc.name} from exile without paying its mana cost${cc.targets && cc.targets.length ? ' targeting ' + cc.targets.map(t => t.name).join(', ') : ''}`);
      fireTrigger('cast', { card: cc }); render();
      if (done) done();
      if (!state.pendingTriggers.length) openStack();
    };
    if (specs.length) chooseTargets(c.name, specs, put, { srcId: null, onCancel: () => fail('no target was chosen') }); else put(null);
  };
  if (md) openModeChoice(c.name, md, go, '0'); else go(undefined);
}
function cycleCard(id) {
  const f = findCard(id); if (!f || f.zone !== 'hand') return;
  const cy = cyclingFor(f.card); if (!cy) return;
  if (!state || state.phase !== 'play' || state.phasePause || state.discarding || state.step === 0 || state.step === CLEANUP) { toast('Cannot cycle now', 'You can cycle when you have priority (not during untap or cleanup).'); return; }
  const rest = cy.comps.filter(k => k.k !== 'mana' && k.k !== 'other'), why = compsFeasible(rest, id), mana = manaOf(cy.comps);
  if (why) { toast('Cannot pay the cost', why); return; }
  if (mana && !manaPaymentAllocation(manaCostParts(mana), state.manaPool || {}, manaSources(), null).ok) { toast('Cannot cycle', 'Not enough mana.'); return; }
  const c = f.card;
  gatherCosts(c, rest, picks => {
    const finish = ids => {
      if (!findCard(id)) return;
      snap(); tapManaIds(ids || []);
      applyCostPicks(c, picks, rest.filter(k => k.k === 'life').reduce((a, k) => a + k.n, 0));
      snapMuted = true; costHold = true; discardHow = 'cycle'; try { log(`${c.name}: cycled (${cy.label})`); moveCard(id, 'graveyard'); } finally { snapMuted = false; costHold = false; discardHow = null; }
      state.stack.push({ ability: true, id: state.nextId++, name: `${c.name} — cycling`, sourceId: null, sourceName: c.name, cost: cy.label, text: 'Draw a card.' });
      state.priority = { active: true, passed: false };
      render(); openStack();
    };
    if (!mana) { finish([]); return; }
    if (teach('stackGuidance')) { openManaPayment(c, finish, mana, 'Pay and cycle'); return; }
    const plan = manaPaymentAllocation(manaCostParts(mana), state.manaPool || {}, manaSources(), null);
    state.manaPool = plan.pool; finish(plan.used.map(i => manaSources()[i].card.id));
  });
}

// ---- cost effects on the table that the app cannot see (an opponent's Thalia, a Sphere of Resistance...)
const COST_PRESETS = [
  ['Noncreature spells cost {1} more (Thalia, Vryn Wingmare, Thorn of Amethyst)', 'more', 1, 'noncreature'],
  ['All spells cost {1} more (Sphere of Resistance)', 'more', 1, ''],
  ['Creature spells cost {1} more', 'more', 1, 'creature'],
  ['Nonartifact spells cost {1} more (Lodestone Golem)', 'more', 1, 'nonartifact'],
  ['Your spells cost {1} less (any effect)', 'less', 1, '']
];
function openCostFx() {
  if (!state) { toast('Start a game first', 'These effects belong to the current game.'); return; }
  const m = modal('Cost effects on the table', { width: 640 });
  const list = h('div', { class: 'prelist' });
  const draw = () => {
    state.costMods = state.costMods || [];
    list.replaceChildren(...(state.costMods.length ? state.costMods.map((x, i) => h('div', { class: 'row' }, h('span', { class: 'nm', text: x.label }), h('button', { text: 'Remove', onclick: () => { snap(); state.costMods.splice(i, 1); draw(); render(); } }))) : [h('div', { class: 'muted small', text: 'None active. Your own permanents (Thalia, Goblin Electromancer...) are read from the board automatically; use this for cards the app cannot see, like an opponent’s.' })]));
  };
  m.body.append(h('div', { class: 'psub', text: 'Add an effect that changes what your spells cost. It stays until you remove it.' }),
    ...COST_PRESETS.map(([label, dir, amt, subj]) => h('div', { class: 'row' }, h('span', { class: 'nm', text: label }), h('button', { text: 'Add', onclick: () => { snap(); state.costMods = state.costMods || []; state.costMods.push({ label: label.replace(/ \(.*\)$/, ''), dir, amt, subj }); log(`Cost effect added: ${label}`); draw(); render(); } }))),
    h('div', { class: 'ptitle', style: 'margin-top:10px', text: 'Active' }), list);
  m.foot.append(h('button', { class: 'primary', text: 'Close', onclick: () => m.close() }));
  draw();
}

// ---- paying costs: floating mana is always spent first, lands only cover what is left
function matchPips(pips, srcIdx, sources) {
  const owner = new Map();   // source index -> pip index
  const tryPip = (pi, seen) => {
    for (const si of srcIdx) {
      if (seen.has(si)) continue;
      const ok = pips[pi] === 'C' ? true : sources[si].colors.has(pips[pi]);
      if (!ok) continue;
      seen.add(si);
      if (!owner.has(si) || tryPip(owner.get(si), seen)) { owner.set(si, pi); return true; }
    }
    return false;
  };
  for (let pi = 0; pi < pips.length; pi++) if (!tryPip(pi, new Set())) return null;
  return owner;
}
// chosen = Set of source indexes the player picked, or null to pick lands automatically.
function manaPaymentAllocation(parts, pool, sources, chosen) {
  const p = { W: pool.W || 0, U: pool.U || 0, B: pool.B || 0, R: pool.R || 0, G: pool.G || 0, C: pool.C || 0 };
  const pips = [];
  for (const col of parts.colors) { if (p[col] > 0) p[col]--; else pips.push(col); }
  let generic = parts.generic + parts.flexible.length;
  for (const k of Object.keys(p)) { const use = Math.min(generic, p[k]); p[k] -= use; generic -= use; }
  const poolUsed = Object.keys(pool).reduce((a, k) => a + (pool[k] || 0) - p[k], 0);
  const avail = chosen ? [...chosen] : sources.map((_, i) => i);
  const owner = matchPips(pips, avail, sources);
  if (!owner) return { ok: false, pool: p, used: [], poolUsed, needLands: pips.length + generic };
  const used = [...owner.keys()];
  const spare = avail.filter(i => !used.includes(i)).sort((a, b) => sources[a].colors.size - sources[b].colors.size);
  for (const i of spare) { if (generic <= 0) break; used.push(i); generic--; }
  return { ok: generic <= 0, pool: p, used, poolUsed, needLands: pips.length + parts.generic + parts.flexible.length - (parts.generic + parts.flexible.length - Math.max(0, generic)) };
}
function openManaPayment(c, done, costOverride, verb) {
  const ec = effectiveCost(c), mc = costOverride !== undefined ? costOverride : ec.cost;
  const parts = manaCostParts(mc), sources = withCtx(c, manaSources);
  const pool = state && state.manaPool ? state.manaPool : { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  if (!sources.length && manaTotal() === 0 && mc && symCmc(mc) > 0) { toast('No mana available', 'You cannot pay this spell’s cost.'); return; }
  const m = modal(`Pay ${c.name}`, { width: 620, sticky: true });
  const auto = manaPaymentAllocation(parts, pool, sources, null);
  let chosen = new Set(auto.ok ? auto.used : []);
  const status = h('div', { class: 'small muted' });
  const poolEl = h('div', { class: 'mana-payment-pool' });
  const rows = h('div', { class: 'prelist' });
  const pay = h('button', { class: 'primary', text: verb || 'Pay and cast', disabled: true });
  const refresh = () => {
    const result = manaPaymentAllocation(parts, pool, sources, chosen);
    const poolText = manaTotal() ? Object.entries(pool).filter(([, n]) => n).map(([k, n]) => `${n}${k}`).join(' · ') : 'empty';
    poolEl.replaceChildren(h('span', { class: 'mana-payment-label', text: 'Floating' }), h('span', { class: 'mana-payment-value', text: poolText }),
      h('span', { class: 'muted small', text: result.poolUsed ? ` · ${result.poolUsed} will be spent from the pool first` : ' · spent automatically first' }));
    const lands = result.ok ? result.used.length : chosen.size;
    status.replaceChildren(h('b', { text: result.ok ? (lands ? `Cost covered: ${result.poolUsed} floating + ${lands} land${lands === 1 ? '' : 's'}` : 'Cost covered by floating mana, no lands need tapping') : 'Choose lands for the rest of the cost' }));
    for (let i = 0; i < sources.length; i++) rows.children[i].classList.toggle('sel', chosen.has(i));
    pay.disabled = !result.ok;
  };
  sources.forEach((src, i) => {
    const label = [...src.colors].join('') || 'C';
    const row = h('div', { class: 'row' }, h('span', { class: 'nm' }, src.card.name + (src.of > 1 ? ` (mana ${src.slot + 1} of ${src.of})` : '')), h('span', { class: 'muted small', text: label }));
    row.addEventListener('click', () => { if (chosen.has(i)) chosen.delete(i); else chosen.add(i); refresh(); });
    rows.append(row);
  });
  pay.addEventListener('click', () => {
    const result = manaPaymentAllocation(parts, pool, sources, chosen);
    if (!result.ok) return;
    m.close();
    state.manaPool = result.pool;
    done(result.used.map(i => sources[i].card.id));
  });
  const costLine = h('div', { class: 'psub' }, 'Cost: ', mc ? symbols(mc) : 'no mana',
    ec.reduced && mc === ec.cost ? h('span', { class: 'muted small' }, ' (printed ', symbols(ec.base), `, ${ec.increased ? 'increased' : 'reduced'} by ${ec.reduced}: ${ec.why})`) : ec.why && mc !== ec.cost ? h('span', { class: 'muted small' }, ` (${ec.why} applied)`) : '');
  m.body.append(costLine, poolEl, status, rows,
    h('div', { class: 'muted small', style: 'margin-top:8px' }, 'Floating mana is spent first; lands are pre-selected only for what the pool cannot cover. Click lands to change the selection.'));
  m.foot.append(h('button', { text: 'Cancel', onclick: () => m.close() }), pay);
  refresh();
}
function tapManaIds(manaIds){
  const used=new Map(); for(const mid of manaIds) used.set(mid,(used.get(mid)||0)+1);
  for(const [mid,n] of used){const mf=findCard(mid);if(mf&&mf.zone==='battlefield'){mf.card.tapped=true; fireTrigger('tapmana',{card:mf.card});
    if(isLandName(mf.card.name)){ const lm=landMulti(mf.card); if(lm){ applyLandCost(mf.card,{dmg:lm.dmg,life:lm.life}); if(n<lm.fixed.length){ if(lm.only) log(`${mf.card.name}: ${lm.fixed.length-n} unused restricted mana is lost`); else { lm.fixed.slice(n).forEach(col=>addFloatingMana(col)); log(`${mf.card.name}: ${lm.fixed.length-n} unused mana floats`); } } } else applyLandCost(mf.card,landTapCost(mf.card)); }
    const r=!isLandName(mf.card.name)&&rockInfo(mf.card);   // a multi-mana rock taps once: unused mana floats
    if(r&&r.fixed&&n<r.fixed.length){ r.fixed.slice(n).forEach(col=>addFloatingMana(col)); log(`${mf.card.name}: ${r.fixed.length-n} unused mana floats`); }}}
}
function commitSpellToStack(id,manaIds=[],reopen=true,x,modes,ci){
  const f=findCard(id); if(!f||f.zone!=='hand'||isLandName(f.card.name))return;
  const fromC=centerOf(`#row-hand .card[data-id="${id}"]`);
  snap(); const [c]=state.hand.splice(f.idx,1); sfx('cast'); spotlight(c,'cast',fromC);
  if(x!==undefined){ c.xValue=x; log(`${c.name}: X = ${x}`); }
  if(modes){ const md=spellModal(c); if(md){ c.modes=modes; c.modeTexts=modes.map(i=>md.modes[i].text); log(`${c.name}: chosen ${md.spree?'extras':'modes'}: ${c.modeTexts.join(' | ')}`); } }
  withCtx(c,()=>tapManaIds(manaIds));
  if(ci) applyCostInfo(c,ci);
  state.stack.push(c); state.priority={active:true,passed:false};
  log(`Cast ${c.name}${c.targets&&c.targets.length?' targeting '+c.targets.map(t=>t.name).join(', '):''} — put it on the stack`); fireTrigger('cast',{card:c}); render();
  if(state.pendingTriggers.length) resolvePendingTrigger(); else if(reopen)openStack();
}
function passPriority(){
  if(!state||!state.stack.length)return;
  state.priority.passed=true;
  log('Passed priority');
  resolveTopOfStack();
}

// ---- X spells: X is chosen as the spell is cast; every {X} in the cost is paid with X generic mana.
function costWithX(cost, x) {
  const n = (cost.match(/\{X\}/g) || []).length;
  const rest = cost.replace(/\{X\}/g, '');
  return n && x ? rest + `{${n * x}}` : rest;
}
// Largest X you can pay right now (-1 when even X = 0 cannot be paid).
function maxXFor(c) { return withCtx(c, () => maxXFor0(c)); }
function maxXFor0(c) {
  const ec = effectiveCost(c); let best = -1;
  const pool = (state && state.manaPool) || {};
  for (let x = 0; x <= 40; x++) {
    if (manaPaymentAllocation(manaCostParts(costWithX(ec.cost, x)), pool, manaSources(), null).ok) best = x; else break;
  }
  return best;
}
function castXSpell(c, reopen, modes) {
  const id = c.id, ec = effectiveCost(c), max = maxXFor(c);
  if (max < 0) { toast('Cannot cast this spell', 'You cannot pay even the fixed part of the cost (X = 0).'); return; }
  const count = (ec.cost.match(/\{X\}/g) || []).length;
  const m = modal(`${c.name}: choose X`, { width: 480, sticky: true, onCancel: () => {} });
  const inp = h('input', { type: 'number', min: 0, max, value: max, style: 'width:80px;font-size:18px' });
  const total = h('div', { class: 'psub' });
  const upd = () => { const x = Math.max(0, Math.min(max, parseInt(inp.value, 10) || 0)); total.replaceChildren('Total cost with X = ', h('b', { text: String(x) }), ': ', symbols(costWithX(ec.cost, x)) || 'no mana'); };
  inp.addEventListener('input', upd); upd();
  m.body.append(
    h('div', { class: 'psub', text: `X is chosen as you cast the spell.${count > 1 ? ` This card has ${count} {X} symbols, so each point of X costs ${count} mana.` : ''} With your current mana, X can be at most ${max}.` }),
    h('div', { class: 'row' }, h('span', { class: 'nm', text: 'Value of X' }), inp),
    total,
    teach('rulesHints') ? h('div', { class: 'muted small', text: 'On the stack X is the number you choose. Once the permanent is on the battlefield, X is 0 for its abilities, except enter-the-battlefield effects, which remember the X you chose.' }) : null);
  m.foot.append(h('button', { text: 'Cancel', onclick: () => m.close() }), h('button', { class: 'primary', text: 'Cast', onclick: () => {
    const x = Math.max(0, Math.min(max, parseInt(inp.value, 10) || 0));
    m.close();
    const cost = costWithX(ec.cost, x);
    if (symCmc(cost) === 0 && !/\{[WUBRGCSP]/i.test(cost)) { commitSpellToStack(id, [], reopen, x); return; }
    if (teach('stackGuidance')) { openManaPayment(c, ids => commitSpellToStack(id, ids, reopen, x, modes), cost); return; }
    const plan = manaPaymentAllocation(manaCostParts(cost), state.manaPool || {}, manaSources(), null);
    if (!plan.ok) { toast('Cannot cast this spell', 'Not enough mana.'); return; }
    state.manaPool = plan.pool;
    commitSpellToStack(id, plan.used.map(i => manaSources()[i].card.id), reopen, x);
  } }));
}
function castSpell(id,reopen=true,modes) {
  const f0=findCard(id); return withCtx(f0&&f0.card,()=>castSpell0(id,reopen,modes));
}
function castSpell0(id,reopen=true,modes) {
  const f=findCard(id); if(!f||f.zone!=='hand'||isLandName(f.card.name)) return;
  if(!canCastNow(f.card)) {
    toast(state.stack.length ? 'Stack is active' : 'Wrong phase',
      state.stack.length ? 'Only instants and cards with flash can be cast while the stack is active.' :
      'This card can only be cast during your main phase, unless it has flash.');
    return;
  }
  const md=spellModal(f.card);
  if(md && modes===undefined){ openModeChoice(f.card.name, md, idxs=>castSpell(id,reopen,idxs), effectiveCost(f.card).cost); return; }
  { const ft=frontType(f.card), castText=md&&modes?modalText(md,modes):cardText(f.card);
    const specs=(!ft||/\b(?:Instant|Sorcery)\b/.test(ft))?parseTargetSpecs(castText):[];
    if(specs.length){
      if(targetChosenFor!==id){
        chooseTargets(f.card.name,specs,picked=>{ const g=findCard(id); if(!g||g.zone!=='hand') return;
          g.card.targets=picked; const gy=picked.find(t=>t.kind==='gy');
          if(gy&&RETURN_RE.test(cardText(g.card).replace(/\n/g,' '))) g.card.target={id:gy.id,name:gy.name}; else delete g.card.target;
          targetChosenFor=id; castSpell(id,reopen,modes); },{srcId:null});
        return; }
      targetChosenFor=null;
    } else { delete f.card.targets; delete f.card.target; } }
  if(/\{X\}/.test(effectiveCost(f.card).base)){ castXSpell(f.card,reopen,modes); return; }
  startCast(f.card,reopen,modes,md);
}
// ---------------------------------------------------------------- targeting
// Targets are read from the rules text of a spell or ability ("target creature you control", "any target",
// "up to two target creatures", "target spell", "target creature card in your graveyard"...), chosen when the
// spell is cast / the ability is activated, and checked again when it resolves (rules 601.2c, 608.2b).
const TYPE_WORDS = ['creature', 'artifact', 'enchantment', 'land', 'planeswalker', 'battle', 'permanent'];
function parseTargetSpecs(text) {
  const t = String(text || '').replace(/\([^)]*\)/g, ' ').replace(/\n/g, ' ').replace(/\u2019/g, "'");
  const specs = [], re = /\btarget\b/gi; let m;
  const STOP = /\s+(?:to|from|in|gets?|deals?|deal|loses?|lose|draws?|discards?|gains?|gain|can't|cannot|can|doesn't|untaps?|taps?|becomes?|if|unless|until|then|attacks?|blocks?|fights?|exiles?|destroys?|puts?|returns?|sacrifices?|mills?|reveals?|each|has|have|is|are|was|were|chooses?|shuffles?|creates?|with)\b|\s+and(?=\s+target)|\s+or(?=\s+target)|[.,;:]|$/i;
  while ((m = re.exec(t))) {
    const before = t.slice(0, m.index);
    const isAny = /\bany\s*$/i.test(before);
    if (!isAny && /\b(?:the|that|a|an|each|of)\s*$/i.test(before)) continue;      // "the target of", "becomes the target" - not a choice
    const rest = t.slice(m.index + m[0].length), sm = rest.match(STOP);
    const phrase = rest.slice(0, sm.index).trim(), after = rest.slice(sm.index);
    const sp = { min: 1, max: 1, types: [], mods: [], ctrl: 'any', pctrl: 'any', player: false, qual: '', label: '' };
    let cm;
    if (/\bany number of\s*$/i.test(before)) { sp.min = 0; sp.max = 99; }
    else if ((cm = before.match(/\bup to (one|two|three|four|five|x|\d+)\s*$/i))) { sp.min = 0; sp.max = wnum(cm[1]) === 'X' ? 1 : wnum(cm[1]); }
    else if ((cm = before.match(/\b(one|two|three|four|five|\d+)\s+(?:other\s+)?$/i)) && !/choose\s+\w+\s*$/i.test(before)) { sp.min = sp.max = wnum(cm[1]); }
    const wq = after.match(/^\s+with ([^.,;:]+)/i); if (wq) sp.qual = 'with ' + wq[1];
    const p = phrase.toLowerCase();
    if (isAny && !p) { sp.kind = 'any'; sp.types = ['creature', 'planeswalker', 'battle']; sp.player = true; sp.label = 'any target'; }
    else if (/\bcards?\b/.test(p) && (/^\s+(?:in|from) (?:your|a|any|an opponent's|target player's|their) graveyard/i.test(after) || /graveyard/.test(p))) {
      sp.kind = 'gy'; sp.words = p.split(/\bcards?\b/)[0].trim().split(/\s+/).filter(Boolean);
      sp.ctrl = /opponent's/.test(after + p) ? 'opp' : /\ba graveyard|any graveyard/i.test(after + p) ? 'any' : 'you';
      sp.label = `target ${p}${/graveyard/.test(p) ? '' : ' in ' + (sp.ctrl === 'you' ? 'your' : 'a') + ' graveyard'}`;
    }
    else if (/\bspells?\b/.test(p)) { sp.kind = 'spell'; sp.types = (p.match(/\b(?:instant|sorcery|creature|artifact|enchantment|planeswalker|land)\b/g) || []); sp.mods = (p.match(/\bnon\w+/g) || []); sp.label = 'target ' + p; }
    else if (/\b(?:abilit(?:y|ies))\b/.test(p)) { sp.kind = 'ability'; sp.label = 'target ' + p; }
    else {
      const ty = TYPE_WORDS.filter(w => new RegExp('\\b' + w + 's?\\b').test(p));
      const pl = /\b(?:player|opponent)s?\b/.test(p);
      if (pl && !ty.length) { sp.kind = 'player'; sp.player = true; sp.pctrl = /\bopponent\b/.test(p) ? 'opp' : 'any'; }
      else { sp.kind = 'perm'; sp.types = ty; sp.player = pl; }
      sp.mods = (p.match(/\b(?:non)?legendary|nonland|noncreature|nonartifact|nonbasic|basic|nontoken|token|tapped|untapped|attacking|blocking|other\b/g) || []);
      if (/\byou control\b/.test(p)) sp.ctrl = 'you'; else if (/\b(?:an opponent controls|you don't control|your opponents? controls?|opponents? control)\b/.test(p)) sp.ctrl = 'opp';
      sp.label = 'target ' + p;
    }
    if (sp.qual) sp.label += ' ' + sp.qual;
    sp.label = sp.label.replace(/\s+/g, ' ').trim();
    specs.push(sp);
  }
  return specs;
}
function permTypeLine(c) { return c.token ? (c.tk && c.tk.type ? c.tk.type : c.tk && c.tk.pt ? 'Token Creature' : 'Token Artifact') : (frontType(c) || (isLandName(c.name) ? 'Land' : '')); }
function permMatchesSpec(c, sp, ctx) {
  const tl = permTypeLine(c);
  if (sp.types.length && !sp.types.includes('permanent') && !sp.types.some(w => new RegExp('\\b' + w + '\\b', 'i').test(tl))) return false;
  for (const md of sp.mods) {
    if (md === 'legendary' && !/Legendary/i.test(tl)) return false;
    if (md === 'nonlegendary' && /Legendary/i.test(tl)) return false;
    if (md === 'nonland' && /\bLand\b/.test(tl)) return false;
    if (md === 'noncreature' && /\bCreature\b/.test(tl)) return false;
    if (md === 'nonartifact' && /\bArtifact\b/.test(tl)) return false;
    if (md === 'basic' && !/\bBasic\b/.test(tl)) return false;
    if (md === 'nonbasic' && /\bBasic\b/.test(tl)) return false;
    if (md === 'token' && !c.token) return false;
    if (md === 'nontoken' && c.token) return false;
    if (md === 'tapped' && !c.tapped) return false;
    if (md === 'untapped' && c.tapped) return false;
    if (md === 'attacking' && !(state.combat && (state.combat.attackers || []).includes(c.id))) return false;
    if (md === 'other' && ctx && ctx.srcId === c.id) return false;
  }
  if (hasKw(c, 'shroud')) return false;
  return true;
}
function legalTargets(sp, ctx) {
  ctx = ctx || {}; const out = [];
  const typeLabel = sp.types.length && !sp.types.includes('permanent') ? sp.types.join(' or ') : 'permanent';
  if (sp.kind === 'player' || sp.player) {
    if (sp.pctrl !== 'opp') out.push({ kind: 'player', id: 'you', name: 'You' });
    out.push({ kind: 'player', id: 'opp', name: 'Opponent' });
  }
  if (sp.kind === 'perm' || sp.kind === 'any') {
    if (sp.types.length || sp.kind === 'any') {
      if (sp.ctrl !== 'opp') for (const c of state.battlefield) if (permMatchesSpec(c, sp, ctx)) out.push({ kind: 'perm', id: c.id, name: c.name, card: c });
      if (sp.ctrl !== 'you') out.push({ kind: 'opp', id: 'opp-perm', name: `A ${typeLabel} your opponent controls (not tracked here)` });
    } else if (sp.kind === 'perm') {
      if (sp.ctrl !== 'opp') for (const c of state.battlefield) if (permMatchesSpec(c, sp, ctx)) out.push({ kind: 'perm', id: c.id, name: c.name, card: c });
      if (sp.ctrl !== 'you') out.push({ kind: 'opp', id: 'opp-perm', name: 'A permanent your opponent controls (not tracked here)' });
    }
  }
  if (sp.kind === 'gy') {
    if (sp.ctrl !== 'opp') for (const c of state.graveyard) if (matchesGraveSpec(c, { words: sp.words || [] })) out.push({ kind: 'gy', id: c.id, name: c.name, card: c });
    if (sp.ctrl !== 'you') out.push({ kind: 'opp', id: 'opp-gy', name: `A ${(sp.words || []).join(' ') || ''} card in an opponent's graveyard (not tracked here)`.replace('  ', ' ') });
  }
  if (sp.kind === 'spell' || sp.kind === 'ability') {
    for (const x of state.stack) {
      if (sp.kind === 'ability' ? !x.ability : x.ability) continue;
      if (sp.kind === 'spell') {
        const tl = x.opp ? (x.oppType || '') : (frontType(x) || '');
        if (sp.types.length && tl && !sp.types.some(w => new RegExp('\\b' + w + '\\b', 'i').test(tl))) continue;
        if (sp.mods.includes('noncreature') && /\bCreature\b/.test(tl)) continue;
      }
      out.push({ kind: sp.kind, id: x.id, name: x.opp ? `Opponent's ${x.name}` : x.name, card: x.opp ? null : x });
    }
  }
  return out;
}
function targetStillLegal(t) {
  if (!state) return false;
  if (t.kind === 'perm') { const f = findCard(t.id); return !!f && f.zone === 'battlefield'; }
  if (t.kind === 'gy') { const f = findCard(t.id); return !!f && f.zone === 'graveyard'; }
  if (t.kind === 'spell' || t.kind === 'ability') return state.stack.some(x => x.id === t.id);
  return true;   // players and untracked opposing things stay legal
}
function targetsText(o) { return (o.targets && o.targets.length) ? o.targets.map(t => t.name).join(', ') : (o.target && o.target.name) || ''; }
function chooseTargets(title, specs, done, o) {
  o = o || {};
  const lists = specs.map(sp => legalTargets(sp, o));
  const bad = specs.findIndex((sp, i) => sp.min > 0 && !lists[i].length);
  if (bad >= 0) { toast('No legal target', `${title} needs a ${specs[bad].label}, and there is nothing it can legally target. A spell or ability cannot be put on the stack without a legal target.`); if (o.onCancel) o.onCancel(); return; }
  const picks = specs.map(() => []);
  const m = modal(`${title}: choose ${specs.length > 1 ? 'targets' : 'a target'}`, { width: 600, sticky: true, onCancel: () => { if (o.onCancel) o.onCancel(); } });
  const confirm = h('button', { class: 'primary', text: 'Confirm targets' });
  const draw = () => {
    m.body.replaceChildren(h('div', { class: 'psub', text: 'Targets are chosen as the spell is cast or the ability is activated, before you pay. They are checked again when it resolves: if every target is gone, it does nothing.' }));
    specs.forEach((sp, i) => {
      const need = sp.min === 0 ? `up to ${sp.max === 99 ? 'any number' : sp.max}` : sp.max > 1 ? `choose ${sp.max}` : 'choose one';
      m.body.append(h('div', { class: 'tg-head' }, h('b', { text: sp.label[0].toUpperCase() + sp.label.slice(1) }), h('span', { class: 'muted small', text: ` — ${need}` })));
      if (!lists[i].length) m.body.append(h('div', { class: 'muted small', text: 'Nothing legal to target (that is fine: this target is optional).' }));
      for (const t of lists[i]) {
        const on = picks[i].some(x => x.id === t.id), info = t.card && !t.card.ability && !t.card.opp ? cardInfo(t.card.name) : null;
        const row = h('div', { class: 'row tg-row' + (on ? ' on' : '') }, h('span', { class: 'nm' }, t.name, ' ', info && info.mc ? symbols(info.mc) : ''),
          h('button', { class: on ? 'primary' : '', text: on ? 'Chosen ✓' : 'Choose', onclick: () => {
            if (on) picks[i] = picks[i].filter(x => x.id !== t.id);
            else if (picks[i].length < sp.max) picks[i].push(t);
            else if (sp.max === 1) picks[i] = [t];
            else return;
            draw(); } }));
        if (t.card && !t.card.ability && !t.card.opp) row.addEventListener('mouseenter', () => showPreview(t.card));
        m.body.append(row);
      }
    });
    confirm.disabled = specs.some((sp, i) => picks[i].length < sp.min);
  };
  confirm.addEventListener('click', () => { m.close(); done(picks.flatMap((arr, i) => arr.map(t => ({ kind: t.kind, id: t.id, name: t.name, spec: i })))); });
  m.foot.append(h('button', { text: 'Cancel', onclick: () => { m.close(); if (o.onCancel) o.onCancel(); } }), confirm);
  draw();
}
// Damage marked on a creature this turn; lethal damage is a state-based action.
function dealDamageTo(c, n, src) {
  if (!state) return; snap();
  if (isPlaneswalker(c)) { c.loyalty = Math.max(0, (c.loyalty || 0) - n); log(`${src}: ${n} damage to ${c.name} (loyalty ${c.loyalty})`); checkLoyalty(c); }
  else { c.dmg = (c.dmg || 0) + n; log(`${src}: ${n} damage to ${c.name} (${c.dmg} marked this turn)`); }
  runToughnessSBA(); render(); flushTriggers();
}
function destroyPerm(c, src) {
  if (!state) return;
  if (hasKw(c, 'indestructible')) { log(`${src}: ${c.name} is indestructible, so it is not destroyed`); toast('Not destroyed', `${c.name} has indestructible.`); return; }
  snap(); log(`${src}: destroyed ${c.name}`); leaveBattlefield(c, 'graveyard'); render(); flushTriggers();
}
// The effects of a resolving spell/ability, bound to the targets that were chosen for it.
function targetedOptions(tx, obj) {
  const ts = (obj.targets || []).filter(t => !t.gone); if (!ts.length) return [];
  const src = obj.sourceName || '~', opts = [];
  let si = 0;
  const live = t => t.kind === 'perm' ? (findCard(t.id) || {}).card : t.kind === 'gy' ? (findCard(t.id) || {}).card : null;
  for (const sentence of String(tx).replace(/\([^)]*\)/g, '').replace(/\n/g, ' ').split(/(?<=\.)\s+/)) {
    const ls = parseTargetSpecs(sentence); if (!ls.length) continue;
    const T = ls.map((_, k) => ts.filter(t => t.spec === si + k)); si += ls.length;
    const first = T[0] || []; if (!first.length) continue;
    const s = sentence.replace(/\u2019/g, "'");
    let mm;
    const each = (fnFor, label, oppFn) => { for (const t of first) { const c = live(t); opts.push({ label: label(t), fn: () => { if (t.kind === 'opp') { log(`${src}: ${label(t)} (your opponent's ${/graveyard/.test(t.id) ? 'graveyard' : 'permanent'}: apply it at the table)`); if (oppFn) oppFn(t); render(); return; } fnFor(t, c); } }); } };
    if ((mm = s.match(/\bdeals? (\d+) damage/i))) { const n = +mm[1]; each((t, c) => { if (t.kind === 'player') { t.id === 'you' ? changeLife(-n) : changeOppLife(-n); } else if (c) dealDamageTo(c, n, src); }, t => `Deal ${n} damage to ${t.name}`); }
    else if (/\battach\b/i.test(s) && obj.sourceId) each((t, c) => { if (c) attachTo(obj.sourceId, c.id, src); }, t => `Attach ${src} to ${t.name}`);
    else if (/\bdestroy\b/i.test(s)) each((t, c) => { if (c) destroyPerm(c, src); }, t => `Destroy ${t.name}`);
    else if (/\bexile\b/i.test(s) && !/\bexile it\b/i.test(s)) { const until = !!obj.sourceId && /\buntil\b[^.]*\bleaves the battlefield/i.test(s); each((t, c) => { if (c) { moveCard(c.id, 'exile'); if (until) addFx({ kind: 'exileUntil', cardId: c.id, cardName: c.name, srcId: obj.sourceId, srcName: src }); } }, t => `Exile ${t.name}${until ? ' until ' + src + ' leaves the battlefield' : ''}`, until ? (t => addFx({ kind: 'note', until: 'srcLeaves', text: `${t.name} is exiled (your opponent's): it comes back when ${src} leaves the battlefield`, srcId: obj.sourceId, srcName: src })) : null); }
    else if (/\breturn\b[^.]*\bto (?:its|their) owner's hand/i.test(s)) each((t, c) => { if (c && t.kind === 'perm') moveCard(c.id, 'hand'); }, t => `Return ${t.name} to its owner's hand`);
    else if (/\buntap\b/i.test(s)) each((t, c) => { if (c && c.tapped) toggleTap(c.id); }, t => `Untap ${t.name}`);
    else if (/\btap\b/i.test(s) && /\btap target/i.test(s)) each((t, c) => { if (c && !c.tapped) toggleTap(c.id); }, t => `Tap ${t.name}`);
    else if ((mm = s.match(/put (a|an|one|two|three|four|five|\d+) \+1\/\+1 counters? on/i))) { const n = wnum(mm[1]); each((t, c) => { if (c) addCounter(c.id, n, 'plus'); }, t => `Put ${n} +1/+1 counter${n === 1 ? '' : 's'} on ${t.name}`); }
    else if (/\bcounter\b/i.test(s) && /\bcounter target\b/i.test(s)) each((t) => { counterStackObject(t.id, src); }, t => `Counter ${t.name}`);
    else if ((mm = s.match(/\bgains? (\d+) life/i))) { const n = +mm[1]; each((t) => { t.id === 'you' ? changeLife(n, true) : changeOppLife(n); }, t => `${t.name} ${t.id === 'you' ? 'gain' : 'gains'} ${n} life`); }
    else if ((mm = s.match(/\bloses? (\d+) life/i))) { const n = +mm[1]; each((t) => { t.id === 'you' ? changeLife(-n) : changeOppLife(-n); }, t => `${t.name} ${t.id === 'you' ? 'lose' : 'loses'} ${n} life`); }
    else if ((mm = s.match(/\bdraws? (a|an|one|two|three|four|five|six|seven|\d+) cards?/i))) { const n = wnum(mm[1]); each((t) => { if (t.id === 'you') { snap(); const d = drawCards(n); log(`${src}: you drew ${d}`); render(); } else { log(`${src}: your opponent draws ${n} (not tracked here)`); render(); } }, t => `${t.name} ${t.id === 'you' ? 'draw' : 'draws'} ${n} card${n === 1 ? '' : 's'}`); }
    opts.push(...durationOptions(s, obj, first.filter(t => t.kind === 'perm' && !t.gone).map(t => ({ id: t.id, name: t.name }))));
  }
  return opts;
}
// "Return target legendary creature card from your graveyard to the battlefield" and similar: the target is chosen
// as the spell is cast, and checked again as it resolves (rules 601.2c, 608.2b).
const RETURN_RE = /\bReturn target ((?:[a-z\-]+ )*?)card (?:from|in) (?:your|a) graveyard to (the battlefield|your hand)[^.]*\./i;
function graveTargetSpec(c) {
  if(!/\b(?:Instant|Sorcery)\b/.test(frontType(c))) return null;
  const m=cardText(c).replace(/\n/g,' ').match(RETURN_RE); if(!m) return null;
  return { words: m[1].trim().toLowerCase().split(/\s+/).filter(Boolean), to: m[2].toLowerCase(), label: (m[1]+'card').trim() };
}
function matchesGraveSpec(card, spec) {
  const t=frontType(card)||'';
  return spec.words.every(w => w==='legendary' ? /Legendary/i.test(t) : w==='nonlegendary' ? !/Legendary/i.test(t) : w==='nonland' ? !/\bLand\b/i.test(t) : new RegExp('\\b'+w+'\\b','i').test(t));
}
function openGraveTarget(c, spec, done) {
  const opts=state.graveyard.filter(x=>matchesGraveSpec(x,spec));
  if(!opts.length){ toast('No legal target', `${c.name} needs a target ${spec.label} in your graveyard, and you have none. A spell cannot be cast without a legal target.`); return; }
  const m=modal(`${c.name}: choose a target`,{width:520,sticky:true});
  m.body.append(h('div',{class:'psub',text:`Choose a target ${spec.label} in your graveyard. Targets are chosen as the spell is cast, before you pay; if it is gone when the spell resolves, the spell does nothing.`}));
  for(const x of opts){ const info=cardInfo(x.name);
    const row=h('div',{class:'row'},h('span',{class:'nm'},x.name,' ',info&&info.mc?symbols(info.mc):''),h('button',{class:'primary',text:'Target this',onclick:()=>{m.close();done(x);}}));
    row.addEventListener('mouseenter',()=>showPreview(x)); m.body.append(row); }
  m.foot.append(h('button',{text:'Cancel — do not cast',onclick:()=>m.close()}));
}
let targetChosenFor=null;
// Carry out the "Return target ..." sentence of a resolving spell. Returns the spell text left for the effect panel.
function applyGraveReturn(c, stx) {
  const rm=stx.replace(/\n/g,' ').match(RETURN_RE); if(!rm||!c.target) return stx;
  const gi=state.graveyard.findIndex(x=>x.id===c.target.id), name=c.target.name; delete c.target;
  const rest=stx.replace(RETURN_RE,'').trim();
  if(gi<0){ log(`${c.name}: its target (${name}) is no longer in the graveyard, so the spell does nothing`); toast('Spell fizzled',`${name} left the graveyard, so ${c.name} has no legal target and does nothing.`); return ''; }
  const [t]=state.graveyard.splice(gi,1);
  if(rm[2].toLowerCase()==='your hand'){ state.hand.push(t); log(`${c.name}: returned ${t.name} to your hand`); return rest; }
  t.counters={plus:0,minus:0};
  enterBattlefield(t,{from:'graveyard',logMsg:`${c.name}: returned ${t.name} from the graveyard to the battlefield`,afterPlace:()=>{
    if(/gains? haste until end of turn/i.test(rest)){ addFx({kind:'kw',targetId:t.id,kw:'haste',srcName:c.name}); log(`${t.name} gains haste until end of turn`); }
    if(/exile (?:it|that creature) at the beginning of the next end step/i.test(rest)){ addFx({kind:'delayed',when:'end',action:'exile',targetId:t.id,targetName:t.name,text:`Exile ${t.name}.`,srcName:c.name}); log(`${t.name} will be exiled at the beginning of the next end step`); }
    if(/if (?:it|that creature) would leave the battlefield, exile it instead/i.test(rest)){ t.exileInstead=true; }
  }});
  return rest.replace(/[^.]*gains? haste until end of turn\.?/i,'').replace(/[^.]*exile (?:it|that creature) at the beginning of the next end step\.?/i,'').replace(/[^.]*would leave the battlefield, exile it instead[^.]*\.?/i,'').trim();
}
// "Countered": the top object of the stack is removed without resolving (you are playtesting against a real opponent).
function counterStackObject(id, by) {
  if(!state) return; const i=state.stack.findIndex(x=>x.id===id); if(i<0) return;
  { const sc=state.stack[i]; if(!sc.ability && !sc.opp && /(?:this spell|this card) can'?t be countered/i.test((cardText(sc)||'').replace(/\u2019/g,"'"))) { log(`${by?by+': ':''}${sc.name} can't be countered, so it stays on the stack`); toast("Can't be countered", `${sc.name} says it can't be countered, so the counterspell does nothing to it (rule 101.2).`); return; } }
  snap();
  const [c]=state.stack.splice(i,1); if(!state.stack.length) state.priority={active:false,passed:false}; sfx('counter'); if(!c.ability) spotlight(c,'counter',null);
  if(c.opp){ log(`${by?by+': ':''}Opponent's ${c.name} was countered`); toast(`Opponent's ${c.name} countered`,'It leaves the stack without resolving.'); }
  else if(c.ability){ log(`${by?by+': ':''}${c.sourceName||c.name}: ability was countered — it does not resolve`); toast('Ability countered','It leaves the stack without resolving. The permanent that made it is unaffected.'); }
  else { const where=gyPush(c,'stack'); delete c.target; delete c.targets; delete c.modes; delete c.modeTexts; log(`${by?by+': ':''}${c.name} was countered → ${where}`); toast(`${c.name} countered`, `A countered spell does not resolve (no effects, no entering the battlefield) and goes to its owner's ${where}.`); }
  render();
  if(state.pendingTriggers.length) resolvePendingTrigger();
}
function counterTopOfStack() { if(state&&state.stack.length) counterStackObject(state.stack[state.stack.length-1].id); }
function castOppSpell(name, type) {
  if(!state||!name) return; snap();
  const isAb=type==='Ability';
  state.stack.push({ id: state.nextId++, name, opp: true, oppType: isAb?'':(type || ''), ...(isAb?{ability:true,sourceName:name}:{}) }); state.priority={active:true,passed:false};
  if(!isAb) spotlight({name,opp:true},'cast',null);
  log(isAb?`Opponent's ability ${name} goes on the stack`:`Opponent casts ${name}${type?' ('+type+')':''} — it is on the stack`); render();
}
function resolveTopOfStack() {
  if(!state||!state.stack.length) return; snap();
  const c=state.stack.pop(); state.priority={active:false,passed:false};
  if(c.opp){ log(`Opponent's ${c.name} resolves — apply its effects at the table`); toast(`Opponent's ${c.name} resolves`,'Its effects are not tracked here. Adjust your board, life or cards by hand.'); render(); return; }
  if(c.targets&&c.targets.length){
    const alive=c.targets.filter(targetStillLegal);
    if(!alive.length){
      log(`${c.ability?c.sourceName+' ability':c.name} fizzles: all its targets (${c.targets.map(t=>t.name).join(', ')}) are gone`);
      toast('Fizzled','Every target is illegal now, so it does nothing (rule 608.2b).');
      if(!c.ability){ gyPush(c,'stack'); delete c.targets; delete c.target; }
      render(); if(state.pendingTriggers.length) resolvePendingTrigger(); return;
    }
    c.targets.forEach(t=>{ t.gone=!targetStillLegal(t); });
  }
  let eff=null; if(!isPermanentCard(c)||c.ability) sfx('resolve'); if(!c.opp&&!c.ability&&!isPermanentCard(c)) spotlight(c,'resolve',null);
  if(c.ability){ log(`Resolved ability of ${c.sourceName}`); eff=c; }
  else if (isPermanentCard(c)) {
    enterBattlefield(c,{from:'stack',logMsg:`Resolved ${c.name} → battlefield`,afterPlace:()=>{
    if(c.evoked){ delete c.evoked; queueTrigger({kind:'ability',cardId:c.id,cardName:c.name,text:'Evoke: when this enters, sacrifice it.',effect:'Sacrifice ~.',special:'sacSelf',optional:false,why:'You cast it for its evoke cost, so it is sacrificed when it enters. Its other enters-the-battlefield abilities still trigger; you choose the order they go on the stack.'}); }
    if(c.xValue!==undefined){
      const cm=cardText(c).match(/enters(?: the battlefield)? with (twice )?X (\+1\/\+1|[a-z\-]+) counters?/i);
      if(cm){ const n=(cm[1]?2:1)*c.xValue; if(cm[2]==='+1/+1'){ c.counters.plus=(c.counters.plus||0)+n; log(`${c.name} entered with ${n} +1/+1 counter${n===1?'':'s'} (X = ${c.xValue})`); } else log(`${c.name} should have ${n} ${cm[2]} counters (X = ${c.xValue}); add them by hand`); }
    }
    }});
  } else {
    const where=gyPush(c,'stack');
    log(`Resolved ${c.name} → ${where}`);
    { const md0=c.modes?spellModal(c):null; const baseTx=md0?modalText(md0,c.modes):cardText(c); delete c.modes; delete c.modeTexts;
      let stx=baseTx.replace(/\bX\b/g,c.xValue!==undefined?String(c.xValue):'X').replace(/\b1 cards\b/g,'1 card');
      if(c.target) stx=applyGraveReturn(c,stx);
      // Instants and sorceries: offer the effects the app can apply (X spells always get the panel).
      if(stx && (c.xValue!==undefined || effectOptions(stx,{sourceName:c.name,sourceId:null,targets:c.targets}).length)) eff={ability:true,id:0,name:c.name,sourceName:c.name,sourceId:null,text:stx,targets:c.targets,_tgtAsked:true}; delete c.targets; }
  }
  render();
  if(eff) openAbilityEffect(eff,()=>{ if(state.pendingTriggers.length) resolvePendingTrigger(); });
  else if(state.pendingTriggers.length) resolvePendingTrigger();
}


const BASIC_LANDS = new Set(['plains', 'island', 'swamp', 'mountain', 'forest', 'wastes',
  'snow-covered plains', 'snow-covered island', 'snow-covered swamp', 'snow-covered mountain', 'snow-covered forest']);

const LAND_HINT = /\b(triome|tower|foothills|strand|mesa|mire|catacombs|crypt|tomb|fountain|vents|grounds?|pool|plains|island|swamp|mountain|forest|wastes|fetch|temple garden)\b/i;
function isLandName(name) {
  const i = cardInfo(name);
  return i ? i.land : (BASIC_LANDS.has(norm(name)) || LAND_HINT.test(name));
}

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
const imgFor = name => IMG.get(imgKey(name)) || null;

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

async function fetchScryfallCard(name) {
  const get = async n => {
    const r = await fetch('https://api.scryfall.com/cards/named?exact=' + encodeURIComponent(n));
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('Scryfall returned ' + r.status);
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
  const r = await fetch(url);
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
    if (imgJob.running) el.textContent = `Images: downloading ${imgJob.done}/${imgJob.total}…`;
    else if (msg) el.textContent = msg;
    else {
      const { have, total } = imgSummary();
      el.dataset.state = total && have === total ? 'ok' : 'warn';
      el.textContent = total ? (have === total ? `Images: ${have}/${total} ready` : `Images: ${have}/${total} for this deck`) : '';
    }
  }
  if (imgUi) imgUi();
}

async function downloadImages(names) {
  if (imgJob.running) return;
  const todo = [...new Set(names)].filter(n => !imgMissing.has(imgKey(n)) && (!IMG.has(imgKey(n)) || !cardInfo(n)));
  if (!todo.length) { setImgStatus(); return; }
  if (navigator.onLine === false) { setImgStatus('Images: offline, using saved images'); return; }
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
  if (netErr) setImgStatus('Images: could not reach Scryfall (offline?)');
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

// ---------------------------------------------------------------- decks
const SAMPLE = `4 Ancient Stirrings
4 Wild Nacatl
4 Dryad of the Ilysian Grove
4 Territorial Kavu
4 Scion of Draco
4 Leyline Binding
4 Leyline of the Guildpact
4 Lightning Bolt
3 Bonecrusher Giant
2 Tribal Flames
4 Wooded Foothills
4 Flooded Strand
3 Arid Mesa
2 Overgrown Tomb
3 Stomping Ground
1 Temple Garden
1 Breeding Pool
1 Blood Crypt
1 Hallowed Fountain
1 Steam Vents
1 Indatha Triome
1 Raugrin Triome

Sideboard
3 Kitchen Finks
2 Thragtusk
2 Wurmcoil Engine
2 Lightning Helix
3 Scavenging Ooze
3 Leyline of the Void`;

function parseDeck(text) {
  const main = [], side = [];
  let cur = main, blankUsed = false;
  const hasSideHeader = /^\s*(sideboard|side)\s*:?\s*$/im.test(text);
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line) {
      if (!hasSideHeader && !blankUsed && main.length) { cur = side; blankUsed = true; }
      continue;
    }
    if (/^(\/\/|#)/.test(line)) continue;
    if (/^(deck|mainboard|main|commander|companion)\s*:?$/i.test(line)) { cur = main; continue; }
    if (/^(sideboard|side)\s*:?$/i.test(line)) { cur = side; continue; }
    let target = cur;
    let m = line.match(/^SB:\s*(.*)$/i);
    if (m) { target = side; line = m[1]; }
    m = line.match(/^(\d+)\s*x?\s+(.+)$/i);
    let qty = 1, name = line;
    if (m) { qty = parseInt(m[1], 10); name = m[2]; }
    name = name.replace(/\s*\([A-Za-z0-9]{2,6}\)\s*[\w★-]*\s*$/, '').replace(/\s*\*[A-Za-z]+\*\s*$/, '').trim();
    if (!name || !(qty > 0)) continue;
    target.push({ qty, name });
  }
  return { main, side };
}

const sum = list => list.reduce((a, c) => a + c.qty, 0);
function loadDecks() { return lsGet('mtgpt.decks', {}); }
function saveDecks(d) { lsSet('mtgpt.decks', d); }
function currentDeckName() { return lsGet('mtgpt.current', null); }

function refreshDeckSelect() {
  const sel = $('#deckSelect');
  const decks = loadDecks();
  const names = Object.keys(decks).sort((a, b) => a.localeCompare(b));
  sel.replaceChildren();
  if (!names.length) sel.append(h('option', { value: '', text: '(no decks yet)' }));
  for (const n of names) sel.append(h('option', { value: n, text: n }));
  const cur = currentDeckName();
  if (cur && decks[cur]) sel.value = cur;
  else if (names.length) { sel.value = names[0]; lsSet('mtgpt.current', names[0]); }
  if (typeof applyUiTheme === 'function' && settings.uiTheme === 'deck') applyUiTheme();
  const dc = $('#deckCur'); if (dc) dc.textContent = names.length ? (sel.value || names[0]) : 'No decks yet';
}

function getCurrentDeck() {
  const decks = loadDecks();
  const n = currentDeckName();
  if (!n || !decks[n]) return null;
  return { name: n, ...parseDeck(decks[n].text) };
}

// ---------------------------------------------------------------- game state
const ZONES = ['library', 'hand', 'battlefield', 'graveyard', 'exile', 'sideboard'];
let state = null;
let undoStack = [];
let selected = null;
let bottomSel = new Set();

function newCard(name, extra) { return Object.assign({ id: 0, name, tapped: false, counters: 0 }, extra || {}); }

function freshState() {
  return { delayed: [], fx: [], nextId: 1, phase: 'idle', turn: 0, life: 20, onPlay: true, mulls: 0, bottomPhase: false, serumPending: false, step: 0, discarding: 0, skipDraw: false, landPlayedThisTurn: false,
    library: [], hand: [], battlefield: [], graveyard: [], exile: [], sideboard: [], stack: [], log: [],
    manaPool: {W:0,U:0,B:0,R:0,G:0,C:0},
    phasePause: false, pendingTriggers: [], costMods: [], priority: {active:false, passed:false}, combat: {attackers:[], blockers:{}, declared:false, dealt:false}, oppLife: 20, dmgHistory: [], pregameDone: false };
}

function snap() {
  if (snapMuted) return;
  undoStack.push(JSON.stringify(state));
  if (undoStack.length > 300) undoStack.shift();
}
function undo() {
  if (!undoStack.length) return;
  state = JSON.parse(undoStack.pop());
  selected = null; bottomSel.clear();
  render();
}

function log(msg) {
  state.log.push((state.turn ? `T${state.turn}: ` : '') + msg);
  if (state.log.length > 400) state.log.shift();
}

function findCard(id) {
  for (const z of ZONES) {
    const i = state[z].findIndex(c => c.id === id);
    if (i >= 0) return { zone: z, idx: i, card: state[z][i] };
  }
  return null;
}

function moveCard(id, to, pos) {
  if (!state) return;
  const f = findCard(id);
  if (!f || f.zone === to && to !== 'library') return;
  snap();
  let c, where = to;
  if (f.zone === 'battlefield') {
    c = f.card; where = leaveBattlefield(c, to, { pos }) || to;
    if (where === 'gone') { if (selected === id) selected = null; render(); flushTriggers(); return; }
  } else {
    [c] = state[f.zone].splice(f.idx, 1);
    if (c.token) { log(`Token ${c.name} removed`); render(); return; }
    delete c.xValue; delete c.modes; delete c.modeTexts; delete c.target; delete c.targets; delete c.dmg; delete c.tmpKw; delete c.exileAtEnd; delete c.exileInstead; delete c.evoked; delete c.kicked; if (to !== 'exile') delete c.timeCounters; if (to !== 'battlefield') delete c.suspHaste;
    c.tapped = false; c.counters = to === 'battlefield' ? (c.counters || { plus: 0, minus: 0 }) : { plus: 0, minus: 0 };
    if (to === 'battlefield') enterBattlefield(c, { from: f.zone });
    else if (to === 'library') { if (pos === 'bottom') state.library.push(c); else state.library.unshift(c); }
    else if (to === 'graveyard') gyPush(c, f.zone);
    else state[to].push(c);
  }
  log(`${c.name}: ${f.zone} → ${where}${where === 'library' ? ' (' + (pos === 'bottom' ? 'bottom' : 'top') + ')' : ''}`);
  if (selected === id && to !== 'hand' && to !== 'battlefield') selected = null;
  render();
  flushTriggers();
}

function replacementEffectHints(){
  if(!state||!teach('rulesHints'))return [];
  return state.battlefield.filter(c=>/\b(?:if you would|whenever you would|instead|skip that draw)\b/i.test(cardText(c))).map(c=>c.name);
}
function drawCards(n, silent) {
  let drawn = 0;
  for (let i = 0; i < n; i++) {
    if (!state.library.length) { if (!silent) log('Library is empty!'); break; }
    const reps=replacementEffectHints(); if(reps.length && !silent && i===0) log(`Rules hint: ${reps.join(', ')} may modify this draw or event.`);
    state.hand.push(state.library.shift());
    drawn++; if (!silent) setTimeout(() => sfx('draw'), (drawn - 1) * 110);
    if (!silent && drawn <= 3) fireTrigger('draw');
  }
  return drawn;
}

function startGame() {
  lifePrev = { you: null, opp: null }; lastStepShown = null;
  const deck = getCurrentDeck();
  if (!deck || !deck.main.length) { alert('Import a deck first (Import / edit deck).'); return; }
  state = freshState();
  undoStack = []; selected = null; bottomSel.clear();
  const unknown = new Set();
  for (const { qty, name } of deck.main) {
    const rec = resolve(name);
    if (!rec && cardCount) unknown.add(name);
    for (let i = 0; i < qty; i++) { const c = newCard(rec ? rec.name : name); c.id = state.nextId++; state.library.push(c); }
  }
  for (const { qty, name } of deck.side) {
    const rec = resolve(name);
    for (let i = 0; i < qty; i++) { const c = newCard(rec ? rec.name : name); c.id = state.nextId++; state.sideboard.push(c); }
  }
  shuffle(state.library);
  drawCards(7, true);
  state.phase = 'mull';
  state.onPlay = $('#chkPlay').checked;
  state.log.push(`New game: ${deck.name} (${sum(deck.main)} cards, ${state.onPlay ? 'on the play' : 'on the draw'})`);
  if (unknown.size) state.log.push('Not found in card data: ' + [...unknown].join(', '));
  render();
  prepareImages();
}

function doMulligan() {
  if (!state || state.phase !== 'mull' || state.mulls >= 6) return;
  snap();
  state.library.push(...state.hand.splice(0));
  shuffle(state.library);
  state.mulls++;
  drawCards(7, true);
  log(`Mulligan #${state.mulls}`);
  render();
}

function keepHand() {
  if (!state || state.phase !== 'mull') return;
  if (state.mulls > 0 && !state.bottomPhase) {
    snap();
    state.bottomPhase = true; state.serumPending = false; bottomSel.clear();
    render();
    return;
  }
  finishMulligan();
}

function finishMulligan() {
  if (!state || state.phase !== 'mull') return;
  if (state.mulls > 0 && !state.bottomPhase) {
    snap();
    state.bottomPhase = true; state.serumPending = false; bottomSel.clear();
    render();
    return;
  }
  snap();
  const ids = [...bottomSel];
  for (const id of ids) {
    const i = state.hand.findIndex(c => c.id === id);
    if (i >= 0) state.library.push(state.hand.splice(i, 1)[0]);
  }
  bottomSel.clear();
  state.bottomPhase = false;
  state.serumPending = false;
  state.phase = 'pregame';
  state.turn = 1;
  state.onPlay = $('#chkPlay').checked;
  state.skipDraw = state.onPlay;
  state.pregameDone = false;
  log(`Kept ${state.hand.length} cards${state.mulls ? ` (mulligan ×${state.mulls})` : ''}`);
  if (!teach('preGame')) { state.pregameDone = true; state.phase = 'play'; log('Pre-game actions screen skipped (turned off in Settings)'); startTurn(); return; }
  render();
}

function pregameDraw(n) {
  if(!state||state.phase!=='mull'||state.bottomPhase)return; snap(); const d=drawCards(n,false); log(`Opening hand: drew ${d}`); render();
}

function serumPowder() {
  // Serum Powder is checked whenever the player has an opening hand and is
  // still deciding whether to mulligan. It replaces the entire current hand
  // with a new hand of the same size (normally 7), without changing the
  // mulligan count. This means it can be used again after a normal mulligan
  // if the new 7-card hand contains another Serum Powder.
  if(!state || state.phase !== 'mull' || state.bottomPhase || !state.hand.some(isSerumPowder)) return;

  snap();
  const count = state.hand.length;
  state.exile.push(...state.hand.splice(0));
  const drawn = drawCards(count, true);
  log(`Serum Powder: exiled ${count} cards and drew ${drawn}. You may now keep this hand, mulligan, or use Serum Powder again if present.`);
  render();
}

// Kept as a compatibility shim for older state/UI references. Serum Powder
// never requires putting cards back before its replacement draw; the normal
// mulligan bottoming happens only after the player finally keeps a hand.
function finishSerumPowder() {
  if (!state || state.phase !== 'mull' || !state.serumPending) return;
  state.serumPending = false;
  state.bottomPhase = false;
  render();
}
function pregameAction(id,action) {
  if(!state||state.phase!=='pregame')return; const f=findCard(id); if(!f||f.zone!=='hand')return;
  snap(); const [c]=state.hand.splice(f.idx,1);
  if(action==='battlefield'){enterBattlefield(c,{from:'hand',tapped:false,logMsg:`Pre-game: ${c.name} begins on the battlefield`});}
  else {state.exile.push(c);log(`Pre-game: ${c.name} exiled`);}
  render();
}
function finishPregame(){if(!state||state.phase!=='pregame')return;snap();state.pregameDone=true;state.phase='play';log('Pre-game actions complete');startTurn();}
// ---- turn structure
const STEPS = [
  { id: 'untap', g: 'Beginning', label: 'Untap', tip: 'Untap your permanents. No player receives priority during untap.' },
  { id: 'upkeep', g: 'Beginning', label: 'Upkeep', tip: 'Upkeep triggers happen here. After triggers are put on the stack, instants and activated abilities can be used.' },
  { id: 'draw', g: 'Beginning', label: 'Draw', tip: 'Draw your card for the turn. After the draw, instants, flash spells, and activated abilities can be used.' },
  { id: 'main1', g: 'Main', label: 'Main 1', tip: 'You may play one land this turn and cast spells allowed at sorcery speed. Instants and flash are also available.' },
  { id: 'begin_combat', g: 'Combat', label: 'Begin', tip: 'Beginning-of-combat triggers happen here. Players can cast instants and activate abilities before attackers are declared.' },
  { id: 'attack', g: 'Combat', label: 'Attack', tip: 'Declare attackers. After attackers are declared, players get priority to cast instants and activate abilities.' },
  { id: 'block', g: 'Combat', label: 'Block', tip: 'Declare blockers. After blockers are declared, players get priority before combat damage.' },
  { id: 'damage', g: 'Combat', label: 'Damage', tip: 'Combat damage is dealt. After damage, players receive priority before the next step.' },
  { id: 'end_combat', g: 'Combat', label: 'End', tip: 'End-of-combat triggers happen here. Instants and activated abilities can be used before leaving combat.' },
  { id: 'main2', g: 'Main', label: 'Main 2', tip: 'Second main phase. You may play a land if you have not played one this turn, and cast sorcery-speed spells.' },
  { id: 'end', g: 'Ending', label: 'End step', tip: 'End-step triggers happen here. Instants and activated abilities can still be used.' },
  { id: 'cleanup', g: 'Ending', label: 'Cleanup', tip: 'Discard to seven if necessary and remove damage and temporary effects. Players normally do not receive priority unless a trigger occurs.' }
];
const MAIN1 = 3, MAIN2 = 9, CLEANUP = 11;
const isBlocked = () => !state || state.phase !== 'play' || state.discarding > 0 || state.phasePause;

let toastTimer = null;
function toast(t1, t2) {
  if (!teach('phasePopups')) return;
  const el = $('#toast');
  el.replaceChildren(h('div', { class: 't1', text: t1 }), t2 ? h('div', { class: 't2', text: t2 }) : '');
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1500);
}

function enterStep(i, quiet) {
  if (state.step !== i && manaTotal()) clearManaPool(`leaving ${STEPS[state.step]?.label || 'previous step'}`);
  state.step = i;
  const id = STEPS[i].id;
  if (id === 'untap') {
    // Rule 502.3: untap everything except permanents that say they don't (v0.63): "~ doesn't untap during your untap step", Back to Basics.
    const noUntapNonbasic = state.battlefield.some(x => /nonbasic lands don'?t untap during their controllers' untap steps/i.test(cardText(x)));
    const held = [];
    for (const c of state.battlefield) {
      const tx = (cardText(c) || '').replace(/\u2019/g, "'"), nm = c.name.split(' // ')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const self = new RegExp("^(?:" + nm + "|this \\w+) doesn't untap during your untap step", 'im').test(tx);
      const bb = noUntapNonbasic && /\bLand\b/.test(c.types ? c.types.join(' ') : (cardInfo(c.name) || {}).t || '') && !/\bBasic\b/.test((cardInfo(c.name) || {}).t || '');
      if ((self || bb) && c.tapped) { held.push(c.name); continue; }
      c.tapped = false;
    }
    log('Untap' + (held.length ? ` (stayed tapped: ${[...new Set(held)].join(', ')})` : '')); endFx(e => e.until === 'yourNextTurn' && e.turn < state.turn, 'your turn began'); }
  else if (id === 'draw') {
    const fx = staticFx();
    if (state.skipDraw) { state.skipDraw = false; log('No draw (on the play)'); }
    else if (fx.skipDraw) { log(`Draw step skipped (${fx.skipDraw}: "skip your draw step")`); if (!quiet) toast('Draw step skipped', `${fx.skipDraw} says to skip your draw step.`); }
    else if (dredgeOptions().length && teach('dredgePrompts')) { log('Draw step: you may dredge instead of drawing'); askDredge(1); }
    else log(drawCards(1) ? 'Draw' : 'Library is empty!');
  } else if (id === 'main1') {
    for (const c of state.battlefield.slice()) if (isSaga(c)) sagaAdvance(c, false);
  } else if (id === 'end') {
    runDelayed('end');
  } else if (id === 'damage') {
    dealCombatDamage();
  } else if (id === 'cleanup') {
    for (const x of state.battlefield) { if (x.dmg) delete x.dmg; }
    endFx(e => e.until === 'eot', 'end of turn');   // "until end of turn" effects end
    const lim = staticFx().maxHand;
    if (state.hand.length > lim) { state.discarding = state.hand.length - lim; bottomSel.clear(); }
  }
  fireTrigger('step', { id });
  if (!quiet) toast(STEPS[i].label === 'End' ? 'End of combat' : STEPS[i].g === 'Combat' ? 'Combat: ' + STEPS[i].label : STEPS[i].label, STEPS[i].tip);
  if (!quiet && teach('phasePauses')) { state.phasePause = true; }
}

function startTurn() {
  state.landPlayedThisTurn = false; state.landsPlayed = 0; state.extraLandDrops = 0; state.usedAb = {};
  state.combat = { attackers: [], blockers: {}, declared: false, dealt: false };
  state.step = 0; state.phasePause = false;
  enterStep(0, true);
  if (teach('phasePauses')) {
    state.phasePause = true;
    toast(`Turn ${state.turn}`, 'Untap complete. Continue to the next step when ready.');
  } else if (teach('autoStart')) {
    enterStep(1, true); enterStep(2, true); enterStep(MAIN1, true); toast(`Turn ${state.turn}`, 'Untap, upkeep and draw done. Main phase 1.');
  } else toast(`Turn ${state.turn}`, 'Untap step. Press Next phase to continue.');
  render(); turnBanner();
  flushTriggers();
}

function jumpToStep(i) {
  if (isBlocked() || i <= state.step) return;
  snap();
  for (let j = state.step + 1; j <= i && !state.discarding && !(j > state.step + 1 && state.pendingTriggers.length); j++) enterStep(j, j !== i);
  render();
  flushTriggers();
}

function nextPhase() {
  if (isBlocked()) return;
  if (STEPS[state.step].id === 'attack' && !state.combat.declared && teach('combatHelper') && eligibleAttackers().length) { promptSkipAttack(); return; }
  if (state.step >= CLEANUP) { nextTurn(); return; }
  jumpToStep(state.step + 1);
}

function nextTurn() {
  if (isBlocked()) return;
  snap();
  if (state.step < CLEANUP) { for (let j = state.step + 1; j <= CLEANUP && !state.discarding && !state.pendingTriggers.length; j++) enterStep(j, true); }
  if (state.pendingTriggers.length) { render(); flushTriggers(); return; }
  if (state.discarding) { render(); return; }
  state.turn++;
  if (state.extraTurns > 0) { state.extraTurns--; log('Extra turn begins'); }
  startTurn();
}

function confirmDiscard() {
  if (!state || !state.discarding || bottomSel.size !== state.discarding) return;
  snap();
  for (const id of [...bottomSel]) {
    const i = state.hand.findIndex(c => c.id === id);
    if (i >= 0) { const [c] = state.hand.splice(i, 1); gyPush(c, 'hand'); log(`Discarded ${c.name}`); }
  }
  bottomSel.clear(); state.discarding = 0;
  render();
  flushTriggers();
}

function untapAll() {
  if (!state || state.phase !== 'play') return;
  snap();
  for (const c of state.battlefield) c.tapped = false;
  log('Untap all');
  render();
}

function drawOne() {
  if (!state || state.phase !== 'play') return;
  snap();
  const n = drawCards(1);
  log(n ? 'Draw' : 'Library is empty!');
  render();
}


function millCards(n) {
  if (!state || !n) return;
  snap();
  const names = [];
  for (let i = 0; i < n && state.library.length; i++) { const c = state.library[0]; names.push(c.name); moveCardQuiet(c.id, 'graveyard'); }
  log(names.length ? `Milled ${names.length}: ${names.join(', ')}` : 'Library is empty!');
  render();
}
function moveCardQuiet(id, to) { const before = undoStack.length; moveCard(id, to); if (undoStack.length > before) undoStack.length = before; }

function closeLibMenu() { const m = $('#libMenu'); if (m) m.remove(); document.removeEventListener('keydown', libMenuKey, true); }
function libMenuKey(e) { if (e.key === 'Escape') { e.stopPropagation(); closeLibMenu(); } }
function openLibMenu(ev) {
  if (!state) return;
  closeLibMenu();
  const play = state.phase === 'play';
  const nIn = h('input', { type: 'number', value: '1', min: '1', max: '99', title: 'How many cards' });
  const n = () => Math.max(1, parseInt(nIn.value, 10) || 1);
  const item = (label, hint, fn, dis) => { const b = h('button', { class: 'lm-item', role: 'menuitem' }, h('span', { text: label }), h('small', { text: hint })); b.disabled = !!dis; b.addEventListener('click', e => { e.stopPropagation(); closeLibMenu(); fn(); }); return b; };
  const m = h('div', { id: 'libMenu', role: 'menu' },
    h('div', { class: 'lm-title', text: `Library · ${state.library.length} cards` }),
    item('Draw a card', 'Takes the top card into your hand', drawOne, !play),
    h('div', { class: 'lm-n' }, h('span', { text: 'Number of cards' }), nIn),
    item('Look at top N', 'Look at, reorder or move the top cards', () => openLibraryManipulation()),
    item('Scry N', 'Look, then keep on top or bottom', () => openScry(n(), false)),
    item('Surveil N', 'Look, then keep on top or put in graveyard', () => openScry(n(), true)),
    item('Mill N', 'Put the top cards into the graveyard', () => millCards(n())),
    h('hr'),
    item('Search library', 'Find a card (shuffle afterwards)', () => openZone('library')),
    item('Shuffle', 'Randomise the library', shuffleLibrary));
  document.body.append(m);
  const r = $('#libstack').getBoundingClientRect();
  const w = m.offsetWidth, hh = m.offsetHeight;
  let x = ev && ev.clientX ? ev.clientX : r.right + 6, y = ev && ev.clientY ? ev.clientY : r.top;
  if (x + w > innerWidth - 6) x = Math.max(6, r.left - w - 6);
  if (y + hh > innerHeight - 6) y = Math.max(6, innerHeight - hh - 6);
  m.style.left = x + 'px'; m.style.top = y + 'px';
  document.addEventListener('keydown', libMenuKey, true);
  m.querySelector('.lm-item:not([disabled])')?.focus();
}
function setupLibraryMenu() {
  const ls = $('#libstack');
  ls.addEventListener('click', e => { e.stopPropagation(); if ($('#libMenu')) closeLibMenu(); else openLibMenu(e); });
  ls.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); openLibMenu(e); });
  ls.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLibMenu(); } });
  document.addEventListener('click', e => { const m = $('#libMenu'); if (m && !m.contains(e.target)) closeLibMenu(); });
}

function shuffleLibrary() {
  if (!state) return;
  snap();
  shuffle(state.library);
  log('Shuffled library');
  render();
}

function manaTotal() {
  if (!state || !state.manaPool) return 0;
  return Object.values(state.manaPool).reduce((a,b)=>a+(b||0),0);
}
function clearManaPool(reason='') {
  if (!state || !state.manaPool || !manaTotal()) return;
  const total = manaTotal();
  state.manaPool = {W:0,U:0,B:0,R:0,G:0,C:0};
  if (reason) log(`${total} floating mana emptied (${reason})`);
}
function addFloatingMana(color, amount=1) {
  if (!state) return;
  state.manaPool = state.manaPool || {W:0,U:0,B:0,R:0,G:0,C:0};
  state.manaPool[color] = (state.manaPool[color] || 0) + amount;
}
// ---------------------------------------------------------------- mana rocks + soft static-ability checks
// A mana rock is a nonland permanent with a plain "{T}: Add ..." line. Supported: Add {C}. / Add {C}{C}. / Add {R} or {G}.
// / Add one mana of any color. / Add one mana of any color among legendary creatures and planeswalkers you control.
// Extra sentences like "Activate only if you control a Dragon." are checked softly (see staticCheck).
const ROCK_CACHE = new Map();
function rockInfo(c) {
  if (!c || c.token || isLandName(c.name)) return null;
  const tx = cardText(c);
  if (!tx) return null;
  const key = norm(c.name);
  if (ROCK_CACHE.has(key + '|' + tx.length)) return ROCK_CACHE.get(key + '|' + tx.length);
  let out = null;
  for (const line of tx.split('\n')) {
    const m = line.trim().match(/^\{T\}: Add (.+)$/);
    if (!m) continue;
    const body = m[1];
    const first = body.split(/(?<=\.)\s+/)[0], rest = body.slice(first.length).trim();
    let r = null;
    let mm;
    if ((mm = first.match(/^((?:\{[WUBRGC]\})+)\.?$/))) r = { fixed: [...mm[1].matchAll(/\{([WUBRGC])\}/g)].map(x => x[1]) };
    else if ((mm = first.match(/^(\{[WUBRGC]\}(?:,? (?:or )?\{[WUBRGC]\})+)\.?$/))) r = { choice: [...mm[1].matchAll(/\{([WUBRGC])\}/g)].map(x => x[1]) };
    else if (/^one mana of any color among legendary creatures and planeswalkers you control\.?$/i.test(first)) r = { among: true, choice: [] };
    else if (/^one mana of any color\.?$/i.test(first)) r = { choice: ['W', 'U', 'B', 'R', 'G'] };
    if (!r) continue;
    const cm = (rest + ' ' + first).match(/Activate (?:this ability )?only ([^.]+)\./i);
    r.cond = cm ? cm[1].trim() : null;
    out = r; break;
  }
  ROCK_CACHE.set(key + '|' + tx.length, out);
  return out;
}
// Soft check of a restriction phrase such as "if you control a Dragon" or "as a sorcery".
// Returns { ok: true | false | null (unknown), why }. Callers warn but let the player override.
const STEP_RESTRICTIONS = [
  [/^during your upkeep$/, ['upkeep'], 'during your upkeep'],
  [/^during your draw step$/, ['draw'], 'during your draw step'],
  [/^during your end step$/, ['end'], 'during your end step'],
  [/^during (?:the )?beginning of combat(?: on your turn)?$/, ['begin_combat'], 'during the beginning of combat'],
  [/^during (?:your )?combat before blockers are declared$|^before blockers are declared$|^during (?:your )?combat before (?:the )?declare blockers step$/, ['begin_combat', 'attack'], 'before blockers are declared'],
  [/^during (?:your )?combat$|^during combat on your turn$/, ['begin_combat', 'attack', 'block', 'damage', 'end_combat'], 'during combat'],
  [/^during (?:the |your )?declare attackers step$/, ['attack'], 'during the declare attackers step'],
  [/^during your main phase$|^during your turn's main phase$/, ['main1', 'main2'], 'during your main phase'],
  [/^during your turn before attackers are declared$/, ['upkeep', 'draw', 'main1', 'begin_combat'], 'before attackers are declared'],
  [/^during your turn after attackers (?:have been|are) declared$/, ['attack', 'block', 'damage', 'end_combat', 'main2', 'end'], 'after attackers are declared']
];
// Parse one "Activate only ..." phrase into a restriction record, or null when the app does not know it.
function parseRestrictionPart(p) {
  p = p.trim().replace(/[.]$/, ''); let m;
  if (/^(?:as a sorcery|any time you could cast a sorcery)$/i.test(p)) return { kind: 'sorcery', label: 'as a sorcery (your main phase, empty stack)' };
  if (/^once each turn$/i.test(p)) return { kind: 'once', label: 'once each turn' };
  if (/^during your turn$/i.test(p)) return { kind: 'myturn', label: 'during your turn' };
  if (/^(?:during )?(?:an? opponent'?s turn|any other player'?s turn|the opponent'?s turn)$/i.test(p)) return { kind: 'oppturn', label: "during an opponent's turn" };
  for (const [re, steps, label] of STEP_RESTRICTIONS) if (re.test(p)) return { kind: 'steps', steps, label };
  if ((m = p.match(/^if you control (?:an?|one or more) (.+)$/i))) return { kind: 'control', what: m[1], label: `if you control ${/^[aeiou]/i.test(m[1]) ? 'an' : 'a'} ${m[1]}` };
  if (/^if you have no cards in hand$/i.test(p)) return { kind: 'hand', max: 0, label: 'if you have no cards in hand' };
  if ((m = p.match(/^if you have (\w+) or (more|fewer) cards in (?:your )?(hand|graveyard)$/i))) return { kind: 'count', n: numOf(m[1]), more: /more/i.test(m[2]), zone: m[3].toLowerCase() === 'hand' ? 'hand' : 'graveyard', label: p };
  if ((m = p.match(/^if there are (\w+) or more cards in your graveyard$/i))) return { kind: 'count', n: numOf(m[1]), more: true, zone: 'graveyard', label: p };
  return null;
}
function parseRestriction(cond) {
  const parts = String(cond || '').split(/\s+and\s+(?=only\b|once each turn|as a sorcery|during\b|if you\b)/i).map(x => x.replace(/^only\s+/i, '').trim()).filter(Boolean);
  return parts.map(p => ({ raw: p, rec: parseRestrictionPart(p) }));
}
function checkRestrictionPart(rec, card) {
  if (!state) return { ok: true, why: '' };
  const stepId = STEPS[state.step] && STEPS[state.step].id;
  switch (rec.kind) {
    case 'sorcery': return canPlaySorcerySpeedNow() ? { ok: true, why: '' } : { ok: false, why: 'This can only be activated at sorcery speed: your main phase with an empty stack.' };
    case 'myturn': return { ok: true, why: '' };
    case 'oppturn': return { ok: false, why: "This can only be activated during an opponent's turn. A goldfish game only has your turns, so it is never available here." };
    case 'once': return card && state.usedAb && state.usedAb[card.id] ? { ok: false, why: 'This ability can only be activated once each turn, and you already did.' } : { ok: true, why: '' };
    case 'steps': return rec.steps.includes(stepId) ? { ok: true, why: '' } : { ok: false, why: `This can only be activated ${rec.label}. It is currently ${STEPS[state.step] ? STEPS[state.step].label : 'not a step'}.` };
    case 'hand': return state.hand.length <= rec.max ? { ok: true, why: '' } : { ok: false, why: `You must have no cards in hand (you have ${state.hand.length}).` };
    case 'count': { const n = state[rec.zone].length; const okc = rec.more ? n >= rec.n : n <= rec.n; return okc ? { ok: true, why: '' } : { ok: false, why: `Needs ${rec.n} or ${rec.more ? 'more' : 'fewer'} cards in your ${rec.zone}; you have ${n}.` }; }
    case 'control': {
      const alts = rec.what.split(/\s+or\s+(?:an?\s+)?/i).map(x => x.trim()).filter(Boolean);
      const subs = alts.map(a => parseSubject(a + ' you control', { id: -1, name: '' }));
      const has = subs.every(Boolean) ? state.battlefield.some(c => subs.some(sj => sj.test(c))) : state.battlefield.some(c => {
        if (c.token) return false;
        const t = frontType(c), i = cardInfo(c.name), changeling = i && /\bchangeling\b/i.test(i.tx || '');
        return alts.some(alt => alt.split(/\s+/).every(w => new RegExp('\\b' + w.replace(/s$/i, '') + 's?\\b', 'i').test(t) || (changeling && /\bCreature\b/.test(t))));
      });
      return has ? { ok: true, why: '' } : { ok: false, why: `You do not control ${/^[aeiou]/i.test(rec.what) ? 'an' : 'a'} ${rec.what} (checked: permanents you control on the battlefield).` };
    }
  }
  return { ok: null, why: '' };
}
// Soft check of a restriction phrase such as "if you control a Dragon", "as a sorcery" or "once each turn".
// Returns { ok: true | false | null (unknown), why }. Callers warn but let the player override.
function staticCheck(cond, card) {
  if (!cond || !state) return { ok: true, why: '' };
  let unknown = null;
  for (const p of parseRestriction(cond)) {
    if (!p.rec) { unknown = unknown || { ok: null, why: `Restriction "Activate only ${p.raw}" could not be checked automatically. Make sure it is met.` }; continue; }
    const r = checkRestrictionPart(p.rec, card);
    if (r.ok === false) return r;
  }
  return unknown || { ok: true, why: '' };
}
function markAbilityUsed(card) { if (!state || !card) return; state.usedAb = state.usedAb || {}; state.usedAb[card.id] = true; }
function amongColors() {
  const out = new Set();
  for (const c of state.battlefield) {
    if (c.token) continue;
    const t = frontType(c);
    if (/\bLegendary\b/.test(t) && /\b(Creature|Planeswalker)\b/.test(t)) for (const col of ((cardInfo(c.name) || {}).col || [])) if ('WUBRG'.includes(col)) out.add(col);
  }
  return [...out];
}
function rockColors(c) {
  const r = rockInfo(c); if (!r) return [];
  if (r.among) return amongColors();
  return [...new Set(r.fixed || r.choice)];
}
function rockStatus(c) {   // can this rock produce mana right now? (soft)
  const r = rockInfo(c); if (!r) return { ok: false, why: '' };
  if (isSick(c)) return { ok: false, why: 'Summoning sickness: this creature came under your control this turn, so it cannot tap for mana (it has no haste).' };
  if (r.among && !amongColors().length) return { ok: false, why: 'You control no legendary creature or planeswalker with a colour, so there is no colour of mana to add.' };
  return r.cond ? staticCheck(r.cond, c) : { ok: true, why: '' };
}
function isManaPermanent(c) { return isLandName(c.name) || !!rockInfo(c); }
function softWarn(title, msg, proceed) {
  const m = modal(title, { width: 480, sticky: true });
  m.body.append(h('div', { class: 'psub', text: msg }), h('div', { class: 'muted small', text: 'This check is a soft one: it can be wrong, so you may continue anyway.' }));
  m.foot.append(h('button', { text: 'Cancel', onclick: () => m.close() }), h('button', { class: 'primary', text: 'Do it anyway', onclick: () => { m.close(); proceed(); } }));
}
function tapRock(card) {
  const id = card.id, r = rockInfo(card);
  const run = () => {
    const f = findCard(id); if (!f || f.zone !== 'battlefield' || f.card.tapped) return;
    if (r.fixed) {
      snap(); f.card.tapped = true; markAbilityUsed(f.card); for (const col of r.fixed) addFloatingMana(col);
      log(`${f.card.name} tapped → floated ${r.fixed.join('')}`); render(); return;
    }
    const colors = rockColors(f.card);
    const use = colors.length ? colors : ['W', 'U', 'B', 'R', 'G'];
    openManaChoice(f.card, color => {
      if (!color) return;
      const g = findCard(id); if (!g || g.zone !== 'battlefield' || g.card.tapped) return;
      snap(); g.card.tapped = true; markAbilityUsed(g.card); addFloatingMana(color);
      log(`${g.card.name} tapped → floated ${color}`); render();
    }, use);
  };
  const st = rockStatus(card);
  if (st.ok === true) run();
  else softWarn(`${card.name}: condition not met`, st.why, run);
}
function landManaColors(c) {
  if (c && !isLandName(c.name)) return rockColors(c);
  if (!c || !isLandName(c.name)) return [];
  const eff = effectiveLandTypes(c);
  // Blood Moon / Magus of the Moon overwrite nonbasic lands into Mountains,
  // so their old mana abilities no longer apply.
  if (eff.override) return eff.types.includes('Mountain') ? ['R'] : [];
  const i = cardInfo(c.name), key = norm(c.name);
  const prod = (i && i.prod && i.prod.length) ? i.prod : BASIC_PRODUCES[key] || [];
  const out = new Set(prod.map(x=>String(x).toUpperCase()).filter(x=>/^[WUBRGC]$/.test(x)));
  for (const t of eff.types) out.add(({Plains:'W',Island:'U',Swamp:'B',Mountain:'R',Forest:'G'})[t]);
  return [...out].filter(Boolean);
}
function openManaChoice(c, done, forced) {
  const colors = forced || landManaColors(c);
  if (!colors.length) { done(null); return; }
  if (colors.length === 1) { done(colors[0]); return; }
  const m = modal(`Float mana — ${c.name}`, {width:420, sticky:true});
  const choices = h('div',{class:'mana-choice'});
  const labels={W:'White',U:'Blue',B:'Black',R:'Red',G:'Green',C:'Colorless'};
  for (const color of colors) {
    choices.append(h('button',{class:'mana-choice-btn '+color,text:`${labels[color]} (${color})`,
      onclick:()=>{m.close();done(color);}}));
  }
  m.body.append(h('div',{class:'psub'},'Choose which mana this land produces. It stays in your mana pool until the current step/phase ends.'),choices);
  m.foot.append(h('button',{text:'Cancel',onclick:()=>m.close()}));
}
function tapForMana(id) {
  const f=findCard(id);
  if (!f || f.zone !== 'battlefield' || f.card.tapped || !isManaPermanent(f.card)) return;
  if (!isLandName(f.card.name)) { tapRock(f.card); return; }
  { const lm=landMulti(f.card,true);
    if(lm){ snap(); f.card.tapped=true; fireTrigger('tapmana',{card:f.card}); for(const col of lm.fixed) addFloatingMana(col); applyLandCost(f.card,{dmg:lm.dmg,life:lm.life}); log(`${f.card.name} tapped → floated ${lm.fixed.join('')}`); if(lm.only) toast('Mana restriction',`Spend this mana only ${lm.only}. The app cannot track restricted mana in the pool, so keep to that yourself, or pay through the cast window, which enforces it.`); render(); return; } }
  const colors=landManaColors(f.card);
  if (!colors.length) { toast('No mana ability detected', `${f.card.name} has no recognized mana production entry.`); return; }
  openManaChoice(f.card, color=>{
    if (!color) return;
    const fresh=findCard(id);
    if (!fresh || fresh.zone!=='battlefield' || fresh.card.tapped) return;
    snap();
    fresh.card.tapped=true; fireTrigger('tapmana',{card:fresh.card});
    addFloatingMana(color); applyLandCost(fresh.card,landTapCost(fresh.card));
    log(`${fresh.card.name} tapped → floated ${color}`);
    render();
  });
}
function toggleTap(id) {
  const f = findCard(id);
  if (!f || f.zone !== 'battlefield') return;
  if (!f.card.tapped && isManaPermanent(f.card)) { tapForMana(id); return; }
  snap();
  f.card.tapped = !f.card.tapped;
  render();
}

function addCounter(id,d,type='plus',manual) {
  const f=findCard(id); if(!f)return; snap();
  if(!manual && d>0 && state.battlefield.some(x=>x.id===id)) d=adjustCounterAdd(f.card,type,d,true);
  if(typeof f.card.counters==='number')f.card.counters={plus:f.card.counters,minus:0};
  f.card.counters=f.card.counters||{plus:0,minus:0};
  f.card.counters[type]=Math.max(0,(f.card.counters[type]||0)+d); checkNoCounterTriggers(); render(); flushTriggers();
}

function changeLife(d, real) {   // real = life gained or lost by a card effect (manual +/- buttons do not trigger anything)
  if (!state) return;
  snap();
  state.life += d;
  log(`Life ${d > 0 ? '+' : ''}${d} → ${state.life}`);
  if (real && d > 0) fireTrigger('lifegain', { amount: d });
  if (real && d < 0) fireTrigger('lifeloss', { amount: -d });
  render();
  if (real && d !== 0) flushTriggers();
}

// ---------------------------------------------------------------- tokens (v0.61): token definitions read from card text
const TOKEN_PRE = {
  'treasure': { types: ['Artifact'], tx: '{T}, Sacrifice this artifact: Add one mana of any color.' },
  'food': { types: ['Artifact'], tx: '{2}, {T}, Sacrifice this artifact: You gain 3 life.' },
  'clue': { types: ['Artifact'], tx: '{2}, Sacrifice this artifact: Draw a card.' },
  'blood': { types: ['Artifact'], tx: '{1}, {T}, Discard a card, Sacrifice this artifact: Draw a card.' },
  'powerstone': { types: ['Artifact'], tx: "{T}: Add {C}. This mana can't be spent to cast a nonartifact spell." },
  'gold': { types: ['Artifact'], tx: 'Sacrifice this artifact: Add one mana of any color.' },
  'map': { types: ['Artifact'], tx: '{1}, {T}, Sacrifice this artifact: Target creature you control explores. Activate only as a sorcery.' },
  'eldrazi spawn': { pt: '0/1', types: ['Creature'], tx: 'Sacrifice this creature: Add {C}.' },
  'eldrazi scion': { pt: '1/1', types: ['Creature'], tx: 'Sacrifice this creature: Add {C}.' }
};
const TOKEN_NUMW = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const TOKEN_COL = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
function tokenDefsFromText(text, srcName) {
  const t = String(text || '').replace(/\([^)]*\)/g, ' ').replace(/\n/g, ' ').replace(/\u2019/g, "'");
  const out = [], re = /\bcreates?\s+([^"]*?)\btokens?\b((?:"[^"]*"|[^."])*)/gi; let m;
  const mk = d => { d.from = srcName || ''; d.key = [d.name, d.pt || '', (d.col || []).join(''), d.tx || ''].join('|'); out.push(d); };
  while ((m = re.exec(t))) {
    let head = m[1].trim(), tail = m[2] || '';
    if (/\b(?:cop(?:y|ies)|that's a|named)\b/i.test(head + ' ' + tail.slice(0, 30)) || !head) continue;
    let named = '', lg = /\blegendary\b/i.test(head), nmM = head.match(/^([A-Z][^,]*),\s+(?:an?\s+)?(.*)$/);
    if (nmM) { named = nmM[1].trim(); head = nmM[2]; }
    let count = 1, cm = named ? null : head.match(/^(an?|one|two|three|four|five|six|seven|eight|nine|ten|\d+|x|that many|a number of)\s+/i);
    if (cm) { const w = cm[1].toLowerCase(); count = /^\d+$/.test(w) ? +w : w === 'x' ? 'X' : (TOKEN_NUMW[w] || 'X'); head = head.slice(cm[0].length); }
    let tapped = false; if (/^tapped\s+/i.test(head)) { tapped = true; head = head.replace(/^tapped\s+/i, ''); }
    head = head.replace(/^legendary\s+/i, '');
    let pt = '', pm = head.match(/^(\d+|X|\*)\/(\d+|X|\*)\s+/i); if (pm) { pt = pm[1] + '/' + pm[2]; head = head.slice(pm[0].length); }
    const col = [], types = []; let words = head.split(/\s+/).filter(Boolean), nameW = [];
    for (const w of words) { const lw = w.toLowerCase().replace(/,$/, '');
      if (TOKEN_COL[lw]) col.push(TOKEN_COL[lw]); else if (lw === 'colorless' || lw === 'and' || lw === 'legendary') continue;
      else if (/^(creature|artifact|enchantment|land)$/.test(lw)) types.push(lw[0].toUpperCase() + lw.slice(1)); else nameW.push(w); }
    const name = named || nameW.join(' ').trim(); if (!name) continue;
    const pre = TOKEN_PRE[name.toLowerCase()] || {};
    if (!pt && pre.pt) pt = pre.pt;
    const ty = types.length ? types : pre.types ? pre.types : pt ? ['Creature'] : ['Artifact'];
    if (pt && !ty.includes('Creature')) ty.unshift('Creature');
    const lines = [], tm = tail.match(/^\s*,?\s*(?:tapped(?: and attacking)?,?\s*)?with\s+(.*)$/i);
    if (tm) { const rest = tm[1], q0 = rest.indexOf('"'); let kwPart = q0 >= 0 ? rest.slice(0, q0) : rest;
      if (q0 >= 0) { const qm = rest.slice(q0).match(/^(?:"[^"]*")(?:\s*(?:,|and)?\s*"[^"]*")*/); if (qm) for (const q of qm[0].matchAll(/"([^"]*)"/g)) lines.push(q[1]); }
      const kw = kwPart.split(/,|\band\b/).map(x => x.trim()).filter(x => x && !/counter|\bon it\b/i.test(x));
      for (const k of kw.reverse()) lines.unshift(k[0].toUpperCase() + k.slice(1)); }
    let tx = lines.join('\n'); if (!tx && pre.tx) tx = pre.tx;
    const subW = named ? nameW : name.split(/\s+/);
    mk({ name, pt, col, types: ty, subs: subW.map(x => x.toLowerCase()), tx, count, tapped, legendary: lg, type: `Token ${lg ? 'Legendary ' : ''}${ty.join(' ')} — ${subW.join(' ') || name}` });
  }
  let am = t.match(/\bamass ([A-Z][a-z]+)/); if (am) { const ty = singularWord(am[1]), tn = ty[0].toUpperCase() + ty.slice(1); mk({ name: `${tn} Army`, pt: '0/0', col: ['B'], types: ['Creature'], subs: [ty, 'army'], tx: '', count: 1, type: `Token Creature — ${tn} Army`, amassOnly: true }); }
  if (/\binvestigate\b/i.test(t)) mk({ name: 'Clue', pt: '', col: [], types: ['Artifact'], subs: ['clue'], tx: TOKEN_PRE.clue.tx, count: 1, type: 'Token Artifact — Clue' });
  if (/\bafterlife (\d+)/i.test(t)) mk({ name: 'Spirit', pt: '1/1', col: ['W', 'B'], types: ['Creature'], subs: ['spirit'], tx: 'Flying', count: +t.match(/\bafterlife (\d+)/i)[1], type: 'Token Creature — Spirit' });
  return out;
}
let tokenCache = { key: '', defs: [] };
function deckTokenDefs() {
  if (!state) return [];
  const names = new Set();
  for (const z of [state.hand, state.library, state.battlefield, state.graveyard, state.exile, state.sideboard || [], state.stack]) for (const c of z || []) if (c && !c.token && c.name) names.add(c.name);
  const key = [...names].sort().join('|') + '#' + cardCount;
  if (tokenCache.key === key) return tokenCache.defs;
  const map = new Map();
  for (const n of names) { const i = cardInfo(n); if (!i || !i.tx) continue; for (const d of tokenDefsFromText(i.tx.replace(new RegExp(i.name.split(' // ')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '~'), i.name.split(' // ')[0])) { const ex = map.get(d.key); if (ex) { if (!ex.froms.includes(d.from)) ex.froms.push(d.from); } else { d.froms = [d.from]; d.count = d.count; map.set(d.key, d); } } }
  tokenCache = { key, defs: [...map.values()] }; return tokenCache.defs;
}
function makeTokensFromDef(d, n, src) {
  if (!state) return; snap();
  for (let i = 0; i < n; i++) {
    const c = newCard(d.name, { token: true, tk: { pt: d.pt, subs: [...d.subs], col: [...d.col], tx: d.tx, types: [...d.types], type: d.type, legendary: !!d.legendary } });
    c.id = state.nextId++;
    if (d.amassOnly) c.counters = { plus: 1, minus: 0 };   // a hand-made Army starts as if amassed once
    enterBattlefield(c, { from: 'effect', tapped: !!d.tapped, logMsg: `${src ? src + ': created' : 'Created'} token ${d.name}${d.pt ? ' ' + d.pt : ''}` });
  }
  render(); flushTriggers();
}
function openTokenTray() {
  if (!state) return;
  const defs = deckTokenDefs();
  const m = modal('Tokens your deck can make', { width: 620 });
  m.body.append(h('div', { class: 'psub', text: 'Found by reading the rules text of every card in your deck. Pick a token to put it onto the battlefield (for example if a card’s effect did not offer it, or your opponent made you create one).' }));
  if (!defs.length) m.body.append(h('div', { class: 'muted small', text: 'No cards in this deck create tokens (or card data is not loaded yet).' }));
  for (const d of defs) {
    const q = h('input', { type: 'number', min: 1, max: 99, value: typeof d.count === 'number' && d.count > 0 ? d.count : 1, style: 'width:58px' });
    m.body.append(h('div', { class: 'row tokrow' },
      h('span', { class: 'tokpt', text: d.pt || '—' }),
      h('span', { class: 'nm' }, h('b', { text: d.name }), h('span', { class: 'muted small', text: ` ${d.type.replace('Token ', '')}${d.col.length ? ' · ' + d.col.join('') : ' · colorless'}` }), h('div', { class: 'muted small', text: [d.tx.replace(/\n/g, '; '), 'from ' + d.froms.join(', ')].filter(Boolean).join(' — ') })),
      q, h('button', { class: 'primary', text: 'Create', onclick: () => makeTokensFromDef(d, Math.max(1, parseInt(q.value, 10) || 1), '') })));
  }
  const nm = h('input', { type: 'text', placeholder: 'Other token name', style: 'flex:1;min-width:0' }), pt = h('input', { type: 'text', placeholder: 'P/T (blank = noncreature)', style: 'width:120px' });
  m.body.append(h('div', { class: 'fhead', text: 'Other token' }), h('div', { class: 'row' }, nm, pt, h('button', { text: 'Create', onclick: () => { const n = nm.value.trim(); if (n) makeToken(n, pt.value.trim()); } })));
  m.foot.append(h('button', { class: 'primary', text: 'Close', onclick: () => m.close() }));
}
// Amass (rule 701.47): put N +1/+1 counters on an Army you control; with none, first create a 0/0 black Army token. The Army becomes an <Type> in addition.
function doAmass(type, n, src) {
  if (!state) return;
  const ty = singularWord(type), tyName = ty[0].toUpperCase() + ty.slice(1);
  const armies = state.battlefield.filter(c => permTypeInfo(c).subs.has('army'));
  const apply = army => {
    snap();
    if (!army) {
      const c = newCard(`${tyName} Army`, { token: true, tk: { pt: '0/0', subs: [ty, 'army'], col: ['B'], types: ['Creature'], type: `Token Creature — ${tyName} Army` } });
      c.id = state.nextId++; c.counters = { plus: n, minus: 0 };
      enterBattlefield(c, { from: 'effect', tapped: false, logMsg: `${src}: amass ${type} ${n} — you controlled no Army, so you create a 0/0 black ${tyName} Army token, then put ${n} +1/+1 counter${n === 1 ? '' : 's'} on it` });
    } else {
      if (typeof army.counters === 'number') army.counters = { plus: army.counters, minus: 0 };
      army.counters = army.counters || { plus: 0, minus: 0 };
      army.counters.plus = (army.counters.plus || 0) + n;
      if (!permTypeInfo(army).subs.has(ty)) army.addSubs = [...(army.addSubs || []), ty];
      log(`${src}: amass ${type} ${n} — ${n} +1/+1 counter${n === 1 ? '' : 's'} on ${army.name} (it is also a${/^[aeiou]/.test(ty) ? "n" : ""} ${tyName} now)`);
    }
    render(); flushTriggers();
  };
  if (armies.length <= 1) { apply(armies[0] || null); return; }
  const m = modal(`Amass ${type} ${n}`, { width: 460, sticky: true, noClose: true });
  m.body.append(h('div', { class: 'psub', text: 'You control more than one Army. Choose which one gets the counters (rule 701.47).' }));
  for (const a of armies) m.body.append(h('div', { class: 'row' }, h('span', { class: 'nm', text: `${a.name} (${ptText(a)})` }), h('button', { class: 'primary', text: 'Choose', onclick: () => { m.close(); apply(a); } })));
}
function openOppDraw() {
  if (!state) return;
  const m = modal('Opponent drew a card', { width: 480 });
  m.body.append(h('div', { class: 'psub', text: 'Abilities like Orcish Bowmasters ignore the first card an opponent draws in each of their draw steps. Was this that card?' }));
  m.foot.append(
    h('button', { text: 'Yes, their draw-step draw', onclick: () => { m.close(); log('Opponent drew their draw-step card (no triggers)'); } }),
    h('button', { class: 'primary', text: 'No, an extra draw', onclick: () => { m.close(); log('Opponent drew an extra card'); fireTrigger('oppdraw'); render(); flushTriggers(); } }));
}
function makeToken(name, pt) {
  if (!state) return;
  snap();
  const c = newCard(name || 'Token', { token: true, tk: { pt: pt || '' } });
  c.id = state.nextId++;
  enterBattlefield(c, { from: 'effect', tapped: false, logMsg: `Created token ${c.name}${pt ? ' ' + pt : ''}` });
  render();
  flushTriggers();
}

// ---------------------------------------------------------------- symbols
function symEl(code) {
  const up = code.toUpperCase();
  const first = (up.match(/[WUBRG]/) || [''])[0];
  const cls = up === 'T' ? 's-T' : first ? 's-' + first : '';
  return h('span', { class: 'sym ' + cls, text: up });
}
function symbols(str) {
  const frag = document.createDocumentFragment();
  const re = /\{([^}]+)\}/g;
  let last = 0, m;
  while ((m = re.exec(str))) {
    if (m.index > last) frag.append(str.slice(last, m.index));
    frag.append(symEl(m[1]));
    last = re.lastIndex;
  }
  if (last < str.length) frag.append(str.slice(last));
  return frag;
}


// Does this permanent enter the battlefield tapped? Call it BEFORE the card is put onto the battlefield.
function etbTapped(c) {
  const none = { tapped: false, why: '' };
  if (!c || c.token) return none;
  const tx = cardText(c).replace(new RegExp(c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '~');
  const key = norm(c.name);
  if (!tx) return /triome/i.test(c.name) ? { tapped: true, why: 'enters tapped' } : none;
  if (SHOCKS.has(key) || /you may pay 2 life/i.test(tx)) return none;       // shocklands ask the player
  const others = state ? state.battlefield.filter(x => isLandName(x.name)) : [];
  for (const raw of tx.split(/(?<=\.)\s+|\n/)) {
    if (!/\benters(?: the battlefield)? tapped\b/i.test(raw)) continue;
    if (/\bif you don't\b|\bmay\b/i.test(raw)) continue;
    const un = raw.match(/unless (.+?)\.?$/i);
    if (!un) return { tapped: true, why: 'enters tapped' };
    const cond = un[1];
    let m;
    if ((m = cond.match(/you control (two|three) or fewer other lands/i))) {
      const n = m[1].toLowerCase() === 'two' ? 2 : 3;
      return others.length > n ? { tapped: true, why: `enters tapped (you control more than ${n} other lands)` } : { tapped: false, why: `entered untapped (${others.length} other land${others.length === 1 ? '' : 's'})` };
    }
    if ((m = cond.match(/you control (two|three) or more other lands/i))) {
      const n = m[1].toLowerCase() === 'two' ? 2 : 3;
      return others.length < n ? { tapped: true, why: `enters tapped (fewer than ${n} other lands)` } : { tapped: false, why: `entered untapped (${others.length} other lands)` };
    }
    if ((m = cond.match(/you control an? ((?:Plains|Island|Swamp|Mountain|Forest)(?: or an? (?:Plains|Island|Swamp|Mountain|Forest))*)/i))) {
      const need = m[1].match(/Plains|Island|Swamp|Mountain|Forest/gi).map(x => x[0].toUpperCase() + x.slice(1).toLowerCase());
      const ok = domainAllTypes() || others.some(x => { const lt = landTypesOf(x.name); return lt.types && lt.types.some(t => need.includes(t)); });
      return ok ? { tapped: false, why: `entered untapped (you control a ${need.join(' or ')})` } : { tapped: true, why: `enters tapped (no ${need.join(' or ')})` };
    }
    return none;   // reveal / other conditions: left untapped, the player can tap it manually
  }
  return none;
}
function applyEtbTapped(c, res) {
  c.tapped = !!res.tapped;
  if (res.why) { log(`${c.name} ${res.why.replace(/^enters/, 'entered')}`); if (res.tapped) toast(`${c.name} enters tapped`, res.why.replace(/^enters tapped\s*/, '') || 'It will untap during your next untap step.'); }
}
function playLand(id) {
  const f=findCard(id); if(!f||f.zone!=='hand'||!isLandName(f.card.name))return;
  if (!canPlayLandNow()) {
    toast(landDropUsed() ? 'Land already played' : 'Wrong phase',
      landDropUsed() ? 'You have already used all your land plays this turn (' + landDropsAllowed() + ').' :
      'Lands can only be played during your main phase when the stack is empty.');
    return;
  }
  snap(); const [c]=state.hand.splice(f.idx,1); state.landsPlayed=(state.landsPlayed||0)+1; state.landPlayedThisTurn=state.landsPlayed>=landDropsAllowed();
  enterBattlefield(c,{from:'hand',logMsg:`Played land: ${c.name}`});
  render();
  if(state.pendingTriggers.length) resolvePendingTrigger();
}
function openShockChoice(id, fetched) {
  const f=findCard(id); if(!f||f.zone!=='battlefield')return; const c=f.card;
  // A played land can be taken back (undo); a fetched or put-onto-the-battlefield land cannot, so closing it just means "enter tapped".
  const m=modal(`${c.name}: enter the battlefield`,{width:500,sticky:true,onCancel:()=>{ if(fetched){ snap(); c.tapped=true; log(`${c.name} entered tapped`); render(); } else { undo(); toast('Land play cancelled','Nothing was paid and the land is back in your hand.'); } }});
  m.body.append(h('div',{class:'ptitle',text:'Would you like to pay 2 life?'},),
    h('div',{class:'psub',text:'Pay 2 life to have this shock land enter untapped. Otherwise it enters tapped.'}));
  const next=()=>{m.close(); if(state.pendingTriggers.length){const t=state.pendingTriggers.shift(); if(t.kind==='shock')openShockChoice(t.cardId,t.fetched); else openScry(t.n,t.kind==='surveil',t.text);} render();};
  m.foot.append(
    h('button',{text:'Enter tapped',onclick:()=>{snap();c.tapped=true;log(`${c.name} entered tapped`);next();}}),
    fetched?null:h('button',{text:'Cancel — take the land back',title:'Undo playing this land (same as the ✕ or Esc)',onclick:()=>{m.close();undo();toast('Land play cancelled','Nothing was paid and the land is back in your hand.');}}),
    h('button',{class:'primary',text:'Pay 2 life — enter untapped',onclick:()=>{snap();state.life-=2;c.tapped=false;log(`${c.name} entered untapped; paid 2 life`);next();}})
  );
}
function openStack() {
  if(!state||state.phase==='idle')return;
  const m=modal('The Stack',{width:720,sticky:true});
  const oppName=h('input',{type:'text',placeholder:'Opponent casts… (card name)',style:'flex:1;min-width:0'});
  const oppType=h('select',null,...['','Instant','Sorcery','Creature','Artifact','Enchantment','Planeswalker','Ability'].map(t=>h('option',{value:t,text:t==='Ability'?'triggered/activated ability':(t||'type (optional)')})));
  const addOpp=()=>{ const n=oppName.value.trim(); if(!n) return; castOppSpell(n,oppType.value); oppName.value=''; draw(); };
  oppName.addEventListener('keydown',e=>{ if(e.key==='Enter') addOpp(); });
  const rowText=(c,i)=>`${i?'':'TOP — '}${c.opp?"Opponent's ":''}${c.name}${c.xValue!==undefined?` (X = ${c.xValue})`:''}${c.modeTexts?` (${c.modeTexts.map(t=>{t=c.xValue!==undefined?t.replace(/\bX\b/g,String(c.xValue)):t;return t.length>48?t.slice(0,45)+'…':t}).join('; ')})`:''}${targetsText(c)?` — target: ${targetsText(c)}`:''}`;
  const draw=()=>{
    const top=state.stack[state.stack.length-1];
    m.body.replaceChildren(
      h('div',{class:'psub',text:state.stack.length?stackPriorityMessage():'The stack is empty. If your opponent casts something, add it below so you can respond to it, counter it, or target it.'}),
      state.stack.length?h('div',{class:'stacklist'},[...state.stack].reverse().map((c,i)=>h('div',{class:'row'},h('span',{class:'nm'},rowText(c,i)),h('span',{class:'muted small'},c.opp?'Cast by your opponent':c.ability?(c.trigger?'Triggered ability':'Activated ability'):(isInstantSpeed(c)?'Instant speed':'Normal speed'))))):null,
      h('div',{class:'fhead',text:'Your opponent'}),
      h('div',{class:'setrow'},oppName,oppType,h('button',{text:'Opponent casts it',onclick:addOpp})),
      h('div',{class:'fhead',text:'Your priority — instant-speed cards in hand'}),
      state.hand.filter(isInstantSpeed).length ? h('div',{class:'prelist'},state.hand.filter(isInstantSpeed).map(c=>h('div',{class:'row'},h('span',{class:'nm'},c.name),h('button',{class:'primary',text:'Cast',onclick:()=>{castSpell(c.id,false);draw();}})))) : h('div',{class:'muted small',text:'No instant-speed cards currently in hand.'}),
      h('div',{class:'pbtns',style:'margin-top:12px'},h('button',{text:'View top 10 of library',onclick:()=>openLibraryManipulation()}))
    );
    m.foot.replaceChildren(...(state.stack.length?[
      h('button',{text:'Pass priority',onclick:()=>{m.close();passPriority();}}),
      h('button',{class:'danger',text:'Countered',title:`${top.opp?"Opponent's ":''}${top.name} is countered: it is removed from the stack without resolving`,onclick:()=>{counterTopOfStack();if(state.stack.length)draw();else m.close();}}),
      h('button',{class:'primary',text:`Resolve ${top.opp?"opponent's ":''}${top.name}`,onclick:()=>{resolveTopOfStack();if(state.stack.length)draw();else m.close();}})
    ]:[h('button',{text:'Close',onclick:()=>m.close()})]));
  }; draw();
}
function openLibraryManipulation() {
  if(!state)return;
  const n=Math.min(10,state.library.length), order=state.library.slice(0,n);
  const m=modal(`Library — top ${n}`,{width:720,sticky:true});
  const draw=()=>{
    m.body.replaceChildren(h('div',{class:'psub',text:'Inspect and reorder the top of your library. This is useful for Brainstorm, Ponder and similar effects.'}),
      ...order.map((c,i)=>{ const row=h('div',{class:'row'},h('span',{class:'nm'},`${i+1}. ${c.name}`),
        h('button',{text:'Hand',onclick:()=>{snap();const j=state.library.findIndex(x=>x.id===c.id);if(j>=0){state.hand.push(state.library.splice(j,1)[0]);log(`${c.name}: library → hand`);m.close();render();}}}),
        h('button',{text:'Exile',onclick:()=>{snap();const j=state.library.findIndex(x=>x.id===c.id);if(j>=0){state.exile.push(state.library.splice(j,1)[0]);log(`${c.name}: library → exile`);m.close();render();}}}),
        h('button',{text:'↑',disabled:i===0,onclick:()=>{[order[i-1],order[i]]=[order[i],order[i-1]];draw();}}),
        h('button',{text:'↓',disabled:i===order.length-1,onclick:()=>{[order[i+1],order[i]]=[order[i],order[i+1]];draw();}})
      ); if(teach('libraryPreview')){row.addEventListener('mouseenter',()=>{showPreview(c); row.classList.add('library-hover');}); row.addEventListener('mouseleave',()=>row.classList.remove('library-hover'));} return row;
      }));
  };
  draw();
  m.foot.append(h('button',{text:'Cancel',onclick:()=>m.close()}),h('button',{class:'primary',text:'Apply order',onclick:()=>{snap();const ids=new Set(order.map(c=>c.id));state.library=order.concat(state.library.filter(c=>!ids.has(c.id)));log(`Reordered top ${order.length} cards`);m.close();render();}}));
}
// ---------------------------------------------------------------- rendering
function colorClass(c) {
  if (c.token) return 'art';
  const info = cardInfo(c.name);
  if (!info) return BASIC_LANDS.has(norm(c.name)) ? 'land' : 'art';
  if (info.land) return 'land';
  const cols = effColors(c);
  if (cols.length > 1) return 'multi';
  if (cols.length === 1) return cols[0];
  return 'art';
}

const BASIC_PRODUCES = {
  'plains':['W'], 'island':['U'], 'swamp':['B'], 'mountain':['R'], 'forest':['G'], 'wastes':['C', '1'],
  'snow-covered plains':['W'], 'snow-covered island':['U'], 'snow-covered swamp':['B'], 'snow-covered mountain':['R'], 'snow-covered forest':['G']
};
// ---------------------------------------------------------------- land abilities (v0.62)
// Lands are read from their rules text: how much mana a {T} ability makes ({C}{C} lands), "Spend this mana only..." limits,
// damage / life paid for the mana, the Urza's tron bonus, and enters-with-counters (Dark Depths).
let PAY_CTX = null;   // the spell being paid for (null = none): decides whether restricted mana may be used
function withCtx(card, fn) { const old = PAY_CTX; PAY_CTX = card; try { return fn(); } finally { PAY_CTX = old; } }
const LAND_AB_CACHE = new Map();
function landManaAbilities(c) {
  if (!c || c.token || !isLandName(c.name)) return [];
  const i = cardInfo(c.name), tx = sagaStrip(((i && i.tx) || '') + (c.gained && c.gained.length ? '\n' + c.gained.join('\n') : '')); if (!tx) return [];
  const key = norm(c.name) + '|' + tx.length + '|' + tx.slice(-40);
  if (LAND_AB_CACHE.has(key)) return LAND_AB_CACHE.get(key);
  const nm = c.name.split(' // ')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const t = tx.replace(/\([^)]*\)/g, ' ').replace(new RegExp(nm, 'gi'), '~');
  const out = []; let becomes = 0, bm;
  if ((bm = t.match(/Whenever ~ becomes tapped, it deals (\d+) damage to you/i))) becomes = +bm[1];
  for (const line of t.split('\n')) {
    const m = line.trim().replace(/^[A-Z][A-Za-z' ]+ \u2014 /, '').match(/^\{T\}(?:, Pay (\d+) life)?: (Add .*)$/i); if (!m) continue;
    const sents = m[2].split(/(?<=\.)\s+/), ab = { fixed: null, choice: null, any: false, only: '', dmg: becomes, life: +m[1] || 0, alt: null };
    const first = sents[0].replace(/\.$/, ''); let mm;
    if ((mm = first.match(/^Add (\{[WUBRGC]\}) for each (.+?)(?: you control| on the battlefield)?$/i))) ab.per = { col: mm[1][1], what: mm[2], ctrl: / you control$/i.test(first) };
    else if ((mm = first.match(/^Add ((?:\{[WUBRGC]\})+)$/i))) ab.fixed = [...mm[1].matchAll(/\{([WUBRGC])\}/g)].map(x => x[1]);
    else if ((mm = first.match(/^Add (\{[WUBRGC]\}(?:,? (?:or )?\{[WUBRGC]\})+)$/i))) ab.choice = [...mm[1].matchAll(/\{([WUBRGC])\}/g)].map(x => x[1]);
    else if (/^Add one mana of any color$/i.test(first)) ab.any = true;
    else continue;
    for (const sn of sents.slice(1)) { let q;
      if ((q = sn.match(/^Spend this mana only (?:to|on) (.*?)\.?$/i))) ab.only = c.chosen ? q[1].replace(/the chosen type/i, 'the ' + c.chosen.toLowerCase() + ' type') : q[1];
      else if ((q = sn.match(/^~ deals (\d+) damage to you\.?$/i))) ab.dmg += +q[1];
      else if ((q = sn.match(/^If you control (.+?), add ((?:\{[WUBRGC]\})+) instead\.?$/i))) ab.alt = { need: q[1].split(/,? and /).map(x => x.replace(/^(?:an?|the) /i, '').trim()), fixed: [...q[2].matchAll(/\{([WUBRGC])\}/g)].map(x => x[1]) }; }
    out.push(ab);
  }
  LAND_AB_CACHE.set(key, out); return out;
}
// Does a "Spend this mana only to ..." limit allow paying for ctx (the spell or ability source)? Unknown limits are allowed.
function spendOnlyOk(only, ctx) {
  if (!only) return true; if (!ctx) return false;
  const i = ctx.token ? null : cardInfo(ctx.name), t = (i && i.t) || '', lo = only.toLowerCase();
  { const ct = lo.match(/creature spell of the ([a-z' -]+?) type/); if (ct && ct[1] !== 'chosen') return /\bCreature\b/.test(t) && (new RegExp('\\b' + ct[1].replace(/[^a-z ]/g, '') + '\\b', 'i').test(t) || /\bChangeling\b/i.test((i && i.tx) || '')); }
  if (/colorless eldrazi/.test(lo)) return !!i && !(i.col && i.col.length) && /\bEldrazi\b/.test(t);
  if (/\bartifact (?:spells|abilities)?/.test(lo) && /artifact/.test(lo)) return /\bArtifact\b/.test(t);
  if (/\bcreature spells?\b/.test(lo)) return /\bCreature\b/.test(t);
  return true;
}
function abFixed(ab) { if (ab.per) return Array(Math.max(1, countPermsOf(ab.per.what))).fill(ab.per.col); if (ab.alt && state && ab.alt.need.every(n => state.battlefield.some(x => norm(x.name) === norm(n)))) return ab.alt.fixed; return ab.fixed; }
// The most productive fixed multi-mana ability of a land that may be used for ctx, or null (a normal one-mana land).
function landMulti(c, anyCtx) {
  let best = null;
  for (const ab of landManaAbilities(c)) { const f = abFixed(ab); if (!f || f.length < 2) continue; if (ab.only && !anyCtx && !spendOnlyOk(ab.only, PAY_CTX)) continue; if (!best || f.length > best.fixed.length) best = { fixed: f, dmg: ab.dmg, life: ab.life, only: ab.only }; }
  return best;
}
// Damage or life you pay each time a one-ability land is tapped (Mana Confluence, City of Brass). Lands with several abilities are left alone.
function landTapCost(c) { const a = landManaAbilities(c); return a.length === 1 && (a[0].dmg || a[0].life) ? { dmg: a[0].dmg, life: a[0].life } : null; }
function applyLandCost(c, k) {
  if (!k) return;
  if (k.life) { state.life -= k.life; log(`${c.name}: paid ${k.life} life for the mana → ${state.life}`); }
  if (k.dmg) { state.life -= k.dmg; log(`${c.name}: dealt ${k.dmg} damage to you → ${state.life}`); }
}
// "enters with N <kind> counters on it" (Dark Depths: ten ice counters)
function etbCounters(c) {
  if (!c || c.token) return;
  const nm = c.name.split(' // ')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tx = cardText(c).replace(new RegExp(nm, 'gi'), '~');
  const m = tx.match(/\benters(?: the battlefield)? with (an?|one|two|three|four|five|six|seven|eight|nine|ten|\d+|X) ([a-z][a-z-]*|\+1\/\+1|[−-]1\/[−-]1) counters? on it/i);
  if (!m) return;
  const n = /^x$/i.test(m[1]) ? (+c.xValue || 0) : /^\d+$/.test(m[1]) ? +m[1] : (TOKEN_NUMW[m[1].toLowerCase()] || 1);
  if (!n) return;
  let kind = m[2].toLowerCase(); if (kind === 'loyalty') return;
  const key = kind === '+1/+1' ? 'plus' : /^[−-]1/.test(kind) ? 'minus' : kind;
  if (typeof c.counters === 'number') c.counters = { plus: c.counters, minus: 0 };
  c.counters = c.counters || { plus: 0, minus: 0 };
  const adj = adjustCounterAdd(c, key, n, false); c.counters[key] = (c.counters[key] || 0) + adj; log(`${c.name} entered with ${adj} ${kind} counter${adj === 1 ? '' : 's'}`);
}
// State-triggered "When ~ has no <kind> counters on it, ..." (Dark Depths): queued once each time the last counter goes away.
function checkNoCounterTriggers() {
  if (!state) return;
  for (const c of state.battlefield) {
    if (c.token) continue; const tx = cardText(c); if (!tx || !/has no [a-z+\/-]+ counters on it/i.test(tx)) continue;
    const nm = c.name.split(' // ')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), t = tx.replace(new RegExp(nm, 'gi'), '~');
    const m = t.match(/^(When(?:ever)? ~ has no ([a-z+\/-]+) counters on it),\s*(.*)$/im); if (!m) continue;
    const key = m[2].toLowerCase() === '+1/+1' ? 'plus' : m[2].toLowerCase(), cc = typeof c.counters === 'number' ? { plus: c.counters } : (c.counters || {});
    if ((cc[key] || 0) > 0) { c._noCtr = false; continue; }
    if (c._noCtr || c.enteredTurn === undefined) continue;
    c._noCtr = true;
    state.pendingTriggers.push({ kind: 'ability', cardId: c.id, cardName: c.name, text: m[0], effect: m[3], special: null, optional: /\byou may\b/i.test(m[3]), why: `${c.name} has no ${m[2]} counters on it, so this state-triggered ability triggers.` });
  }
}
// Vesuva: "You may have Vesuva enter the battlefield tapped as a copy of any land on the battlefield."
function openVesuva(id) {
  const f = findCard(id); if (!f || f.zone !== 'battlefield') return; const c = f.card;
  const lands = []; for (const x of state.battlefield) if (x.id !== c.id && isLandName(x.name) && !lands.some(l => l.name === x.name)) lands.push(x);
  const m = modal('Vesuva: copy a land?', { width: 520, sticky: true, noClose: true });
  m.body.append(h('div', { class: 'psub', text: 'You may have Vesuva enter the battlefield tapped as a copy of any land on the battlefield. As a copy it has that land’s name, types and abilities. It goes back to being Vesuva if it leaves the battlefield.' }));
  const done = () => { m.close(); render(); if (state.pendingTriggers.length) resolvePendingTrigger(); };
  for (const l of lands) m.body.append(h('div', { class: 'row' }, h('span', { class: 'nm', text: l.name }), h('button', { class: 'primary', text: 'Copy it', onclick: () => {
    snap(); c.origName = c.name; c.name = l.name; c.tapped = true; c.counters = { plus: 0, minus: 0 }; log(`Vesuva entered tapped as a copy of ${l.name}`);
    etbCounters(c); const etb = landETBTrigger(c); if (etb) queueTrigger(etb); fireTrigger('etb', { card: c }); done(); } })));
  m.foot.append(h('button', { text: 'Enter as Vesuva (no copy)', onclick: done }));
}
function manaSources() {
  const out=[];
  if(!state) return out;
  for(const c of state.battlefield){
    if(c.tapped || !isManaPermanent(c)) continue;
    if(!isLandName(c.name)){
      const r=rockInfo(c), st=rockStatus(c);
      if(st.ok===false) continue;               // restriction clearly not met: not offered automatically (tap it by hand to override)
      if(r.fixed) r.fixed.forEach((col,k)=>out.push({card:c, colors:new Set([col]), any:true, slot:k, of:r.fixed.length}));
      else out.push({card:c, colors:new Set(rockColors(c)), any:true, slot:0, of:1});
      continue;
    }
    // Same colour logic as tapping by hand: printed mana plus the basic land types the board gives it
    // (Leyline of the Guildpact, Dryad of the Ilysian Grove, Urborg, Blood Moon...).
    const lm=landMulti(c);
    if(lm){ lm.fixed.forEach((col,k)=>out.push({card:c, colors:new Set([col]), any:true, slot:k, of:lm.fixed.length})); continue; }
    const cols=landManaColors(c);
    if(!cols.length) continue;
    out.push({card:c, colors:new Set(cols), any:true});
  }
  return out;
}
function manaCostParts(mc){
  const out={generic:0, colors:[], flexible:[]};
  if(!mc) return out;
  const re=/\{([^}]+)\}/g; let m;
  while((m=re.exec(mc))){
    const x=m[1].toUpperCase();
    if(/^\d+$/.test(x)) out.generic+=+x;
    else if(/^[WUBRG]$/.test(x)) out.colors.push(x);
    else if(x==='C') out.colors.push('C');
    else out.flexible.push(x);
  }
  return out;
}
function canPayMana(c){ return withCtx(c,()=>canPayMana0(c)); }
function canPayMana0(c){
  const i=cardInfo(c.name); if(!i || i.land || !i.mc) return null;
  // X spells are castable when they can be paid with X = 0; the player picks X when casting.
  if(i.mc.split(' // ')[0].includes('{X}')) return maxXFor(c)>=0 ? {ok:true,reason:''} : {ok:false,reason:'amount'};
  const routes=castRoutes(c,'');
  if(routes.some(r=>r.ok)) return {ok:true,reason:''};
  return {ok:false,reason:routes[0].why,detail:routes[0].detail};
}
function handInteraction(c){
  if(!state || state.phase!=='play' || state.discarding || state.phasePause) return '';
  if(isLandName(c.name)) return canPlayLandNow() ? 'ready' : 'timing';
  if(!canCastNow(c)) return 'timing';
  const mana=canPayMana(c);
  if(mana && !mana.ok) return 'mana';
  return mana && mana.ok ? 'ready' : '';
}
// Plain-words reason a hand card is not playable right now (used for tooltips).
function handWhy(c){
  if(!state || state.phase!=='play') return '';
  if(state.discarding) return 'Choose cards to discard first';
  if(state.phasePause) return '';
  if(state.step===0 || state.step===CLEANUP) return 'No player gets priority in this step';
  if(isLandName(c.name)){
    if(canPlayLandNow()) return '';
    if(state.stack.length) return 'Lands cannot be played while something is on the stack';
    if(!isMainPhase()) return 'Lands can only be played in your main phase';
    if(landDropUsed()) return 'You already used all your land plays this turn';
    return '';
  }
  if(!canCastNow(c)) return state.stack.length ? 'Only instants and cards with flash can be cast while something is on the stack' : 'Sorcery speed: only in your main phase with an empty stack';
  const m=canPayMana(c);
  if(m && !m.ok) return m.reason==='additional' ? `You cannot pay the additional cost: ${m.detail}` : m.reason==='color' ? 'You have enough mana in total, but not the right colours' : 'Not enough mana';
  return '';
}
function handTip(c){ const i=handInteraction(c); if(!i) return ''; return i==='ready' ? ' — playable now' : ' — ' + handWhy(c); }

// Does this permanent have a non-mana activated ability (or loyalty / fetch ability) that can be activated right now?
// Mana abilities of lands and rocks are not highlighted, otherwise every land would glow.
function activationReady(c) {
  if (!state || c.token || state.phase !== 'play' || state.phasePause || state.discarding || state.step === 0 || state.step === CLEANUP) return '';
  if (isPlaneswalker(c)) { const a = pwAbilities(c).find(x => !pwBlock(c, x)); return a ? `A loyalty ability can be activated (${a.label})` : ''; }
  if (isLandName(c.name)) return (fetchInfo(c) && !c.tapped) ? 'Can be sacrificed to search for a land' : '';
  const list = activatedAbilitiesFor(c);
  const ok = list.find(ab => !abilityReady(c, ab));
  return ok ? `Ability can be activated: ${ok.cost}` : '';
}
// ---- foil (v0.54): a holographic sheen. Off / every card / about one card in five (stable per card).
function isFoil(c) {
  const m = settings.foil || 'off'; if (m === 'off' || !c || c.token) return false;
  return m === 'all' || (((c.id * 2654435761) >>> 0) % 5 === 0);
}
const foilEl = () => h('i', { class: 'foilfx' });
document.addEventListener('mousemove', e => {
  const t = e.target && e.target.closest && e.target.closest(document.body.classList.contains('hand3d') ? '.foil, #row-hand .card' : '.foil'); if (!t) return;
  const r = t.getBoundingClientRect(); if (!r.width) return;
  t.style.setProperty('--fx', Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100)).toFixed(0) + '%');
  t.style.setProperty('--fy', Math.max(0, Math.min(100, (e.clientY - r.top) / r.height * 100)).toFixed(0) + '%');
  t.style.setProperty('--rx', (((e.clientX - r.left) / r.width - 0.5) * 2).toFixed(2)); t.style.setProperty('--ry', (((e.clientY - r.top) / r.height - 0.5) * 2).toFixed(2));
});
function cardEl(c, zone) {
  const info = c.token ? null : cardInfo(c.name);
  const pw = !c.token && isPlaneswalker(c);
  const ptc = (!pw && zone === 'battlefield' && permZone(c) === 'creatures' && (c.token || info)) ? ptCalc(c) : null;
  const pt = pw ? null : ptc ? ptText(c) : (c.token ? c.tk.pt : info && info.pt);
  const e = h('div', {
    class: `card c-${colorClass(c)}${isFoil(c) ? ' foil' : ''}${pt ? ' haspt' : ''}${c.tapped ? ' tapped' : ''}${selected === c.id ? ' sel' : ''}${bottomSel.has(c.id) ? ' bsel' : ''}${zone === 'hand' && teach('playability') ? ' cast-' + handInteraction(c) : ''}${zone === 'hand' && isInstantSpeed(c) && teach('playability') ? ' instant-speed' : ''}${zone === 'battlefield' && teach('playability') && activationReady(c) ? ' cast-ready act-ready' : ''}${zone === 'battlefield' && teach('summoningSick') && isSick(c) ? ' sick' : ''}`,
    draggable: 'true', 'data-id': c.id, title: c.name + (!c.token && cardInfo(c.name) && cardInfo(c.name).mc ? '  ' + cardInfo(c.name).mc : '') + (zone === 'hand' ? handTip(c) : '') + (zone === 'battlefield' && teach('playability') && activationReady(c) ? ' — ' + activationReady(c) : '') + (zone === 'battlefield' && teach('summoningSick') && isSick(c) ? ' — ' + SICK_TEXT : '')
  },
    isFoil(c) ? foilEl() : null,
    h('div', { class: 'ctop' },
      h('span', { class: 'cname', text: c.name }),
      info && !info.land && info.mc ? (() => { const ec = zone === 'hand' || zone === 'stack' ? effectiveCost(c) : null; const red = ec && ec.reduced; return h('span', { class: 'cmc' + (red ? (ec.increased ? ' increased' : ' reduced') : ''), text: String(red ? symCmc(ec.cost) : Math.round(info.cmc)), title: red ? `Costs ${ec.cost.replace(/[{}]/g, '') || '0'} now (printed ${info.mc.replace(/[{}]/g, '')}; ${ec.why})` : '' }); })() : null),
    h('div', { class: 'ctype', text: c.token ? ((c.tk && c.tk.type) || 'Token') : info ? info.t : '' }),
    pt ? (() => { const d = ptc ? ptDelta(ptc) : ''; const prev = lastPT.get(c.id); lastPT.set(c.id, pt); const flash = prev !== undefined && prev !== pt;
      return h('div', { class: 'cpt' + (ptc && (ptc.dynamic || ptc.modified) ? ' ptmod' : '') + (d ? ' pt-' + d + ' ptshow' : '') + (flash ? ' ptflash' : ''), text: pt, 'data-len': String(String(pt).length), title: ptc ? ptTitle(c, ptc) : '' }); })() : null,
    pw && zone === 'battlefield' ? h('div', { class: 'cloyalty', text: String(c.loyalty ?? '?'), title: 'Loyalty counters. Double-click to use loyalty abilities.' }) : null,
    !c.token && isLandName(c.name) && effectiveLandTypes(c).types.length && effectiveLandTypes(c).types.join('|') !== baseLandTypesOf(c.name).types.join('|') ? h('div', { class: 'land-effect-badge', text: effectiveLandTypes(c).types.map(t => t[0]).join(' '), title: `Effective land types: ${effectiveLandTypes(c).types.join(', ')}` }) : null,
    zone === 'battlefield' ? kwIconsOnTile(c) : null,
    zone === 'battlefield' && state && teach('durationHints') && fxOn(c).length ? h('div', { class: 'fxbadge', title: fxOn(c).map(e => `${e.kind === 'pt' ? sgnN(e.p) + '/' + sgnN(e.t) : e.kind === 'kw' ? e.kw : e.text} ${UNTIL_WORDS[e.until] || ''}`).join('\n'), text: '\u23F3' }) : null,
    !c.token && usesDelirium(c) && state ? (() => { const n = deliriumCount(); return h('div', { class: 'delirium-badge' + (n >= 4 ? ' on' : ''), text: `\u0394 ${Math.min(n, 4)}/4`, title: `Delirium: ${n} card type${n === 1 ? '' : 's'} among cards in your graveyard (${n >= 4 ? 'active' : 'needs four'})` }); })() : null,
    !c.token && usesDomain(c) ? h('div', { class: 'domain-badge', text: `${domainCount()}/5`, title: 'Domain: distinct basic land types among lands you control' }) : null,
    (() => { const cc=typeof c.counters==='number'?{plus:c.counters,minus:0}:(c.counters||{plus:0,minus:0}); const s=[]; if(cc.plus)s.push('+1 '+cc.plus); if(cc.minus)s.push('−1 '+cc.minus); for(const k of Object.keys(cc)) if(k!=='plus'&&k!=='minus'&&cc[k]) s.push(k+' '+cc[k]); if(c.chosen) s.push('\u201c'+c.chosen+'\u201d'); return s.length?h('div',{class:'cbadge',text:s.join(' · ')}):null; })(),
    zone === 'battlefield' && state && (c.att || attachmentsOf(c).length) ? (() => { const hst = hostOf(c), ats = attachmentsOf(c); return h('div', { class: 'attbadge', text: hst ? '\u2192 ' + hst.name : '\u2694 ' + ats.map(a => a.name).join(', '), title: hst ? `${c.name} is attached to ${hst.name}.` : `Attached to this: ${ats.map(a => a.name).join(', ')}` }); })() : null,
    c.token ? h('div', { class: 'ctoken', text: 'token' }) : null
  );
  const im = !c.token && showImages ? imgFor(c.name) : null;
  if (im) {
    e.classList.add('hasimg');
    const img = h('img', { class: 'cimg', src: im.front, draggable: 'false', alt: '' });
    img.addEventListener('error', () => { e.classList.remove('hasimg'); img.remove(); });
    e.prepend(img);
  }
  e.addEventListener('mouseenter', () => showPreview(c));
  e.addEventListener('click', ev => { ev.stopPropagation(); onCardClick(c, zone); });
  e.addEventListener('dblclick', ev => { ev.stopPropagation(); onCardDbl(c, zone); });
  e.addEventListener('contextmenu', ev => { ev.preventDefault(); ev.stopPropagation(); showCardMenu(c, zone, ev.clientX, ev.clientY); });
  e.addEventListener('dragstart', ev => { ev.dataTransfer.setData('text/plain', 'mtg:' + c.id); ev.dataTransfer.effectAllowed = 'move'; e.classList.add('dragging'); dragHand = zone === 'hand' ? c.id : null; });
  e.addEventListener('dragend', () => { e.classList.remove('dragging'); dragHand = null; clearHandMarker(); });
  return e;
}

function onCardClick(c, zone) {
  hideMenu();
  if (zone === 'hand' && ((state.phase === 'mull' && state.bottomPhase) || state.discarding)) {
    const lim = state.discarding || state.mulls;
    if (bottomSel.has(c.id)) bottomSel.delete(c.id);
    else if (bottomSel.size < lim) bottomSel.add(c.id);
    render();
    return;
  }

  // Lands now use a single click to activate their mana ability. This keeps
  // the interaction close to a real tabletop: click an untapped mana land,
  // choose a colour when necessary, and the mana is added to the floating
  // pool while the land becomes tapped. Other permanents retain selection.
  if (zone === 'battlefield' && isLandName(c.name) && !c.tapped) {
    tapForMana(c.id);
    return;
  }

  selected = selected === c.id ? null : c.id;
  render();
}

function onCardDbl(c, zone) {
  if (!state || state.phase !== 'play' || state.discarding || state.phasePause) return;
  if (zone === 'battlefield') {
    if (isPlaneswalker(c)) openLoyalty(c);
    else if (isLandName(c.name) && fetchInfo(c) && !c.tapped) openFetch(c);
    else if (isManaPermanent(c) && !c.tapped) tapForMana(c.id);
    else if (!/\bCreature\b/.test(frontType(c)) && !isLandName(c.name) && activatedAbilityFor(c)) { const L = activatedAbilitiesFor(c); const ab = L.find(x => !abilityReady(c, x)) || L[0]; activateAbility(c.id, false, ab.ix); }
    else toggleTap(c.id);
  }
  else if (zone === 'hand') {
    if (isLandName(c.name)) playLand(c.id);
    else if (isSpellCard(c) || isInstantSpeed(c)) castSpell(c.id);
    else if (canPlaySorcerySpeedNow()) moveCard(c.id, 'battlefield');
    else toast('Wrong phase', 'This card can only be played during your main phase.');
  }
}

// ---------------------------------------------------------------- keyword glossary (hover to learn)
const AMB = '(?<=^|\\n|, |has |have |gains? |with |and |or )';   // words that are only keywords in a keyword position
const KEYWORDS = [
  ['Flying', /\bflying\b/i, 'This creature can only be blocked by creatures with flying or reach.'],
  ['Reach', new RegExp(AMB + 'reach\\b', 'i'), 'This creature can block creatures with flying.'],
  ['First strike', /\bfirst strike\b/i, 'Deals combat damage before creatures without first strike. If it kills the blocker or attacker first, it takes no damage back.'],
  ['Double strike', /\bdouble strike\b/i, 'Deals combat damage twice: once in the first-strike step and once in the regular step.'],
  ['Deathtouch', /\bdeathtouch\b/i, 'Any amount of damage this deals to a creature is enough to destroy it.'],
  ['Lifelink', /\blifelink\b/i, 'Damage dealt by this creature also gains you that much life.'],
  ['Haste', /\bhaste\b/i, 'This creature can attack and use {T} abilities the turn it comes under your control (it ignores summoning sickness).'],
  ['Vigilance', /\bvigilance\b/i, 'Attacking does not cause this creature to tap, so it can still block on your opponent’s turn.'],
  ['Trample', /\btrample\b/i, 'If this creature would assign more combat damage than needed to kill its blockers, it can assign the rest to the player.'],
  ['Menace', /\bmenace\b/i, 'This creature can’t be blocked except by two or more creatures.'],
  ['Defender', /\bdefender\b/i, 'This creature can’t attack.'],
  ['Hexproof', /\bhexproof\b/i, 'This can’t be the target of spells or abilities your opponents control.'],
  ['Shroud', /\bshroud\b/i, 'This can’t be the target of any spells or abilities, including your own.'],
  ['Indestructible', /\bindestructible\b/i, 'Destroy effects and lethal damage don’t destroy it. It can still be exiled, sacrificed or die to 0 toughness.'],
  ['Protection', /\bprotection from\b/i, 'Can’t be Damaged, Enchanted/Equipped, Blocked or Targeted by the stated quality (DEBT).'],
  ['Ward', new RegExp(AMB + 'ward\\b(?=\\s*[—{\\d-])', 'i'), 'Whenever this becomes the target of a spell or ability an opponent controls, counter it unless that player pays the ward cost.'],
  ['Flash', new RegExp(AMB + 'flash\\b', 'i'), 'You may cast this spell any time you could cast an instant.'],
  ['Prowess', /\bprowess\b/i, 'Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.'],
  ['Cycling', /\b\w*cycling\b/i, 'Pay the cycling cost and discard this card: draw a card (landcycling fetches a land of that type instead). Works from your hand at instant speed.'],
  ['Kicker', /\b(?:multi)?kicker\b/i, 'You may pay an additional cost as you cast this spell. If you did, it has extra or stronger effects.'],
  ['Flashback', /\bflashback\b/i, 'You may cast this card from your graveyard by paying its flashback cost. Then exile it.'],
  ['Escape', /\bescape\b(?=\s*[—{])/i, 'You may cast this from your graveyard by paying its escape cost, including exiling other cards from your graveyard.'],
  ['Delve', new RegExp(AMB + 'delve\\b', 'i'), 'Each card you exile from your graveyard while casting this spell pays for {1}.'],
  ['Convoke', /\bconvoke\b/i, 'Your creatures can help cast this spell. Each creature you tap pays for {1} or one mana of that creature’s colour.'],
  ['Affinity', /\baffinity for\b/i, 'This spell costs {1} less to cast for each permanent of the stated kind you control.'],
  ['Cascade', /\bcascade\b/i, 'When you cast this spell, exile cards from the top of your library until you exile a nonland card with lesser mana value. You may cast it free. Put the rest on the bottom in random order.'],
  ['Suspend', /\bsuspend\b/i, 'Exile this card from your hand with time counters by paying its suspend cost. Remove one each upkeep; when the last is gone, cast it free (creatures gain haste).'],
  ['Storm', new RegExp(AMB + 'storm\\b', 'i'), 'When you cast this spell, copy it for each other spell cast before it this turn.'],
  ['Equip', new RegExp(AMB + 'equip\\b', 'i'), 'Pay the equip cost to attach this to a creature you control. Only at sorcery speed.'],
  ['Crew', /\bcrew \d/i, 'Tap any number of creatures with total power equal to or greater than the crew number: this Vehicle becomes an artifact creature until end of turn.'],
  ['Persist', /\bpersist\b/i, 'When this creature dies, if it had no -1/-1 counters on it, return it to the battlefield with a -1/-1 counter.'],
  ['Undying', /\bundying\b/i, 'When this creature dies, if it had no +1/+1 counters on it, return it to the battlefield with a +1/+1 counter.'],
  ['Evoke', /\bevoke\b/i, 'You may cast this for its evoke cost. If you do, it’s sacrificed when it enters the battlefield.'],
  ['Madness', /\bmadness\b/i, 'If you discard this card, you may cast it for its madness cost instead of putting it into your graveyard.'],
  ['Dash', /\bdash\b(?=\s*[{—])/i, 'You may cast this for its dash cost. It gains haste and returns to your hand at end of turn.'],
  ['Ninjutsu', /\bninjutsu\b/i, 'Pay the cost and return an unblocked attacker you control to hand: put this onto the battlefield tapped and attacking.'],
  ['Toxic', /\btoxic \d/i, 'Whenever this creature deals combat damage to a player, that player gets that many poison counters.'],
  ['Infect', /\binfect\b/i, 'Deals damage to creatures as -1/-1 counters and to players as poison counters.'],
  ['Changeling', /\bchangeling\b/i, 'This card is every creature type at all times.'],
  ['Scry', /\bscry \d+/i, 'Look at the top N cards of your library. Put any number on the bottom and the rest back on top in any order.'],
  ['Surveil', /\bsurveil \d+/i, 'Look at the top N cards of your library. Put any number into your graveyard and the rest back on top in any order.'],
  ['Mill', new RegExp(AMB + 'mill\\b', 'i'), 'Put the top cards of your library into your graveyard.'],
  ['Fight', new RegExp('\\bfights?\\b', 'i'), 'Each creature deals damage equal to its power to the other.'],
  ['Proliferate', /\bproliferate\b/i, 'Choose any number of permanents and/or players with counters, then give each another counter of each kind already there.'],
  ['Domain', /\bdomain\b/i, 'Counts the basic land types (Plains, Island, Swamp, Mountain, Forest) among lands you control, from 0 to 5.'],
  ['Landfall', /\blandfall\b/i, 'Triggers whenever a land enters the battlefield under your control.'],
  ['Delirium', /\bdelirium\b/i, 'Active while there are four or more card types among cards in your graveyard.'],
  ['Threshold', /\bthreshold\b/i, 'Active while you have seven or more cards in your graveyard.'],
  ['Opening-hand ability', /\bIf this card is in your opening hand, you may begin the game with it on the battlefield\b/i, 'Leyline-style: during pre-game, before turn 1, you may put this card onto the battlefield for free.'],
  ['Enters tapped', /\benters(?: the battlefield)? tapped\b/i, 'It comes onto the battlefield tapped, so you can’t tap it for mana until it untaps in your next untap step.'],
  ['Domain cost reduction', /costs? \{\d+\} less to cast for each basic land type/i, 'This spell’s cost is reduced for each different basic land type among lands you control, so it is cheaper with more land types.']
];
function findKeywords(c) {
  if (!c || c.token || !teach('keywordTips')) return [];
  const raw = cardText(c);
  if (!raw) return [];
  const text = raw.replace(new RegExp(c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '~');
  const found = [];
  for (const [name, re, tip] of KEYWORDS) { const m = re.exec(text); if (m) found.push({ name, tip, re }); }
  return found;
}
// Text with keywords underlined; hovering shows the tooltip.
function keywordText(c, raw) {
  const kws = findKeywords(c);
  const frag = document.createDocumentFragment();
  if (!kws.length) { frag.append(symbols(raw)); return frag; }
  const spans = [];
  for (const k of kws) {
    const re = new RegExp(k.re.source, 'gi');
    let m;
    while ((m = re.exec(raw))) { if (!m[0]) { re.lastIndex++; continue; } spans.push({ s: m.index, e: m.index + m[0].length, k }); }
  }
  spans.sort((a, b) => a.s - b.s || b.e - a.e);
  let pos = 0;
  for (const sp of spans) {
    if (sp.s < pos) continue;
    if (sp.s > pos) frag.append(symbols(raw.slice(pos, sp.s)));
    frag.append(h('span', { class: 'kw', 'data-kw': sp.k.name, 'data-tip': sp.k.tip }, raw.slice(sp.s, sp.e)));
    pos = sp.e;
  }
  if (pos < raw.length) frag.append(symbols(raw.slice(pos)));
  return frag;
}

// ---- small keyword icons (v0.48): drawn as inline SVG so they cost almost no space on a card
const KW_ICON = {
  'flying': '<path d="M12 14C9 8 5 6 2 7c2 3 3 5 5 6-2 0-3 1-4 3 4 0 7-1 9-2zM12 14c3-6 7-8 10-7-2 3-3 5-5 6 2 0 3 1 4 3-4 0-7-1-9-2z" fill="currentColor" stroke="none"/>',
  'first strike': '<path d="M5 19 19 5M14 5h5v5M7 14l3 3M4 20l3-3"/>',
  'double strike': '<path d="M4 4l11 11M20 4 9 15M13 17l3 3M11 17l-3 3"/>',
  'deathtouch': '<path d="M12 3a7 7 0 0 0-7 7c0 2.5 1.2 4 3 5v3h8v-3c1.8-1 3-2.5 3-5a7 7 0 0 0-7-7z"/><circle cx="9.5" cy="11" r="1.5" fill="currentColor"/><circle cx="14.5" cy="11" r="1.5" fill="currentColor"/>',
  'haste': '<path d="M13 2 5 14h6l-1 8 8-12h-6z" fill="currentColor"/>',
  'hexproof': '<path d="M12 2 6.5 17h11z" fill="currentColor" fill-opacity=".35"/><path d="M3 19.5c3.5 2 14.500 2 18 0M9.500 11l5 .5"/><circle cx="12" cy="8" r="1" fill="currentColor"/>',
  'indestructible': '<path d="M12 3l8 3v6c0 5-3.500 8-8 9-4.500-1-8-4-8-9V6z"/>',
  'lifelink': '<path d="M12 21s-8-5-8-11a4.500 4.500 0 0 1 8-2.500A4.500 4.500 0 0 1 20 10c0 6-8 11-8 11z" fill="currentColor" fill-opacity=".4"/>',
  'menace': '<circle cx="8" cy="7.500" r="2.500"/><circle cx="16" cy="7.500" r="2.500"/><path d="M3.500 20c0-4 2-6 4.500-6s4.500 2 4.500 6M11.500 20c0-4 2-6 4.500-6s4.500 2 4.500 6"/>',
  'reach': '<path d="M12 21V4M6 10l6-6 6 6"/>',
  'trample': '<ellipse cx="12" cy="16" rx="5" ry="4.500" fill="currentColor" fill-opacity=".4"/><circle cx="6" cy="9" r="1.700"/><circle cx="10" cy="6" r="1.700"/><circle cx="14.500" cy="6" r="1.700"/><circle cx="18.500" cy="9" r="1.700"/>',
  'vigilance': '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3" fill="currentColor"/>',
  'defender': '<path d="M3 6h18v12H3zM3 12h18M9 6v6M15 12v6"/>'
};
function kwIconEl(kw, extra) {
  const k = String(kw).toLowerCase(), body = KW_ICON[k]; if (!body) return null;
  const e = h('span', { class: 'kwi' + (extra ? ' ' + extra : ''), 'data-kwi': k });
  e.innerHTML = `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  return e;
}
function kwIconsOnTile(c) {
  if (!teach('keywordIcons') || !state || c.token || permZone(c) !== 'creatures') return null;
  const g = grantedKeywords(c).filter(x => KW_ICON[x.kw]); if (!g.length) return null;
  return h('div', { class: 'kwicons' }, ...g.map(x => { const i = kwIconEl(x.kw); i.title = `${x.kw[0].toUpperCase() + x.kw.slice(1)} (from ${x.from})`; return i; }));
}
function activeKeywordsRow(c) {
  if (!teach('keywordIcons') || !state || !c || c.token || !onBattlefield(c) || permZone(c) !== 'creatures') return null;
  const act = GRANTABLE.filter(k => hasKw(c, k)); if (!act.length) return null;
  const granted = new Map(grantedKeywords(c).map(x => [x.kw, x.from]));
  return h('div', { class: 'kwrow kwactive' }, h('span', { class: 'kwlabel', text: 'Active now' }),
    ...act.map(k => h('span', { class: 'kwchip on', 'data-kw': k, 'data-tip': granted.has(k) ? `Granted by ${granted.get(k)}` : 'Printed on the card' }, ...[kwIconEl(k), k[0].toUpperCase() + k.slice(1) + (granted.has(k) ? ' *' : '')].filter(Boolean))));
}
function keywordChips(c) {
  const kws = findKeywords(c);
  if (!kws.length) return null;
  return h('div', { class: 'kwrow' }, h('span', { class: 'kwlabel', text: 'Keywords' }),
    ...kws.map(k => { const kn = k.name.toLowerCase(), live = state && onBattlefield(c) && GRANTABLE.includes(kn); const on = live && hasKw(c, kn);
      return h('span', { class: 'kwchip' + (live ? (on ? ' on' : ' off') : ''), 'data-kw': k.name, 'data-tip': k.tip + (live ? (on ? ' (active on this creature right now)' : ' (not active right now)') : ''), text: '' }, ...[kwIconEl(kn), (live && on ? '\u2713 ' : '') + k.name].filter(Boolean)); }));
}
function setupKeywordTips() {
  const tip = h('div', { id: 'kwTip', hidden: true });
  document.body.append(tip);
  const hide = () => { tip.hidden = true; };
  document.addEventListener('mouseover', e => {
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (!t) return hide();
    tip.replaceChildren(h('div', { class: 'kwname', text: t.dataset.kw || '' }), h('div', { text: t.dataset.tip }));
    tip.hidden = false;
    const r = t.getBoundingClientRect(), w = tip.offsetWidth, hh = tip.offsetHeight;
    let x = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2));
    let y = r.top - hh - 8; if (y < 8) y = r.bottom + 8;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  });
  document.addEventListener('scroll', hide, true);
}

function sickNote(c) { return state && teach('summoningSick') && state.battlefield.some(x => x.id === c.id) && isSick(c) ? h('div', { class: 'sicknote', text: SICK_TEXT }) : null; }
function showPreview(c) {
  const box = $('#preview');
  const im = !c.token && showImages ? imgFor(c.name) : null;
  if (im) {
    let side = 0;
    const img = h('img', { class: 'pimg', src: im.front, alt: c.name });
    if (im.back) img.title = 'Click to flip';
    img.addEventListener('click', () => { if (im.back) { side ^= 1; img.src = side ? im.back : im.front; } });
    img.addEventListener('error', () => showPreviewText(c));
    const ec = effectiveCost(c);
    const pr = state && !c.token && onBattlefield(c) && permZone(c) === 'creatures' ? ptCalc(c) : null;
    const wrap = h('div', { class: 'pwrap' + (isFoil(c) ? ' foil' : '') }, img, isFoil(c) ? foilEl() : null, pr && ptDelta(pr) ? ptOverlay(c, pr) : null);
    box.replaceChildren(...[wrap, sickNote(c), staticNote(c), activeKeywordsRow(c), keywordChips(c), ec.reduced ? h('div', { class: 'costnote' }, 'Costs now ', ec.cost ? symbols(ec.cost) : '0', ` (${ec.why})`) : null, im.back ? h('div', { class: 'muted small', text: 'Click the card to flip it.' }) : null].filter(Boolean));
    return;
  }
  showPreviewText(c);
}

function showPreviewText(c) {
  const box = $('#preview');
  const info = c.token ? null : cardInfo(c.name);
  box.replaceChildren(...[
    h('div', { class: 'pname' }, c.name, ' ', info && info.mc ? symbols(info.mc) : ''),
    sickNote(c),
    staticNote(c),
    (() => { const ec = c.token ? null : effectiveCost(c); return ec && ec.reduced ? h('div', { class: 'costnote' }, 'Costs now ', ec.cost ? symbols(ec.cost) : '0', ` (${ec.why})`) : null; })(),
    h('div', { class: 'ptype', text: c.token ? 'Token' : info ? info.t : '(no card data)' }),
    info && info.tx ? h('div', { class: 'ptext' }, keywordText(c, info.tx)) : null,
    activeKeywordsRow(c),
    keywordChips(c),
    (c.token ? c.tk.pt : info && info.pt) ? h('div', { class: 'ppt', text: state && state.battlefield.some(x => x.id === c.id) && permZone(c) === 'creatures' ? ptText(c) : (c.token ? c.tk.pt : info.pt) }) : null
  ].filter(Boolean));
}

function permZone(c) {
  if (c.token) return c.tk && c.tk.pt ? 'creatures' : 'noncreature';
  const info = cardInfo(c.name);
  if (isLandName(c.name)) return 'lands';
  if (!info) return 'creatures';
  const front = info.t.split(' // ')[0];
  return /\bCreature\b/.test(front) ? 'creatures' : 'noncreature';
}

function renderPileTop(zone) {
  const el = $('#top-' + zone);
  const arr = state ? state[zone] : [];
  el.className = 'stacktop' + (arr.length ? '' : ' empty');
  el.replaceChildren();
  if (!arr.length) return;
  const c = arr[arr.length - 1];
  if (zone === 'graveyard' && layoutOn('gyFan')) {
    arr.slice(-3, -1).forEach((b, i, a) => { const k = a.length - i;   // k = 2 (deepest) or 1
      const bi = !b.token && showImages ? imgFor(b.name) : null;
      el.append(h('div', { class: 'fanbehind fb' + k }, bi ? h('img', { src: bi.front, alt: b.name, draggable: 'false' }) : h('div', { class: 'mini' }, h('b', { text: b.name })))); });
  }
  const im = !c.token && showImages ? imgFor(c.name) : null;
  if (im) {
    const img = h('img', { src: im.front, alt: c.name, draggable: 'false' });
    img.addEventListener('error', () => img.replaceWith(h('div', { class: 'mini' }, h('b', { text: c.name }))));
    el.append(img);
  } else el.append(h('div', { class: 'mini' }, h('b', { text: c.name }), h('span', { class: 'muted', text: c.token ? 'Token' : (cardInfo(c.name) || {}).t || '' })));
}

function renderZoneHover(zone) {
  const el = $('#hover-' + zone);
  if (!el) return;
  const arr = state ? state[zone] : [];
  el.replaceChildren();
  if (!arr.length) {
    el.append(h('div', { class: 'zh-title', text: zone === 'graveyard' ? 'Graveyard' : 'Exile' }),
      h('div', { class: 'muted small', text: 'Empty' }));
    return;
  }
  el.append(h('div', { class: 'zh-title', text: `${zone === 'graveyard' ? 'Graveyard' : 'Exile'} · ${arr.length}` }));
  const list = arr.slice().reverse();
  for (const c of list) el.append(h('div', { class: 'zh-card', title: c.name, text: c.name }));
}

function cardTypesInGraveyard() {
  const counts = new Map();
  if (!state) return counts;
  for (const c of state.graveyard) {
    const info = cardInfo(c.name);
    const typeLine = info && info.t ? info.t : '';
    const faces = typeLine.split(' // ');
    const types = new Set();
    for (const face of faces) {
      const main = face.split('—')[0].trim();
      for (const t of ['Artifact','Battle','Creature','Enchantment','Instant','Land','Planeswalker','Sorcery','Kindred','Tribal']) {
        if (new RegExp(`\\b${t}\\b`, 'i').test(main)) types.add(t);
      }
    }
    for (const t of types) counts.set(t, (counts.get(t) || 0) + 1);
  }
  return counts;
}

function deliriumSummary() {
  const counts = cardTypesInGraveyard();
  const types = [...counts.keys()].sort((a,b) => a.localeCompare(b));
  return { total: types.length, counts, types };
}

function fitBattlefieldCards() {
  const specs = [
    { id: 'row-creatures', wrap: true },
    { id: 'row-noncreature', wrap: false },
    { id: 'row-lands', wrap: false }
  ];
  const baseW = 112 * (settings.bfs || 1);
  const baseH = 84 * (settings.bfs || 1);
  const gap = 8;
  const minScale = 0.58;

  for (const spec of specs) {
    const row = $('#' + spec.id);
    if (!row) continue;
    const zone = row.parentElement;
    const count = row.children.length;
    if (!count || !zone) {
      row.style.setProperty('--zone-scale', '1');
      continue;
    }

    const availW = Math.max(1, zone.clientWidth - 20);
    const availH = Math.max(1, zone.clientHeight - 34);
    let scale = 1;

    if (spec.wrap) {
      // Choose a sensible number of columns, then shrink enough to fit both
      // dimensions. This keeps the creature zone fixed while dense boards
      // become progressively more compact.
      const idealCols = Math.max(1, Math.ceil(Math.sqrt((count * availW * baseH) / Math.max(availH * baseW, 1))));
      const cols = Math.min(count, idealCols);
      const rows = Math.ceil(count / cols);
      scale = Math.min(
        1,
        (availW - Math.max(0, cols - 1) * gap) / (cols * baseW),
        (availH - Math.max(0, rows - 1) * gap) / (rows * baseH)
      );
    } else {
      // Lands and noncreatures are intentionally a single row: shrink the
      // cards rather than making the zone wider or adding a horizontal scroll.
      scale = Math.min(1, (availW - Math.max(0, count - 1) * gap) / (count * baseW));
    }

    scale = Math.max(minScale, scale);
    row.style.setProperty('--zone-scale', String(scale));
  }
}

function layoutHand() {
  const row = $('#row-hand'), cards = [...row.children];
  for (const c of cards) c.style.marginLeft = '';
  if (cards.length < 2) return;
  const avail = $('#handWrap').clientWidth - 30, cw = cards[0].offsetWidth;
  if (!cw) return;
  const need = cards.length * cw + (cards.length - 1) * 8;
  if (need <= avail) return;
  const step = (avail - cw) / (cards.length - 1);
  for (let i = 1; i < cards.length; i++) cards[i].style.marginLeft = (step - cw) + 'px';
}

function renderManaPool() {
  const el=$('#manaPool');
  if(!el) return;
  const p=state&&state.manaPool?state.manaPool:{};
  const chips=[];
  for(const k of ['W','U','B','R','G','C']) if((p[k]||0)>0) chips.push(h('span',{class:`mana-chip ${k}`,text:`${p[k]}${k}`,title:`${p[k]} ${k} mana`}));
  el.replaceChildren(...(chips.length?chips:[h('span',{class:'mana-empty',text:'—'})]));
}

function render() {
  if (state && state.sagaWait && state.sagaWait.length) setTimeout(() => { try { sagaCheck(); } catch (e) { console.error(e); } }, 0);
  animCapture();
  runToughnessSBA();
  document.body.classList.toggle('imgmode', showImages && IMG.size > 0);
  document.body.classList.toggle('hand3d', animOn('hand3d')); document.body.classList.toggle('bffloat', animOn('bfFloat'));
  document.body.classList.toggle('blocked', isBlocked());
  renderTop();
  const has = !!state;
  $('#turnNum').textContent = has && state.turn ? state.turn : '–';
  { const fb = $('#btnFx'); if (fb) { const n = has ? (state.fx || []).length : 0; fb.hidden = !n; fb.textContent = `\u23F3 Effects ${n}`; } }
  lifeFx('you', $('#lifeNum'), has ? state.life : 20);
  lifeFx('opp', $('#oppNum'), has ? (state.oppLife ?? 20) : 20);
  $('#oppBox').title = has && state.dmgHistory && state.dmgHistory.length ? 'Combat damage dealt so far: ' + state.dmgHistory.map(d => `turn ${d.turn}: ${d.dmg}`).join(', ') : 'Goldfish opponent life. Combat damage from your attackers is subtracted automatically.';
  const cbt = $('#btnCombat'); if (cbt) cbt.hidden = !(has && state.phase === 'play' && STEPS[state.step].id === 'attack' && !state.phasePause && !state.combat.declared);
  renderManaPool();
  for (const z of ['library', 'graveyard', 'exile']) { const n = has ? state[z].length : 0; const pc = $('#pcnt-' + z); pc.textContent = n; pc.classList.toggle('zero', !n); }
  $('#cnt-sideboard').textContent = has ? state.sideboard.length : 0;
  { const tb = $('#btnTokens'); if (tb) { const n = has ? deckTokenDefs().filter(d => !d.amassOnly || true).length : 0; tb.hidden = !n; $('#cnt-tokens').textContent = n; } }
  { const n = has ? state.library.length : 0; const ls = $('#libstack'); ls.dataset.thick = n > 40 ? 3 : n > 15 ? 2 : n > 0 ? 1 : 0; ls.title = teach('libraryMenu') ? 'Click for draw, look, scry, surveil, mill, search' : ''; }
  $('#cnt-hand').textContent = has ? `(${state.hand.length})` : '';
  $('#handLegend')?.classList.toggle('hidden', !teach('playability'));
  for (const z of ['graveyard', 'exile']) { renderPileTop(z); renderZoneHover(z); }
  $('#libstack').classList.toggle('empty', !has || !state.library.length);

  const rows = { creatures: $('#row-creatures'), noncreature: $('#row-noncreature'), lands: $('#row-lands') };
  const hand = $('#row-hand');
  for (const r of Object.values(rows)) r.replaceChildren();
  hand.replaceChildren();
  const counts = { creatures: 0, noncreature: 0, lands: 0 };
  if (has) {
    const atk = new Set((state.combat && state.combat.declared && state.combat.attackers || []).map(a => a.id ?? a));
    const lane = layoutOn('combatLane') && atk.size > 0;
    const brows = battlefieldRows(state.battlefield);
    for (const z of ['creatures', 'noncreature', 'lands']) for (const g of brows[z]) {
      const open = g.key && expandedGroups.has(g.key);
      const shown = g.cards.length > 1 && !open ? [g.cards[g.cards.length - 1]] : g.cards;
      shown.forEach((c, i) => {
        counts[z]++; const e = cardEl(c, 'battlefield');
        if (g.cards.length > 1 && !open) { e.classList.add('stackgrp'); counts[z] += g.cards.length - 1; e.dataset.stack = String(g.cards.length); e.style.setProperty('--sg', String(Math.min(3, g.cards.length - 1)));
          e.append(h('button', { class: 'grpbadge', text: '×' + g.cards.length, title: `${g.cards.length} identical cards. Click to spread them out.`, onclick: ev => { ev.stopPropagation(); expandedGroups.add(g.key); render(); } })); }
        else if (g.cards.length > 1 && i === 0) e.append(h('button', { class: 'grpbadge open', text: '▾' + g.cards.length, title: 'Click to pile these cards up again.', onclick: ev => { ev.stopPropagation(); expandedGroups.delete(g.key); render(); } }));
        if (layoutOn('dimIdle') && ((z === 'lands' && c.tapped) || (z === 'creatures' && isSick(c) && !c.tapped))) e.classList.add('idle');
        if (lane && z === 'creatures' && atk.has(c.id)) { e.classList.add('attacking'); if (!rows[z].querySelector('.lanebreak')) rows[z].append(h('div', { class: 'lanebreak' })); }
        rows[z].append(e);
      });
    }
    $('#zone-creatures').classList.toggle('combat-on', lane);
    for (const c of state.hand) hand.append(cardEl(c, 'hand'));
  }
  document.body.classList.toggle('l-depth', layoutOn('zoneDepth')); document.body.classList.toggle('l-fangy', layoutOn('gyFan'));
  $('#zc-creatures').textContent = counts.creatures ? `(${counts.creatures})` : '';
  $('#zc-lands').textContent = counts.lands ? `(${counts.lands})` : '';
  fitBattlefieldCards();
  layoutHand(); applyFan();
  $('#phases')?.classList.toggle('hidden', !teach('phaseBar'));
  renderPhaseBar(); phaseFlash(); drawBoardStrip();
  renderOverlay();
  const logEl = $('#log');
  logEl.replaceChildren();
  if (has) for (const line of state.log.slice(-120)) logEl.append(h('div', { text: line }));
  logEl.scrollTop = logEl.scrollHeight;
  const ss=$('#stackSummary'); if(ss) ss.textContent=has&&state.stack.length?state.stack.map(c=>c.name).reverse().join(' → '):'Empty';
  const rb=$('#btnResolveStack'); if(rb){ rb.disabled=!has; rb.textContent=has&&state.stack.length?'Open stack':'Stack / opponent spell'; }
  animApply();
}

function renderTop() {
  const play = state && state.phase === 'play' && !state.discarding;
  $('#btnDraw').disabled = !play || !!state.phasePause;
  $('#btnUntap').disabled = !play || !!state.phasePause;
  $('#btnNext').disabled = !play || !!state.phasePause;
  $('#btnNextPhase').disabled = !play || !!state.phasePause;
  $('#btnShuffle').disabled = !state;
  $('#btnUndo').disabled = !undoStack.length;
  $('#btnToken').disabled = !state;
  if (state && state.phase === 'play') {
    const nx = state.step >= CLEANUP ? 'Next turn' : STEPS[state.step + 1].g === 'Combat' && STEPS[state.step].g !== 'Combat' ? 'Combat' : STEPS[state.step + 1].label;
    $('#btnNextPhase').textContent = 'Next: ' + nx + ' ▸';
  } else $('#btnNextPhase').textContent = 'Next phase ▸';
}

function renderPhaseBar() {
  const box = $('#phases');
  if (!box) return;
  box.replaceChildren();
  if (!state || state.phase !== 'play') return;
  const st = STEPS[state.step] || STEPS[0];
  const next = state.step < CLEANUP ? STEPS[state.step + 1] : null;
  const pct = Math.round(((state.step + 1) / STEPS.length) * 100);
  const card = h('div', { class: 'phase-current phase2' },
    h('div', { class: 'ph-box ph-now' },
      h('div', { class: 'ph-tag', text: 'Now' }),
      h('div', { class: 'ph-name', text: st.label }),
      h('div', { class: 'ph-grp', text: st.g })),
    h('div', { class: 'ph-arrow', text: '›' }),
    h('div', { class: 'ph-box ph-next' },
      h('div', { class: 'ph-tag', text: 'Next' }),
      h('div', { class: 'ph-name', text: next ? next.label : 'New turn' }),
      h('div', { class: 'ph-grp', text: next ? next.g : 'Untap' })),
    h('div', { class: 'ph-count', text: `${state.step + 1}/${STEPS.length}`, title: 'Step of the turn' }),
    h('div', { class: 'phase-tip', text: st.tip }));
  box.append(card);
}

function openCombatHelper(){
  if(!state||!['attack','block'].includes(STEPS[state.step].id))return;
  const attackStep=STEPS[state.step].id==='attack';
  const m=modal(attackStep?'Declare attackers':'Declare blockers',{width:680,sticky:true});
  if(attackStep){
    const cb=state.combat;
    if(cb.declared){
      const names=(cb.attackers||[]).map(id=>findCard(id)?.card?.name).filter(Boolean);
      m.body.append(h('div',{class:'psub',text:names.length?`Attackers this turn: ${names.join(', ')}.`:'You declared no attackers this turn.'}),h('div',{class:'muted small',text:'Attackers are declared once per combat.'}));
      m.foot.append(h('button',{class:'primary',text:'Close',onclick:()=>m.close()}));
      return;
    }
    const picks=new Set();
    const rows=h('div',{class:'prelist'});
    const creatures=state.battlefield.filter(c=>permZone(c)==='creatures');
    if(!creatures.length) rows.append(h('div',{class:'muted',text:'You control no creatures.'}));
    creatures.forEach(c=>{
      const why=attackBlock(c), vig=hasKw(c,'vigilance');
      const btn=h('button',{class:'tgl',text:'Attack',disabled:!!why,title:why});
      btn.addEventListener('click',()=>{picks.has(c.id)?picks.delete(c.id):picks.add(c.id);btn.className=picks.has(c.id)?'tgl on':'tgl';btn.textContent=picks.has(c.id)?'Attacking':'Attack';});
      const pw=powerOf(c);
      rows.append(h('div',{class:'row'+(why?' cantatk':'')},h('span',{class:'nm'},c.name+(vig?' (vigilance: does not tap)':'')),h('span',{class:'muted small',text:why?why:`power ${pw.n}${pw.star?' (*)':''}`}),btn));
    });
    m.body.append(h('div',{class:'psub'},'Choose the creatures that will attack. Creatures that are tapped, summoning sick (no haste) or have defender cannot attack. Attacking taps a creature unless it has vigilance.'),rows);
    m.foot.append(h('button',{text:'Cancel',onclick:()=>m.close()}),h('button',{class:'primary',text:'Declare attackers',onclick:()=>{
      snap();state.combat.attackers=[...picks];state.combat.declared=true;
      const atk=[...picks].map(id=>findCard(id)?.card).filter(Boolean);
      for(const c of atk){ if(!hasKw(c,'vigilance')) c.tapped=true; }
      log(atk.length?`Declared attackers: ${atk.map(c=>c.name).join(', ')}`:'Declared no attackers');
      fireTrigger('attack',{cards:atk});m.close();render();flushTriggers();}}));
  }else{
    const attackers=state.combat.attackers||[]; const assigns={...(state.combat.blockers||{})}; const rows=h('div',{class:'prelist'});
    const blockers=state.battlefield.filter(c=>permZone(c)==='creatures'&&!c.tapped);
    blockers.forEach(b=>{const sel=h('select');sel.append(h('option',{value:'',text:'No block'}));for(const aid of attackers){const ac=findCard(aid)?.card;if(ac)sel.append(h('option',{value:String(aid),text:ac.name}));}sel.value=assigns[b.id]||'';sel.addEventListener('change',()=>assigns[b.id]=sel.value?+sel.value:null);rows.append(h('div',{class:'row'},h('span',{class:'nm'},b.name),sel));});
    m.body.append(h('div',{class:'psub'},'Assign each available blocker to one attacker. This helper records assignments for teaching; it does not calculate combat damage automatically.'),rows);
    m.foot.append(h('button',{text:'Cancel',onclick:()=>m.close()}),h('button',{class:'primary',text:'Declare blockers',onclick:()=>{snap();state.combat.blockers=assigns;log('Declared blockers');m.close();render();}}));
  }
}
// Goldfish combat damage: the opponent has no blockers, so every attacker connects.
function dealCombatDamage(){
  const cb=state.combat; if(!cb||cb.dealt||!cb.attackers||!cb.attackers.length) return;
  let total=0; const parts=[]; const dealers=[];
  for(const id of cb.attackers){
    const f=findCard(id); if(!f||f.zone!=='battlefield') continue;
    const pw=powerOf(f.card), mult=hasKw(f.card,'double strike')?2:1;
    if(pw.n>0) dealers.push(f.card);
    total+=pw.n*mult; parts.push(`${f.card.name} ${pw.n*mult}${mult===2?' (double strike)':''}${pw.star?' (* power counted as 0: adjust the opponent life by hand)':''}`);
  }
  cb.dealt=true;
  // Lifelink: damage dealt by the creature also gains its controller that much life (rule 702.15).
  let lifeGain=0; const lifeParts=[];
  for(const d of dealers){ if(!hasKw(d,'lifelink')) continue; const g=powerOf(d).n*(hasKw(d,'double strike')?2:1); if(g>0){ lifeGain+=g; lifeParts.push(`${d.name} ${g}`); } }
  const before=state.oppLife; state.oppLife-=total;
  state.dmgHistory=state.dmgHistory||[]; state.dmgHistory.push({turn:state.turn,dmg:total});
  log(`Combat damage: ${parts.join(', ')||'none'} = ${total}. Opponent life ${before} → ${state.oppLife}`);
  toast(`Combat damage: ${total}`, state.oppLife<=0?`Opponent is at ${state.oppLife}: goldfish kill on turn ${state.turn}!`:`Opponent life ${before} → ${state.oppLife}`);
  if(state.oppLife<=0) log(`Goldfish kill on turn ${state.turn}`);
  if(lifeGain>0){ state.life+=lifeGain; log(`Lifelink: gained ${lifeGain} life (${lifeParts.join(', ')}) → ${state.life}`); toast(`Lifelink: +${lifeGain} life`, `You are now at ${state.life}.`); fireTrigger('lifegain',{amount:lifeGain}); }
  for(const d of dealers) fireTrigger('combatdmg',{card:d});
}
function changeOppLife(d){ if(!state) return; snap(); state.oppLife=(state.oppLife??20)+d; log(`Opponent life ${d>0?'+':''}${d} → ${state.oppLife}`); render(); }
function promptSkipAttack(){
  const n=eligibleAttackers().length;
  const m=modal('Skip attacking?',{width:460,sticky:true});
  m.body.append(h('div',{class:'psub',text:`You have ${n} creature${n===1?'':'s'} that can attack, and you have not declared attackers this turn.`}));
  m.foot.append(h('button',{text:'Skip attacking',onclick:()=>{m.close();state.combat.declared=true;jumpToStep(state.step+1);}}),h('button',{class:'primary',text:'Declare attackers',onclick:()=>{m.close();openCombatHelper();}}));
}
function renderOverlay() {
  const ov = $('#overlay');
  const show = (...kids) => { ov.hidden = false; ov.replaceChildren(h('div', { class: 'pcard' }, ...kids.filter(Boolean))); };
  if (!state) {
    const hasDecks = Object.keys(loadDecks()).length > 0;
    if (!hasDecks) show(
      h('div', { class: 'ptitle', text: 'Welcome' }),
      h('div', { class: 'psub', text: 'Get set up in three quick steps.' }),
      h('ol', null,
        h('li', {}, h('b', { text: 'Import / edit deck' }), ' – paste a decklist.'),
        h('li', {}, h('b', { text: 'Card data… ' }), '(optional) – load the Scryfall bulk file. Without it, card info is picked up from Scryfall when you are online.'),
        h('li', {}, h('b', { text: 'New game' }), ' – draw your opening hand.')),
      h('div', { class: 'pbtns' }, h('button', { class: 'primary', text: 'Import a deck', onclick: openDeckEditor })));
    else show(
      h('div', { class: 'ptitle', text: 'Ready to play' }),
      h('div', { class: 'psub', text: 'Pick a deck at the top, then start a game.' }),
      h('div', { class: 'pbtns' }, h('button', { class: 'primary', text: 'New game', onclick: startGame })));
    return;
  }
  if (state.phasePause) {
    const st=STEPS[state.step];
    show(h('div',{class:'ptitle',text:`${st.g} — ${st.label}`}),
      h('div',{class:'psub'},st.tip,h('br'),'Game paused at the beginning of this step so you can resolve triggers and decide what to cast.'),
      h('div',{class:'pbtns'},h('button',{class:'primary',text:'Continue',onclick:resumePhase}),
      (STEPS[state.step]?.id==='attack'||STEPS[state.step]?.id==='block')&&teach('combatHelper') ? h('button',{text:'Combat helper',onclick:openCombatHelper}) : null));
    return;
  }
  if (state.phase === 'pregame') {
    const candidates=state.hand.filter(c=>isLeyline(c)||/opening hand/i.test(cardText(c)));
    const serum=state.hand.find(isSerumPowder);
    const openingLine = c => {
      const ln = String(cardText(c) || '').split('\n').find(l => /opening hand/i.test(l));
      return ln ? ln.replace(new RegExp(c.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'),'this card') : 'This card has an opening-hand ability.';
    };
    show(h('div',{class:'ptitle',text:'Pre-game actions'}),
      h('div',{class:'psub',text:'Some cards can begin the game in a special way. Resolve them now, before turn one.'}),
      candidates.length
        ? h('div',{class:'prelist'},candidates.map(c=>h('div',{class:'prerow'},
            h('div',{class:'pre-info'},h('div',{class:'pre-name',text:c.name}),h('div',{class:'pre-desc',text:openingLine(c)})),
            h('button',{class:'primary',text:'Start on battlefield',onclick:()=>pregameAction(c.id,'battlefield')}))))
        : h('div',{class:'pre-none',text:'Nothing in your hand can start on the battlefield.'}),
      h('div',{class:'phint'},h('span',{class:'phint-i',text:'i'}),h('span',{text:'This pause is on purpose: opening-hand abilities happen before the first turn begins.'})),
      h('div',{class:'pbtns pre-go'},h('button',{class:'primary',text:'Continue to first turn',onclick:finishPregame})));
    return;
  }
  if (state.phase === 'mull') {
    if (!state.bottomPhase) {
      const lands = state.hand.filter(c => isLandName(c.name)).length;
      show(
        h('div', { class: 'ptitle', text: 'Opening hand' }),
        h('div', { class: 'psub' }, h('b', { text: `${state.hand.length} cards, ${lands} land${lands === 1 ? '' : 's'}` }), state.mulls ? ` · mulligan ×${state.mulls}` : '', h('br'), state.onPlay ? 'You are on the play.' : 'You are on the draw.'),
        h('div', { class: 'pbtns' },
          h('button', { class: 'primary', text: 'Keep', onclick: keepHand }),
          h('button', { text: 'Draw 1', onclick: () => pregameDraw(1) }),
          h('button', { text: 'Draw 7', onclick: () => pregameDraw(7) }),
          h('button', {
            text: state.hand.some(isSerumPowder) ? `Use Serum Powder — exile hand, draw ${state.hand.length}` : 'Serum Powder unavailable',
            disabled: !state.hand.some(isSerumPowder),
            onclick: serumPowder
          }),
          h('button', { text: state.mulls >= 6 ? 'Cannot mulligan' : `Mulligan to ${7 - state.mulls - 1}`, disabled: state.mulls >= 6, onclick: doMulligan })),
        h('div', { class: 'phint', text: state.hand.some(isSerumPowder)
          ? 'Serum Powder is checked before each mulligan decision. Exile the entire current opening hand and draw 7 new cards; if the new hand has Serum Powder, you may repeat. Mulligan normally only when you are ready to continue.'
          : 'Your hand is shown below.' }));
    } else {
      const serum = state.serumPending;
      show(
        h('div', { class: 'ptitle', text: serum ? 'Put cards on the bottom' : 'Put cards on the bottom' }),
        h('div', { class: 'psub' }, serum ? `You have mulliganed ${state.mulls} time${state.mulls === 1 ? '' : 's'}. When you finally keep a hand, you will put ${state.mulls} card${state.mulls === 1 ? '' : 's'} on the bottom. Serum Powder itself does not require bottoming cards.` : 'Click ', serum ? null : h('b', { text: String(state.mulls) }), serum ? null : ` card${state.mulls === 1 ? '' : 's'} in your hand below `, serum ? null : `(${bottomSel.size}/${state.mulls} chosen).`),
        h('div', { class: 'pbtns' }, h('button', { class: 'primary', text: serum ? 'Confirm and use Serum Powder' : 'Confirm', disabled: bottomSel.size !== state.mulls, onclick: serum ? finishSerumPowder : finishMulligan })));
    }
    return;
  }
  if (state.discarding) {
    show(
      h('div', { class: 'ptitle', text: 'Cleanup: discard' }),
      h('div', { class: 'psub' }, `You have ${state.hand.length} cards. Click `, h('b', { text: String(state.discarding) }), ` below to discard (${bottomSel.size}/${state.discarding}).`),
      h('div', { class: 'pbtns' }, h('button', { class: 'primary', text: 'Discard', disabled: bottomSel.size !== state.discarding, onclick: confirmDiscard })));
    return;
  }
  ov.hidden = true;
  ov.replaceChildren();
}

// ---------------------------------------------------------------- context menu
const menu = $('#ctxMenu');
function showMenu(x, y, items) {
  menu.replaceChildren();
  for (const it of items) {
    if (it === '-') { menu.append(h('hr')); continue; }
    menu.append(h('button', { text: it.label, onclick: () => { hideMenu(); it.fn(); } }));
  }
  menu.hidden = false;
  const w = menu.offsetWidth, hh = menu.offsetHeight;
  menu.style.left = Math.max(4, Math.min(x, window.innerWidth - w - 4)) + 'px';
  menu.style.top = Math.max(4, Math.min(y, window.innerHeight - hh - 4)) + 'px';
}
function hideMenu() { menu.hidden = true; }
document.addEventListener('click', hideMenu);
document.addEventListener('contextmenu', e => { if (!e.target.closest('.card')) hideMenu(); });
window.addEventListener('blur', hideMenu);

// Finds the first non-mana activated ability ("cost: effect") of a permanent.
const COST_WORDS = /\{[^}]+\}|\bSacrifice\b|\bDiscard\b|\bPay\b|\bExile\b|\bRemove\b|\bReturn\b|\bTap\b|\bPut\b/;
// Split an ability cost into the parts the app can pay itself and the parts you pay by hand.
function parseAbilityCost(cost, short) {
  const out = { tap: false, mana: '', selfSac: false, removeN: 0, removeKind: '', life: 0, byHand: [], comps: [] };
  for (const k of parseCostComps(cost, short)) {
    if (k.k === 'tap') out.tap = true;
    else if (k.k === 'mana') out.mana += k.mana;
    else if (k.k === 'sacSelf') out.selfSac = true;
    else if (k.k === 'removeCounter') { out.removeN = k.n; out.removeKind = k.kind; }
    else if (k.k === 'life') out.life = k.n;
    else if (k.k === 'other') out.byHand.push(k.text);
    else out.comps.push(k);
  }
  return out;
}
function activatedAbilitiesFor(c){
  const tx=cardText(c); if(!tx)return [];
  const nm=cardInfo(c.name)?.name||c.name, short=nm.split(' // ')[0];
  const res=[];
  for(const raw of tx.replace(/,\n/g,', ').split('\n')){
    const line=raw.trim();
    if(!line || /^(When|Whenever|At)\b/i.test(line) || /^[+−–-]?\d+:/.test(line) || SAGA_CH_RE.test(line)) continue;
    { const eq=line.match(/^Equip\b\s*(?:(legendary creature|[a-z]+ creature)\s+)?((?:\{[^}]+\})+|\u2014.+)$/i);   // Equip (v0.64): a sorcery-speed ability that attaches to a creature you control
      if(eq){ const cs=eq[2].replace(/^\u2014\s*/,'').replace(/\.$/,''), pc=parseAbilityCost(cs,short);
        res.push({cost:'Equip '+eq[2].replace(/^\u2014\s*/,'\u2014 '),effect:`Attach ~ to target ${eq[1]?eq[1].toLowerCase():'creature'} you control. Activate only as a sorcery.`,tap:pc.tap,selfSac:pc.selfSac,mana:pc.mana,removeN:pc.removeN,removeKind:pc.removeKind,life:pc.life,other:pc.byHand.join(', '),comps:pc.comps,ix:res.length,equip:true}); continue; } }
    const i=line.indexOf(':'); if(i<1) continue;
    const cost=line.slice(0,i).trim(), effect=line.slice(i+1).trim();
    if(!COST_WORDS.test(cost) || /^(Add\b)/i.test(effect) && /\{T\}/.test(cost) && !/Sacrifice/.test(cost)) continue;
    const pc=parseAbilityCost(cost,short);
    res.push({cost,effect,tap:pc.tap,selfSac:pc.selfSac,mana:pc.mana,removeN:pc.removeN,removeKind:pc.removeKind,life:pc.life,other:pc.byHand.join(', '),comps:pc.comps,ix:res.length});
  }
  return res;
}
function activatedAbilityFor(c){ return activatedAbilitiesFor(c)[0]||null; }
function abilityReady(c, ab) {   // can this particular ability be activated right now? returns '' or a reason string for the outline tooltip
  if (ab.tap && (c.tapped || isSick(c))) return 'tap';
  if (ab.removeN) { const cc = typeof c.counters === 'number' ? { plus: c.counters, minus: 0 } : (c.counters || {}); if ((cc[ab.removeKind] || 0) < ab.removeN) return 'counters'; }
  if (ab.life && state.life < ab.life) return 'life';
  if (ab.comps && ab.comps.length && compsFeasible(ab.comps, c.id)) return 'cost';
  const rm = ab.effect.match(/Activate (?:this ability )?only ([^.]+)\./i);
  if (rm && staticCheck(rm[1].trim(), c).ok === false) return 'restriction';
  if (ab.mana) { const plan = manaPaymentAllocation(manaCostParts(ab.mana), state.manaPool || {}, manaSources(), null); if (!plan.ok) return 'mana'; }
  return '';
}
function activateAbility(id, ack, ix, modes){ /* ack = restriction already acknowledged; ix = which ability on the card */
  const f=findCard(id); if(!f||f.zone!=='battlefield')return;
  if(isLandName(f.card.name) && fetchInfo(f.card)){ if(f.card.tapped){toast('Cannot fetch','Fetch lands have {T} in their cost, so the land must be untapped.');return;} openFetch(f.card); return; }
  { const lk=abilityLockedBy(f.card,false); if(lk){ toast("Ability can't be activated", `${lk.name} says activated abilities of sources named “${lk.chosen}” can't be activated.`); return; } }
  let ab=activatedAbilitiesFor(f.card)[ix||0]; if(!ab)return;
  { const md=parseModal(ab.effect); if(md && modes===undefined){ openModeChoice(f.card.name, md, idxs=>activateAbility(id,ack,ix,idxs), ab.mana); return; } if(md) ab={...ab, effect:modalText(md,modes)}; }
  if(!state || state.phase!=='play' || state.phasePause || state.discarding || state.step===0 || state.step===CLEANUP){ toast('Cannot activate now','You can only activate abilities when you have priority (not during untap or cleanup).'); return; }
  if(ab.tap && f.card.tapped){toast('Ability cannot be activated','This ability requires the permanent to be untapped.');return;}
  if(ab.tap && isSick(f.card) && !ack){ softWarn(`${f.card.name}: summoning sick`, 'Summoning sickness: this creature came under your control this turn, so it cannot use abilities with {T} in the cost (and it has no haste). If a card effect gave it haste, you may continue.', ()=>activateAbility(id,true,ix)); return; }
  if(ab.removeN && abilityReady(f.card,ab)==='counters'){ toast('Cannot pay the cost',`This ability needs you to remove ${ab.removeN} ${ab.removeKind==='plus'?'+1/+1':'−1/−1'} counter${ab.removeN===1?'':'s'} from ${f.card.name}, and it does not have enough.`); return; }
  if(ab.life && state.life<ab.life){ toast('Cannot pay the cost',`You cannot pay ${ab.life} life.`); return; }
  const rm=ab.effect.match(/Activate (?:this ability )?only ([^.]+)\./i), chk=rm?staticCheck(rm[1].trim(), f.card):{ok:true};
  if(chk.ok!==true && !ack){ softWarn(`${f.card.name}: restriction`, chk.why, ()=>activateAbility(id,true,ix)); return; }
  const go=(picked,manaIds,picks)=>{
    const g=findCard(id); if(!g||g.zone!=='battlefield') return;
    const targets=Array.isArray(picked)&&picked.length?picked:null, target=targets&&targets[0].kind==='player'?targets[0].id:undefined;
    snap();
    const c=g.card;
    if(manaIds) tapManaIds(manaIds);
    if(ab.tap) c.tapped=true;
    markAbilityUsed(c);
    if(picks&&picks.length) applyCostPicks(c,picks,0);
    if(ab.life){ state.life-=ab.life; log(`${c.name}: paid ${ab.life} life as a cost`); }
    if(ab.removeN){ addCounter(c.id,-ab.removeN,ab.removeKind); log(`${c.name}: removed ${ab.removeN} counter${ab.removeN===1?'':'s'} as a cost`); }
    // Costs are paid as the ability is activated, so a sacrificed permanent is already gone when the ability resolves.
    if(ab.selfSac){ log(`${c.name}: sacrificed as a cost`); leaveBattlefield(c,'graveyard'); }
    const obj={ability:true,id:state.nextId++,name:`${c.name} — ability`,sourceId:ab.selfSac?null:c.id,sourceName:c.name,cost:ab.cost,text:ab.effect,target,targets};
    state.stack.push(obj); state.priority={active:true,passed:false};
    log(`Activated ${c.name}: ${ab.cost}${targets?` (target: ${targets.map(t=>t.name).join(', ')})`:''} — ability on the stack`);
    if(ab.other) toast('Other costs',`Pay the rest of the cost yourself: ${ab.other}.`);
    render(); openStack();
  };
  const payThen=target=>{
    { const why=compsFeasible(ab.comps||[],f.card.id); if(why){ toast('Cannot pay the cost',why); return; } }
    gatherCosts({id:f.card.id,name:f.card.name,ability:true},ab.comps||[],picks=>{
      if(!ab.mana){ go(target,null,picks); return; }
      if(teach('stackGuidance')){ openManaPayment(f.card,ids=>go(target,ids,picks),ab.mana,'Pay and activate'); return; }
      const plan=manaPaymentAllocation(manaCostParts(ab.mana),state.manaPool||{},manaSources(),null);
      if(!plan.ok){ toast('Cannot pay the cost','Not enough mana.'); return; }
      state.manaPool=plan.pool; go(target,plan.used.map(i=>manaSources()[i].card.id),picks);
    });
  };
  { const specs=parseTargetSpecs(ab.effect);
    if(specs.length) chooseTargets(f.card.name,specs,picked=>payThen(picked),{srcId:f.card.id}); else payThen(null); }
}
function showCardMenu(c, zone, x, y) {
  if (!state) return;
  const items = [];
  if (zone === 'battlefield') {
    if (isManaPermanent(c) && !c.tapped && !(isLandName(c.name) && fetchInfo(c))) items.push({ label: 'Tap for mana…', fn: () => tapForMana(c.id) });
    else items.push({ label: c.tapped ? 'Untap' : 'Tap', fn: () => toggleTap(c.id) });
    if (isLandName(c.name) && !c.tapped) items.push({ label: 'Tap without floating mana', fn: () => { snap(); c.tapped=true; render(); } });
    if (permZone(c) === 'creatures') items.push({ label: isSick(c) ? 'Remove summoning sickness (it has haste / was untapped)' : 'Mark as summoning sick', fn: () => { snap(); c.sickManual = isSick(c) ? 'off' : 'on'; render(); } });
    if (permZone(c) === 'creatures') { items.push({ label: 'Until end of turn: +1/+1', fn: () => addTempPT(c.id, 1, 1) }); items.push({ label: 'Until end of turn: +2/+2', fn: () => addTempPT(c.id, 2, 2) }); items.push({ label: 'Until end of turn: \u22121/\u22121', fn: () => addTempPT(c.id, -1, -1) }); if (fxOn(c, 'pt').length) items.push({ label: 'Clear temporary power/toughness changes', fn: () => { snap(); state.fx = state.fx.filter(e => !(e.kind === 'pt' && e.targetId === c.id)); render(); } }); }
    if (isEquipmentCard(c) || isAuraCard(c)) { items.push({ label: c.att ? 'Attach to a different permanent…' : 'Attach to…', fn: () => openAttachPicker(c) }); if (c.att) items.push({ label: 'Unattach', fn: () => unattach(c.id) }); }
    items.push({ label: 'Add +1 counter', fn: () => addCounter(c.id, 1, 'plus', true) });
    items.push({ label: 'Remove +1 counter', fn: () => addCounter(c.id, -1, 'plus', true) });
    items.push({ label: 'Add −1 counter', fn: () => addCounter(c.id, 1, 'minus', true) });
    items.push({ label: 'Remove −1 counter', fn: () => addCounter(c.id, -1, 'minus', true) });
    if (isPlaneswalker(c)) { items.push({ label: 'Loyalty abilities…', fn: () => openLoyalty(c) }); items.push({ label: 'Loyalty +1 (manual)', fn: () => adjustLoyalty(c.id, 1) }); items.push({ label: 'Loyalty −1 (manual)', fn: () => adjustLoyalty(c.id, -1) }); }
    else if(isLandName(c.name) && fetchInfo(c)) { /* the Fetch… item below performs the search */ }
    else for(const ab of activatedAbilitiesFor(c)) items.push({ label: `Activate ability: ${ab.cost}`, fn: () => activateAbility(c.id, false, ab.ix) });
    items.push('-');
  }
  if (zone === 'battlefield' && fetchInfo(c)) { items.push({ label: c.tapped ? 'Fetch… (needs an untapped land)' : 'Activate: sacrifice and fetch…', fn: () => c.tapped ? toast('Cannot fetch', 'Fetch lands have {T} in their cost, so the land must be untapped.') : openFetch(c) }); items.push('-'); }
  if (zone === 'hand') {
    if (isLandName(c.name)) items.push({ label: 'Play land', fn: () => playLand(c.id) });
    else if (isSpellCard(c) || isInstantSpeed(c)) items.push({ label: 'Cast — put on stack', fn: () => castSpell(c.id) });
    else items.push({ label: 'Play to battlefield', fn: () => {
      if (!canPlaySorcerySpeedNow()) { toast('Wrong phase', 'This card can only be played during your main phase.'); return; }
      moveCard(c.id, 'battlefield');
    }});
    { const su = suspendFor(c); if (su) items.push({ label: `Suspend ${su.n} (${su.cost})`, fn: () => suspendCard(c.id) }); }
    { const cy = cyclingFor(c); if (cy) items.push({ label: `Cycle (${cy.label.replace(/^Cycling\s*(?:\u2014\s*)?/, '') || 'free'})`, fn: () => cycleCard(c.id) }); }
  }
  if (c.token) {
    items.push({ label: 'Remove token', fn: () => moveCard(c.id, 'graveyard') });
  } else {
    const labels = { hand: 'Return to hand', battlefield: 'Put onto battlefield', graveyard: 'Put in graveyard', exile: 'Exile' };
    for (const z of ['hand', 'battlefield', 'graveyard', 'exile']) {
      if (z !== zone && !(zone === 'hand' && z === 'battlefield')) items.push({ label: labels[z], fn: () => moveCard(c.id, z) });
    }
    items.push('-');
    items.push({ label: 'Top of library', fn: () => moveCard(c.id, 'library', 'top') });
    items.push({ label: 'Bottom of library', fn: () => moveCard(c.id, 'library', 'bottom') });
  }
  if (!c.token && cardInfo(c.name)) { items.push('-'); items.push({ label: 'How the app reads this card…', fn: () => openCardReading(c.name) }); }
  showMenu(x, y, items);
}

// ---------------------------------------------------------------- modals
function modal(title, opts) {
  opts = opts || {};
  const root = $('#modalRoot');
  const body = h('div', { class: 'mbody' });
  const foot = h('footer');
  // Native append() turns null into the text "null": make modal bodies skip empty children.
  for (const el of [body, foot]) { const nativeAppend = el.append.bind(el); el.append = (...kids) => nativeAppend(...kids.flat(Infinity).filter(k => k != null && k !== false)); }
  const m = h('div', { class: 'modal', style: `width:${opts.width || 560}px` },
    h('header', null, h('span', { text: title }), h('button', { text: '✕', hidden: !!opts.noClose, title: opts.onCancel ? 'Cancel and go back' : 'Close', onclick: () => { close(); if (opts.onCancel) opts.onCancel(); } })),
    body, foot);
  if (opts.noClose) m.dataset.noclose = '1';
  const back = h('div', { class: 'backdrop' }, m);
  back.addEventListener('mousedown', e => { if (e.target === back && !opts.sticky) close(); });
  root.append(back);
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    back.remove();
    if (opts.onClose) opts.onClose();
  }
  return { body, foot, close, el: m };
}

// Deck editor
function openDeckEditor() {
  const decks = loadDecks();
  const curName = currentDeckName();
  const nameIn = h('input', { type: 'text', placeholder: 'Deck name', value: curName || '' });
  const ta = h('textarea', { spellcheck: 'false', placeholder: '4 Lightning Bolt\n20 Mountain\n...\n\nSideboard\n3 Smash to Smithereens' });
  ta.value = curName && decks[curName] ? decks[curName].text : '';
  const info = h('div', { class: 'small', style: 'margin-top:8px' });
  const m = modal('Import / edit deck', { width: 640 });

  function updateInfo() {
    const d = parseDeck(ta.value);
    const unknown = cardCount ? [...new Set([...d.main, ...d.side].filter(x => !resolve(x.name)).map(x => x.name))] : [];
    info.replaceChildren(
      h('div', { text: `Main: ${sum(d.main)} cards (${d.main.length} unique) · Sideboard: ${sum(d.side)}` }),
      cardCount
        ? (unknown.length ? h('div', { class: 'bad', text: 'Not found in card data: ' + unknown.join(', ') }) : (d.main.length ? h('div', { class: 'ok', text: 'All cards found in card data.' }) : null))
        : h('div', { class: 'muted', text: 'Load card data to check names, see card text, and detect lands.' }),
      h('div', { class: 'muted', text: 'Tip: put a “Sideboard” line before your sideboard (or leave one blank line).' })
    );
  }
  ta.addEventListener('input', updateInfo);

  m.body.append(h('div', { class: 'small muted', text: 'Deck name' }), nameIn, h('div', { class: 'small muted', style: 'margin-top:8px', text: 'Decklist (MTGO, Arena or plain text)' }), ta, info);
  m.foot.append(
    h('button', { text: 'New deck', onclick: () => { nameIn.value = ''; ta.value = ''; updateInfo(); nameIn.focus(); } }),
    h('button', { text: 'Load sample', onclick: () => { ta.value = SAMPLE; if (!nameIn.value.trim()) nameIn.value = 'Green Domain Stirrings (sample)'; updateInfo(); } }),
    curName && decks[curName] ? h('button', { class: 'danger', text: 'Delete deck', onclick: () => {
      if (!confirm(`Delete "${curName}"?`)) return;
      delete decks[curName]; saveDecks(decks); lsSet('mtgpt.current', null);
      refreshDeckSelect(); m.close(); render();
    } }) : null,
    h('button', { text: 'Cancel', onclick: () => m.close() }),
    h('button', { class: 'primary', text: 'Save', onclick: () => {
      const name = nameIn.value.trim();
      if (!name) { alert('Give the deck a name.'); return; }
      const d = parseDeck(ta.value);
      if (!d.main.length) { alert('The decklist is empty.'); return; }
      const all = loadDecks();
      all[name] = Object.assign({}, all[name] || {}, { text: ta.value, updated: Date.now() });
      saveDecks(all);
      lsSet('mtgpt.current', name);
      refreshDeckSelect();
      m.close(); render();
      prepareImages();
    } })
  );
  updateInfo();
  nameIn.focus();
}

// Zone viewer (library search, graveyard, exile, sideboard)
function openZone(zone) {
  if (!state) return;
  const names = { library: 'Library', graveyard: 'Graveyard', exile: 'Exile', sideboard: 'Sideboard', hand: 'Hand' };
  const shuffleChk = h('input', { type: 'checkbox', checked: true });
  const m = modal(names[zone], {
    width: 680,
    onClose: () => {
      if (zone === 'library' && shuffleChk.checked) {
        snap(); shuffle(state.library); log('Searched library and shuffled'); render();
      }
    }
  });
  function draw() {
    m.body.replaceChildren();
    if (zone === 'graveyard') {
      const d = deliriumSummary();
      const box = h('div', { class: 'delirium-box' },
        h('div', { class: 'delirium-total' }, h('b', { text: String(d.total) }), h('span', { text: ' card types in graveyard' })),
        h('div', { class: 'delirium-types' })
      );
      const typeBox = box.querySelector('.delirium-types');
      const order = ['Creature','Artifact','Enchantment','Instant','Sorcery','Planeswalker','Land','Battle','Kindred','Tribal'];
      for (const t of order) if (d.counts.has(t)) typeBox.append(h('div', { class: 'delirium-type' }, h('span', { text: t }), h('b', { text: String(d.counts.get(t)) })));
      m.body.append(box);
    }
    let list = state[zone].slice();
    if (zone === 'library' || zone === 'sideboard') list.sort((a, b) => a.name.localeCompare(b.name));
    else list.reverse();
    if (!list.length) m.body.append(h('div', { class: 'muted', text: 'Empty.' }));
    for (const c of list) {
      const info = cardInfo(c.name);
      const row = h('div', { class: 'row' },
        h('span', { class: 'nm' }, c.name, ' ', info && info.mc ? symbols(info.mc) : ''),
        h('span', { class: 'muted small', text: info ? info.t.split(' // ')[0] : '' }),
        c.timeCounters > 0 ? h('span', { class: 'ok', title: 'Suspended: one time counter is removed at each of your upkeeps', text: `\u23F3 ${c.timeCounters} time counter${c.timeCounters === 1 ? '' : 's'}` }) : null
      );
      const act = (label, to, pos) => h('button', { text: label, onclick: () => {
        moveCard(c.id, to, pos);
        if (to === 'hand') { /* keep window open for multi-pick */ }
        draw();
      } });
      if(teach('libraryPreview')) row.addEventListener('mouseenter', () => showPreview(c));
      if (zone !== 'hand') row.append(act('Hand', 'hand'));
      row.append(act('Play', 'battlefield'));
      if (zone !== 'library') { row.append(act('Top', 'library', 'top')); row.append(act('Bottom', 'library', 'bottom')); }
      else row.append(act('Top', 'library', 'top'));
      if (zone !== 'graveyard') row.append(act('GY', 'graveyard'));
      if (zone !== 'exile') row.append(act('Exile', 'exile'));
      m.body.append(row);
    }
  }
  draw();
  if (zone === 'library') m.foot.append(h('label', { class: 'chk' }, shuffleChk, ' Shuffle when closed'));
  m.foot.append(h('button', { class: 'primary', text: 'Close', onclick: () => m.close() }));
}

function openScry(n, surveil=false, srcText='', onDone=null) {
  if(!state)return;
  const want=n; n=Math.max(1,Math.min(n,state.library.length)); if(!state.library.length){ log(`${surveil?'Surveil':'Scry'} ${want}: library is empty`); toast(`${surveil?'Surveil':'Scry'} ${want}`,'Your library is empty, so there is nothing to look at.'); if(onDone) onDone(); return; }
  const top=state.library.slice(0,n);
  const word=surveil?'Surveil':'Scry', outName=surveil?'graveyard':'bottom of library';
  // two ordered lists of indexes into `top`: cards that stay on top (first = top card) and cards that leave
  let keep=top.map((_,i)=>i), out=[];
  const m=modal(`${word} ${want}`,{width:600,sticky:true,noClose:true});
  const move=(list,i,d)=>{ const k=list.indexOf(i), t=k+d; if(t<0||t>=list.length)return; [list[k],list[t]]=[list[t],list[k]]; draw(); };
  const send=(i,toOut)=>{ const from=toOut?keep:out, to=toOut?out:keep; from.splice(from.indexOf(i),1); to.push(i); draw(); };
  const cardRow=(i,list,isKeep,pos)=>{
    const c=top[i], info=cardInfo(c.name);
    const row=h('div',{class:'row sv-row'},
      h('span',{class:'sv-pos',text:isKeep?(pos===0?'TOP':String(pos+1)):'—'}),
      h('span',{class:'nm'},c.name,' ',info&&info.mc?symbols(info.mc):''),
      list.length>1?h('button',{class:'sv-mv',text:'↑',title:'Move up',disabled:pos===0,onclick:()=>move(list,i,-1)}):null,
      list.length>1?h('button',{class:'sv-mv',text:'↓',title:'Move down',disabled:pos===list.length-1,onclick:()=>move(list,i,1)}):null,
      h('button',{class:isKeep?'':'primary',text:isKeep?(surveil?'Put in graveyard':'Put on bottom'):'Keep on top',onclick:()=>send(i,isKeep)}));
    row.addEventListener('mouseenter',()=>showPreview(c)); return row;
  };
  function draw(){
    m.body.replaceChildren();
    if(srcText) m.body.append(h('div',{class:'sv-src',text:srcText}));
    m.body.append(h('div',{class:'psub sv-rule',text:surveil
      ? `Look at the top ${n===1?'card':n+' cards'} of your library. Put any number of them into your graveyard and the rest back on top in any order.`
      : `Look at the top ${n===1?'card':n+' cards'} of your library. Put any number of them on the bottom and the rest back on top in any order.`}));
    if(n<want) m.body.append(h('div',{class:'muted small',text:`Your library only has ${n} card${n===1?'':'s'}, so you look at all of them.`}));
    m.body.append(h('div',{class:'sv-head'},h('b',{text:keep.length?`Stay on top (${keep.length})`:'Stay on top'}),h('span',{class:'muted small',text:keep.length>1?' — first in the list is drawn first':''})));
    if(keep.length) keep.forEach((i,p)=>m.body.append(cardRow(i,keep,true,p))); else m.body.append(h('div',{class:'muted small sv-empty',text:'Nothing — every card is leaving.'}));
    m.body.append(h('div',{class:'sv-head'},h('b',{text:out.length?`Going to the ${outName} (${out.length})`:`Going to the ${outName}`})));
    if(out.length) out.forEach((i,p)=>m.body.append(cardRow(i,out,false,p))); else m.body.append(h('div',{class:'muted small sv-empty',text:'Nothing — all cards stay on top.'}));
    confirm.textContent = out.length ? `Confirm — ${out.length} to the ${outName}` : 'Confirm — keep all on top';
  }
  const confirm=h('button',{class:'primary',onclick:()=>{
    snap(); state.library.splice(0,n);
    const k=keep.map(i=>top[i]), o=out.map(i=>top[i]);
    if(surveil){ state.library=[...k,...state.library]; o.forEach(x=>gyPush(x,'library')); log(`Surveil ${n}: ${k.length} stay on top${o.length?`; ${o.map(x=>x.name).join(', ')} to the graveyard`:''}`); }
    else { state.library=[...k,...state.library,...o]; log(`Scry ${n}: ${k.length} stay on top${o.length?`; ${o.length} to the bottom`:''}`); }
    m.close(); render(); if(onDone) onDone();
  }});
  m.foot.append(confirm);
  draw(); showPreview(top[0]);
}

function openToken() {
  if (!state) return;
  const name = h('input', { type: 'text', value: 'Token' });
  const pt = h('input', { type: 'text', placeholder: 'e.g. 1/1' });
  const m = modal('Create token', { width: 360 });
  m.body.append(h('div', { class: 'small muted', text: 'Name' }), name, h('div', { class: 'small muted', style: 'margin-top:8px', text: 'Power/toughness (optional)' }), pt);
  const go = () => { makeToken(name.value.trim() || 'Token', pt.value.trim()); m.close(); };
  [name, pt].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') go(); }));
  m.foot.append(h('button', { text: 'Cancel', onclick: () => m.close() }), h('button', { class: 'primary', text: 'Create', onclick: go }));
  name.select();
}


function openImages() {
  const m = modal('Card images', { width: 560, onClose: () => { imgUi = null; } });
  const showChk = h('input', { type: 'checkbox' }); showChk.checked = showImages;
  const autoChk = h('input', { type: 'checkbox' }); autoChk.checked = autoImages;
  showChk.addEventListener('change', () => { showImages = showChk.checked; lsSet('mtgpt.showImages', showImages); if (showImages) prepareImages(); render(); });
  autoChk.addEventListener('change', () => { autoImages = autoChk.checked; lsSet('mtgpt.autoImages', autoImages); if (autoImages) maybeAutoDownload(); });
  const info = h('div');
  const bDeck = h('button', { class: 'primary', text: 'Download for this deck', onclick: () => { imgMissing.clear(); downloadImages(currentDeckNames()); } });
  const bAll = h('button', { text: 'Download for all saved decks', onclick: () => { imgMissing.clear(); downloadImages(allDeckNames()); } });
  const bStop = h('button', { text: 'Stop', onclick: () => { imgJob.cancel = true; } });
  const bClear = h('button', { class: 'danger', text: 'Delete saved images', onclick: async () => {
    if (!confirm('Delete all saved card images from this browser? You can download them again later.')) return;
    try { await idbDelete(await idbKeys('img:')); } catch (e) { /* ignore */ }
    for (const e of IMG.values()) for (const u of [e.front, e.back]) if (u && u.startsWith('blob:')) URL.revokeObjectURL(u);
    IMG.clear(); imgMissing.clear(); render(); setImgStatus();
  } });
  m.body.append(
    h('p', { class: 'muted', text: 'Images come from Scryfall. When you are online, the app can download the pictures for your deck once and keep them on this computer, so they still show when you are offline. Only card names are sent to Scryfall.' }),
    h('label', { class: 'chk', style: 'display:flex;margin:6px 0' }, showChk, ' Show card images on the table'),
    h('label', { class: 'chk', style: 'display:flex;margin:6px 0' }, autoChk, ' Download automatically when online'),
    info
  );
  m.foot.append(bClear, bStop, bAll, bDeck, h('button', { text: 'Close', onclick: () => m.close() }));
  async function refresh() {
    const { have, total } = imgSummary();
    const saved = (await idbKeys('img:')).length;
    const remoteOnly = [...IMG.values()].filter(e => e.remote).length;
    const online = navigator.onLine !== false;
    info.replaceChildren(...[
      h('div', { text: `This deck: ${have} of ${total} cards have images.` }),
      h('div', { text: `Saved on this computer: ${saved} images.` }),
      h('div', { class: online ? 'ok' : 'bad', text: online ? 'Online: Scryfall can be reached.' : 'Offline: showing saved images only.' }),
      imgJob.running ? h('div', { text: `Downloading ${imgJob.done} of ${imgJob.total}…` }) : null,
      remoteOnly ? h('div', { class: 'bad', text: `${remoteOnly} image(s) could not be saved and only show while you are online.` }) : null,
      imgMissing.size ? h('div', { class: 'muted small', text: `Scryfall had no picture for: ${[...imgMissing].join(', ')}` }) : null
    ].filter(Boolean));
    bDeck.disabled = bAll.disabled = imgJob.running || !online;
    bStop.disabled = !imgJob.running;
  }
  imgUi = refresh;
  refresh();
}

// Download the Oracle Cards bulk file straight from Scryfall (needs internet; ~150 MB).
async function downloadBulk(onProgress) {
  onProgress('Asking Scryfall for the latest file…');
  const list = await (await fetch('https://api.scryfall.com/bulk-data')).json();
  const entry = (list.data || []).find(d => d.type === 'oracle_cards');
  if (!entry) throw new Error('Scryfall did not list an Oracle Cards file.');
  const res = await fetch(entry.download_uri);
  if (!res.ok) throw new Error('Download failed (HTTP ' + res.status + ').');
  const total = entry.size || +res.headers.get('content-length') || 0;
  const reader = res.body.getReader(), chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); got += value.length;
    onProgress(`Downloading… ${(got / 1048576).toFixed(0)}${total ? ' of ' + (total / 1048576).toFixed(0) : ''} MB`);
  }
  return new Blob(chunks, { type: 'application/json' });
}
async function runBulkDownload(onProgress) {
  try {
    const blob = await downloadBulk(m => { onProgress(m); updateDbStatus(m); });
    await importCardData(blob);
    return true;
  } catch (e) {
    console.error(e);
    updateDbStatus();
    onProgress('Could not download: ' + e.message + ' Check your internet connection, or choose a downloaded file instead.');
    return false;
  }
}
function promptFirstBoot() {
  if (cardCount || !navigator.onLine || lsGet('mtgpt.bulkPrompt', '') === 'off') return;
  const m = modal('Download card data?', { width: 520, sticky: true });
  const msg = h('p', { text: 'The app needs card data (names, costs, types, text) to know which cards are lands, creatures and so on. It can download it from Scryfall now: about 150 MB, once. After that it works fully offline.' });
  const go = h('button', { class: 'primary', text: 'Download now' });
  go.addEventListener('click', async () => {
    go.disabled = true;
    const ok = await runBulkDownload(t => { msg.textContent = t; });
    if (ok) m.close();
    else go.disabled = false;
  });
  m.body.append(msg);
  m.foot.append(
    h('button', { text: 'Don’t ask again', onclick: () => { lsSet('mtgpt.bulkPrompt', 'off'); m.close(); } }),
    h('button', { text: 'Not now', onclick: () => m.close() }), go);
}

// ---------------------------------------------------------------- version + changelog
const APP_VERSION = '0.67.0';
const CHANGELOG = [
  { v: '0.67.0', title: 'Board layout pass', notes: ["Six board changes, each with its own switch in Settings > Playmat & frame > Board layout.", "Zone depth: the three battlefield zones look like shelves with a soft inner shadow.", "Stack identical lands and tokens: identical cards pile into one with a count badge; click the badge to spread them out, and click it again to pile them up. Cards with counters, attachments or different states stay separate.", "Dim cards that cannot act: tapped lands and summoning-sick creatures are a little duller.", "Mana and phase strip: a slim strip on the board edge shows the current step, what comes next, floating mana, your land drop and the stack size.", "Combat lane: once attackers are declared, they move to a lit lane at the front of the creature zone.", "Fanned graveyard: the top three graveyard cards show fanned out."] },
  { v: '0.66.1', title: '3D hand and floating battlefield', notes: ["Your hand cards now tilt toward the mouse in 3D when you hover them, the same tilt as the big card preview. Switch: Settings > Animations > 3D hand tilt.", "Battlefield cards float: each drifts up and down a tiny amount at its own pace and has a deeper shadow, so the board feels layered. Switch: Settings > Animations > Floating battlefield. Both follow the master animation switch and the system reduced-motion setting."] },
  { v: '0.66.0', title: 'Online updates from GitHub', notes: ["Update app now has a From GitHub section: Check now shows the newest release and what changed, then Download & install fetches the files and checks each one against its published SHA-256 fingerprint before installing. Nothing is installed if a check fails.", "Optional switch: check for updates when the app starts (on by default, quiet if you are offline). A dot appears on the Update app button when a release is waiting.", "This version changes the desktop shell, so install the full package once (Build-Installer.bat or Run-Desktop.bat from the new folder). After that, updates arrive from GitHub."] },
  { v: '0.65.0', title: 'More triggers: graveyard, discard, Sagas', notes: ["Triggers that work from the graveyard now fire from there: Ichorid at your upkeep, Bridge from Below, and 'when this is put into your graveyard' cards such as Narcomoeba (from the library) and Emrakul, the Aeons Torn.", "New events: a card put into your graveyard from anywhere (Murktide Regent counts instants and sorceries), cycle and discard triggers (Curator of Mysteries), 'whenever you tap this for mana' (Forbidden Orchard) and 'whenever you lose life'.", "Sagas work: they enter with a lore counter, gain another each precombat main phase, each chapter triggers when the count reaches it, and the Saga is sacrificed once the final chapter has resolved. 'Gains \"...\"' chapters (Urza's Saga) really give the land its mana ability and the Construct ability.", "New effects: shuffle graveyard into library, put this onto the battlefield from the graveyard, Ichorid's exile-and-return, exile this from the graveyard, and tutors for 'mana cost {0} or {1}'. Colour words now work in search and graveyard filters.", "Official rules used: 603.6 (zone-change triggers), 603.10a (leaves-the-battlefield look back), 714 (Sagas)."] },
  { v: '0.64.0', title: 'Attachments and replacement effects', notes: ["Equipment and Auras now really attach. Equip is a sorcery-speed ability you activate (pay the cost, pick a creature you control). Auras ask what to enchant as they enter (and go to the graveyard if there is nothing, rule 704.5m). Right-click an Equipment or Aura for Attach to… / Unattach. A badge on each tile shows what it is attached to.", "Attachment bonuses follow the host live: Bonesplitter +2/+0, Batterskull +4/+4 with vigilance and lifelink, Rancor +2/+0 and trample, Lightning Greaves haste and shroud, Cranial Plating +1/+0 for each artifact you control, Pacifism removes it from your attackers. Living weapon creates the 0/0 Germ and attaches the Equipment to it. When a host leaves, Auras fall to the graveyard and Equipment stays unattached.", "Replacement effects: Hardened Scales and Winding Constrictor add counters (also as a permanent enters, e.g. Walking Ballista with X counters), Doubling Season doubles counters from effects; manual +/- counter buttons are never changed. Mox Diamond asks you to discard a land or goes to the graveyard. Cavern of Souls, Phyrexian Revoker and Pithing Needle ask for a creature type or card name as they enter; Revoker and Needle block activating the chosen card's abilities, and Cavern's coloured mana is limited to creature spells of the chosen type.", "Dredge: when you would draw (draw step, 'draw a card' effects) and have a dredge card in your graveyard with enough cards in your library, you are asked whether to mill and return it instead. New switches in Settings > Tutor mode: Dredge prompt and Replacement effect notes.", "Test set scan: 0 lines not understood; lines understood rose from 66% to 74%."] },
  { v: '0.63.1', title: 'Scan decks & save report', notes: ['New button on the Your decks screen: Scan decks & save report. It reads every card of every saved deck, lists each line the app does not fully handle with the reason, and saves mtg-playtester-deck-report.txt that you can upload for review. Cards missing from the card data are listed too.'] },
  { v: '0.63.0', title: 'No unknown lines: rulings, tutors, land drops', notes: ["The card reader now has no 'not understood' lines on a 190-card test set of Modern, Legacy and Vintage staples (it started at 49). Every line that the app cannot automate now carries the official rule to follow by hand, instead of a vague flag. Cards the app handles partly are still shown in gold.", "Extra land drops: Exploration, Azusa, Dryad of the Ilysian Grove, Oracle of Mul Daya and similar now allow more than one land per turn (cumulative, rule 305.2). Before this, only one land per turn was ever allowed.", "Black Lotus and Lion's Eye Diamond now give three mana of one colour (they gave one). Manamorphose-style 'N mana in any combination of colors' asks for each mana. Take an extra turn (Time Walk, Emrakul) is offered and logged.", "Tutors and graveyard returns: 'Search your library for…' (Demonic Tutor, Entomb, Stoneforge, Recruiter, Tinker, Primeval Titan…) opens a picker with matching cards highlighted and a Find nothing button (you may always fail to find). 'Return up to three land cards from your graveyard to your hand' (Life from the Loam) opens a graveyard picker.", "'Can't be countered' is enforced (Emrakul). 'Doesn't untap during your untap step' (Mana Vault) and Back to Basics now keep permanents tapped. Enters with X counters (Chalice of the Void) uses the X you paid. Coin flips (Mana Crypt) flip and deal the damage. 'Gets +1/+1 as long as you control a Mountain' (Wild Nacatl) is live.", "Legendary cards that call themselves by their short name (Phlage, Ajani, Karn) are now read correctly, and 'enters or attacks' triggers fire on both. Adventure and split cards read their second face as an instant or sorcery.", "New format filter in 'Scan every card': Standard, Pioneer, Modern, Legacy, Vintage, Pauper or Commander. Re-import the Oracle file once to enable it. Use it on your real data and send me the report to find the next gaps."] },
  { v: '0.62.0', title: 'Lands: Temple, tomb, Vesuva, Dark Depths, Locus', notes: ['Lands are now read from their rules text. {T}: Add {C}{C} lands (Eldrazi Temple, Ancient Tomb, Urza\'s tron lands with their bonus) make all their mana, with each mana shown in the pay window; Ancient Tomb and similar lands deal their damage; Mana Confluence / City of Brass cost their life or damage.','"Spend this mana only to cast colorless Eldrazi spells…" is enforced when you pay through the cast window: Eldrazi Temple gives {C}{C} for a colorless Eldrazi spell and only {C} for anything else. (Mana you float by tapping a restricted land by hand is not tracked; the app reminds you.)','Vesuva asks which land to copy when it enters; it enters tapped with that land\'s name, abilities and enters-with counters, and turns back into Vesuva when it leaves.','Dark Depths: enters with ten ice counters (any "enters with N <kind> counters" now works), counters of any kind show on the card, "{3}: Remove an ice counter" is offered, and when the last one is gone the "When it has no ice counters" trigger fires: Exile Dark Depths, then create Marit Lage (20/20 legendary, flying, indestructible) in one step. Tokens now really have flying/indestructible etc.','Locus lands: Cloudpost adds {C} for each Locus on the battlefield, Glimmerpost gains 1 life for each Locus, and Vesuva copying a Locus counts as one. "For each <type or subtype>" counting works for these effects in general.'] },
  { v: '0.61.0', title: 'Token tray and Kozilek\'s Command', notes: ['New Tokens button (next to Sideboard): the app reads the rules text of every card in your deck and lists each token it can make (Eldrazi Spawn, Treasure, Clue, Orc Army, Spirit with flying…) with its power/toughness, abilities and the cards that make it. Pick a number and press Create to put them onto the battlefield.','Tokens now carry their real abilities and keywords: an Eldrazi Spawn can be sacrificed for {C}, a Treasure for any colour, a Clue for a card, a token with flying counts as flying, and tokens have proper types and subtypes.','Fixed the effect reader for "creates": Kozilek\'s Command (and every "target player creates X tokens" card) now offers Create X tokens, using the X you paid, and no longer mistakes the token\'s own "Add {C}" for a mana ability. If the target is your opponent the tokens are only logged. Target parsing for "target player creates…" is fixed, and the stack shows the real X in chosen modes.'] },
  { v: '0.60.0', title: 'Smoother, centred hand and tabbed settings', notes: ['The hand is always centred: the middle card sits in the middle of the hand zone however many cards you hold, and drawing or playing slides the others smoothly to their new places (cards now glide and re-angle instead of snapping).','New Animations fine-tuning: animation speed, hand fan curve, sparkle amount and spell spotlight size.','Settings are split into tabs: Graphics (card size, sleeves, interface theme, foil, cursor), Playmat & frame, Animations, Sound and Tutor mode.'] },
  { v: '0.59.0', title: 'Amass and Orcish Bowmasters', notes: ['Amass now works (rule 701.47): put N +1/+1 counters on an Army you control; if you control none, a 0/0 black Army token is created first. The Army also becomes the named type (Orc) in addition. With several Armies you choose which one.','Orcish Bowmasters triggers on entering and its Amass Orcs 1 follows the damage. For the "whenever an opponent draws a card except the first one in their draw step" half, use the new 🃏 button beside the opponent life: say whether it was their draw-step draw or an extra draw.'] },
  { v: '0.58.0', title: 'Animations, effects and themes', notes: ['Cards now move: drawn cards fly from the library into your hand (staggered when you draw several), played cards slide from hand to the battlefield, tapping rotates smoothly, and cards leaving fly to the graveyard, exile or stack. Permanents pop in with sparks.','Spell spotlight: casting a spell lifts the card into the middle of the screen with a glow in its colour, then sends it to the stack; resolving and countering have their own effects.','Life totals roll up or down, flash green or red, shake on big hits, show floating +/- numbers, and a lethal moment appears at 0.','A turn banner at the start of each turn and a flash on the phase bar when the phase changes.','Your hand sits in a gentle fan and the hovered card lifts.','Text card tiles have a new look: colour-tinted frames, a name plate, a type bar and a stat plate.','Settings \u2192 Animations & theme: a switch for each effect and eight interface themes (Midnight, Obsidian & gold, Abyss blue, Forest, Neon, Parchment, Light, Match my deck).'] },
  { v: '0.57.0', title: 'Deck boxes', notes: ['The deck drop-down is now a Deck button that opens a shelf of 3D deck boxes. Each box shows art from one card of that deck (the first non-land card by default; "Art…" lets you choose), the deck name on the spine, its card count and colours. The boxes tilt toward your mouse. Click a box to use that deck; "Edit" opens that deck in the editor.'] },
  { v: '0.56.0', title: 'Built-in sleeves and playmats', notes: ['Settings now has a gallery of 9 card sleeves (Mana wheel, Dragon scale, Arcane circle, Forest, Tides, Ember, Gilded deco, Night sky, Checker) and 10 playmats (Mana sigil, Dragon\'s lair, Arcane circle, Ocean depths, Mountain dusk, Moonlit grove, Old map, Obsidian & gold, Nebula, Storm). Click one to use it. They are drawn by the app, so there is nothing to download. Your own uploads still work and take priority when switched on. The playmat motion options work on them too.'] },
  { v: '0.55.0', title: 'Suspend works', notes: ['Cards with Suspend (Rift Bolt, Ancestral Vision, Living End…) get a "Suspend N (cost)" item in their hand menu. It follows the rules: you can suspend any time you could begin to cast the card, you pay the suspend cost, and it is exiled with N time counters (shown in the Exile list).','At the start of each of your upkeeps a trigger removes a time counter. When the last one is removed a second trigger casts the card for free (you choose its modes and targets); creatures cast this way have haste. If it cannot be cast it stays in exile.'] },
  { v: '0.54.1', title: 'More realistic foil', notes: ['Foil now behaves like a real foil card: fine colour bands slide across the card as the light angle changes, a soft glare follows the mouse, tiny glints sparkle only near the light, and the big preview tilts toward your mouse. When you are not hovering, the light drifts slowly on its own.'] },
  { v: '0.54.0', title: 'Foil cards', notes: ['Settings → Foil cards: a holographic rainbow sheen with a little sparkle on every card, or on about one card in five. It slowly sweeps over the card and follows the mouse when you hover. Works on text tiles, card images and the big preview. Strength slider.'] },
  { v: '0.53.0', title: 'Custom mouse cursor', notes: ['Settings → Mouse cursor: gold arrow, magic wand, sword, or a glowing mana orb in any of the five colours, or your own image. Each has a brighter version over things you can click. Small / medium / large.'] },
  { v: '0.52.0', title: 'Moving playmat', notes: ['Settings → Playmat → Playmat motion: slow drift, gentle breathing, a passing light, or a picture that follows the mouse. Works on your custom image and on the colour themes. Only the picture moves, never the cards. There is a speed slider, and it respects the system "reduce motion" setting.'] },
  { v: '0.51.1', title: 'Softer sounds and background music', notes: ['The casting sound is now a soft low swell instead of a bright sweep.','All sound effects have a gentle room reverb.','New endless background music: a calm ambient loop of slow chords and soft bells, generated in the app. Settings → Sound has its own switch and volume. It starts after your first click.'] },
  { v: '0.51.0', title: 'Sound effects', notes: ['New sounds for drawing a card, casting a spell, a permanent entering the battlefield, playing a land, a spell or ability resolving, and a spell being countered. All are generated in the app (no audio files, works offline).','Settings → Sound: master switch, volume, and a switch for each sound.'] },
  { v: '0.50.0', title: 'Triggers are real stack objects', notes: ['Land "when this enters, surveil/scry N" triggers now go through the trigger window, sit on the stack (you can respond), and resolve from there, instead of popping up on their own.','Targets for a triggered ability are chosen when it goes on the stack, so it can fizzle if the target leaves.','The opponent box can now put a triggered/activated ability on the stack (type: triggered/activated ability), so you can counter or respond to it. Stack rows say Triggered ability vs Activated ability.'] },
  { v: '0.49.0', title: 'Effect durations and delayed effects', notes: ['One ledger now tracks everything that lasts: "until end of turn", "until your next turn", "while the source stays on the battlefield" and delayed triggers. Temporary pumps and keyword grants end in the cleanup step (or at your next turn), effects tied to a permanent end when it leaves, and the log says what ended.','The effect panel understands more: "gets +2/+2 until end of turn" and "gains flying/haste/lifelink… until end of turn" for yourself, a target or "creatures you control"; "at the beginning of the next end step, exile / sacrifice / return it" and "at your next upkeep, draw a card" become delayed triggers that actually fire; "exile target permanent until ~ leaves the battlefield" (Leyline Binding style) returns the card when the source leaves; any other "this turn" sentence can be kept as a timed reminder.','New Effects button (top of the table, only when something is active) lists every lasting effect with when it ends and lets you remove one. An hourglass badge marks creatures with a lasting effect, and the preview lists them. Temporary keywords also show as icons. Toggle: Effect timers.'] },
  { v: '0.48.0', title: 'Keyword icons', notes: ['Keywords a creature has right now because of another permanent or a condition (Scion of Draco, delirium…) are shown as small round icons on its tile instead of a text label: wings = flying, wizard hat = hexproof, sword = first strike, crossed swords = double strike, skull = deathtouch, lightning = haste, shield = indestructible, heart = lifelink, two figures = menace, arrow = reach, paw = trample, eye = vigilance, wall = defender. Hover an icon for its name and where it comes from.','The enlarged preview has a new "Active now" row listing every keyword the creature has at this moment (printed and granted; * = granted), and the keyword chips carry the same icons. Turn it off with the new teaching toggle "Active keyword icons".'] },
  { v: '0.47.3', title: 'One-click installer', notes: ['The Windows installer now installs in one click (no wizard), adds desktop and Start menu shortcuts and opens the game. Build-Installer.bat also produces a ready-to-share MTG-Playtester-Share.zip.'] },
  { v: '0.47.2', title: 'Delirium on real card data', notes: ['Fixed: static abilities were not read on cards whose name has a curly apostrophe (Dragon\u2019s Rage Channeler and similar), so the delirium bonus never applied with real Scryfall data. The P/T box now changes to 3/3 and flying turns on when you reach four card types.','Active keywords are now visible: a green keyword pill on the card (FLYING) while it is active, and in the preview the keyword chip shows a check mark when active and is dashed/dim when not.'] },
  { v: '0.47.1', title: 'Delirium badge', notes: ['The delirium counter now reads "\u0394 4/4" and sits above the power/toughness corner so it cannot be mistaken for a P/T. The card\u2019s own P/T box already shows the new stats (green 3/3 over the printed 1/1), the same way as Cosmogoyf.'] },
  { v: '0.47.0', title: 'Delirium', notes: ['Cards with Delirium now check the graveyard live. Dragon\u2019s Rage Channeler (and any "As long as there are four or more card types among cards in your graveyard, ~ gets +2/+2, has flying…" line) gets its bonus and keywords automatically when you reach four types, and loses them when you drop below.','A purple n/4 badge on every card that uses delirium (hand, battlefield, anywhere) shows how many card types are in your graveyard and glows gold when delirium is active. The card preview explains what is active. "Attacks each combat if able" is shown but not enforced.'] },
  { v: '0.46.0', title: 'The cost system', notes: ['One model for everything a spell or ability costs. Before paying, a window now lets you choose HOW to pay when there is a choice: the normal cost, an alternative cost (Evoke, "exile a blue card from your hand", "pay 1 life and exile…", "return an Island you control") or optional extras like Kicker.','Cost increases and reductions on the board are applied automatically and shown on the card in hand: Thalia and Sphere of Resistance style taxes, Goblin Electromancer style reductions, Affinity, plus the existing "costs {N} less for each…". Taxes also apply to alternative costs. Tools → Cost effects lets you add effects the app cannot see (an opponent\u2019s Thalia).','Non-mana costs are real choices now: "As an additional cost… sacrifice/discard/exile", abilities that say "Sacrifice a creature", "Discard a card", "Exile a card from your graveyard", "Tap an untapped creature you control", "Return a land you control to its owner\u2019s hand". A window asks which cards pay; nothing changes until every choice is made, and cancelling leaves the game untouched. Before, these were left for you to pay by hand.','Delve, Convoke and Improvise open a window where the cards you choose pay part of the mana cost. Cycling works from your hand (right-click \u2192 Cycle): the cost is paid, the card is discarded and "draw a card" goes on the stack. Evoked creatures queue their sacrifice trigger.','Hand outlines now count alternative and additional costs, so a card you can only cast by pitching glows, and the tooltip explains an unpayable additional cost. New teaching toggle: Cost explanations.'] },
  { v: '0.45.0', title: 'Targeting', notes: ['The app now reads "target …" from spells and abilities (any target, target creature you control, up to two target creatures, target player or opponent, target spell, target card in a graveyard, target nonland permanent…). When you cast the spell or activate the ability a window lists every legal target (your permanents, you, the opponent, spells on the stack, your graveyard) and you choose before paying. Things your opponent controls are offered as "not tracked here" so the cast can still go ahead.','When it resolves the targets are checked again: gone targets are skipped, and if every target is gone the spell or ability fizzles (a spell goes to the graveyard and does nothing). Triggered abilities and loyalty abilities ask for their targets as they resolve.','The effect buttons are now tied to the targets you chose: Deal 3 damage to Opponent, Destroy Grizzly Bears, Exile X, Return X to its owner\'s hand, Tap/Untap X, X gets +2/+2 until end of turn, Put a +1/+1 counter on X, Counter that spell, target player draws/gains/loses. Creatures now keep damage marked until end of turn and die to lethal damage (indestructible survives).','The stack window has an "Opponent casts it" box: add the spell your real opponent cast. You can counter it, respond to it, or target it with your own counterspell. Opponent spells resolve with a reminder to apply their effects by hand. The Stack button works even when the stack is empty.'] },
  { v: '0.44.0', title: 'One way onto and off the battlefield', notes: ['Everything that puts a permanent onto the battlefield (playing a land, a spell resolving, fetching, reanimating, making a token, dragging a card by hand, pre-game Leylines) now goes through one routine, and everything that removes one (dying, sacrifice, state-based actions, the legend rule, bouncing, exiling) goes through another. Tapped-or-untapped, the shockland question, surveil lands, enters-the-battlefield and landfall triggers, "exile it instead" and dies/leaves triggers are now handled in exactly one place, so they work the same whichever way a card moves.','Tokens now trigger "whenever a creature enters" abilities, and tokens that die trigger "whenever a creature dies".','The game now remembers what entered, left and died this turn, ready for cards that count them.'] },
  { v: '0.43.0', title: 'Card-pool coverage scan', notes: ['New: How the app reads cards… > Scan every card in the card data. It runs the card reader over every card and ranks the rules phrasings the app does not understand, most common first (also grouped by how the phrase starts, plus keywords it only explains). Copy or save the report to decide what to teach the app next.','Re-import the Oracle file once to enable the "Modern-legal cards only" filter.'] },
  { v: '0.42.0', title: 'Fetched lands, Goryo\'s Vengeance, Countered', notes: ['A fetched land now does everything it does when it enters: a shockland asks whether to pay 2 life, surveil lands surveil, and enters-tapped rules apply. Lands you drag onto the battlefield by hand do the same.','"Return target ... card from your graveyard to the battlefield / your hand" spells (Goryo\'s Vengeance, Reanimate, Raise Dead...): you choose the target when you cast the spell, before paying. On resolution the card is returned automatically. If the target left the graveyard the spell does nothing. Goryo\'s Vengeance also gives haste, exiles the creature at the next end step, and exiles it instead if it would leave the battlefield.','New Countered button on the stack: removes the top spell or ability without resolving it (a spell goes to the graveyard), for playtesting against another player.'] },
  { v: '0.41.1', title: 'Lifelink and big "draw N" numbers', notes: ['Lifelink now works in combat: the damage a lifelinker deals also gains you that much life (Griselbrand attacking = +7), it is logged, and "whenever you gain life" triggers fire.','Effects that use number words above five ("Draw seven cards", "create six tokens", "put ten counters"...) are now recognised up to ten; before, Griselbrand\'s "Pay 7 life: Draw seven cards" paid the life but the draw was not offered.'] },
  { v: '0.41.0', title: 'Surveil and scry done properly', notes: ['Surveil lands (Undercity Sewers, Meticulous Archive and the rest) enter tapped, then the surveil window opens for the "When this enters, surveil N" trigger and names the card that caused it.','The window shows the cards you looked at in two groups: those that stay on top (with up/down arrows so you choose the order, first = next draw) and those leaving (to the graveyard for surveil, to the bottom for scry). One click moves a card between groups.','If your library has fewer cards than N you look at all of them; with an empty library nothing opens. The window can no longer be cancelled by accident, and the log names every card put into the graveyard.'] },
  { v: '0.40.1', title: 'New top bar', notes: ['The top bar is regrouped: logo and deck picker on the left, New game + On the play together, the six game actions (Undo, Shuffle, Draw, Untap all, Token, Stack) as one icon-and-label button strip, then status chips (green dot = ready, amber = needs attention), the version, and Tools & Settings on the right.','On narrower windows the button labels hide and only icons show (hover for the name and shortcut). The version badge shows just the number; hover or click it for what changed.'] },
  { v: '0.40.0', title: 'Board frames + tidier pre-game screen', notes: ['New Settings \u2192 Board frame: Fire, Ice, Grass, Storm, Shadow and Royal gold put a glowing, slowly moving coloured outline around the playmat and tint the borders of the zones, hand and top bar. Pick Custom to choose your own two colours.','Animated glow can be switched off (still outline) and the glow strength has its own slider. Frames are independent of the playmat colour/image.','The Pre-game actions screen is laid out properly: each opening-hand card shows its name, what its ability does, and its button; the hint and Continue button have room to breathe.'] },
  { v: '0.39.3', title: 'Cast-time vs trigger "choose one"', notes: ['The app now tells apart where a "choose one" sits. On an instant or sorcery it is chosen as you cast the spell. After "When/Whenever/At the beginning of" (Territorial Kavu: "Whenever this creature attacks, choose one") it is a triggered ability and is chosen when the trigger goes on the stack \u2014 casting the creature no longer opens the mode window. A "choose one" after a cost and colon is chosen when you activate the ability.','The card reader says which kind each modal line is.'] },
  { v: '0.39.2', title: 'Auto-pay sees every colour a land can make', notes: ['Auto-payment, the hand outlines (Playable / Can\'t pay) and the mana window now use the same land-colour rules as tapping a land by hand: printed mana plus every basic land type the board gives it. With Leyline of the Guildpact in play every land can pay for any colour; Blood Moon-style effects reduce nonbasic lands to red.'] },
  { v: '0.39.1', title: 'P/T box text always fits', notes: ['The number inside the live P/T box now scales down with its length (3/4, 10/11, 12/13...) so it always stays inside the box, on the card and in the hover preview. Applies to every creature with changed or variable power/toughness.'] },
  { v: '0.39.0', title: 'Live power/toughness shown on the card', notes: ['When a creature\'s power/toughness differs from what is printed (Cosmogoyf, Territorial Kavu, counters, anthems, until-end-of-turn pumps), a P/T box now appears over the printed box on the card, even when card pictures are on.','Ring colour: green = bigger than printed, red = smaller, gold = changes with the game (a \u2605 value). The box flashes briefly whenever the number changes.','The large hover preview shows the same box over the picture; hover the box for the reasons (printed value and every effect).'] },
  { v: '0.38.0', title: 'Choose-one / choose-two (modal) cards', notes: ['The app now recognises "Choose one \u2014", "Choose two \u2014", "Choose one or both \u2014", "Choose one or more \u2014", "Choose up to N \u2014" and Spree. Casting such a card (Kolaghan\'s Command, Cryptic Command, charms...) opens a window listing every mode; you pick the right number before paying, and the window will not let you pick too many or too few.','Only the modes you chose resolve, in printed order. They show on the stack, and the effects panel offers just those (for example Kolaghan\'s Command: deal 2 damage). Modes the app cannot apply by itself are labelled "you apply this one by hand".','Works for spells, triggered abilities (the mode is chosen as the trigger goes on the stack, e.g. Territorial Kavu) and activated abilities. Spree extras add their cost to the spell and the window shows the total.','The card reader (How the app reads cards) shows each mode and whether the app applies it.'] },
  { v: '0.37.0', title: 'Cosmogoyf fixed, live power/toughness for any count', notes: ['Cosmogoyf now works: its real text counts the cards you own in exile (power = that number, toughness = that number + 1). The app did not recognise that wording before, which is why it showed 0/0 or a question mark.','Power/toughness that depends on a count is now read generically: cards in exile, creature/land/etc. cards in your graveyard, cards in hand/graveyard/library, your life total, and anything "you control" (Elves, other creatures, artifacts, legendary permanents...), with optional "plus N".','New: "until end of turn" power/toughness changes. Right-click a creature for +1/+1, +2/+2 or \u22121/\u22121 until end of turn; effects that say "this creature gets +X/+X until end of turn" (prowess) are offered when they resolve. They wear off at cleanup and show in the hover note.','Modal abilities such as Territorial Kavu\'s attack trigger now list each mode separately.'] },
  { v: '0.36.0', title: 'One effect list, more abilities and triggers', notes: ['The card reader and the game now share one list of effects, so what "How the app reads cards" reports is exactly what the game does. New effects: opponent damage and life loss (Ballista pings, Bolt-style spells), +N counters, create tokens (e.g. two 1/1 Soldiers), Add mana (rituals like Dark Ritual), mill.','Cards with several activated abilities (Walking Ballista) now offer each one. Costs are paid for you: mana through the payment window, {T}, sacrificing itself, removing counters, paying life. Costs the app cannot pay are listed for you to pay by hand. Instants and sorceries now open the suggested-effects panel whenever the app recognises an effect.','New trigger events: when this leaves the battlefield, whenever you gain life, whenever this (or a creature you control) deals combat damage to a player.'] },
  { v: '0.35.0', title: 'The app reads cards: card model and timing rules', notes: ['New: Tools & Settings > "How the app reads cards" (and right-click any card > "How the app reads this card"). Every rules line is classified as keyword, mana, activated, triggered, static, loyalty or spell effect and marked Understood, Partly or Not understood, with a coverage summary for your whole deck.','Activation restrictions are now read from the card text and checked: as a sorcery, during your upkeep / draw step / end step / combat / before blockers, once each turn, if you control a (type), if you have no cards in hand, N or more cards in your graveyard. They apply to mana abilities and other activated abilities, and the green outline respects them.','Static abilities are listed per line using the v0.34 engine.'] },
  { v: '0.34.0', title: 'Static abilities apply to everything', notes: ['New static-ability engine: every permanent\'s rules text is read and each effect is applied to ALL permanents it describes, not just the cards tested so far. Covers "is all colors / is red / is colorless", "Each creature you control has vigilance if it\'s white...", and "Other Dragons you control get +1/+1" style power/toughness boosts, for subjects like each/other/all, colours, nonland, legendary, creature types (changeling counts) and more.','Leyline of the Guildpact now makes every nonland permanent all five colours everywhere: the card colour, Scion of Draco\'s grants, colour conditions and the preview note all agree.','Hand key simplified to Playable / Can\'t pay (not enough mana or wrong colours) / Wrong timing, with the exact reason on hover.'] },
  { v: '0.33.0', title: 'Hand reordering and a clearer key', notes: ['Drag cards sideways in your hand to reorder them; a gold line shows where the card will land. A Sort menu offers lands first, mana value, colour and playable first.','Outline key rebuilt: green = playable, red = not enough mana, purple = enough mana but wrong colours, gold = not now (hover for the exact reason: wrong phase, busy stack, land already played), white = selected. The lightning badge means instant speed.'] },
  { v: '0.32.0', title: 'Library menu and tidier piles', notes: ['Click (or right-click) the library to open a menu: Draw, Look at top N, Scry N, Surveil N, Mill N, Search, Shuffle. The always-visible buttons are gone, and clicking no longer draws by accident.','Library, graveyard and exile are redrawn as piles with a count badge; the library gets thicker or thinner with its size.','New teaching switch: Library menu tip (hover tip on the library).'] },
  { v: '0.31.0', title: 'X spells', notes: ['Spells with {X} in the cost now ask you to choose X when you cast them, showing the largest X your mana allows and the total cost. Two {X} symbols (Walking Ballista) cost two mana per point of X.', 'X is remembered on the stack (shown as X = n). Permanents that enter with X +1/+1 counters get them; enter-the-battlefield abilities use your X; instants and sorceries offer suggested effects with X filled in (e.g. Draw 3 cards).', 'Limits: activated abilities with {X} in their cost are not handled yet, and counter types other than +1/+1 are left for you to add by hand.'] },
  { v: '0.30.0', title: 'Live power and toughness', notes: ['Creatures show their real power/toughness: Territorial Kavu (basic land types), Cosmogoyf/Tarmogoyf (card types in graveyards, toughness +1), other "equal to the number of..." creatures, +1/+1 and -1/-1 counters, and anthems.', 'Hover a changed creature to see why it is that size.', 'A creature with toughness 0 or less dies (state-based action), e.g. Kavu with no basic lands.', 'Goldfish combat damage uses the live numbers.'] },
  { v: '0.29.1', title: 'Closing a pop-up no longer breaks the game', notes: ['Closing (✕ or Esc) a shock land pop-up now cancels the whole land play: nothing is paid and the land returns to your hand. A Cancel button says the same.', 'Pop-ups that must be answered (triggered abilities, ability resolution, legend rule, cascade, scry/surveil) no longer have a ✕ and ignore Esc, so a decision cannot be skipped by accident.', 'Scion of Draco keyword list corrected: vigilance, hexproof, lifelink, first strike and trample (no haste or deathtouch).'] },
  { v: '0.29.0', title: 'Static abilities work together', notes: ['Static keyword grants now follow current colours: with Leyline of the Guildpact, Scion of Draco gives every creature vigilance, hexproof, lifelink, first strike and trample (it grants no haste, so summoning sickness is unchanged). Any granted haste would remove summoning sickness.', 'The card preview lists keywords and colours a card gets from other permanents.', 'Fetch lands: the Activate ability menu item and double-click now run the fetch instead of only showing its text.', 'Version badge and this What\'s new list at the top right.'] },
  { v: '0.28.0', title: 'Summoning sickness and combat', notes: ['Summoning sickness glow and enforcement, attack declaration with reasons, vigilance, defender, goldfish combat damage and opponent life, flash read from keyword lines.'] },
  { v: '0.27.0', title: 'Activated ability outlines', notes: ['Green outline on permanents whose activated ability can be used now.'] },
  { v: '0.26.1', title: 'Fetch land fixes', notes: ['Library lands keep printed types (Leyline no longer widens fetches); tapped fetches cannot be cracked; Expanse and Fabled Passage details.'] },
  { v: '0.26.0', title: 'Legend rule and mana rocks', notes: ['Legend rule prompt, general mana rocks (Sol Ring, Moxen), soft static-ability checks.'] },
  { v: '0.25.0', title: '{0} spells and Mishra\'s Bauble', notes: ['Zero-cost spells castable; activated abilities with sacrifice costs, targets, and delayed draws.'] },
  { v: '0.24.0', title: 'Visual deck view', notes: ['Deck stats as stacks of card images, curve and colour header, card-data status fix.'] },
  { v: '0.23.0', title: 'Triggers, Necrodominance, planeswalkers', notes: ['Triggered ability engine, Necrodominance static effects, planeswalker loyalty, deck stats overview.'] },
  { v: '0.22.0', title: 'Teaching switches', notes: ['Every teaching aid is its own switch; Now/Next phase window; in-app updater.'] }
];
function openChangelog() {
  const m = modal(`What's new — you are running v${APP_VERSION}`, { width: 620 });
  for (const e of CHANGELOG) m.body.append(h('div', { class: 'clog' }, h('div', { class: 'clog-h' }, h('b', { text: 'v' + e.v }), ' ', h('span', { text: e.title })), h('ul', null, ...e.notes.map(n => h('li', { text: n })))));
  m.foot.append(h('button', { class: 'primary', text: 'Close', onclick: () => m.close() }));
}
function setupVersionBadge() {
  const b = $('#btnVersion'); if (!b) return;
  const top = CHANGELOG[0];
  b.textContent = `v${APP_VERSION}`;
  b.title = `You are running version ${APP_VERSION} — ${top.title}. Click to see what changed.`;
  b.addEventListener('click', openChangelog);
}

// ---------------------------------------------------------------- app updates (desktop version only)
async function openUpdate() {
  if (!window.desktop) return;
  const m = modal('Update app', { width: 560 });
  const info = await window.desktop.info();
  const note = h('p', { class: 'small', style: 'color:var(--gold)' });
  const restart = h('button', { class: 'primary', text: 'Restart to finish', hidden: true, onclick: () => window.desktop.restart() });
  const report = r => {
    if (!r || r.cancelled) return;
    if (!r.ok) { note.textContent = 'Update failed: ' + r.error; return; }
    if (r.upToDate) { note.textContent = `You already have the newest version (${r.version}).`; return; }
    note.textContent = `Version ${r.version} is ready.` + (r.olderOrSame ? ' It is not newer than the built-in version, so the built-in one will keep running.' : ' Restart the app to use it.') + (r.needsInstaller ? ' Note: this release also changes the app shell, so run Build-Installer.bat once to get that part.' : '');
    restart.hidden = false;
  };
  const url = h('input', { type: 'text', placeholder: 'https://example.com/mtg-playtester', value: lsGet('mtgpt.updateUrl', '') });
  const gh = h('div'), ghNote = h('p', { class: 'small', style: 'color:var(--gold)' });
  const auto = h('input', { type: 'checkbox' }); auto.checked = settings.autoUpdateCheck !== false;
  auto.addEventListener('change', () => { settings.autoUpdateCheck = auto.checked; saveSettings(); });
  const ghInstallBtn = h('button', { class: 'primary', text: 'Download & install', hidden: true });
  const showGh = r => {
    gh.replaceChildren(); ghInstallBtn.hidden = true;
    if (!r.ok) { ghNote.textContent = 'Check failed: ' + r.error; return; }
    if (r.none) { ghNote.textContent = 'No release has been published on GitHub yet.'; return; }
    if (!r.newer) { ghNote.textContent = `You have the newest version (${r.current}).`; return; }
    ghNote.textContent = `Version ${r.latest} is available (you have ${r.current}).`;
    if (r.title) gh.append(h('div', { class: 'ptitle', text: r.title }));
    if (r.notes.length) gh.append(h('ul', { class: 'small' }, ...r.notes.map(n => h('li', { text: n }))));
    if (r.needsInstaller) { gh.append(h('p', { class: 'small', style: 'color:var(--gold)', text: 'This release also changes the app shell. Download the full package from the GitHub release page and run Build-Installer.bat once.' })); return; }
    ghInstallBtn.hidden = false;
  };
  ghInstallBtn.addEventListener('click', async () => { ghNote.textContent = 'Downloading and checking files…'; ghInstallBtn.hidden = true; const r = await window.desktop.ghInstall(); if (!r.ok) { ghNote.textContent = 'Update failed: ' + r.error; ghInstallBtn.hidden = false; return; } gh.replaceChildren(); ghNote.textContent = `Version ${r.version} is installed and verified. Restart the app to use it.`; restart.hidden = false; });
  const checkGh = async () => {
    ghNote.textContent = 'Checking GitHub…';
    if (!window.desktop.ghCheck) { ghNote.textContent = 'This app shell is older and cannot check GitHub. Install the full package once (run Build-Installer.bat), or use the web address below.'; return; }
    showGh(await window.desktop.ghCheck());
  };
  m.body.append(
    h('p', null, 'Running version ', h('b', { text: String(info.running) }), ` (${info.source}). Built-in: ${info.bundled}${info.override ? ', downloaded update: ' + info.override : ''}.`),
    h('div', { class: 'fhead', text: 'From GitHub (recommended)' }),
    h('p', { class: 'small muted', text: 'Looks at the newest release on GitHub, shows what changed, then downloads the files and checks each one against its published SHA-256 fingerprint before installing. Your decks, card data and settings are kept.' }),
    h('div', null, h('button', { text: 'Check now', onclick: checkGh }), ' ', ghInstallBtn),
    h('label', { class: 'small', style: 'display:block;margin:6px 0' }, auto, ' Check for updates when the app starts'),
    gh, ghNote,
    h('div', { class: 'fhead', text: 'From a folder' }),
    h('p', { class: 'small muted', text: 'Extract a new zip anywhere, then choose the folder that contains index.html. Your decks, card data and settings are kept.' }),
    h('button', { class: 'primary', text: 'Update from folder…', onclick: async () => { note.textContent = 'Working…'; report(await window.desktop.fromFolder()); if (note.textContent === 'Working…') note.textContent = ''; } }),
    h('div', { class: 'fhead', text: 'From a web address (optional)' }),
    h('p', { class: 'small muted', text: 'Put index.html, app.js, style.css and an update.json ({"version":"0.22.0"}) at one https address, such as a GitHub Pages site or any file host.' }),
    url,
    h('div', { style: 'margin-top:6px' }, h('button', { text: 'Check online', onclick: async () => { lsSet('mtgpt.updateUrl', url.value); note.textContent = 'Checking…'; report(await window.desktop.fromUrl(url.value)); } })),
    note);
  m.foot.append(
    h('button', { class: 'danger', text: 'Go back to built-in version', onclick: async () => { await window.desktop.reset(); note.textContent = 'Downloaded update removed.'; restart.hidden = false; } }),
    h('button', { text: 'Close', onclick: () => m.close() }), restart);
}

function openCardData() {
  const m = modal('Card data', { width: 560 });
  m.body.append(
    h('p', { text: cardCount ? `Loaded: ${cardCount.toLocaleString()} cards. Loading a new file replaces them.` : 'No card data loaded yet.' }),
    h('p', null, 'Download “Oracle Cards” from ',
      h('b', { text: 'scryfall.com/docs/api/bulk-data' }),
      ' once (a .json file, about 150 MB), then choose it below. It stays on this computer; nothing is uploaded and no internet is needed after the download.'),
    h('p', { class: 'muted small', text: 'Parsing a big file can take 10–30 seconds and uses a few hundred MB of memory while it loads.' })
  );
  const note = h('p', { class: 'small', style: 'color:var(--gold)' });
  m.body.prepend(h('p', null, h('b', { text: 'Easiest: ' }), 'download it straight from Scryfall (needs internet, about 150 MB, once).'));
  m.body.append(note);
  const dlBtn = h('button', { class: 'primary', text: cardCount ? 'Update from Scryfall' : 'Download from Scryfall' });
  dlBtn.addEventListener('click', async () => {
    dlBtn.disabled = true;
    const ok = await runBulkDownload(t => { note.textContent = t; });
    if (ok) m.close(); else dlBtn.disabled = false;
  });
  m.foot.append(
    h('button', { text: 'Close', onclick: () => m.close() }), dlBtn,
    h('button', { text: 'Choose file…', onclick: () => { m.close(); $('#fileCards').click(); } })
  );
}

// ---------------------------------------------------------------- deck stats (exact hypergeometric math)
function comb(n, k) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let r = 1;
  for (let i = 1; i <= k; i++) r = r * (n - k + i) / i;
  return r;
}
const pmf = (N, K, n, k) => comb(K, k) * comb(N - K, n - k) / comb(N, n);
function atLeast(N, K, n, t) {
  if (n > N) n = N;
  let s = 0;
  for (let k = t; k <= Math.min(K, n); k++) s += pmf(N, K, n, k);
  return Math.min(1, s);
}
const pct = x => (x * 100).toFixed(1) + '%';

function openStats() {
  const deck = getCurrentDeck();
  if (!deck || !deck.main.length) { alert('Import a deck first.'); return; }
  const m = modal(`Deck view: ${deck.name}`, { width: 1240 });
  m.el.classList.add('deckview');
  const N = sum(deck.main);
  const COLS = { W: '#f3ecc3', U: '#9ec8ee', B: '#9a8f99', R: '#ec8f78', G: '#8cc79a' };
  const toCard = ({ qty, name }) => {
    const rec = resolve(name);
    const front = rec && rec.t ? rec.t.split(' // ')[0] : '';
    const isLand = rec ? !!rec.land : BASIC_LANDS.has(norm(name));
    let type = 'Unknown';
    if (isLand) type = 'Land';
    else if (rec) type = ['Creature', 'Planeswalker', 'Battle', 'Instant', 'Sorcery', 'Artifact', 'Enchantment'].find(x => front.includes(x)) || 'Other';
    return { qty, name: rec ? rec.name : name, rec, isLand, type, mv: rec ? rec.cmc : 0 };
  };
  const cards = deck.main.map(toCard), side = (deck.side || []).map(toCard);
  const L = sum(cards.filter(c => c.isLand)), unknown = sum(cards.filter(c => !c.rec));
  const spells = cards.filter(c => !c.isLand && c.rec), spellN = sum(spells);
  const avgMv = spellN ? spells.reduce((a, c) => a + c.mv * c.qty, 0) / spellN : 0;
  const body = m.body;
  if (unknown) body.append(h('p', { class: 'bad small', text: `${unknown} card${unknown === 1 ? '' : 's'} have no card data, so types and costs for them are unknown. Use Tools → Images… or Card data… to fill them in.` }));

  // ---- header: name, counts, colours, curve
  const typeCounts = {}; for (const c of cards) typeCounts[c.type] = (typeCounts[c.type] || 0) + c.qty;
  const pips = { W: 0, U: 0, B: 0, R: 0, G: 0 }, prodSrc = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  for (const c of spells) for (const mm of (c.rec.mc || '').matchAll(/\{([^}]+)\}/g)) for (const ch of mm[1].split('/')) if (ch in pips) pips[ch] += c.qty;
  for (const c of cards) if (c.isLand) for (const col of landManaColors({ name: c.name })) if (col in prodSrc) prodSrc[col] += c.qty;
  const curve = new Array(8).fill(0);
  for (const c of spells) curve[Math.min(7, Math.floor(c.mv))] += c.qty;
  const mx = Math.max(1, ...curve);
  const chip = (txt, cls, tip) => h('span', { class: 'dv-chip ' + (cls || ''), text: txt, title: tip || '' });
  const colourRow = h('div', { class: 'dv-row' }, ...Object.keys(pips).filter(k => pips[k] || prodSrc[k]).map(k => h('span', { class: 'dv-col', style: `background:${COLS[k]}` }, h('b', { text: k }), h('span', { text: ` ${pips[k]} symbols · ${prodSrc[k]} sources` }))));
  const typeRow = h('div', { class: 'dv-row' }, ...['Land', 'Creature', 'Planeswalker', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Battle', 'Other', 'Unknown'].filter(t => typeCounts[t]).map(t => chip(`${t} ${typeCounts[t]}`, t === 'Land' ? 'land' : '')));
  const curveEl = h('div', { class: 'dv-curve', title: 'Mana value of spells (lands excluded)' },
    ...curve.map((n, i) => h('div', { class: 'dv-bar' }, h('span', { class: 'dv-n', text: n || '' }), h('div', { class: 'dv-fill', style: `height:${Math.round(n / mx * 70)}px` }), h('span', { class: 'dv-x', text: i === 7 ? '7+' : String(i) }))));
  body.append(h('div', { class: 'dv-head' },
    h('div', { class: 'dv-title' }, h('div', { class: 'dv-name', text: deck.name }), h('div', { class: 'muted', text: `${N} main · ${sum(side)} sideboard · ${L} lands (${pct(L / N)}) · ${N - L} spells · average spell mana value ${avgMv.toFixed(2)}` }), colourRow, typeRow),
    curveEl));

  // ---- stacks
  const big = h('div', { class: 'dv-big' });
  const showBig = c => { const im = imgFor(c.name); big.replaceChildren(im ? h('img', { src: im.front, alt: c.name }) : h('div', { class: 'dv-bigtxt' }, h('b', { text: c.name }), h('div', { text: (c.rec && c.rec.mc) || '' }), h('div', { class: 'muted', text: (c.rec && c.rec.t) || '' }), h('div', { class: 'small', text: (c.rec && c.rec.tx) || 'No card data' }))); };
  const face = c => {
    const im = showImages ? imgFor(c.name) : null;
    const f = h('div', { class: 'dv-card' + (im ? ' hasimg' : '') });
    if (im) { const img = h('img', { src: im.front, alt: c.name, draggable: 'false' }); img.addEventListener('error', () => { img.remove(); f.classList.remove('hasimg'); f.append(h('span', { class: 'dv-fn', text: c.name })); }); f.append(img); }
    else f.append(h('span', { class: 'dv-fn', text: c.name }), h('span', { class: 'dv-fc', text: (c.rec && c.rec.mc) || '' }), h('span', { class: 'dv-ft', text: (c.rec && c.rec.t) || '' }));
    return f;
  };
  const stack = c => {
    const el = h('div', { class: 'dv-stack', title: `${c.qty} × ${c.name}` });
    for (let i = 0; i < c.qty; i++) { const f = face(c); f.style.top = (i * 22) + 'px'; f.style.zIndex = i + 1; el.append(f); }
    el.style.height = (22 * (c.qty - 1) + 190) + 'px';
    el.append(h('span', { class: 'dv-qty', text: '×' + c.qty }));
    el.addEventListener('mouseenter', () => showBig(c));
    return el;
  };
  const groupDefs = [['Creatures', ['Creature']], ['Planeswalkers & Battles', ['Planeswalker', 'Battle']], ['Instants & Sorceries', ['Instant', 'Sorcery']], ['Artifacts', ['Artifact']], ['Enchantments', ['Enchantment']], ['Other / unknown', ['Other', 'Unknown']], ['Lands', ['Land']]];
  const groupEl = (title, list) => {
    const n = sum(list); if (!n) return null;
    const sorted = [...list].sort((a, b) => a.mv - b.mv || a.name.localeCompare(b.name));
    return h('div', { class: 'dv-group' }, h('div', { class: 'dv-gh', text: `${title} (${n})` }), h('div', { class: 'dv-stacks' }, ...sorted.map(stack)));
  };
  const mainEl = h('div', { class: 'dv-main' }, ...groupDefs.map(([t, types]) => groupEl(t, cards.filter(c => types.includes(c.type)))).filter(Boolean), side.length ? Object.assign(groupEl('Sideboard', side), { className: 'dv-group dv-sidegroup' }) : null);
  const sideEl = side.length ? h('div', { class: 'dv-side' }, h('div', { class: 'dv-gh', text: `Sideboard (${sum(side)})` }), h('div', { class: 'dv-stacks' }, ...[...side].sort((a, b) => a.mv - b.mv || a.name.localeCompare(b.name)).map(stack))) : null;
  body.append(h('div', { class: 'dv-layout' }, h('div', { class: 'dv-left' }, mainEl), big));
  big.append(h('div', { class: 'muted small', text: 'Hover a stack to read the card.' }));

  // ---- odds (collapsed)
  const odds = h('details', { class: 'dv-odds' }, h('summary', { text: 'Draw odds and land counts' }));
  const box = h('div', { class: 'stats' });
  odds.append(box); body.append(odds);
  (function () {
    const body = box;
    const cardsAll = cards;
    const cardsRef = cardsAll;
    const cards2 = cardsRef;
    void cards2;
  // Opening hand land distribution
  const minIn = h('input', { type: 'number', value: 2, min: 0, max: 7 });
  const maxIn = h('input', { type: 'number', value: 5, min: 0, max: 7 });
  const distBox = h('div');
  const keepLine = h('p');
  function drawDist() {
    const lo = parseInt(minIn.value, 10), hi = parseInt(maxIn.value, 10);
    distBox.replaceChildren();
    const rows = [h('tr', null, h('th', { text: 'Lands in opening 7' }), h('th', { text: 'Chance' }), h('th', { text: '' }))];
    let keep = 0;
    for (let k = 0; k <= 7; k++) {
      const p = pmf(N, L, 7, k);
      if (k >= lo && k <= hi) keep += p;
      rows.push(h('tr', null, h('td', { text: String(k) }), h('td', { text: pct(p) }), h('td', null, h('span', { class: 'bar', style: `width:${Math.round(p * 300)}px` }))));
    }
    distBox.append(h('table', { class: 'stats' }, rows));
    keepLine.replaceChildren(`Keepable 7-card hand (${lo}–${hi} lands): `, h('b', { text: pct(keep) }));
  }
  minIn.addEventListener('input', drawDist); maxIn.addEventListener('input', drawDist);
  body.append(h('h4', { text: 'Opening hand' }), h('div', null, 'Keep with ', minIn, ' to ', maxIn, ' lands'), keepLine, distBox);
  drawDist();

  // Land drops
  const ld = [h('tr', null, h('th', { text: 'Turn' }), h('th', { text: 'On the play' }), h('th', { text: 'On the draw' }))];
  for (let t = 1; t <= 7; t++) {
    ld.push(h('tr', null, h('td', { text: `T${t}: ≥ ${t} lands` }), h('td', { text: pct(atLeast(N, L, 7 + t - 1, t)) }), h('td', { text: pct(atLeast(N, L, 7 + t, t)) })));
  }
  body.append(h('h4', { text: 'Hitting land drops (no mulligans)' }), h('table', { class: 'stats' }, ld));

  // Find a card
  const q = h('input', { type: 'text', placeholder: 'e.g. Scion of Draco, Leyline of the Guildpact', style: 'width:100%' });
  const findBox = h('div');
  function drawFind() {
    findBox.replaceChildren();
    const want = q.value.split(',').map(s => norm(s)).filter(Boolean);
    if (!want.length) return;
    let K = 0; const matched = [];
    for (const c of cards) {
      if (want.includes(norm(c.name)) || (c.rec && c.rec.faces && c.rec.faces.some(f => want.includes(norm(f))))) { K += c.qty; matched.push(`${c.qty} ${c.name}`); }
    }
    if (!K) { findBox.append(h('p', { class: 'bad', text: 'None of those names are in your main deck.' })); return; }
    const rows = [h('tr', null, h('th', { text: 'By turn' }), h('th', { text: 'On the play' }), h('th', { text: 'On the draw' }))];
    rows.push(h('tr', null, h('td', { text: 'Opening hand' }), h('td', { text: pct(atLeast(N, K, 7, 1)) }), h('td', { text: pct(atLeast(N, K, 7, 1)) })));
    for (let t = 1; t <= 8; t++) {
      rows.push(h('tr', null, h('td', { text: `Turn ${t}` }), h('td', { text: pct(atLeast(N, K, 7 + t - 1, 1)) }), h('td', { text: pct(atLeast(N, K, 7 + t, 1)) })));
    }
    findBox.append(h('p', { class: 'muted small', text: 'Counting: ' + matched.join(', ') + ` (${K} copies). Chance of seeing at least one.` }), h('table', { class: 'stats' }, rows));
  }
  q.addEventListener('input', drawFind);
  body.append(h('h4', { text: 'Find a card' }), q, findBox);


  // Mana sources
  const src = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  for (const c of cards) if (c.isLand && c.rec && c.rec.prod) for (const col of c.rec.prod) if (col in src) src[col] += c.qty;
  if (Object.values(src).some(Boolean)) {
    body.append(h('h4', { text: 'Land mana sources' }),
      h('p', { class: 'muted small', text: 'Counts lands that list the colour as produced mana. Fetchlands produce no mana, so they are not counted.' }),
      h('table', { class: 'stats' }, h('tr', null, ...Object.keys(src).map(k => h('th', { text: k }))), h('tr', null, ...Object.values(src).map(v => h('td', { text: String(v) })))));
  }

  })();
  m.foot.append(h('button', { class: 'primary', text: 'Close', onclick: () => m.close() }));
}

// ---------------------------------------------------------------- fetch lands
const BASIC_TYPES = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'];
const FETCH_FALLBACK = {
  'wooded foothills': 'Mountain Forest', 'flooded strand': 'Plains Island', 'arid mesa': 'Mountain Plains',
  'bloodstained mire': 'Swamp Mountain', 'verdant catacombs': 'Swamp Forest', 'polluted delta': 'Island Swamp',
  'windswept heath': 'Forest Plains', 'marsh flats': 'Plains Swamp', 'scalding tarn': 'Island Mountain',
  'misty rainforest': 'Forest Island'
};
const LAND_TYPES_FALLBACK = {
  'blood crypt': 'Swamp Mountain', 'stomping ground': 'Mountain Forest', 'overgrown tomb': 'Swamp Forest',
  'temple garden': 'Forest Plains', 'breeding pool': 'Forest Island', 'hallowed fountain': 'Plains Island',
  'steam vents': 'Island Mountain', 'watery grave': 'Island Swamp', 'godless shrine': 'Plains Swamp', 'sacred foundry': 'Mountain Plains',
  'indatha triome': 'Plains Swamp Forest', 'raugrin triome': 'Island Mountain Plains', 'ketria triome': 'Forest Island Mountain',
  'savai triome': 'Swamp Mountain Plains', 'zagoth triome': 'Swamp Forest Island'
};
const SHOCKS = new Set(['blood crypt', 'stomping ground', 'overgrown tomb', 'temple garden', 'breeding pool', 'hallowed fountain', 'steam vents', 'watery grave', 'godless shrine', 'sacred foundry']);
const ALL_TYPES_NAMES = new Set(['leyline of the guildpact', 'dryad of the ilysian grove', 'prismatic omen']);

function fetchInfo(c) {
  if (!c || c.token) return null;
  const info = cardInfo(c.name);
  const k = norm(c.name);
  const m = info && info.tx && info.tx.match(/search your library for an? (.+?) card/i);
  if (m && /sacrifice/i.test(info.tx) && info.land) {
    const types = (m[1].match(/Plains|Island|Swamp|Mountain|Forest/g) || []);
    const basic = /basic land/i.test(m[1]);
    if (types.length || basic) return { types: basic ? BASIC_TYPES : types, basicOnly: basic, life: /pay 1 life/i.test(info.tx), tapped: /enters tapped|onto the battlefield tapped/i.test(info.tx) };
  }
  if (FETCH_FALLBACK[k]) return { types: FETCH_FALLBACK[k].split(' '), basicOnly: false, life: true, tapped: false };
  return null;
}

function baseLandTypesOf(name) {
  const k = norm(name);
  const info = cardInfo(name);
  if (info && info.land) {
    const after = info.t.split(' // ')[0].split('—')[1] || '';
    const t = after.match(/Plains|Island|Swamp|Mountain|Forest/g) || [];
    return { types: t, basic: /\bBasic\b/.test(info.t) };
  }
  if (LAND_TYPES_FALLBACK[k]) return { types: LAND_TYPES_FALLBACK[k].split(' '), basic: false };
  const b = BASIC_TYPES.find(x => x.toLowerCase() === k.replace(/^snow-covered /, ''));
  if (b) return { types: [b], basic: true };
  return { types: null, basic: false };
}

// Battlefield-wide land-type effects. These are evaluated from permanents
// currently on the battlefield, so the effect updates immediately when the
// source enters/leaves play.
function landTypeEffects() {
  const all = new Set();
  let bloodMoon = false;
  if (!state) return { all: false, add: [], override: false };
  for (const c of state.battlefield) {
    const n = norm(c.name);
    const tx = cardText(c);
    if (n === 'leyline of the guildpact' || n === 'dryad of the ilysian grove' || n === 'prismatic omen' ||
        /(?:each land|lands) you control (?:is|are) every basic land type/i.test(tx) || /\b(?:each|all) lands? (?:is|are) every basic land type/i.test(tx)) {
      BASIC_TYPES.forEach(t => all.add(t));
    }
    if (n === 'urborg, tomb of yawgmoth' || /each land is a swamp/i.test(tx)) all.add('Swamp');
    if (n === 'yavimaya, cradle of growth' || /each land is a forest/i.test(tx)) all.add('Forest');
    if (n === 'blood moon' || n === 'magus of the moon' || /nonbasic lands are mountains/i.test(tx)) bloodMoon = true;
  }
  return { all: all.size === 5, add: [...all], override: bloodMoon };
}

function effectiveLandTypes(c) {
  const base = baseLandTypesOf(c.name);
  if (!base.types) return { types: [], basic: false, override: false };
  const fx = landTypeEffects();
  const nonbasic = !base.basic;
  if (fx.override && nonbasic) return { types: ['Mountain'], basic: false, override: true };
  const types = [...new Set([...base.types, ...fx.add])];
  return { types, basic: base.basic, override: false };
}

function landTypesOf(name) {
  return effectiveLandTypes({name});
}

function domainTypeList() {
  if (!state) return [];
  if (domainAllTypes()) return [...BASIC_TYPES];
  const types = new Set();
  for (const c of state.battlefield) {
    if (!isLandName(c.name)) continue;
    const lt = landTypesOf(c.name);
    if (lt.types) for (const t of lt.types) if (BASIC_TYPES.includes(t)) types.add(t);
  }
  return [...types];
}
function domainCount() {
  if (!state) return 0;
  if (domainAllTypes()) return 5;
  const types = new Set();
  for (const c of state.battlefield) {
    if (!isLandName(c.name)) continue;
    const lt = landTypesOf(c.name);
    if (lt.types) for (const t of lt.types) if (BASIC_TYPES.includes(t)) types.add(t);
  }
  return types.size;
}
function domainAllTypes() {
  return !!state && landTypeEffects().all;
}

// A card in the LIBRARY has only its printed land types. Leyline of the Guildpact, Dryad of the Ilysian Grove,
// Prismatic Omen, Urborg, Yavimaya and Blood Moon only change lands on the battlefield, so they never
// widen or narrow what a fetch land can find.
function canFetch(name, fi) {
  if (!isLandName(name)) return false;
  const lt = baseLandTypesOf(name);
  if (!lt.types) return false;
  if (fi.basicOnly) return !!lt.basic;
  return lt.types.some(t => fi.types.includes(t));
}

function fetchLand(fetchId, targetId, opts) {
  const f = findCard(fetchId);
  if (!f || f.zone !== 'battlefield') return;
  if (f.card.tapped) { toast('Cannot fetch', 'Fetch lands have {T} in their cost, so the land must be untapped.'); return; }
  const fi = fetchInfo(f.card);
  snap();
  const fc = f.card;
  leaveBattlefield(fc, 'graveyard');
  let msg = `${fc.name}: sacrificed`;
  if (fi && fi.life) { state.life--; msg += ', paid 1 life'; }
  if (targetId) {
    const i = state.library.findIndex(c => c.id === targetId);
    if (i >= 0) {
      const [t] = state.library.splice(i, 1);
      const info = cardInfo(t.name);
      const tx = info ? info.tx : '';
      const k = norm(t.name);
      const shock = SHOCKS.has(k) || /pay 2 life/i.test(tx);
      let tp = shock ? false : etbTapped(t).tapped;   // the shockland question is asked as it enters
      if (fi && fi.tapped) {
        tp = true; msg += ', put onto the battlefield tapped';
        const um = cardText(fc).match(/if you control (\w+) or more lands, untap that land/i);
        const need = um && ({ three: 3, four: 4, five: 5 })[um[1].toLowerCase()];
        if (need && state.battlefield.filter(x => isLandName(x.name)).length + 1 >= need) { tp = false; msg += ' then untapped it (you control enough lands)'; }
      }
      enterBattlefield(t, { from: 'library', tapped: tp });
      msg += ` → fetched ${t.name}${t.tapped ? ' (tapped)' : ''}`;
    }
  } else msg += ', found nothing';
  shuffle(state.library);
  log(msg + '; shuffled');
  render();
  flushTriggers();
}

function openFetch(c) {
  if (!state) return;
  const fi = fetchInfo(c);
  if (!fi) return;
  const all = domainAllTypes();   // only used for the explanatory note below
  const m = modal(`${c.name}: search your library`, { width: 760 });
  const hideChk = h('input', { type: 'checkbox' });
  const groups = new Map();
  for (const x of state.library) { const g = groups.get(x.name) || { name: x.name, ids: [] }; g.ids.push(x.id); groups.set(x.name, g); }
  const list = [...groups.values()].map(g => ({ ...g, ok: canFetch(g.name, fi), land: isLandName(g.name) }));
  const out = h('div');
  const draw = () => {
    out.replaceChildren();
    const sec = (label, items, cls) => {
      if (!items.length) return;
      out.append(h('div', { class: 'fhead', text: label }));
      const grid = h('div', { class: 'fetchgrid' });
      for (const it of items) {
        const lt = baseLandTypesOf(it.name);   // printed types: what the card is while it is in the library
        const row = h('div', { class: 'frow ' + cls, title: it.ok ? 'Click to fetch' : '' },
          h('span', { class: 'q', text: it.ids.length + '×' }),
          h('span', { class: 'nm', text: it.name }),
          h('span', { class: 'ty', text: it.land && lt.types ? lt.types.join(' ') : '' }));
        if(teach('libraryPreview')) row.addEventListener('mouseenter',()=>showPreview(state.library.find(x=>x.id===it.ids[0]) || {name:it.name}));
        if (it.ok) row.addEventListener('click', () => { m.close(); fetchLand(c.id, it.ids[0], {}); });
        grid.append(row);
      }
      out.append(grid);
    };
    const byName = (a, b) => a.name.localeCompare(b.name);
    sec(`Can fetch (${list.filter(x => x.ok).length})`, list.filter(x => x.ok).sort(byName), 'on');
    if (!hideChk.checked) {
      sec('Other lands', list.filter(x => !x.ok && x.land).sort(byName), 'off');
      sec('Other cards', list.filter(x => !x.ok && !x.land).sort(byName), 'off');
    }
  };
  hideChk.addEventListener('change', draw);
  const what = fi.basicOnly ? 'a basic land' : fi.types.join(' or ') + ' card';
  m.body.append(
    h('div', { class: 'small muted', text: `Search for ${what}${all ? ' (Leyline / Dryad / Prismatic Omen only changes lands on the battlefield, so lands in your library still have just their printed types)' : ''}. Click a highlighted land to put it onto the battlefield.` }),
    h('div', { style: 'margin-top:6px;display:flex;gap:16px;flex-wrap:wrap' },
      h('div', { class: 'muted small', text: 'A fetched shockland asks whether to pay 2 life as it enters; surveil lands run their surveil.' }),
      h('label', { class: 'chk' }, hideChk, ' Hide cards that cannot be fetched')),
    out);
  draw();
  m.foot.append(
    h('button', { text: 'Sacrifice, find nothing', onclick: () => { m.close(); fetchLand(c.id, null, {}); } }),
    h('button', { class: 'primary', text: 'Cancel', onclick: () => m.close() }));
}

// ---------------------------------------------------------------- sound effects (v0.51)
// Everything is synthesised with the Web Audio API, so there are no audio files and it works offline.
const SOUND_DEFS = [
  ['draw', 'Drawing a card', 'A soft card swish'],
  ['cast', 'Casting a spell', 'A rising magical sweep as the spell goes on the stack'],
  ['enter', 'Entering the battlefield', 'A low thump when a permanent or token arrives'],
  ['land', 'Playing a land', 'A wooden clack'],
  ['resolve', 'A spell or ability resolving', 'A small chime'],
  ['counter', 'A spell being countered', 'A falling tone']
];
let audioCtx = null, reverbNode = null; const lastSnd = {};
// A shared soft room reverb: a generated impulse (decaying stereo noise), so no audio files are needed.
function reverbIn(ac) {
  if (reverbNode && reverbNode.context === ac) return reverbNode;
  const len = Math.floor(ac.sampleRate * 2.4), buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
  const cv = ac.createConvolver(); cv.buffer = buf;
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
  cv.connect(lp); lp.connect(ac.destination); reverbNode = cv; return cv;
}
function audio() {
  try { if (!audioCtx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; audioCtx = new AC(); } if (audioCtx.state === 'suspended') audioCtx.resume(); return audioCtx; } catch (e) { return null; }
}
function sfx(kind) {
  try {
    const so = settings.sound; if (!so || !so.on || so[kind] === false || !state) return;
    const now = performance.now(); if (lastSnd[kind] && now - lastSnd[kind] < 60) return; lastSnd[kind] = now;
    const ac = audio(); if (!ac) return;
    const t0 = ac.currentTime, vol = Math.max(0, Math.min(1, so.vol === undefined ? 0.5 : so.vol));
    const out = ac.createGain(); out.gain.value = vol * 0.5; out.connect(ac.destination);
    const wet = ac.createGain(); wet.gain.value = 0.55; out.connect(wet); wet.connect(reverbIn(ac));   // soft reverb on every effect
    const tone = (type, f1, f2, start, dur, peak, atk) => {
      const o = ac.createOscillator(), g = ac.createGain(); o.type = type;
      o.frequency.setValueAtTime(f1, t0 + start); if (f2 !== f1) o.frequency.exponentialRampToValueAtTime(f2, t0 + start + dur);
      g.gain.setValueAtTime(0.0001, t0 + start); g.gain.exponentialRampToValueAtTime(peak, t0 + start + (atk || 0.01)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
      o.connect(g); g.connect(out); o.start(t0 + start); o.stop(t0 + start + dur + 0.02);
    };
    const noise = (start, dur, f1, f2, q, peak) => {
      const len = Math.max(1, Math.floor(ac.sampleRate * dur)), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ac.createBufferSource(); src.buffer = buf;
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q; f.frequency.setValueAtTime(f1, t0 + start); f.frequency.exponentialRampToValueAtTime(f2, t0 + start + dur);
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t0 + start); g.gain.exponentialRampToValueAtTime(peak, t0 + start + dur * 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
      src.connect(f); f.connect(g); g.connect(out); src.start(t0 + start); src.stop(t0 + start + dur + 0.02);
    };
    if (kind === 'draw') { noise(0, 0.12, 1800, 5200, 1.2, 0.9); tone('sine', 900, 1400, 0.02, 0.06, 0.05); }
    else if (kind === 'cast') { noise(0, 0.5, 260, 700, 0.6, 0.22); tone('sine', 196, 247, 0, 0.55, 0.22, 0.14); tone('sine', 294, 370, 0.05, 0.55, 0.08, 0.16); }
    else if (kind === 'enter') { tone('sine', 150, 50, 0, 0.22, 0.9); noise(0, 0.07, 700, 300, 0.8, 0.5); }
    else if (kind === 'land') { tone('square', 220, 120, 0, 0.05, 0.25); noise(0, 0.05, 1800, 900, 1.5, 0.7); tone('sine', 140, 80, 0.01, 0.12, 0.5); }
    else if (kind === 'resolve') { tone('sine', 880, 880, 0, 0.18, 0.3); tone('sine', 1320, 1320, 0.07, 0.25, 0.25); }
    else if (kind === 'counter') { tone('sawtooth', 520, 90, 0, 0.3, 0.3); noise(0, 0.12, 900, 200, 1, 0.3); }
  } catch (e) { /* sound is never allowed to break the game */ }
}


// ---- background music: an endless, generated ambient loop (slow pad chords with a few soft bell notes)
const MUSIC_CHORDS = [[45, 57, 60, 64], [41, 57, 60, 65], [48, 55, 60, 64], [43, 55, 59, 62]];   // Am  F  C  G
const MUSIC_BELLS = [69, 72, 74, 76, 79, 81];
const midiHz = m => 440 * Math.pow(2, (m - 69) / 12);
let music = null;
function musicVolume() { return Math.max(0, Math.min(1, settings.sound.musicVol === undefined ? 0.4 : settings.sound.musicVol)) * 0.22; }
function startMusic() {
  if (music || !settings.sound.on || !settings.sound.music) return;
  const ac = audio(); if (!ac) return;
  const bus = ac.createGain(); bus.gain.value = 0.0001; bus.gain.linearRampToValueAtTime(musicVolume() || 0.0001, ac.currentTime + 3);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; bus.connect(lp); lp.connect(ac.destination);
  const wet = ac.createGain(); wet.gain.value = 0.9; lp.connect(wet); wet.connect(reverbIn(ac));
  const M = { bus, ac, next: ac.currentTime + 0.3, i: 0, timer: null }; music = M;
  const CH = 10;   // seconds per chord
  const note = (hz, t, dur, peak, atk, type) => {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = hz;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + atk); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.05);
  };
  const chord = t => {
    for (const m of MUSIC_CHORDS[M.i % MUSIC_CHORDS.length]) { const hz = midiHz(m); note(hz, t, CH + 3, 0.16, 3.5, 'sine'); note(hz * 1.004, t, CH + 3, 0.08, 3.5, 'triangle'); }
    let bt = t + 1 + Math.random() * 1.5;
    while (bt < t + CH - 1) { if (Math.random() < 0.75) note(midiHz(MUSIC_BELLS[Math.floor(Math.random() * MUSIC_BELLS.length)]), bt, 3.2, 0.05, 0.02, 'sine'); bt += 2 + Math.random() * 3; }
    M.i++;
  };
  M.timer = setInterval(() => { try { while (M.next < ac.currentTime + 3) { chord(M.next); M.next += CH; } } catch (e) {} }, 500);
}
function stopMusic() {
  if (!music) return; const M = music; music = null; clearInterval(M.timer);
  try { M.bus.gain.cancelScheduledValues(M.ac.currentTime); M.bus.gain.setValueAtTime(M.bus.gain.value, M.ac.currentTime); M.bus.gain.linearRampToValueAtTime(0.0001, M.ac.currentTime + 1.2); setTimeout(() => { try { M.bus.disconnect(); } catch (e) {} }, 1500); } catch (e) {}
}
function musicSettingsChanged() { if (settings.sound.on && settings.sound.music) { if (music) { try { music.bus.gain.setTargetAtTime(musicVolume() || 0.0001, music.ac.currentTime, 0.2); } catch (e) {} } else startMusic(); } else stopMusic(); }
// browsers only allow audio after a click or key press, so the music begins on the first one
let parRaf = 0;
document.addEventListener('mousemove', e => {
  if (document.body.dataset.matmotion !== 'parallax' || parRaf) return;
  parRaf = requestAnimationFrame(() => { parRaf = 0; const m = document.getElementById('mat'); if (!m) return;
    m.style.setProperty('--mx', ((e.clientX / innerWidth - 0.5) * -2).toFixed(3)); m.style.setProperty('--my', ((e.clientY / innerHeight - 0.5) * -2).toFixed(3)); });
});
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => { if (!music) startMusic(); }, { capture: true }));
// ---------------------------------------------------------------- mouse cursor (v0.53)
// Cursors are small SVG pictures made here (no files). Each style has a normal and a "hover" picture for clickable things.
const MANA_ORB = { W: ['#fffbe0', '#e8dfa8'], U: ['#8ec5ff', '#2f6fc4'], B: ['#a58cc0', '#3e2c52'], R: ['#ff9a7a', '#c23a22'], G: ['#8fe0a0', '#2f8a48'] };
const CURSOR_STYLES = [['default', 'Standard arrow'], ['gold', 'Gold arrow'], ['wand', 'Magic wand'], ['sword', 'Sword'], ['orb-W', 'Mana orb — white'], ['orb-U', 'Mana orb — blue'], ['orb-B', 'Mana orb — black'], ['orb-R', 'Mana orb — red'], ['orb-G', 'Mana orb — green'], ['custom', 'My own image…']];
function cursorSvg(style, hover) {   // returns { body, hx, hy } on a 32×32 canvas
  if (style === 'gold') return { hx: 4, hy: 3, body: `<path d="M4 3 L4 24 L10 18.5 L14.5 28 L18 26.5 L13.5 17.5 L21 17 Z" fill="${hover ? '#fff3c4' : '#e3b95c'}" stroke="${hover ? '#b88a1e' : '#3a2b0a'}" stroke-width="1.8" stroke-linejoin="round"/>${hover ? '<circle cx="26" cy="6" r="2.4" fill="#ffe27a"/>' : ''}` };
  if (style === 'wand') return { hx: 8, hy: 8, body: `<g transform="translate(3 3) scale(.9)"><circle cx="5" cy="5" r="${hover ? 7 : 6}" fill="rgba(255,226,122,${hover ? .45 : .28})"/><line x1="9" y1="9" x2="28" y2="28" stroke="#2a1a0a" stroke-width="5.2" stroke-linecap="round"/><line x1="9" y1="9" x2="28" y2="28" stroke="#7a4e22" stroke-width="3.4" stroke-linecap="round"/><line x1="12" y1="12" x2="14.5" y2="14.5" stroke="#e3b95c" stroke-width="3.4"/><g transform="translate(5 5) scale(${hover ? 1.15 : .9}) translate(-5 -5)"><path d="M5 -2 L6.7 3.3 L12 5 L6.7 6.7 L5 12 L3.3 6.7 L-2 5 L3.3 3.3 Z" fill="#ffe27a" stroke="#fff" stroke-width=".8"/></g></g>` };
  if (style === 'sword') return { hx: 3, hy: 3, body: `${hover ? '<line x1="3" y1="3" x2="19" y2="19" stroke="rgba(150,210,255,.55)" stroke-width="8" stroke-linecap="round"/>' : ''}<line x1="3" y1="3" x2="19" y2="19" stroke="#1b2026" stroke-width="5.4" stroke-linecap="round"/><line x1="3.6" y1="3.6" x2="19" y2="19" stroke="${hover ? '#ffffff' : '#dfe6ee'}" stroke-width="3" stroke-linecap="round"/><line x1="15" y1="24" x2="24" y2="15" stroke="#1b2026" stroke-width="5" stroke-linecap="round"/><line x1="15" y1="24" x2="24" y2="15" stroke="#e3b95c" stroke-width="3" stroke-linecap="round"/><line x1="21.5" y1="21.5" x2="27" y2="27" stroke="#2a1a0a" stroke-width="5" stroke-linecap="round"/><line x1="21.5" y1="21.5" x2="27" y2="27" stroke="#7a4e22" stroke-width="3" stroke-linecap="round"/><circle cx="28.5" cy="28.5" r="2.2" fill="#e3b95c"/>` };
  const m = /^orb-([WUBRG])$/.exec(style);
  if (m) { const [c1, c2] = MANA_ORB[m[1]], r = hover ? 9.5 : 7.5; return { hx: 16, hy: 16, body: `<defs><radialGradient id="g${m[1]}" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient></defs>${hover ? `<circle cx="16" cy="16" r="13.5" fill="${c2}" opacity=".35"/>` : ''}<circle cx="16" cy="16" r="${r}" fill="url(#g${m[1]})" stroke="rgba(0,0,0,.65)" stroke-width="1.6"/><circle cx="13.5" cy="13" r="2" fill="rgba(255,255,255,.6)"/>` }; }
  return null;
}
let cursorStyleEl = null;
function applyCursor() {
  if (!cursorStyleEl) { cursorStyleEl = document.createElement('style'); cursorStyleEl.id = 'cursorStyle'; document.head.appendChild(cursorStyleEl); }
  const st = settings.cursor || 'default', sz = settings.cursorSize || 32; let css = '';
  const mk = (hover) => {
    if (st === 'custom') { if (!settings.cursorImg) return null; const k = settings.cursorHot === 'center' ? 0.5 : 0; return `url("${settings.cursorImg}") ${Math.round(k * sz)} ${Math.round(k * sz)}`; }
    const d = cursorSvg(st, hover); if (!d) return null; const k = sz / 32;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sz}" height="${sz}" viewBox="0 0 32 32">${d.body}</svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${Math.round(d.hx * k)} ${Math.round(d.hy * k)}`;
  };
  const n = mk(false), hv = mk(true) || n;
  if (n) css = `html, body, body * { cursor: ${n}, default; }
button:not(:disabled), a, select, summary, label, .stack, .card, .swatch, .teachopt, .pimg, .frow, .verbadge, .hudbtn, .playtoggle, .mode-row, .rd-row, .lm-item:not(:disabled), .tgl, .pile, input[type=checkbox], input[type=radio], input[type=range], [role=button] { cursor: ${hv}, pointer !important; }
input[type=text], input[type=number], input[type=search], textarea { cursor: text !important; }`;
  cursorStyleEl.textContent = css;
}
// ---------------------------------------------------------------- built-in sleeves and playmats (v0.56)
// All artwork is drawn here as SVG (no files). Sleeves are 126x176 pictures for the library pile; playmats are 1600x900 backgrounds.
const svgUrl = svg => 'data:image/svg+xml,' + encodeURIComponent(svg);
const SVGNS = 'xmlns="http://www.w3.org/2000/svg"';
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const polar = (cx, cy, r, deg) => [cx + r * Math.cos(deg * Math.PI / 180), cy + r * Math.sin(deg * Math.PI / 180)];
const f1 = n => Math.round(n * 10) / 10;
const WUBRG_COL = ['#f4efd0', '#4a90e2', '#7a5c93', '#e0553a', '#4aa862'];
function stars(R, n, w, h, col, maxr) { let o = ''; for (let i = 0; i < n; i++) o += `<circle cx="${f1(R() * w)}" cy="${f1(R() * h)}" r="${f1(0.4 + R() * maxr)}" fill="${col}" opacity="${f1(0.25 + R() * 0.7)}"/>`; return o; }
const SLEEVE_ART = {
  wheel: () => { const p = [0, 1, 2, 3, 4].map(i => polar(63, 88, 40, -90 + 72 * i)); const star = [0, 2, 4, 1, 3, 0].map(i => p[i].map(f1).join(',')).join(' ');
    return `<defs><radialGradient id="a" cx="50%" cy="45%" r="65%"><stop offset="0" stop-color="#2a3a68"/><stop offset="1" stop-color="#090e1c"/></radialGradient></defs><rect width="126" height="176" fill="url(#a)"/><g transform="translate(0 0)" fill="none" stroke="#e3b95c"><circle cx="63" cy="88" r="50" stroke-width="1.6"/><circle cx="63" cy="88" r="44" stroke-width=".6" opacity=".6"/><circle cx="63" cy="88" r="22" stroke-width="1"/><polyline points="${star}" stroke-width=".9" opacity=".75"/></g>${p.map((q, i) => `<circle cx="${f1(q[0])}" cy="${f1(q[1])}" r="7" fill="${WUBRG_COL[i]}" stroke="#e3b95c" stroke-width="1.2"/>`).join('')}<rect x="4" y="4" width="118" height="168" rx="8" fill="none" stroke="#e3b95c" stroke-width="1.2"/>`; },
  dragon: () => `<defs><pattern id="s" width="16" height="16" patternUnits="userSpaceOnUse"><g fill="#4a0d08" stroke="#9a2a1c" stroke-width=".9"><circle cx="0" cy="0" r="8"/><circle cx="16" cy="0" r="8"/><circle cx="8" cy="8" r="8"/><circle cx="0" cy="16" r="8"/><circle cx="16" cy="16" r="8"/></g></pattern><radialGradient id="g" cx="50%" cy="50%" r="55%"><stop offset="0" stop-color="#000" stop-opacity=".0"/><stop offset="1" stop-color="#000" stop-opacity=".65"/></radialGradient></defs><rect width="126" height="176" fill="url(#s)"/><rect width="126" height="176" fill="url(#g)"/><g transform="translate(63 88)"><path d="M0 -34 L22 0 L0 34 L-22 0Z" fill="#e3b95c" stroke="#3a2205" stroke-width="2"/><ellipse cx="0" cy="0" rx="8" ry="14" fill="#1a0604"/><ellipse cx="0" cy="0" rx="2.2" ry="12" fill="#ff7a2f"/></g><rect x="4" y="4" width="118" height="168" rx="8" fill="none" stroke="#e3b95c" stroke-width="1.2"/>`,
  arcane: () => { const ticks = Array.from({ length: 48 }, (_, i) => { const a = polar(63, 88, 47, i * 7.5), b = polar(63, 88, i % 4 ? 44 : 41, i * 7.5); return `<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}"/>`; }).join('');
    const t1 = [0, 120, 240].map(d => polar(63, 88, 36, d - 90).map(f1).join(',')).join(' '), t2 = [0, 120, 240].map(d => polar(63, 88, 36, d + 90).map(f1).join(',')).join(' ');
    return `<defs><radialGradient id="a" cx="50%" cy="50%" r="70%"><stop offset="0" stop-color="#43256e"/><stop offset="1" stop-color="#120a22"/></radialGradient></defs><rect width="126" height="176" fill="url(#a)"/><g fill="none" stroke="#d9b8ff" stroke-width=".9"><circle cx="63" cy="88" r="48"/><circle cx="63" cy="88" r="37" opacity=".6"/><polygon points="${t1}"/><polygon points="${t2}"/><circle cx="63" cy="88" r="9"/><g stroke-width=".7">${ticks}</g></g><circle cx="63" cy="88" r="3" fill="#ffe27a"/><rect x="4" y="4" width="118" height="168" rx="8" fill="none" stroke="#d9b8ff" stroke-width="1"/>`; },
  forest: () => `<defs><linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b4a2a"/><stop offset="1" stop-color="#08170e"/></linearGradient><pattern id="l" width="22" height="22" patternUnits="userSpaceOnUse"><g fill="#3f9a55" opacity=".35"><ellipse cx="6" cy="6" rx="7" ry="2.6" transform="rotate(40 6 6)"/><ellipse cx="17" cy="16" rx="7" ry="2.6" transform="rotate(-40 17 16)"/></g></pattern></defs><rect width="126" height="176" fill="url(#a)"/><rect width="126" height="176" fill="url(#l)"/><g transform="translate(63 92)"><rect x="-3" y="10" width="6" height="30" fill="#5b3a1a"/><circle cx="0" cy="-6" r="24" fill="#2f8a48" stroke="#a7e5b4" stroke-width="1.4"/><circle cx="-9" cy="-10" r="11" fill="#43a860" opacity=".7"/><circle cx="10" cy="0" r="9" fill="#43a860" opacity=".6"/></g><rect x="4" y="4" width="118" height="168" rx="8" fill="none" stroke="#a7e5b4" stroke-width="1"/>`,
  waves: () => `<defs><linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f5d9a"/><stop offset="1" stop-color="#051c33"/></linearGradient><pattern id="w" width="24" height="14" patternUnits="userSpaceOnUse"><path d="M0 8 Q6 1 12 8 T24 8" fill="none" stroke="#6fc3f0" stroke-width="1" opacity=".55"/></pattern></defs><rect width="126" height="176" fill="url(#a)"/><rect width="126" height="176" fill="url(#w)"/><circle cx="63" cy="70" r="20" fill="#e8f6ff" opacity=".9"/><circle cx="70" cy="66" r="18" fill="#0f5d9a"/><path d="M0 120 Q20 108 40 120 T80 120 T126 118 V176 H0Z" fill="#051c33" opacity=".7"/><rect x="4" y="4" width="118" height="168" rx="8" fill="none" stroke="#9bd8f7" stroke-width="1"/>`,
  ember: () => `<defs><linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a0a0a"/><stop offset="1" stop-color="#7a2a08"/></linearGradient><linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd45c"/><stop offset="1" stop-color="#e0431a"/></linearGradient></defs><rect width="126" height="176" fill="url(#a)"/><path d="M63 34 C98 80 88 122 63 142 C38 122 28 80 63 34Z" fill="url(#f)" stroke="#fff3c4" stroke-width="1"/><path d="M63 78 C77 100 73 120 63 130 C53 120 49 100 63 78Z" fill="#fff3c4" opacity=".85"/><rect x="4" y="4" width="118" height="168" rx="8" fill="none" stroke="#ff9a4a" stroke-width="1"/>`,
  deco: () => `<defs><pattern id="d" width="30" height="30" patternUnits="userSpaceOnUse"><g fill="none" stroke="#e3b95c" stroke-width=".8"><circle cx="0" cy="0" r="9"/><circle cx="0" cy="0" r="15"/><circle cx="0" cy="0" r="21"/><circle cx="30" cy="30" r="9"/><circle cx="30" cy="30" r="15"/><circle cx="30" cy="30" r="21"/></g></pattern></defs><rect width="126" height="176" fill="#0b0b0e"/><rect width="126" height="176" fill="url(#d)" opacity=".8"/><rect x="4" y="4" width="118" height="168" rx="8" fill="none" stroke="#e3b95c" stroke-width="1.6"/><rect x="9" y="9" width="108" height="158" rx="5" fill="none" stroke="#e3b95c" stroke-width=".6"/><path d="M63 62 L82 88 L63 114 L44 88Z" fill="#0b0b0e" stroke="#e3b95c" stroke-width="1.6"/>`,
  star: () => { const R = rng(7); return `<defs><linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1f5e"/><stop offset="1" stop-color="#070a22"/></linearGradient></defs><rect width="126" height="176" fill="url(#a)"/>${stars(R, 60, 126, 176, '#fff', 1)}<path d="M72 56 A32 32 0 1 0 72 120 A25 25 0 1 1 72 56Z" fill="#f4efd0"/><rect x="4" y="4" width="118" height="168" rx="8" fill="none" stroke="#c9d3ff" stroke-width="1"/>`; },
  check: () => `<defs><pattern id="c" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#15151a"/><rect x="10" y="10" width="10" height="10" fill="#15151a"/><rect x="10" width="10" height="10" fill="#26262e"/><rect y="10" width="10" height="10" fill="#26262e"/></pattern></defs><rect width="126" height="176" fill="url(#c)"/><rect x="4" y="4" width="118" height="168" rx="8" fill="none" stroke="#e3b95c" stroke-width="1.6"/><circle cx="63" cy="88" r="24" fill="#15151a" stroke="#e3b95c" stroke-width="2"/><path d="M63 70 L69 88 L63 106 L57 88Z" fill="#e3b95c"/>`
};
const SLEEVES = [['wheel', 'Mana wheel'], ['dragon', 'Dragon scale'], ['arcane', 'Arcane circle'], ['forest', 'Forest'], ['waves', 'Tides'], ['ember', 'Ember'], ['deco', 'Gilded deco'], ['star', 'Night sky'], ['check', 'Checker']];
const MAT_ART = {
  sigil: () => { const p = [0, 1, 2, 3, 4].map(i => polar(800, 450, 300, -90 + 72 * i)), star = [0, 2, 4, 1, 3, 0].map(i => p[i].map(f1).join(',')).join(' ');
    return `<defs><radialGradient id="a" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="#245046"/><stop offset=".55" stop-color="#14261f"/><stop offset="1" stop-color="#08100d"/></radialGradient><pattern id="g" width="80" height="80" patternUnits="userSpaceOnUse"><path d="M80 0H0V80" fill="none" stroke="#fff" stroke-opacity=".035"/></pattern></defs><rect width="1600" height="900" fill="url(#a)"/><rect width="1600" height="900" fill="url(#g)"/><g fill="none" stroke="#e3b95c" stroke-opacity=".3" stroke-width="3"><circle cx="800" cy="450" r="340"/><circle cx="800" cy="450" r="268" stroke-width="1.5"/><polyline points="${star}" stroke-width="2"/></g>${p.map((q, i) => `<circle cx="${f1(q[0])}" cy="${f1(q[1])}" r="26" fill="${WUBRG_COL[i]}" opacity=".4"/>`).join('')}`; },
  lair: () => { const R = rng(11); let em = ''; for (let i = 0; i < 70; i++) em += `<circle cx="${f1(R() * 1600)}" cy="${f1(380 + R() * 520)}" r="${f1(0.8 + R() * 2.4)}" fill="#ff8a3a" opacity="${f1(0.2 + R() * 0.6)}"/>`;
    return `<defs><linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a0606"/><stop offset="1" stop-color="#3a0e08"/></linearGradient><pattern id="s" width="64" height="52" patternUnits="userSpaceOnUse"><g fill="none" stroke="#7a1c12" stroke-opacity=".45" stroke-width="2"><path d="M0 26 Q16 -2 32 26"/><path d="M32 26 Q48 -2 64 26"/><path d="M-32 52 Q-16 24 0 52"/><path d="M0 52 Q16 24 32 52"/><path d="M32 52 Q48 24 64 52"/></g></pattern><radialGradient id="e" cx="50%" cy="110%" r="70%"><stop offset="0" stop-color="#ff6a1a" stop-opacity=".5"/><stop offset="1" stop-color="#ff6a1a" stop-opacity="0"/></radialGradient></defs><rect width="1600" height="900" fill="url(#a)"/><rect width="1600" height="900" fill="url(#s)"/><rect width="1600" height="900" fill="url(#e)"/>${em}`; },
  arcane: () => { const R = rng(23); let rings = '', ticks = ''; for (let r = 120; r <= 420; r += 60) rings += `<circle cx="800" cy="450" r="${r}"/>`;
    for (let i = 0; i < 72; i++) { const a = polar(800, 450, 380, i * 5), b = polar(800, 450, i % 3 ? 366 : 352, i * 5); ticks += `<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}"/>`; }
    return `<defs><radialGradient id="a" cx="50%" cy="50%" r="75%"><stop offset="0" stop-color="#2c1a52"/><stop offset="1" stop-color="#0a0716"/></radialGradient></defs><rect width="1600" height="900" fill="url(#a)"/><g fill="none" stroke="#a07cff" stroke-opacity=".32" stroke-width="2">${rings}<g stroke-width="2.5">${ticks}</g></g>${stars(R, 90, 1600, 900, '#fff', 1.2)}`; },
  ocean: () => { const R = rng(31); let w = ''; const cols = ['#1573b8', '#0f5f9d', '#0c4a80', '#083963', '#052a4a', '#031c33'];
    cols.forEach((c, k) => { const y0 = 250 + k * 110, ph = R() * 6; let d = `M0 ${y0}`; for (let x = 0; x <= 1600; x += 40) d += ` L${x} ${f1(y0 + Math.sin(x / 130 + ph) * 22 + Math.sin(x / 47 + ph * 2) * 6)}`; w += `<path d="${d} V900 H0Z" fill="${c}" opacity=".85"/>`; });
    return `<defs><linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b86cf"/><stop offset="1" stop-color="#03111f"/></linearGradient></defs><rect width="1600" height="900" fill="url(#a)"/>${w}<g fill="#fff" opacity=".05"><polygon points="300,0 420,0 700,900 520,900"/><polygon points="800,0 880,0 1100,900 980,900"/><polygon points="1150,0 1230,0 1450,900 1330,900"/></g>`; },
  dusk: () => { const R = rng(41); let m = ''; const cols = ['#5b3a6e', '#44285a', '#2f1a45', '#1d0f2e']; cols.forEach((c, k) => { const base = 520 + k * 90; let d = `M0 ${base}`; for (let x = 0; x <= 1600; x += 50) d += ` L${x} ${f1(base - 40 - R() * (140 - k * 20))}`; m += `<path d="${d} V900 H0Z" fill="${c}"/>`; });
    return `<defs><linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#241a4a"/><stop offset=".6" stop-color="#b3546a"/><stop offset="1" stop-color="#f0985a"/></linearGradient></defs><rect width="1600" height="900" fill="url(#a)"/><circle cx="1150" cy="470" r="80" fill="#ffd9a0" opacity=".9"/>${stars(R, 40, 1600, 350, '#fff', 1)}${m}`; },
  grove: () => { const R = rng(53); let t = ''; [[560, '#18432a'], [660, '#123a22'], [760, '#0d2e1a'], [900, '#071c10']].forEach(([base, col], k) => { for (let x = -40; x < 1640; x += 60 + R() * 40) { const h = 220 + R() * 160 - k * 20, w = 70 + R() * 40; t += `<polygon points="${f1(x)},${base} ${f1(x + w / 2)},${f1(base - h)} ${f1(x + w)},${base}" fill="${col}"/>`; } });
    let ff = ''; for (let i = 0; i < 40; i++) ff += `<circle cx="${f1(R() * 1600)}" cy="${f1(300 + R() * 500)}" r="${f1(1.2 + R() * 2)}" fill="#e8ff9a" opacity="${f1(0.3 + R() * 0.6)}"/>`;
    return `<defs><linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c4a35"/><stop offset="1" stop-color="#06120b"/></linearGradient></defs><rect width="1600" height="900" fill="url(#a)"/>${t}<g fill="#fff" opacity=".05"><ellipse cx="400" cy="640" rx="500" ry="60"/><ellipse cx="1200" cy="700" rx="520" ry="70"/></g>${ff}`; },
  map: () => `<defs><radialGradient id="a" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#e6d6aa"/><stop offset=".7" stop-color="#c9b585"/><stop offset="1" stop-color="#9c8452"/></radialGradient><pattern id="g" width="100" height="100" patternUnits="userSpaceOnUse"><path d="M100 0H0V100" fill="none" stroke="#6b5430" stroke-opacity=".16"/></pattern></defs><rect width="1600" height="900" fill="url(#a)"/><rect width="1600" height="900" fill="url(#g)"/><g transform="translate(1380 720)" fill="none" stroke="#5a4426" stroke-opacity=".5" stroke-width="3"><circle r="90"/><circle r="64" stroke-width="1.5"/><path d="M0 -150 L16 0 L0 150 L-16 0Z"/><path d="M-150 0 L0 -16 L150 0 L0 16Z" /></g><path d="M120 700 C 380 560 520 760 760 620 S 1100 380 1260 300" fill="none" stroke="#7a2a1a" stroke-opacity=".55" stroke-width="4" stroke-dasharray="14 12"/><g stroke="#7a2a1a" stroke-opacity=".7" stroke-width="6"><line x1="1236" y1="276" x2="1284" y2="324"/><line x1="1284" y1="276" x2="1236" y2="324"/></g>`,
  deco: () => { let fans = ''; [[0, 0], [1600, 0], [0, 900], [1600, 900]].forEach(([x, y]) => { for (let r = 60; r <= 360; r += 40) fans += `<circle cx="${x}" cy="${y}" r="${r}"/>`; });
    return `<defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#101014"/><stop offset="1" stop-color="#050507"/></linearGradient></defs><rect width="1600" height="900" fill="url(#a)"/><g fill="none" stroke="#e3b95c" stroke-opacity=".5" stroke-width="2">${fans}<rect x="60" y="60" width="1480" height="780"/><rect x="80" y="80" width="1440" height="740" stroke-opacity=".3"/><path d="M800 140 L1160 450 L800 760 L440 450Z" stroke-opacity=".4"/></g>`; },
  nebula: () => { const R = rng(67); return `<defs><radialGradient id="p" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#9b3bff" stop-opacity=".55"/><stop offset="1" stop-color="#9b3bff" stop-opacity="0"/></radialGradient><radialGradient id="b" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#1e90ff" stop-opacity=".5"/><stop offset="1" stop-color="#1e90ff" stop-opacity="0"/></radialGradient><radialGradient id="r" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ff4d8d" stop-opacity=".4"/><stop offset="1" stop-color="#ff4d8d" stop-opacity="0"/></radialGradient></defs><rect width="1600" height="900" fill="#05060f"/><ellipse cx="450" cy="300" rx="560" ry="340" fill="url(#p)"/><ellipse cx="1150" cy="560" rx="620" ry="360" fill="url(#b)"/><ellipse cx="850" cy="420" rx="380" ry="220" fill="url(#r)"/>${stars(R, 220, 1600, 900, '#fff', 1.4)}`; },
  storm: () => { const R = rng(79); let c = ''; for (let i = 0; i < 16; i++) c += `<ellipse cx="${f1(R() * 1600)}" cy="${f1(R() * 420)}" rx="${f1(160 + R() * 220)}" ry="${f1(50 + R() * 70)}" fill="${i % 2 ? '#3a4458' : '#262e40'}" opacity=".7"/>`;
    return `<defs><linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c2434"/><stop offset="1" stop-color="#07090f"/></linearGradient><filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="40"/></filter><filter id="s"><feGaussianBlur stdDeviation="4"/></filter></defs><rect width="1600" height="900" fill="url(#a)"/><g filter="url(#b)">${c}</g><polyline points="1010,150 940,330 1010,330 920,560" fill="none" stroke="#bcd8ff" stroke-width="10" opacity=".6" filter="url(#s)"/><polyline points="1010,150 940,330 1010,330 920,560" fill="none" stroke="#fff" stroke-width="3" opacity=".85"/>`; }
};
const MATS = [['sigil', 'Mana sigil'], ['lair', "Dragon's lair"], ['arcane', 'Arcane circle'], ['ocean', 'Ocean depths'], ['dusk', 'Mountain dusk'], ['grove', 'Moonlit grove'], ['map', 'Old map'], ['deco', 'Obsidian & gold'], ['nebula', 'Nebula'], ['storm', 'Storm']];
const artCache = {};
function artUrl(kind, id) {
  const k = kind + ':' + id; if (artCache[k]) return artCache[k];
  const src = (kind === 'sleeve' ? SLEEVE_ART : MAT_ART)[id]; if (!src) return '';
  const vb = kind === 'sleeve' ? '0 0 126 176' : '0 0 1600 900';
  return (artCache[k] = svgUrl(`<svg ${SVGNS} viewBox="${vb}" preserveAspectRatio="xMidYMid slice">${src()}</svg>`));
}
// ---------------------------------------------------------------- deck boxes (v0.57)
// The deck button opens a shelf of 3D deck boxes. Each box shows art cropped from one card of that deck.
const DECKBOX_COL = { W: ['#4b4733', '#d8d1a2'], U: ['#0e2a52', '#3f7fcc'], B: ['#1a1224', '#735a8a'], R: ['#45100a', '#d04a2e'], G: ['#0d2b16', '#43a05b'], '': ['#1d1f23', '#6f747c'] };
function deckColorsOf(deck) {
  const cnt = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const { qty, name } of deck.main) { const i = cardInfo(name); if (!i || !i.mc) continue; for (const m of i.mc.matchAll(/\{([WUBRG])\}|\{([WUBRG])\/[^}]+\}/g)) cnt[m[1] || m[2]] += qty; }
  return Object.entries(cnt).filter(e => e[1] > 0).sort((a, b) => b[1] - a[1]).map(e => e[0]);
}
function deckArtName(deckName, deck) {
  const d = loadDecks()[deckName]; if (d && d.art) return d.art;
  for (const { name } of deck.main) if (!isLandName(name)) { const r = resolve(name); return r ? r.name : name; }
  return deck.main[0] ? deck.main[0].name : '';
}
function artStyle(im) { return im && im.front ? `background-image:url("${im.front}")` : ''; }
function deckBoxEl(deckName, isCur, onPick, onArt, onEdit) {
  const dk = loadDecks()[deckName], deck = parseDeck(dk.text), cols = deckColorsOf(deck), art = deckArtName(deckName, deck), im = imgFor(art);
  const a = DECKBOX_COL[cols[0] || ''], b = DECKBOX_COL[cols[1] || cols[0] || ''];
  const dbx = h('div', { class: 'dbx', style: `--ca:${a[1]};--cad:${a[0]};--cb:${b[1]};--cbd:${b[0]}` },
    h('div', { class: 'dbx-face front' },
      h('div', { class: 'dbx-art' + (im ? '' : ' none'), style: artStyle(im) }, im ? null : h('span', { text: (deckName.trim()[0] || '?').toUpperCase() })),
      h('div', { class: 'dbx-gloss' }),
      h('div', { class: 'dbx-label' }, h('b', { text: deckName }), h('span', {}, `${sum(deck.main)} cards`, ' ', ...cols.map(c => h('i', { class: 'dbx-pip', style: `background:${WUBRG_COL['WUBRG'.indexOf(c)]}` }))))),
    h('div', { class: 'dbx-face side' }, h('span', { text: deckName })),
    h('div', { class: 'dbx-face top' }));
  const stage = h('div', { class: 'dbx-stage', title: isCur ? `${deckName} (current deck)` : `Use ${deckName}`, onclick: onPick }, dbx);
  stage.addEventListener('mousemove', e => { const r = stage.getBoundingClientRect(); dbx.style.setProperty('--rx', (((e.clientX - r.left) / r.width - 0.5) * 2).toFixed(2)); dbx.style.setProperty('--ry', (((e.clientY - r.top) / r.height - 0.5) * 2).toFixed(2)); });
  stage.addEventListener('mouseleave', () => { dbx.style.removeProperty('--rx'); dbx.style.removeProperty('--ry'); });
  return h('div', { class: 'dbx-tile' + (isCur ? ' on' : '') }, stage, h('div', { class: 'dbx-shadow' }),
    h('div', { class: 'dbx-btns' }, h('button', { text: 'Art…', title: 'Choose which card’s art is on this box', onclick: e => { e.stopPropagation(); onArt(); } }), h('button', { text: 'Edit', onclick: e => { e.stopPropagation(); onEdit(); } })),
    isCur ? h('div', { class: 'dbx-cur', text: 'In use' }) : null);
}
function openDeckPicker() {
  const m = modal('Your decks', { width: 940 });
  const draw = () => {
    const decks = loadDecks(), names = Object.keys(decks).sort((x, y) => x.localeCompare(y)), cur = currentDeckName();
    m.body.replaceChildren(names.length
      ? h('div', { class: 'dbx-shelf' }, names.map(n => deckBoxEl(n, n === cur,
        () => { lsSet('mtgpt.current', n); refreshDeckSelect(); prepareImages(); m.close(); render(); },
        () => openDeckArtPicker(n, draw),
        () => { lsSet('mtgpt.current', n); refreshDeckSelect(); m.close(); openDeckEditor(); })))
      : h('div', { class: 'muted', text: 'No decks yet. Use “Import / new deck” to paste a decklist.' }));
  };
  draw();
  m.foot.append(h('button', { text: 'Import / new deck…', onclick: () => { m.close(); openDeckEditor(); } }), h('button', { text: 'Scan decks & save report', title: 'Reads every card in every saved deck and saves a text file you can send for review', onclick: saveDeckScanReport }), h('button', { class: 'primary', text: 'Close', onclick: () => m.close() }));
  const decks = loadDecks(); loadCachedImages(Object.keys(decks).map(n => deckArtName(n, parseDeck(decks[n].text)))).then(n => { if (n) draw(); });
}
// ---- Deck scan report (v0.63): reads every card of every saved deck and writes one text file to send for review.
function deckScanReportText() {
  const decks = loadDecks(), names = Object.keys(decks).sort((a, b) => a.localeCompare(b));
  const L = [`MTG Playtester deck scan report (v${APP_VERSION})`, `Created ${new Date().toISOString()}`, `Card data loaded: ${cardCount ? cardCount.toLocaleString() + ' cards' : 'NONE (import the Oracle file first, otherwise nothing can be read)'}`, `Decks scanned: ${names.length}`, ''];
  const agg = new Map(), tot = { ok: 0, part: 0, unk: 0 }, missingAll = new Set(); const seenCard = new Set();
  for (const n of names) {
    const deck = parseDeck(decks[n].text), list = deckNameList(deck), cards = [];
    const miss = [], rows = [];
    for (const nm of list) { const cc = compileCard({ name: nm }); if (!cc) { miss.push(nm); missingAll.add(nm); continue; } cards.push(cc); }
    const t = { ok: 0, part: 0, unk: 0 }; for (const c of cards) for (const k of ['ok', 'part', 'unk']) t[k] += c.counts[k];
    L.push('='.repeat(70), `DECK: ${n}  (${deck.main.reduce((a, x) => a + (x.qty || x.n || 0), 0) || deck.main.length} main entries, ${list.length} different cards)`);
    L.push(`Lines understood ${t.ok}, partly ${t.part}, not understood ${t.unk}. Cards with no card data: ${miss.length}${miss.length ? ' -> ' + miss.join('; ') : ''}`);
    for (const c of cards.slice().sort((a, b) => b.counts.unk - a.counts.unk || b.counts.part - a.counts.part)) {
      const bad = c.lines.filter(l => l.status === 'unk' || l.status === 'part'); if (!bad.length) continue;
      L.push('', `  ${c.name}  [${c.mc || '-'}] ${c.type}`);
      for (const l of bad) {
        L.push(`    ${l.status === 'unk' ? 'NOT UNDERSTOOD' : 'partly'} (${l.kind}): ${l.text.replace(/\n/g, ' ')}`, `      note: ${l.note}`);
        if (!seenCard.has(c.name + l.text)) { seenCard.add(c.name + l.text); const sh = covShape(covCore(l), c.name); if (sh) { const k = l.kind + ' | ' + l.status + ' | ' + sh; const e = agg.get(k) || { n: 0, ex: [] }; e.n++; if (e.ex.length < 3) e.ex.push(c.name); agg.set(k, e); } }
      }
    }
    for (const k of ['ok', 'part', 'unk']) tot[k] += t[k];
    L.push('');
  }
  const all = tot.ok + tot.part + tot.unk || 1;
  L.splice(5, 0, `ALL DECKS: ${tot.ok} lines understood (${Math.round(100 * tot.ok / all)}%), ${tot.part} partly (${Math.round(100 * tot.part / all)}%), ${tot.unk} not understood (${Math.round(100 * tot.unk / all)}%).`, `Cards missing from card data: ${missingAll.size}${missingAll.size ? ' -> ' + [...missingAll].join('; ') : ''}`, '');
  L.push('='.repeat(70), 'MOST COMMON PHRASES THE APP DOES NOT FULLY HANDLE (kind | status | phrase | count | example cards)');
  for (const [k, e] of [...agg.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 120)) L.push(`  ${k} | ${e.n} | ${e.ex.join('; ')}`);
  return L.join('\n');
}
function saveDeckScanReport() {
  const names = Object.keys(loadDecks());
  if (!names.length) { toast('No decks', 'Import a deck first.'); return; }
  const txt = deckScanReportText();
  const a = h('a', { href: URL.createObjectURL(new Blob([txt], { type: 'text/plain' })), download: 'mtg-playtester-deck-report.txt' });
  document.body.append(a); a.click(); a.remove();
  toast('Report saved', `Scanned ${names.length} deck${names.length === 1 ? '' : 's'}. Upload mtg-playtester-deck-report.txt to Claude.`);
}
function openDeckArtPicker(deckName, after) {
  const dk = loadDecks()[deckName]; if (!dk) return; const deck = parseDeck(dk.text);
  const names = [...new Set(deck.main.concat(deck.side).map(x => { const r = resolve(x.name); return r ? r.name : x.name; }))].filter(n => !isLandName(n));
  const cur = deckArtName(deckName, deck);
  const m = modal(`Box art for ${deckName}`, { width: 760 });
  const draw = () => m.body.replaceChildren(
    h('div', { class: 'small muted', text: 'Pick the card whose art goes on this deck box. (Card pictures appear once they are downloaded in Settings → Card images.)' }),
    h('div', { class: 'dbx-artgrid' }, names.map(n => { const im = imgFor(n);
      return h('button', { class: 'dbx-artopt' + (n === cur ? ' on' : ''), title: n, onclick: () => { const all = loadDecks(); if (all[deckName]) { all[deckName].art = n; saveDecks(all); } m.close(); if (after) after(); } },
        h('span', { class: 'dbx-art mini' + (im ? '' : ' none'), style: artStyle(im) }), h('span', { class: 'artlbl', text: n })); })));
  draw(); loadCachedImages(names).then(n => { if (n) draw(); });
}
// ---------------------------------------------------------------- animations and effects (v0.58)
// Everything here only decorates: it never changes the game state. Each part has its own switch (Settings → Animations).
const UI_THEMES = [['default', 'Midnight (default)'], ['obsidian', 'Obsidian & gold'], ['abyss', 'Abyss blue'], ['forest', 'Forest'], ['neon', 'Neon'], ['parchment', 'Parchment'], ['light', 'Light'], ['deck', 'Match my deck']];
function applyUiTheme() {
  const b = document.body, t = settings.uiTheme || 'default';
  b.dataset.uitheme = t === 'deck' ? 'default' : t;
  const keys = ['--accent', '--accent-text', '--gold', '--line'];
  for (const k of keys) b.style.removeProperty(k);
  if (t === 'deck') { try { const d = getCurrentDeck(), cols = d ? deckColorsOf(d) : [], c = DECKBOX_COL[cols[0] || ''][1], c2 = DECKBOX_COL[cols[1] || cols[0] || ''][1];
    b.style.setProperty('--accent', c); b.style.setProperty('--gold', c2); b.style.setProperty('--accent-text', cols[0] === 'W' ? '#1c1a10' : '#0b0f14'); } catch (e) {} }
}
const ANIM_DEFS = [
  ['move', 'Card movement', 'Cards slide when drawn, played, tapped or sent to a graveyard or exile, and permanents pop in'],
  ['spell', 'Spell spotlight', 'A lit-up card in the middle of the screen when a spell is cast, resolves or is countered'],
  ['life', 'Life effects', 'Rolling life numbers, a colour flash, a shake on big hits and floating +/- numbers'],
  ['turn', 'Turn banner & phase flash', 'A banner at the start of each turn and a flash when the phase changes'],
  ['fan', 'Hand fan', 'Cards in your hand sit in a gentle arc and lift when you hover them'],
  ['hand3d', '3D hand tilt', 'Cards in your hand tilt toward the mouse in 3D as you hover them, like the big card preview'],
  ['bfFloat', 'Floating battlefield', 'Cards on the battlefield drift up and down a tiny amount, each at its own pace, with a deeper shadow so the board has depth']
];
const reducedMotion = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const aamt = k => { const v = settings.anim && settings.anim[k]; return v === undefined || isNaN(+v) ? 1 : +v; };
const aspd = () => Math.max(0.2, aamt('speed'));
function wa(el, frames, o) { o = { ...o }; const sp = aspd(); if (o.duration) o.duration /= sp; if (o.delay) o.delay /= sp; return el.animate(frames, o); }
function animOn(k) { const a = settings.anim; return !!(a && a.on !== false && a[k] !== false && !reducedMotion()); }
const centerOf = sel => { const e = typeof sel === 'string' ? document.querySelector(sel) : sel; if (!e) return null; const r = e.getBoundingClientRect(); return r.width || r.height ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; };
const CARD_SEL = '#mat .card[data-id], #row-hand .card[data-id]';
let animPrev = null;
function animCapture() {
  animPrev = null; if (!animOn('move') || !state) return;
  const cards = new Map(), nodes = new Map(); let n = 0;
  for (const el of document.querySelectorAll(CARD_SEL)) {
    const r = el.getBoundingClientRect(); if (!r.width) continue;
    cards.set(el.dataset.id, { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: el.offsetWidth, h: el.offsetHeight, t: getComputedStyle(el).transform });
    if (n++ < 70) nodes.set(el.dataset.id, el.cloneNode(true));
  }
  animPrev = { cards, nodes };
}
function sparks(x, y, col, n, dist, dur) {
  if (reducedMotion()) return;
  n = Math.round(n * aamt('spark'));
  for (let i = 0; i < n; i++) {
    const s = document.createElement('i'); s.className = 'spark'; s.style.cssText = `left:${x}px;top:${y}px;background:${col};box-shadow:0 0 6px ${col}`;
    document.body.appendChild(s); const a = Math.random() * Math.PI * 2, d = dist * (0.5 + Math.random() * 0.7);
    const an = wa(s, [{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(0)`, opacity: 0 }], { duration: dur * (0.7 + Math.random() * 0.6), easing: 'cubic-bezier(.1,.7,.3,1)' });
    an.onfinish = () => s.remove(); setTimeout(() => s.remove(), (dur * 2) * 3);
  }
}
function animApply() {
  const prev = animPrev; animPrev = null; if (!prev || !state || !animOn('move')) return;
  const now = [...document.querySelectorAll(CARD_SEL)], seen = new Set(), lib = centerOf('#libstack'), jobs = [];
  let newHand = 0;
  for (const el of now) {
    const id = el.dataset.id; seen.add(id); const r = el.getBoundingClientRect(); if (!r.width) continue;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2, p = prev.cards.get(id), t = getComputedStyle(el).transform;
    if (p) {
      const dx = p.cx - cx, dy = p.cy - cy; if (Math.abs(dx) < 1.5 && Math.abs(dy) < 1.5 && p.t === t) continue;
      const dist = Math.hypot(dx, dy);
      jobs.push(() => wa(el, [{ translate: `${dx}px ${dy}px`, transform: p.t }, { translate: '0px 0px', transform: t }], { duration: dist > 220 ? 460 : dist > 40 ? 340 : 220, easing: 'cubic-bezier(.25,.8,.25,1)' }));
    } else if (el.closest('#row-hand') && lib) {
      const dx = lib.x - cx, dy = lib.y - cy, delay = Math.min(newHand++, 8) * 80;
      jobs.push(() => wa(el, [{ translate: `${dx}px ${dy}px`, scale: '.4', rotate: '-10deg', opacity: 0.2 }, { translate: '0px 0px', scale: '1', rotate: '0deg', opacity: 1 }], { duration: 480, delay, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }));
    } else {
      jobs.push(() => { wa(el, [{ transform: `${t === 'none' ? '' : t} scale(.55) translateY(-26px)`, opacity: 0, filter: 'brightness(2.2)' }, { transform: `${t === 'none' ? '' : t} scale(1.06)`, opacity: 1, filter: 'brightness(1.5)', offset: 0.6 }, { transform: t === 'none' ? 'none' : t, opacity: 1, filter: 'brightness(1)' }], { duration: 380, easing: 'ease-out' });
        const col = (SPOT_COL[spotKey(el)] || SPOT_COL['']); sparks(cx, cy, col[0], 7, 46, 520); });
    }
  }
  const gone = [...prev.cards.keys()].filter(id => !seen.has(id));
  if (jobs.length + gone.length > 45) return;
  jobs.forEach(j => j());
  for (const id of gone) {
    const p = prev.cards.get(id), node = prev.nodes.get(id); if (!node) continue;
    const f = findCard(+id); let dest = null;
    if (f) dest = f.zone === 'graveyard' ? centerOf('#pile-graveyard .stack') : f.zone === 'exile' ? centerOf('#pile-exile .stack') : f.zone === 'library' ? centerOf('#libstack') : (f.zone === 'hand' ? null : null);
    if (!dest && state.stack.some(s => s.id === +id)) dest = centerOf('#btnResolveStack');
    node.removeAttribute('data-id'); node.removeAttribute('title'); node.classList.add('ghost');
    node.style.cssText = `position:fixed;left:${p.cx - p.w / 2}px;top:${p.cy - p.h / 2}px;width:${p.w}px;height:${p.h}px;margin:0;z-index:9000;pointer-events:none;transform:${p.t === 'none' ? 'none' : p.t}`;
    document.body.appendChild(node);
    const base = p.t === 'none' ? '' : p.t, to = dest ? `translate(${dest.x - p.cx}px,${dest.y - p.cy}px) scale(.3) rotate(20deg)` : `${base} scale(.7)`;
    const an = wa(node, [{ transform: base || 'none', opacity: 1 }, { transform: to, opacity: 0.05 }], { duration: dest ? 520 : 320, easing: 'cubic-bezier(.5,0,.8,.5)' });
    an.onfinish = () => node.remove(); setTimeout(() => node.remove(), (1200) * 3);
  }
}
// ---- spell spotlight
const SPOT_COL = { W: ['#fff6c8', '#e3c964'], U: ['#8ec5ff', '#2f6fc4'], B: ['#c3a6e6', '#5a3c82'], R: ['#ffb08a', '#d9452f'], G: ['#9be8ab', '#2f9a4a'], multi: ['#ffe27a', '#d4a935'], '': ['#e6e9ee', '#8f98a6'] };
function spotKey(elOrCard) {
  let k = '';
  if (elOrCard && elOrCard.nodeType === 1) { const m = /\bc-(W|U|B|R|G|multi)\b/.exec(elOrCard.className); k = m ? m[1] : ''; }
  else if (elOrCard && !elOrCard.opp) { try { const c = colorClass(elOrCard); k = /^(W|U|B|R|G|multi)$/.test(c) ? c : ''; } catch (e) { k = ''; } }
  return k;
}
function spotCardEl(c) {
  const im = !c.opp && !c.token && showImages ? imgFor(c.name) : null;
  if (im && im.front) return h('img', { class: 'spot-img', src: im.front, alt: c.name });
  let el = null;
  if (!c.opp) { try { el = cardEl(c, 'stack'); el.classList.remove('sel', 'bsel', 'instant-speed'); el.removeAttribute('data-id'); el.removeAttribute('draggable'); } catch (e) { el = null; } }
  if (!el) el = h('div', { class: 'card c-art' }, h('div', { class: 'ctop' }, h('span', { class: 'cname', text: c.name })), h('div', { class: 'ctype', text: c.opp ? "Opponent's spell" : '' }));
  return h('div', { class: 'spot-tile' }, el);
}
function spotlight(c, kind, from) {
  if (!animOn('spell') || !c) return;
  const key = spotKey(c), col = SPOT_COL[key] || SPOT_COL[''], W = innerWidth, H = innerHeight;
  const wrap = h('div', { class: 'spot spot-' + kind, style: `--sc1:${col[0]};--sc2:${col[1]}` },
    h('div', { class: 'spot-rays' }), spotCardEl(c), kind === 'counter' ? h('div', { class: 'spot-x', text: '✕' }) : null,
    h('div', { class: 'spot-label', text: kind === 'cast' ? (c.opp ? 'Opponent casts' : 'Cast') : kind === 'counter' ? 'Countered' : 'Resolves' }));
  { const z = aamt('spotSize'); wrap.style.width = (200 * z) + 'px'; wrap.style.margin = `${-150 * z}px 0 0 ${-100 * z}px`; }
  document.body.appendChild(wrap);
  const cx = W * 0.4, cy = H * 0.42, sx = from ? from.x - cx : 0, sy = from ? from.y - cy : H * 0.35, stack = centerOf('#btnResolveStack') || { x: W - 120, y: 130 };
  let frames, dur;
  if (kind === 'cast') { dur = 1250; frames = [
    { transform: `translate(${sx}px,${sy}px) scale(.4)`, opacity: 0 },
    { transform: 'translate(0,0) scale(1.12)', opacity: 1, offset: 0.26 },
    { transform: 'translate(0,0) scale(1)', opacity: 1, offset: 0.72 },
    { transform: `translate(${stack.x - cx}px,${stack.y - cy}px) scale(.18)`, opacity: 0 }]; }
  else if (kind === 'counter') { dur = 1150; frames = [
    { transform: 'translate(0,0) scale(.85)', opacity: 0 }, { transform: 'translate(0,0) scale(1)', opacity: 1, offset: 0.15 },
    { transform: 'translate(-14px,0) scale(1)', offset: 0.25 }, { transform: 'translate(14px,0) scale(1)', offset: 0.35 }, { transform: 'translate(-10px,0) scale(1)', offset: 0.45 }, { transform: 'translate(8px,0) scale(1)', opacity: 1, offset: 0.55 },
    { transform: 'translate(0,30px) scale(.7) rotate(8deg)', opacity: 0 }]; }
  else { dur = 950; frames = [
    { transform: 'translate(0,0) scale(.9)', opacity: 0 }, { transform: 'translate(0,0) scale(1.08)', opacity: 1, offset: 0.3 },
    { transform: 'translate(0,-10px) scale(1.04)', opacity: 1, offset: 0.55 }, { transform: 'translate(0,-90px) scale(1.2)', opacity: 0 }]; }
  const an = wa(wrap, frames, { duration: dur, easing: 'ease-in-out' });
  an.onfinish = () => wrap.remove(); setTimeout(() => wrap.remove(), (dur + 600) * 3);
  setTimeout(() => sparks(cx, cy, col[0], kind === 'counter' ? 16 : 22, 150, 800), dur * 0.22 / aspd());
  if (kind === 'counter') setTimeout(() => sparks(cx, cy, '#ff5a4f', 18, 130, 700), dur * 0.5 / aspd());
}
// ---- life effects
let lifePrev = { you: null, opp: null };
function lifeFx(which, el, val) {
  if (!el) return;
  const prev = lifePrev[which]; lifePrev[which] = val;
  if (prev === null || prev === val || !animOn('life')) { if (!el._rolling || prev === null || !animOn('life')) el.textContent = val; return; }
  const d = val - prev, up = d > 0, tok = (el._tok = (el._tok || 0) + 1);
  if (Math.abs(d) > 1) { el._rolling = true; const t0 = performance.now(), dur = Math.min(700, 260 + Math.abs(d) * 40) / aspd();
    const step = now => { if (el._tok !== tok) return; const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(prev + d * e); if (k < 1) requestAnimationFrame(step); else { el.textContent = val; el._rolling = false; } };
    requestAnimationFrame(step); } else el.textContent = val;
  el.classList.remove('lf-up', 'lf-down'); void el.offsetWidth; el.classList.add(up ? 'lf-up' : 'lf-down'); setTimeout(() => el.classList.remove('lf-up', 'lf-down'), 800);
  const r = el.getBoundingClientRect(), f = document.createElement('div'); f.className = 'lifefloat ' + (up ? 'up' : 'down'); f.textContent = (up ? '+' : '−') + Math.abs(d);
  f.style.cssText = `left:${r.left + r.width / 2}px;top:${r.top}px`; document.body.appendChild(f);
  const an = wa(f, [{ transform: 'translate(-50%,0) scale(.7)', opacity: 0 }, { transform: 'translate(-50%,-14px) scale(1.15)', opacity: 1, offset: 0.2 }, { transform: 'translate(-50%,-52px) scale(1)', opacity: 0 }], { duration: 1100, easing: 'ease-out' });
  an.onfinish = () => f.remove(); setTimeout(() => f.remove(), (1600) * 3);
  const box = el.closest('.hudbox'); if (box && d <= -3) wa(box, [{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' }], { duration: 340 });
  if (val <= 0 && prev > 0) lethalFx(which);
}
function lethalFx(which) {
  const you = which === 'you', o = h('div', { class: 'lethal ' + (you ? 'you' : 'opp') }, h('div', { class: 'lethal-t', text: you ? 'You are at 0 life' : 'Opponent is at 0 life' }), h('div', { class: 'lethal-s', text: you ? 'In a real game you would lose here.' : 'Lethal!' }));
  document.body.appendChild(o); const an = wa(o, [{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: 2600 });
  an.onfinish = () => o.remove(); setTimeout(() => o.remove(), (3200) * 3);
  sparks(innerWidth / 2, innerHeight / 2, you ? '#ff5a4f' : '#ffe27a', 40, 360, 1200);
}
// ---- turn banner and phase flash
function turnBanner() {
  if (!animOn('turn') || !state) return;
  const b = h('div', { class: 'turnbanner' }, h('b', { text: `Turn ${state.turn}` }), h('span', { text: state.onPlay || state.turn > 1 ? 'Your turn' : 'Your turn (on the draw)' }));
  document.body.appendChild(b);
  const an = wa(b, [{ transform: 'translateX(-60vw)', opacity: 0 }, { transform: 'translateX(0)', opacity: 1, offset: 0.22 }, { transform: 'translateX(0)', opacity: 1, offset: 0.72 }, { transform: 'translateX(60vw)', opacity: 0 }], { duration: 1500, easing: 'ease-in-out' });
  an.onfinish = () => b.remove(); setTimeout(() => b.remove(), (2200) * 3);
}
let lastStepShown = null;
function phaseFlash() {
  const id = state && state.phase === 'play' ? state.step : null, was = lastStepShown; lastStepShown = id;
  if (id === null || was === null || was === id || !animOn('turn')) return;
  const box = $('#phases'); if (!box) return; box.classList.remove('phase-flash'); void box.offsetWidth; box.classList.add('phase-flash'); setTimeout(() => box.classList.remove('phase-flash'), 900);
}
// ---- hand fan
function applyFan() {
  const row = $('#row-hand'); if (!row) return; const cards = [...row.children], on = animOn('fan') && cards.length > 1;
  row.classList.toggle('fan', on);
  for (const c of cards) { c.style.removeProperty('--fan-rot'); c.style.removeProperty('--fan-y'); }
  if (!on) return;
  const n = cards.length, k = aamt('fanAmt'), maxRot = Math.min(8, 1.4 * n) * k;
  cards.forEach((c, i) => { const t = (i / (n - 1)) * 2 - 1; c.style.setProperty('--fan-rot', (t * maxRot).toFixed(1) + 'deg'); c.style.setProperty('--fan-y', ((t * t * 7 - 4) * k).toFixed(1) + 'px'); });
}
// ---------------------------------------------------------------- attachments (v0.64)
// Equipment and Auras are linked to the permanent they are attached to with c.att (the host's id). Rule 301.5 / 303.4:
// Equipment can only be attached to a creature; an Aura goes to the graveyard when what it enchants is gone (704.5m);
// an Equipment simply becomes unattached (704.5n). Bonuses are read from "Equipped/Enchanted creature gets ..." in parseStaticCard.
const isAuraCard = c => !!c && !c.token && /\bAura\b/.test(frontType(c));
const isEquipmentCard = c => !!c && !c.token && /\bEquipment\b/.test(frontType(c));
function hostOf(c) { return state && c && c.att ? state.battlefield.find(x => x.id === c.att) || null : null; }
function attachmentsOf(host) { return state && host ? state.battlefield.filter(x => x.att === host.id) : []; }
function attachTo(attId, hostId, src) {
  const a = findCard(attId), t = findCard(hostId);
  if (!a || a.zone !== 'battlefield' || !t || t.zone !== 'battlefield' || a.card.id === t.card.id) return false;
  if (isEquipmentCard(a.card) && permZone(t.card) !== 'creatures') { toast("Can't attach", `${a.card.name} is Equipment, so it can only be attached to a creature (rule 301.5c).`); return false; }
  snap(); const prev = hostOf(a.card); a.card.att = t.card.id;
  log(`${src ? src + ': ' : ''}${a.card.name} attached to ${t.card.name}${prev && prev.id !== t.card.id ? ` (it was on ${prev.name})` : ''}`);
  sfx && sfx('enter'); render(); return true;
}
function unattach(attId) { const a = findCard(attId); if (!a || !a.card.att) return; snap(); const h0 = hostOf(a.card); delete a.card.att; log(`${a.card.name} unattached${h0 ? ' from ' + h0.name : ''}`); render(); }
// Called when a permanent leaves the battlefield: Auras that were on it fall off (704.5m), Equipment becomes unattached (704.5n).
function detachFrom(c) {
  if (!state) return;
  delete c.att;
  for (const x of state.battlefield.slice()) if (x.att === c.id) {
    if (isAuraCard(x)) { log(`${x.name} is put into the graveyard: what it enchanted (${c.name}) left the battlefield`); leaveBattlefield(x, 'graveyard'); }
    else { delete x.att; log(`${x.name} became unattached (${c.name} left the battlefield)`); }
  }
}
function auraHostOk(x, what) {
  const p = permTypeInfo(x); let ok = true, any = false;
  for (const w of what.split(/\s+/)) {
    const nm = w.match(/^non-?(\w+)$/);
    if (nm) { any = true; if (p.types.has(nm[1])) ok = false; }
    else if (['creature', 'land', 'artifact', 'enchantment', 'planeswalker', 'permanent', 'legendary'].includes(w)) { any = true; if (!p.types.has(w)) ok = false; }
    else if (/^(?:you|control|a|an|that|with|your|the)$/.test(w)) continue;
    else if (p.subs.has(w) || p.subs.has(w.replace(/s$/, ''))) { any = true; }
  }
  return any && ok;
}
function openAttachChoice(cardId) {
  const f = findCard(cardId); if (!f || f.zone !== 'battlefield') return;
  const c = f.card, em = cardText(c).match(/^Enchant ([^\n]+)/mi), what = (em ? em[1] : 'creature').toLowerCase().replace(/\s*\(.*$/, '');
  if (!em || /graveyard|opponent|don'?t control|\bplayer\b/.test(what)) { log(`${c.name}: enchants "${what}", which the app cannot attach to - track it by hand`); toast('Attach by hand', `${c.name} enchants "${what}". The app can't attach to that; use the card menu (Attach to…) if it is a permanent you control.`); if (state.pendingTriggers.length) resolvePendingTrigger(); return; }
  const cands = state.battlefield.filter(x => x.id !== c.id && auraHostOk(x, what.replace(/\s+you control$/, '')));
  if (!cands.length) { snap(); log(`${c.name} has nothing to enchant, so it is put into the graveyard (rule 704.5m)`); toast('No legal host', `${c.name} enchants ${what} and you control none, so it goes to the graveyard.`); leaveBattlefield(c, 'graveyard'); render(); if (state.pendingTriggers.length) resolvePendingTrigger(); return; }
  const m = modal(`${c.name}: enchant what?`, { width: 520, sticky: true, noClose: true });
  m.body.append(h('div', { class: 'psub', text: `Enchant ${what}. Choose what it is attached to. While it stays attached, its “Enchanted … gets …” bonuses apply to that permanent.` }));
  const done = () => { m.close(); render(); if (state.pendingTriggers.length) resolvePendingTrigger(); };
  for (const x of cands) m.body.append(h('div', { class: 'row' }, h('span', { class: 'nm', text: x.name + (x.tapped ? ' (tapped)' : '') }), h('button', { class: 'primary', text: 'Attach here', onclick: () => { attachTo(c.id, x.id); done(); } })));
  m.foot.append(h('button', { text: 'No host: put it in the graveyard', onclick: () => { snap(); log(`${c.name} was put into the graveyard (no host chosen)`); leaveBattlefield(c, 'graveyard'); done(); } }));
}
function openAttachPicker(c) {
  const hosts = state.battlefield.filter(x => x.id !== c.id && (isEquipmentCard(c) ? permZone(x) === 'creatures' : true));
  if (!hosts.length) { toast('Nothing to attach to', 'There is no valid permanent on the battlefield.'); return; }
  const m = modal(`Attach ${c.name} to…`, { width: 480 });
  for (const x of hosts) m.body.append(h('div', { class: 'row' }, h('span', { class: 'nm', text: x.name + (x.id === c.att ? ' (current)' : '') }), h('button', { class: 'primary', text: 'Attach', onclick: () => { m.close(); attachTo(c.id, x.id); } })));
  m.foot.append(h('button', { text: 'Cancel', onclick: () => m.close() }));
}
// "Living weapon": a 0/0 black Phyrexian Germ token enters and the Equipment is attached to it (rule 702.92).
function livingWeapon(c) {
  const g = newCard('Phyrexian Germ', { token: true, tk: { pt: '0/0', subs: ['phyrexian', 'germ'], col: ['B'], tx: '', types: ['Creature'], type: 'Token Creature — Phyrexian Germ', legendary: false } });
  g.id = state.nextId++; c.att = g.id;
  enterBattlefield(g, { from: 'effect', logMsg: `${c.name}: living weapon - created a 0/0 black Phyrexian Germ token and attached ${c.name} to it` });
}
function countEachMulti(per) {
  const t = String(per).toLowerCase();
  if (/\band\/or\b/.test(t)) { const ws = t.replace(/\s+you control.*$/, '').split(/\s+and\/or\s+/).map(w => w.trim().replace(/s$/, '')); return state.battlefield.filter(c => ws.some(w => permTypeInfo(c).types.has(w))).length; }
  return countForEach(t);
}

// ---------------------------------------------------------------- replacement effects (v0.64)
// A replacement effect (rule 614) changes HOW an event happens instead of adding a new one. They are applied as the event happens:
//  - counters: "that many plus one" (Hardened Scales, Winding Constrictor) and "twice that many" (Doubling Season, for effects)
//  - "If ~ would enter the battlefield, you may discard a land card instead" (Mox Diamond)
//  - "As ~ enters the battlefield, choose a ..." (Cavern of Souls, Phyrexian Revoker, Pithing Needle)
//  - "If you would draw a card, you may instead ..." (dredge)
function adjustCounterAdd(host, kindKey, n, viaEffect) {
  if (!state || !host || n <= 0) return n;
  const kindTxt = kindKey === 'plus' ? '+1/+1' : kindKey === 'minus' ? '-1/-1' : String(kindKey).toLowerCase();
  const types = permTypeInfo(host).types; let out = n; const notes = [];
  for (const g of state.battlefield) {
    if (g.token) continue; const tx = (cardText(g) || '').replace(/−/g, '-');
    if (!/counters? would be put on/i.test(tx) && !/would put one or more counters/i.test(tx)) continue;
    for (const ln of tx.split('\n')) {
      let m;
      if ((m = ln.match(/^If one or more ([+\-0-9\/]+|[a-z]+) counters would be put on an? ([a-z]+)(?: or ([a-z]+))? you control, that many plus (one|two|\d+)[^.]*instead\.?$/i))) {
        if (m[1].toLowerCase() !== kindTxt) continue;
        if (!(types.has(m[2].toLowerCase()) || (m[3] && types.has(m[3].toLowerCase())))) continue;
        const add = wordN(m[4]); out += add; notes.push(`${g.name}: +${add}`);
      } else if ((m = ln.match(/^If one or more counters would be put on an? ([a-z]+) or ([a-z]+) you control, that many plus one of each of those kinds of counters are put on it instead/i))) {
        if (!(types.has(m[1].toLowerCase()) || types.has(m[2].toLowerCase()))) continue;
        out += 1; notes.push(`${g.name}: +1`);
      } else if (viaEffect && (m = ln.match(/^If an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead/i))) {
        out *= 2; notes.push(`${g.name}: ×2`);
      }
    }
  }
  if (notes.length && teach('replaceNotes')) log(`Replacement effect${notes.length > 1 ? 's' : ''} (rule 614): ${n} ${kindTxt} counter${n === 1 ? '' : 's'} would be put on ${host.name}; ${notes.join(', ')} → ${out}`);
  return out;
}
// Mox Diamond: "If ~ would enter the battlefield, you may discard a land card instead. If you do, put ~ onto the battlefield. If you don't, put it into its owner's graveyard."
function openDiscardInstead(cardId, what) {
  const f = findCard(cardId); if (!f || f.zone !== 'battlefield') return; const c = f.card;
  const opts = state.hand.filter(x => descMatchesCard(what, x.name));
  const done = () => { render(); if (state.pendingTriggers.length) resolvePendingTrigger(); };
  const toGy = () => { snap(); log(`${c.name}: you did not discard, so it is put into the graveyard instead of entering`); leaveBattlefield(c, 'graveyard'); done(); };
  if (!opts.length) { toast(`${c.name}`, `You have no ${what} card to discard, so it is put into the graveyard instead of entering the battlefield.`); toGy(); return; }
  const m = modal(`${c.name}: discard a ${what} card?`, { width: 520, sticky: true, noClose: true });
  m.body.append(h('div', { class: 'psub', text: `If ${c.name} would enter the battlefield, you may discard a ${what} card instead. If you do, it enters; if you don’t, it goes to the graveyard (rule 614.1).` }));
  for (const x of opts) m.body.append(h('div', { class: 'row' }, h('span', { class: 'nm', text: x.name }), h('button', { class: 'primary', text: 'Discard it', onclick: () => { m.close(); snap(); const i = state.hand.findIndex(y => y.id === x.id); if (i >= 0) { const [d] = state.hand.splice(i, 1); gyPush(d, 'hand'); } log(`${c.name}: discarded ${x.name} so it can enter the battlefield`); done(); } })));
  m.foot.append(h('button', { text: 'Don’t discard: put it in the graveyard', onclick: () => { m.close(); toGy(); } }));
}
// "As ~ enters the battlefield, choose a creature type / nonland card name / color ..." The choice is stored on the permanent (c.chosen).
let _typePool = null, _namePool = null;
function choicePool(kind) {
  if (/color/.test(kind)) return ['White', 'Blue', 'Black', 'Red', 'Green'];
  if (/basic land type/.test(kind)) return ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'];
  if (/creature type/.test(kind)) { if (!_typePool) { const st = new Set(); for (const v of CARDS.values()) { if (!v || !/\bCreature\b/.test((v.t || '').split(' // ')[0])) continue; const sub = ((v.t || '').split(' // ')[0].split('—')[1] || '').trim(); for (const w of sub.split(/\s+/)) if (w) st.add(w); } _typePool = [...st].sort(); } return _typePool; }
  if (!_namePool) { const nm = new Set(); for (const v of CARDS.values()) if (v && v.name) nm.add(v.name); _namePool = [...nm].sort(); }
  return /nonland/.test(kind) ? _namePool.filter(n => !isLandName(n)) : _namePool;
}
function openChoose(cardId, kind) {
  const f = findCard(cardId); if (!f || f.zone !== 'battlefield') return; const c = f.card;
  const m = modal(`${c.name}: choose a ${kind}`, { width: 560, sticky: true, noClose: true });
  m.body.append(h('div', { class: 'psub', text: `As ${c.name} enters the battlefield you choose a ${kind}. The choice is remembered on the card.` }));
  const pool = choicePool(kind), fixed = pool.length <= 8;
  const done = v => { m.close(); snap(); c.chosen = v; log(`${c.name}: chose ${v}`); render(); if (state.pendingTriggers.length) resolvePendingTrigger(); };
  if (fixed) { const row = h('div', { class: 'mana-choice' }); for (const v of pool) row.append(h('button', { class: 'mana-choice-btn', text: v, onclick: () => done(v) })); m.body.append(row); }
  else {
    const inp = h('input', { type: 'text', placeholder: `Type a ${kind}…`, style: 'width:100%;margin:6px 0' }), list = h('div', { class: 'fetchgrid' });
    const draw = () => { list.replaceChildren(); const q = inp.value.trim().toLowerCase(); const hits = pool.filter(n => !q || n.toLowerCase().includes(q)).slice(0, 14); for (const n of hits) list.append(h('div', { class: 'frow on', onclick: () => done(n) }, h('span', { class: 'nm', text: n }))); if (!hits.length) list.append(h('div', { class: 'muted', text: 'No match. Press Enter to use exactly what you typed.' })); };
    inp.addEventListener('input', draw); inp.addEventListener('keydown', e => { if (e.key === 'Enter' && inp.value.trim()) done(inp.value.trim()); }); draw(); m.body.append(inp, list); setTimeout(() => inp.focus(), 50);
  }
}
// Phyrexian Revoker / Pithing Needle: activated abilities of sources with the chosen name can't be activated (Needle: unless they are mana abilities).
function abilityLockedBy(card, isMana) {
  if (!state || !card) return null;
  for (const g of state.battlefield) {
    if (!g.chosen) continue; const tx = (cardText(g) || '').replace(/’/g, "'");
    const m = tx.match(/activated abilities of sources with the chosen name can't be activated( unless they're mana abilities)?/i);
    if (m && norm(g.chosen) === norm(card.name) && !(m[1] && isMana)) return g;
  }
  return null;
}
// Dredge N (rule 702.52): "If you would draw a card, you may instead mill N cards and return this card from your graveyard to your hand."
function dredgeOptions() {
  if (!state) return [];
  const out = [];
  for (const c of state.graveyard) { const m = (cardText(c) || '').match(/\bDredge (\d+)/i); if (m && state.library.length >= +m[1]) out.push({ card: c, n: +m[1] }); }
  return out;
}
function askDredge(n, after) {
  const opts = teach('dredgePrompts') ? dredgeOptions() : [];
  if (n <= 0) { if (after) after(); return; }
  if (!opts.length) { const d = drawCards(n); log(`Drew ${d}`); render(); if (after) after(); return; }
  const m = modal(`Draw ${n > 1 ? '(' + n + ' left)' : 'a card'}: dredge instead?`, { width: 560, sticky: true, noClose: true });
  m.body.append(h('div', { class: 'psub', text: 'If you would draw a card, you may instead mill that many cards and return the dredge card from your graveyard to your hand (rule 702.52). It replaces the draw, so “whenever you draw” abilities do not trigger. You need at least that many cards in your library.' }));
  const next = () => { m.close(); render(); askDredge(n - 1, after); };
  for (const o of opts) m.body.append(h('div', { class: 'row' }, h('span', { class: 'nm', text: `${o.card.name} - Dredge ${o.n}` }), h('button', { class: 'primary', text: `Dredge (mill ${o.n})`, onclick: () => { snap(); const id = o.card.id; millCards(o.n); const i = state.graveyard.findIndex(x => x.id === id); if (i >= 0) { const [d] = state.graveyard.splice(i, 1); state.hand.push(d); } log(`Dredged ${o.card.name}: milled ${o.n} and returned it to your hand instead of drawing`); next(); } })));
  m.foot.append(h('button', { class: 'primary', text: 'Draw normally', onclick: () => { snap(); const d = drawCards(1); log(`Drew ${d}`); next(); } }));
}

// ---------------------------------------------------------------- generic zone effects (v0.63)
// Tutors, "return cards from your graveyard", coin flips and similar effects that used to be done by hand.
// Hidden-zone rule 701.19b: you may search for a card with qualities, but you are never forced to find one, so every card is shown
// and the ones that match the description are highlighted.
function descMatchesCard(desc, name) {
  const info = cardInfo(name); if (!info) return false;
  const t = (info.t || '').split(' // ')[0], d = String(desc || '').toLowerCase();
  const words = { land: /\bLand\b/, creature: /\bCreature\b/, artifact: /\bArtifact\b/, enchantment: /\bEnchantment\b/, instant: /\bInstant\b/, sorcery: /\bSorcery\b/, planeswalker: /\bPlaneswalker\b/, equipment: /\bEquipment\b/, aura: /\bAura\b/, saga: /\bSaga\b/, basic: /\bBasic\b/, legendary: /\bLegendary\b/ };
  let any = false;
  for (const [w, re] of Object.entries(words)) { const neg = new RegExp('\\bnon-?' + w + '\\b').test(d); if (neg) { any = true; if (re.test(t)) return false; } else if (new RegExp('\\b' + w + '\\b').test(d)) { any = true; if (!re.test(t)) return false; } }
  let m;
  if (/mana cost \{0\} or \{1\}/.test(d)) { if ((info.cmc || 0) > 1) return false; any = true; }
  if ((m = d.match(/mana value (\d+) or less/))) { if ((info.cmc || 0) > +m[1]) return false; any = true; }
  if ((m = d.match(/mana value (\d+) or greater|mana value (\d+) or more/))) { if ((info.cmc || 0) < +(m[1] || m[2])) return false; any = true; }
  if ((m = d.match(/mana value (\d+)(?! or)/))) { if ((info.cmc || 0) !== +m[1]) return false; any = true; }
  if ((m = d.match(/toughness (\d+) or less/))) { const pt = (info.pt || '').split('/')[1]; if (pt === undefined || parseInt(pt, 10) > +m[1]) return false; any = true; }
  if ((m = d.match(/power (\d+) or less/))) { const pt = (info.pt || '').split('/')[0]; if (pt === undefined || parseInt(pt, 10) > +m[1]) return false; any = true; }
  { const CM = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' }, mc0 = String(info.mc || '').split(' // ')[0];
    for (const [w, L] of Object.entries(CM)) { if (new RegExp('\\bnon-?' + w + '\\b').test(d)) { any = true; if (mc0.includes('{' + L)||mc0.includes('/' + L)) return false; } else if (new RegExp('\\b' + w + '\\b').test(d)) { any = true; if (!(mc0.includes('{' + L) || mc0.includes('/' + L))) return false; } } }
  if ((m = d.match(/named ([a-z' ,-]+)/))) { if (norm(info.name) !== norm(m[1].trim())) return false; any = true; }
  return any || /^(?:a |an )?card$/.test(d.trim());
}
// A small picker: choose up to `max` of the listed cards (the list can contain duplicates by name). Calls done(chosen[]) once.
function openPickCards(o) {
  const m = modal(o.title, { width: 760, sticky: true });
  const chosen = new Set(), out = h('div');
  const groups = new Map();
  for (const c of o.cards) { const g = groups.get(c.name) || { name: c.name, ids: [], ok: o.isOk ? o.isOk(c) : true }; g.ids.push(c.id); groups.set(c.name, g); }
  const list = [...groups.values()].sort((a, b) => (b.ok - a.ok) || a.name.localeCompare(b.name));
  const status = h('div', { class: 'muted small' });
  const draw = () => {
    out.replaceChildren(); const grid = h('div', { class: 'fetchgrid' });
    for (const g of list) {
      const picked = g.ids.filter(i => chosen.has(i)).length;
      const row = h('div', { class: 'frow ' + (g.ok ? 'on' : 'off') + (picked ? ' picked' : ''), style: picked ? 'outline:2px solid var(--accent,#c9a227)' : '' },
        h('span', { class: 'q', text: g.ids.length + '×' }), h('span', { class: 'nm', text: g.name }), h('span', { class: 'ty', text: picked ? '✓ ' + picked : '' }));
      row.addEventListener('mouseenter', () => showPreview({ name: g.name }));
      row.addEventListener('click', () => { const free = g.ids.find(i => !chosen.has(i)); if (picked && free === undefined || (picked && chosen.size >= o.max)) { for (const i of g.ids) chosen.delete(i); } else if (free !== undefined && chosen.size < o.max) chosen.add(free); else if (o.max === 1) { chosen.clear(); chosen.add(g.ids[0]); } draw(); });
      grid.append(row);
    }
    out.append(grid); status.textContent = `${chosen.size} of up to ${o.max} chosen.`;
  };
  m.body.append(h('div', { class: 'psub', text: o.note || '' }), status, out); draw();
  m.foot.append(h('button', { text: o.nothing || 'Choose nothing', onclick: () => { m.close(); o.done([]); } }), h('button', { class: 'primary', text: 'Confirm', onclick: () => { m.close(); o.done(o.cards.filter(c => chosen.has(c.id))); } }));
}
function wordN(w) { w = String(w || 'a').toLowerCase(); return /^\d+$/.test(w) ? +w : (TOKEN_NUMW[w] || (w === 'any' ? 99 : 1)); }
// "Search your library for a creature card with toughness 2 or less, reveal it, put it into your hand, then shuffle."
function searchEffect(tx, src, obj) {
  const m = String(tx).replace(/\([^)]*\)/g, '').replace(/\n/g, ' ').match(/search your library(?: and\/or graveyard)? for (up to (\w+)|an?|one|two|three|any number of|\w+) ([^.]*?)(?:,| and| then|\.)/i);
  if (!m || /\band (?:your )?graveyard for\b|and exile the rest/i.test(tx)) return null;
  const sentence = (tx.replace(/\n/g, ' ').match(/search your library[^.]*\.(?:[^.]*\.)?/i) || [''])[0];
  let dest = /onto the battlefield/i.test(sentence) ? 'battlefield' : /into your graveyard/i.test(sentence) ? 'graveyard' : /(?:on top|top of your library)/i.test(sentence) ? 'top' : /into your hand|put (?:it|that card) into your hand/i.test(sentence) ? 'hand' : /\breveal\b/i.test(sentence) ? 'hand' : null;
  if (!dest) return null;
  const tapped = /battlefield tapped/i.test(sentence);
  const max = m[2] ? wordN(m[2]) : wordN(m[1]);
  const desc = m[3].replace(/^cards?\s*/i, '').trim() || m[3];
  const full = (sentence.match(/for [^,.]*?cards?\b[^,.]*/i) || [m[3]])[0];
  return { label: `Search your library for ${max === 1 ? 'a card' : 'up to ' + max + ' cards'} (${full.replace(/^for /i, '').trim()}) → ${dest === 'top' ? 'top of library' : dest}`, fn: () => {
    if (!state.library.length) { toast('Library is empty', 'There is nothing to search.'); return; }
    openPickCards({ title: `${src}: search your library`, note: `Choose ${max === 1 ? 'a card' : 'up to ' + max + ' cards'}: ${full.replace(/^for /i, '')}. Highlighted cards match the description; you may also choose nothing (you can't be forced to find a card). ${/shuffle/i.test(sentence) || /shuffle/i.test(tx) ? 'Your library is shuffled afterwards.' : ''}`,
      cards: state.library.slice(), max, isOk: c => descMatchesCard(full.replace(/^for (?:up to \w+ |an? |one |two |three |any number of )?/i, ''), c.name), nothing: 'Find nothing',
      done: (picked) => { snap(); const names = [];
        for (const c of picked) { names.push(c.name);
          if (dest === 'hand') { const i = state.library.findIndex(x => x.id === c.id); if (i >= 0) state.hand.push(...state.library.splice(i, 1)); }
          else if (dest === 'graveyard') moveCard(c.id, 'graveyard');
          else if (dest === 'top') { const i = state.library.findIndex(x => x.id === c.id); if (i >= 0) { const [x] = state.library.splice(i, 1); state.library.unshift(x); } }
          else { const i = state.library.findIndex(x => x.id === c.id); if (i >= 0) { const [x] = state.library.splice(i, 1); enterBattlefield(x, { from: 'library', logMsg: `${src}: ${x.name} put onto the battlefield${tapped ? ' tapped' : ''}`, tapped }); if (tapped) x.tapped = true; } } }
        if (/shuffle/i.test(tx)) shuffle(state.library);
        if (dest === 'top' && picked.length) { const [x] = picked; const i = state.library.findIndex(y => y.id === x.id); if (i > 0) { const [y] = state.library.splice(i, 1); state.library.unshift(y); } }
        log(`${src}: searched the library${names.length ? ' and found ' + names.join(', ') + (dest === 'hand' ? ' (to hand)' : ' (' + dest + ')') : ' and found nothing'}${/shuffle/i.test(tx) ? '; shuffled' : ''}`); render(); flushTriggers(); } });
  } };
}
// "Return up to three target land cards from your graveyard to your hand."
function graveReturnEffect(tx, src) {
  const m = String(tx).replace(/\n/g, ' ').match(/return (up to (\w+)|an?|one|two|three|\w+)? ?(?:target )?([a-z\- ]*?)cards? from your graveyard to (your hand|the battlefield)/i);
  if (!m) return null;
  const max = m[2] ? wordN(m[2]) : wordN(m[1] || 'a'), desc = (m[3] || '').trim(), to = /hand/i.test(m[4]) ? 'hand' : 'battlefield';
  return { label: `Return ${max === 1 ? 'a' : 'up to ' + max} ${desc ? desc + ' ' : ''}card${max === 1 ? '' : 's'} from your graveyard to ${to === 'hand' ? 'your hand' : 'the battlefield'}`, fn: () => {
    const cards = state.graveyard.filter(c => !desc || descMatchesCard(desc, c.name));
    if (!cards.length) { toast('Nothing to return', `Your graveyard has no ${desc || ''} card.`.replace('  ', ' ')); return; }
    openPickCards({ title: `${src}: return from your graveyard`, note: `Choose ${max === 1 ? 'a card' : 'up to ' + max + ' cards'} to put ${to === 'hand' ? 'into your hand' : 'onto the battlefield'}.`, cards, max, done: picked => { snap(); for (const c of picked) { if (to === 'hand') { const i = state.graveyard.findIndex(x => x.id === c.id); if (i >= 0) state.hand.push(...state.graveyard.splice(i, 1)); } else { const i = state.graveyard.findIndex(x => x.id === c.id); if (i >= 0) { const [x] = state.graveyard.splice(i, 1); enterBattlefield(x, { from: 'graveyard', logMsg: `${src}: ${x.name} returned to the battlefield` }); } } } log(`${src}: returned ${picked.map(c => c.name).join(', ') || 'nothing'} from the graveyard`); render(); flushTriggers(); } });
  } };
}
function flipCoin() { return Math.random() < 0.5; }

// ---------------------------------------------------------------- board layout (v0.67)
const LAYOUT_DEFS = [
  ['zoneDepth', 'Zone depth', 'The battlefield zones look like shelves: a soft inner shadow at the top and a lit edge at the bottom'],
  ['stackCards', 'Stack identical lands and tokens', 'Identical untapped lands (or tapped lands, tokens) pile into one card with a count. Click the count to spread them out'],
  ['dimIdle', 'Dim cards that cannot act', 'Tapped lands and summoning-sick creatures are shown a little duller, so the cards you can use stand out'],
  ['boardStrip', 'Mana and phase strip', 'A slim strip on the board shows the current step, the mana you have floating and your land drop'],
  ['combatLane', 'Combat lane', 'Attacking creatures slide into a lit lane at the front of the creature zone'],
  ['gyFan', 'Fanned graveyard', 'The graveyard pile shows its top three cards fanned out']
];
const layoutOn = k => !!(settings.layout && settings.layout[k] !== false);
const expandedGroups = new Set();
function groupKey(c) {
  return [c.name, c.tapped ? 't' : 'u', JSON.stringify(c.counters || {}), c.chosen || '', c.token ? 'tok' : '', (c.gained || []).join('|'), c.tmp ? 'tmp' : '', c.exileAtEnd ? 'ex' : '', isSick(c) ? 's' : ''].join('~');
}
function stackableCard(c) {
  if (!c || c.att || c.target || c.targets || c.dmg || c.loyalty !== undefined || c.evoked || c.kicked || c.origName) return false;
  if (state.battlefield.some(x => x.att === c.id)) return false;
  return (c.token || permZone(c) === 'lands');
}
// Rows of the battlefield with identical cards folded into one (v0.67).
function battlefieldRows(cards) {
  const out = { creatures: [], noncreature: [], lands: [] };
  const on = layoutOn('stackCards'), groups = new Map();
  for (const c of cards) {
    const z = permZone(c);
    if (on && stackableCard(c)) { const k = z + '#' + groupKey(c); let g = groups.get(k); if (!g) { g = { key: k, zone: z, cards: [] }; groups.set(k, g); out[z].push(g); } g.cards.push(c); }
    else out[z].push({ key: null, zone: z, cards: [c] });
  }
  return out;
}
function drawBoardStrip() {
  const el = $('#boardstrip'); if (!el) return;
  const on = layoutOn('boardStrip') && state && state.phase === 'play';
  el.hidden = !on; if (!on) return;
  const st = STEPS[state.step], p = state.manaPool || {}, bits = [];
  const nx = state.step >= CLEANUP ? 'next turn' : (STEPS[state.step + 1] || {}).label || '';
  bits.push(h('span', { class: 'bs-phase', text: st ? st.label : '' }), h('span', { class: 'bs-next', text: nx ? '→ ' + nx.toLowerCase() : '' }));
  const chips = ['W', 'U', 'B', 'R', 'G', 'C'].filter(k => (p[k] || 0) > 0).map(k => h('span', { class: `mana-chip ${k}`, text: `${p[k]}${k}` }));
  bits.push(h('span', { class: 'bs-mana' }, ...(chips.length ? chips : [h('span', { class: 'mana-empty', text: 'no mana' })])));
  bits.push(h('span', { class: 'bs-land' + (landDropUsed() ? ' used' : ''), text: landDropUsed() ? 'land drop used' : 'land drop ready', title: 'Whether you can still play a land this turn' }));
  if (state.stack.length) bits.push(h('span', { class: 'bs-stack', text: `stack: ${state.stack.length}` }));
  el.replaceChildren(...bits);
  const zc = $('#zone-creatures'); if (zc) { el.style.left = (zc.offsetLeft + zc.offsetWidth / 2) + 'px'; el.style.top = (zc.offsetTop + zc.offsetHeight + 5 - el.offsetHeight / 2) + 'px'; }
}
window.addEventListener('resize', () => { try { drawBoardStrip(); } catch (e) { /* ignore */ } });

// ---------------------------------------------------------------- Sagas (v0.65)
// Rule 714: a Saga enters with a lore counter; you add another after your draw step (precombat main); chapter abilities trigger as
// the counter total reaches each chapter number; the Saga is sacrificed once the last chapter ability has left the stack.
const SAGA_CH_RE = /^((?:[IVX]+)(?:, [IVX]+)*) \u2014 (.+)$/;
const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 };
function sagaStrip(tx) { return String(tx || '').split('\n').filter(l => !SAGA_CH_RE.test(l.trim())).join('\n'); }
function isSaga(c) { if (!c || c.token) return false; const i = cardInfo(c.name); return !!(i && /\bSaga\b/.test((i.t || '').split(' // ')[0])); }
function sagaChapters(c) {
  const out = [];
  for (const l of String(cardText(c) || '').split('\n')) { const m = l.trim().match(SAGA_CH_RE); if (m) out.push({ nums: m[1].split(', ').map(r => ROMAN[r] || 0), text: m[2], label: m[1] }); }
  return out;
}
function sagaAdvance(c, entering) {
  const chs = sagaChapters(c); if (!chs.length) return;
  c.counters = c.counters || { plus: 0, minus: 0 };
  const before = c.counters.lore || 0;
  let add = 1; if (entering || true) add = adjustCounterAdd(c, 'lore', 1, true);
  c.counters.lore = before + add;
  const n = c.counters.lore, last = Math.max(...chs.flatMap(x => x.nums));
  log(`${c.name}: lore counter added (${n})`);
  for (const ch of chs) if (ch.nums.some(k => k > before && k <= n)) state.pendingTriggers.push({ kind: 'ability', cardId: c.id, cardName: c.name, text: `Chapter ${ch.label} \u2014 ${ch.text}`, effect: ch.text, special: null, optional: /\byou may\b/i.test(ch.text), why: `${c.name} now has ${n} lore counter${n === 1 ? '' : 's'}, so chapter ${ch.label} triggers.` });
  if (n >= last) state.pendingTriggers.push({ kind: 'sagaSac', cardId: c.id });
}
function sagaCheck() {
  if (!state || !state.sagaWait || !state.sagaWait.length) return;
  const keep = [], go = [];
  for (const id of state.sagaWait) { const busy = state.stack.some(o => o.sourceId === id) || state.pendingTriggers.some(t => t.kind === 'ability' && t.cardId === id); (busy ? keep : go).push(id); }
  state.sagaWait = keep;
  for (const id of go) sagaSacrifice(id);
}
function sagaSacrifice(id) {
  const f = findCard(id); if (!f || f.zone !== 'battlefield') return;
  const last = Math.max(...sagaChapters(f.card).flatMap(x => x.nums));
  if ((f.card.counters.lore || 0) < last) return;
  log(`${f.card.name}: final chapter resolved, sacrificed (rule 714.4)`); toast('Saga sacrificed', `${f.card.name} has as many lore counters as its final chapter and its last chapter ability has resolved, so it is sacrificed.`);
  moveCard(f.card.id, 'graveyard'); render();
}

// ---------------------------------------------------------------- settings (card sizes, playmat)
const SET_DEFAULT = {
  bfs: 1, hs: 1, zonea: 0.22, dim: 0.35, theme: 'green', custom: false, fit: 'cover', frame: 'none', frameAnim: true, frameGlow: 0.7, frameA: '#ff7a2f', frameB: '#ffd45c',
  layout: { zoneDepth: true, stackCards: true, dimIdle: true, boardStrip: true, combatLane: true, gyFan: true }, matMotion: 'off', matSpeed: 1, sleevePreset: '', matPreset: '', uiTheme: 'default',
  anim: { on: true, move: true, spell: true, life: true, turn: true, fan: true, hand3d: true, bfFloat: true, speed: 1, fanAmt: 1, spark: 1, spotSize: 1 }, foil: 'off', foilStr: 0.6, cursor: 'default', cursorSize: 32, cursorHot: 'tl', cursorImg: '',
  sound: { on: true, vol: 0.5, music: true, musicVol: 0.4, draw: true, cast: true, enter: true, land: true, resolve: true, counter: true },
  teaching: { master: true, playability: true, phasePopups: true, phasePauses: true, stackGuidance: true,
    triggerPrompts: true, dredgePrompts: true, replaceNotes: true, libraryPreview: true, combatHelper: true, rulesHints: true, phaseBar: true,
    keywordTips: true, keywordIcons: true, durationHints: true, costGuidance: true, preGame: true, autoStart: true, summoningSick: true, libraryMenu: true }
};
let settings = Object.assign({}, SET_DEFAULT, lsGet('mtgpt.settings', {}));
settings.teaching = Object.assign({}, SET_DEFAULT.teaching, settings.teaching || {});
settings.layout = Object.assign({}, SET_DEFAULT.layout, settings.layout || {});
settings.sound = Object.assign({}, SET_DEFAULT.sound, settings.sound || {});
settings.anim = Object.assign({}, SET_DEFAULT.anim, settings.anim || {});
function teach(key){ return settings.teaching[key] !== false; }   // every aid is its own switch
let matUrl = null;
let sleeveUrl = null;
const THEMES = {
  green: 'radial-gradient(ellipse at 50% 25%, #1f3d35 0%, #14261f 52%, #0b1512 100%)',
  blue: 'radial-gradient(ellipse at 50% 25%, #1d3552 0%, #121f33 52%, #0a1220 100%)',
  red: 'radial-gradient(ellipse at 50% 25%, #4a2323 0%, #2c1515 52%, #160b0b 100%)',
  purple: 'radial-gradient(ellipse at 50% 25%, #3a2850 0%, #231832 52%, #120c1b 100%)',
  slate: 'radial-gradient(ellipse at 50% 25%, #2d3138 0%, #1b1e23 52%, #0f1114 100%)',
  black: '#07080a'
};
// Board frames: a coloured, glowing outline for the playmat, zones and hand. Each is two colours + a glow colour.
const FRAMES = {
  none:   { label: 'None' },
  fire:   { label: 'Fire',      a: '#ff4a1c', b: '#ffc23a', glow: 'rgba(255,110,30,.55)' },
  ice:    { label: 'Ice',       a: '#6fd6ff', b: '#e8fbff', glow: 'rgba(120,214,255,.5)' },
  grass:  { label: 'Grass',     a: '#3fbf54', b: '#b6e86a', glow: 'rgba(90,200,90,.45)' },
  storm:  { label: 'Storm',     a: '#7b6bff', b: '#f4e86a', glow: 'rgba(140,120,255,.5)' },
  shadow: { label: 'Shadow',    a: '#8a3fd1', b: '#d96bff', glow: 'rgba(160,70,220,.5)' },
  gold:   { label: 'Royal gold',a: '#d9a53a', b: '#fff0b0', glow: 'rgba(235,185,70,.45)' },
  custom: { label: 'Custom' }
};
function frameColors() {
  const f = FRAMES[settings.frame];
  if (!f || settings.frame === 'none') return null;
  if (settings.frame === 'custom') return { a: settings.frameA, b: settings.frameB, glow: hexA(settings.frameA, .5) };
  return f;
}
function hexA(hex, a) { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return `rgba(255,255,255,${a})`; const n = parseInt(m[1], 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
function applyFrame() {
  const b = document.body, fc = frameColors();
  b.dataset.frame = fc ? settings.frame : 'none';
  b.classList.toggle('frame-anim', !!fc && settings.frameAnim !== false);
  if (fc) {
    b.style.setProperty('--fa', fc.a); b.style.setProperty('--fb', fc.b); b.style.setProperty('--fglow', fc.glow);
    b.style.setProperty('--fi', String(settings.frameGlow));
  } else for (const k of ['--fa', '--fb', '--fglow', '--fi']) b.style.removeProperty(k);
}
function applySettings() {
  applyFrame(); applyCursor(); applyUiTheme();
  const b = document.body.style;
  b.setProperty('--bfs', settings.bfs);
  b.setProperty('--hs', settings.hs);
  b.setProperty('--zonea', settings.zonea);
  b.setProperty('--foil', String(settings.foilStr === undefined ? 0.6 : settings.foilStr));
  // The playmat picture lives on a layer behind the board (#mat::before) so it can move without moving any cards.
  const mat = $('#mat'), mo = settings.matMotion || 'off', shim = mo === 'shimmer';
  const SHIM = 'linear-gradient(105deg, transparent 38%, rgba(255,255,255,.13) 50%, transparent 62%)';
  let bg, size, pos;
  const presetMat = !(settings.custom && matUrl) && settings.matPreset ? artUrl('mat', settings.matPreset) : '';
  if ((settings.custom && matUrl) || presetMat) {
    const fitSize = presetMat ? 'cover' : settings.fit === 'stretch' ? '100% 100%' : settings.fit, dm = presetMat ? settings.dim * 0.4 : settings.dim;
    bg = `${shim ? SHIM + ',' : ''}linear-gradient(rgba(0,0,0,${dm}),rgba(0,0,0,${dm})), url("${presetMat || matUrl}")`;
    size = `${shim ? '250% 100%,' : ''}100% 100%, ${fitSize}`; pos = `${shim ? '0% 0,' : ''}0 0, center`;
  } else {
    let t = THEMES[settings.theme] || THEMES.green; if (t[0] === '#') t = `linear-gradient(${t},${t})`;
    bg = `${shim ? SHIM + ',' : ''}${t}`; size = `${shim ? '250% 100%,' : ''}cover`; pos = `${shim ? '0% 0,' : ''}center`;
  }
  mat.style.backgroundImage = 'none';
  mat.style.setProperty('--matbg', bg); mat.style.setProperty('--matsize', size); mat.style.setProperty('--matpos', pos);
  mat.style.setProperty('--matspeed', String(1 / Math.max(0.25, settings.matSpeed || 1)));
  document.body.dataset.matmotion = mo;
  layoutHand();
}
function saveSettings() { settings.anim=Object.assign({},SET_DEFAULT.anim,settings.anim||{}); settings.sound=Object.assign({},SET_DEFAULT.sound,settings.sound||{}); settings.teaching=Object.assign({},SET_DEFAULT.teaching,settings.teaching||{}); settings.layout=Object.assign({},SET_DEFAULT.layout,settings.layout||{}); lsSet('mtgpt.settings', settings); applySettings(); }
async function loadPlaymat() {
  try {
    const blob = await idbGet('playmat');
    if (blob) { matUrl = URL.createObjectURL(blob); applySettings(); }
  } catch (e) { /* ignore */ }
}


function applySleeve() {
  const el=$('#libstack .cardback');
  if(!el)return;
  const sp = !sleeveUrl && settings.sleevePreset ? artUrl('sleeve', settings.sleevePreset) : '';
  if(sleeveUrl||sp){el.style.backgroundImage=`url("${sleeveUrl||sp}")`;el.style.backgroundSize='cover';el.style.backgroundPosition='center';el.classList.add('custom-sleeve');}
  else{el.style.backgroundImage='';el.classList.remove('custom-sleeve');}
}
async function loadSleeve() {
  try{const blob=await idbGet('sleeve');if(blob){sleeveUrl=URL.createObjectURL(blob);applySleeve();}}catch(e){}
}
let settingsTab = 'gfx';
const SET_TABS = [['gfx', 'Graphics'], ['board', 'Playmat & frame'], ['anim', 'Animations'], ['snd', 'Sound'], ['tutor', 'Tutor mode']];
function openSettings() {
  const m = modal('Settings', { width: 560 });
  const slider = (label, key, min, max, step, fmt) => {
    const val = h('span', { class: 'val', text: fmt(settings[key]) });
    const inp = h('input', { type: 'range', min, max, step, value: settings[key] });
    inp.addEventListener('input', () => { settings[key] = parseFloat(inp.value); val.textContent = fmt(settings[key]); saveSettings(); });
    return h('div', { class: 'setrow' }, h('label', { text: label }), inp, val);
  };
  const pct = v => Math.round(v * 100) + '%';
  const body = m.body;
  const sleeveBox = h('div');
  const sleeveFile = h('input',{type:'file',accept:'image/*',hidden:true});
  const gallery = (kind, list, cur, pick) => h('div', { class: 'artgal' }, [['', kind === 'sleeve' ? 'Classic' : 'Plain colour'], ...list].map(([id, label]) =>
    h('button', { class: 'arttile ' + kind + (cur === id ? ' on' : ''), title: label, onclick: () => pick(id) },
      h('span', { class: 'artimg', style: id ? `background-image:url("${artUrl(kind, id)}")` : '' }), h('span', { class: 'artlbl', text: label }))));
  const drawSleeve = () => sleeveBox.replaceChildren(
    h('div',{class:'small muted',text:'Built-in sleeves for your library pile'}),
    gallery('sleeve', SLEEVES, settings.sleevePreset || '', id => { settings.sleevePreset = id; saveSettings(); applySleeve(); drawSleeve(); }),
    h('div',{class:'setrow'},h('label',{text:'Custom card sleeve'}),h('button',{text:sleeveUrl?'Change sleeve…':'Upload sleeve…',onclick:()=>sleeveFile.click()}),sleeveFile),
    sleeveUrl ? h('div',{class:'setrow'},h('label',{text:'Status'}),h('button',{class:'tgl on',text:'Enabled',onclick:async()=>{try{URL.revokeObjectURL(sleeveUrl);}catch(e){} sleeveUrl=null;try{await idbDelete(['sleeve']);}catch(e){} applySleeve();drawSleeve();}})) : null
  );
  sleeveFile.addEventListener('change',async()=>{const f=sleeveFile.files[0];if(!f)return;if(sleeveUrl)URL.revokeObjectURL(sleeveUrl);sleeveUrl=URL.createObjectURL(f);try{await idbSet('sleeve',f);}catch(e){}applySleeve();drawSleeve();});
  drawSleeve();
  const matBox = h('div');
  const drawMat = () => {
    matBox.replaceChildren(h('div', { class: 'small muted', text: 'Built-in playmats (your own image, if switched on, is shown instead)' }), gallery('mat', MATS, settings.matPreset || '', id => { settings.matPreset = id; if (id) settings.custom = false; saveSettings(); drawMat(); }));
    const sw = h('div', { class: 'swatches' });
    for (const [k, bg] of Object.entries(THEMES)) {
      const b = h('button', { class: 'swatch' + (!settings.custom && settings.theme === k ? ' on' : ''), title: k, style: `background:${bg}` });
      b.addEventListener('click', () => { settings.theme = k; settings.custom = false; saveSettings(); drawMat(); });
      sw.append(b);
    }
    const file = h('input', { type: 'file', accept: 'image/*', hidden: true });
    file.addEventListener('change', async () => {
      const f = file.files[0]; if (!f) return;
      if (matUrl) URL.revokeObjectURL(matUrl);
      matUrl = URL.createObjectURL(f);
      settings.custom = true; saveSettings();
      try { await idbSet('playmat', f); } catch (e) { alert('Playmat applied, but your browser would not save it. You will need to pick it again next time.'); }
      drawMat();
    });
    const fit = h('select');
    for (const [v, l] of [['cover', 'Fill (crop to fit)'], ['contain', 'Fit whole image'], ['stretch', 'Stretch']]) fit.append(h('option', { value: v, text: l }));
    fit.value = settings.fit;
    const motion = h('select'); for (const [v, l] of [['off', 'Still'], ['drift', 'Slow drift'], ['breathe', 'Breathing'], ['shimmer', 'Passing light'], ['parallax', 'Follow the mouse']]) motion.append(h('option', { value: v, text: l }));
    motion.value = settings.matMotion || 'off'; motion.addEventListener('change', () => { settings.matMotion = motion.value; saveSettings(); });
    fit.addEventListener('change', () => { settings.fit = fit.value; saveSettings(); });
    matBox.append(
      h('div', { class: 'setrow' }, h('label', { text: 'Colour' }), sw),
      h('div', { class: 'setrow' }, h('label', { text: 'Custom playmat' }),
        h('button', { text: matUrl ? 'Change image…' : 'Upload image…', onclick: () => file.click() }), file,
        matUrl ? h('button', { class: settings.custom ? 'tgl on' : 'tgl', text: settings.custom ? 'In use' : 'Use it', onclick: () => { settings.custom = !settings.custom; saveSettings(); drawMat(); } }) : '',
        matUrl ? h('button', { class: 'danger', text: 'Remove', onclick: async () => { settings.custom = false; if (matUrl) URL.revokeObjectURL(matUrl); matUrl = null; saveSettings(); try { await idbDelete(['playmat']); } catch (e) { /* ignore */ } drawMat(); } }) : ''),
      h('div', { class: 'setrow' }, h('label', { text: 'Image fit' }), fit),
      slider('Darken playmat', 'dim', 0, 0.85, 0.05, pct),
      h('div', { class: 'setrow' }, h('label', { text: 'Playmat motion' }), motion, h('span', { class: 'muted small', text: 'Slow drift · gentle breathing · a passing light · follows the mouse. Only the picture moves, never the cards.' })),
      slider('Motion speed', 'matSpeed', 0.25, 3, 0.25, v => v + '×'));
  };
  drawMat();
  const frameBox = h('div');
  const drawFrame = () => {
    frameBox.replaceChildren();
    const sw = h('div', { class: 'swatches' });
    for (const [k, f] of Object.entries(FRAMES)) {
      const c = k === 'custom' ? { a: settings.frameA, b: settings.frameB } : f;
      const bg = k === 'none' ? 'var(--panel-2)' : `linear-gradient(135deg, ${c.a}, ${c.b})`;
      const b = h('button', { class: 'fswatch' + (settings.frame === k ? ' on' : ''), title: f.label }, h('span', { class: 'fsw-dot', style: `background:${bg}` }), h('span', { text: f.label }));
      b.addEventListener('click', () => { settings.frame = k; saveSettings(); drawFrame(); });
      sw.append(b);
    }
    const colA = h('input', { type: 'color', value: settings.frameA }), colB = h('input', { type: 'color', value: settings.frameB });
    colA.addEventListener('input', () => { settings.frameA = colA.value; saveSettings(); });
    colB.addEventListener('input', () => { settings.frameB = colB.value; saveSettings(); });
    const anim = h('input', { type: 'checkbox' }); anim.checked = settings.frameAnim !== false;
    anim.addEventListener('change', () => { settings.frameAnim = anim.checked; saveSettings(); });
    frameBox.append(...[
      h('div', { class: 'setrow' }, h('label', { text: 'Board frame' }), sw),
      settings.frame === 'custom' ? h('div', { class: 'setrow' }, h('label', { text: 'Custom colours' }), colA, colB, h('span', { class: 'muted small', text: 'Edge colour and highlight colour' })) : null,
      h('div', { class: 'setrow' }, h('label', { text: 'Animated glow' }), anim, h('span', { class: 'muted small', text: 'Slowly moving light around the frame (off = still outline)' })),
      slider('Frame glow strength', 'frameGlow', 0.1, 1, 0.05, pct)].filter(Boolean));
  };
  drawFrame();
  const teachBox=h('div');
  const teachDefs=[
    ['playability','Card playability indicators','Green/red/gold outlines and the instant-speed badge on cards in hand; green outline on permanents with an activated ability you can use now'],
    ['phaseBar','Phase window','Shows the current phase and the next one at the top of the table'],
    ['phasePopups','Phase explanations','Short pop-up explaining each phase or step as it begins'],
    ['phasePauses','Pause at phase/step starts','Stops the game at each step so triggers and priority can be handled'],
    ['autoStart','Auto-run start of turn','When pauses are off: untap, upkeep and draw happen by themselves'],
    ['preGame','Pre-game actions screen','Pause after keeping a hand for Leylines, Serum Powder and similar'],
    ['stackGuidance','Stack & priority guidance','Explains priority and opens the mana payment window; off = auto-pay'],
    ['keywordIcons','Active keyword icons','Small icons on creatures for keywords they have right now from another permanent or a condition (wings = flying, wizard hat = hexproof…). Hover one for its name and source'],
    ['durationHints','Effect timers','Hourglass badge on permanents with a lasting effect, the explanation in the Active effects window, and a reminder when an effect tied to a source ends'],
    ['costGuidance','Cost explanations','Explains alternative costs, taxes and Delve/Convoke when you cast (the cost windows themselves always appear)'],
    ['triggerPrompts','Triggered ability prompts','Stops to show detected triggered abilities'],
    ['dredgePrompts','Dredge prompt','When you would draw and have a dredge card in your graveyard, asks whether to dredge instead (the dredge rule itself is always correct)'],
    ['replaceNotes','Replacement effect notes','Logs how a replacement effect changed an event, for example Hardened Scales adding a counter'],
    ['libraryPreview','Library card previews','Large card preview while hovering library lists'],
    ['combatHelper','Combat teaching helper','Attack and block guidance during combat, and the reminder when you skip attacking'],
    ['summoningSick','Summoning sickness indicator','Faint red glow and tooltip on creatures that cannot attack or use {T} abilities yet (the rule itself is always enforced)'],
    ['libraryMenu','Library menu tip','Hover tip on the library pile explaining that clicking it opens draw, scry, search and the other library actions (the menu itself always works)'],
    ['rulesHints','Rules hints','Explanations when an action is blocked'],
    ['keywordTips','Keyword explanations','Underlined keywords and keyword chips with hover explanations']
  ];
  const drawTeaching=()=>{teachBox.replaceChildren(
    h('div',{class:'setrow'},h('button',{text:'Turn all on',onclick:()=>{for(const [k] of teachDefs)settings.teaching[k]=true;saveSettings();render();drawTeaching();}}),h('button',{text:'Turn all off',onclick:()=>{for(const [k] of teachDefs)settings.teaching[k]=false;saveSettings();render();drawTeaching();}})),
    ...teachDefs.map(([k,label,desc])=>{
    const cb=h('input',{type:'checkbox'});cb.checked=settings.teaching[k]!==false;
    cb.addEventListener('change',()=>{settings.teaching[k]=cb.checked;saveSettings();render();});
    return h('label',{class:'teachopt'},cb,h('span',null,h('b',{text:label}),h('span',{class:'muted small',text:desc})));
  }))};
  drawTeaching();
  const animBox=h('div');
  const drawAnim=()=>{ animBox.replaceChildren(
    (()=>{ const cb=h('input',{type:'checkbox'}); cb.checked=settings.anim.on!==false; cb.addEventListener('change',()=>{settings.anim.on=cb.checked;saveSettings();render();}); return h('label',{class:'teachopt'},cb,h('span',null,h('b',{text:'Animations & effects'}),h('span',{class:'muted small',text:'Master switch. They only decorate: nothing here changes the game itself. Also off if your system asks for reduced motion.'}))); })(),
    ...ANIM_DEFS.map(([k,label,desc])=>{ const cb=h('input',{type:'checkbox'}); cb.checked=settings.anim[k]!==false; cb.addEventListener('change',()=>{settings.anim[k]=cb.checked;saveSettings();render();}); return h('label',{class:'teachopt'},cb,h('span',null,h('b',{text:label}),h('span',{class:'muted small',text:desc}))); }),
    (()=>{ const mk=(label,key,min,max,step,fmt,desc)=>{ const val=h('span',{class:'val',text:fmt(settings.anim[key])}); const r=h('input',{type:'range',min,max,step,value:settings.anim[key]}); r.addEventListener('input',()=>{settings.anim[key]=parseFloat(r.value);val.textContent=fmt(settings.anim[key]);saveSettings();if(key==='fanAmt')applyFan();}); return h('div',{class:'setrow'},h('label',{text:label}),r,val,h('span',{class:'muted small',text:desc})); };
      return h('div',{class:'animsl'},h('div',{class:'fhead',text:'Fine tuning'}),
        mk('Animation speed','speed',0.4,2.5,0.1,v=>v+'×','Higher = faster. Applies to every animation'),
        mk('Hand fan curve','fanAmt',0,2,0.1,v=>Math.round(v*100)+'%','How strongly the hand arcs (0 = flat row)'),
        mk('Sparkle amount','spark',0,2,0.25,v=>Math.round(v*100)+'%','How many sparks bursts and spell flashes throw (0 = none)'),
        mk('Spell spotlight size','spotSize',0.6,1.5,0.1,v=>Math.round(v*100)+'%','Size of the card shown when a spell is cast or resolves')); })()
  ); }; drawAnim();
  const themeBox=h('div'); themeBox.append((()=>{ const sel=h('select'); for(const [v,l] of UI_THEMES) sel.append(h('option',{value:v,text:l})); sel.value=settings.uiTheme||'default'; sel.addEventListener('change',()=>{settings.uiTheme=sel.value;saveSettings();}); return h('div',{class:'setrow'},h('label',{text:'Interface theme'}),sel,h('span',{class:'muted small',text:'Colours of the panels and buttons'})); })());
  const P={}; for(const [k] of SET_TABS) P[k]=h('div',{class:'settab'});
  P.anim.append(animBox);
  const foilBox=h('div');
  const drawFoil=()=>{ const sel=h('select'); for(const [v,l] of [['off','Off'],['some','Some cards (about 1 in 5)'],['all','Every card']]) sel.append(h('option',{value:v,text:l})); sel.value=settings.foil||'off';
    sel.addEventListener('change',()=>{settings.foil=sel.value;saveSettings();render();});
    const r=h('input',{type:'range',min:0.2,max:1,step:0.05}); r.value=settings.foilStr===undefined?0.6:settings.foilStr; r.addEventListener('input',()=>{settings.foilStr=+r.value;saveSettings();});
    foilBox.replaceChildren(h('div',{class:'setrow'},h('label',{text:'Foil effect'}),sel,h('span',{class:'muted small',text:'A rainbow holographic sheen that slowly sweeps over the card and follows your mouse'})),h('div',{class:'setrow'},h('label',{text:'Foil strength'}),r)); }; drawFoil();
  P.gfx.append(h('div',{class:'fhead',text:'Interface theme'}),themeBox,h('div',{class:'fhead',text:'Foil cards'}),foilBox);
  const curBox=h('div');
  const drawCursor=()=>{
    const sel=h('select'); for(const [v,l] of CURSOR_STYLES) sel.append(h('option',{value:v,text:l})); sel.value=settings.cursor||'default';
    sel.addEventListener('change',()=>{settings.cursor=sel.value;saveSettings();drawCursor();});
    const sz=h('select'); for(const [v,l] of [[24,'Small'],[32,'Medium'],[48,'Large']]) sz.append(h('option',{value:v,text:l})); sz.value=String(settings.cursorSize||32);
    sz.addEventListener('change',()=>{settings.cursorSize=+sz.value;saveSettings();});
    const file=h('input',{type:'file',accept:'image/*',hidden:true});
    file.addEventListener('change',()=>{ const f=file.files[0]; if(!f)return; const img=new Image(), u=URL.createObjectURL(f);
      img.onload=()=>{ const cv=document.createElement('canvas'); cv.width=cv.height=64; const cx=cv.getContext('2d'); const r=Math.min(64/img.width,64/img.height); cx.drawImage(img,(64-img.width*r)/2,(64-img.height*r)/2,img.width*r,img.height*r); settings.cursorImg=cv.toDataURL('image/png'); settings.cursor='custom'; URL.revokeObjectURL(u); saveSettings(); drawCursor(); };
      img.src=u; });
    const hot=h('select'); for(const [v,l] of [['tl','Top-left corner'],['center','Centre']]) hot.append(h('option',{value:v,text:l})); hot.value=settings.cursorHot||'tl';
    hot.addEventListener('change',()=>{settings.cursorHot=hot.value;saveSettings();});
    curBox.replaceChildren(h('div',{class:'setrow'},h('label',{text:'Cursor'}),sel,sz),
      settings.cursor==='custom'?h('div',{class:'setrow'},h('label',{text:'My image'}),h('button',{text:settings.cursorImg?'Change image…':'Choose image…',onclick:()=>file.click()}),file,h('label',{text:'Click point'}),hot,h('span',{class:'muted small',text:'Any picture; it is shrunk to a cursor. Transparent PNGs look best.'})):null);
  }; drawCursor();
  P.gfx.append(h('div',{class:'fhead',text:'Mouse cursor'}),curBox);
  const soundBox=h('div');
  const drawSound=()=>{ soundBox.replaceChildren(
    (()=>{ const cb=h('input',{type:'checkbox'}); cb.checked=!!settings.sound.on; cb.addEventListener('change',()=>{settings.sound.on=cb.checked;saveSettings();musicSettingsChanged();if(cb.checked)sfx('cast');}); return h('label',{class:'teachopt'},cb,h('span',null,h('b',{text:'Sound effects'}),h('span',{class:'muted small',text:'Master switch for all game sounds (made on the fly, no files, works offline)'}))); })(),
    (()=>{ const r=h('input',{type:'range',min:0,max:1,step:0.05}); r.value=settings.sound.vol; r.addEventListener('input',()=>{settings.sound.vol=+r.value;saveSettings();}); r.addEventListener('change',()=>sfx('draw')); return h('div',{class:'setrow'},h('label',{text:'Volume'}),r); })(),
    (()=>{ const cb=h('input',{type:'checkbox'}); cb.checked=settings.sound.music!==false; cb.addEventListener('change',()=>{settings.sound.music=cb.checked;saveSettings();musicSettingsChanged();}); return h('label',{class:'teachopt'},cb,h('span',null,h('b',{text:'Background music'}),h('span',{class:'muted small',text:'A calm, never-ending ambient loop generated in the app. It starts after your first click.'}))); })(),
    (()=>{ const r=h('input',{type:'range',min:0,max:1,step:0.05}); r.value=settings.sound.musicVol; r.addEventListener('input',()=>{settings.sound.musicVol=+r.value;saveSettings();musicSettingsChanged();}); return h('div',{class:'setrow'},h('label',{text:'Music volume'}),r); })(),
    ...SOUND_DEFS.map(([k,label,desc])=>{ const cb=h('input',{type:'checkbox'}); cb.checked=settings.sound[k]!==false; cb.addEventListener('change',()=>{settings.sound[k]=cb.checked;saveSettings();if(cb.checked)sfx(k);}); return h('label',{class:'teachopt'},cb,h('span',null,h('b',{text:label}),h('span',{class:'muted small',text:desc}))); })
  ); }; drawSound();
  P.snd.append(h('div',{class:'fhead',text:'Sound'}),soundBox);
  P.tutor.append(h('div',{class:'fhead',text:'Teaching aids'}),h('div',{class:'small muted',text:'Every aid is its own switch. Mix and match; none depends on another.'}),teachBox);
  P.gfx.append(
    h('div',{class:'fhead',text:'Card size'}),
    slider('Battlefield cards', 'bfs', 0.6, 1.6, 0.05, pct),
    slider('Hand cards', 'hs', 0.6, 1.6, 0.05, pct),
    h('div',{class:'fhead',text:'Card sleeves'}), sleeveBox);
  P.board.append(
    h('div', { class: 'fhead', text: 'Board layout' }),
    ...LAYOUT_DEFS.map(([k, label, desc]) => { const cb = h('input', { type: 'checkbox' }); cb.checked = layoutOn(k); cb.addEventListener('change', () => { settings.layout[k] = cb.checked; saveSettings(); render(); }); return h('label', { class: 'teachopt' }, cb, h('span', null, h('b', { text: label }), ' \u2014 ' + desc)); }),
    h('div', { class: 'fhead', text: 'Playmat' }),
    matBox,
    slider('Zone panel opacity', 'zonea', 0, 0.7, 0.02, pct),
    h('div', { class: 'fhead', text: 'Board frame' }),
    frameBox,
    h('div', { class: 'small muted', style: 'margin-top:8px', text: 'Playmat images are stored in this browser only, so they work offline.' }));
  const tabbar = h('div', { class: 'settabs' }), stage = h('div');
  const showTab = k => { settingsTab = k; for (const b of tabbar.children) b.classList.toggle('on', b.dataset.k === k); stage.replaceChildren(P[k]); };
  for (const [k, label] of SET_TABS) tabbar.append(h('button', { class: 'settabbtn', 'data-k': k, text: label, onclick: () => showTab(k) }));
  body.append(tabbar, stage); showTab(P[settingsTab] ? settingsTab : 'gfx');
  m.foot.append(
    h('button', { text: 'Reset to defaults', onclick: () => { Object.assign(settings, SET_DEFAULT); saveSettings(); m.close(); openSettings(); } }),
    h('button', { class: 'primary', text: 'Close', onclick: () => m.close() }));
}

// ---------------------------------------------------------------- drag & drop
// ---- hand reordering (drag a hand card sideways; a gold line shows where it will land)
let dragHand = null;
function handCardsEls() { return [...$('#row-hand').children]; }
function handSlotAt(x) {   // index in the full hand list (0..n) where a card dropped at x would go
  const els = handCardsEls();
  for (let i = 0; i < els.length; i++) {
    const r = els[i].getBoundingClientRect(), nx = els[i + 1] ? els[i + 1].getBoundingClientRect().left : r.right;
    const vis = Math.max(8, Math.min(r.width, nx - r.left));
    if (x < r.left + vis / 2) return i;
  }
  return els.length;
}
function showHandMarker(slot) {
  const els = handCardsEls(); if (!els.length) return;
  let m = $('#handMarker'); if (!m) { m = h('div', { id: 'handMarker' }); document.body.append(m); }
  const row = $('#row-hand').getBoundingClientRect();
  const r = slot < els.length ? els[slot].getBoundingClientRect() : els[els.length - 1].getBoundingClientRect();
  const x = slot < els.length ? r.left - 4 : r.right + 4;
  m.style.left = (x - 2) + 'px'; m.style.top = (r.top - 4) + 'px'; m.style.height = (r.height + 8) + 'px';
}
function clearHandMarker() { const m = $('#handMarker'); if (m) m.remove(); }
function reorderHand(id, slot) {
  if (!state) return;
  const from = state.hand.findIndex(c => c.id === id); if (from < 0) return;
  const [c] = state.hand.splice(from, 1);
  const to = Math.max(0, Math.min(state.hand.length, slot > from ? slot - 1 : slot));
  state.hand.splice(to, 0, c);
  render();
}
const HAND_SORTS = [
  ['Lands first, then by mana value', 'Land → cheap spells → expensive spells', c => { const i = cardInfo(c.name); return [isLandName(c.name) ? 0 : 1, i ? i.cmc || 0 : 0, c.name]; }],
  ['Mana value, low to high', 'Cheapest first, lands counted as 0', c => { const i = cardInfo(c.name); return [0, i ? i.cmc || 0 : 0, c.name]; }],
  ['Colour', 'Groups cards by colour', c => [0, ['W','U','B','R','G','multi','art','land'].indexOf(colorClass(c)), c.name]],
  ['Playable first', 'Green, then red, then gold', c => [{ ready: 0, mana: 1, timing: 2 }[handInteraction(c)] ?? 3, 0, c.name]],
];
function sortHand(fn) {
  if (!state) return;
  const key = c => fn(c);
  state.hand.sort((a, b) => { const x = key(a), y = key(b); for (let i = 0; i < x.length; i++) { if (x[i] < y[i]) return -1; if (x[i] > y[i]) return 1; } return 0; });
  render();
}
function openHandSortMenu(ev) {
  if (!state) return;
  closeLibMenu();
  const m = h('div', { id: 'libMenu', role: 'menu' }, h('div', { class: 'lm-title', text: 'Sort hand' }),
    ...HAND_SORTS.map(([label, hint, fn]) => { const b = h('button', { class: 'lm-item', role: 'menuitem' }, h('span', { text: label }), h('small', { text: hint })); b.addEventListener('click', e => { e.stopPropagation(); closeLibMenu(); sortHand(fn); }); return b; }));
  document.body.append(m);
  const r = ev.currentTarget.getBoundingClientRect();
  m.style.left = Math.max(6, Math.min(innerWidth - m.offsetWidth - 6, r.left)) + 'px';
  m.style.top = Math.max(6, r.top - m.offsetHeight - 6) + 'px';
  document.addEventListener('keydown', libMenuKey, true);
}

function setupDrop() {
  document.addEventListener('dragover', e => { if (dragHand == null) return; if (e.target.closest && e.target.closest('#handWrap')) { e.preventDefault(); showHandMarker(handSlotAt(e.clientX)); } else clearHandMarker(); });
  $('#btnHandSort').addEventListener('click', e => { e.stopPropagation(); if ($('#libMenu')) closeLibMenu(); else openHandSortMenu(e); });
  const target = e => e.target.closest && e.target.closest('[data-drop]');
  document.addEventListener('dragover', e => { const t = target(e); if (t && !(dragHand != null && t.dataset.drop === 'hand')) { e.preventDefault(); t.classList.add('over'); } });
  document.addEventListener('dragleave', e => { const t = target(e); if (t && !t.contains(e.relatedTarget)) t.classList.remove('over'); });
  document.addEventListener('drop', e => {
    const t = target(e);
    if (!t) return;
    e.preventDefault();
    for (const x of $$('.over')) x.classList.remove('over');
    const d = e.dataTransfer.getData('text/plain');
    if (!d.startsWith('mtg:') || !state) return;
    const id = parseInt(d.slice(4), 10);
    const f = findCard(id);
    if (f && f.zone === 'hand' && t.dataset.drop === 'hand') { const slot = handSlotAt(e.clientX); clearHandMarker(); dragHand = null; reorderHand(id, slot); return; }
    clearHandMarker();
    if (f && f.zone === 'hand' && t.dataset.drop === 'battlefield') {
      if (isLandName(f.card.name)) playLand(id);
      else if (isSpellCard(f.card) || isInstantSpeed(f.card)) castSpell(id);
      else if (canPlaySorcerySpeedNow()) moveCard(id, 'battlefield');
      else toast('Wrong phase', 'This card can only be played during your main phase.');
      return;
    }
    moveCard(id, t.dataset.drop, 'top');
  });
}

// ---------------------------------------------------------------- card model: how the app READS a card (v0.35)
// compileCard() walks the Oracle text line by line and says, for each line, what kind of rule it is
// (keyword, mana ability, activated, triggered, static, loyalty, spell effect) and how much of it the app handles.
// status: 'ok' = the app handles it, 'part' = recognised but some of it is done by hand, 'unk' = not understood, 'info' = reminder text.
const KW_ENFORCED = new Set([...GRANTABLE, 'flash', 'changeling', 'cascade', 'prowess', 'spree', 'suspend', 'living weapon', 'dredge']);
const STATIC_PATTERNS = [
  [/\bskip your draw step\b/i, 'Skips your draw step (the app skips the draw).'],
  [/maximum hand size/i, 'Changes your maximum hand size (applied at cleanup).'],
  [/would be put into (?:your |a )?graveyard from anywhere, exile/i, 'Replacement effect: cards that would go to a graveyard are exiled instead.'],
  [/(?:each land|lands) you control (?:is|are) every basic land type|\b(?:each|all) lands? (?:is|are) (?:every basic land type|a (?:swamp|forest|island|plains|mountain))|nonbasic lands are mountains/i, 'Changes land types (affects Domain, fetch lands on the battlefield, and mana).'],
  [/power and toughness are each equal to|power is equal to|toughness is equal to/i, 'Characteristic-defining ability: power/toughness is calculated live.'],
  [/costs? (?:\{[^}]+\})+ less to cast/i, 'Cost reduction: shown on the card and used when paying.'],
  [/\benters(?: the battlefield)? tapped\b|you may pay 2 life\. if you don't/i, 'Enters tapped (or asks you to pay life, for shock lands).'],
  [/opening hand, you may begin the game with it on the battlefield/i, 'Opening-hand ability: offered on the pre-game screen.'],
  [/enters(?: the battlefield)? with (?:X|twice X|\w+) \+1\/\+1 counters? on it/i, 'Enters with counters: the app adds them when it resolves (X is the X you chose).'],
  [/^(?:this spell|~) can'?t be countered\.?$/i, "Can't be countered: counterspells and abilities that counter it do nothing (checked when you try to counter it)."],
  [/enters(?: the battlefield)? with (?:an?|one|two|three|four|five|six|seven|eight|nine|ten|\d+|X) [a-z-]+ counters? on it/i, 'Enters with counters: the app puts them on as it enters (counter-kind is tracked and shown on the card).'],
  [/you may play (?:an|one|two|three|\d+) additional lands? on each of your turns/i, 'Extra land drops: the app counts land plays against 1 + the additional plays your permanents allow.'],
  [/^(?:~|this \w+) doesn'?t untap during your untap step\.?$|nonbasic lands don'?t untap during their controllers' untap steps/i, "Doesn't untap: the app leaves it tapped during your untap step."],
  [/^As ~ enters the battlefield, choose an? (?!.*\bfrom among\b)/i, 'Choice as it enters: a window asks for your choice (creature type, card name, colour…) and the app remembers it on the card (shown on the tile).'],
  [/^If ~ would enter the battlefield, you may discard an? \w+ card instead/i, 'Replacement effect: when it would enter, a window asks you to discard or sends it to the graveyard (rule 614.1).'],
  [/counters? would be put on .*(?:that many plus (?:one|two|\d+)|twice that many)|would put one or more counters on .*twice that many/i, 'Replacement effect: whenever counters are put on a matching permanent (including as it enters) the app adds the extra counters and logs it. Manual +/- counter buttons are not changed.'],
  [/^Activated abilities of sources with the chosen name can't be activated/i, 'Ability lock: the app refuses to activate abilities of sources with the chosen name.'],
  [/you may have ~ enter the battlefield tapped as a copy of any land/i, 'Vesuva: a window asks which land to copy as it enters; it enters tapped (the Vesuva window handles the name swap).'],
  [/\bdraw a card\b.*\bcycling\b/i, null]
];
const EVENT_DESC = { 'etb-self': 'this enters the battlefield', 'etb-other': 'another permanent enters', landfall: 'a land enters under your control', 'cast-self': 'you cast this spell', cast: 'you cast a matching spell', 'attack-self': 'this attacks', 'attack-any': 'you attack with creatures', 'dies-self': 'this dies', 'dies-other': 'another creature dies', draw: 'you draw a card', 'leaves-self': 'this leaves the battlefield', lifegain: 'you gain life', 'combat-damage-self': 'this deals combat damage', 'combat-damage-any': 'a creature you control deals combat damage' };
// Official-ruling notes for lines the app cannot automate (v0.63). Each is [pattern, note]; a matching line is shown as "partly" (never "understood")
// and carries the rule to follow by hand, instead of the vague "not understood". Patterns run on the text with the card's name replaced by ~.
const RULINGS = [
  [/can block only creatures with flying/i, 'Block restriction (rule 509.1b): it can only be declared as a blocker against flyers. The app has no opposing attackers, so apply this when you block.'],
  [/can'?t be blocked except by/i, 'Evasion (rule 509.1b): only creatures with the listed abilities can block it. The goldfish has no blockers; against a real opponent they must follow this.'],
  [/^(?:equipped|enchanted) (?:creature|permanent) gets? /i, 'Attachment bonus (rules 301.5, 303.4): applies only while attached. The app does not track attachments, so add the bonus with a temporary effect while it is attached.'],
  [/^equip\b|^attach ~ to target creature/i, 'Equip (rule 702.6): sorcery speed, target creature you control; the Equipment stays attached until it moves. Attachments are not tracked by the app.'],
  [/^activated abilities of .* can'?t be activated/i, 'Ability lock (rule 602.5): the listed abilities cannot be activated while this is on the battlefield. The app does not block them; honour it by hand.'],
  [/^as ~ enters(?: the battlefield)?, choose /i, 'Choice as it enters (rule 614.12 / 614.1c): the choice is made as it enters, not when it resolves. Note the choice (for example in the log) and honour it by hand.'],
  [/^if ~ would enter the battlefield, you may /i, 'Replacement effect (rule 614.1): the alternative happens instead of entering. Make the choice as it would enter.'],
  [/counters? would be put (?:on|onto)/i, 'Counter replacement (rule 614.1): adds extra counters whenever the counters are placed. Add the extra counters yourself when it is on the battlefield.'],
  [/^all creatures have |^creatures you control have |^each creature has /i, 'Granted ability (rule 613.1f): applies to every matching creature while this is on the battlefield. Treat the creatures as having it.'],
  [/^you may cast spells from your hand without paying their mana costs/i, 'Alternative cost (rule 118.9): you may cast spells from hand for {0}. Spells with X must use X=0, and additional costs and taxes still apply. Use the "pay" window and choose to pay nothing.'],
  [/^(?:\w+)cycling\b/i, 'Typecycling (rule 702.29e): a cycling ability that searches your library for a card of that type instead of drawing. Pay the cost, discard it, then search by hand.'],
  [/^escape\b/i, 'Escape (rule 702.138): you may cast it from your graveyard by paying the cost and exiling the stated number of other cards from it; some cards have an extra condition (for example, they are sacrificed unless they escaped).'],
  [/^(?:flashback|retrace|jump-start|disturb|aftermath)\b/i, 'Graveyard casting (rules 702.34 and similar): cast it from the graveyard by paying the stated cost; it is exiled if it would leave the stack.'],
  [/^untap ~ during each other player'?s untap step/i, 'Untap (rule 502.3): you also untap this during your opponents\' untap steps. Untap it yourself when the opponent\'s turn begins.'],
  [/^(?:metalcraft|threshold|spell mastery|revolt|ferocious|hellbent|formidable|raid|morbid|fateful hour|coven|descend \d+) —/i, 'Ability word (rule 207.2c): the condition is checked continuously. Count it yourself (metalcraft = three or more artifacts, threshold = seven or more cards in your graveyard).'],
  [/^(?:i|ii|iii|iv|v)(?:, (?:i|ii|iii|iv|v))* —/i, 'Saga chapter (rule 714): put a lore counter on it as your first main phase begins, then the chapter ability triggers; sacrifice it after the final chapter has resolved.'],
  [/^level up\b|^level \d/i, 'Class level (rule 716): pay the level cost at sorcery speed; levels are gained one at a time in order.'],
  [/^(?:this spell|~) can'?t be countered/i, "Can't be countered (rule 101.2 / 701.5): the app refuses to counter it."],
  [/^when you cast this spell, take an extra turn|^take an extra turn after this one/i, 'Extra turn (rule 500.7): the extra turn is taken immediately after this one; extra turns stack, with the last created taken first. Use the "extra turn" tools to start another turn.'],
  [/^this spell costs \{\w\} less to cast for each/i, 'Cost reduction by count (rule 601.2f): the reduction is applied while paying. Enter it in the cost window.'],
  [/^\{T\}: add .* for each /i, 'Variable mana (rule 106.1): the amount depends on the game state when you tap. Float the amount into the pool by hand.']
];
function rulingFor(normText) { const r = RULINGS.find(([re]) => re.test(normText)); return r ? r[1] : null; }
// Rulings for triggers the app cannot watch for (they happen off the battlefield, or on events it does not track).
function triggerRuling(t) {
  const x = String(t).toLowerCase();
  if (/is put into (?:your|a|an opponent's) graveyard from (?:your library|anywhere|the battlefield)|put into a graveyard from anywhere|put into your graveyard from the battlefield/.test(x)) return 'Zone-change trigger (rule 603.6c/603.10a): it looks back at the object as it left. The app watches only permanents on the battlefield, so when this happens add the effect by hand.';
  if (/at the beginning of (?:your|each) upkeep, if ~ is in your graveyard|if ~ is in your graveyard/.test(x)) return 'Graveyard trigger (rule 113.6k): this ability works from the graveyard. The app only watches the battlefield, so check it at the right time yourself (e.g. your upkeep).';
  if (/whenever you cycle|whenever you discard|whenever you cycle or discard/.test(x)) return 'Cycle/discard trigger (rule 702.29d): triggers on each card discarded or cycled. Apply by hand when you discard.';
  if (/becomes the target of|whenever an opponent|opponent controls? .* (?:enters|dies)|whenever a creature an opponent/.test(x)) return 'Opponent-event trigger: the app does not track the opponent\'s board, so apply it when it happens.';
  if (/when ~ has no [a-z+\/-]+ counters on it/.test(x)) return null;
  if (/whenever a player casts/.test(x)) return "Triggers on every player's spells, including yours (rule 603.2). The app only watches your own casts; apply it by hand when the opponent casts.";
  if (/deals combat damage to a creature|dealt damage by|deals damage to a creature/.test(x)) return 'Combat-damage trigger on a creature (rule 510.2): triggers after combat damage is dealt. The goldfish has no opposing creatures; apply when it happens against a real opponent.';
  if (/whenever you tap .* for mana|whenever .* is tapped for mana/.test(x)) return 'Mana-tap trigger (rule 605.5): it triggers when the mana ability resolves and goes on the stack after it. Apply by hand when you tap it.';
  if (/becomes level|becomes the target/.test(x)) return 'Class/level trigger (rule 716.2c): triggers when it reaches that level. Apply by hand when you level it up.';
  if (/you may pay \{.*\}\. when you do|reflexive/.test(x)) return 'Reflexive trigger (rule 603.12): you pay as the first ability resolves; only if you did, the second ability triggers and goes on the stack.';
  if (/when ~ is turned face up|transforms|return him to the battlefield transformed|transformed under/.test(x)) return 'Transform (rule 701.28 / 712): turn the card to its other face; it stays the same object. Use the card\'s flip option.';
  return null;
}
const COMPILE_CACHE = new Map();
function compileCard(c) {
  const info = c && !c.token ? cardInfo(c.name) : null;
  if (!info) return null;
  const ck = norm(info.name) + '|' + (info.tx || '').length + '|' + (info.t || '');
  if (COMPILE_CACHE.has(ck)) return COMPILE_CACHE.get(ck);
  const short = info.name.split(' // ')[0];
  const nameRe = selfNameRe(short);
  const isLand = !!info.land, front = (info.t || '').split(' // ')[0];
  let isSpell = /\b(Instant|Sorcery)\b/.test(front);
  const card = { name: info.name };
  const trig = parseTriggers(card);
  let trigIx = 0;
  const statRecs = parseStaticCard({ id: -1, name: info.name, token: false });
  const lines = [];
  const push = (text, kind, status, note, extra) => lines.push({ text, kind, status, note, ...extra });
  const restrictionNote = (txt) => {
    const rm = txt.match(/Activate (?:this ability )?only ([^.]+)\./i); if (!rm) return { note: '', ok: true };
    const parts = parseRestriction(rm[1]); const bad = parts.filter(p => !p.rec);
    return { note: bad.length ? ` Restriction "${bad.map(b => b.raw).join('; ')}" is not understood and is only a reminder.` : ` Restriction understood: ${parts.map(p => p.rec.label).join(' and ')} (checked as a soft warning).`, ok: !bad.length };
  };
  const faceTypes = String(info.t || '').split(' // '); let faceIx = 0;
  for (const raw of String(info.tx || '').replace(/,\n/g, ', ').replace(/\n(?=\s*[\u2022\u2023])/g, ' ').split('\n')) {
    const text = raw.trim(); if (!text) continue;
    if (text === '//') { faceIx++; isSpell = /\b(Instant|Sorcery)\b/.test(faceTypes[faceIx] || ''); continue; }
    const stripped = text.replace(/\([^)]*\)/g, '').trim();
    if (!stripped) { push(text, 'reminder', 'info', 'Reminder text: it only explains the rules.'); continue; }
    const norml = stripped.replace(nameRe, '~').replace(/\u2019/g, "'");
    let m;
    // loyalty ability
    if (/^[+−–-]?\d+:|^0:/.test(stripped) && /\bPlaneswalker\b/.test(front)) {
      const eff = recognizedEffects(stripped.replace(/^[^:]+:\s*/, '').replace(nameRe, '~'));
      push(text, 'loyalty', eff.length ? 'ok' : 'part', eff.length ? `Loyalty ability: the cost is tracked and the app can apply: ${eff.join('; ')}.` : 'Loyalty ability: the loyalty cost is tracked; apply its effect by hand.');
      continue;
    }
    // cost lines (v0.46)
    if ((m = stripped.match(/^(Evoke|Kicker|Delve|Convoke|Improvise|Cycling|Affinity for\b)/i))) {
      const w = m[1].toLowerCase();
      const NOTE = { evoke: 'Evoke: when you cast it the app offers the evoke cost as a way to pay (including "exile a card from your hand" costs). If you use it, a sacrifice trigger goes on the stack when it enters.',
        kicker: 'Kicker: an optional extra cost offered when you cast it and remembered as "kicked" in the log. The kicked effect itself is applied by hand.',
        delve: 'Delve: a window lets you exile graveyard cards; each pays {1} of the generic cost.', convoke: 'Convoke: a window lets you tap creatures; each pays {1} or one mana of its colour.',
        improvise: 'Improvise: a window lets you tap artifacts; each pays {1}.', cycling: 'Cycling: right-click the card in your hand and choose Cycle. The app pays the cost, discards the card and puts "draw a card" on the stack.',
        'affinity for': 'Affinity: the cost is reduced automatically by the permanents you control.' };
      push(text, 'keyword', w === 'kicker' ? 'part' : 'ok', NOTE[w] || ''); continue;
    }
    if ((m = stripped.match(/^As an additional cost to cast this spell, (.+?)\.?$/i))) {
      const cs = parseCostComps(m[1].replace(/^you may /i, ''), short), unk = cs.filter(k => k.k === 'other');
      push(text, 'cost', unk.length ? 'part' : 'ok', `Additional cost${/^you may/i.test(m[1]) ? ' (optional)' : ''}: the app asks what to pay${unk.length ? ', but "' + unk.map(k => k.text).join('; ') + '" is a cost it does not understand and is left for you to pay by hand' : ' (sacrifice / discard / exile choices appear before the mana window)'}.`); continue;
    }
    if (/rather than pay (?:this spell's|its) mana cost/i.test(stripped)) {
      const alts = altCostsFor({ name: info.name }), bad = alts.some(a => a.comps.some(k => k.k === 'other'));
      push(text, 'cost', alts.length && !bad ? 'ok' : 'part', alts.length ? 'Alternative cost: offered in the "how do you pay?" window when you cast it' + (bad ? ', but part of it is not understood.' : '. Taxes still apply to it.') : 'Alternative cost, but the app could not read it.'); continue;
    }
    if (/\bspells?\b.*\bcost\b.*\b(?:more|less) to cast\b/i.test(stripped) && !/^this\b/i.test(stripped)) {
      push(text, 'static', 'ok', /opponents/i.test(stripped) ? 'Cost effect on opponents’ spells: not used in a goldfish game.' : 'Cost modifier: applied automatically to every spell you cast while this is on the battlefield (shown on the card in hand). Add effects the app cannot see with Tools → Cost effects.'); continue;
    }
    if (/^Equip\b/i.test(stripped)) { push(text, 'activated', 'ok', 'Equip (rule 702.6): a sorcery-speed ability. Right-click the Equipment, choose Activate, pay the cost and pick a creature you control; it stays attached until it moves or either leaves.'); continue; }
    if (/^(?:equipped|enchanted) (?:creature|permanent|land|artifact)\b/i.test(norml) && /can't (?:attack|block)/i.test(norml) && statRecs.some(r => r.kind === 'cant')) { push(text, 'static', 'ok', "Attachment restriction: while attached the creature can't attack (the app removes it from your attackers). Blocking only matters against a real opponent."); continue; }
    if (/^(?:equipped|enchanted) (?:creature|permanent|land|artifact)\b/i.test(norml) && statRecs.some(r => r.subj && r.subj.attach && norml.replace(/,?\s*"[^"]*"/g, '').replace(/\.$/, '').trim() === r.line)) { const q = /"/.test(norml); push(text, 'static', q ? 'part' : 'ok', 'Attachment bonus: applied live to the permanent it is attached to (+P/T, keywords, counted "for each" amounts)' + (q ? '; the quoted ability it also grants is not applied by the app.' : '.')); continue; }
    // keyword line
    if (!/[.:;—]/.test(stripped)) {
      const words = stripped.split(/,\s*/).map(w => w.trim()).filter(Boolean);
      const names = words.map(w => w.toLowerCase().replace(/\s*(?:\{.*|\d+.*)$/, '').trim());
      const known = names.filter(n => KW_ENFORCED.has(n)), other = names.filter(n => !KW_ENFORCED.has(n));
      push(text, 'keyword', !other.length ? 'ok' : known.length ? 'part' : 'part', !other.length ? `Keyword rules known: ${known.join(', ')}.` : `${known.length ? known.join(', ') + ' handled; ' : ''}${other.join(', ')}: explained by the hover tips, but its rules are not enforced.`, { kws: names });
      continue;
    }
    // triggered ability
    if (/^(?:[A-Z][A-Za-z' ]+ — )?(?:When|Whenever|At)\b/.test(stripped)) {
      const t = trig[trigIx++];
      if (t && t.ev) { const eff = recognizedEffects(t.effect); push(text, 'triggered', eff.length ? 'ok' : 'part', `Triggered ability: the app notices the trigger event (${EVENT_DESC[t.ev] || t.ev.replace(/-/g, ' ').replace(':', ': ')}) and puts it on the stack.` + (eff.length ? ` It can apply: ${eff.join('; ')}.` : ' Its effect is applied by hand.'), { ev: t.ev }); }
      else if (/^(?:when|whenever) ~ has no [a-z+\/-]+ counters on it/i.test(norml)) push(text, 'triggered', 'ok', 'State trigger (rule 603.8): the app watches the counters and puts this on the stack once, each time the last one is removed.');
      else { const rl = rulingFor(norml) || triggerRuling(norml); if (rl) push(text, 'triggered', 'part', rl); else push(text, 'triggered', 'unk', 'Triggered ability, but the app does not recognise when it triggers, so it will not fire automatically.'); }
      continue;
    }
    // mana ability
    if (/^(?:[A-Z][A-Za-z' ]+ \u2014 )?\{T\}(?:,[^:]+)?: Add\b/.test(stripped)) {
      const r = isLand ? null : rockInfo(card);
      const extra = /^\{T\},/.test(stripped);
      const rn = restrictionNote(stripped);
      if (isLand) push(text, 'mana', 'ok', 'Mana ability of a land: taps for the listed mana' + (/ for each | \{C\}\{C\}\./.test(stripped) ? ' (the amount is counted from the board when you tap)' : '') + '.' + rn.note);
      else if (r && !extra) push(text, 'mana', rn.ok ? 'ok' : 'part', `Mana ability: taps for ${r.fixed ? r.fixed.join('') : r.among ? 'one mana of a colour among your legendary permanents' : r.choice.length === 5 ? 'one mana of any colour' : 'a choice of ' + r.choice.join('/')}.` + rn.note, { restriction: rn });
      else push(text, 'mana', 'part', (extra ? 'Mana ability with an extra cost. The tap is handled, the extra cost (' + stripped.split(':')[0].replace('{T},', '').trim() + ') is not enforced.' : 'Mana ability the app cannot produce automatically: float the mana by hand.') + rn.note);
      continue;
    }
    // activated ability (cost: effect)
    if ((m = stripped.match(/^([^:]+):\s*(.+)$/)) && COST_WORDS.test(m[1]) && !/^(?:When|Whenever|At)\b/.test(stripped)) {
      const fetch = isLand && fetchInfo({ name: info.name, id: -1 });
      const eff = recognizedEffects(m[2].replace(nameRe, '~'));
      const rn = restrictionNote(stripped);
      const pc = parseAbilityCost(m[1], short), bits = [];
      if (pc.tap) bits.push('{T}'); if (pc.mana) bits.push('mana (payment window)'); if (pc.selfSac) bits.push('sacrifice itself'); if (pc.removeN) bits.push('remove counters'); if (pc.life) bits.push('pay life'); for (const k of pc.comps) bits.push(k.k === 'sac' ? 'sacrifice (you choose which)' : k.k === 'discard' ? 'discard (you choose which)' : k.k === 'exile' ? 'exile (you choose which)' : k.k === 'tapOther' ? 'tap other permanents (you choose)' : 'return to hand (you choose)');
      if (fetch) push(text, 'activated', 'ok', 'Fetch land ability: the app sacrifices the land, pays any life and searches for a matching land.');
      else push(text, 'activated', eff.length && !pc.byHand.length ? 'ok' : 'part', `Activated ability. The app pays: ${bits.join(', ') || 'nothing automatically'}${pc.byHand.length ? '; you pay by hand: ' + pc.byHand.join(', ') : ''}.` + (eff.length ? ` It can apply: ${eff.join('; ')}.` : ' Its effect is applied by hand.') + rn.note);
      continue;
    }
    // static abilities with an engine
    const rec = statRecs.find(r => r.line === norml.replace(/\.$/, ''));
    if (rec) {
      const subjText = norml.replace(/ (?:has|have|get|gets|is|are) .*$/i, '');
      if (rec.kind === 'cond') { push(text, 'static', rec.other.length ? 'part' : 'ok', `${rec.cond === 'ctrl' ? 'Conditional bonus: while you control a ' + rec.need + ' the app applies' : 'Delirium: while there are ' + rec.n + '+ card types in your graveyard the app applies'}`.replace(/applies$/, 'applies') + `  ${[(rec.p || rec.t) ? (rec.p >= 0 ? '+' : '') + rec.p + '/' + (rec.t >= 0 ? '+' : '') + rec.t : '', ...rec.kws].filter(Boolean).join(', ')} live${rec.other.length ? '; “' + rec.other.join('; ') + '” is not enforced' : ''}. A badge on the card shows the count.`); continue; }
      const note = rec.kind === 'color' ? `Static ability: changes the colours of ${subjText.toLowerCase()} (applied to every permanent it describes).`
        : rec.kind === 'kw' ? `Static ability: grants ${rec.items.map(i => i.kws.join('/') + (i.cond ? ' if it’s ' + i.cond : '')).join('; ')} to ${subjText.toLowerCase()}.`
        : `Static ability: ${rec.p >= 0 ? '+' : ''}${rec.p}/${rec.t >= 0 ? '+' : ''}${rec.t} to ${subjText.toLowerCase()}.`;
      push(text, 'static', 'ok', note); continue;
    }
    const sp = STATIC_PATTERNS.find(([re]) => re.test(stripped) || re.test(norml));
    if (sp && sp[1]) { push(text, 'static', 'ok', sp[1]); continue; }
    // spell effect
    if (isSpell) {
      const eff = recognizedEffects(stripped);
      if (/^(?:Domain|Landfall|Delirium|Metalcraft|Threshold|Revolt|Spell mastery)\b/.test(stripped) && sp) { push(text, 'spell', 'ok', sp[1]); continue; }
      push(text, 'spell', eff.length ? 'ok' : 'part', eff.length ? `Spell effect: when it resolves the app offers: ${eff.join('; ')}.` : 'Spell effect: the app puts the spell on the stack and tells you when it resolves, but you apply the effect by hand.'); continue;
    }
    if (/^\+\s*(?:\{[^}]+\})+\s*\u2014/.test(stripped)) { const eff = recognizedEffects(stripped.replace(/^[^\u2014]*\u2014\s*/, '').replace(nameRe, '~')); push(text, 'spell', eff.length ? 'ok' : 'part', `Spree mode: you pick it as you cast, and its cost is added to the spell.` + (eff.length ? ` The app can apply: ${eff.join('; ')}.` : ' You apply its effect by hand.')); continue; }
    { const rl = rulingFor(norml); if (rl) { push(text, 'other', 'part', rl); continue; } }
    push(text, 'other', 'unk', 'Not understood: the app does nothing for this line. Handle it by hand.');
  }
  // modal lines ("Choose one \u2014 \u2022 ... \u2022 ...")
  for (const l of lines) {
    const md = parseModal(l.text); if (!md || md.spree) continue;
    const per = md.modes.map((mo, i) => { const e = recognizedEffects(mo.text.replace(nameRe, '~')); return `mode ${i + 1}: ${e.length ? e.join('; ') : 'by hand'}`; });
    l.note = `Choose ${md.label}. ` + (md.kind==='trigger' ? 'This is a triggered ability, so you pick the mode as the trigger goes on the stack, not when the card is cast. ' : md.kind==='ability' ? 'This is an activated ability, so you pick the mode when you activate it. ' : 'You pick the mode(s) as you cast the spell. ') +  + `Applied automatically per mode \u2014 ${per.join(' | ')}.`;
    l.status = md.modes.every(mo => recognizedEffects(mo.text.replace(nameRe, '~')).length) ? 'ok' : 'part';
    l.kind = 'modal';
  }
  // X in the mana cost
  if ((info.mc || '').split(' // ')[0].includes('{X}')) lines.unshift({ text: info.mc.split(' // ')[0], kind: 'cost', status: 'ok', note: 'Mana cost with {X}: you choose X when casting; it is remembered on the stack and for enters-the-battlefield effects.' });
  const counts = { ok: 0, part: 0, unk: 0, info: 0 };
  for (const l of lines) counts[l.status]++;
  const out = { name: info.name, type: info.t || '', mc: info.mc || '', pt: info.pt || '', lines, counts };
  COMPILE_CACHE.set(ck, out);
  return out;
}
// The effects the app can actually apply for a piece of rules text (mirrors the patterns in openAbilityEffect).
function recognizedEffects(tx) {
  const r = effectOptions(tx, { sourceName: '~', sourceId: -1 }).map(o => o.label ? o.label.toLowerCase() : o.summary);
  if (r.length) return r;
  // effects on a chosen target are applied once the target is picked (targetedOptions), so they count as handled
  const t = String(tx).replace(/\([^)]*\)/g, '');
  if (/\btarget\b/i.test(t) && /\b(?:destroy|exile|tap|untap|counter target|return [^.]*to (?:its|their) owner'?s hand|put (?:a|an|one|two|three|\d+) \+1\/\+1 counters? on|gains? \d+ life|loses? \d+ life|draws? (?:a|one|two|three|\d+) cards?|deals? \d+ damage)/i.test(t)) return ['applies to the target you pick'];
  return r;
}
const READ_CHIP = { ok: ['✓ Understood', 'ok'], part: ['~ Partly', 'part'], unk: ['? Not understood', 'unk'], info: ['• Info', 'info'] };
function readingBody(cc) {
  const box = h('div', { class: 'rd' });
  box.append(h('div', { class: 'rd-head' }, h('b', { text: cc.name }), h('span', { class: 'muted', text: [cc.mc, cc.type, cc.pt].filter(Boolean).join(' · ') })));
  if (!cc.lines.length) box.append(h('div', { class: 'muted', text: 'This card has no rules text, so there is nothing to read.' }));
  for (const l of cc.lines) box.append(h('div', { class: 'rd-line ' + l.status },
    h('span', { class: 'rd-chip ' + l.status, text: READ_CHIP[l.status][0] }),
    h('div', { class: 'rd-txt' }, h('div', { class: 'rd-q', text: l.text }), h('div', { class: 'rd-note', text: `${l.kind[0].toUpperCase() + l.kind.slice(1)}. ${l.note}` }))));
  return box;
}
function openCardReading(name) {
  const cc = compileCard({ name });
  const m = modal('How the app reads this card', { width: 640 });
  if (!cc) { m.body.append(h('div', { class: 'psub', text: 'No card data is loaded for ' + name + '.' })); m.foot.append(h('button', { text: 'Close', onclick: () => m.close() })); return; }
  m.body.append(readingBody(cc), h('div', { class: 'muted small', text: 'Green lines are handled by the app, gold lines are recognised but finished by hand, red lines are ignored by the app.' }));
  m.foot.append(h('button', { text: 'Close', onclick: () => m.close() }));
}
function openCoverage() {
  const m = modal('How the app reads your deck', { width: 760 });
  const names = [...new Set(currentDeckNames())];
  const rows = names.map(n => compileCard({ name: n })).filter(Boolean);
  const tot = { ok: 0, part: 0, unk: 0 };
  for (const r of rows) for (const k of ['ok', 'part', 'unk']) tot[k] += r.counts[k];
  const all = tot.ok + tot.part + tot.unk || 1;
  m.body.append(h('div', { class: 'psub', text: `${rows.length} cards, ${all} rules lines: ${tot.ok} understood (${Math.round(100 * tot.ok / all)}%), ${tot.part} partly (${Math.round(100 * tot.part / all)}%), ${tot.unk} not understood (${Math.round(100 * tot.unk / all)}%).` }));
  if (!rows.length) m.body.append(h('div', { class: 'muted', text: 'No card data loaded for this deck yet. Import the card data first (Tools & Settings > Card data).' }));
  if (cardCount) m.body.append(h('div', { class: 'setrow' }, h('button', { text: 'Scan every card in the card data…', title: 'Ranks the phrasings the reader does not understand across the whole card pool', onclick: () => { m.close(); openPoolScan(); } })));
  const look = h('input', { type: 'text', placeholder: 'Look up any card by name…', style: 'width:100%;margin:6px 0' });
  const list = h('div', { class: 'rd-list' });
  const draw = () => {
    list.replaceChildren();
    const q = look.value.trim().toLowerCase();
    const src = q ? [...CARDS.values()].filter(v => v.name && v.name.toLowerCase().includes(q)).slice(0, 30).map(v => compileCard({ name: v.name })).filter(Boolean) : rows.slice().sort((a, b) => b.counts.unk - a.counts.unk || b.counts.part - a.counts.part || a.name.localeCompare(b.name));
    for (const r of src) {
      const det = h('div', { class: 'rd-detail' }); det.hidden = true;
      const hd = h('button', { class: 'rd-row' }, h('span', { class: 'rd-nm', text: r.name }), h('span', { class: 'rd-ct' }, h('span', { class: 'rd-chip ok', text: '✓ ' + r.counts.ok }), h('span', { class: 'rd-chip part', text: '~ ' + r.counts.part }), h('span', { class: 'rd-chip unk', text: '? ' + r.counts.unk })));
      hd.addEventListener('click', () => { if (det.hidden && !det.firstChild) det.append(readingBody(r)); det.hidden = !det.hidden; });
      list.append(h('div', { class: 'rd-card' }, hd, det));
    }
    if (!src.length) list.append(h('div', { class: 'muted', text: q ? 'No card with that name in the card data.' : '' }));
  };
  look.addEventListener('input', draw); draw();
  m.body.append(look, list);
  m.foot.append(h('button', { text: 'Close', onclick: () => m.close() }));
}

// ---- Coverage scan of the whole card pool: which phrasings does the reader NOT understand, most common first?
function covShape(text, name) {
  let s = String(text || '').replace(/\([^)]*\)/g, '').replace(/\u2019/g, "'").trim();
  const short = String(name || '').split(' // ')[0];
  if (short) s = s.replace(new RegExp(short.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '~');
  return s.toLowerCase().replace(/\{[^}]+\}/g, '{m}').replace(/\b(?:one|two|three|four|five|six|seven|eight|nine|ten|x|\d+)\b/g, 'n').replace(/\s+/g, ' ').trim().slice(0, 120);
}
function covCore(line) {   // the part of a line that says WHAT happens (so cards that differ only in their trigger share a row)
  const t = line.text.replace(/\([^)]*\)/g, '').trim();
  if (line.kind === 'triggered') { const m = t.match(/^(?:[^,]*?\b(?:When|Whenever|At)\b[^,]*,)\s*(.+)$/); return m ? m[1] : t; }
  if (line.kind === 'activated') { const i = t.indexOf(':'); return i > 0 ? t.slice(i + 1).trim() : t; }
  return t;
}
async function scanCardPool(opts, onProgress, cancelled) {
  const seen = new Set(), cards = [];
  for (const v of CARDS.values()) { if (!v || seen.has(v.name)) continue; seen.add(v.name); if (opts.modernOnly && !v.mod) continue; if (opts.format && !(v.lg ? v.lg.includes(opts.format) : (opts.format === 'm' && v.mod))) continue; if (!v.tx || !v.tx.trim()) continue; cards.push(v); }
  const res = { cards: cards.length, full: 0, withUnk: 0, lines: { ok: 0, part: 0, unk: 0, info: 0 }, shapes: new Map(), starts: new Map(), kws: new Map(), byKind: {} };
  const bump = (map, key, extra, name) => { let e = map.get(key); if (!e) { e = { n: 0, ex: [], ...extra }; map.set(key, e); } e.n++; if (e.ex.length < 3 && !e.ex.includes(name)) e.ex.push(name); };
  for (let i = 0; i < cards.length; i++) {
    if (cancelled()) return null;
    const cc = compileCard({ name: cards[i].name }); if (!cc) continue;
    let bad = false;
    for (const l of cc.lines) {
      res.lines[l.status]++;
      const k = (res.byKind[l.kind] = res.byKind[l.kind] || { ok: 0, part: 0, unk: 0, info: 0 }); k[l.status]++;
      if (l.status === 'ok' || l.status === 'info') continue;
      bad = true;
      if (l.kind === 'keyword') {
        for (const w of l.text.split(/,\s*/)) { const n = w.toLowerCase().replace(/\s*(?:\{.*|\d+.*)$/, '').replace(/\u2014.*$/, '').trim(); if (n && !KW_ENFORCED.has(n)) bump(res.kws, n, {}, cc.name); }
        continue;
      }
      const sh = covShape(covCore(l), cc.name); if (!sh) continue;
      bump(res.shapes, l.kind + '|' + sh, { kind: l.kind, status: l.status, shape: sh }, cc.name);
      const st = sh.split(' ').slice(0, 4).join(' ');
      bump(res.starts, l.kind + '|' + st, { kind: l.kind, status: l.status, shape: st + ' …' }, cc.name);
    }
    if (!bad) res.full++; else res.withUnk++;
    if (i % 150 === 0) { onProgress(i + 1, cards.length); await new Promise(r => setTimeout(r, 0)); }
  }
  COMPILE_CACHE.clear();
  return res;
}
function coverageReportText(res, opts) {
  const top = (map, n) => [...map.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, n);
  const L = [];
  const all = res.lines.ok + res.lines.part + res.lines.unk || 1;
  L.push(`MTG Playtester coverage scan (v${APP_VERSION})${opts.format ? ' - ' + ({ s: 'Standard', p: 'Pioneer', m: 'Modern', l: 'Legacy', v: 'Vintage', u: 'Pauper', c: 'Commander' }[opts.format] || opts.format) + '-legal cards only' : opts.modernOnly ? ' - Modern-legal cards only' : ''}`);
  L.push(`${res.cards} cards, ${all} rules lines. Understood ${res.lines.ok} (${Math.round(100 * res.lines.ok / all)}%), partly ${res.lines.part} (${Math.round(100 * res.lines.part / all)}%), not understood ${res.lines.unk} (${Math.round(100 * res.lines.unk / all)}%).`);
  L.push(`Cards fully handled: ${res.full} of ${res.cards} (${Math.round(100 * res.full / (res.cards || 1))}%).`, '');
  L.push('BY KIND (understood / partly / not understood)');
  for (const [k, v] of Object.entries(res.byKind)) L.push(`  ${k}: ${v.ok} / ${v.part} / ${v.unk}`);
  L.push('', 'MOST COMMON UNRECOGNISED PHRASES (count | kind | status | phrase | example cards)');
  for (const [, e] of top(res.shapes, 150)) L.push(`  ${e.n} | ${e.kind} | ${e.status} | ${e.shape} | ${e.ex.join('; ')}`);
  L.push('', 'MOST COMMON PHRASE STARTS');
  for (const [, e] of top(res.starts, 60)) L.push(`  ${e.n} | ${e.kind} | ${e.shape} | ${e.ex.join('; ')}`);
  L.push('', 'KEYWORDS THE APP ONLY EXPLAINS (does not enforce)');
  for (const [k, e] of top(res.kws, 50)) L.push(`  ${e.n} | ${k} | ${e.ex.join('; ')}`);
  return L.join('\n');
}
function openPoolScan() {
  if (!cardCount) { toast('No card data', 'Load the Scryfall Oracle file first (Tools & Settings > Card data).'); return; }
  const m = modal('Scan every card', { width: 860 });
  const hasMod = [...CARDS.values()].some(v => v.mod);
  const hasLg = [...CARDS.values()].some(v => v.lg);
  const fmtSel = h('select', { title: 'Only scan cards legal in this format' }, ...[['', 'All cards'], ['s', 'Standard'], ['p', 'Pioneer'], ['m', 'Modern'], ['l', 'Legacy'], ['v', 'Vintage'], ['u', 'Pauper'], ['c', 'Commander']].map(([v, t]) => h('option', { value: v, text: t })));
  fmtSel.value = hasLg || hasMod ? 'm' : '';
  const modChk = { get checked() { return false; }, set checked(v) {} };
  const out = h('div'), prog = h('div', { class: 'muted small', text: '' });
  let cancel = false, last = null, lastOpts = null, running = false;
  const origClose = m.close; m.close = () => { cancel = true; origClose(); };
  const tabs = ['Phrases', 'Phrase starts', 'Keywords']; let tab = 0;
  const draw = () => {
    out.replaceChildren(); if (!last) return;
    const res = last, all = res.lines.ok + res.lines.part + res.lines.unk || 1;
    out.append(h('div', { class: 'psub', text: `${res.cards.toLocaleString()} cards, ${all.toLocaleString()} rules lines: ${Math.round(100 * res.lines.ok / all)}% understood, ${Math.round(100 * res.lines.part / all)}% partly, ${Math.round(100 * res.lines.unk / all)}% not understood. ${res.full.toLocaleString()} cards (${Math.round(100 * res.full / (res.cards || 1))}%) are fully handled.` }));
    const bar = h('div', { class: 'tabs' }); tabs.forEach((t, i) => bar.append(h('button', { class: 'tgl' + (i === tab ? ' on' : ''), text: t, onclick: () => { tab = i; draw(); } }))); out.append(bar);
    const src = tab === 0 ? res.shapes : tab === 1 ? res.starts : res.kws;
    const rows = [...src.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 80);
    const tbl = h('div', { class: 'cov-tbl' });
    for (const [key, e] of rows) tbl.append(h('div', { class: 'cov-row' }, h('span', { class: 'cov-n', text: String(e.n) }), h('span', { class: 'cov-k ' + (e.status || ''), text: tab === 2 ? 'keyword' : e.kind }), h('span', { class: 'cov-s', text: tab === 2 ? key : e.shape }), h('span', { class: 'cov-x muted small', text: e.ex.join(' · ') })));
    out.append(tbl);
  };
  const goBtn = h('button', { class: 'primary', text: 'Scan' });
  const saveBtn = h('button', { text: 'Save report…', disabled: true });
  const copyBtn = h('button', { text: 'Copy report', disabled: true });
  const run = async () => {
    if (running) return; running = true; cancel = false; lastOpts = { modernOnly: false, format: fmtSel.value };
    prog.textContent = 'Scanning…'; goBtn.disabled = true;
    const res = await scanCardPool(lastOpts, (i, n) => { prog.textContent = `Scanning ${i.toLocaleString()} / ${n.toLocaleString()}…`; }, () => cancel);
    running = false; goBtn.disabled = false; if (!res) return;
    last = res; prog.textContent = 'Done.'; draw(); saveBtn.disabled = false; copyBtn.disabled = false;
  };
  goBtn.addEventListener('click', run);
  saveBtn.addEventListener('click', () => { const a = h('a', { href: URL.createObjectURL(new Blob([coverageReportText(last, lastOpts)], { type: 'text/plain' })), download: 'mtg-playtester-coverage.txt' }); document.body.append(a); a.click(); a.remove(); });
  copyBtn.addEventListener('click', async () => { try { await navigator.clipboard.writeText(coverageReportText(last, lastOpts)); toast('Copied', 'The report is on your clipboard.'); } catch (e) { toast('Could not copy', 'Use Save report instead.'); } });
  m.body.append(h('div', { class: 'psub', text: 'Runs the card reader over every card in your card data and ranks the rules phrasings it does not understand, most common first. That list is the to-do list for teaching the app new effects.' }),
    h('div', { class: 'setrow' }, hasLg || hasMod ? h('label', { class: 'chk' }, 'Only cards legal in: ', fmtSel) : h('span', { class: 'muted small', text: 'Re-import the Oracle file to enable the format filter.' }), goBtn, prog), out);
  m.foot.append(copyBtn, saveBtn, h('button', { text: 'Close', onclick: () => m.close() }));
}

// ---------------------------------------------------------------- utility menu
function toggleUtilityMenu(force) {
  const menu = $('#utilityMenu');
  const btn = $('#btnTools');
  if (!menu || !btn) return;
  const open = force === undefined ? menu.hidden : !!force;
  menu.hidden = !open;
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

// ---------------------------------------------------------------- wiring
function init() {
  refreshDeckSelect();
  $('#deckSelect').addEventListener('change', e => { lsSet('mtgpt.current', e.target.value); prepareImages(); });
  $('#btnDecks').addEventListener('click', openDeckPicker);
  $('#btnTools').addEventListener('click', e => { e.stopPropagation(); toggleUtilityMenu(); });
  $('#utilityMenu').addEventListener('click', e => e.stopPropagation());
  $('#btnDeckEdit').addEventListener('click', () => { toggleUtilityMenu(false); openDeckEditor(); });
  setupVersionBadge();
  if (window.desktop && window.desktop.ghCheck && settings.autoUpdateCheck !== false) setTimeout(async () => { try { const r = await window.desktop.ghCheck(); if (r && r.ok && r.newer) { toast('Update available', `Version ${r.latest} is on GitHub. Open the menu → Update app to read what changed and install it.`); const b = $('#btnUpdate'); if (b) b.textContent = b.textContent.replace(/ ●$/, '') + ' ●'; } } catch (e) { /* offline: stay quiet */ } }, 4000);
  if (window.desktop) { $('#btnUpdate').hidden = false; $('#btnUpdate').addEventListener('click', () => { toggleUtilityMenu(false); openUpdate(); }); }
  if ($('#btnFx')) $('#btnFx').addEventListener('click', openEffects);
  if ($('#btnFxMenu')) $('#btnFxMenu').addEventListener('click', () => { toggleUtilityMenu(false); openEffects(); });
  if ($('#btnCostFx')) $('#btnCostFx').addEventListener('click', () => { toggleUtilityMenu(false); openCostFx(); });
  $('#btnCards').addEventListener('click', () => { toggleUtilityMenu(false); openCardData(); });
  $('#fileCards').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) importCardData(f); });
  $('#btnNew').addEventListener('click', startGame);
  $('#btnDraw').addEventListener('click', drawOne);
  $('#btnUntap').addEventListener('click', untapAll);
  $('#btnNext').addEventListener('click', nextTurn);
  $('#btnNextPhase').addEventListener('click', nextPhase);
  setupLibraryMenu();
  window.addEventListener('resize', layoutHand);
  $('#btnShuffle').addEventListener('click', shuffleLibrary);
  $('#btnUndo').addEventListener('click', undo);
  $('#btnToken').addEventListener('click', openToken);
  $('#btnStack').addEventListener('click', openStack);
  $('#btnResolveStack').addEventListener('click', openStack);
  $('#btnStats').addEventListener('click', () => { toggleUtilityMenu(false); openStats(); });
  $('#btnReading').addEventListener('click', () => { toggleUtilityMenu(false); openCoverage(); });
  setupKeywordTips();
  $('#btnSettings').addEventListener('click', () => { toggleUtilityMenu(false); openSettings(); });
  $('#btnImages').addEventListener('click', () => { toggleUtilityMenu(false); openImages(); });
  window.addEventListener('online', () => { setImgStatus(); maybeAutoDownload(); });
  window.addEventListener('offline', () => setImgStatus('Images: offline, using saved images'));
  for (const b of $$('[data-open]')) b.addEventListener('click', () => openZone(b.dataset.open));
  $('#btnOppDraw').addEventListener('click', openOppDraw);
  $('#btnTokens').addEventListener('click', openTokenTray);
  for (const b of $$('[data-opp]')) b.addEventListener('click', () => changeOppLife(parseInt(b.dataset.opp, 10)));
  $('#btnCombat').addEventListener('click', openCombatHelper);
  for (const b of $$('[data-life]')) b.addEventListener('click', () => changeLife(parseInt(b.dataset.life, 10)));
  $('#mat').addEventListener('click', () => { if (selected) { selected = null; render(); } });
  setupDrop();

  document.addEventListener('click', () => toggleUtilityMenu(false));

  let fitResizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(fitResizeTimer);
  fitResizeTimer = setTimeout(() => { fitBattlefieldCards(); layoutHand(); }, 60);
});

document.addEventListener('keydown', e => {
    if (e.target.closest('input, textarea, select')) return;
    if ($('#modalRoot').children.length) { if (e.key === 'Escape' && !$('#modalRoot').lastElementChild.querySelector('.modal[data-noclose]')) $('#modalRoot').lastElementChild.querySelector('header button').click(); return; }
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); undo(); }
    else if (e.ctrlKey || e.metaKey || e.altKey) return;
    else if (k === 'd') drawOne();
    else if (k === 'u') untapAll();
    else if (k === 'n') nextTurn();
    else if (k === ' ') { e.preventDefault(); if (document.activeElement) document.activeElement.blur(); nextPhase(); }
    else if (k === 's') shuffleLibrary();
    else if (k === 't' && selected) toggleTap(selected);
    else if (k === 'escape') hideMenu();
  });

  applySettings();
  loadPlaymat();
  loadSleeve();
  render();
  updateDbStatus();
  idbGet('cards').then(list => {
    if (Array.isArray(list) && list.length) { installCards(list); render(); }
    else updateDbStatus();
  }).then(() => { prepareImages(); setTimeout(promptFirstBoot, 600); });
}

init();

})();
