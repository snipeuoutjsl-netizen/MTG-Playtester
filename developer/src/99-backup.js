// ---- v0.99.109 Backup and restore (roadmap: "card data, decks, wishlist, puzzles and recaps survive updates, with backup and restore").
// A backup is one JSON file with everything that is yours:
//  - every saved setting and list (localStorage keys that start with "mtgpt."): decks, favourites, notes and recaps, wishlist, puzzles,
//    the Archive and your packs, settings, the card data looked up for your decks;
//  - the pictures you added yourself (IndexedDB): your card art and printings ("cart:"), token art ("tart:"), playmat and sleeve images.
// Downloaded things are left out because the app fetches them again by itself: card pictures, the full card file, token pictures, the
// sets and card lists behind packs. Restoring replaces what is saved now with the backup (after asking), then reloads the app.
const BACKUP_SKIP_LS = /^mtgpt\.(packSets|packPools|updateUrl|tokensAt|tokensV)$/;
const BACKUP_IDB = /^(cart:|tart:|playmat|sleeve)/;
const blobToData = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
const dataToBlob = async s => (await fetch(s)).blob();
async function backupPack(v) {   // Blobs inside a stored value become { __blob: dataURL } so the file is plain JSON
  if (v instanceof Blob) return { __blob: await blobToData(v) };
  if (Array.isArray(v)) { const out = []; for (const x of v) out.push(await backupPack(x)); return out; }
  if (v && typeof v === 'object') { const out = {}; for (const [k, x] of Object.entries(v)) out[k] = await backupPack(x); return out; }
  return v;
}
async function backupUnpack(v) {
  if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.__blob === 'string' && Object.keys(v).length === 1) return dataToBlob(v.__blob);
  if (Array.isArray(v)) { const out = []; for (const x of v) out.push(await backupUnpack(x)); return out; }
  if (v && typeof v === 'object') { const out = {}; for (const [k, x] of Object.entries(v)) out[k] = await backupUnpack(x); return out; }
  return v;
}
async function makeBackup() {
  const local = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('mtgpt.') && !BACKUP_SKIP_LS.test(k)) local[k] = localStorage.getItem(k); }
  const idbData = {};
  try { const keys = (await idbKeys('')).filter(k => BACKUP_IDB.test(k)); const got = keys.length ? await idbGetMany(keys) : {}; for (const k of keys) if (got[k] !== undefined) idbData[k] = await backupPack(got[k]); } catch (e) { console.error(e); }
  const decks = (() => { try { return Object.keys(JSON.parse(local['mtgpt.decks'] || '{}')).length; } catch (e) { return 0; } })();
  return { app: 'Library of Alexandria', kind: 'backup', v: 1, version: APP_VERSION, at: new Date().toISOString(), summary: { decks, saved: Object.keys(local).length, pictures: Object.keys(idbData).length }, local, idb: idbData };
}
function backupFileName() { const d = new Date(), p = n => String(n).padStart(2, '0'); return `library-of-alexandria-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`; }
async function saveBackup() {
  try { const b = await makeBackup(), txt = JSON.stringify(b);
    const a = h('a', { href: URL.createObjectURL(new Blob([txt], { type: 'application/json' })), download: backupFileName() }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    lsSet('mtgpt.lastBackup', Date.now());
    toast('Backup saved', `${b.summary.decks} deck${b.summary.decks === 1 ? '' : 's'}, ${b.summary.saved} saved lists and settings${b.summary.pictures ? `, ${b.summary.pictures} of your own pictures` : ''} (${Math.max(1, Math.round(txt.length / 1024))} KB). Keep the file somewhere safe.`);
    return b;
  } catch (e) { console.error(e); toast('Backup failed', String(e && e.message || e)); return null; }
}
function readBackupText(txt) {
  let b = null; try { b = JSON.parse(txt); } catch (e) { return { error: 'This file is not a backup (it is not readable JSON).' }; }
  if (!b || b.kind !== 'backup' || !b.local || typeof b.local !== 'object') return { error: 'This file is not a Library of Alexandria backup.' };
  return { backup: b };
}
// restore: replaces the saved data with the backup's (keys missing from the backup are removed, except the skipped caches)
async function applyBackup(b) {
  for (const k of Object.keys(localStorage)) if (k.startsWith('mtgpt.') && !BACKUP_SKIP_LS.test(k) && !(k in b.local)) localStorage.removeItem(k);
  for (const [k, v] of Object.entries(b.local)) { if (!k.startsWith('mtgpt.')) continue; try { localStorage.setItem(k, v); } catch (e) { throw new Error(`There is not enough room to restore ${k}.`); } }
  try { const old = (await idbKeys('')).filter(k => BACKUP_IDB.test(k) && !(k in (b.idb || {}))); if (old.length) await idbDelete(old); } catch (e) { /* nothing to remove */ }
  for (const [k, v] of Object.entries(b.idb || {})) if (BACKUP_IDB.test(k)) await idbSet(k, await backupUnpack(v));
  lsSet('mtgpt.restoredAt', Date.now());
}
function openBackupWindow() {
  const m = modal('Backup and restore', { width: 560 });
  const last = lsGet('mtgpt.lastBackup', 0), file = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
  const status = h('div', { class: 'psub', text: last ? `Your last backup was saved on ${new Date(last).toLocaleDateString()}.` : 'You have not saved a backup yet.' });
  file.addEventListener('change', async () => { const f = file.files[0]; file.value = ''; if (!f) return;
    const r = readBackupText(await f.text()); if (r.error) { toast('Cannot restore', r.error); return; }
    const b = r.backup, s = b.summary || {};
    const c = modal('Restore this backup?', { width: 500, sticky: true });
    c.body.append(h('div', { class: 'psub', text: `Saved ${b.at ? new Date(b.at).toLocaleString() : 'at an unknown time'} by version ${b.version || '?'}: ${s.decks ?? '?'} decks, ${s.saved ?? Object.keys(b.local).length} saved lists and settings, ${s.pictures ?? Object.keys(b.idb || {}).length} of your own pictures.` }),
      h('div', { class: 'psub', text: 'Restoring replaces your decks, Archive, packs, wishlist, puzzles, notes and settings with the ones in the backup. Anything saved since then is lost, so save a backup of the current state first if you might want it. The app restarts afterwards.' }));
    c.foot.append(h('button', { text: 'Cancel', onclick: () => c.close() }), h('button', { text: 'Save a backup of now first', onclick: () => saveBackup() }),
      h('button', { class: 'primary danger', text: 'Restore', onclick: async () => { try { await applyBackup(b); c.close(); m.close(); toast('Backup restored', 'Restarting with the restored data…'); setTimeout(() => location.reload(), 900); } catch (e) { console.error(e); toast('Restore failed', String(e && e.message || e)); } } })); });
  m.body.append(h('div', { class: 'psub', text: 'A backup is one file with everything that is yours: decks, favourites, notes and game recaps, the wishlist, puzzles, the Archive and your packs, settings, and the pictures you added yourself (card art, token art, playmat and sleeves). Card pictures and card data are left out: the app downloads them again by itself.' }), status, file);
  m.foot.append(h('button', { text: 'Restore from a backup…', onclick: () => file.click() }), h('button', { class: 'primary', text: 'Save a backup', onclick: async () => { const b = await saveBackup(); if (b) status.textContent = 'Saved just now.'; } }), h('button', { text: 'Close', onclick: () => m.close() }));
}
