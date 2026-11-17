const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
console.log(await p.evaluate(()=>{const s=__d.state;const out=[__d.STEPS.map(x=>x.id).join(',')];s.stack=[];s.battlefield=[];
 const mk=(n,z)=>{const i=s.library.findIndex(x=>x.name===n);const [c]=s.library.splice(i,1);s[z].push(c);return c};
 const c=mk('Cabal Therapist','battlefield');mk('Grizzly Bears','battlefield');
 for(let i=0;i<__d.STEPS.length;i++){s.step=i;out.push(__d.STEPS[i].id+': '+JSON.stringify(__d.activatedAbilitiesFor(c).map(a=>a.why||a.disabled||a.cost)))}
 return out.join('\n')}));
await b.close()})();
