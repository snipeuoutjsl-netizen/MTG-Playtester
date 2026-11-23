# Procedural wood textures (our own work; tileable along the grain direction).
import numpy as np
from PIL import Image, ImageFilter
R = np.random.default_rng
def per1(n, w, terms, seed, fmax):  # periodic 1-D noise over x
    r = R(seed); x = np.arange(w); o = np.zeros(w)
    for i in range(terms):
        f = r.integers(1, fmax + 1); o += np.sin(2*np.pi*f*x/w + r.uniform(0, 6.3)) / f
    return o / np.abs(o).max()
def streaks(w, h, seed, sx, sy=1):
    n = R(seed).random((max(2, h // sy), max(2, w // sx)))
    n = np.concatenate([n, n[:, :1]], 1)  # wrap
    img = Image.fromarray((n * 255).astype(np.uint8)).resize((w + w // max(2, w // sx), h), Image.BICUBIC)
    return np.asarray(img, float)[:, :w] / 255
def wood(w, h, light, dark, rings, seed, arch=0.0, bands=1):
    r = R(seed); y, x = np.mgrid[0:h, 0:w].astype(float)
    # slow drift of the grain along the board, plus an optional cathedral arch (flat-sawn look)
    drift = per1(1, w, 6, seed, 3)[None, :] * 11
    xc = (x / w - .5)
    v = (y + drift + arch * h * (np.cos(2*np.pi*xc) * .5 + .5) * np.sin(np.pi*y/h)) / h * rings
    # irregular ring widths
    v = v + 0.35 * np.sin(v * 0.71 + r.uniform(0, 6)) + 0.2 * np.sin(v * 1.93 + r.uniform(0, 6))
    f = v - np.floor(v)
    late = np.exp(-((1 - f) / 0.14)) + 0.6*np.exp(-(f / 0.05))   # thin dark latewood edge
    early = 1 - late
    pores = streaks(w, h, seed + 5, 90, 1)                         # long thin pore lines
    pores = (pores > .78) * (pores - .78) * 3.5
    fibre = streaks(w, h, seed + 6, 30, 1) * .5 + streaks(w, h, seed + 7, 160, 2) * .5
    tone = streaks(w, h, seed + 8, w // 2, h // 6)                 # broad colour variation
    t = .30 + .55 * early + .12 * (fibre - .5) - .28 * pores + .22 * (tone - .5)
    t = np.clip(t, 0, 1)[..., None]
    col = np.array(dark, float) * (1 - t) + np.array(light, float) * t
    im = Image.fromarray(np.clip(col, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(.6))
    return im
wood(1024, 160, (156, 104, 72), (74, 44, 28), 12, 11).save('plank.jpg', quality=82)
wood(512, 512, (92, 60, 38), (36, 21, 12), 22, 21).save('panel.jpg', quality=78)
wood(1024, 512, (170, 116, 76), (82, 48, 28), 16, 31).save('desk.jpg', quality=82)
import os; print({f: os.path.getsize(f) for f in ['plank.jpg', 'panel.jpg', 'desk.jpg']})
# plaster wall tile
r = R(5); w = 256
def tile(n, s):
    a = np.tile(r.random((n, n)), (3, 3)); im = Image.fromarray((a * 255).astype(np.uint8)).resize((3 * w, 3 * w), Image.BICUBIC).filter(ImageFilter.GaussianBlur(s))
    return np.asarray(im, float)[w:2 * w, w:2 * w] / 255
t = .5 * tile(8, 6) + .3 * tile(32, 2) + .2 * tile(128, .6); t = (t - t.mean()) * 1.1 + .5
Image.fromarray(np.clip(np.array((58, 42, 32.))[None, None] * (0.82 + 0.36 * t[..., None]), 0, 255).astype(np.uint8)).save('plaster.jpg', quality=72)
# Embed as data URIs in app/style.css (in-app updates only ship index.html, app.js, style.css and package.json).
