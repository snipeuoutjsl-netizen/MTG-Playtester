// ---- v0.99.87 Library rooms: the whole room changes, not only the wall and the desk
// A room is a preset of wall, desk and shelves, its own light, and a few things on the wall drawn in SVG (banners, torches,
// floating candles, vines and fireflies). Picking a room sets its wall and desk; both can still be changed one by one after.
// Kept in 'mtgpt.hallLook'.room. The walls are tiles from developer/room-gen.py.
const HALL_ROOMS = [
  ['library', 'The Library', { wall: 'plaster', desk: 'walnut' }, 'Warm plaster, walnut and lamplight'],
  ['castle', 'Castle hall', { wall: 'castle', desk: 'oak' }, 'Cut stone, oak and hanging banners'],
  ['dungeon', 'Dungeon', { wall: 'dungeon', desk: 'ebony' }, 'Rough stone, black wood and torchlight'],
  ['tower', 'Wizard’s tower', { wall: 'night', desk: 'ebony' }, 'A night sky painted on the walls and floating candles'],
  ['grove', 'Elven grove', { wall: 'moss', desk: 'birch' }, 'Mossy stone, pale birch, vines and fireflies']];
function hallRoom() { const v = lsGet('mtgpt.hallLook', null) || {}; return HALL_ROOMS.some(r => r[0] === v.room) ? v.room : 'library'; }
function setHallRoom(k) {
  const r = HALL_ROOMS.find(x => x[0] === k); if (!r) return;
  const v = lsGet('mtgpt.hallLook', null) || {}; v.room = k; v.wall = r[2].wall; v.desk = r[2].desk; lsSet('mtgpt.hallLook', v);
  applyHallLook(); const w = document.querySelector('#hall .hall-world'); if (w) { const old = w.querySelector(':scope > .hall-decor'); const d = roomDecorEl(k); if (old) old.replaceWith(d); else w.prepend(d); }
}
const DC_BANNER = '<svg viewBox="0 0 64 360" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="dcBn" x1="0" x2="1"><stop offset="0" stop-color="#4a0d0d"/><stop offset=".18" stop-color="#8f1d1a"/><stop offset=".5" stop-color="#b22a22"/><stop offset=".82" stop-color="#8a1b18"/><stop offset="1" stop-color="#3f0b0b"/></linearGradient><linearGradient id="dcRod" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6dc8c"/><stop offset="1" stop-color="#8f6420"/></linearGradient></defs>'
  + '<path d="M8 14 H56 V318 L32 290 L8 318 Z" fill="url(#dcBn)" stroke="#d9b45a" stroke-width="2.5"/>'
  + '<path d="M14 20 H50 V306 L32 285 L14 306 Z" fill="none" stroke="#e9c873" stroke-width="1" opacity=".7"/>'
  + '<g fill="#e9c873" opacity=".95"><path d="M22 120 h20 v-26 h-4 v6 h-4 v-6 h-4 v6 h-4 v-6 h-4 z"/><rect x="28" y="106" width="8" height="14" fill="#5a1210"/><path d="M32 70 l4 9 h-8z"/></g>'
  + '<rect x="2" y="8" width="60" height="7" rx="3.5" fill="url(#dcRod)"/><circle cx="3" cy="11.5" r="5" fill="#c99a3c"/><circle cx="61" cy="11.5" r="5" fill="#c99a3c"/>'
  + '<path d="M32 8 L20 0 M32 8 L44 0" stroke="#c99a3c" stroke-width="1.5"/></svg>';
const DC_TORCH = '<svg viewBox="0 0 44 120" aria-hidden="true"><defs><linearGradient id="dcIr" x1="0" x2="1"><stop offset="0" stop-color="#1b1b1e"/><stop offset=".5" stop-color="#55555c"/><stop offset="1" stop-color="#1b1b1e"/></linearGradient><linearGradient id="dcWd" x1="0" x2="1"><stop offset="0" stop-color="#3b2412"/><stop offset=".5" stop-color="#7a4d26"/><stop offset="1" stop-color="#3b2412"/></linearGradient></defs>'
  + '<rect x="14" y="62" width="16" height="44" rx="3" fill="url(#dcIr)"/><circle cx="22" cy="70" r="2" fill="#888"/><circle cx="22" cy="98" r="2" fill="#888"/>'
  + '<path d="M22 84 L22 74 L30 66" stroke="url(#dcIr)" stroke-width="5" fill="none"/>'
  + '<path d="M17 30 L27 30 L25 78 L19 78 Z" fill="url(#dcWd)" transform="rotate(8 22 54)"/>'
  + '<path d="M12 24 Q22 40 32 24 L30 34 Q22 42 14 34 Z" fill="url(#dcIr)" transform="rotate(8 22 54)"/></svg>';
const DC_CANDLE = '<svg viewBox="0 0 24 70" aria-hidden="true"><defs><linearGradient id="dcWx" x1="0" x2="1"><stop offset="0" stop-color="#d9cfb4"/><stop offset=".45" stop-color="#fbf4df"/><stop offset="1" stop-color="#c9bc9a"/></linearGradient></defs>'
  + '<path d="M5 14 Q12 10 19 14 V66 Q12 70 5 66 Z" fill="url(#dcWx)"/><path d="M6 15 q2 10 1 16 q-1 3 1 4 q2-6 1-20" fill="#fffaf0" opacity=".8"/><path d="M15 14 q1 7 0 11 q2 1 2-2 v-9z" fill="#fffaf0" opacity=".7"/>'
  + '<line x1="12" y1="13" x2="12" y2="7" stroke="#2b2117" stroke-width="1.2"/></svg>';
function dcVines() {   // a garland of leaves along the top of the wall
  let leaves = '', d = 'M0 18'; const W = 1600;
  for (let x = 0; x <= W; x += 40) { const y = 18 + Math.sin(x / 90) * 9; d += ` L${x} ${y.toFixed(1)}`; }
  for (let x = 12, i = 0; x < W; x += 23, i++) { const y = 18 + Math.sin(x / 90) * 9, up = i % 2 ? -1 : 1, ang = (up > 0 ? 35 : -35) + Math.sin(i) * 20, s = 0.8 + ((i * 37) % 10) / 20;
    leaves += `<ellipse cx="${x}" cy="${(y + up * 7).toFixed(1)}" rx="${(8 * s).toFixed(1)}" ry="${(3.6 * s).toFixed(1)}" transform="rotate(${ang.toFixed(0)} ${x} ${(y + up * 7).toFixed(1)})" fill="${i % 3 ? '#4f7f2f' : '#6a9a3c'}"/>`;
    if (i % 9 === 4) { let dd = `M${x} ${y.toFixed(1)}`, yy = y; for (let k = 0; k < 6; k++) { yy += 14; dd += ` Q${x + (k % 2 ? 7 : -7)} ${yy - 7} ${x} ${yy}`; leaves += `<ellipse cx="${x + (k % 2 ? 5 : -5)}" cy="${yy - 3}" rx="6" ry="2.8" transform="rotate(${k % 2 ? 30 : -30} ${x} ${yy})" fill="#4f7f2f"/>`; } leaves = `<path d="${dd}" stroke="#3d5f22" stroke-width="2" fill="none"/>` + leaves; } }
  return `<svg viewBox="0 0 ${W} 120" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" stroke="#3d5f22" stroke-width="3" fill="none"/>${leaves}</svg>`;
}
function roomDecorEl(k) {
  const box = h('div', { class: 'hall-decor room-' + k, 'aria-hidden': 'true' });
  const svg = (cls, s) => { const e = h('div', { class: cls }); e.innerHTML = s; return e; };
  if (k === 'castle') box.append(svg('dc-banner l', DC_BANNER), svg('dc-banner r', DC_BANNER));
  else if (k === 'dungeon') for (const side of ['l', 'r']) { const t = svg('dc-torch ' + side, DC_TORCH); t.append(h('i', { class: 'dc-flame' }), h('i', { class: 'dc-glow' })); box.append(t); }
  else if (k === 'tower') ['a', 'b', 'c'].forEach(p => { const c = svg('dc-candle ' + p, DC_CANDLE); c.append(h('i', { class: 'dc-flame' }), h('i', { class: 'dc-glow' })); box.append(c); });
  else if (k === 'grove') { box.append(svg('dc-vines', dcVines())); for (let i = 0; i < 12; i++) box.append(h('i', { class: 'dc-fly', style: `--x:${(i * 137) % 100}%;--y:${18 + (i * 53) % 60}%;--d:${(i * 0.7) % 5}s;--t:${6 + (i % 5)}s` })); }
  return box;
}
