const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
p.on('console',m=>{if(/lofi bar/.test(m.text()))console.log('WARN',m.text().slice(0,200))});
await p.evaluate(()=>{__d.stopMusic();__d.settings.sound.musicStyle='lofi';__d.startMusic()});
for(let i=0;i<8;i++){await p.waitForTimeout(5000);console.log(i,await p.evaluate(()=>({bars:__d.music&&__d.music.i,t:Math.round(__d.music.ac.currentTime),state:__d.music.ac.state,gain:__d.music.bus.gain.value.toFixed(3)})))}
await b.close()})();
