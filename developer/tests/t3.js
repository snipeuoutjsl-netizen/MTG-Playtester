const { chromium } = require('playwright');
const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
const r=await p.evaluate(async()=>{const d=__d;d.stopMusic();d.settings.sound.musicStyle='lofi';d.settings.sound.on=true;d.settings.sound.music=true;d.startMusic();await new Promise(r=>setTimeout(r,1700));const M=d.music;if(!M)return {err:'no music'};
const an=M.ac.createAnalyser();an.fftSize=2048;M.ac.destination; // tap bus
M.bus.connect(an);const buf=new Float32Array(2048);let peak=0,sum=0,n=0;
await new Promise(res=>{let t=0;const iv=setInterval(()=>{an.getFloatTimeDomainData(buf);for(const v of buf){peak=Math.max(peak,Math.abs(v));sum+=v*v;n++}if(++t>40){clearInterval(iv);res()}},150)});
return {style:M.style,state:M.ac.state,bars:M.i,peak:+peak.toFixed(3),rms:+Math.sqrt(sum/n).toFixed(4)}});
console.log(JSON.stringify(r));
const r2=await p.evaluate(()=>{__d.settings.sound.musicStyle='ambient';__d.musicSettingsChanged();return 'switched'});console.log(r2);
await p.waitForTimeout(1800);console.log(await p.evaluate(()=>({style:__d.music&&__d.music.style})));
await b.close()})();
