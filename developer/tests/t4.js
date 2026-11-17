const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
const urls=await p.evaluate(()=>({s:__d.artUrl('sleeve','pixcosmos'),m:__d.artUrl('mat','pixcosmos')}));
console.log(urls.s.length,urls.m.length);
const pg=await b.newPage({viewport:{width:1400,height:560}});
await pg.setContent(`<body style="margin:0;background:#222;display:flex;gap:16px;padding:10px"><img src='${urls.s}' height=520 style="image-rendering:pixelated"><img src='${urls.m}' height=520 style="image-rendering:pixelated"></body>`);
await pg.waitForTimeout(500);await pg.screenshot({path:'/tmp/pix.png'});
await b.close()})();
