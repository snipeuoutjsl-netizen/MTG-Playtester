const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
await p.evaluate(()=>{const s=__d.state;s.battlefield=[];s.stack=[];s.graveyard=[];s.step=__d.STEPS.findIndex(x=>x.id==='main1');const i=s.library.findIndex(x=>x.name==="Urza's Saga");const [c]=s.library.splice(i,1);c.counters={lore:2};c.gained=['{2}, {T}: Create a 0/0 colorless Construct artifact creature token with "This creature gets +1/+1 for each artifact you control."'];c.sick=false;s.battlefield.push(c);window.__u=c.id;__d.render()});
console.log(await p.evaluate(()=>JSON.stringify(__d.activatedAbilitiesFor(__d.state.battlefield[0]).map(a=>a.cost+' => '+a.effect))));
await p.evaluate(()=>{const s=__d.state;const l=s.library.filter(x=>__d.isLandName(x.name)).slice(0,2);for(const c of l){s.library.splice(s.library.indexOf(c),1);s.battlefield.push(c)};__d.activateAbility(window.__u,true,0)});
for(let i=0;i<12;i++){await p.waitForTimeout(250);for(const t of ['Put on the stack','Done','Finish','Pay','OK']){const x=p.locator('.modal button:has-text("'+t+'")');if(await x.count()){await x.first().click().catch(()=>{});break}}
 if(await p.evaluate(()=>__d.state.stack.length&&!document.querySelector('.modal')))await p.evaluate(()=>__d.resolveTopOfStack())}
console.log(await p.evaluate(()=>JSON.stringify({bf:__d.state.battlefield.map(c=>c.name+(c.token?' '+__d.ptText(c)+' '+JSON.stringify(c.tk&&c.tk.tx):'')),gy:__d.state.graveyard.map(c=>c.name),stack:__d.state.stack.length,log:__d.state.log.slice(-6).map(x=>x.msg||x)})));
console.log(await p.evaluate(()=>[...document.querySelectorAll('.modal')].map(m=>m.innerText.slice(0,200).replace(/\n+/g,' | '))));
await b.close()})();
