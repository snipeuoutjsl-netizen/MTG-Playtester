const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
await p.evaluate(()=>{const s=__d.state;s.step=3;s.stack=[];s.battlefield=[];const mk=(n,z)=>{const i=s.library.findIndex(x=>x.name===n);const [c]=s.library.splice(i,1);s[z].push(c);return c};mk('Cabal Therapist','battlefield');mk('Grizzly Bears','battlefield');__d.render()});
const info=await p.evaluate(()=>{const c=__d.state.battlefield.find(x=>x.name==='Cabal Therapist');return JSON.stringify(__d.activatedAbilitiesFor(c))});
console.log(info);
await p.evaluate(()=>{const c=__d.state.battlefield.find(x=>x.name==='Cabal Therapist');const a=__d.activatedAbilitiesFor(c);__d.activateAbility(c.id,true,0)});
await p.waitForTimeout(800);
console.log(await p.evaluate(()=>[...document.querySelectorAll('.modal')].map(m=>m.innerText.slice(0,400))));
await p.locator('.modal button:has-text("Choose")').nth(0).click();await p.waitForTimeout(300);
await p.locator('.modal button:has-text("Confirm targets")').click();await p.waitForTimeout(800);
console.log('A',await p.evaluate(()=>[...document.querySelectorAll('.modal')].map(m=>m.innerText.slice(0,500))));
await p.locator('.modal :text("Grizzly Bears")').first().click();await p.waitForTimeout(200);
await p.locator('.modal button:has-text("Confirm")').click();await p.waitForTimeout(900);
console.log('B',await p.evaluate(()=>JSON.stringify({m:[...document.querySelectorAll('.modal')].map(m=>m.innerText.slice(0,300)),stack:__d.state.stack.map(c=>c.name)})));
await p.evaluate(()=>{const st=__d.state;for(const n of ['Mountain','Griselbrand']){}});
const rb=p.locator('#stackStage button:has-text("Resolve")');if(await rb.count()){await rb.first().click();await p.waitForTimeout(900);}
console.log('C',await p.evaluate(()=>JSON.stringify({m:[...document.querySelectorAll('.modal')].map(m=>m.innerText.slice(0,700)),stack:__d.state.stack.map(c=>c.name),gy:__d.state.graveyard.map(c=>c.name)})));
const ap=p.locator('.modal button:has-text("Apply")');if(await ap.count()){await ap.first().click();await p.waitForTimeout(600);}
console.log('D',await p.evaluate(()=>JSON.stringify({bar:!!document.querySelector('#handPickBar:not([hidden])')||document.body.classList.contains('picking-hand'),disc:__d.state.discarding,hand:__d.state.hand.map(c=>c.name)})));
await p.screenshot({path:'/tmp/ct.png'});await b.close()})();
