// Electron shell for MTG Playtester. The game itself is plain HTML/JS (index.html + app.js).
const { app, BrowserWindow, shell, Menu, ipcMain, dialog, net } = require('electron');
// Linux / Steam Deck: an AppImage cannot use Chromium's setuid sandbox helper, so run without it (the game only loads its own local files).
if (process.platform === 'linux' && process.env.APPIMAGE) require('electron').app.commandLine.appendSwitch('no-sandbox');
const vm = require('vm');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const boundsFile = () => path.join(app.getPath('userData'), 'window.json');
function loadBounds() { try { return JSON.parse(fs.readFileSync(boundsFile(), 'utf8')); } catch (e) { return {}; } }
function saveBounds(win) {
  try {
    const b = win.getBounds();
    fs.writeFileSync(boundsFile(), JSON.stringify({ ...b, max: win.isMaximized() }));
  } catch (e) { /* ignore */ }
}


// ------------------------------------------------------------------ in-app updates
// The game is plain files, so an update just replaces index.html / app.js / style.css in a folder
// under your user profile. The newest version (built-in or updated) is the one that runs.
const APP_FILES = ['index.html', 'app.js', 'style.css', 'package.json'];
const overrideDir = () => path.join(app.getPath('userData'), 'app-override');
const readVersion = dir => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version || '0'; } catch (e) { return null; } };
const vnum = v => String(v).split('.').map(n => parseInt(n, 10) || 0);
function newer(a, b) { const x = vnum(a), y = vnum(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; }
const hasAll = dir => APP_FILES.every(f => fs.existsSync(path.join(dir, f)));
function activeDir() {
  const o = overrideDir();
  if (hasAll(o) && newer(readVersion(o), readVersion(__dirname))) return o;
  return __dirname;
}
function checkSyntax(dir) {
  for (const f of ['app.js']) new vm.Script(fs.readFileSync(path.join(dir, f), 'utf8'), { filename: f });
}
function installFrom(srcDir) {
  for (const f of APP_FILES) if (!fs.existsSync(path.join(srcDir, f))) throw new Error('Missing ' + f);
  checkSyntax(srcDir);
  const ver = readVersion(srcDir);
  if (!ver) throw new Error('package.json has no version.');
  const tmp = overrideDir() + '.new';
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  for (const f of [...APP_FILES, 'README.md']) if (fs.existsSync(path.join(srcDir, f))) fs.copyFileSync(path.join(srcDir, f), path.join(tmp, f));
  fs.rmSync(overrideDir(), { recursive: true, force: true });
  fs.renameSync(tmp, overrideDir());
  const changed = ['main.js', 'preload.js'].some(f => fs.existsSync(path.join(srcDir, f)) && fs.existsSync(path.join(__dirname, f)) && fs.readFileSync(path.join(srcDir, f), 'utf8') !== fs.readFileSync(path.join(__dirname, f), 'utf8'));
  return { ok: true, version: ver, olderOrSame: !newer(ver, readVersion(__dirname)), needsInstaller: changed };
}
function findAppFolder(dir) {
  if (hasAll(dir)) return dir;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) if (e.isDirectory() && hasAll(path.join(dir, e.name))) return path.join(dir, e.name);
  return null;
}
ipcMain.handle('upd:info', () => {
  const o = overrideDir(), b = readVersion(__dirname);
  const ov = hasAll(o) ? readVersion(o) : null;
  const active = activeDir();
  return { bundled: b, override: ov, running: readVersion(active), source: active === __dirname ? 'built-in' : 'updated' };
});
ipcMain.handle('upd:folder', async () => {
  try {
    const r = await dialog.showOpenDialog({ title: 'Choose the folder with the new version (the one containing index.html)', properties: ['openDirectory'] });
    if (r.canceled || !r.filePaths[0]) return { ok: false, cancelled: true };
    const dir = findAppFolder(r.filePaths[0]);
    if (!dir) return { ok: false, error: 'That folder does not contain index.html, app.js, style.css and package.json.' };
    return installFrom(dir);
  } catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('upd:url', async (e, base) => {
  try {
    base = String(base || '').trim().replace(/\/+$/, '');
    if (!/^https:\/\//i.test(base)) return { ok: false, error: 'Enter an https:// address.' };
    // v0.96.13 read update.json, or latest.json when that is what the address holds; say plainly which file is missing
    let man = null;
    for (const name of ['update.json', 'latest.json']) {
      const r = await net.fetch(base + '/' + name, { cache: 'no-store' });
      if (!r.ok) continue;
      try { const j = await r.json(); if (j && /^\d+\.\d+\.\d+$/.test(String(j.version || ''))) { man = j; break; } } catch (err) { /* not JSON: try the next name */ }
    }
    if (!man) throw new Error('Neither update.json nor latest.json with a version was found at that address. Upload all six release files (index.html, app.js, style.css, package.json, latest.json, update.json) to the GitHub release.');
    if (!newer(man.version, readVersion(activeDir()))) return { ok: true, upToDate: true, version: readVersion(activeDir()) };
    const tmp = path.join(app.getPath('temp'), 'mtgpt-update');
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
    for (const f of APP_FILES.filter(x => x !== 'package.json')) {
      const res = await net.fetch(base + '/' + f);
      if (!res.ok) throw new Error('Could not download ' + f + ' (HTTP ' + res.status + ').');
      fs.writeFileSync(path.join(tmp, f), Buffer.from(await res.arrayBuffer()));
    }
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ version: man.version }));
    return installFrom(tmp);
  } catch (e) { return { ok: false, error: e.message }; }
});
// ------------------------------------------------------------------ GitHub updates (v0.66)
// Each GitHub release carries index.html, app.js, style.css, package.json, latest.json (version, notes, SHA-256 of every file) and update.json (what older shells read).
// The file names come from APP_FILES here, never from the downloaded manifest, and every file must match its SHA-256 before anything is installed.
const SHELL_VERSION = 4;   // v0.96.8: unchanged files are reused, no-cache + timeouts
// (older line kept for history:) const SHELL_VERSION = 3;   // v0.94.0: download progress events
const SHELL_MIN_FOR_FILES = 2;   // the oldest shell that can still install this release's files (written to latest.json as "shell"); raise it only when files need newer shell features   // bump when main.js / preload.js change in a way a file update cannot deliver
const GH_BASE = process.env.MTGPT_UPDATE_BASE || 'https://github.com/snipeuoutjsl-netizen/MTG-Playtester/releases/latest/download';
const MAX_FILE = 25 * 1024 * 1024;
// Downloads one file and reports bytes as they arrive (for the progress bar).
async function fetchWithProgress(url, onBytes) {
  const res = await net.fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error('Could not download ' + path.basename(url) + ' (HTTP ' + res.status + ')' + (res.status === 404 ? '. The newest GitHub release is missing this file: upload all six files (index.html, app.js, style.css, package.json, latest.json, update.json) to the release.' : '.'));
  const chunks = []; let got = 0;
  if (res.body && typeof res.body.getReader === 'function') {
    const rd = res.body.getReader();
    for (;;) { const { done, value } = await rd.read(); if (done) break; got += value.length; if (got > MAX_FILE) throw new Error(path.basename(url) + ' is unexpectedly large, so nothing was installed.'); chunks.push(Buffer.from(value)); onBytes(value.length); }
    return Buffer.concat(chunks);
  }
  const buf = Buffer.from(await res.arrayBuffer()); onBytes(buf.length); return buf;
}
const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');
// v0.96.8: a release does not have to carry every file. A file whose SHA-256 already matches the copy that is running (index.html and style.css usually do not change) is reused, never downloaded.
function localCopy(f, want) { try { const b = fs.readFileSync(path.join(activeDir(), f)); return sha256(b) === want ? b : null; } catch (e) { return null; } }
async function ghManifest() {
  const res = await net.fetch(GH_BASE + '/latest.json', { cache: 'no-store', signal: AbortSignal.timeout(20000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('GitHub answered HTTP ' + res.status + '.');
  const man = await res.json();
  if (!man || !/^\d+\.\d+\.\d+$/.test(String(man.version || ''))) throw new Error('latest.json has no valid version.');
  return man;
}
ipcMain.handle('upd:ghcheck', async () => {
  try {
    const man = await ghManifest();
    const cur = readVersion(activeDir());
    if (!man) return { ok: true, none: true, current: cur };
    const notes = Array.isArray(man.notes) ? man.notes.map(String).slice(0, 40) : [];
    const bytes = Object.values(man.files || {}).reduce((a, f) => a + (Number(f && f.size) || 0), 0);
    return { ok: true, current: cur, latest: man.version, newer: newer(man.version, cur), title: String(man.title || ''), notes, bytes, needsInstaller: Number(man.shell || 0) > SHELL_VERSION };
  } catch (e) { return { ok: false, error: /fetch failed|ENOTFOUND|ECONN|ERR_|aborted|timed? ?out/i.test(e.message) ? 'Could not reach GitHub (are you online?).' : e.message }; }
});
ipcMain.handle('upd:ghinstall', async (ev) => {
  const send = d => { try { ev.sender.send('upd:progress', d); } catch (e) { /* window gone */ } };
  try {
    const man = await ghManifest();
    if (!man) throw new Error('No release with a latest.json file was found on GitHub. The newest release must be published (not a draft or pre-release) and include latest.json.');
    if (Number(man.shell || 0) > SHELL_VERSION) throw new Error('This release needs a new app shell. Download the full package from the release page and run Build-Installer.bat once.');
    if (!newer(man.version, readVersion(activeDir()))) return { ok: true, upToDate: true, version: readVersion(activeDir()) };
    const tmp = path.join(app.getPath('temp'), 'mtgpt-update');
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
    const files = man.files || {};
    const total = APP_FILES.reduce((a, f) => a + (Number(files[f] && files[f].size) || 0), 0); let done = 0;
    send({ phase: 'start', total, done: 0 });
    for (const f of APP_FILES) {
      const want = String((files[f] && files[f].sha256) || files[f] || '').toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(want)) throw new Error('latest.json has no checksum for ' + f + ', so nothing was installed.');
      let buf = localCopy(f, want);
      if (buf) { done += Number(files[f] && files[f].size) || buf.length; send({ phase: 'download', file: f, done, total }); }
      else buf = await fetchWithProgress(GH_BASE + '/' + f, n => { done += n; send({ phase: 'download', file: f, done, total }); });
      send({ phase: 'verify', file: f, done, total });
      if (sha256(buf) !== want) throw new Error('Checksum mismatch for ' + f + ': the download is damaged or was changed, so nothing was installed.');
      fs.writeFileSync(path.join(tmp, f), buf);
    }
    if (readVersion(tmp) !== man.version) throw new Error('The downloaded package.json does not match the announced version, so nothing was installed.');
    send({ phase: 'install' });
    const r = installFrom(tmp); send({ phase: 'done' }); return r;
  } catch (e) { return { ok: false, error: /fetch failed|ENOTFOUND|ECONN|ERR_/i.test(e.message) ? 'Could not reach GitHub (are you online?).' : e.message }; }
});
ipcMain.handle('upd:reset', () => { fs.rmSync(overrideDir(), { recursive: true, force: true }); return { ok: true }; });
ipcMain.handle('upd:restart', () => { app.relaunch(); app.exit(0); });

function createWindow() {
  const saved = loadBounds();
  const win = new BrowserWindow({
    width: saved.width || 1500, height: saved.height || 900, x: saved.x, y: saved.y,
    minWidth: 1000, minHeight: 640,
    backgroundColor: '#0d1013', title: 'MTG Playtester', autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.js') }
  });
  if (saved.max) win.maximize();
  const dir = activeDir();
  win.loadFile(path.join(dir, 'index.html'));
  // if an updated copy fails to load, fall back to the built-in version and drop the bad update
  win.webContents.on('did-fail-load', (e, code, desc, url, isMain) => {
    if (isMain && dir !== __dirname) { fs.rmSync(overrideDir(), { recursive: true, force: true }); win.loadFile(path.join(__dirname, 'index.html')); }
  });
  // links to other sites (Scryfall etc.) open in the normal browser, never inside the app
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://')) { e.preventDefault(); shell.openExternal(url); } });
  win.on('close', () => saveBounds(win));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else {
  app.on('second-instance', () => { const w = BrowserWindow.getAllWindows()[0]; if (w) { if (w.isMinimized()) w.restore(); w.focus(); } });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'View', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }, { role: 'toggleDevTools' }] },
      { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'close' }] }
    ]));
    // The app is opened from a file:// page, so let it read Scryfall's API and downloads, and the MTGJSON card files (backup source).
    const { session } = require('electron');
    session.defaultSession.webRequest.onHeadersReceived({ urls: ['https://api.scryfall.com/*', 'https://*.scryfall.io/*', 'https://mtgjson.com/*', 'https://*.mtgjson.com/*'] }, (details, cb) => {
      const h = { ...details.responseHeaders };
      for (const k of Object.keys(h)) if (k.toLowerCase() === 'access-control-allow-origin') delete h[k];
      h['Access-Control-Allow-Origin'] = ['*'];
      cb({ responseHeaders: h });
    });
    // Scryfall's API rules ask every client to send a descriptive User-Agent and an Accept header.
    session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['https://api.scryfall.com/*', 'https://*.scryfall.io/*'] }, (details, cb) => {
      const h = { ...details.requestHeaders }; h['User-Agent'] = 'MTGPlaytester/' + (app.getVersion ? app.getVersion() : '0') + ' (unofficial fan tool; goldfish playtester)';
      if (!h['Accept'] || h['Accept'] === '*/*') h['Accept'] = 'application/json;q=0.9,image/*;q=0.8,*/*;q=0.7';
      cb({ requestHeaders: h });
    });
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
