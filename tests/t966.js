const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
await p.evaluate(()=>{const s=__d.state;s.battlefield=[];s.stack=[];s.pendingTriggers=[];s.step=__d.STEPS.findIndex(x=>x.id==='main1');const i=s.library.findIndex(x=>x.name==="Tezzeret, Cruel Captain");const [c]=s.library.splice(i,1);c.loyalty=4;s.battlefield.push(c);window.__t=c.id;__d.render()});
console.log(await p.evaluate(()=>JSON.stringify(__d.parseTriggers(__d.cardInfo("Tezzeret, Cruel Captain").tx,"Tezzeret, Cruel Captain"))));
await p.evaluate(()=>{const d=__d.tokenDefsFromText("Create a 1/1 colorless Thopter artifact creature token with flying.","x")[0];__d.makeTokensFromDef(d,1,'t')});
await p.waitForTimeout(500);
for(let i=0;i<8;i++){await p.waitForTimeout(250);for(const t of ['Put on the stack','Done','OK','Resolve']){const x=p.locator('.modal button:has-text("'+t+'")');if(await x.count()){await x.first().click().catch(()=>{});break}}if(await p.evaluate(()=>__d.state.stack.length&&!document.querySelector('.modal')))await p.evaluate(()=>__d.resolveTopOfStack())}
console.log(await p.evaluate(()=>JSON.stringify({loy:__d.findCard(window.__t).card.loyalty,log:__d.state.log.slice(-4).map(x=>x.msg||x)})));
await p.evaluate(()=>{const s=__d.state;const i=s.library.findIndex(x=>/Memnite|Sol Ring|Mox/.test(x.name));const [c]=s.library.splice(i,1);s.hand.push(c);window.__m=c.id;__d.render()});
await p.evaluate(()=>__d.castSpell(window.__m));await p.waitForTimeout(500);
for(let i=0;i<10;i++){await p.waitForTimeout(250);for(const t of ['Put on the stack','Done','OK','Resolve','Cast']){const x=p.locator('.modal button:has-text("'+t+'")');if(await x.count()){await x.first().click().catch(()=>{});break}}if(await p.evaluate(()=>__d.state.stack.length&&!document.querySelector('.modal')))await p.evaluate(()=>__d.resolveTopOfStack())}
console.log(await p.evaluate(()=>JSON.stringify({loy:__d.findCard(window.__t).card.loyalty,bf:__d.state.battlefield.map(c=>c.name),log:__d.state.log.slice(-4).map(x=>x.msg||x)})));
await b.close()})();
