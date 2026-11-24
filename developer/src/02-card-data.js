// ---------------------------------------------------------------- card data
let CARDS = new Map();      // normalized name -> compact card
let cardCount = 0;

// v0.95.0 Token database: the Scryfall file also holds the official token cards (name, type, rules text, power/toughness, colours). They are kept apart
// from the playable cards and used to give every token its real rules text, so a token acts as a card (statics, triggers, abilities).
let TOKENDB = new Map();   // norm(name) -> [{ n, t, tx, pt, col }]
function compactToken(o) {
  const f = o.card_faces && o.card_faces.length ? o.card_faces[0] : o, pow = f.power != null ? f.power : o.power, tou = f.toughness != null ? f.toughness : o.toughness;
  const tx = f.oracle_text != null ? f.oracle_text : (o.oracle_text || '');
  return { n: o.name.split(' // ')[0], t: String(f.type_line || o.type_line || ''), tx, pt: pow != null && tou != null ? pow + '/' + tou : '', col: f.colors || o.colors || [] };
}
function installTokens(list) {
  TOKENDB = new Map();
  for (const r of list || []) { const k = norm(r.n); if (!TOKENDB.has(k)) TOKENDB.set(k, []); const a = TOKENDB.get(k), sig = y => [y.pt, y.t, y.col.slice().sort().join(''), String(y.tx).replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()].join('|'); if (!a.some(x => sig(x) === sig(r))) a.push(r); }
}
// The official token that matches what a card says it creates ("a 0/0 colorless Construct artifact creature token ..."), or null.
function officialToken(name, pt, col, tx) {
  const a = TOKENDB.get(norm(name)); if (!a || !a.length) return null;
  const cs = (col || []).slice().sort().join('');
  const score = r => (r.pt === (pt || '') ? 4 : 0) + (r.col.slice().sort().join('') === cs ? 2 : 0) + (tx && r.tx.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim() === String(tx).replace(/\s+/g, ' ').trim() ? 1 : 0);
  let best = null, bs = -1; for (const r of a) { const sc = score(r); if (sc > bs) { bs = sc; best = r; } }
  return bs >= 2 ? best : null;
}
const SKIP_LAYOUTS = new Set(['token', 'double_faced_token', 'emblem', 'art_series', 'vanguard', 'scheme', 'planar', 'augment', 'host']);

// v0.99.62 MTGJSON (the backup card source, used when Scryfall cannot be reached, e.g. on some phones) writes loyalty costs as "[+2]: ..." where Scryfall writes "+2: ...".
const fixLoyaltyText = tx => typeof tx === 'string' && tx.includes('[') ? tx.replace(/^\[([+−–‒-]?(?:\d+|X))\]:/gm, '$1:') : tx;
function fixCardRecord(c) { if (c && c.tx) c.tx = fixLoyaltyText(c.tx); return c; }
function compact(o) {
  const faces = o.card_faces && o.card_faces.length ? o.card_faces : null;
  const text = fixLoyaltyText(o.oracle_text != null ? o.oracle_text : (faces ? faces.map(f => f.oracle_text || '').join('\n//\n') : ''));
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
  if (faces) {
    c.faces = faces.map(f => f.name);
    c.lo = o.layout || '';   // v0.73 layout (transform / modal_dfc / adventure / split ...)
    c.fpt = faces.map(f => (f.power != null && f.toughness != null) ? f.power + '/' + f.toughness : (f.loyalty ? 'Loyalty ' + f.loyalty : ''));
    c.fcl = faces.map(f => f.colors || (f.name === faces[0].name ? colors : []));
    c.fml = faces.map(f => f.mana_cost || '');
  }
  if (o.produced_mana && o.produced_mana.length) c.prod = o.produced_mana;
  return c;
}

// v0.73 Real card faces. A transform or modal double-faced card used to be read as ONE card whose rules text was both faces glued together,
// so the back face's keywords/abilities leaked onto the front (Delver of Secrets "had flying"). Now `tx` is the front face only and `fc` holds
// every face as its own record. A permanent that is turned over takes the back face's name (c.faceOf remembers the real one), so every
// lookup by name - type, power/toughness, abilities, triggers - sees the face that is actually up (rule 712).
// Split, aftermath and adventure cards keep the old combined reading for now (their halves are cast separately; see the changelog).
const FACES = new Map();   // normalized back-face name -> face record
function regFaces(c) { if (c && c.fc) for (const fr of c.fc) if (fr.fi >= 1 || (fr.half && fr.fi === 0)) FACES.set(norm(fr.name), fr); return c; }
function normFaces(c) {
  if (!c) return c;
  if (c.fc !== undefined) return regFaces(c);
  c.fc = null;
  if (!c.faces || c.faces.length < 2 || typeof c.tx !== 'string' || !c.tx.includes('\n//\n')) return c;
  const txs = c.tx.split('\n//\n'), ts = String(c.t || '').split(' // ');
  if (txs.length !== c.faces.length || ts.length !== c.faces.length) return c;
  const mls = c.fml && c.fml.length === c.faces.length ? c.fml : null, mp = String(c.mc || '').split(' // ');
  const adv = ts.some(t => /\bAdventure\b/.test(t)), spl = !adv && ts.every(t => /^(?:Instant|Sorcery)\b/.test(t.replace(/^(?:Legendary|Snow|Tribal)\s+/, '')));
  if (adv || spl) {   // v0.77: the halves of an adventure / split / aftermath card are spells you cast one at a time
    c.kind = adv ? 'adventure' : (/\baftermath\b/i.test(txs[1] || '') ? 'aftermath' : 'split');
    c.fc = c.faces.map((n, i) => {
      const mc = mls ? mls[i] : (mp.length === c.faces.length ? mp[i] : (i === 0 ? mp[0] : ''));
      const r = { name: n, t: ts[i], tx: txs[i], mc, cmc: 0, land: false, bf: c.name, fi: i, kind: c.kind, col: (c.fcl && c.fcl[i]) || (i === 0 ? c.col : []) };
      r.half = !(adv && i === 0);   // an adventure's creature half is the card itself
      if (typeof symCmc === 'function') { try { r.cmc = symCmc(mc) || 0; } catch (e) { /* ignore */ } }
      const pt = (c.fpt && c.fpt[i]) || (i === 0 ? c.pt : ''); if (pt) r.pt = pt;
      if (c.mod) r.mod = 1;
      return r;
    });
    if (adv) c.tx = txs[0];
    return regFaces(c);
  }
  if (c.lo === 'prepare') { c.prep = true; c.kind = 'prepare'; }   // CR 722: a preparation card (creature + prepare spell); only the creature is cast from hand
  const backCost = mls ? !!mls[1] : String(c.mc || '').split(' // ').filter(Boolean).length >= c.faces.length;
  c.mdfc = c.lo ? c.lo === 'modal_dfc' : (backCost || /^(?:Instant|Sorcery)\b/.test(ts[0]));
  c.fc = c.faces.map((n, i) => {
    const r = { name: n, t: ts[i], tx: txs[i], cmc: c.cmc || 0, land: /\bLand\b/.test(ts[i]), bf: c.name, fi: i, col: (c.fcl && c.fcl[i]) || (i === 0 ? c.col : []) };
    r.mc = mls ? mls[i] : (i === 0 ? String(c.mc || '').split(' // ')[0] : '');
    const pt = (c.fpt && c.fpt[i]) || (i === 0 ? c.pt : ''); if (pt) r.pt = pt;
    if (c.prod && i === 0) r.prod = c.prod;
    if (c.mod) r.mod = 1;
    return r;
  });
  c.tx = txs[0];
  return regFaces(c);
}
function buildIndex(list) {
  const m = new Map();
  for (const c of list) {
    normFaces(c);
    m.set(norm(c.name), c);
    if (c.faces) c.faces.forEach((f, i) => { if (c.fc && i >= 1) return; const k = norm(f); if (!m.has(k)) m.set(k, c); });
  }
  return m;
}

function installCards(list) {
  for (const c of list) fixCardRecord(c);   // copies saved by an older version from MTGJSON
  CARDS = buildIndex(list);
  cardCount = list.length;
  updateDbStatus();
}

function updateDbStatus(msg) {
  try { if (cardCount && typeof firstBootPrompt !== 'undefined' && firstBootPrompt) { firstBootPrompt.close(); firstBootPrompt = null; } } catch (e) { /* prompt already gone */ }
  const el = $('#dbStatus');
  el.dataset.state = (cardCount || META.size) ? 'ok' : 'warn';
  if (msg) { el.textContent = msg; return; }
  const tk = typeof tokenTotal === 'function' ? tokenTotal() : 0, tkTxt = tk ? ` · ${tk.toLocaleString()} tokens` : '';
  if (cardCount) el.textContent = `Card data: ${cardCount.toLocaleString()} cards${tkTxt}`;
  else if (META.size) el.textContent = `Card data: ${deckMetaCount().toLocaleString()} cards${tkTxt}`;
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
    if (raw && !Array.isArray(raw) && raw.data && raw.meta && typeof raw.data === 'object') {   // MTGJSON AtomicCards / ModernAtomic …
      const first = Object.values(raw.data)[0];
      if (!Array.isArray(first)) { alert('That looks like an MTGJSON “AllPrintings” file, which is organised by set. Please use “AtomicCards” (or ModernAtomic, LegacyAtomic…) instead.'); updateDbStatus(); return; }
      raw = mtgjsonToCards(raw);
    }
    if (!Array.isArray(raw)) { alert('Unexpected format. Use the "Oracle Cards" bulk file from Scryfall or an "AtomicCards" file from MTGJSON.'); updateDbStatus(); return; }
    updateDbStatus('Indexing cards…');
    await new Promise(r => setTimeout(r, 30));
    const out = []; const seen = new Set(); const toks = [];
    for (const o of raw) {
      if (!o || !o.name) continue;
      if (o.layout === 'token' || o.layout === 'double_faced_token' || o.layout === 'emblem') { if (o.set_type === 'funny' || o.set_type === 'memorabilia') continue; try { toks.push(compactToken(o)); } catch (e) { /* ignore */ } continue; }
      if (SKIP_LAYOUTS.has(o.layout)) continue;
      const k = norm(o.name);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(compact(o));
    }
    if (!out.length) { alert('No cards found in that file.'); updateDbStatus(); return; }
    installCards(out); mergeTokens(toks);
    let saved = true;
    try { await idbSet('cards', out); await idbSet('tokens', (() => { const a = []; TOKENDB.forEach(x => x.forEach(r => a.push(r))); return a; })()); } catch (e) { saved = false; }
    updateDbStatus();
    syncTokens(true);
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
try { const m = JSON.parse(localStorage.getItem('mtgpt.meta') || '{}'); for (const k in m) META.set(k, fixCardRecord(normFaces(m[k]))); } catch (e) { /* ignore */ }
function saveMeta() { try { localStorage.setItem('mtgpt.meta', JSON.stringify(Object.fromEntries(META))); } catch (e) { /* ignore */ } }
function setMeta(card, asked) {
  const c = normFaces(compact(card));
  for (const k of [norm(card.name), asked && norm(asked), ...(c.faces || []).map(norm)]) if (k) META.set(k, c);
  if (!cardCount) updateDbStatus();
}
function deckMetaCount() { return new Set([...META.values()].map(c => c.name)).size; }
function cardInfo(name) { const k = norm(name); return FACES.get(k) || CARDS.get(k) || META.get(k) || null; }

function resolve(name) {
  let k = norm(name);
  let c = CARDS.get(k) || META.get(k);
  if (!c && k.includes('/')) { const k2 = norm(k.replace(/\s*\/+\s*/, ' // ')); c = CARDS.get(k2) || META.get(k2); }
  if (!c) { const fr = FACES.get(k); if (fr) c = CARDS.get(norm(fr.bf)) || META.get(norm(fr.bf)); }   // a deck line that names only the back face
  return c || null;
}
// v0.95.0 What a permanent says, as a card record: a token's own rules text, or the card's. Used by everything that reads abilities.
// CR 207.2c: an ability word is only a label (italic text) with no rules meaning. "Metalcraft — ~ gets +2/+2 as long as you control three or more artifacts" is just that sentence,
// so the engine reads every line without the label and the condition inside the sentence does the work. (The card still shows its printed text.)
const AW_RE = /^(?:Addendum|Adamant|Alliance|Battalion|Bloodrush|Channel|Chroma|Cohort|Constellation|Converge|Corrupted|Coven|Delirium|Descend \d+|Domain|Eerie|Enrage|Fateful hour|Ferocious|Formidable|Grandeur|Hellbent|Heroic|Inspired|Join forces|Kinship|Landfall|Lieutenant|Magecraft|Metalcraft|Morbid|Pack tactics|Paradox|Parley|Radiance|Raid|Rally|Revolt|Secret council|Spell mastery|Strive|Survival|Sweep|Tempting offer|Threshold|Undergrowth|Valiant|Void|Will of the council)\s*\u2014\s*/gim;
const stripAW = tx => String(tx == null ? '' : tx).replace(AW_RE, '');
const AW_CACHE = new WeakMap();
function awInfo(base) { if (!base || !base.tx || !AW_RE.test(base.tx)) { AW_RE.lastIndex = 0; return base; } AW_RE.lastIndex = 0; let r = AW_CACHE.get(base); if (!r || r.__src !== base.tx) { r = Object.assign({}, base, { tx: stripAW(base.tx), __src: base.tx }); AW_CACHE.set(base, r); } return r; }
// v0.99.40 the rules a permanent has now: a Class (CR 716.2b) or Spacecraft (CR 721.2) only has the level/station sections it has reached,
// so its triggers and statics are read from that text (marked ovr so the trigger cache keys on the text).
function rulesInfo(c) { const r = rulesInfo0(c); if (!r || !r.tx || !c || c.token || !state) return r; let tx = r.tx; try { tx = classText(c, stationText(c, r.tx)); } catch (e) { return r; } return tx === r.tx ? r : Object.assign({}, r, { tx, ovr: true }); }
function rulesInfo0(c) { if (!c) return null; if (c.token) return c.tk && c.tk.tx ? { name: c.name, tx: c.tk.tx, t: c.tk.type || '', pt: c.tk.pt || '' } : null; const base = cardInfo(c.name); if (base && state) { const ov = ovrOf(c); if (ov && ov.lose) return Object.assign({}, base, { tx: stripAW(ov.grant.concat(c.gained || []).join('\n')), ovr: true }); } return awInfo(base); }
function cardText(c) { return classText(c, stationText(c, stripAW(cardTextRaw(c)))); }
function cardTextRaw(c) { { const ov = c && ovrOf(c); if (ov && ov.lose) return ov.grant.concat(c.gained || []).join('\n'); } if (c && c.token) return (c.tk && c.tk.tx) || ''; const i = c && cardInfo(c.name); let b = i && i.tx ? i.tx : ''; if (c && c.mutParts) { const mx = mutExtraText(c); if (mx) b += '\n' + mx; } if (c && c.splicedTx) b += '\n' + c.splicedTx; return c && c.gained && c.gained.length ? b + '\n' + c.gained.join('\n') : b; }
// ---- v0.73 faces of a card in play
function faceParent(c) { return c && !c.token ? cardInfo(c.faceOf || c.name) : null; }
function isTransformCard(c) { const p = faceParent(c); return !!(p && p.fc && p.fc.length > 1 && !p.mdfc && !p.kind); }   // a transform card (not a modal double-faced one)
function mdfcLandFace(c) { const p = c && !c.token ? cardInfo(c.name) : null; return p && p.fc && p.mdfc && p.fc[1] && p.fc[1].land && !p.land ? p.fc[1] : null; }   // a spell whose back face is a land
// Put a card on the face `fi` (0 = front). It stays the same object (rule 712.8); only what it is "called" and read as changes.
function setFace(c, fi) {
  const p = faceParent(c); if (!p || !p.fc || !p.fc[fi]) return false;
  if (fi === 0) { if (c.faceOf) { c.name = c.faceOf; delete c.faceOf; } delete c.face; return true; }
  if (!c.faceOf) c.faceOf = c.name;
  c.name = p.fc[fi].name; c.face = fi; return true;
}
function transformPerm(id, to) {
  const f = findCard(id); if (!f || f.zone !== 'battlefield' || !isTransformCard(f.card)) return false;
  const c = f.card, p = faceParent(c), was = c.name, next = to !== undefined ? to : (c.face ? 0 : 1);
  snap(); setFace(c, next);
  log(`${was} transformed into ${c.name}`);
  checkNoCounterTriggers && checkNoCounterTriggers();
  render(); return true;
}
// ---- v0.77 casting one half of an adventure / split / aftermath card
// While a half is being cast the card is named after that half (c.faceOf keeps the real name), so cost, type, targets and effect are all read from
// that half alone. It goes back to its whole-card name as soon as it leaves the stack, or if you abandon the cast.
function halfParent(c) { const p = c && !c.token ? cardInfo(c.faceOf || c.name) : null; return p && p.fc && p.kind ? p : null; }
function halfOptions(c) {   // the ways this card in your hand can be cast: fi null = the card itself
  if (!c || c.token || c.faceOf || c.fromExile || c.fromGy) return [];
  const p = cardInfo(c.name); if (!p || !p.fc || !p.kind || p.kind === 'prepare') return [];
  if (p.kind === 'adventure') return [{ fi: null, rec: p.fc[0], label: p.fc[0].name }, { fi: 1, rec: p.fc[1], label: p.fc[1].name + ' (adventure)' }];
  if (p.kind === 'aftermath') return [{ fi: 0, rec: p.fc[0], label: p.fc[0].name }];   // the other half can only be cast from the graveyard
  return p.fc.map((r, i) => ({ fi: i, rec: r, label: r.name }));
}
function castAsHalf(c, fi) { const p = halfParent(c); if (!p) return; if (!c.faceOf) c.faceOf = c.name; c.name = p.fc[fi].name; c.face = fi; c.half = true; }
function restoreHalf(c) { if (c && c.half) { c.name = c.faceOf || c.name; delete c.faceOf; delete c.face; delete c.half; } }
function withHalf(c, fi, fn) {
  if (fi === null || fi === undefined) return fn();
  const was = { n: c.name, f: c.faceOf, fc: c.face, h: c.half }; castAsHalf(c, fi);
  try { return fn(); } finally { c.name = was.n; if (was.f === undefined) delete c.faceOf; else c.faceOf = was.f; if (was.fc === undefined) delete c.face; else c.face = was.fc; if (was.h === undefined) delete c.half; else c.half = was.h; }
}
// A half you chose to cast stays 'chosen' while the cast windows are open; once they are all gone without the spell reaching the stack, the cast was abandoned.
function checkHalfAbandon() { if (state && state.halfChosen && !document.querySelector('#modalRoot .backdrop')) { state.halfChosen = null; healHalves(); render(); } }
function healHalves() {
  if (!state) return;
  for (const c of state.hand.slice()) {
    if (state.halfChosen === c.id) continue;
    if (c.half && c.prepCopy === undefined) restoreHalf(c);   // a prepared spell's copy stays the spell half
    if (c.fromExile) { const i = state.hand.indexOf(c); if (i >= 0) { state.hand.splice(i, 1); delete c.fromExile; state.exile.push(c); } }
    if (c.fromCmd) { const i = state.hand.indexOf(c); if (i >= 0) { state.hand.splice(i, 1); delete c.fromCmd; state.command.push(c); } }   // a cancelled cast from the command zone goes back there
    if (c.fromGy) { const i = state.hand.indexOf(c); if (i >= 0) { state.hand.splice(i, 1); if (c.fromGy.kind === 'disturb' && c.face) setFace(c, 0); delete c.fromGy; state.graveyard.push(c); } }
  }
}
function exileOnAdventure(c) { c.onAdv = true; state.exile.push(c); log(`${c.faceOf || c.name} is exiled on an adventure: you may cast it from exile later`); return 'exile'; }
// v0.94.1 Warp (rule 702.185): after a warped permanent is exiled at the end step you may cast it from exile on a later turn, for its normal cost.
function warpCastable(c) { return !!c && !!state && c.warpExile && state.turn > c.warpExile; }
function castFromExile(id) {
  if (!state) return; const i = state.exile.findIndex(x => x.id === id); if (i < 0) return; const c = state.exile[i]; if (!c.onAdv && !warpCastable(c) && !stashReady(c) && !mayPlayNow(c) && !preparedCastable(c)) return;
  if (!canCastNow(c)) { toast('Wrong timing', 'A card cast from exile follows the normal timing: your main phase with an empty stack for permanents and sorceries; instants any time you have priority.'); return; }
  state.exile.splice(i, 1); c.fromExile = true; state.hand.push(c); state.halfChosen = id; castSpell(id);
}
// ---- v0.79 casting from the graveyard: flashback, escape, aftermath, and flashback granted until end of turn (Snapcaster Mage and friends).
// The card is lifted into your hand with c.fromGy describing the cost you chose, goes through the normal cast flow, and goes back to the graveyard if you abandon it.
function gyCastOptions(c) {
  if (!c || c.token || !state || c.faceOf) return [];
  const info = cardInfo(c.name); if (!info) return [];
  const out = [], tx = String(info.tx || '').replace(/\([^)]*\)/g, '').replace(/\u2019/g, "'"); let m;
  for (const raw of tx.split('\n')) {
    const line = raw.trim();
    if ((m = line.match(/^Flashback\s+((?:\{[^}]+\})+)\s*$/i))) out.push({ kind: 'flashback', label: 'Flashback ' + m[1], mana: m[1], comps: [], fi: null });
    else if ((m = line.match(/^Flashback\s*[\u2014-]\s*(.+?)\.?$/i))) { const cs = parseCostComps(m[1], c.name); out.push({ kind: 'flashback', label: 'Flashback \u2014 ' + m[1], mana: manaOf(cs), comps: cs.filter(k => k.k !== 'mana'), fi: null }); }
    else if ((m = line.match(/^Escape\s*[\u2014-]\s*(.+?)\.?$/i))) { const cs = parseCostComps(m[1], c.name); out.push({ kind: 'escape', label: 'Escape \u2014 ' + m[1], mana: manaOf(cs), comps: cs.filter(k => k.k !== 'mana'), fi: null }); }
  }
  if (/^you may cast (?:this card|~|[^.\n]+?) from your graveyard\.?$/im.test(tx.replace(new RegExp(c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '~')) && info.mc && !info.land) out.push({ kind: 'static', label: 'Cast from your graveyard', mana: info.mc.split(' // ')[0], comps: [], fi: null });   // v0.99.45 Hogaak, Arisen Necropolis (CR 601.3: a permission to cast it from there)
  if (/you may cast this card from your graveyard using its warp ability/i.test(tx)) { for (const w of altCostsFor(c).filter(a => a.kind === 'warp')) out.push({ kind: 'warp', label: w.label + ' (from your graveyard)', mana: w.mana, comps: w.comps, fi: null }); }
  { const gm = tx.match(/you may cast (?:this card|~|[^.\n]*?) from your graveyard as long as you control an? ([a-z]+)/i);   // v0.94.1 Gravecrawler
    if (gm && info.mc && !info.land) { const sub = gm[1].toLowerCase(); if (state.battlefield.some(b => { const pi = permTypeInfo(b); return pi.types.has(sub) || (pi.subs && [...pi.subs].some(x => String(x).toLowerCase() === sub)); })) out.push({ kind: 'static', label: `Cast from your graveyard (you control a ${gm[1]})`, mana: info.mc.split(' // ')[0], comps: [], fi: null }); } }
  if (info.fc && info.fc.length > 1 && !info.mdfc && !info.kind && (m = tx.split('\n').map(l => l.trim().match(/^Disturb\s*(?:[\u2014-]\s*)?((?:\{[^}]+\})+)\s*$/i)).find(Boolean)))   // CR 702.146a: cast this card transformed from your graveyard for its disturb cost
    out.push({ kind: 'disturb', label: `Disturb ${m[1]} (${info.fc[1].name})`, mana: m[1], comps: [], fi: 1 });
  if (info.kind === 'aftermath' && info.fc && info.fc[1]) { const r = info.fc[1]; out.push({ kind: 'aftermath', label: r.name + ' (aftermath)', mana: r.mc || '', comps: [], fi: 1 }); }
  if (c.gfb && c.gfb === state.turn && !out.some(o => o.kind === 'flashback') && info.mc && !info.land) out.push({ kind: 'flashback', label: 'Flashback ' + info.mc.split(' // ')[0] + ' (granted until end of turn)', mana: info.mc.split(' // ')[0], comps: [], fi: null });
  return out;
}
function castFromGraveyard(id, opt) {
  if (!state) return; const i = state.graveyard.findIndex(x => x.id === id); if (i < 0) return; const c = state.graveyard[i];
  const opts = gyCastOptions(c); const o = opt || (opts.length === 1 ? opts[0] : null);
  if (!o) { if (!opts.length) return; const mm = modal(`Cast ${c.name} from your graveyard`, { width: 520 }); for (const x of opts) mm.body.append(h('div', { class: 'row' }, h('span', { class: 'nm' }, x.label), h('button', { class: 'primary', text: 'Cast', onclick: () => { mm.close(); castFromGraveyard(id, x); } }))); return; }
  const ok = withGy(c, o, () => canCastNow(c));
  if (!ok) { toast('Wrong timing', 'A card cast from the graveyard follows normal timing: your main phase with an empty stack for permanents and sorceries; instants any time you have priority.'); return; }
  state.graveyard.splice(i, 1); c.fromGy = { kind: o.kind, label: o.label, mana: o.mana, comps: o.comps, fi: o.fi }; state.hand.push(c); state.halfChosen = id;
  if (o.kind === 'disturb') setFace(c, 1);   // CR 702.146a: it is cast transformed, so the back face is the spell (and, 702.146b, the permanent)
  else if (o.fi !== null && o.fi !== undefined) castAsHalf(c, o.fi);
  castSpell(id);
}
function withGy(c, o, fn) { if (o.fi === null || o.fi === undefined) return fn(); return withHalf(c, o.fi, fn); }
// ---- v0.82 "may play it this turn" cards in exile (impulse draw): lands use your land drop, other cards are cast normally.
// v0.99.68 how long an exiled card stays playable: this turn (mayPlayTurn), through a later turn (mayPlayUntil: "until the end of your next turn"), or always
function mayPlayNow(c) { return !!c && !!state && (c.mayPlayTurn === state.turn || !!c.mayPlayAlways || (c.mayPlayUntil != null && state.turn <= c.mayPlayUntil)); }
function playFromExile(id) {
  if (!state) return; const i = state.exile.findIndex(x => x.id === id); if (i < 0) return; const c = state.exile[i];
  if (!mayPlayNow(c)) { toast('No longer playable', 'The time to play this card from exile has ended.'); return; }
  if (isLandName(c.name)) {
    if (c.mayCastOnly) { toast('Cast only', 'The effect lets you cast this card, and a land cannot be cast.'); return; }
    if (!canPlayLandNow()) { toast(landDropUsed() ? 'Land already played' : 'Wrong phase', 'A land from exile uses your land drop: your main phase, empty stack, and a land play left.'); return; }
    state.exile.splice(i, 1); delete c.mayPlayTurn; delete c.mayPlayUntil; delete c.mayCastOnly; state.hand.push(c); playLand(c.id); return;
  }
  castFromExile(id);
}
// ---- v0.82 look at the top N cards and distribute them (Expressive Iteration, Fact or Fiction style effects, and the 'Look at top N' tool).
// slots: [{ dest: 'hand'|'bottom'|'graveyard'|'exile'|'top', label, count: number | 'rest' | 'any', play }]
function openLookDistribute(want, slots, srcText, onDone) {
  if (!state) return;
  const n = Math.min(want, state.library.length);
  if (!n) { toast('Library is empty', 'There are no cards to look at.'); return; }
  const top = state.library.slice(0, n), asg = top.map(() => null), restIdx = slots.findIndex(x => x.count === 'rest');
  if (restIdx >= 0 && slots.length === 1) asg.fill(restIdx);
  const m = modal(`Look at the top ${n === 1 ? 'card' : n + ' cards'}`, { width: 680, sticky: true, noClose: true });
  const need = () => { let left = n; return slots.map(sl => { if (typeof sl.count !== 'number') return null; const k = Math.min(sl.count, left); left -= k; return k; }); };
  const valid = () => {
    const nd = need(); for (let k = 0; k < slots.length; k++) { if (nd[k] !== null && asg.filter(a => a === k).length !== nd[k]) return false; if (slots[k].max && asg.filter(a => a === k).length > slots[k].max) return false; }
    const anyOpen = slots.some(sl => sl.count === 'rest' || sl.count === 'any'); return anyOpen || asg.every(a => a !== null);
  };
  const confirm = h('button', { class: 'primary', text: 'Confirm' });
  function draw() {
    m.body.replaceChildren();
    if (srcText) m.body.append(h('div', { class: 'sv-src', text: srcText }));
    m.body.append(h('div', { class: 'psub', text: 'Choose where each card goes: ' + slots.map(sl => sl.label).join('; ') + '.' }));
    if (n < want) m.body.append(h('div', { class: 'muted small', text: `Your library only has ${n} card${n === 1 ? '' : 's'}, so you look at all of them.` }));
    top.forEach((c, i) => {
      const info = cardInfo(c.name);
      const row = h('div', { class: 'row' }, h('span', { class: 'nm' }, c.name, ' ', info && info.mc ? symbols(info.mc) : ''), h('span', { class: 'muted small', text: info ? info.t.split(' // ')[0] : '' }),
        ...slots.map((sl, k) => h('button', { class: asg[i] === k ? 'tgl on' : 'tgl', disabled: !!(sl.filt && !sl.filt(c)), text: sl.short || sl.label, title: sl.label, onclick: () => { asg[i] = asg[i] === k ? null : k; draw(); } })));
      row.addEventListener('mouseenter', () => showPreview(c)); m.body.append(row);
    });
    const nd = need(); const lines = slots.map((sl, k) => { const have = asg.filter(a => a === k).length; return typeof sl.count === 'number' ? `${sl.short || sl.label}: ${have}/${nd[k]}` : null; }).filter(Boolean);
    if (lines.length) m.body.append(h('div', { class: 'muted small', text: lines.join('   ·   ') }));
    if (restIdx >= 0) m.body.append(h('div', { class: 'muted small', text: `Cards you do not assign go to: ${slots[restIdx].label}.` }));
    confirm.disabled = !valid();
  }
  confirm.addEventListener('click', () => {
    if (!valid()) return; snap(); state.library.splice(0, n);
    const dest = top.map((c, i) => asg[i] !== null ? asg[i] : restIdx);
    const parts = [];
    top.forEach((c, i) => {
      const sl = slots[dest[i]]; if (!sl) { state.library.unshift(c); return; }
      if (sl.dest === 'battlefield') { enterBattlefield(c, { from: 'library', logMsg: `${srcText || 'Effect'}: ${c.name} put onto the battlefield` }); } else if (sl.dest === 'hand') state.hand.push(c); else if (sl.dest === 'bottom') state.library.push(c); else if (sl.dest === 'graveyard') gyPush(c, 'library');
      else if (sl.dest === 'exile') { if (sl.play) c.mayPlayTurn = state.turn; state.exile.push(c); } else if (sl.dest === 'top') state.library.unshift(c);
      parts.push(`${c.name} → ${sl.dest}${sl.dest === 'exile' && sl.play ? ' (you may play it this turn)' : ''}`);
    });
    log(`${srcText ? srcText + ': ' : ''}looked at the top ${n}: ${parts.join('; ')}`);
    m.close(); render(); if (onDone) onDone();
  });
  m.foot.append(h('button', { text: 'Cancel', onclick: () => m.close() }), confirm);
  draw(); showPreview(top[0]);
}
// Reads "Look at the top N cards of your library. Put one into your hand, put one on the bottom, and exile one. You may play the exiled card this turn."
function parseLookDistribute(tx, inner) {
  const t = String(tx || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim(), sents = t.split(/(?<=[.!?])\s+/);
  const m0 = /^(?:look at|reveal) the top (a|one|two|three|four|five|six|seven|\d+|x) cards? of your library\.?$/i.exec(sents[0] || ''); if (!m0 || sents.length < 2) return null;
  const n = numOf(m0[1]); let play = false; const slots = []; let ok = true; let alt = null;
  for (let sent of sents.slice(1)) {
    // CR 608.2c: "If there is an instant card and a sorcery card in your graveyard, instead put two of them into your hand and the rest on the bottom." (Flow State): an alternative way to sort, chosen by a condition when it resolves
    { const im = /^if (.+?), instead (put .+|exile .+)$/i.exec(sent.replace(/\.$/, '')); if (im) { const a2 = parseLookDistribute(`Look at the top ${m0[1]} cards of your library. ${im[2]}.`); if (a2 && a2.slots.length) { alt = { cond: im[1], slots: a2.slots }; continue; } ok = false; continue; } }
    if (/^you may play (?:it|the exiled card|that card|those cards|them) this turn\.?$/i.test(sent)) { play = true; continue; }
    // "You may reveal a colorless card from among them and put it into your hand." (Ancient Stirrings): reading it as "put up to one colorless card into your hand" keeps the filter and the cap
    const rv = /^(?:you may )?reveal (an?|one|up to (?:one|two|three|\d+)) ([a-z ,]+? cards?)(?: with mana value (?:x|\d+) or (?:less|greater))? from among (?:them|those cards) and put (?:it|them|that card|those cards) into your hand\.?$/i.exec(sent);
    if (rv) sent = `Put up to ${/^up to /i.test(rv[1]) ? rv[1].slice(6) : 'one'} ${rv[2].replace(/,\s*(?:or\s+)?/g, ' or ')}${(/ with mana value (?:x|\d+) or (?:less|greater)/i.exec(sent) || [''])[0]} into your hand.`;
    if (!/^(?:put|exile|then|you may put)\b/i.test(sent)) { ok = false; continue; }
    for (const cl of sent.replace(/\.$/, '').split(/,\s*(?:and\s+)?|\s+and\s+(?=(?:the rest|put|exile|one|two|a)\b)/i)) {
      const c = cl.trim().toLowerCase(); if (!c) continue;
      const cm = /\b(the rest|all the rest|the remaining cards?|any number|up to (?:a|one|two|three|\d+)|one|two|three|a|an|\d+)\b/.exec(c);
      let count = cm ? (/rest|remaining/.test(cm[1]) ? 'rest' : /any number|up to/.test(cm[1]) ? 'any' : numOf(cm[1])) : null;
      let dest = /\bonto the battlefield\b/.test(c) ? 'battlefield' : /\binto your hand\b|\bto your hand\b/.test(c) ? 'hand' : /\bon the bottom\b/.test(c) ? 'bottom' : /\bgraveyard\b/.test(c) ? 'graveyard' : /\bexile\b/.test(c) ? 'exile' : /\bon top of your library\b/.test(c) ? 'top' : null;
      if (count === null && /^exile\b/.test(c)) count = 1;
      if (!dest || count === null) { ok = false; continue; }
      const nm = { hand: 'Hand', bottom: 'Bottom', graveyard: 'Graveyard', exile: 'Exile', top: 'Top', battlefield: 'Battlefield' }[dest];
      // "put up to two creature cards with mana value 3 or less from among them onto the battlefield": a cap and a card filter (CR 608.2c)
      let max = null, filt = null, fdesc = '';
      if (dest === 'battlefield' || dest === 'hand') {
        const um = /\bup to (a|one|two|three|four|five|\d+)\b/.exec(c); if (um) max = numOf(um[1]);
        const fm = /\b(?:put|puts) (?:up to (?:a|one|two|three|four|five|\d+) |any number of |an? |one |two |three |\d+ )?([a-z ]+?) cards?\b(?: with mana value (x|\d+) or (less|greater))?/.exec(c);
        if (fm) fm[1] = fm[1].replace(/,/g, ' ');
        if (fm) { const words = fm[1].trim().split(/\s+/).filter(w => w && w !== 'or' && w !== 'and'), mvn = fm[2] ? (fm[2] === 'x' ? numOf(m0[1]) : +fm[2]) : null, op = fm[3];
          const okWord = w => /^(?:creature|land|artifact|enchantment|planeswalker|permanent|nonland|noncreature|instant|sorcery|colorless)$/.test(w);
          // v0.99.62 subtypes too ("an Elf, Warrior, or Tyvar card"): a word that is not a card type is matched against the subtypes (changelings count)
          if (!words.every(okWord) && words.every(w => okWord(w) || /^[a-z][a-z'-]*$/.test(w))) { const subs = words.filter(w => !okWord(w)), types = words.filter(okWord);
            filt = card => { const info = cardInfo(card.name) || {}, tl = info.t || '', sub = (tl.split('\u2014')[1] || '').toLowerCase(); if (mvn !== null && (op === 'less' ? (info.cmc || 0) > mvn : (info.cmc || 0) < mvn)) return false;
              return types.some(w => new RegExp('\\b' + w + '\\b', 'i').test(tl)) || subs.some(w => new RegExp('\\b' + w + 's?\\b').test(sub)) || (/\bchangeling\b/i.test(info.tx || '') && /\bCreature\b/.test(tl)); };
            fdesc = words.join(' or ') + ' card'; }
          else if (words.every(okWord)) { filt = card => { const info = cardInfo(card.name) || {}, tl = info.t || ''; if (mvn !== null && (op === 'less' ? (info.cmc || 0) > mvn : (info.cmc || 0) < mvn)) return false;
            return words.some(w => w === 'permanent' ? !/\b(?:Instant|Sorcery)\b/.test(tl) : w === 'nonland' ? !/\bLand\b/.test(tl) : w === 'noncreature' ? !/\bCreature\b/.test(tl) : w === 'colorless' ? !/\{[^}]*[WUBRG]/.test(info.mc || '') : new RegExp('\\b' + w + '\\b', 'i').test(tl)); }; fdesc = words.join(' or ') + ' ' + (mvn !== null ? `with mana value ${mvn} or ${op}` : ''); }
          else { ok = false; } }
      }
      slots.push({ dest, count, max, filt, fdesc: fdesc.trim(), label: `${count === 'rest' ? 'the rest' : count === 'any' ? (max ? `up to ${max === 1 ? 'one' : max}${fdesc.trim() ? ' ' + fdesc.trim() + (max === 1 ? '' : 's') : ''}` : 'any number') : count === 1 ? 'one' : count} ${dest === 'hand' ? 'into your hand' : dest === 'bottom' ? 'on the bottom of your library' : dest === 'graveyard' ? 'into your graveyard' : dest === 'top' ? 'on top of your library' : dest === 'battlefield' ? `${fdesc ? '(' + fdesc.trim() + ') ' : ''}onto the battlefield${max ? ' (up to ' + max + ')' : ''}` : 'exiled'}`, short: nm });
    }
  }
  if (!slots.length) return null;
  for (const sl of slots) if (sl.dest === 'exile') sl.play = play;
  if (slots.some(sl => sl.dest === 'exile') && play) slots.find(sl => sl.dest === 'exile').short = 'Exile (may play)';
  // v0.99.68 which sentences this sort carries out (the honesty check credits them even when another sentence, like "You gain 3 life", is a separate effect)
  let covers = [sents[0]];
  if (!inner) for (const sent of sents.slice(1)) { if (/^you may play (?:it|the exiled card|that card|those cards|them) this turn\.?$/i.test(sent) ? play : (() => { const one = parseLookDistribute(sents[0] + ' ' + sent, true); return !!(one && one.full); })()) covers.push(sent); }
  return { n, slots, full: ok, alt, covers };
}
function openHalfChooser(c, opts, pick) {
  const m = modal(`Cast ${String(c.name).split(' // ').join(' / ')}: which half?`, { width: 560, sticky: true, onCancel: () => {} });
  m.body.append(h('div', { class: 'psub', text: 'You cast one half at a time (rule 709 for split cards, 715 for adventures). The other half is ignored while this one is on the stack.' }));
  const list = h('div', { class: 'prelist' });
  for (const o of opts) {
    const st = withHalf(c, o.fi, () => { if (!canCastNow(c)) return { ok: false, why: state.stack.length ? 'only instants can be cast now' : 'wrong timing' }; const pm = canPayMana(c); return pm && !pm.ok ? { ok: false, why: pm.reason === 'color' ? 'not the right colours' : 'not enough mana' } : { ok: true }; });
    const row = h('div', { class: 'row' + (st.ok ? '' : ' dim') }, h('span', { class: 'nm' }, o.label, ' ', o.rec.mc ? symbols(o.rec.mc) : ''), h('span', { class: 'muted small', text: st.ok ? o.rec.t.replace(/\s+—.*$/, '') : `Cannot cast: ${st.why}` }));
    row.addEventListener('click', () => { m.close(); pick(o); });
    list.append(row);
  }
  m.body.append(list);
  m.foot.append(h('button', { text: 'Cancel', onclick: () => m.close() }));
}
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
// A step's start-of-step pause is only a heads-up (v0.69.2): you still have priority in it, so instants, flash and abilities work.
// Only triggers that are waiting to go on the stack hold things up, because they go on the stack before anyone gets priority.
function holdForTriggers() { return !!state && !!state.phasePause && state.pendingTriggers.length > 0; }
function canPlaySorcerySpeedNow() {
  return isMainPhase() && state.stack.length === 0 && !holdForTriggers() && !state.discarding;
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
// v0.91.2 Split second (rule 702.61): while a spell with split second is on the stack, nobody can cast spells or activate abilities that are not mana abilities.
function splitSecondOn() { return !!state && state.stack.some(x => !x.ability && !x.opp && String(cardText(x) || '').split('\n').some(l => /^split second\b/i.test(l.trim()))); }
function canCastNow(c) {
  if (!state || state.phase !== 'play' || holdForTriggers() || state.discarding) return false;
  if (splitSecondOn()) return false;
  if (c.fromGy && cageBlocksCast()) return false;   // "Players can't cast spells from graveyards or libraries"
  if (c.miracleNow) return true;   // v0.96.3 a miracle is cast as its trigger resolves, whatever the step
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
  if (c.token) return { types: new Set(c.tk && c.tk.types ? [...c.tk.types.map(x => x.toLowerCase()), 'permanent'] : c.tk && c.tk.type ? [...String(c.tk.type).split('\u2014')[0].split(/\s+/).filter(w => w && !/^token$/i.test(w)).map(x => x.toLowerCase()), 'permanent'] : c.tk && c.tk.pt ? ['creature', 'permanent'] : ['artifact', 'permanent']), subs: new Set([...((c.tk && c.tk.subs) || []), ...(c.addSubs || [])]), legendary: !!(c.tk && c.tk.legendary), basic: false, changeling: false };
  const t = frontType(c), parts = t.split('—');   // (frontType already includes a type-changing 'becomes')
  const types = new Set(); for (const w of (parts[0] || '').split(/\s+/)) if (w) types.add(w.toLowerCase());
  types.add('permanent');
  const subs = new Set(); for (const w of (parts[1] || '').split(/\s+/)) if (w) subs.add(w.toLowerCase());
  for (const w of (c.addSubs || [])) subs.add(w);
  if (c.chosen && /\bis the chosen type in addition to its other types\b/i.test(cardText(c) || '')) subs.add(String(c.chosen).toLowerCase());   // Roaming Throne: it IS the type it chose
  return { types, subs, legendary: types.has('legendary'), basic: types.has('basic'), changeling: kwLine(cardText(c), 'changeling') };
}
let inColorEval = false;
function onBattlefield(c) { return !!state && state.battlefield.some(x => x.id === c.id); }
// Turn a phrase like "each other white creature you control" into a test function; null if it cannot be understood.
function parseSubject(raw, g) {
  let s = String(raw).toLowerCase().replace(/[’]/g, "'").replace(/\.$/, '').trim();
  const nm = g.name.split(' // ')[0].toLowerCase();
  if (s === nm || s === '~' || s === 'this creature' || s === 'this permanent' || s === 'this token') return { self: true, test: c => c.id === g.id };
  // v0.99.75 qualifiers after the noun: "with a +1/+1 counter on it", "with flying", "without flying", "that are enchanted", "of the chosen type/color"
  const quals = []; { let q, again = true;
    while (again) { again = false;
      if ((q = s.match(/^(.+?)\s+with (?:a|an|one or more)?\s*\+1\/\+1 counters? on (?:it|them)(\s+you control)?$/))) { s = q[1] + (q[2] || ''); quals.push(c => ((c.counters && c.counters.plus) || 0) > 0); again = true; }
      else if ((q = s.match(/^(.+?)\s+with (?:a |one or more )?counters? on (?:it|them)(\s+you control)?$/))) { s = q[1] + (q[2] || ''); quals.push(c => Object.entries(c.counters || {}).some(([k, v]) => k !== 'minusApplied' && (v || 0) > 0)); again = true; }
      else if ((q = s.match(/^(.+?)\s+(with|without) ([a-z ]+?)(\s+you control)?$/)) && GRANTABLE.includes(q[3])) { const kw = q[3], neg = q[2] === 'without'; s = q[1] + (q[4] || ''); quals.push(c => { const has = !!kwLine(cardText(c), kw) || !!(state && state.fx && state.fx.some(e => e.kind === 'kw' && e.targetId === c.id && e.kw === kw)); return neg ? !has : has; }); again = true; }   // printed or gained keywords only (a grant that depends on itself would loop)
      else if ((q = s.match(/^(.+?) you control that are enchanted$/))) { s = q[1] + ' you control'; quals.push(c => !!(state && state.battlefield.some(a => a.att === c.id && /\bAura\b/.test(permTypeLine(a) || '')))); again = true; }
      else if ((q = s.match(/^(.+?) you control of the chosen (type|color)$/)) || (q = s.match(/^(.+?) of the chosen (type|color)$/))) { const kind = q[2]; s = q[1] + (/you control/.test(q[0]) ? ' you control' : ''); quals.push(c => { const ch = String(g.chosen || g.chosenColor || '').toLowerCase(); if (!ch) return false; if (kind === 'color' || COLOR_LETTER[ch]) return effColors(c).includes(COLOR_LETTER[ch]); const p = permTypeInfo(c); return p.subs.has(singularWord(ch)) || (p.changeling && p.types.has('creature')); }); again = true; }
    } }
  if (quals.length) { const base = parseSubject(s, g); if (!base) return null; return { self: false, test: c => base.test(c) && quals.every(f => f(c)) }; }
  if (/opponent/.test(s) || /\b(that|with|target|enchanted|equipped|attached|named|who|whose|which|dealt|not)\b/.test(s)) return null;
  { const yc = /\s+you control$/.test(s), body = s.replace(/\s+you control$/, ''), parts = body.split(/\s*,\s*(?:and\s+|or\s+)?|\s+(?:and|or|and\/or)\s+/).filter(Boolean);   // v0.99.75 a list of types: "Artifacts, creatures, enchantments, and lands you control" (Elspeth's emblem)
    if (parts.length > 1 && parts.every(x => SUBJECT_TYPES.includes(singularWord(x.replace(/^(?:each|all|other)\s+/, ''))) && !/\s/.test(x.replace(/^(?:each|all|other)\s+/, '')))) {
      const subs = parts.map(x => parseSubject(x + (yc ? ' you control' : ''), g)); if (subs.every(Boolean)) return { self: false, test: c => subs.some(q => q.test(c)) };
    } }
  const mine = /\byou control\b/.test(s), general = /^(each|all|every)\b/.test(s) || /^other\b/.test(s);
  if (!mine && !general && !/^(?:non(?:white|blue|black|red|green|artifact|land|token|legendary)\s+)?(creatures|lands|artifacts|enchantments|permanents|planeswalkers)\b/.test(s)) return null;
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
    if (sg === 'token') { conds.push(c => !!c.token); continue; }   // "Creature tokens you control"
    if (SUBJECT_TYPES.includes(sg)) { if (noun) conds.push(c => permTypeInfo(c).types.has(noun)); noun = sg; continue; }
    if (sub) { const s1 = sub; conds.push(c => { const p = permTypeInfo(c); return p.subs.has(s1) || (p.changeling && p.types.has('creature')); }); }   // v0.99.75 two subtypes: "Eldrazi Spawn creatures"
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
    const info = rulesInfo(g); if (!info || !info.tx) return list;   // v0.95.0 tokens are read like cards (their rules text is on the token itself)
    const nm = g.name.split(' // ')[0];
    const tx = info.tx.replace(/,\n/g, ', ').replace(/’/g, "'").replace(selfNameRe(g.token ? '\u0000' : nm.replace(/’/g, "'")), '~').replace(/\([^)]*\)/g, '');
    const txLines = tx.split('\n').flatMap(l => { const m = l.trim().match(/^((?:other |each |all )?[A-Za-z' ]+?(?: you control)?) (gets? [+-]\d+\/[+-]\d+) and (has|have) (.+)$/i); return m && !/^(~|equipped|enchanted)\b/i.test(m[1]) && !/\bif\b|\bas long as\b|"/i.test(l) ? [m[1] + ' ' + m[2], m[1] + ' ' + m[3] + ' ' + m[4]] : [l]; });   // "Other Merfolk get +1/+1 and have islandwalk" is two static effects (CR 611.3)
    for (const raw of txLines) {
      { const l0 = raw.trim().replace(/\.$/, ''), hadD = /^delirium\s*[\u2014-]/i.test(l0), l1 = l0.replace(/^delirium\s*[\u2014-]\s*/i, ''), dm = l1.match(/^(?:as long as there are (\w+) or more card types among cards in your graveyard,\s*)?~\s+(.+)$/i);
        if (dm && !dm[1] && !hadD) { /* not a delirium line */ } else
        if (dm) {
          const n = dm[1] ? numw(dm[1]) : 4; let p = 0, t = 0; const kws = [], other = [];
          for (const part of dm[2].split(/,\s*(?:and\s+)?|\s+and\s+(?=has|have|gets?|attacks)/i)) {
            const x = part.trim(); let q; if (!x) continue;
            if ((q = x.match(/^gets? ([+-]\d+)\/([+-]\d+)$/i))) { p += +q[1]; t += +q[2]; }
            else if ((q = x.match(/^(?:has|have) (.+)$/i))) { for (const k of q[1].toLowerCase().split(/\s+and\s+/)) { if (GRANTABLE.includes(k.trim())) kws.push(k.trim()); else other.push(k.trim()); } }
            else if (/^attacks each (?:combat|turn) if able$/i.test(x)) kws.push('mustattack');   // CR 508.1d, enforced when attackers are declared
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
      { const cs = parseCondStatic(raw.trim(), g); if (cs) { list.push(cs); continue; } }   // v0.98.5 conditional / scaling statics
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
      // v0.90.9 "~ gets +1/+1 for each green mana you have." (Omnath, Locus of Mana)
      if ((m = line.match(/^~ gets? ([+-]\d+)\/([+-]\d+) for each (.+)$/i)) && /\bmana\b/i.test(m[3])) { const per = m[3]; list.push({ line, kind: 'pt', g, subj: { self: true, test: c => c.id === g.id }, p: +m[1], t: +m[2], perFn: () => countEachMulti(per), perText: per }); continue; }
      // power / toughness: "Other Dragons you control get +1/+1."
      if ((m = line.match(/^(.+?) gets? ([+-]\d+)\/([+-]\d+)(?: for each (.+))?$/i))) {
        const per = m[4] || '';   // v0.95.0 "~ gets +1/+1 for each artifact you control" (the Construct token from Urza's Saga) and other "for each" bonuses, on itself or on others
        const subj = m[1].trim() === '~' ? (per ? { self: true, test: c => c.id === g.id } : null) : parseSubject(m[1], g);
        if (subj && (!subj.self || per)) { list.push({ line, kind: 'pt', g, subj, p: +m[2], t: +m[3], perFn: per ? () => countEachMulti(per) : null, perText: per }); continue; }
      }
    }
  }
  return list;
}
function statics() {
  if (!state) return [];
  const sig = state.battlefield.map(c => c.id + ':' + c.name + ':' + (c.att || '') + (c.token && c.tk ? ':' + (c.tk.tx || '').length : '')).join('|') + '#' + (state.emblems || []).map(e => e.id).join(',');
  if (_stx.sig === sig) return _stx.list;
  const list = [];
  for (const g of state.battlefield) list.push(...parseStaticCard(g));
  for (const g of state.emblems || []) list.push(...parseStaticCard(g));   // v0.99.75 CR 114.4: an emblem's static abilities work from the command zone (Kaito's "Ninjas you control get +1/+1")
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
  if (c && /^Devoid\b/im.test(String(cardText(c) || '').replace(/\([^)]*\)/g, ''))) return [];   // CR 702.114a: a characteristic-defining ability, this object is colorless
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
  if (!state || !c || !onBattlefield(c)) return null;
  if (permZone(c) !== 'creatures' && !['indestructible', 'hexproof', 'shroud'].includes(kw)) return null;   // v0.99.75 these keywords matter on any permanent (Elspeth's emblem makes lands indestructible)
  for (const e of statics()) if (e.kind === 'cs' && e.g.id === c.id && e.kws.includes(kw) && csActive(e)) return e.line;
  for (const e of statics()) if (e.kind === 'cond' && e.g.id === c.id && e.kws.includes(kw) && condHolds2(e)) return 'its delirium ability';
  for (const e of statics()) {
    if (e.kind !== 'kw' || !e.subj.test(c)) continue;
    for (const it of e.items) if (it.kws.includes(kw) && condHolds(it.cond, c)) return e.g.name;
  }
  return null;
}
function hasKw(c, kw) {
  if (!c) return false;
  { const ov = ovrOf(c); if (ov && ov.loseKws.includes(kw)) return false; }   // "loses flying"
  if (state && state.fx && state.fx.some(e => e.kind === 'kw' && e.targetId === c.id && e.kw === kw)) return true;   // "gains haste until end of turn"
  if (kw === 'haste' && c.suspHaste && state && state.battlefield.includes(c)) return true;   // cast from suspend
  if (kwLine(cardText(c), kw)) return true;
  if (sbKeywords(c).includes(kw) || pairedKeywords(c).includes(kw) || (c.becomes && (c.becomes.kws || []).includes(kw))) return true;   // "...he's a 3/4 Ninja creature and has hexproof"
  return !!kwGrant(c, kw);
}
const GRANTABLE = ['shroud', 'islandwalk', 'swampwalk', 'forestwalk', 'mountainwalk', 'plainswalk', 'prowess', 'flying', 'first strike', 'double strike', 'deathtouch', 'haste', 'hexproof', 'indestructible', 'lifelink', 'menace', 'reach', 'trample', 'vigilance', 'defender'];
// Keywords a creature has only because of other permanents' static abilities (shown in the preview).
function grantedKeywords(c) {
  const out = [];
  if (!state || !c || c.tapped === undefined && !c.id) return out;
  for (const kw of GRANTABLE) {
    if (kwLine(cardText(c), kw)) continue;
    let from = kwGrant(c, kw) || (sbKeywords(c).includes(kw) ? 'its own ability' : null) || (pairedKeywords(c).includes(kw) ? 'soulbond pairing' : null);
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
  if (/^(?:each )?opponents? who (?:lost life|has lost life|was dealt damage|were dealt damage|has been dealt damage) this turn$/i.test(expr)) { const n = state.oppLifeLostTurn === state.turn ? 1 : 0; return { n, why: n ? 'your opponent lost life this turn' : 'your opponent has not lost life this turn' }; }   // v0.99.76 Kaito, Bane of Nightmares (one opponent in a goldfish game)
  if ((m = expr.match(/^twice (?:the number of )?(.+)$/i))) { const r = countExpr(m[1]); return r && { n: 2 * r.n, why: 'twice ' + r.why }; }   // Masumaro, First to Live
  if (/\b(?:your opponents|an opponent|each opponent) controls?$/i.test(expr)) return { n: 0, why: 'the goldfish opponent controls no permanents' };   // Gaea's Avenger: the app does not track an opposing board
  if (/^cards? in all graveyards$/i.test(expr)) return { n: state.graveyard.length, why: `${state.graveyard.length} cards in graveyards (only yours is tracked)` };   // Lord of Extinction
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
  const tx = i.tx.replace(selfNameRe(i.name), '~').replace(/’/g, "'");
  let m;
  if ((m = tx.match(/power and toughness are each equal to (?:the )?(.+?)(?:\.|$)/im))) { const pm = m[1].match(/^(.+?) (plus|minus) (\d+)$/i), lead = !pm && m[1].match(/^(\d+) plus (.+)$/i); const r = countExpr(pm ? pm[1] : lead ? lead[2] : m[1]); const k = pm ? (/plus/i.test(pm[2]) ? 1 : -1) * +pm[3] : lead ? +lead[1] : 0; return r && { p: r.n + k, t: r.n + k, why: [r.why + (k ? ` ${k > 0 ? 'plus' : 'minus'} ${Math.abs(k)}` : '')] }; }
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
  let pt = c.token ? (c.tk && c.tk.pt) : (cardInfo(c.name) || {}).pt;
  const printed = pt; let setBy = '';   // v0.99.32 keep the PRINTED value: an effect that sets base P/T is a change from it (it used to be taken as the printed value, so a picture showed no P/T box)
  { const bc = c.becomes || selfBecomes(c); if (bc && bc.pt) { pt = bc.pt; setBy = bc.src || 'an effect that makes it a creature'; } if (c.basePT) { pt = c.basePT; setBy = 'an effect that sets its base power and toughness'; } { const ov = ovrOf(c); if (ov && ov.pt) { pt = ov.pt; setBy = 'an effect that sets its base power and toughness'; } } }   // CR 613.4b: an effect that sets base power and toughness
  { const sp = stationPT(c); if (sp) { pt = sp; setBy = ''; } }   // CR 721.2 a Spacecraft with enough charge counters has the P/T of its highest reached STATION line (printed on the card itself)
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
  if (setBy && pt !== printed) { const pp = String(printed || '').split('/'), bp = parseInt(pp[0], 10), bt = parseInt(pp[1], 10); out.bp = isNaN(bp) || /\*/.test(pp[0] || '') ? null : bp; out.bt = isNaN(bt) || /\*/.test(pp[1] || '') ? null : bt; out.modified = true; out.why.push(`base ${pt} set by ${setBy} (CR 613.4b)`); }
  if (cda && out.dynamic) out.why.push(...cda.why);
  if (out.unknown) out.why.push('Power/toughness depends on something the app cannot read; shown as 0. Adjust with counters if needed.');
  const cc = typeof c.counters === 'number' ? { plus: c.counters, minus: 0 } : (c.counters || {});
  const net = (cc.plus || 0) - (cc.minus || 0);
  if (state) for (const e of fxOn(c, 'pt')) { out.p += e.p; out.t += e.t; out.modified = true; out.why.push(`${sgnN(e.p)}/${sgnN(e.t)} ${UNTIL_WORDS[e.until] || ''}${e.srcName && e.srcName !== 'manual' ? ' (' + e.srcName + ')' : ''}`); }
  if (state && c.pairedWith) { const pb = pairedPT(c); if (pb) { out.p += pb.p; out.t += pb.t; out.modified = true; out.why.push(`${sgnN(pb.p)}/${sgnN(pb.t)} from being paired (soulbond)`); } }
  if (net) { out.p += net; out.t += net; out.modified = true; out.why.push(`${net > 0 ? '+' : ''}${net}/${net > 0 ? '+' : ''}${net} from counters`); }
  if (state && onBattlefield(c)) for (const e of statics()) {
    if (e.kind !== 'pt' || !e.subj.test(c)) continue;
    // v0.96.10 CR 604.1/613: a "for each" static whose count the app cannot read is UNKNOWN, never zero (a zero would put the creature at toughness 0 and the state-based action of CR 704.5f would wrongly destroy it).
    let mul = e.perFn ? e.perFn() : 1; if (mul == null) { out.unknown = true; out.why.push(`${e.g.name}: "for each ${e.perText}" cannot be read, so the count is unknown (not treated as 0)`); continue; }
    const ep = e.p * mul, et = e.t * mul;
    out.p += ep; out.t += et; out.modified = true; out.why.push(`${ep >= 0 ? '+' : ''}${ep}/${et >= 0 ? '+' : ''}${et} from ${e.g.name}${e.perFn ? ' (' + mul + ' × ' + (e.p >= 0 ? '+' : '') + e.p + '/' + (e.t >= 0 ? '+' : '') + e.t + ' for each ' + e.perText + ')' : ''}`);
  }
  if (state && onBattlefield(c)) for (const e of statics()) {
    if (e.kind === 'cs' && e.g.id === c.id && (e.p || e.t)) { const st = csState(e); if (!st.known) { out.unknown = true; out.why.push(`"${e.line}": the app cannot read this condition, so the power/toughness is unknown`); } else if (st.on) { out.p += e.p * st.mult; out.t += e.t * st.mult; out.modified = true; out.why.push(`${e.p * st.mult >= 0 ? '+' : ''}${e.p * st.mult}/${e.t * st.mult >= 0 ? '+' : ''}${e.t * st.mult} from "${e.line}"`); } continue; }
    if (e.kind !== 'cond' || e.g.id !== c.id || !(e.p || e.t) || !condHolds2(e)) continue;
    out.p += e.p; out.t += e.t; out.modified = true; out.why.push(`${e.p >= 0 ? '+' : ''}${e.p}/${e.t >= 0 ? '+' : ''}${e.t} from ${e.cond === 'ctrl' ? 'controlling a ' + e.need : 'delirium (' + deliriumCount() + ' card types in your graveyard)'}`);
  }
  if (state && fxOn(c, 'switch').length % 2) { const p = out.p; out.p = out.t; out.t = p; out.modified = true; out.why.push('power and toughness switched until end of turn (CR 613.4d, applied last)'); }   // v0.99.80
  return out;
}
function powerOf(c) { const r = ptCalc(c); return { n: Math.max(0, r.p), star: r.unknown }; }
function ptText(c) { const r = ptCalc(c); return `${r.p}/${r.t}${r.unknown ? '?' : ''}`; }
