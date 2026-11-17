const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
await p.setViewportSize({width:1366,height:768});
await p.evaluate(()=>{__d.state.hand=__d.state.library.splice(0,7);__d.render();window.__m=document.createElement('div')});
await p.evaluate(()=>{const m=__d.modal('Pre-game actions',{});m.body.append(Object.assign(document.createElement('div'),{style:'height:900px',textContent:'tall'}))});
await p.waitForTimeout(500);
console.log(await p.evaluate(()=>{const m=document.querySelector('.modal');const ht=Math.min(...[...document.querySelectorAll('#row-hand .card')].map(c=>c.getBoundingClientRect().top));return m?JSON.stringify({modalBottom:Math.round(m.getBoundingClientRect().bottom),modalTop:Math.round(m.getBoundingClientRect().top),handTop:Math.round(ht)}):'no modal'}));
await p.screenshot({path:'/tmp/claude-0/-home-claude/935b9de7-136a-5eff-9567-6732905a6b60/scratchpad/modal.png'});
await b.close()})();
