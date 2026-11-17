const { setup } = require('./common.js');
(async()=>{const {b,p}=await setup();
console.log('decks',await p.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('mtgpt.decks')||'{}'))),'cur',await p.evaluate(()=>localStorage.getItem('mtgpt.current')));
await p.evaluate(()=>{const names=Object.keys(JSON.parse(localStorage.getItem('mtgpt.decks')));const n=names[names.length-1];localStorage.setItem('mtgpt.current',JSON.stringify(n));document.querySelector('#deckSelect').value=n;window.__n=n});
await p.reload();await p.waitForTimeout(1500);
console.log('after reload',await p.evaluate(()=>({cur:localStorage.getItem('mtgpt.current'),sel:document.querySelector('#deckSelect').value,opts:[...document.querySelectorAll('#deckSelect option')].map(o=>o.value),modals:[...document.querySelectorAll('.modal')].map(m=>m.innerText.slice(0,150))})));
await b.close()})();
