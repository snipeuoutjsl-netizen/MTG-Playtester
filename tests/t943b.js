const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
console.log(await p.evaluate(()=>{const e=document.querySelector('#libstack .cardback');return e?[getComputedStyle(e).backgroundImage.slice(0,30),__d.settings.sleevePreset]:'none'}));
await p.evaluate(()=>{__d.settings.sleevePreset='pixel';localStorage.setItem('mtgpt.settings',JSON.stringify(__d.settings))});
await b.close()})();
