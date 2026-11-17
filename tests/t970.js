const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
await p.evaluate(()=>{const s=__d.state;s.battlefield=[];s.stack=[];const c=Object.assign(__d.newCard('Tezzeret, Cruel Captain'),{id:s.nextId++});c.loyalty=4;s.battlefield.push(c);s.step=__d.STEPS.findIndex(x=>x.id==='main1');__d.render();__d.activatePW(c,__d.pwAbilities(c)[1],0);__d.resolveTopOfStack()});
await p.waitForTimeout(600);await p.locator('.modal .prelist button').first().click();await p.waitForTimeout(500);
console.log(await p.evaluate(()=>[...document.querySelectorAll('.modal')].map(m=>m.innerText.slice(0,200).replace(/\n+/g,' | '))+'\n'+[...document.querySelectorAll('.modal .frow')].map(r=>r.className.replace('frow ','')+':'+r.innerText.replace(/\n+/g,' ')).join('\n')));
await b.close()})();
