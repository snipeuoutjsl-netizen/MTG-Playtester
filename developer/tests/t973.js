const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
await p.setViewportSize({width:1366,height:768});
await p.evaluate(()=>{const s=__d.state;s.battlefield=[];s.hand=s.library.splice(0,7);s.step=__d.STEPS.findIndex(x=>x.id==='main1');__d.render()});
await p.waitForTimeout(800);
console.log(await p.evaluate(()=>[...document.querySelectorAll('#row-hand .card')].map(c=>[...c.classList].filter(x=>/cast-/.test(x)).join('')+' '+getComputedStyle(c).boxShadow.slice(0,60)).join('\n')));
await p.screenshot({path:'/tmp/claude-0/-home-claude/935b9de7-136a-5eff-9567-6732905a6b60/scratchpad/glow.png',clip:{x:0,y:520,width:900,height:248}});
await b.close()})();
