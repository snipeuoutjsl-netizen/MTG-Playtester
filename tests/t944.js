const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
console.log(await p.evaluate(()=>{const s=__d.state;s.stack=[];s.battlefield=[];s.pendingTriggers=[];
 const mk=(n,z)=>{const i=s.library.findIndex(x=>x.name===n);const [c]=s.library.splice(i,1);s[z].push(c);return c};
 const v=mk('Vengevine','graveyard');const spells=['Memnite','Mock Scry Gain','Psychic Frog','Merfolk Looter'].map(n=>mk(n,'hand'));
 const out=[];
 for(const c of spells){__d.noteCast(c);s.pendingTriggers=[];__d.fireTrigger('cast',{card:c});out.push(c.name+' => '+s.pendingTriggers.map(t=>t.cardName+': '+t.effect).join(';'))}
 return out.join('\n')}));
await b.close()})();
