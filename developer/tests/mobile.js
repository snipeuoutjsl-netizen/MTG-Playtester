// Phone/tablet checks (v0.99.54): run like cr-rules.js. A phone held sideways gets the widened viewport; touch drag plays a land;
// press-and-hold opens the card menu; an upright phone gets the one-column table and the portrait Library.
const { setup } = require(__dirname+'/common.js');
(async()=>{
const {b,p}=await setup({ viewport:{width:844,height:390}, screen:{width:844,height:390}, deviceScaleFactor:3, isMobile:true, hasTouch:true, userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' });
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.evaluate(()=>{ if(__d.state.phase==='mull'){__d.keepHand(); if(__d.state.bottomPhase)__d.finishMulligan();} __d.render(); }); await p.waitForTimeout(600);
const res = []; const ok = (name, c, why) => { res.push(c); console.log((c ? 'PASS  ' : 'FAIL  ') + name + (c ? '' : '  ' + why)); };
const vw = await p.evaluate(()=>innerWidth); ok('widened viewport on a sideways phone', vw >= 1180, 'width ' + vw);
const cdp = await p.context().newCDPSession(p);
const touch = async (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x,y])=>({x,y})) });
// drag a land from hand to the battlefield
await p.evaluate(()=>{ const s=__d.state; if(!s.hand.some(x=>__d.isLandName(x.name))){ const i=s.library.findIndex(x=>__d.isLandName(x.name)); s.hand.push(s.library.splice(i,1)[0]); __d.render(); } }); await p.waitForTimeout(900);
const info = await p.evaluate(()=>{ const s=__d.state; let c=s.hand.find(x=>__d.isLandName(x.name)); if(!c){ const i=s.library.findIndex(x=>__d.isLandName(x.name)); c=s.library.splice(i,1)[0]; s.hand.push(c); __d.render(); } const el=document.querySelector(`#row-hand .card[data-id="${c.id}"]`)||[...document.querySelectorAll('#row-hand .card')].find(e=>e.textContent.includes(c.name)); const r=el.getBoundingClientRect(); const mat=document.querySelector('#mat').getBoundingClientRect(); return {id:c.id, name:c.name, x:r.left+r.width/2, y:r.top+r.height/2, tx:mat.left+mat.width/2, ty:mat.top+mat.height*0.35, bf:s.battlefield.length}; });
await touch('touchStart', [[info.x,info.y]]);
for (let i=1;i<=12;i++){ await touch('touchMove', [[info.x+(info.tx-info.x)*i/12, info.y+(info.ty-info.y)*i/12]]); await p.waitForTimeout(16); }
await touch('touchEnd', []); await p.waitForTimeout(600);
const dr = await p.evaluate(id=>({onBf:__d.state.battlefield.some(c=>c.id===id), inHand:__d.state.hand.some(c=>c.id===id)}), info.id); ok('touch drag plays a land from hand', dr.onBf && !dr.inHand, JSON.stringify(dr));
await p.waitForTimeout(1200);   // let the played land settle
// long press on a hand card opens the card menu
const h2 = await p.evaluate(()=>{ const el=document.querySelector('#row-hand .card'); const r=el.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; });
await touch('touchStart', [[h2.x,h2.y]]); await p.waitForTimeout(650); await touch('touchEnd', []); await p.waitForTimeout(200);
ok('press and hold opens the card menu', await p.evaluate(()=>!!document.querySelector('#ctxMenu:not([hidden])')), 'menu closed');
await p.setViewportSize({width:390,height:844}); await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true, screenWidth: 390, screenHeight: 844, screenOrientation: { type: 'portraitPrimary', angle: 0 } }); await p.evaluate(()=>{ window.__fitViewport && window.__fitViewport(); window.dispatchEvent(new Event('resize')); }); await p.waitForTimeout(300);
await p.waitForTimeout(400);
await p.evaluate(()=>{ document.getElementById('modalRoot').innerHTML=''; document.querySelector('#ctxMenu') && (document.querySelector('#ctxMenu').hidden = true); __d.render(); }); await p.waitForTimeout(300);
await p.waitForTimeout(1200);
{ const before = await p.evaluate(()=>__d.state.step + '/' + __d.state.turn);
  const m = await p.evaluate(()=>{ const r=document.querySelector('#zone-creatures').getBoundingClientRect(); return { x: r.right - 40, y: r.top + r.height/2 }; });
  await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{x:m.x,y:m.y}] });
  for (let i=1;i<=8;i++){ await cdp.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{x:m.x-25*i,y:m.y+2}] }); await p.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] }); await p.waitForTimeout(500);
  const after = await p.evaluate(()=>__d.state.step + '/' + __d.state.turn);
  ok('upright: swiping the table left moves to the next step', before !== after, before + ' -> ' + after); }
const up = await p.evaluate(()=>({ ui: document.documentElement.classList.contains('portrait-ui'), w: innerWidth, sw: document.documentElement.scrollWidth, col: getComputedStyle(document.getElementById('table')).gridTemplateColumns.split(' ').length, matCols: getComputedStyle(document.getElementById('mat')).gridTemplateColumns.split(' ').length, landsLeft: (()=>{ const a=document.getElementById('zone-lands').getBoundingClientRect(), b=document.getElementById('zone-noncreature').getBoundingClientRect(); return Math.abs(a.top-b.top)<4 && a.right<=b.left+1; })(), drawer: getComputedStyle(document.getElementById('btnSideDrawer')).display }));
ok('upright phone gets the one-column table (lands left and other permanents right in one zone), no sideways scrolling', up.ui && up.w === 520 && up.sw <= up.w && up.col === 1 && up.matCols === 2 && up.landsLeft && up.drawer !== 'none', JSON.stringify(up));
await p.evaluate(()=>__d.openHall()); await p.waitForTimeout(600);
const hp = await p.evaluate(()=>({ portrait: document.getElementById('hall').classList.contains('portrait'), shelves: [...document.querySelectorAll('#hall .bk-shelf')].filter(x=>getComputedStyle(x).display!=='none').length }));
ok('upright Library: portrait room with three shelves', hp.portrait && hp.shelves === 3, JSON.stringify(hp)); await p.evaluate(()=>__d.closeHall(false));
ok('no page errors', !errs.length, errs.join('; '));
console.log(`${res.filter(Boolean).length}/${res.length} pass`); await b.close(); process.exit(res.every(Boolean) ? 0 : 1); })();
