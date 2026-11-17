const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
const ev=f=>p.evaluate(f);
await ev(()=>{const s=__d.state;s.step=3;s.stack=[];s.battlefield=[];s.hand=[];const mv=(n,z)=>{const i=s.library.findIndex(c=>c.name===n);const [c]=s.library.splice(i,1);s[z].push(c);return c.id};for(let i=0;i<3;i++)mv('Swamp','battlefield');window.__id=mv('Timeline Culler','hand');__d.render()});
console.log('routes',await ev(()=>JSON.stringify(__d.castRoutes(__d.state.hand.find(c=>c.id===window.__id)).map(r=>({l:r.label,m:r.mana,ok:r.ok,comps:r.comps.map(k=>k.k)})))));
await ev(()=>__d.castSpell(window.__id));await p.waitForTimeout(600);
console.log('modals',await ev(()=>[...document.querySelectorAll('.modal')].map(m=>m.innerText.slice(0,300))));
const clickAny=async(sel)=>{const l=p.locator(sel);if(await l.count()){await l.first().click();await p.waitForTimeout(500);return true}return false};
await clickAny('.modal :text("Warp —")');await clickAny('.modal button:has-text("Continue")');
for(const t of ['Pay and cast','Confirm','Choose']){await clickAny('.modal button:has-text("'+t+'")')}
await p.waitForTimeout(500);
console.log('stack',await ev(()=>JSON.stringify({stack:__d.state.stack.map(c=>c.name),life:__d.state.life,modals:[...document.querySelectorAll('.modal')].map(m=>m.innerText.slice(0,160))})));
for(let k=0;k<4;k++){if(!(await clickAny('#stackStage button:has-text("Resolve")')))break;await clickAny('#stackStage button:has-text("Finish")')}
console.log('bf',await ev(()=>JSON.stringify({bf:__d.state.battlefield.map(c=>c.name+':'+c.warpExile),fx:__d.state.fx.map(e=>e.text)})));
// go to end step
await ev(()=>{__d.state.step=9;});await ev(()=>__d.nextPhase());await p.waitForTimeout(600);
for(let k=0;k<3;k++){await clickAny('.modal button:has-text("Resolve")');await clickAny('.modal button:has-text("OK")')}
console.log('end',await ev(()=>JSON.stringify({step:__d.state.step,bf:__d.state.battlefield.map(c=>c.name),ex:__d.state.exile.map(c=>c.name+':'+c.warpExile),turn:__d.state.turn})));
// later turn
await ev(()=>{__d.state.turn+=1;__d.state.step=3;__d.render()});
console.log('castable',await ev(()=>JSON.stringify({w:__d.state.exile.map(c=>c.name)})));
await ev(()=>{const c=__d.state.exile[0];__d.castFromExile(c.id)});await p.waitForTimeout(600);
console.log('fromExile',await ev(()=>JSON.stringify({exile:__d.state.exile.length,hand:__d.state.hand.length,modals:[...document.querySelectorAll('.modal')].map(m=>m.innerText.slice(0,120))})));
await b.close()})();
