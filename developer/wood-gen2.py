# v0.99.80 Higher quality Library textures (our own procedural work, no outside images).
# Wood is grown from real growth rings: each board is a slice through a log whose pith wanders, so the
# rings show as cathedral arches and straight stripes, with pores, rays and per-board colour.
# Run from developer/:  python3 wood-gen2.py   (writes *.webp next to it, then embed-textures.py puts them in app/style.css)
import numpy as np
from PIL import Image, ImageFilter
R = np.random.default_rng

def noise(h, w, cy, cx, seed, wrap=True):
    """smooth value noise: a cy x cx random grid, bicubic up to h x w, tileable when wrap."""
    g = R(seed).random((cy, cx))
    if wrap:
        g = np.tile(g, (3, 3))
        im = Image.fromarray((g * 65535).astype(np.uint16).astype(np.int32), 'I').resize((3 * w, 3 * h), Image.BICUBIC)
        a = np.asarray(im, float)[h:2 * h, w:2 * w]
    else:
        im = Image.fromarray((g * 65535).astype(np.int32), 'I').resize((w, h), Image.BICUBIC)
        a = np.asarray(im, float)
    return a / 65535.

def fbm(h, w, base, seed, octaves=5, sx=1, sy=1):
    o = np.zeros((h, w)); amp = 1; tot = 0
    for i in range(octaves):
        o += amp * noise(h, w, max(2, int(base * (2 ** i) / sy)), max(2, int(base * (2 ** i) / sx)), seed + i)
        tot += amp; amp *= .5
    return o / tot

def cells(h, w, py, px, seed, octaves=1):
    """value noise with cells of py x px pixels (stretched along the grain when px >> py)."""
    o = np.zeros((h, w)); amp = 1; tot = 0
    for i in range(octaves):
        o += amp * noise(h, w, max(2, int(h / py * 2 ** i)), max(2, int(w / px * 2 ** i)), seed + 17 * i)
        tot += amp; amp *= .55
    return o / tot

def board(w, h, seed, light, dark, ring=9.0, wild=1.0, sc=1.0):
    """one board, grain running along x. Returns float RGB 0..255."""
    r = R(seed)
    y, x = np.mgrid[0:h, 0:w].astype(float)
    # the pith of the log runs under the board and wanders slowly along it
    pith_y = h * (r.uniform(.2, .8) + .9 * (fbm(1, w, 2, seed + 1, 3)[0] - .5) * wild)
    pith_z = h * r.uniform(.05, .9)                              # how deep under the face: shallow = arches, deep = stripes
    d = np.sqrt((y - pith_y[None, :]) ** 2 + pith_z ** 2)
    d = d + 6 * (fbm(h, w, 3, seed + 2, 4, sx=8) - .5) * h / 60   # rings are never perfectly round
    v = d / h * ring
    v = v + .25 * np.sin(v * .37 + r.uniform(0, 6))              # some years grow wider than others
    f = v - np.floor(v)
    late = np.clip((f - .62) / .38, 0, 1) ** 1.6                  # earlywood light, latewood darkening to the ring line
    line = np.exp(-((1 - f) / .035))                              # crisp ring boundary
    pores = cells(h, w, 1.6 * sc, 70 * sc, seed + 3, 2)                    # long open pores along the grain
    pores = np.clip((pores - .62) * 3.5, 0, 1)
    fine = cells(h, w, 1.2 * sc, 28 * sc, seed + 4, 3)                      # fibre
    streak = cells(h, w, 6 * sc, 300 * sc, seed + 7, 3)                     # figure streaks
    ray = np.clip((cells(h, w, 2 * sc, 7 * sc, seed + 5, 1) - .8) * 6, 0, 1)  # medullary flecks
    tone = cells(h, w, h / 2, w / 3, seed + 6, 3)                 # mineral streaks, colour drift
    t = .80 - .36 * late - .24 * line + .16 * (fine - .5) - .22 * pores + .06 * ray + .22 * (tone - .5) + .18 * (streak - .5)
    t = np.clip(t, 0, 1)[..., None]
    lo, hi = np.array(dark, float), np.array(light, float)
    col = lo * (1 - t) + hi * t
    # warmer, redder heartwood toward the ring lines
    col[..., 0] += 6 * late; col[..., 2] -= 4 * late
    return col

def planks(w, h, n, seed, light, dark, ring=9.0, seam=2, wild=1.0, sc=1.0):
    """n boards stacked across the height, each its own colour, with a dark seam and a slight bevel."""
    out = np.zeros((h, w, 3)); r = R(seed); edges = np.linspace(0, h, n + 1).astype(int)
    for i in range(n):
        a, b = edges[i], edges[i + 1]
        k = r.uniform(.88, 1.1); kd = r.uniform(.85, 1.1)
        bd = board(w, b - a, seed * 31 + i, tuple(c * k for c in light), tuple(c * kd for c in dark), ring * r.uniform(.8, 1.25), wild, sc)
        yy = np.arange(b - a)[:, None, None]
        bev = 1 - .18 * np.exp(-yy / (3 * sc)) - .28 * np.exp(-(b - a - 1 - yy) / (3 * sc))
        out[a:b] = bd * bev
        out[a:a + int(seam * sc)] *= .35
    return out

def save(a, name, q=82, blur=.35):
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    if blur: im = im.filter(ImageFilter.GaussianBlur(blur))
    im.save(name, 'WEBP', quality=q, method=6)
    return im

if __name__ == '__main__':
    import os
    # desk top: 2048 x 1024, six walnut boards running left to right
    desk = planks(2048, 1024, 6, 7, (176, 118, 76), (70, 40, 24), ring=18)
    save(desk, 'desk2.webp', 84)
    # shelf / plaque plank: one long board
    save(board(2048, 320, 91, (168, 112, 74), (72, 42, 26), ring=22), 'plank2.webp', 82)
    # wall panelling boards (darker)
    save(planks(1024, 1024, 4, 55, (96, 62, 40), (34, 20, 12), ring=20) .transpose(1, 0, 2), 'panel2.webp', 80)
    # plaster: soft trowel strokes, mottling and fine sand, tileable 512
    w = 512
    t = .45 * fbm(w, w, 3, 201, 4) + .35 * fbm(w, w, 8, 211, 3, sx=2.5) + .2 * fbm(w, w, 96, 221, 2)
    t = (t - t.mean()) / t.std()
    sand = R(9).normal(0, 1, (w, w))
    pl = np.array((60, 44, 33.))[None, None] * (1 + .09 * t[..., None] + .025 * sand[..., None])
    save(pl, 'plaster2.webp', 80, blur=.4)
    print({f: os.path.getsize(f) for f in ['desk2.webp', 'plank2.webp', 'panel2.webp', 'plaster2.webp']})

# The desk top pre-rendered in perspective with the room's camera (see wood-gen.py desk_persp), now sampled
# bilinearly with 2x2 supersampling so the far boards don't shimmer, with a soft lamp sheen in the varnish.
def desk_persp2(src='desk2.webp', out='desk2_persp.webp', P=1800., eye=(800., 470.), y0=560, y1=1040, W=1600, depth=1650.,
                left=-500., width=2600., x0=0., res=1., lamp=(800., 360.), q=82):
    tex = np.asarray(Image.open(src).convert('RGB'), float); th, tw = tex.shape[:2]
    H, Wp = int((y1 - y0) * res), int(W * res)
    acc = np.zeros((H, Wp, 3)); sheen = np.zeros((H, Wp))
    for oy in (.25, .75):
        for ox in (.25, .75):
            Y, X = np.mgrid[0:H, 0:Wp].astype(float)
            Y = y0 + (Y + oy) / res; X = x0 + (X + ox) / res
            m = np.maximum((Y - eye[1]) / (y0 - eye[1]), 1.0)
            z = P * (1 - 1 / m); u = eye[0] + (X - eye[0]) / m
            fx = np.mod((u - left) / width, 1.0) * tw; fy = np.clip(z / depth * (th - 1), 0, th - 1.001)
            x0i = np.floor(fx).astype(int) % tw; x1i = (x0i + 1) % tw; y0i = np.floor(fy).astype(int); y1i = np.minimum(y0i + 1, th - 1)
            ax = (fx - np.floor(fx))[..., None]; ay = (fy - y0i)[..., None]
            c = (tex[y0i, x0i] * (1 - ax) + tex[y0i, x1i] * ax) * (1 - ay) + (tex[y1i, x0i] * (1 - ax) + tex[y1i, x1i] * ax) * ay
            acc += c / 4
            # varnish: a broad warm reflection of a lamp hanging over the book, stretched toward the viewer
            dx = (u - lamp[0]) / 520.; dz = (z - lamp[1]) / 300.
            sheen += np.exp(-(dx * dx + dz * dz)) / 4
    Yr = y0 + (np.arange(H)[:, None] + .5) / res
    mr = np.maximum((Yr - eye[1]) / (y0 - eye[1]), 1.0); zr = P * (1 - 1 / mr)
    shade = np.clip(.42 + .58 * np.minimum(1, zr / 420.), 0, 1)[..., None]   # darker against the wall
    img = acc * shade * (1 + .10 * sheen[..., None]) + np.array((255, 214, 160.)) * .16 * sheen[..., None] ** 1.5
    Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(out, 'WEBP', quality=q, method=6)

if __name__ == '__main__':
    big = planks(4096, 2048, 6, 7, (176, 118, 76), (70, 40, 24), ring=18, sc=2.0)   # render source only, never shipped
    save(big, 'desk2_big.webp', 92, blur=.5)
    desk_persp2(src='desk2_big.webp', x0=-800., W=3200, res=.85)
    desk_persp2(src='desk2_big.webp', out='desk2_persp_portrait.webp', eye=(450., 760.), y0=1290, y1=1960, W=1800, x0=-450., res=.9, lamp=(450., 330.))
    print({f: os.path.getsize(f) for f in ['desk2_persp.webp', 'desk2_persp_portrait.webp']})

# Leather: pebble grain (cellular noise, creases between the pebbles) plus a few long wrinkles. Neutral grey
# around 128, tileable, so CSS can lay it over any book colour with background-blend-mode: overlay.
def leather(w=256, cell=9, seed=3):
    r = R(seed); n = w // cell
    pts = (np.arange(n)[:, None, None] + r.random((n, n, 2))) * cell  # one jittered point per cell (y, x)
    y, x = np.mgrid[0:w, 0:w].astype(float) + .5
    f1 = np.full((w, w), 1e9); f2 = np.full((w, w), 1e9)
    for dy in range(n):
        for dx in range(n):
            py, px = pts[dy, dx, 0], dx * cell + (pts[dy, dx, 1] - dy * cell)
            ddy = np.abs(y - py); ddy = np.minimum(ddy, w - ddy)
            ddx = np.abs(x - px); ddx = np.minimum(ddx, w - ddx)
            d = np.sqrt(ddy * ddy + ddx * ddx)
            f2 = np.where(d < f1, f1, np.minimum(f2, d)); f1 = np.minimum(f1, d)
    edge = np.clip((f2 - f1) / (cell * .35), 0, 1)                 # 0 in the creases, 1 on the pebble tops
    dome = 1 - np.clip(f1 / (cell * .75), 0, 1) ** 2                 # pebbles are slightly domed
    wr = fbm(w, w, 4, seed + 9, 3, sx=3)                             # long soft wrinkles
    v = .55 * edge ** .6 + .25 * dome + .2 * wr
    v = (v - v.mean()) / v.std()
    g = 128 + 16 * v
    a = np.repeat(g[..., None], 3, 2)
    save(a, 'leather.webp', 80, blur=.5)

if __name__ == '__main__':
    leather(); print('leather', os.path.getsize('leather.webp'))
