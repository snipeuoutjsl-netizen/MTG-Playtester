const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
const id=await p.evaluate(()=>{const s=__d.state;s.battlefield=[];s.stack=[];s.hand=[];s.step=__d.STEPS.findIndex(x=>x.id==='main1');s.manaPool={W:0,U:0,B:0,R:0,G:0,C:2};
 const mk=(n,z)=>{if(!s.library.some(x=>x.name===n))s.library.push(Object.assign(__d.newCard(n),{id:s.nextId++}));const i=s.library.findIndex(x=>x.name===n);const [c]=s.library.splice(i,1);c.sick=false;s[z].push(c);return c};
 mk('Grizzly Bears','battlefield');const c=mk('Mock Bestower','hand');__d.render();__d.castSpell(c.id);return c.id});
const modals=()=>p.evaluate(()=>[...document.querySelectorAll('.modal')].map(m=>m.innerText.replace(/\n+/g,' | ').slice(0,240)));
const click=async t=>{const x=p.locator('.modal button:has-text("'+t+'")');if(await x.count()){await x.first().click();await p.waitForTimeout(350);return true}return false};
await p.waitForTimeout(400);await click('Bestow');console.log('1',await modals());
console.log(await p.evaluate(()=>document.querySelector('.modal').innerHTML.slice(0,1500)));await b.close();return;
for(const t of ['Confirm','Choose','OK','Continue','Pay','Put on the stack']){await click(t)}
for(let k=0;k<3;k++){for(const t of ['Continue','Pay','Put on the stack','Confirm'])await click(t)}
console.log('stack',await p.evaluate(()=>__d.state.stack.map(c=>c.name+':'+c.bestowed+':'+(c.targets||[]).map(t=>t.name))));
await p.evaluate(()=>{if(__d.state.stack.length)__d.resolveTopOfStack()});await p.waitForTimeout(500);
console.log(await p.evaluate(()=>JSON.stringify({bf:__d.state.battlefield.map(c=>c.name+(c.att?'>att':'')),log:__d.state.log.slice(-3)})));
await b.close()})();
