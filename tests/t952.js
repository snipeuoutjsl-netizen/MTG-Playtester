const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
await p.evaluate(()=>{const s=__d.state;s.battlefield=[];s.stack=[];s.step=__d.STEPS.findIndex(x=>x.id==='main1');const i=s.library.findIndex(x=>x.name==="Urza's Saga");const [c]=s.library.splice(i,1);s.hand.push(c);window.__u=c.id;__d.render()});
await p.evaluate(()=>__d.playLand(window.__u));await p.waitForTimeout(400);
const pump=async()=>{for(let i=0;i<10;i++){await p.waitForTimeout(250);let did=false;
  for(const t of ['Put on the stack','Done','Finish']){const x=p.locator('.modal button:has-text("'+t+'")');if(await x.count()){await x.first().click().catch(()=>{});did=true;break}}
  if(!did&&await p.evaluate(()=>__d.state.stack.length)){await p.evaluate(()=>__d.resolveTopOfStack());did=true}
  if(!did)break}};
const info=l=>p.evaluate(()=>{const c=__d.state.battlefield.find(x=>x.id===window.__u);return JSON.stringify({g:c&&c.gained,ab:c&&__d.activatedAbilitiesFor(c).map(a=>a.cost+'=>'+a.effect),saga:!!c,lore:c&&c.counters.lore,mana:c&&__d.landManaAbilities(c).length,gained:c&&c.gained&&c.gained.length,gy:__d.state.graveyard.map(x=>x.name),sources:__d.manaSources().length,pend:__d.state.pendingTriggers.map(t=>t.kind)})}).then(x=>console.log(l,x));
await pump();await info('after I');
await p.evaluate(()=>{const c=__d.state.battlefield.find(x=>x.id===window.__u);__d.sagaAdvance(c);__d.flushTriggers()});await pump();await info('after II');
await p.evaluate(()=>{const c=__d.state.battlefield.find(x=>x.id===window.__u);__d.sagaAdvance(c);__d.flushTriggers()});await pump();await info('III queued');
console.log(await p.evaluate(()=>[...document.querySelectorAll('.modal')].map(m=>m.innerText.slice(0,100).replace(/\n+/g,' | '))));
await b.close()})();
