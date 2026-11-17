const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
console.log(await p.evaluate(()=>{const s=__d.state;s.battlefield=[];s.graveyard=[];s.stack=[];
 const i=s.library.findIndex(x=>x.name==="Urza's Saga");const [c]=s.library.splice(i,1);c.counters={lore:2};s.battlefield.push(c);
 const d=__d.tokenDefsFromText("Create a 0/0 colorless Construct artifact creature token with \"This creature gets +1/+1 for each artifact you control.\"","Urza's Saga")[0];
 __d.makeTokensFromDef(d,2,"Urza's Saga");
 const o=[];o.push(s.battlefield.map(c=>c.name+' '+(c.token?__d.ptText(c):'')).join(','));
 __d.sagaAdvance(c);__d.flushTriggers();__d.runToughnessSBA&&__d.runToughnessSBA();
 o.push(s.battlefield.map(c=>c.name+' '+(c.token?__d.ptText(c):'')).join(','));o.push('gy:'+s.graveyard.map(c=>c.name));o.push('stack:'+s.stack.length+' pend:'+s.pendingTriggers.length);
 return o.join('\n')}));
await p.waitForTimeout(500);
for(let i=0;i<10;i++){for(const t of ['Put on the stack','Done','Finish','OK','Skip','Resolve']){const x=p.locator('.modal button:has-text("'+t+'")');if(await x.count()){await x.first().click().catch(()=>{});break}}
 await p.waitForTimeout(250);if(await p.evaluate(()=>__d.state.stack.length&&!document.querySelector('.modal')))await p.evaluate(()=>__d.resolveTopOfStack())}
console.log(await p.evaluate(()=>__d.state.battlefield.map(c=>c.name+' '+(c.token?__d.ptText(c):'')).join(',')+' | gy:'+__d.state.graveyard.map(c=>c.name)+' | '+__d.state.log.slice(-5).map(x=>x.msg||x).join(' // ')));
console.log(await p.evaluate(()=>[...document.querySelectorAll('.modal')].map(m=>m.innerText.slice(0,300).replace(/\n+/g,' | '))));
await b.close()})();
