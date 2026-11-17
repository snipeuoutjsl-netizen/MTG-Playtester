const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
await p.evaluate(()=>{const s=__d.state;s.battlefield=[];s.stack=[];const c=Object.assign(__d.newCard('Tezzeret, Cruel Captain'),{id:s.nextId++});c.loyalty=4;s.battlefield.push(c);const a=Object.assign(__d.newCard('Memnite'),{id:s.nextId++});a.tapped=true;s.battlefield.push(a);s.step=__d.STEPS.findIndex(x=>x.id==='main1');window.__c=c;__d.render();__d.activatePW(c,__d.pwAbilities(c)[0],0);__d.resolveTopOfStack()});
await p.waitForTimeout(600);await p.evaluate(()=>{const o=__d.effectOptions;window.__log=[];});console.log(await p.evaluate(()=>JSON.stringify(__d.parseTargetSpecs('Untap target artifact or creature. If it\'s an artifact creature, put a +1/+1 counter on it.').map(x=>({kind:x.kind,types:x.types,label:x.label})))));
await p.locator('.modal .tg-row button').first().click();await p.locator('.modal button:has-text("Confirm targets")').first().click();await p.waitForTimeout(500);
console.log(await p.evaluate(()=>JSON.stringify({bf:__d.state.battlefield.map(c=>c.name+' t='+c.tapped+' '+JSON.stringify(c.counters)),log:__d.state.log.slice(-4),stack:__d.state.stack.length,modals:[...document.querySelectorAll('.modal')].map(m=>m.className+' :: '+m.innerText.slice(0,200).replace(/\n+/g,' | '))})));
await b.close()})();
