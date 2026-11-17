// ---------------------------------------------------------------- helpers
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

// Native append()/replaceChildren() turn null into the text "null". Make every element skip empty children (v0.70.2).
for (const fn of ['append', 'prepend', 'replaceChildren']) {
  const native = Element.prototype[fn];
  Element.prototype[fn] = function (...kids) { return native.apply(this, kids.flat(Infinity).filter(k => k != null && k !== false)); };
}
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

const NORM_CACHE = new Map();   // v0.96.16 pure and called thousands of times per redraw: remember results (bounded)
const norm = s => { const k = String(s); let v = NORM_CACHE.get(k); if (v === undefined) { v = k.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim(); if (NORM_CACHE.size > 20000) NORM_CACHE.clear(); NORM_CACHE.set(k, v); } return v; };

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

