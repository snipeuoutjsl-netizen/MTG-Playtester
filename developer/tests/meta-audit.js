// v0.99.94 Meta deck sample audit: reads every card in tests/meta/sample-*.txt with the app's own card reader and lists each
// line that is not fully understood. Usage: node meta-audit.js <oracle-all.json> [sample file]
const { chromium } = require('playwright'); const fs = require('fs');
(async()=>{ const b = await chromium.launch(); const p = await (await b.newContext({viewport:{width:1280,height:800}})).newPage(); p.setDefaultTimeout(1500000);
await p.addInitScript(()=>{try{localStorage.setItem('mtgpt.welcomeSeen','true'); localStorage.setItem('mtgpt.hallStart','false');}catch(e){}});
await p.goto('file://'+__dirname+'/pt/index.html');
await p.setInputFiles('#fileCards', process.argv[2] || '/tmp/oracle-all.json');
await p.waitForFunction(() => /Card data: \d+/.test(document.querySelector('#dbStatus').textContent), null, { timeout: 900000 });
const sample = fs.readFileSync(process.argv[3] || __dirname + '/meta/sample-2026-11.txt', 'utf8').split('\n').map(s => s.trim());
const names = []; let fmt = ''; for (const l of sample) { if (!l || l.startsWith('# ')) continue; if (l.startsWith('## ')) { fmt = l.slice(3); continue; } names.push([fmt, l]); }
const out = await p.evaluate(names => { const d = __d, res = { missing: [], full: 0, cards: 0, bad: [] }, seen = new Set();
  for (const [fmt, n] of names) { if (seen.has(n)) continue; seen.add(n); const cc = d.compileCard({ name: n }) || d.compileCard({ name: n.split(' // ')[0] }); if (!cc) { res.missing.push(n); continue; } res.cards++;
    const issues = []; for (const l of cc.lines) { if (l.status === 'info' || l.status === 'ok') continue; issues.push({ st: l.status, kind: l.kind, text: String(l.text || l.raw || '').slice(0, 160), missed: (l.missed || []).join(' | ').slice(0, 160) }); }
    if (!issues.length) res.full++; else res.bad.push({ fmt, n, issues }); }
  return res; }, names);
console.log(JSON.stringify({ cards: out.cards, full: out.full, missing: out.missing }));
for (const c of out.bad) { console.log(`\n[${c.fmt}] ${c.n}`); for (const i of c.issues) console.log(`   ${i.st.padEnd(4)} ${i.kind.padEnd(10)} ${i.text}${i.missed ? '\n        missed: ' + i.missed : ''}`); }
await b.close(); })();
