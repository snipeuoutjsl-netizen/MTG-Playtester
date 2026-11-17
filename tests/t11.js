const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
for(const [w,h] of [[1280,800],[1280,640],[1000,600],[1920,1080]]){await p.setViewportSize({width:w,height:h});
await p.evaluate(()=>{const s=__d.state;if(s.graveyard.length<3){for(let i=0;i<6;i++)s.graveyard.push(s.library.shift());for(let i=0;i<3;i++)s.exile.push(s.library.shift())}__d.render()});await p.waitForTimeout(500);
console.log(w+'x'+h,await p.evaluate(()=>[...document.querySelectorAll('.pile')].map(e=>{const r=e.querySelector('.stack').getBoundingClientRect(),pr=e.getBoundingClientRect();return Math.round(r.width)+'x'+Math.round(r.height)+' r'+(r.width/r.height).toFixed(3)+(r.height>pr.height+1?' OVERFLOW':'')}).join(' | ')));
if(h===800&&w===1280)await p.screenshot({path:'/tmp/piles2.png'})}
await b.close()})();
