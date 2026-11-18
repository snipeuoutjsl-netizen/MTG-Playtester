// v0.99.9 Token sync (CR 111): the Oracle file does not carry every token, so the first start (and every card-data load) also pulls ALL official
// token and emblem objects from Scryfall's search API and keeps them offline beside the cards. The engine then knows every token a deck might make.
const TOKEN_SYNC_QUERY = '(layout:token OR layout:double_faced_token OR layout:emblem)';
const TOKEN_SYNC_DAYS = 30;
let tokenCount = 0, tokenSyncing = false;
function tokenTotal() { let n = 0; TOKENDB.forEach(a => { n += a.length; }); return n; }
function mergeTokens(extra) {
  const all = []; TOKENDB.forEach(a => a.forEach(r => all.push(r)));
  installTokens(all.concat(extra || [])); tokenCount = tokenTotal(); return all.length;
}
async function downloadAllTokens(onProgress) {
  const out = []; let url = 'https://api.scryfall.com/cards/search?unique=cards&order=name&q=' + encodeURIComponent(TOKEN_SYNC_QUERY), page = 0;
  while (url && page < 80) {
    const res = await netFetch(url, 3);
    if (!res.ok) { if (res.status === 404 && !out.length) break; throw Object.assign(new Error('HTTP ' + res.status), { status: res.status }); }
    const j = await res.json(); page++;
    for (const o of j.data || []) { try { out.push(compactToken(o)); } catch (e) { /* skip */ } }
    if (onProgress) onProgress(`Downloading tokens… ${out.length}${j.total_cards ? ' of ' + j.total_cards : ''}`);
    url = j.has_more ? j.next_page : null;
    if (url) await sleep(110);   // Scryfall asks for 50–100 ms between requests
  }
  return out;
}
// force: ignore the 30-day freshness check. Safe offline: it just keeps what is saved.
async function syncTokens(force, onProgress) {
  if (tokenSyncing) return false;
  const at = lsGet('mtgpt.tokensAt', 0);
  if (!force && tokenTotal() > 300 && Date.now() - at < TOKEN_SYNC_DAYS * 864e5) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  tokenSyncing = true;
  try {
    updateDbStatus(onProgress ? undefined : 'Downloading tokens…');
    const list = await downloadAllTokens(m => { updateDbStatus(m); if (onProgress) onProgress(m); });
    if (!list.length) return false;
    mergeTokens(list);
    const all = []; TOKENDB.forEach(a => a.forEach(r => all.push(r)));
    try { await idbSet('tokens', all); lsSet('mtgpt.tokensAt', Date.now()); } catch (e) { /* kept for this session */ }
    return true;
  } catch (e) { console.warn('Token download failed', e); return false; }
  finally { tokenSyncing = false; updateDbStatus(); }
}
