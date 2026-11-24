// Reader coverage over every Modern-legal card. Usage: node pool-scan.js <oracle-cards JSON array>; prints totals, the most common unhandled line starts, and keywords not enforced.
const { chromium } = require('playwright');
(async()=>{ const b = await chromium.launch(); const p = await (await b.newContext({viewport:{width:1280,height:800}})).newPage();
p.setDefaultTimeout(600000); p.on('pageerror', e=>console.log('PAGEERROR', e.message));
await p.addInitScript(()=>{try{localStorage.setItem('mtgpt.welcomeSeen','true'); localStorage.setItem('mtgpt.hallStart','false');}catch(e){}});
await p.goto('file://'+process.cwd()+'/pt/index.html');
await p.setInputFiles('#fileCards', 'process.argv[2] || "/tmp/oracle-all.json"');
await p.waitForFunction(() => /Card data: \d+/.test(document.querySelector('#dbStatus').textContent), null, { timeout: 600000 });
const r = await p.evaluate(async()=>{ const res = await __d.scanCardPool({ modernOnly: true }, ()=>{}, ()=>false); return { cards: res.cards, full: res.full, withUnk: res.withUnk, lines: res.lines, byKind: res.byKind,
  top: [...res.starts.values()].sort((a,b)=>b.n-a.n).slice(0,40).map(e=>`${e.n}\t${e.kind}\t${e.status}\t${e.shape}\t${e.ex.join(' | ')}`),
  kws: [...res.kws.entries()].sort((a,b)=>b[1].n-a[1].n).slice(0,30).map(([k,e])=>`${e.n}\t${k}\t${e.ex.join(' | ')}`) }; });
console.log(JSON.stringify({cards:r.cards, full:r.full, withUnk:r.withUnk, lines:r.lines, byKind:r.byKind}));
console.log('--- top unhandled line starts'); console.log(r.top.join('\n')); console.log('--- keywords not enforced'); console.log(r.kws.join('\n'));
await b.close(); })();
