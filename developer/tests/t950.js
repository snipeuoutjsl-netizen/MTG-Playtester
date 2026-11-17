const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
console.log(await p.evaluate(()=>{const i=__d.cardInfo("Urza's Saga");return JSON.stringify({tx:i.tx,t:i.t,land:i.land,defs:__d.tokenDefsFromText(i.tx,"Urza's Saga")})}));
await p.evaluate(()=>{const s=__d.state;s.battlefield=[];s.stack=[];s.step=__d.STEPS.findIndex(x=>x.id==='main1');const i=s.library.findIndex(x=>x.name==="Urza's Saga");const [c]=s.library.splice(i,1);s.hand.push(c);window.__u=c.id;__d.render()});
await p.evaluate(()=>__d.playLand(window.__u));await p.waitForTimeout(500);
const st=l=>p.evaluate(()=>{const c=__d.state.battlefield.find(x=>x.id===window.__u);return JSON.stringify({bf:__d.state.battlefield.map(x=>x.name+(x.token?'(tok '+__d.ptText(x)+')':'')),ctr:c&&c.counters,gained:c&&c.gained,ab:c&&__d.activatedAbilitiesFor(c).map(a=>a.cost+': '+a.effect.slice(0,60)),modals:[...document.querySelectorAll('.modal')].map(m=>m.innerText.replace(/\n+/g,' | ').slice(0,260)),pend:__d.state.pendingTriggers.length})}).then(x=>console.log(l,x));
await st('played');
const pump=async()=>{for(let i=0;i<8;i++){await p.waitForTimeout(250);
  let did=false;
  for(const t of ['Put on the stack','Apply','Done','Finish','Resolve ability']){const x=p.locator('.modal button:has-text("'+t+'")');if(await x.count()){await x.first().click().catch(()=>{});did=true;break}}
  if(!did&&await p.evaluate(()=>__d.state.stack.length)){await p.evaluate(()=>__d.resolveTopOfStack());did=true}
  if(!did)break}};
await pump();await st('after chapter I');
// advance to chapter II
await p.evaluate(()=>{const c=__d.state.battlefield.find(x=>x.id===window.__u);__d.sagaAdvance?__d.sagaAdvance(c):0;__d.flushTriggers()});await pump();await st('after chapter II');
// add artifacts to be realistic? no: just activate token ability
await p.evaluate(()=>{const s=__d.state;for(const n of ['Island','Island']){const i=s.library.findIndex(x=>x.name===n);const [c]=s.library.splice(i,1);s.battlefield.push(c)}__d.render()});
await p.evaluate(()=>{const c=__d.state.battlefield.find(x=>x.id===window.__u);const a=__d.activatedAbilitiesFor(c);window.__ab=a.findIndex(x=>/Create/.test(x.effect));__d.activateAbility(c.id,true,window.__ab)});await p.waitForTimeout(500);
for(const t of ['Pay','Confirm']){const x=p.locator('.modal button:has-text("'+t+'")');if(await x.count()){await x.first().click();await p.waitForTimeout(400)}}
await st('activated');console.log('toast:',await p.evaluate(()=>[...document.querySelectorAll('.toast,.toasts *,#toasts *')].map(e=>e.innerText).join(' | ').slice(0,400)),'stack',await p.evaluate(()=>__d.state.stack.map(x=>x.name)),'saga tapped',await p.evaluate(()=>__d.state.battlefield[0].tapped));
await p.evaluate(()=>__d.resolveTopOfStack());await p.waitForTimeout(500);await st('resolving');console.log(await p.evaluate(()=>[...document.querySelectorAll('.modal')].map(m=>m.innerText.replace(/\n+/g,' | '))));
await p.evaluate(()=>{const c=__d.state.battlefield.find(x=>x.id===window.__u);__d.sagaAdvance(c);__d.flushTriggers()});await p.waitForTimeout(500);
console.log('III',await p.evaluate(()=>JSON.stringify({m:[...document.querySelectorAll('.modal')].map(m=>m.innerText.replace(/\n+/g,' | ').slice(0,420)),stack:__d.state.stack.map(x=>x.name)})));
await p.locator('.modal button:has-text("Put on the stack")').click();await p.waitForTimeout(300);
await p.evaluate(()=>__d.resolveTopOfStack());await p.waitForTimeout(600);
console.log('III resolving',await p.evaluate(()=>JSON.stringify({m:[...document.querySelectorAll('.modal')].map(m=>m.innerText.replace(/\n+/g,' | ').slice(0,500))})));
const ap=p.locator('.modal button:has-text("Apply")');if(await ap.count()){await ap.first().click();await p.waitForTimeout(600);console.log('after apply',await p.evaluate(()=>JSON.stringify({m:[...document.querySelectorAll('.modal')].map(m=>m.innerText.replace(/\n+/g,' | ').slice(0,500)),bf:__d.state.battlefield.map(x=>x.name)})));}
await p.evaluate(()=>{document.querySelectorAll('.modal').forEach(m=>{const bt=[...m.querySelectorAll('button')].find(x=>/^(Close|Cancel|✕)$/.test(x.innerText.trim()));bt&&bt.click()})});await p.waitForTimeout(300);
for(let i=0;i<3;i++){const x=p.locator('.modal button:has-text("Done"), .modal button:has-text("Finish")');if(await x.count()){await x.first().click().catch(()=>{});await p.waitForTimeout(400)}}
await p.evaluate(()=>{if(__d.state.stack.length)__d.resolveTopOfStack()});await p.waitForTimeout(500);
console.log('END',await p.evaluate(()=>JSON.stringify({bf:__d.state.battlefield.map(x=>x.name+(x.token?'('+__d.ptText(x)+')':'')),gy:__d.state.graveyard.map(x=>x.name),stack:__d.state.stack.map(x=>x.name),m:[...document.querySelectorAll('.modal')].map(m=>m.innerText.slice(0,60))})));
await b.close();return;
console.log(await p.evaluate(()=>__d.state.log?__d.state.log.slice(-8).map(x=>x.t||x.msg||x):document.querySelector('#log').innerText.slice(-600)));await b.close()})();
