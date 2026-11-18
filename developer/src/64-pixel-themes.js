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
