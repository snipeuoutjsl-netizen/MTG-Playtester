# v0.99.98 the desk between the bookcases, rendered with the room's own camera (CSS perspective 2200px, origin 800,40):
# a reading table whose top recedes to the same vanishing point as the shelves, with a front apron. Transparent outside the table.
import sys, numpy as np

from PIL import Image
import importlib.util
spec = importlib.util.spec_from_file_location('wg', __import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)), 'wood-gen2.py')); wg = importlib.util.module_from_spec(spec); spec.loader.exec_module(wg)
P, EX, EY = 2200., 800., 40.
Y0, YF, YA = 540., 836., 876.          # back edge (wall), front edge, bottom of the apron (room coordinates)
XB0, XB1 = 590., 1010.                 # back edge left/right
L, T, W, H = 440, 540, 720, 340        # the picture's place in the room
res = 2
tex = np.asarray(wg.planks(2048, 2048, 7, 7, (176, 118, 76), (70, 40, 24), ring=18, sc=2.0), float).transpose(1, 0, 2)   # boards run front to back
th, tw = tex.shape[:2]
Hp, Wp = H * res, W * res
img = np.zeros((Hp, Wp, 4))
acc = np.zeros((Hp, Wp, 3)); cov = np.zeros((Hp, Wp))
for oy in (.25, .75):
    for ox in (.25, .75):
        Yi, Xi = np.mgrid[0:Hp, 0:Wp].astype(float)
        Y = T + (Yi + oy) / res; X = L + (Xi + ox) / res
        m = (Y - EY) / (Y0 - EY)                       # >= 1 on the table top
        top = (Y >= Y0) & (Y <= YF)
        u = EX + (X - EX) / np.maximum(m, 1e-6)        # where this point is on the back edge
        inside = top & (u >= XB0) & (u <= XB1)
        z = P * (1 - 1 / np.maximum(m, 1))             # depth toward the viewer
        fx = np.mod((u - XB0) / (XB1 - XB0) * tw * .8, tw); fy = np.mod(z / 900. * th, th - 1.001)
        xi = np.floor(fx).astype(int) % tw; yi = np.floor(fy).astype(int)
        c = tex[yi, xi]
        shade = (.55 + .45 * np.clip(z / 500., 0, 1))[..., None]
        sheen = np.exp(-(((u - EX) / 260.) ** 2 + ((z - 380.) / 260.) ** 2))[..., None]
        c = c * shade * (1 + .08 * sheen) + np.array((255, 214, 160.)) * .10 * sheen ** 1.5
        # the front apron: a flat band under the front edge, as wide as the front edge
        mF = (YF - EY) / (Y0 - EY); xf0, xf1 = EX + (XB0 - EX) * mF, EX + (XB1 - EX) * mF
        apr = (Y > YF) & (Y <= YA) & (X >= xf0) & (X <= xf1)
        ca = tex[np.mod((X * 2).astype(int), th), np.clip(((Y - YF) * 6).astype(int), 0, tw - 1)] * .62
        ca = ca * (1 - .35 * ((Y - YF) / (YA - YF)))[..., None]
        lip = (Y > YF - 2.5) & (Y <= YF + 1.5) & (X >= xf0) & (X <= xf1)
        col = np.where(inside[..., None], c, np.where(apr[..., None], ca, 0))
        col = np.where(lip[..., None], col * 1.35 + 18, col)
        acc += col / 4; cov += (inside | apr | lip) / 4.
img[..., :3] = acc / np.maximum(cov, 1e-6)[..., None]; img[..., 3] = cov * 255
Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), 'RGBA').save('desk3.webp', 'WEBP', quality=84, method=6)
print('ok', Image.open('desk3.webp').size)
