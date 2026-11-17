const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
const ev=f=>p.evaluate(f);
const info=async l=>console.log(l,await ev(()=>JSON.stringify({stage:!document.querySelector('#stackStage').hidden,txt:(document.querySelector('#stackStage')||{innerText:''}).innerText.replace(/\n/g,' | ').slice(0,260),bar:!document.querySelector('#handPickBar').hidden,disc:__d.state.discarding})));
// 1 cleanup
await ev(()=>{const s=__d.state;s.step=3;while(s.hand.length<9)s.hand.push(s.library.shift());s.step=10;__d.render()});
await ev(()=>__d.nextPhase());await p.waitForTimeout(500);await info('cleanup');
await p.screenshot({path:'/tmp/d1.png'});
// pick a card in hand and discard
for(const i of [0,1]){await p.locator('#row-hand > *:not(.nothing)').nth(i).click();await p.waitForTimeout(200);}
await p.locator('#stackStage button.primary').click();await p.waitForTimeout(400);await info('after discard');
// 2 spell effect discard (Faithless Looting)
await ev(()=>{const s=__d.state;s.step=3;s.hand=[];const mv=(n,z)=>{const i=s.library.findIndex(c=>c.name===n);if(i<0)return 0;const [c]=s.library.splice(i,1);s[z].push(c);return c.id};window.__fl=mv('Faithless Looting','hand');for(let i=0;i<4;i++)s.hand.push(s.library.shift());mv('Mountain','battlefield');__d.render()});
await ev(()=>__d.castSpell(window.__fl));await p.waitForTimeout(500);
for(const t of ['Pay and cast','Continue']){const l=p.locator('.modal button:has-text("'+t+'")');if(await l.count()){await l.first().click();await p.waitForTimeout(400)}}
await p.locator('#stackStage button:has-text("Resolve")').click();await p.waitForTimeout(500);
const ap=p.locator('.modal button:has-text("Apply")');if(await ap.count()){await ap.first().click();await p.waitForTimeout(500)}
await info('looting discard step');await p.screenshot({path:'/tmp/d2.png'});
console.log('fl id',await ev(()=>window.__fl));
await b.close()})();
