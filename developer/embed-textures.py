# v0.99.80 put the wood-gen2.py textures into app/style.css (in-app updates only ship index.html, app.js, style.css, package.json).
# Usage: python3 embed-textures.py <dir with the .webp files>
import re, sys, base64, os
d = sys.argv[1]; css_p = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'app', 'style.css')
css = open(css_p).read()
uri = lambda f: 'url(data:image/webp;base64,' + base64.b64encode(open(os.path.join(d, f), 'rb').read()).decode() + ')'
pat = re.compile(r'url\(data:image/\w+;base64,[A-Za-z0-9+/=]+\)')
var_map = {'--wood-plank': 'plank2.webp', '--wood-desk': 'desk2.webp', '--wall-plaster': 'plaster2.webp', '--wood-panel': 'panel2.webp'}
out = []; last = 0; n = 0
for m in pat.finditer(css):
    pre = css[max(0, m.start() - 40):m.start()]
    line_start = css.rfind('\n', 0, m.start()) + 1
    line = css[line_start:line_start + 120]
    rep = None
    for v, f in var_map.items():
        if pre.rstrip().endswith(v + ':'): rep = uri(f)
    if rep is None and line.startswith('#hall.portrait .hall-desktop { left: -450px'): rep = uri('desk2_persp_portrait.webp')
    elif rep is None and line.startswith('#hall .hall-desktop { left: -800px'): rep = uri('desk2_persp.webp')
    elif rep is None and '.hall-desktop' in line: rep = 'none'   # older desk pictures, overridden later
    if rep is None: rep = m.group(0); print('kept', line[:60])
    out.append(css[last:m.start()]); out.append(rep); last = m.end(); n += 1
out.append(css[last:])
new = ''.join(out); open(css_p, 'w').write(new)
print(n, 'pictures;', len(css), '->', len(new), 'bytes')
