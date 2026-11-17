const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
await p.locator('button:has-text("⚙")').first().click();await p.click('#btnSettings');await p.waitForTimeout(300);
for(const k of ['gfx','board','anim','snd','tutor']){await p.click('.settabbtn[data-k='+k+']');await p.waitForTimeout(200);
const r=await p.evaluate(()=>[...document.querySelectorAll('.modal button,.modal select,.modal input:not([type=checkbox]):not([type=radio])')].filter(e=>e.getBoundingClientRect().height>0).map(e=>{const r=e.getBoundingClientRect(),c=getComputedStyle(e);return `${e.tagName}.${e.className.toString().slice(0,22)} "${(e.innerText||e.value||'').slice(0,14)}" ${Math.round(r.width)}x${Math.round(r.height)} fs${c.fontSize} r${c.borderRadius}`}));
console.log('--',k);const seen=new Set();for(const x of r){const key=x.replace(/"[^"]*"/,'').replace(/\d+x/,'x');if(!seen.has(key)){seen.add(key);console.log(' ',x)}}}
console.log('STACK');console.log(await p.evaluate(()=>[...document.querySelectorAll('#stackBox button,#stackBox input,#stackBox select,#handWrap .legend *, #logBox button')].map(e=>{const r=e.getBoundingClientRect(),c=getComputedStyle(e);return `${e.tagName}#${e.id}.${e.className} ${Math.round(r.width)}x${Math.round(r.height)} fs${c.fontSize} r${c.borderRadius}`}).join('\n')));
await b.close()})();
