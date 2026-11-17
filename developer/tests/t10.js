const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
await p.evaluate(()=>{const s=__d.state;for(let i=0;i<6;i++){s.graveyard.push(s.library.shift());}for(let i=0;i<3;i++)s.exile.push(s.library.shift());__d.render()});
await p.waitForTimeout(500);
console.log(await p.evaluate(()=>['#zone-library','#zone-graveyard','#zone-exile','.pile','.slot'].flatMap(q=>[...document.querySelectorAll(q)].map(e=>{const r=e.getBoundingClientRect();return q+' '+(e.id||e.className)+' '+Math.round(r.width)+'x'+Math.round(r.height)+' ratio '+(r.width/r.height).toFixed(2)})).join('\n')));
await p.screenshot({path:'/tmp/piles.png'});await b.close()})();
