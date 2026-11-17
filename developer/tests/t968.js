const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
console.log(await p.evaluate(()=>{const tx=__d.cardInfo("Tezzeret, Cruel Captain").tx;const o={};o.tx=tx;o.trig=__d.parseTriggers(__d.cardInfo("Tezzeret, Cruel Captain")).map(t=>t.event+'|'+t.effect);
 for(const e of ["Untap target artifact or creature. If it's an artifact creature, put a +1/+1 counter on it.","Search your library for an artifact card with mana value 1 or less, reveal it, put it into your hand, then shuffle.",'You get an emblem with "At the beginning of combat on your turn, put three +1/+1 counters on target artifact you control. If it\'s not a creature, it becomes a 0/0 Robot artifact creature."'])
  o[e.slice(0,20)]=__d.effectOptions(e,{sourceName:'Tezzeret, Cruel Captain',sourceId:1}).filter(x=>!x.hidden).map(x=>(x.full?'[full] ':'')+x.label);
 return JSON.stringify(o,null,1)}));
await b.close()})();
