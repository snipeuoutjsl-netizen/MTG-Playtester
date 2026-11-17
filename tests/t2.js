const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
for(const n of ['Mock Scry Gain','Mock Mill Gain']){
const r=await p.evaluate((n)=>{const s=__d.state;const o=__d.effectOptions(s.library.find(c=>c.name===n).oracle||'', {sourceName:n});return o.map(x=>x.label)},n);console.log(n,JSON.stringify(r));}
// run chain 2
const out=await p.evaluate(()=>{const s=__d.state;const tx='You gain 2 life. If you do, you lose 1 life.';const o=__d.effectOptions(tx,{sourceName:'X'});const ch=o.find(x=>x.chain);const l0=s.life;ch&&ch.fn();return {has:!!ch,l0,l1:s.life}});
console.log(JSON.stringify(out));
const out2=await p.evaluate(()=>{const s=__d.state;const tx='Scry 1. Then you gain 3 life.';const o=__d.effectOptions(tx,{sourceName:'X'});const ch=o.find(x=>x.chain);window.__l0=s.life;ch&&ch.fn();return {has:!!ch,l0:s.life,modals:document.querySelectorAll('.modal').length}});
console.log(JSON.stringify(out2));
await p.waitForTimeout(400);
const b1=p.locator('.modal footer button.primary').first();console.log(await p.evaluate(()=>[...document.querySelectorAll('.modal button')].map(e=>e.innerText).join('|')));
await p.locator('.modal button:has-text("Confirm")').click();await p.waitForTimeout(1000);console.log('after scry life',await p.evaluate(()=>__d.state.life));
// if-you-do skipped case
const sk=await p.evaluate(()=>{const s=__d.state;const o=__d.effectOptions('You lose 0 life. If you do, you gain 5 life.',{sourceName:'Y'});return o.map(x=>x.label)});console.log(JSON.stringify(sk));
await b.close()})();
