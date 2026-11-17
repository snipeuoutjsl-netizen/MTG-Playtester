const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
await p.evaluate(()=>{const s=__d.state;s.step=3;__d.pickFromHand({n:1,title:'Faithless Looting',verb:'discard',note:'This is part of the cost.',choose:true,cancel:true,done:()=>{}})});
await p.waitForTimeout(400);
console.log(await p.evaluate(()=>document.querySelector('#stackStage').innerText.replace(/\n/g,' | ')));
await p.click('#stackStage button:has-text("Cancel")');await p.waitForTimeout(300);
console.log('after cancel',await p.evaluate(()=>({hidden:document.querySelector('#stackStage').hidden,disc:__d.state.discarding})));
await p.screenshot({path:'/tmp/d3.png'});await b.close()})();
