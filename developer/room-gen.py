# v0.99.87 Library rooms: wall textures drawn by our own generator (no outside images). Tileable 512 px.
# Run from developer/:  python3 room-gen.py <outdir>   then embed with embed-rooms.py
import sys, os, numpy as np
from PIL import Image, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib.util
spec = importlib.util.spec_from_file_location('wg', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'wood-gen2.py')); wg = importlib.util.module_from_spec(spec); spec.loader.exec_module(wg)
R = np.random.default_rng

def ashlar(w=512, row=64, seed=11, base=(132, 126, 116), mortar=(70, 64, 56)):
    """castle wall: courses of cut stone blocks, each its own tone, bevelled edges, chips and grain"""
    r = R(seed); img = np.zeros((w, w, 3)); grain = wg.fbm(w, w, 24, seed + 1, 4); spots = wg.fbm(w, w, 6, seed + 2, 3); pits = np.clip((wg.fbm(w, w, 120, seed + 4, 2) - .62) * 4, 0, 1)
    y = 0; ci = 0
    while y < w:
        x = int(r.uniform(0, 120)) - 160
        while x < w:
            bw = int(r.uniform(96, 176)); k = r.uniform(.8, 1.1); tint = np.array(base) * k * np.array((1, 1 + r.uniform(-.015, .015), 1 + r.uniform(-.03, .02)))
            for xx0 in (x, x - w, x + w):   # tile horizontally
                x0, x1 = max(0, xx0), min(w, xx0 + bw)
                if x1 <= x0: continue
                yy, xx = np.mgrid[y:min(w, y + row), x0:x1]
                ex = np.minimum(xx - xx0, xx0 + bw - 1 - xx); ey = np.minimum(yy - y, y + row - 1 - yy); e = np.minimum(ex, ey)
                bev = np.clip(e / 6., 0, 1) ** .7
                light = np.where((yy - y) < 5, 1.12, 1.0) * np.where((xx - xx0) < 4, 1.06, 1.0) * np.where((y + row - 1 - yy) < 5, .8, 1.0)
                t = (.86 + .26 * (grain[yy, xx] - .5) + .18 * (spots[yy, xx] - .5) - .12 * pits[yy, xx])[..., None]
                col = tint[None, None] * t * (bev * light)[..., None] + np.array(mortar)[None, None] * (1 - bev)[..., None]
                img[y:min(w, y + row), x0:x1] = col
            x += bw
        y += row; ci += 1
    img = img * (1 + .05 * r.normal(0, 1, (w, w, 1)))
    return img

def rubble(w=512, cell=58, seed=21, base=(78, 80, 74), mortar=(24, 24, 22)):
    """dungeon wall: rough fieldstones (cellular), deep dark mortar, damp streaks running down"""
    r = R(seed); n = w // cell
    pts = (np.stack(np.mgrid[0:n, 0:n], -1) + r.uniform(.15, .85, (n, n, 2))) * cell
    y, x = np.mgrid[0:w, 0:w].astype(float)
    f1 = np.full((w, w), 1e9); f2 = np.full((w, w), 1e9); idx = np.zeros((w, w), int)
    for i in range(n):
        for j in range(n):
            py, px = pts[i, j]; dy = np.abs(y - py); dy = np.minimum(dy, w - dy); dx = np.abs(x - px); dx = np.minimum(dx, w - dx)
            d = np.sqrt(dy * dy + dx * dx * 1.25)
            closer = d < f1; f2 = np.where(closer, f1, np.minimum(f2, d)); idx = np.where(closer, i * n + j, idx); f1 = np.minimum(f1, d)
    edge = np.clip((f2 - f1) / 9., 0, 1) ** .55
    tone = R(seed + 1).uniform(.7, 1.15, n * n)[idx]
    grain = wg.fbm(w, w, 20, seed + 2, 4); damp = wg.cells(w, w, 90, 14, seed + 3, 2)
    rough = wg.fbm(w, w, 70, seed + 4, 3)
    t = (tone * (.82 + .3 * (grain - .5) + .2 * (rough - .5)) * (1 - .15 * np.clip((damp - .6) * 3, 0, 1)))[..., None]
    col = np.array(base)[None, None] * t * edge[..., None] + np.array(mortar)[None, None] * (1 - edge)[..., None]
    col[..., 1] += 6 * np.clip((damp - .6) * 3, 0, 1) * edge   # a little green where it is wet
    return col

def night(w=512, seed=31):
    """wizard's tower: deep indigo plaster with faint painted stars"""
    base = np.array((34, 30, 70.))
    t = .45 * wg.fbm(w, w, 3, seed, 4) + .35 * wg.fbm(w, w, 8, seed + 1, 3) + .2 * wg.fbm(w, w, 64, seed + 2, 2)
    col = base[None, None] * (.75 + .5 * t)[..., None]
    r = R(seed + 3)
    for _ in range(70):
        cy, cx, s = r.uniform(0, w), r.uniform(0, w), r.uniform(.6, 1.8)
        yy, xx = np.mgrid[0:w, 0:w]; dy = np.minimum(np.abs(yy - cy), w - np.abs(yy - cy)); dx = np.minimum(np.abs(xx - cx), w - np.abs(xx - cx))
        g = np.exp(-(dy * dy + dx * dx) / (2 * s * s)) * r.uniform(.4, 1)
        col += g[..., None] * np.array((230, 215, 160.))
    return col

def moss(w=512, seed=41):
    """elven grove: old green stone furred with moss"""
    st = rubble(w, 74, seed, base=(70, 84, 58), mortar=(28, 38, 22))
    m = wg.fbm(w, w, 10, seed + 5, 4)
    mossy = np.clip((m - .45) * 3, 0, 1)[..., None]
    fur = wg.fbm(w, w, 90, seed + 6, 2)[..., None]
    return st * (1 - mossy) + (np.array((62, 96, 40.)) * (.8 + .5 * fur)) * mossy

if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '.'
    for name, fn in [('castle', ashlar), ('dungeon', rubble), ('night', night), ('moss', moss)]:
        p = os.path.join(out, f'wall-{name}.webp'); wg.save(fn(), p, 80, blur=.5); print(name, os.path.getsize(p))
