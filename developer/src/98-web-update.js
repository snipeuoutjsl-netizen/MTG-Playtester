// ---- v0.99.93 the web app (and the phone home-screen app) says when a newer version is out, and reloads into it in one tap.
// A home-screen app on a phone can stay open for days, so "it appears on the next launch" was not enough: v0.99.92 had been
// out for ten minutes and a phone still showed the old Resolving screen. sw.js carries the version number on its first line.
function verNewer(a, b) { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0; } return false; }
let webUpdSeen = null;
function webUpdFetch() {   // the newest published version, or null when it can't be read
  if (window.desktop || typeof location === 'undefined' || !/^https?:$/.test(location.protocol) || typeof fetch !== 'function') return Promise.resolve(null);
  return fetch('sw.js?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.text() : '').then(t => { const m = /LOA_VERSION ([\d.]+)/.exec(t || ''); return m ? m[1] : null; }).catch(() => null);
}
function webUpdFound(v) { const was = window.__webUpd; window.__webUpd = v; webUpdBanner(v); if (was !== v) try { if (typeof hallOpen === 'function' && hallOpen()) drawHall(); } catch (e) {} }
function webUpdCheck() {
  if (window.desktop || typeof location === 'undefined' || location.protocol !== 'https:') return;
  webUpdFetch().then(v => { if (v && verNewer(v, APP_VERSION)) webUpdFound(v); });   // v0.99.99 the version is written at the top of sw.js (always published with the site)
}
function webUpdBanner(v) {
  if (webUpdSeen === v || document.getElementById('webUpd')) return; webUpdSeen = v;
  const b = h('div', { id: 'webUpd', class: 'web-upd', role: 'status' }, h('span', { text: `Version ${v} is ready.` }),
    h('button', { class: 'primary', text: 'Update now', onclick: () => webUpdReload() }),
    h('button', { class: 'web-upd-x', text: '✕', title: 'Later', 'aria-label': 'Later', onclick: () => b.remove() }));
  document.body.append(b);
}
async function webUpdReload() {
  try { const r = navigator.serviceWorker && await navigator.serviceWorker.getRegistration(); if (r) await r.update(); } catch (e) { /* no worker */ }
  try { for (const k of await caches.keys()) await caches.delete(k); } catch (e) { /* no caches */ }
  location.reload();
}
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  setTimeout(webUpdCheck, 4000); setInterval(webUpdCheck, 20 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') webUpdCheck(); });
}

// v0.99.103 the Library's version button: always there, so an update can be checked for and installed from the main screen
function libUpdateBtn() {
  const d = window.desktop, upd = d ? window.__updAvail && window.__updAvail.latest : window.__webUpd;
  if (upd) return h('button', { class: 'lib-btn gold small lib-upd', text: `Update to v${upd}`, title: 'Read what changed and install it', onclick: () => d ? openUpdate(window.__updAvail) : webUpdReload() });
  return h('button', { class: 'lib-btn ghost small lib-ver', text: `v${APP_VERSION}`, title: 'Check for updates', 'aria-label': `Version ${APP_VERSION}. Check for updates`, onclick: e => {
    if (d) { openUpdate(); return; }
    const b = e.currentTarget; b.textContent = 'Checking…'; b.disabled = true;
    webUpdFetch().then(v => { b.disabled = false; b.textContent = `v${APP_VERSION}`;
      if (v && verNewer(v, APP_VERSION)) { webUpdFound(v); return; }
      if (!v) { toast('Could not check for updates', 'The version list could not be reached. Check your connection and try again; the app also checks by itself every 20 minutes.'); return; }
      toast("You're up to date", `Version ${APP_VERSION} is the newest version.`); }); } });
}
