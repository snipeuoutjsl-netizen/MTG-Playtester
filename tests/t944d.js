const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
await p.evaluate(()=>{const s=__d.state;s.step=__d.STEPS.findIndex(x=>x.id==='main1'||x.id==='main');s.stack=[];s.battlefield=[];s.pendingTriggers=[];
 const mk=(n,z)=>{const i=s.library.findIndex(x=>x.name===n);const [c]=s.library.splice(i,1);s[z].push(c);return c};
 mk('Cabal Therapist','battlefield');mk('Grizzly Bears','battlefield');mk('Memnite','hand');mk('Psychic Frog','hand');mk('Mana Crypt','hand');__d.render()});
const dump=async l=>console.log(l,await p.evaluate(()=>JSON.stringify({bf:__d.state.battlefield.map(c=>c.name),gy:__d.state.graveyard.map(c=>c.name),hand:__d.state.hand.length,stack:__d.state.stack.map(c=>c.name+':'+(c.effect||'').slice(0,40)),modals:[...document.querySelectorAll('.modal')].map(m=>m.innerText.slice(0,260))})));
await p.evaluate(()=>{const c=__d.state.battlefield.find(x=>x.name==='Cabal Therapist');__d.activateAbility(c.id,true,0)});await p.waitForTimeout(500);await dump('A');
const clickM=async t=>{await p.locator('.modal button:has-text("'+t+'")').first().click();await p.waitForTimeout(500)};
await clickM('Choose');await dump('B target you');
for(const t of ['Confirm','Pay','Activate','OK']){ if(await p.locator('.modal button:has-text("'+t+'")').count()){await clickM(t);await dump('C '+t);} }
await p.locator('.modal .row:has-text("Grizzly Bears")').click();await p.waitForTimeout(200);await clickM('Confirm');await dump('D after sac');
for(let i=0;i<3;i++){ if(await p.evaluate(()=>__d.state.stack.length)){await p.evaluate(()=>__d.resolveTopOfStack());await p.waitForTimeout(500);await dump('E resolve '+i);} }
console.log(await p.evaluate(()=>[...document.querySelectorAll('.modal')].map(m=>m.innerText).join('\n==\n')));
if(await p.locator('.modal button:has-text("Apply")').count()){await clickM('Apply');await dump('F applied');}
await p.waitForTimeout(500);
console.log(await p.evaluate(()=>({hp:typeof __d.handPick!=='undefined'?!!__d.handPick:'n/a',stage:(document.querySelector('#stackStage')||{}).innerText,bar:(document.querySelector('#handPickBar')||{}).innerText,body:document.body.className,pickEls:[...document.querySelectorAll('.ss-pick,.ss-row,[id*=ick]')].map(e=>e.id||e.className).slice(0,10)})));
const hh=await p.evaluate(()=>__d.state.hand.map(c=>c.name));console.log('hand',hh.join(','));
await p.evaluate(()=>{const c=__d.state.hand.find(x=>!__d.isLandName(x.name));window.__tid=c.id;window.__tn=c.name});
console.log('target',await p.evaluate(()=>window.__tn));
await p.evaluate(()=>{const e=[...document.querySelectorAll('#handWrap .card, #handWrap [data-id], #handWrap .cardwrap')];window.__hn=e.length;const t=document.querySelector('#handWrap [data-id="'+window.__tid+'"]');t&&t.click()});console.log('handEls',await p.evaluate(()=>window.__hn));
await p.waitForTimeout(300);
console.log(await p.evaluate(()=>(document.querySelector('.ss-pick')||{}).innerText));
await p.locator('#stackStage .ss-btns button.primary').click().catch(e=>console.log('btnerr',e.message.slice(0,100)));await p.waitForTimeout(500);
console.log(await p.evaluate(()=>JSON.stringify({gy:__d.state.graveyard.map(c=>c.name),hand:__d.state.hand.length,stack:__d.state.stack.length,body:/picking-hand/.test(document.body.className)})));
await b.close()})();
