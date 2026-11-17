const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
const r=await p.evaluate(()=>{const out=[];for(const [k,c] of __d.CARDS){ if(!c.tx) continue; for(const mode of ['plain','targets']){ let o; try{ o=__d.effectOptions(c.tx,{sourceName:c.name,name:c.name,targets: mode==='targets'?[{kind:'player',id:'you',name:'You',spec:0},{kind:'player',id:'opp',name:'Opponent',spec:1}]:[]}) }catch(e){out.push(c.name+' ERR '+e.message);continue}
 const labels=o.map(x=>x.label||x.summary||x.special).filter(Boolean); const seen={};for(const l of labels){seen[l]=(seen[l]||0)+1}
 for(const [l,n] of Object.entries(seen)) if(n>1) out.push(c.name+' ['+mode+'] x'+n+': '+l);
 // same verb twice (draw)
 const draws=labels.filter(l=>/\bdraw\b/i.test(l)); if(draws.length>1) out.push(c.name+' ['+mode+'] draw options: '+draws.join(' || '));}} return out});
console.log(r.length?r.join('\n'):'no duplicates');
await b.close()})();
