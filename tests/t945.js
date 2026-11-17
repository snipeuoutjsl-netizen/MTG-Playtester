const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
await p.evaluate(()=>{const s=__d.state;s.step=__d.STEPS.findIndex(x=>x.id==='main1');s.stack=[];s.battlefield=[];
 const mk=(n,z)=>{const i=s.library.findIndex(x=>x.name===n);const [c]=s.library.splice(i,1);s[z].push(c);return c};
 for(const n of ['Island','Island','Mountain','Mountain'])mk(n,'battlefield');
 const c=mk('Prismari Command','hand');window.__pc=c.id;__d.render()});
await p.evaluate(()=>__d.castSpell(window.__pc,true,[0,1]));await p.waitForTimeout(500);
const dump=l=>p.evaluate(()=>[...document.querySelectorAll('.modal')].map(m=>m.innerText.replace(/\n+/g,' | ').slice(0,700)));
console.log('1',await dump());
await p.locator('.modal .tg-row').nth(1).locator('button').click();await p.waitForTimeout(200);
await p.locator('.modal .tg-row:has-text("You")').last().locator('button').click();await p.waitForTimeout(200);
await p.locator('.modal button:has-text("Confirm targets")').click();await p.waitForTimeout(500);
for(let i=0;i<3;i++){const x=p.locator('.modal button:has-text("Pay"), .modal button:has-text("Confirm"), .modal button:has-text("Put on the stack")');if(await x.count()){await x.first().click();await p.waitForTimeout(400)}}
await p.evaluate(()=>{for(let i=0;i<2&&__d.state.stack.length;i++)__d.resolveTopOfStack()});await p.waitForTimeout(500);
console.log('3',await dump());
await b.close()})();
