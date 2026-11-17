const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
// Narcomoeba: mill it
await p.evaluate(()=>{const s=__d.state;const i=s.library.findIndex(c=>c.name==='Narcomoeba');const [c]=s.library.splice(i,1);s.library.unshift(c);__d.render();});
await p.evaluate(()=>{__d.millCards(1)});await p.waitForTimeout(800);
console.log('A',await p.evaluate(()=>JSON.stringify({gy:__d.state.graveyard.map(c=>c.name),bf:__d.state.battlefield.map(c=>c.name),pend:__d.state.pendingTriggers.length,modals:[...document.querySelectorAll('.modal')].map(m=>m.innerText.slice(0,400))})));
await p.locator('.modal button:has-text("Put on the stack")').click();await p.waitForTimeout(600);
const rb=p.locator('#stackStage button:has-text("Resolve")');if(await rb.count()){await rb.first().click();await p.waitForTimeout(800);}
console.log('B',await p.evaluate(()=>JSON.stringify({stack:__d.state.stack.map(c=>c.name),modals:[...document.querySelectorAll('.modal')].map(m=>m.innerText.slice(0,500))})));
const ap=p.locator('.modal button:has-text("Apply")');if(await ap.count()){await ap.first().click();await p.waitForTimeout(600);}
console.log('C',await p.evaluate(()=>JSON.stringify({gy:__d.state.graveyard.map(c=>c.name),bf:__d.state.battlefield.map(c=>c.name),modals:[...document.querySelectorAll('.modal')].map(m=>m.innerText.slice(0,300))})));
await b.close()})();
