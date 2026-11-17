const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
await p.locator('button:has-text("⚙")').first().click();await p.click('#btnSettings');await p.click('.settabbtn[data-k=snd]');await p.waitForTimeout(300);
const vis=()=>p.evaluate(()=>{const d=document.querySelector('.drums-opt');return d&&!d.hidden&&d.offsetParent!==null});
console.log('ambient drums visible:',await vis());
await p.locator('.setmain select').first().selectOption('lofi');await p.waitForTimeout(300);console.log('lofi drums visible:',await vis());
console.log('doubling tokens:',await p.evaluate(()=>JSON.stringify(__d.tokenDefsFromText("If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.",'x'))));
await b.close()})();
