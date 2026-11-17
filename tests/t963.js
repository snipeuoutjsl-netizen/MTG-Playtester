const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
console.log(await p.evaluate(()=>{const i=__d.cardInfo("Urza's Saga");return JSON.stringify({tx:i.tx,defs:__d.tokenDefsFromText(i.tx,"Urza's Saga"),tray:1})}));
await b.close()})();
