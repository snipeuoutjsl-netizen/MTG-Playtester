// v0.98.8 Four more pixel-art sets: Mushroom, Cats, Frog and Music. Each is an original sprite drawn on a coarse grid in code (same method as Pixel cosmos),
// and each comes as a sleeve, a playmat, an interface colour theme and a matching song, so the One-click set picker changes them all together.
const PXT = {
  mushroom: { bands: ['#1c1424', '#2a1b33', '#3a2540', '#2a1b33'], edge: ['#120b18', '#c8433f', '#5a3550'], pal: { R: '#d8453f', r: '#9c2c33', W: '#fff4e0', S: '#f1dcb8', s: '#c9a77c', G: '#5fae57', g: '#2f6b3a', K: '#120b18' }, dot: ['#fff4e0', '#f6c453', '#d8453f'] },
  cats: { bands: ['#0e1630', '#18234a', '#26336a', '#18234a'], edge: ['#080d1e', '#f2a65a', '#3a4a86'], pal: { O: '#f2a65a', o: '#c9722f', K: '#1b1b2b', G: '#8be28b', P: '#ff9aa9', W: '#fff4e0', B: '#6f7fb8' }, dot: ['#fff4e0', '#ffe08a', '#8aa4ff'] },
  frog: { bands: ['#0b2622', '#0f3a34', '#17564a', '#0f3a34'], edge: ['#071714', '#6fd36f', '#1f7a5a'], pal: { G: '#59c85a', g: '#2f8f46', L: '#c9f2a0', K: '#10241b', W: '#f4fff0', P: '#2fa05a', p: '#1d6e45', Y: '#ffd45c' }, dot: ['#9be7c4', '#c9f2a0', '#ffd45c'] },
  music: { bands: ['#140d2b', '#211443', '#33205f', '#211443'], edge: ['#0b0720', '#ff7ac8', '#4a3584'], pal: { K: '#f4f1ff', k: '#a99ad6', P: '#ff7ac8', T: '#46d6c0', Y: '#ffe08a', L: '#5a3d94' }, dot: ['#46d6c0', '#ff7ac8', '#ffe08a'] }
};
const PX_SPR = {
  mushroom: ['....RRRR....', '..RRRWWRRR..', '.RRWWWRRRWR.', 'RRRWWRRRRRRR', 'RWRRRRRWWRRR', 'RRRRWRRWWRRr', 'rrrrrrrrrrrr', '..SSSSSSSS..', '...SSSSSS...', '...SSKSKSs..', '...SSSSSSs..', '..GGSSSSsGG.'],
  cat: ['.O........O.', '.OO......OO.', '.OOOOOOOOOO.', 'OOOOOOOOOOOO', 'OOGKOOOOGKOO', 'OOOOOPPOOOOO', 'OoOOOKKOOOoO', '.OOOOOOOOOO.', '..OOOOOOOO..', '.OOOoOOoOOO.', 'OOOOOOOOOOOO', 'OOO.OOOO.OOO'],
  frog: ['..GGG....GGG..', '.GWKWG..GWKWG.', '.GGGGGGGGGGGG.', 'GGGGGGGGGGGGGG', 'GGKKKKKKKKKKGG', 'GGGGGGGGGGGGGG', 'GGLLLLLLLLLLGG', '.GLLLLLLLLLLG.', '.GG.GG..GG.GG.'],
  note: ['.....KK...', '.....KKKK.', '.....KK.KK', '.....KK..K', '.....KK...', '.....KK...', '..KKKKK...', '.KKKKKKK..', '.KKKKKKK..', '..KKKKK...'],
  notes: ['.KKKKKKKKKK', '.KKKKKKKKKK', '.KK......KK', '.KK......KK', '.KK......KK', 'KKK.....KKK', 'KKK.....KKK', '.K.......K.'],
  pad: ['..pppppp..', '.PPPPPPPPp', 'PPPPPPPPPP', 'pPPPPPPPPp', '.pppppppp.'],
  tiny: ['.RR.', 'RWRR', '.SS.', '.SS.']
};
function pxSpr(name, pal, map, ox, oy, s) { const rows = PX_SPR[name]; return (x, y) => { const lx = Math.floor((x - ox) / s), ly = Math.floor((y - oy) / s); if (lx < 0 || ly < 0 || ly >= rows.length || lx >= rows[ly].length) return null; const ch = rows[ly][lx]; return ch === '.' ? null : ((map && map[ch]) || pal[ch] || null); }; }
function pxScene(th, W, H, cell, seed, sleeve, sprites, extra) {
  const T = PXT[th], R = rng(seed), specks = new Map(), n = sleeve ? 40 : 140;
  for (let i = 0; i < n; i++) specks.set(Math.floor(R() * W) + ',' + Math.floor(R() * H), T.dot[Math.floor(R() * T.dot.length)]);
  const sp = sprites.map(f => f(T.pal));
  const px = (x, y) => {
    if (sleeve) { const e = Math.min(x, y, W - 1 - x, H - 1 - y); if ((x === 0 || x === W - 1) && (y === 0 || y === H - 1)) return null; if (e === 0) return T.edge[0]; if (e === 1) return (x + y) % 2 ? T.edge[1] : T.edge[2]; if (e === 2) return T.edge[2]; }
    for (const f of sp) { const c = f(x, y); if (c) return c; }
    if (extra) { const c = extra(x, y, T); if (c) return c; }
    const st = specks.get(x + ',' + y); if (st) return st;
    return pixBand(x, y, H, T.bands);
  };
  return '<g shape-rendering="crispEdges">' + pixSvg(W, H, cell, px) + '</g>';
}
const pxPlace = (name, ox, oy, s, map) => pal => pxSpr(name, pal, map, ox, oy, s);
// sleeves (42 x 58 grid, 3px cells)
SLEEVE_ART.pixmush = () => pxScene('mushroom', 42, 58, 3, 11, true, [pxPlace('mushroom', 3, 18, 3), pxPlace('tiny', 6, 46, 2), pxPlace('tiny', 30, 44, 2), pxPlace('tiny', 18, 8, 1)]);
SLEEVE_ART.pixcat = () => pxScene('cats', 42, 58, 3, 12, true, [pxPlace('cat', 3, 14, 3)], (x, y) => { const d = (x - 31) ** 2 + (y - 9) ** 2; return d <= 16 && (x - 33) ** 2 + (y - 8) ** 2 > 12 ? '#ffe08a' : null; });
SLEEVE_ART.pixfrog = () => pxScene('frog', 42, 58, 3, 13, true, [pxPlace('frog', 7, 22, 2), pxPlace('pad', 2, 36, 4)]);
SLEEVE_ART.pixmusic = () => pxScene('music', 42, 58, 3, 14, true, [pxPlace('notes', 5, 14, 3, { K: '#ff7ac8' }), pxPlace('note', 26, 38, 2, { K: '#46d6c0' })], (x, y, T) => y >= 40 && y <= 52 && y % 3 === 0 && x > 3 && x < 38 ? T.edge[2] : null);
// playmats (100 x 56 grid, 16px cells), sprites scattered over the whole mat
// One sprite per cell of a loose grid (with jitter) so nothing overlaps; `maps` optionally recolours each one.
function pxScatter(name, cols, rows, seed, s, W, H, w, h, maps) { const R = rng(seed), out = [], cw = W / cols, ch = H / rows; let k = 0; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { if ((r + c) % 2) continue; const ox = Math.floor(c * cw + R() * Math.max(0, cw - w * s)), oy = Math.floor(r * ch + R() * Math.max(0, ch - h * s)); out.push(pxPlace(name, ox, oy, s, maps && maps[k++ % maps.length])); } return out; }
MAT_ART.pixmush = () => pxScene('mushroom', 100, 56, 16, 21, false, pxScatter('mushroom', 7, 4, 3, 1, 100, 56, 12, 12));
MAT_ART.pixcat = () => pxScene('cats', 100, 56, 16, 22, false, pxScatter('cat', 7, 4, 5, 1, 100, 56, 12, 12, [{}, { O: '#9aa4c8', o: '#6f7fb8' }, { O: '#e8e2d4', o: '#b8b0a0' }]));
MAT_ART.pixfrog = () => pxScene('frog', 100, 56, 16, 23, false, [...pxScatter('pad', 5, 3, 6, 2, 100, 56, 10, 5), ...pxScatter('frog', 5, 3, 7, 1, 100, 56, 14, 9).filter((_, i) => i % 3 === 0)]);
MAT_ART.pixmusic = () => pxScene('music', 100, 56, 16, 24, false, [...pxScatter('notes', 4, 3, 8, 1, 100, 56, 11, 8, [{ K: '#8a6fd1' }, { K: '#ff7ac8' }]), ...pxScatter('note', 6, 4, 9, 1, 100, 56, 10, 10, [{ K: '#46d6c0' }, { K: '#ffe08a' }, { K: '#a99ad6' }])], (x, y, T) => y % 7 === 3 ? T.edge[2] : null);
SLEEVES.push(['pixmush', 'Pixel mushroom'], ['pixcat', 'Pixel cat'], ['pixfrog', 'Pixel frog'], ['pixmusic', 'Pixel music']);
MATS.push(['pixmush', 'Pixel mushrooms'], ['pixcat', 'Pixel cats'], ['pixfrog', 'Pixel frog pond'], ['pixmusic', 'Pixel music staff']);
UI_THEMES.splice(UI_THEMES.length - 1, 0, ['pixmush', 'Pixel mushroom'], ['pixcat', 'Pixel cats'], ['pixfrog', 'Pixel frog'], ['pixmusic', 'Pixel music']);
UI_SETS.push(
  { id: 'pixmush', label: 'Pixel mushroom', ui: 'pixmush', sleeve: 'pixmush', mat: 'pixmush', frame: 'none', song: 'golden', note: 'Toadstool sleeve and mat, forest-floor colours, golden-hour music.' },
  { id: 'pixcat', label: 'Pixel cats', ui: 'pixcat', sleeve: 'pixcat', mat: 'pixcat', frame: 'none', song: 'jazzhop', note: 'Cat sleeve and mat under a pixel moon, midnight jazz-hop.' },
  { id: 'pixfrog', label: 'Pixel frog', ui: 'pixfrog', sleeve: 'pixfrog', mat: 'pixfrog', frame: 'none', song: 'rain', note: 'Frog on a lily pad, pond-green colours, rainy-window music.' },
  { id: 'pixmusic', label: 'Pixel music', ui: 'pixmusic', sleeve: 'pixmusic', mat: 'pixmusic', frame: 'none', song: 'arcade', note: 'Notes on a staff, synth colours, arcade chill.' }
);

// Matching mouse pointers: a little sprite for each set, and a pixel arrow in the set's colours. Hover = the same picture with a light outline.
PX_SPR.arrow = ['K.......', 'KK......', 'KLK.....', 'KLLK....', 'KLLLK...', 'KLLLLK..', 'KLLLLLK.', 'KLLLKKKK', 'KLKLK...', 'KK.KLK..', 'K..KLK..', '....KK..'];
const PX_CUR = { mush: ['mushroom', 'mushroom', null, 2], cat: ['cats', 'cat', null, 2], frog: ['frog', 'frog', null, 2], music: ['music', 'note', { K: '#ff7ac8' }, 2] };
const PX_ARROW = { mush: '#d8453f', cat: '#f2a65a', frog: '#59c85a', music: '#ff7ac8' };
function pixCursor(style, hover) {
  const m = /^pix(arrow)?-(mush|cat|frog|music)$/.exec(style); if (!m) return null;
  const k = m[2], arrow = !!m[1], T = PXT[PX_CUR[k][0]];
  const rows = PX_SPR[arrow ? 'arrow' : PX_CUR[k][1]], map = arrow ? { K: '#120b18', L: PX_ARROW[k] } : PX_CUR[k][2], S = 2, o = 2;
  const col = ch => (map && map[ch]) || T.pal[ch] || null, filled = (x, y) => y >= 0 && y < rows.length && x >= 0 && x < rows[y].length && rows[y][x] !== '.';
  let out = '';
  if (hover) for (let y = -1; y <= rows.length; y++) for (let x = -1; x <= rows[0].length; x++) if (!filled(x, y) && (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1))) out += `<rect x="${o + x * S}" y="${o + y * S}" width="${S}" height="${S}" fill="#ffffff" opacity=".9"/>`;
  for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) { const c = rows[y][x] === '.' ? null : col(rows[y][x]); if (c) out += `<rect x="${o + x * S}" y="${o + y * S}" width="${S}" height="${S}" fill="${c}"/>`; }
  return { hx: o, hy: o, body: `<g shape-rendering="crispEdges">${out}</g>` };
}
CURSOR_STYLES.push(['pix-mush', 'Pixel mushroom'], ['pix-cat', 'Pixel cat'], ['pix-frog', 'Pixel frog'], ['pix-music', 'Pixel music note'], ['pixarrow-mush', 'Pixel arrow — mushroom red'], ['pixarrow-cat', 'Pixel arrow — cat orange'], ['pixarrow-frog', 'Pixel arrow — frog green'], ['pixarrow-music', 'Pixel arrow — music pink']);
for (const [id, cur] of [['pixmush', 'pix-mush'], ['pixcat', 'pix-cat'], ['pixfrog', 'pix-frog'], ['pixmusic', 'pix-music']]) UI_SETS.find(x => x.id === id).cursor = cur;
// v0.99.1 Matching pointers for the older sets (drawn as small vector pictures): ink quill (Parchment), little galaxy (Pixel cosmos), crescent moon (Midnight), water drop (Abyss), leaf (Forest), neon arrow (Neon).
function themeCursor(style, hover) {
  const g = hover ? '<circle cx="16" cy="16" r="15" fill="rgba(255,255,255,.18)"/>' : '';
  if (style === 'quill') return { hx: 3, hy: 29, body: `${hover ? '<circle cx="4" cy="28" r="6" fill="rgba(40,70,160,.35)"/>' : ''}<path d="M29 3 C19 3 10 11 6 23 L4 29 L10 26 C21 22 28 14 29 3 Z" fill="${hover ? '#fff6d8' : '#f1e4c0'}" stroke="#3a2a14" stroke-width="1.6" stroke-linejoin="round"/><path d="M5 28 L25 8" stroke="#3a2a14" stroke-width="1.4" fill="none"/><path d="M12 22 L17 24 M15 18 L20 20 M18 14 L23 16" stroke="#8a6a3a" stroke-width="1" fill="none"/><circle cx="4" cy="29" r="${hover ? 2.6 : 1.8}" fill="#1c2a6b"/>` };
  if (style === 'galaxy') return { hx: 16, hy: 16, body: `${g}<defs><radialGradient id="gx" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffe08a"/><stop offset=".35" stop-color="#ff7ac8"/><stop offset="1" stop-color="#2a1b4d"/></radialGradient></defs><circle cx="16" cy="16" r="${hover ? 12.5 : 11}" fill="url(#gx)" opacity=".85"/><path d="M16 16 C16 9 23 8 25 13 C27 19 20 24 14 23 C9 22 7 16 10 12" fill="none" stroke="#46d6c0" stroke-width="2" stroke-linecap="round"/><path d="M16 16 C16 23 9 24 7 19 C5 13 12 8 18 9 C23 10 25 16 22 20" fill="none" stroke="#bff7ea" stroke-width="1.4" stroke-linecap="round" opacity=".8"/><circle cx="16" cy="16" r="2.2" fill="#fff4c4"/><circle cx="5" cy="6" r="1" fill="#fff"/><circle cx="27" cy="26" r="1" fill="#fff"/><circle cx="26" cy="5" r=".8" fill="#46d6c0"/>` };
  if (style === 'moon') return { hx: 16, hy: 16, body: `${g}<path d="M21 4 A12.5 12.5 0 1 0 28 22 A10 10 0 1 1 21 4 Z" fill="${hover ? '#fff1b0' : '#ffe08a'}" stroke="#4a3a10" stroke-width="1.4"/><path d="M25 6 l1 2.4 2.6.2 -2 1.7 .7 2.5 -2.3-1.4 -2.3 1.4 .7-2.5 -2-1.7 2.6-.2z" fill="#fff" stroke="#4a3a10" stroke-width=".6" transform="translate(-3 0) scale(.8)"/>` };
  if (style === 'droplet') return { hx: 16, hy: 16, body: `${g}<defs><linearGradient id="dp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hover ? '#bfe9ff' : '#8ec5ff'}"/><stop offset="1" stop-color="#1f6fc4"/></linearGradient></defs><path d="M16 3 C16 3 7 14 7 20 a9 9 0 0 0 18 0 C25 14 16 3 16 3 Z" fill="url(#dp)" stroke="#0e3a6b" stroke-width="1.4"/><path d="M12 19 a4.5 4.5 0 0 0 3 4.6" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".8"/>` };
  if (style === 'leaf') return { hx: 16, hy: 16, body: `${g}<path d="M5 27 C5 12 16 4 28 5 C28 17 20 27 5 27 Z" fill="${hover ? '#a8e87a' : '#6fc24a'}" stroke="#1f4a1c" stroke-width="1.4" stroke-linejoin="round"/><path d="M5 27 C12 20 18 14 25 8" fill="none" stroke="#1f4a1c" stroke-width="1.3"/><path d="M12 21 L11 15 M16 17 L16 11 M19 14 L23 14" stroke="#2f7a30" stroke-width="1" fill="none"/>` };
  if (style === 'neon') return { hx: 4, hy: 3, body: `<path d="M4 3 L4 24 L10 18.5 L14.5 28 L18 26.5 L13.5 17.5 L21 17 Z" fill="none" stroke="${hover ? '#ff7ac8' : '#46d6c0'}" stroke-width="${hover ? 6 : 5}" stroke-linejoin="round" opacity=".35"/><path d="M4 3 L4 24 L10 18.5 L14.5 28 L18 26.5 L13.5 17.5 L21 17 Z" fill="#120b2b" stroke="${hover ? '#ff7ac8' : '#46d6c0'}" stroke-width="1.8" stroke-linejoin="round"/>` };
  return null;
}
CURSOR_STYLES.push(['quill', 'Ink quill'], ['galaxy', 'Little galaxy'], ['moon', 'Crescent moon'], ['droplet', 'Water drop'], ['leaf', 'Leaf'], ['neon', 'Neon arrow']);
for (const [id, cur] of [['default', 'moon'], ['obsidian', 'gold'], ['abyss', 'droplet'], ['forest', 'leaf'], ['neon', 'neon'], ['parchment', 'quill'], ['light', 'default'], ['cosmos', 'galaxy']]) UI_SETS.find(x => x.id === id).cursor = cur;
