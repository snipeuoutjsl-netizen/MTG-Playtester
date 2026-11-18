# Build developer/tests/corpus.json from a Scryfall oracle-cards .jsonl.gz: real cards named in common.js NAMES + basics.
import gzip, json, re, sys
src, common, out = sys.argv[1:4]
names = set(json.loads(re.search(r'const NAMES=(\[.*?\]);', open(common).read()).group(1)))
names |= {'Island','Swamp','Mountain','Forest','Plains'}
# every real card a test creates by name (mk('Elvish Reclaimer'), newCard("Kaito, Bane of Nightmares") ...), not only the test deck's list
import os
for tf in ['cr-rules.js', 'ui.js']:
    tp = os.path.join(os.path.dirname(os.path.abspath(common)), tf)
    if os.path.exists(tp):
        tsrc = open(tp, encoding="utf-8").read()
        for q in re.findall(r"'((?:[^'\\\n]|\\')+)'|\"([^\"\n]+)\"", tsrc):
            for x in q:
                x = x.replace("\\'", "'").strip()
                if 2 < len(x) < 60 and x[0].isupper(): names.add(x)

cards, seen = [], set()
with gzip.open(src, 'rt', encoding='utf-8') as f:
    for line in f:
        line = line.strip().rstrip(',')
        if not line or line in '[]': continue
        c = json.loads(line)
        n = c['name']
        if (n in names or n.split(' // ')[0] in names) and n not in seen and c.get('layout') not in ('token','art_series'):
            cards.append(c); seen.add(n)
missing = sorted(x for x in names if x.startswith(('Mock ',)) and x not in seen and not any(s.startswith(x+' // ') for s in seen))
import os
mp = os.path.join(os.path.dirname(os.path.abspath(common)), 'mock-cards.json')   # invented test cards (their text is ours, so it is committed)
if os.path.exists(mp):
    mocks = json.load(open(mp)); have = {c['name'] for c in cards}; cards += [m for m in mocks if m['name'] not in have]; seen |= {m['name'] for m in mocks}
    missing = [x for x in missing if x not in seen]
json.dump(cards, open(out, 'w'))
print(len(cards), 'real cards written;', len(missing), 'not found (mock cards):', ', '.join(missing))
