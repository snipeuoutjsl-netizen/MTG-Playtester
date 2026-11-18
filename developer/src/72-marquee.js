// ---- v0.99.23 News-ticker text: a top-bar chip whose text is too long for its space scrolls sideways (and back) instead of being cut off.
(function () {
  const sel = '#topbar .status .chip';
  const wrap = el => {
    if (el.firstElementChild && el.firstElementChild.classList.contains('mqw')) return;
    const txt = el.textContent; if (!txt) return;
    el.textContent = ''; const w = document.createElement('span'), t = document.createElement('span');
    w.className = 'mqw'; t.className = 'mqt'; t.textContent = txt; w.append(t); el.append(w);
  };
  const fit = el => {
    const w = el.querySelector('.mqw'), t = el.querySelector('.mqt'); if (!w || !t) return;
    el.classList.remove('mq'); const dist = Math.ceil(t.offsetWidth - w.clientWidth);
    if (dist > 2) { el.style.setProperty('--mq-dist', dist + 'px'); el.style.setProperty('--mq-dur', Math.max(5, dist / 22 + 3).toFixed(1) + 's'); el.classList.add('mq'); }
  };
  const all = () => document.querySelectorAll(sel);
  const obs = new MutationObserver(() => { obs.takeRecords(); all().forEach(el => { wrap(el); }); obs.takeRecords(); requestAnimationFrame(() => all().forEach(fit)); });
  const start = () => {
    all().forEach(el => { wrap(el); obs.observe(el, { childList: true }); });
    obs.takeRecords(); requestAnimationFrame(() => all().forEach(fit));
    window.addEventListener('resize', () => requestAnimationFrame(() => all().forEach(fit)));
    if (window.ResizeObserver) { const ro = new ResizeObserver(() => requestAnimationFrame(() => all().forEach(fit))); all().forEach(el => ro.observe(el)); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else setTimeout(start, 0);
})();
