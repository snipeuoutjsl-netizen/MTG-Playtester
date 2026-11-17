const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
await p.evaluate(()=>{const s=__d.state;s.library.push(...s.battlefield.splice(0),...s.hand.splice(0));
 const mk=(n,z)=>{const i=s.library.findIndex(x=>x.name===n);const [c]=s.library.splice(i,1);s[z].push(c);return c};
 mk("Mishra's Workshop",'battlefield').sick=false;mk('Grim Monolith','hand');});
console.log(await p.evaluate(()=>{const c=__d.state.hand[0];const i=__d.cardInfo(c.name);
 return JSON.stringify({t:i.t,mc:i.mc,src:__d.withCtx?__d.withCtx(c,__d.manaSources).length:'nowithCtx',spend:__d.spendOnlyOk?__d.spendOnlyOk('cast artifact spells',c):'x',routes:__d.castRoutes(c).map(r=>[r.mana,r.ok,r.why])})}));
await b.close()})();
