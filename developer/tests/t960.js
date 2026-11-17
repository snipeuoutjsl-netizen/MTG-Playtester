const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
console.log(await p.evaluate(()=>{const s=__d.state;s.battlefield=[];s.graveyard=[];
 const d=__d.tokenDefsFromText("Create a 0/0 colorless Construct artifact creature token with \"This creature gets +1/+1 for each artifact you control.\"","Urza's Saga")[0];
 __d.makeTokensFromDef(d,1,"Urza's Saga");
 return JSON.stringify({bf:s.battlefield.map(c=>c.name+' '+__d.ptText(c)),gy:s.graveyard.map(c=>c.name),tx:d.tx,types:d.types})}));
await b.close()})();
