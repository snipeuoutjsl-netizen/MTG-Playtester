const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
const scan=async(label)=>{const r=await p.evaluate(()=>{const out=[];const vis=e=>{const r=e.getBoundingClientRect();const cs=getComputedStyle(e);return r.width>0&&r.height>0&&cs.visibility!=='hidden'&&cs.display!=='none'};
const root=document.querySelector('.modal')?document.querySelector('.modal'):document.body;
const q=[...root.querySelectorAll('button,select,input:not([type=checkbox]):not([type=radio]):not([type=file]),textarea')].filter(vis);
for(const e of q){const r=e.getBoundingClientRect(),cs=getComputedStyle(e);const par=e.closest('.modal,#topbar,#gamebar,#boardstrip,#handWrap,.box,#overlay,#stackStage')||document.body;
out.push({t:(e.innerText||e.value||e.title||e.tagName).slice(0,18),tag:e.tagName.toLowerCase(),h:Math.round(r.height),w:Math.round(r.width),fs:cs.fontSize,br:cs.borderRadius,par:(par.id||par.className||par.tagName).toString().slice(0,18),ov:e.scrollWidth>e.clientWidth+1})}
const over=[...document.querySelectorAll('*')].filter(e=>vis(e)&&e.scrollWidth>e.clientWidth+2&&getComputedStyle(e).overflowX==='visible'&&e.children.length===0&&e.innerText&&e.innerText.length>3).slice(0,8).map(e=>e.className+':'+e.innerText.slice(0,25));
return {out,over}});
const by={};for(const x of r.out){const k=x.par+'|'+x.tag;(by[k]=by[k]||[]).push(x)}
console.log('=== '+label+' ('+r.out.length+' controls)');
for(const [k,v] of Object.entries(by)){const hs=[...new Set(v.map(x=>x.h))],fs=[...new Set(v.map(x=>x.fs))],br=[...new Set(v.map(x=>x.br))];console.log(' ',k.padEnd(28),'h',hs.join('/'),'fs',fs.join('/'),'r',br.join('/'),v.some(x=>x.ov)?'OVERFLOW:'+v.filter(x=>x.ov).map(x=>x.t).join(','):'')}
if(r.over.length)console.log('  text overflow:',r.over.join(' | '))};
await p.screenshot({path:'/tmp/a_board.png'});await scan('board');
// settings tabs
await p.locator('button:has-text("⚙")').first().click();await p.click('#btnSettings');await p.waitForTimeout(300);
const tabs=await p.$$eval('.settabbtn',e=>e.map(x=>x.dataset.k));
for(const k of tabs){await p.click('.settabbtn[data-k='+k+']');await p.waitForTimeout(250);await p.screenshot({path:'/tmp/a_set_'+k+'.png'});await scan('settings:'+k)}
await p.click('.modal footer >> text=Close').catch(()=>{});await p.waitForTimeout(200);
// deck screen
await p.click('#btnNew').catch(()=>{});await p.waitForTimeout(500);await p.screenshot({path:'/tmp/a_deck.png'});await scan('deck screen');
console.log('tabs',tabs.join(','));
await b.close()})();
