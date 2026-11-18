# Build developer/tests/corpus.json from a Scryfall oracle-cards .jsonl.gz: real cards named in common.js NAMES + basics.
import gzip, json, re, sys
src, common, out = sys.argv[1:4]
names = set(json.loads(re.search(r'const NAMES=(\[.*?\]);', open(common).read()).group(1)))
names |= {'Island','Swamp','Mountain','Forest','Plains'}
cards, seen = [], set()
with gzip.open(src, 'rt', encoding='utf-8') as f:
    for line in f:
        line = line.strip().rstrip(',')
        if not line or line in '[]': continue
        c = json.loads(line)
        n = c['name']
        if (n in names or n.split(' // ')[0] in names) and n not in seen and c.get('layout') not in ('token','art_series'):
            cards.append(c); seen.add(n)
missing = sorted(x for x in names if x not in seen and not any(s.startswith(x+' // ') for s in seen))
json.dump(cards, open(out, 'w'))
print(len(cards), 'real cards written;', len(missing), 'not found (mock cards):', ', '.join(missing))
