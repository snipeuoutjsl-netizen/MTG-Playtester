const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
await p.setViewportSize({width:1366,height:768});
await p.evaluate(()=>{const s=__d.state;s.battlefield=[];const names=s.library.map(c=>c);let n=0;
 for(const c of s.library.slice()){if(n>=34)break;s.library.splice(s.library.indexOf(c),1);s.battlefield.push(c);n++}
 for(let i=0;i<7;i++)s.hand.push(s.library.shift());__d.render()});
await p.waitForTimeout(600);
console.log(await p.evaluate(()=>{const hw=document.querySelector('#row-hand .card').getBoundingClientRect().top;const out=[];for(const z of ['row-creatures','row-noncreature','row-lands']){const r=document.getElementById(z);const cs=[...r.children].map(c=>c.getBoundingClientRect().bottom);out.push(z+' n='+cs.length+' maxBottom='+Math.round(Math.max(0,...cs))+' scale='+getComputedStyle(r).getPropertyValue('--zone-scale'))}
 const ov=['zone-creatures','zone-noncreature','zone-lands'].map(z=>{const e=document.getElementById(z);return z+':'+(e.scrollHeight-e.clientHeight)}).join(' ');return ov+' handTop='+Math.round(hw)+' cover='+document.querySelector('#stage').style.getPropertyValue('--handcover')+'\n'+out.join('\n')}));
await p.screenshot({path:'/tmp/claude-0/-home-claude/935b9de7-136a-5eff-9567-6732905a6b60/scratchpad/bf.png'});
await b.close()})();
