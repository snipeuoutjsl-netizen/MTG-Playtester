const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
await p.evaluate(()=>{const s=__d.state;s.step=__d.STEPS.findIndex(x=>x.id==='main1');s.stack=[];s.battlefield=[];s.landsPlayed=0;s.landPlayedThisTurn=false;
 const i=s.library.findIndex(x=>/^Sink into Stupor/.test(x.name));const [c]=s.library.splice(i,1);s.hand.push(c);window.__id=c.id;__d.render()});
console.log(await p.evaluate(()=>{const c=__d.state.hand.find(x=>x.id===window.__id);const i=__d.cardInfo(c.name);return JSON.stringify({name:c.name,isLand:__d.isLandName(c.name),mdfc:i.mdfc,fc:i.fc&&i.fc.map(f=>({n:f.name,land:f.land,tx:f.tx,mc:f.mc,t:f.t})),mdfcLand:!!__d.mdfcLandFace(c)})}));
await p.evaluate(()=>__d.playLand(window.__id,1));await p.waitForTimeout(500);
console.log('after play',await p.evaluate(()=>{const c=__d.state.battlefield.find(x=>x.id===window.__id);return JSON.stringify({bf:c&&c.name,tapped:c&&c.tapped,face:c&&c.face,faceOf:c&&c.faceOf,isLand:c&&__d.isLandName(c.name),mana:c&&__d.landManaAbilities?__d.landManaAbilities(c):'n/a',modals:[...document.querySelectorAll('.modal')].map(m=>m.innerText.replace(/\n+/g,' | ').slice(0,300))})}));
await b.close()})();
