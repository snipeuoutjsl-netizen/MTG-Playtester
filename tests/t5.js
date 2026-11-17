const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
await p.locator('button:has-text("⚙")').first().click();await p.click('#btnSettings');await p.click('.settabbtn[data-k=gfx]');await p.waitForTimeout(300);
await p.locator('button:has-text("Apply Pixel cosmos set")').click();await p.waitForTimeout(600);
console.log(await p.evaluate(()=>({t:document.body.dataset.uitheme,s:__d.settings.sleevePreset,m:__d.settings.matPreset})));
await p.click('.modal footer >> text=Close');await p.waitForTimeout(400);await p.screenshot({path:'/tmp/pixgame.png'});await b.close()})();
