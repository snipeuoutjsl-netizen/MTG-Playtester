const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
await p.evaluate(()=>{const s=__d.state;s.step=__d.STEPS.findIndex(x=>x.id==='main1');s.stack=[];s.battlefield=[];
 const mk=(n,z)=>{const i=s.library.findIndex(x=>x.name===n);const [c]=s.library.splice(i,1);s[z].push(c);return c};
 for(const n of ['Island','Island','Island'])mk(n,'battlefield');
 const i=s.library.findIndex(x=>/^Sink into Stupor/.test(x.name));const [c]=s.library.splice(i,1);s.hand.push(c);window.__id=c.id;__d.render()});
const dump=()=>p.evaluate(()=>JSON.stringify({m:[...document.querySelectorAll('.modal')].map(m=>m.innerText.replace(/\n+/g,' | ').slice(0,400)),stack:__d.state.stack.map(c=>c.name),gy:__d.state.graveyard.map(c=>c.name),log:(document.querySelector('#log')||{}).innerText&&document.querySelector('#log').innerText.slice(-250),hand:__d.state.hand.filter(c=>c.id===window.__id).map(c=>c.name)}));
console.log(await p.evaluate(()=>{const c=__d.state.hand.find(x=>x.id===window.__id);return JSON.stringify({why:__d.handWhy&&__d.handWhy(c),cn:__d.canCastNow(c),routes:__d.castRoutes&&__d.castRoutes(c),toast:(document.querySelector('.toast')||{}).innerText})}));await p.evaluate(()=>__d.castSpell(window.__id));await p.waitForTimeout(500);console.log('1',await dump(),await p.evaluate(()=>[...document.querySelectorAll('.toast, #toasts *')].map(e=>e.innerText).join('|')));
console.log(await p.evaluate(()=>document.body.innerText.match(/No legal target[^\n]*\n?[^\n]*/)));await p.locator('.modal .tg-row button').first().click();await p.waitForTimeout(200);
await p.locator('.modal button:has-text("Confirm targets")').click();await p.waitForTimeout(500);
for(let i=0;i<3;i++){const x=p.locator('.modal button:has-text("Pay"), .modal button:has-text("Confirm"), .modal button:has-text("Put on the stack")');if(await x.count()){await x.first().click();await p.waitForTimeout(400)}}
console.log('stack',await p.evaluate(()=>__d.state.stack.map(c=>c.name)));
await p.evaluate(()=>{if(__d.state.stack.length)__d.resolveTopOfStack()});await p.waitForTimeout(500);
console.log(await dump());
await b.close()})();
