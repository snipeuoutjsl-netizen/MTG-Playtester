const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
const D='/tmp/claude-0/-home-claude/935b9de7-136a-5eff-9567-6732905a6b60/scratchpad/ui_';
const shot=async n=>{await p.waitForTimeout(350);await p.screenshot({path:D+n+'.png'})};
const closeAll=async()=>{for(let i=0;i<4;i++){await p.keyboard.press('Escape');await p.waitForTimeout(120)}};
await p.evaluate(()=>{const s=__d.state;s.battlefield=[];s.stack=[];s.step=__d.STEPS.findIndex(x=>x.id==='main1');const mk=(n,z)=>{const i=s.library.findIndex(x=>x.name===n);const [c]=s.library.splice(i,1);s[z].push(c);return c};
 for(const n of ['Island','Island','Swamp','Mountain'])mk(n,'battlefield');for(const n of ['Grizzly Bears','Psychic Frog','Memnite'])mk(n,'battlefield').sick=false;mk('Tezzeret, Cruel Captain','battlefield');mk("Urza's Saga",'battlefield');__d.render()});
await shot('table');
await p.locator('button:has-text("⚙")').first().click();await p.waitForTimeout(300);await shot('menu');
await p.click('#btnSettings');await p.waitForTimeout(300);
for(const k of ['gfx','board','anim','snd','tutor']){await p.click('.settabbtn[data-k='+k+']').catch(()=>{});await shot('set_'+k)}
await closeAll();
await p.evaluate(()=>{try{__d.openTokenTray()}catch(e){}});await shot('tokens');await closeAll();
await p.evaluate(()=>{try{__d.openCardData()}catch(e){}});await shot('carddata');await closeAll();
await p.setViewportSize({width:1024,height:680});await shot('table_small');
await b.close()})();
