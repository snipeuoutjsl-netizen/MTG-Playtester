const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
await p.evaluate(()=>{const s=__d.state;s.battlefield=[];s.stack=[];s.step=__d.STEPS.findIndex(x=>x.id==='main1');
 const mk=(n,z)=>{const i=s.library.findIndex(x=>x.name===n);const [c]=s.library.splice(i,1);s[z].push(c);return c};
 const t=mk('Tezzeret, Cruel Captain','hand');s.hand.splice(s.hand.indexOf(t),1);__d.enterBattlefield(t,{from:'hand'});window.__t=t.id;
 const m=mk('Memnite','hand');window.__m=m.id;__d.render()});
await p.waitForTimeout(300);
const info=l=>p.evaluate(()=>{const t=__d.state.battlefield.find(x=>x.id===window.__t);return JSON.stringify({loy:t&&t.loyalty,counters:t&&t.counters,pend:__d.state.pendingTriggers.map(x=>x.text.slice(0,60)),m:[...document.querySelectorAll('.modal')].map(m=>m.innerText.slice(0,60).replace(/\n+/g,' | '))})}).then(x=>console.log(l,x));
await info('entered');
await p.evaluate(()=>{const c=__d.state.hand.find(x=>x.id===window.__m);__d.moveCard(c.id,'battlefield');__d.flushTriggers()});await p.waitForTimeout(500);await info('memnite in');
const pump=async()=>{for(let i=0;i<8;i++){await p.waitForTimeout(250);let did=false;for(const t of ['Put on the stack','Apply','Done','Finish']){const x=p.locator('.modal button:has-text("'+t+'")');if(await x.count()){await x.first().click().catch(()=>{});did=true;break}}
 if(!did&&await p.evaluate(()=>__d.state.stack.length)){await p.evaluate(()=>__d.resolveTopOfStack());did=true}if(!did)break}};
await pump();await info('after resolve');
await b.close()})();
