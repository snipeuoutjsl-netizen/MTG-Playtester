const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
await p.evaluate(()=>{const s=__d.state;s.battlefield=[];s.stack=[];s.step=__d.STEPS.findIndex(x=>x.id==='main1');const i=s.library.findIndex(x=>x.name==="Tezzeret, Cruel Captain");const [c]=s.library.splice(i,1);c.loyalty=4;s.battlefield.push(c);window.__t=c.id;__d.render()});
console.log(await p.evaluate(()=>{const c=__d.findCard(window.__t).card;return JSON.stringify({loy:c.loyalty,ab:__d.pwAbilities(c)})}));
await p.evaluate(()=>{const c=__d.findCard(window.__t).card;__d.activatePW(c,__d.pwAbilities(c)[0],0)});
for(let i=0;i<8;i++){await p.waitForTimeout(250);if(await p.evaluate(()=>__d.state.stack.length&&!document.querySelector('.modal')))await p.evaluate(()=>__d.resolveTopOfStack());for(const t of ['Put on the stack','Done','OK']){const x=p.locator('.modal button:has-text("'+t+'")');if(await x.count()){await x.first().click().catch(()=>{});break}}}
console.log(await p.evaluate(()=>JSON.stringify({loy:__d.findCard(window.__t).card.loyalty,hand:__d.state.hand.length,stack:__d.state.stack.map(o=>o.text||o.name),log:__d.state.log.slice(-5).map(x=>x.msg||x)})));
console.log(await p.evaluate(()=>[...document.querySelectorAll('.modal')].map(m=>m.innerText.slice(0,300).replace(/\n+/g,' | '))));
await b.close()})();
