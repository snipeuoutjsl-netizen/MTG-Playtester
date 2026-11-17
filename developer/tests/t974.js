const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
await p.setViewportSize({width:1366,height:768});
await p.evaluate(()=>{const s=__d.state;s.phase='play';s.battlefield=[];s.stack=[];s.hand=s.library.splice(0,9);s.step=__d.STEPS.findIndex(x=>x.id==='cleanup');s.discarding=2;__d.render()});
await p.waitForTimeout(600);
console.log(await p.evaluate(()=>(document.querySelector('#stackStage')||{}).innerText));
await p.screenshot({path:'/tmp/claude-0/-home-claude/935b9de7-136a-5eff-9567-6732905a6b60/scratchpad/rule.png'});
await b.close()})();
