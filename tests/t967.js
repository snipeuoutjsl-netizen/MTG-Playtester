const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
await p.evaluate(()=>{const s=__d.state;s.battlefield=[];s.stack=[];s.pendingTriggers=[];s.step=__d.STEPS.findIndex(x=>x.id==='main1');const i=s.library.findIndex(x=>x.name==="Tezzeret, Cruel Captain");const [c]=s.library.splice(i,1);s.hand.push(c);window.__t=c.id;
 for(let k=0;k<5;k++){const j=s.library.findIndex(x=>x.name==='Island'||x.name==='Swamp');if(j<0)break;const [l]=s.library.splice(j,1);l.tapped=false;s.battlefield.push(l)}__d.render()});
await p.evaluate(()=>__d.castSpell(window.__t));
const click=async()=>{for(const t of ['Put on the stack','Pay','Done','OK','Resolve','Cast','Confirm']){const x=p.locator('.modal button:has-text("'+t+'")');if(await x.count()){await x.first().click().catch(()=>{});return t}}return ''};
for(let i=0;i<14;i++){await p.waitForTimeout(250);const t=await click();if(!t&&await p.evaluate(()=>__d.state.stack.length&&!document.querySelector('.modal')))await p.evaluate(()=>__d.resolveTopOfStack())}
console.log(await p.evaluate(()=>{const f=__d.findCard(window.__t);return JSON.stringify({zone:f&&f.zone,loy:f&&f.card.loyalty,mod:[...document.querySelectorAll('.modal')].map(m=>m.innerText.slice(0,150))})}));
await p.evaluate(()=>{__d.openLoyalty(__d.findCard(window.__t).card)});await p.waitForTimeout(300);
console.log(await p.evaluate(()=>[...document.querySelectorAll('.modal .pwrow')].map(r=>r.innerText.replace(/\n+/g,' | ')+' disabled='+r.querySelector('button').disabled)));
await p.locator('.modal .pwrow button').first().click();
for(let i=0;i<8;i++){await p.waitForTimeout(250);const t=await click();if(!t&&await p.evaluate(()=>__d.state.stack.length&&!document.querySelector('.modal')))await p.evaluate(()=>__d.resolveTopOfStack())}
console.log(await p.evaluate(()=>JSON.stringify({loy:__d.findCard(window.__t).card.loyalty,hand:__d.state.hand.length,log:__d.state.log.slice(-5).map(x=>x.msg||x),mod:[...document.querySelectorAll('.modal')].map(m=>m.innerText.slice(0,200))})));
await b.close()})();
