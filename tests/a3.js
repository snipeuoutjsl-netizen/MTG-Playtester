const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
const shot=async(n)=>{await p.waitForTimeout(500);await p.screenshot({path:'/tmp/m_'+n+'.png'})};
await p.evaluate(()=>{const s=__d.state;s.step=3;for(const n of ['Cabal Therapist','Grizzly Bears','Mountain','Mountain']){const i=s.library.findIndex(x=>x.name===n);const [c]=s.library.splice(i,1);s.battlefield.push(c)}__d.render()});
await p.locator('#btnTokens').click().catch(()=>{});await shot('tokens');await p.keyboard.press('Escape');await p.locator('.modal footer button').last().click({timeout:1000}).catch(()=>{});
await p.evaluate(()=>{const c=__d.state.battlefield.find(x=>x.name==='Cabal Therapist');__d.activateAbility(c.id,true,0)});await shot('targets');
console.log(await p.evaluate(()=>[...document.querySelectorAll('.modal button')].map(e=>Math.round(e.getBoundingClientRect().height)+':'+e.innerText.slice(0,10)).join(' ')));
await b.close()})();
