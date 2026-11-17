const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
const rep=await p.evaluate(()=>__d.deckScanReportText());
const want=["Ancient Tomb","Mishra's Workshop","Tolarian Academy","Sol Ring","Chrome Mox","Lotus Petal","Grim Monolith","Mox Opal","Mox Diamond","Mana Drain","Black Lotus","Mana Crypt","Mana Vault"];
const lines=rep.split('\n');let out=[];let cur=null;
for(const l of lines){ if(want.some(w=>l.startsWith(w)||l.includes('== '+w))) cur=l; }
console.log(rep.slice(0,200));
for(const w of want){const i=rep.indexOf(w);if(i>=0)console.log('---',rep.slice(i,i+520).split('\n\n')[0]);}
await b.close()})();
