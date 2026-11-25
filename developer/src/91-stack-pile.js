// ---- v0.99.85 The stack as a real pile of cards
// Each spell or ability is a card laid on the pile, the newest on top and in front, a little askew like cards thrown on a table.
// An ability is its source card with a slip of paper across it that carries the ability's own words, so you see which part of the card
// is on the stack. The caption beside the pile reads out the card you point at (the top one otherwise). When an object leaves the stack
// it lifts off the pile and fades; a new one drops onto it. The buttons, the resolving panel and every rule stay exactly as they were.
let skPrevRects = new Map();   // id -> the card's last place on screen, so a card that just left the stack can be shown lifting away
const skHash = id => { let x = 0; for (const ch of String(id)) x = (x * 31 + ch.charCodeAt(0)) | 0; return x; };
function skMotion() { try { return !(reducedMotion() || document.body.classList.contains('a11y-calm') || animOn('ui') === false); } catch (e) { return true; } }
function skIcon(c) { return c.pseudo ? '⚖' : c.opp ? '⚔' : c.ability ? (c.trigger ? '⚡' : c.pw ? '✦' : '⟳') : c.copy ? '⧉' : '✧'; }
// what to read for an object: the card, what it is, its targets / modes and the ability's own words
function skInfo(c) {
  const base = c.ability ? (c.sourceName || String(c.name).replace(/ — ability$/, '')) : c.name;
  const tg = (() => { try { return targetsText(c) || ''; } catch (e) { return ''; } })();
  const modes = c.modeTexts ? c.modeTexts.map(t => c.xValue !== undefined ? t.replace(/\bX\b/g, String(c.xValue)) : t).join('; ') : '';
  const words = c.ability || c.pseudo ? String(c.text || '').replace(/\s+/g, ' ').trim() : '';
  return { base, tg, modes, words, kind: stackKind(c), x: c.xValue };
}
function skCaption(c, i, busy) {
  const f = skInfo(c);
  return h('div', { class: 'skp-cap' + (c.opp ? ' opp' : '') },
    h('div', { class: 'skp-cap-tag', text: busy && i === 0 ? 'Resolving now' : i === 0 ? 'Resolves next' : `${i + 1}${i === 1 ? 'nd' : i === 2 ? 'rd' : 'th'} from the top` }),
    h('b', { class: 'skp-cap-name', text: f.base + (f.x !== undefined ? ` (X = ${f.x})` : '') }),
    h('span', { class: 'skp-cap-kind', text: `${skIcon(c)} ${f.kind}` }),
    f.words ? h('span', { class: 'skp-cap-words', text: f.words }) : null,
    f.modes ? h('span', { class: 'skp-cap-words', text: f.modes }) : null,
    f.tg ? h('span', { class: 'skp-cap-tg', text: '→ ' + f.tg }) : null);
}
// list: top of the stack first (as drawStackStage builds it); busy: the first object is being resolved right now
function skPile(list, busy) {
  const items = list.filter(Boolean), n = items.length;
  const wrap = h('div', { class: 'skp' + (n > 1 ? ' many' : '') });
  const cardW = 118, step = n <= 1 ? 0 : Math.max(9, Math.min(24, Math.round(150 / (n - 1))));
  const pile = h('div', { class: 'skp-pile', style: `--skw:${cardW}px;height:${Math.round(cardW * 1.4) + step * (n - 1) + 8}px` });
  const capBox = h('div', { class: 'skp-caps' });
  const showCap = (c, i) => capBox.replaceChildren(skCaption(c, i, busy));
  // bottom of the stack first in the DOM, so the top card is painted last (in front)
  for (let k = n - 1; k >= 0; k--) {
    const c = items[k], f = skInfo(c), im = showImages && !c.pseudo ? imgFor(f.base) : null, hsh = skHash(c.id), rot = k === 0 ? (hsh % 3) * 0.6 : ((hsh % 7) - 3) * 1.1, dx = ((hsh >> 3) % 9) - 4;
    const isNew = !skPrevRects.has(String(c.id));
    const el = h('div', { class: 'ss-card skp-card' + (k === 0 ? ' top' : '') + (busy && k === 0 ? ' busy' : '') + (c.ability ? ' abil' : '') + (c.opp ? ' opp' : '') + (isNew && skMotion() ? ' skp-enter' : ''),
      'data-id': c.id, tabindex: '0', 'aria-label': `${k === 0 ? 'Top of the stack' : 'On the stack'}: ${f.base}, ${f.kind}${f.words ? ': ' + f.words : ''}`,
      style: `top:${(n - 1 - k) * step}px;--rot:${rot}deg;--dx:${dx}px;z-index:${n - k}`,
      onmouseenter: () => { showCap(c, k); try { showPreview(c.ability ? { name: f.base } : c); } catch (e) { /* preview only */ } },
      onfocus: () => showCap(c, k), onmouseleave: () => showCap(items[0], 0) },
      im ? h('img', { src: im.front, alt: '', draggable: 'false' }) : h('div', { class: 'skp-face' }, h('b', { text: f.base }), h('span', { text: f.kind })),
      c.ability ? h('div', { class: 'skp-slip' }, h('i', { text: skIcon(c) }), h('span', { text: (f.words || f.kind).slice(0, 150) })) : null,
      c.copy ? h('div', { class: 'skp-stamp', text: 'COPY' }) : null,
      h('span', { class: 'skp-n', text: k === 0 ? (busy ? 'now' : 'next') : String(k + 1) }));
    pile.append(el);
  }
  showCap(items[0], 0);
  wrap.append(pile, capBox);
  return wrap;
}
// called just before the stack window is redrawn: remember where each card sits, and keep a copy of any that are about to go
function skBeforeDraw() {
  const st = $('#stackStage'); if (!st) return null;
  const old = new Map(); for (const el of st.querySelectorAll('.skp-card[data-id]')) old.set(el.dataset.id, { el, r: el.getBoundingClientRect() });
  return old;
}
// … and just after: a card no longer on the stack lifts off the pile and fades out where it was
function skAfterDraw(old) {
  const st = $('#stackStage'); if (!st || !old) return;
  const now = new Set([...st.querySelectorAll('.skp-card[data-id]')].map(e => e.dataset.id));
  skPrevRects = new Map([...now].map(id => [id, true]));
  if (!skMotion()) return;
  for (const [id, o] of old) {
    if (now.has(id) || !o.r.width) continue;
    const g = o.el.cloneNode(true); g.classList.remove('skp-enter', 'ss-card'); g.classList.add('skp-leave'); g.removeAttribute('data-id');
    Object.assign(g.style, { position: 'fixed', left: o.r.left + 'px', top: o.r.top + 'px', width: o.r.width + 'px', height: o.r.height + 'px', margin: '0', zIndex: 400, pointerEvents: 'none' });
    document.body.append(g); setTimeout(() => g.remove(), 700);
  }
}
