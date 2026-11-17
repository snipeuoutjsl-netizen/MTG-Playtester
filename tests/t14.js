const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
await p.evaluate(()=>{const s=__d.state;s.step=3;s.stack=[];s.battlefield=[];s.hand=[];const mv=(n,z)=>{const i=s.library.findIndex(c=>c.name===n);const [c]=s.library.splice(i,1);s[z].push(c);return c.id};for(let i=0;i<3;i++)mv('Swamp','battlefield');window.__id=mv('Timeline Culler','hand');__d.render()});
await p.evaluate(()=>__d.castSpell(window.__id));await p.waitForTimeout(600);
console.log(await p.evaluate(()=>[...document.querySelectorAll('.modal button')].map(b=>b.className+'|'+b.innerText.replace(/\n/g,' ')).join('\n')));
await p.screenshot({path:'/tmp/warp.png'});await b.close()})();
