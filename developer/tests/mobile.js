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
const diag = async (x, y) => p.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return { at: e ? (e.id || e.className || e.tagName).toString().slice(0, 50) : null, modals: [...document.querySelectorAll('#modalRoot .backdrop')].map(b => (b.querySelector('header') || b).innerText.split('\n')[0]).join('|'), phase: __d.state.phase + ':' + __d.state.step, dealing: document.body.classList.contains('dealing'), stack: __d.state.stack.length, pend: __d.state.pendingTriggers.length }; }, [x, y]);
const ready = async () => { await p.evaluate(()=>{ const s=__d.state; if (s.phase==='pregame') __d.finishPregame(); if (s.stack) s.stack.length=0; if (s.pendingTriggers) s.pendingTriggers.length=0; document.getElementById('modalRoot').innerHTML=''; __d.render(); }); await p.waitForTimeout(500); };   // a random opening hand can start on the pre-game screen (Leylines and the like): play from the real table
const touch = async (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x,y])=>({x,y})) });
// drag a land from hand to the battlefield
await ready();
await p.evaluate(()=>{ const s=__d.state; if(!s.hand.some(x=>__d.isLandName(x.name))){ const i=s.library.findIndex(x=>__d.isLandName(x.name)); s.hand.push(s.library.splice(i,1)[0]); __d.render(); } }); await p.waitForTimeout(900);
const info = await p.evaluate(()=>{ const s=__d.state; let c=s.hand.find(x=>__d.isLandName(x.name)); if(!c){ const i=s.library.findIndex(x=>__d.isLandName(x.name)); c=s.library.splice(i,1)[0]; s.hand.push(c); __d.render(); } const el=document.querySelector(`#row-hand .card[data-id="${c.id}"]`)||[...document.querySelectorAll('#row-hand .card')].find(e=>e.textContent.includes(c.name)); const r=el.getBoundingClientRect(); const mat=document.querySelector('#mat').getBoundingClientRect(); return {id:c.id, name:c.name, x:r.left+r.width/2, y:r.top+r.height/2, tx:mat.left+mat.width/2, ty:mat.top+mat.height*0.35, bf:s.battlefield.length}; });
const dg1 = await diag(info.x, info.y); await touch('touchStart', [[info.x,info.y]]);
for (let i=1;i<=12;i++){ await touch('touchMove', [[info.x+(info.tx-info.x)*i/12, info.y+(info.ty-info.y)*i/12]]); await p.waitForTimeout(16); }
await touch('touchEnd', []); await p.waitForTimeout(600);
const dr = await p.evaluate(id=>({onBf:__d.state.battlefield.some(c=>c.id===id), inHand:__d.state.hand.some(c=>c.id===id)}), info.id); ok('touch drag plays a land from hand', dr.onBf && !dr.inHand, JSON.stringify({ dr, dg1, after: await diag(info.tx, info.ty) }));
await p.waitForTimeout(1200);   // let the played land settle
await ready();
// long press on a hand card opens the card menu
const h2 = await p.evaluate(()=>{ const el=document.querySelector('#row-hand .card'); const r=el.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; });
const dg2 = await diag(h2.x, h2.y); await touch('touchStart', [[h2.x,h2.y]]); await p.waitForTimeout(650); await touch('touchEnd', []); await p.waitForTimeout(200);
ok('press and hold opens the card menu', await p.evaluate(()=>!!document.querySelector('#ctxMenu:not([hidden])')), 'menu closed ' + JSON.stringify(dg2));
await p.setViewportSize({width:390,height:844}); await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true, screenWidth: 390, screenHeight: 844, screenOrientation: { type: 'portraitPrimary', angle: 0 } }); await p.evaluate(()=>{ window.__fitViewport && window.__fitViewport(); window.dispatchEvent(new Event('resize')); }); await p.waitForTimeout(300);
await p.waitForTimeout(400);
await p.evaluate(()=>{ document.getElementById('modalRoot').innerHTML=''; document.querySelector('#ctxMenu') && (document.querySelector('#ctxMenu').hidden = true); __d.render(); }); await p.waitForTimeout(300);
await p.waitForTimeout(1200);
{ await ready(); const before = await p.evaluate(()=>__d.state.step + '/' + __d.state.turn);
  const m = await p.evaluate(()=>{ const r=document.querySelector('#zone-creatures').getBoundingClientRect(); return { x: r.right - 40, y: r.top + r.height/2 }; });
  const dg3 = await diag(m.x, m.y); await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{x:m.x,y:m.y}] });
  for (let i=1;i<=8;i++){ await cdp.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{x:m.x-25*i,y:m.y+2}] }); await p.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] }); await p.waitForTimeout(500);
  const after = await p.evaluate(()=>__d.state.step + '/' + __d.state.turn);
  ok('upright: swiping the table left moves to the next step', before !== after, before + ' -> ' + after + ' ' + JSON.stringify(dg3)); }
const up = await p.evaluate(()=>({ ui: document.documentElement.classList.contains('portrait-ui'), w: innerWidth, sw: document.documentElement.scrollWidth, col: getComputedStyle(document.getElementById('table')).gridTemplateColumns.split(' ').length, matCols: getComputedStyle(document.getElementById('mat')).gridTemplateColumns.split(' ').length, landsLeft: (()=>{ const a=document.getElementById('zone-lands').getBoundingClientRect(), b=document.getElementById('zone-noncreature').getBoundingClientRect(); return Math.abs(a.top-b.top)<4 && a.right<=b.left+1; })(), drawer: getComputedStyle(document.getElementById('btnSideDrawer')).display }));
ok('upright phone gets the one-column table (lands left and other permanents right in one zone), no sideways scrolling', up.ui && up.w === 520 && up.sw <= up.w && up.col === 1 && up.matCols === 2 && up.landsLeft && up.drawer !== 'none', JSON.stringify(up));
await p.evaluate(()=>__d.openHall()); await p.waitForTimeout(600);
const shelf = await p.evaluate(()=>{ const bx=[...document.querySelectorAll('#hall .lib-shelf-box')]; const fits = bx.every(b=>{ const r=b.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1; }); return { n: bx.length, fits, sw: document.documentElement.scrollWidth, w: innerWidth }; });   // v0.99.108 the shelf of deck boxes first
await p.evaluate(()=>{ const b=document.querySelector('#hall .lib-shelf-box'); if (b) b.click(); }); await p.waitForTimeout(400);
const hp = await p.evaluate(()=>{ const h=document.getElementById('hall'), side=h.querySelector('.lib-side'), main=h.querySelector('.lib-main'), go=[...h.querySelectorAll('.lib-head-go button')].find(b=>/Begin goldfish/i.test(b.textContent)); const r=go&&go.getBoundingClientRect(); return { lib: h.classList.contains('lib2'), stacked: !!(side&&main) && side.getBoundingClientRect().bottom <= main.getBoundingClientRect().top + 1, goFits: !!r && r.left >= 0 && r.right <= innerWidth + 1, sw: document.documentElement.scrollWidth, w: innerWidth }; });
ok('upright Library: the shelf of deck boxes fits (two to a row), picking a box opens the deck page, the collection is stacked above it, Begin goldfish fits, no sideways scrolling', shelf.n > 0 && shelf.fits && shelf.sw <= shelf.w && hp.lib && hp.stacked && hp.goFits && hp.sw <= hp.w, JSON.stringify({ shelf, hp })); await p.evaluate(()=>__d.closeHall(false));
// v0.99.92 the hand's handle is part of the hand tray (not floating over the table or a window); tapping it tucks and raises the hand
{ await p.evaluate(()=>{ document.getElementById('modalRoot').innerHTML=''; document.body.classList.remove('hand-tuck'); __d.render(); }); await p.waitForTimeout(300);
  const b0 = await p.evaluate(()=>{ const t=document.getElementById('handTab'), r=t.getBoundingClientRect(); return { inTray: t.parentElement && t.parentElement.id === 'handWrap', y: Math.round(r.top), x: r.left + r.width/2, cy: r.top + r.height/2, w: Math.round(r.width), txt: t.textContent }; });
  await p.touchscreen.tap(b0.x, b0.cy); await p.waitForTimeout(450);
  const b1 = await p.evaluate(()=>{ const r=document.getElementById('handTab').getBoundingClientRect(); return { tuck: document.body.classList.contains('hand-tuck'), y: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, txt: document.getElementById('handTab').textContent }; });
  await p.touchscreen.tap(b0.x, b1.y + 10); await p.waitForTimeout(450);
  const b2 = await p.evaluate(()=>({ tuck: document.body.classList.contains('hand-tuck') }));
  ok('upright: the hand handle is part of the hand tray; tap it to hide the hand (only the handle stays, at the bottom) and again to show it', b0.inTray && b0.w > 300 && b1.tuck && b1.y > b0.y && b1.bottom <= b1.vh + 1 && /Show hand/.test(b1.txt) && !b2.tuck, JSON.stringify({ b0, b1, b2 })); }
// v0.99.92 no Resolving screen: Kozilek's Command (X = 5, modes 1 and 2) makes its tokens, opens only the scry window (fully on screen), then draws and goes to the graveyard
{ const k = await p.evaluate(async ()=>{ const s=__d.state, W=ms=>new Promise(r=>setTimeout(r,ms)); document.getElementById('modalRoot').innerHTML=''; s.phase='play'; s.step=3; s.stack.length=0;
    const c=Object.assign(__d.newCard("Kozilek's Command"),{id:s.nextId++}); c.modes=[0,1]; c.xValue=5; c.targets=[{kind:'player',id:'you',name:'You'},{kind:'player',id:'you',name:'You'}];
    s.stack.push(c); const bf0=s.battlefield.length, h0=s.hand.length; __d.resolveTopOfStack(); await W(500);
    const panel=!!document.querySelector('.res-panel'), stage=!document.getElementById('stackStage').hidden && /Resolving/.test(document.getElementById('stackStage').textContent);
    const m=document.querySelector('#modalRoot .modal'), mr=m&&m.getBoundingClientRect(); const btn=m&&[...m.querySelectorAll('button')].find(b=>/^Confirm/.test(b.textContent)); const br=btn&&btn.getBoundingClientRect();
    const hit=br&&document.elementFromPoint(br.left+br.width/2, br.top+br.height/2); const onTop=!!(hit&&btn.contains(hit));
    if (btn) btn.click(); await W(1500);
    return { panel, stage, title: m&&m.querySelector('header')&&m.querySelector('header').textContent, fits: !!mr && mr.left >= 0 && mr.right <= innerWidth + 1 && br.bottom <= innerHeight, onTop, tokens: s.battlefield.length-bf0, drew: s.hand.length-h0, gy: s.graveyard.some(x=>x.id===c.id), left: !!s.resolving }; });
  ok('upright: a resolving spell has no Resolving screen (Kozilek\'s Command: 5 tokens, only the scry window, fully on screen and not covered, then draw, then graveyard)', !k.panel && !k.stage && /Scry 5/.test(k.title||'') && k.fits && k.onTop && k.tokens===5 && k.drew===1 && k.gy && !k.left, JSON.stringify(k)); }
ok('no page errors', !errs.length, errs.join('; '));
console.log(`${res.filter(Boolean).length}/${res.length} pass`); await b.close(); process.exit(res.every(Boolean) ? 0 : 1); })();
