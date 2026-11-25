// ---- v0.99.93 the web app (and the phone home-screen app) says when a newer version is out, and reloads into it in one tap.
// A home-screen app on a phone can stay open for days, so "it appears on the next launch" was not enough: v0.99.92 had been
// out for ten minutes and a phone still showed the old Resolving screen. sw.js carries the version number on its first line.
function verNewer(a, b) { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0; } return false; }
let webUpdSeen = null;
function webUpdCheck() {
  if (window.desktop || typeof location === 'undefined' || location.protocol !== 'https:' || typeof fetch !== 'function') return;
  fetch('sw.js?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.text() : '').then(t => { const m = /LOA_VERSION ([\d.]+)/.exec(t || ''); if (m && verNewer(m[1], APP_VERSION)) webUpdBanner(m[1]); }).catch(() => {});   // v0.99.99 the version is written at the top of sw.js (always published with the site)
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
