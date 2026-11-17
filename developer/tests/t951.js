const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
console.log(await p.evaluate(()=>{const s=__d.state;s.battlefield=[];
 const d=__d.tokenDefsFromText("Create a 0/0 colorless Construct artifact creature token with \"This creature gets +1/+1 for each artifact you control.\"","Urza's Saga")[0];
 const c=__d.newCard(d.name,{token:true,tk:{pt:d.pt,subs:d.subs,col:d.col,tx:d.tx,types:d.types,type:d.type}});c.id=s.nextId++;s.battlefield.push(c);
 const out={tx:d.tx,pz:__d.permZone?__d.permZone(c):'',statics:__d.statics().map(e=>e.line+'|'+e.kind),pt:__d.ptText(c)};return JSON.stringify(out)}));
await b.close()})();
