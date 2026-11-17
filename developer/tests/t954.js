const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
console.log(await p.evaluate(()=>{const t="Create a 1/1 colorless Thopter artifact creature token with flying.";const d=__d.tokenDefsFromText(t,'x')[0];const u=__d.tokenDefsFromText("Create a 0/0 colorless Construct artifact creature token with \"This creature gets +1/+1 for each artifact you control.\"",'y')[0];return JSON.stringify({thopter:{official:d.official,type:d.type,tx:d.tx,types:d.types},construct:{official:u.official,type:u.type,tx:u.tx},treasure:__d.officialToken('Treasure','',[],'')&&1})}));
await b.close()})();
