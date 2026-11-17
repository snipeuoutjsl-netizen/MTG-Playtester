const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
const pump=async()=>{for(let i=0;i<6;i++){await p.waitForTimeout(250);let did=false;for(const t of ['Pay','Confirm','Put on the stack','Done']){const x=p.locator('.modal button:has-text("'+t+'")');if(await x.count()){await x.first().click().catch(()=>{});did=true;break}}
 if(!did)break}};
const setupBF=names=>p.evaluate(ns=>{const s=__d.state;s.library.push(...s.battlefield.splice(0),...s.hand.splice(0),...s.graveyard.splice(0));s.stack=[];s.step=__d.STEPS.findIndex(x=>x.id==='main1');s.life=20;s.manaPool={W:0,U:0,B:0,R:0,G:0,C:0};
 const mk=(n,z)=>{const i=s.library.findIndex(x=>x.name===n);const [c]=s.library.splice(i,1);s[z].push(c);return c};
 for(const n of ns.bf||[])mk(n,'battlefield').sick=false;for(const n of ns.hand||[])mk(n,'hand');window.__hand=s.hand.map(c=>c.id);__d.render()},names);
const info=l=>p.evaluate(()=>JSON.stringify({life:__d.state.life,pool:__d.state.manaPool,bf:__d.state.battlefield.map(c=>c.name+(c.tapped?'(T)':'')),stack:__d.state.stack.map(c=>c.name),m:[...document.querySelectorAll('.modal')].map(m=>m.innerText.replace(/\n+/g,' | ').slice(0,260))})).then(x=>console.log(l,x));
// 1. Ancient Tomb pays {1} for Sol Ring
await setupBF({bf:['Ancient Tomb'],hand:['Sol Ring']});
await p.evaluate(()=>__d.castSpell(window.__hand[0]));await p.waitForTimeout(500);await info('1 cast');await pump();await info('1 paid');
// 2. Tomb pays blue? Mana Drain {U}{U} with Tomb+Islands: should refuse Tomb for U
await setupBF({bf:['Ancient Tomb'],hand:['Mana Drain']});
console.log('2 Drain with only Tomb routes:',await p.evaluate(()=>JSON.stringify(__d.castRoutes(__d.state.hand[0]).map(r=>[r.label,r.ok,r.why]))));
// 3. Workshop restriction
await setupBF({bf:["Mishra's Workshop"],hand:['Grim Monolith','Mana Drain']});
console.log('3 Workshop routes:',await p.evaluate(()=>JSON.stringify(__d.state.hand.map(c=>[c.name,__d.castRoutes(c).map(r=>[r.ok,r.why])]))));
// 4. Tolarian Academy count
await setupBF({bf:['Tolarian Academy','Sol Ring','Lotus Petal','Mox Opal']});
console.log('4 Academy mana:',await p.evaluate(()=>JSON.stringify(__d.landManaAbilities(__d.state.battlefield[0]))));
await p.evaluate(()=>__d.tapForMana(__d.state.battlefield[0].id));await p.waitForTimeout(300);await info('4 tapped Academy');
// 5. Mox Opal with <3 artifacts
await setupBF({bf:['Mox Opal'],hand:[]});
await p.evaluate(()=>__d.tapForMana(__d.state.battlefield[0].id));await p.waitForTimeout(300);await info('5 Opal alone (metalcraft off)');
await setupBF({bf:['Mox Opal','Sol Ring','Lotus Petal'],hand:[]});
await p.evaluate(()=>__d.tapForMana(__d.state.battlefield[0].id));await p.waitForTimeout(300);await info('5b Opal with 3 artifacts');
// 6. Chrome Mox imprint
await setupBF({bf:[],hand:['Chrome Mox','Mana Drain']});
await p.evaluate(()=>{const c=__d.state.hand.find(x=>x.name==='Chrome Mox');__d.castSpell(c.id)});await p.waitForTimeout(400);await pump();
await p.evaluate(()=>{if(__d.state.stack.length)__d.resolveTopOfStack()});await p.waitForTimeout(500);await info('6 Chrome Mox in');
await setupBF({bf:["Mishra's Workshop"]});console.log('W abil',await p.evaluate(()=>JSON.stringify(__d.landManaAbilities(__d.state.battlefield[0]))));
await b.close()})();
