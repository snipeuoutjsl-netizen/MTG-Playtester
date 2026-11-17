const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
const open=async()=>{await p.locator('button:has-text("⚙")').first().click();await p.click('#btnSettings');await p.click('.settabbtn[data-k=gfx]');await p.waitForTimeout(300)};
await open();const cb=p.locator('.setrow:has-text("One-click set") input[type=checkbox]');await cb.check();await p.waitForTimeout(300);
await p.click('.modal footer >> text=Close');await p.waitForTimeout(400);
await open();console.log('checked after reopen',await p.locator('.setrow:has-text("One-click set") input[type=checkbox]').isChecked(),await p.evaluate(()=>({style:__d.settings.sound.musicStyle,live:__d.music&&__d.music.style})));
await b.close()})();
