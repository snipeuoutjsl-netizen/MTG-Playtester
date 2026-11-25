// v0.99.107 The intended solution of every new built-in puzzle, played through the real engine (run by cr-rules.js 'UI puzzles 2').
// It answers each window the way a player would (targets, the fetch, the dungeon room, Fireblast's sacrifice) and reports any window it cannot.
(async () => { const d = __d, W = ms => new Promise(r => setTimeout(r, ms)), log = [];
  d.settings.teaching.stackGuidance = false; window.__noGameEnd = false;
  const hdrs = () => [...document.querySelectorAll('#modalRoot .backdrop')].map(b => (b.querySelector('header') || b).innerText.split('\n')[0]);
  const btns = bd => [...bd.querySelectorAll('button')];
  // answer whatever window is open; returns false when nothing was open
  const answer = async (want) => {
    const bds = [...document.querySelectorAll('#modalRoot .backdrop')]; const bd = bds.pop(); if (!bd) return false; const tx = bd.innerText; if (window.__trace) log.push('SEE: ' + tx.replace(/\n/g, ' ').slice(0, 160));
    if (/Puzzle solved|Not this time/.test(tx)) return false;
    if (/choose a target|target/i.test((bd.querySelector('header') || bd).innerText)) { const rows = [...bd.querySelectorAll('.tg-row')]; const row = rows.find(r => want.tgt && want.tgt.test(r.textContent)) || rows[0]; if (row) { (row.querySelector('button') || row).click(); await W(80); } const cf = btns(bd).find(x => /Confirm/.test(x.textContent)); if (cf) cf.click(); await W(200); return true; }
    const hd = (bd.querySelector('header') || bd).innerText;
    if (/choose the order/i.test(hd)) { const b = btns(bd).find(x => /^Put on the stack$/.test(x.textContent.trim())); if (b) { b.click(); await W(200); return true; } }
    { const b = btns(bd).find(x => /^Put on the stack$|^Cast .+ free$|^Attach here$/.test(x.textContent.trim())); if (b) { b.click(); await W(300); return true; } }
    if (want.pick) { const items = [...bd.querySelectorAll('.frow, .pick-card, .sac-row, .row, .card, li')].filter(x => want.pick.test(x.textContent) && x.offsetParent); const cf = btns(bd).find(x => /^Confirm|Search|Choose|Done/.test(x.textContent.trim()));
      if (items.length && !cf && bd.querySelector('.fetchgrid')) { items[0].click(); await W(400); return true; }
      if (items.length && cf) { const need = want.n || 1; for (const it of items.slice(0, need)) { it.click(); await W(80); } if (need > 1 && items.length === 1) for (let k = 1; k < need; k++) { items[0].click(); await W(80); } const cf2 = btns(bd).find(x => /^Confirm|Search|Choose|Done/.test(x.textContent.trim())); if (cf2) cf2.click(); await W(300); return true; } }
    const alt = want.alt && btns(bd).concat([...bd.querySelectorAll('.row, .opt, label')]).find(x => want.alt.test(x.textContent) && x.offsetParent); if (alt && !want._altDone) { want._altDone = true; alt.click(); await W(200); return true; }
    const pay = btns(bd).find(x => /Pay and (cast|activate)|^Cast$|Cast it/.test(x.textContent)); if (pay) { pay.click(); await W(300); return true; }
    const col = want.color && btns(bd).find(x => new RegExp('\\(' + want.color + '\\)|' + ({R:'Red',U:'Blue',G:'Green',W:'White',B:'Black'})[want.color], 'i').test(x.textContent)); if (col) { col.click(); await W(200); return true; }
    const room = want.room && [...bd.querySelectorAll('.dg-room.can')].find(x => want.room.test(x.textContent)); if (room) { room.click(); await W(300); return true; }
    if (/flashback/i.test(hd)) { const it = [...bd.querySelectorAll('.frow, .row, .tg-row, label, .opt')].find(x => want.tgt && want.tgt.test(x.textContent)); if (it) { it.click(); await W(80); } }
    const ok = btns(bd).find(x => (/^(Done|Confirm|OK|Continue|Keep|Ask every time|Apply|Yes|Choose)$/i.test(x.textContent.trim()) || /Deal \d+ damage to Opponent/i.test(x.textContent)) && !x.disabled); if (ok) { ok.click(); await W(200); return true; }
    log.push('STUCK: ' + (bd.querySelector('header') || bd).innerText.replace(/\n/g, ' ').slice(0, 80) + ' | ' + btns(bd).map(b => b.textContent.trim()).filter(Boolean).slice(0, 8).join(' / ')); bd.remove(); return true; };
  const settle = async want => { for (let k = 0; k < 30; k++) { await W(150); if (await answer(want || {})) continue; if (d.state.stack.length) { d.resolveTopOfStack(); await W(400); continue; } if (d.state.pendingTriggers.length) { d.flushTriggers(); await W(200); continue; } break; } };
  const cast = async (name, want = {}) => { const c = d.state.hand.find(x => x.name.startsWith(name)); if (!c) { log.push('no card ' + name); return; } d.castSpell(c.id); await settle(want); log.push(`cast ${name}: opp ${d.state.oppLife}`); };
  const play = async (name, want = {}) => { const c = d.state.hand.find(x => x.name.startsWith(name)); d.playLand(c.id); await settle(want); log.push(`played ${name}`); };
  const act = async (name, want = {}) => { const c = d.state.battlefield.find(x => x.name.startsWith(name)); d.activateAbility(c.id, true, want.ix || 0); await settle(want); log.push(`activated ${name}: opp ${d.state.oppLife}`); };
  const attack = async () => { const s = d.state; s.combat = { attackers: s.battlefield.filter(c => d.permZone(c) === 'creatures' && !d.isSick(c)).map(c => c.id), blockers: {}, declared: true, dealt: false }; d.dealCombatDamage(); d.render(); await W(1600); log.push(`attacked: opp ${s.oppLife}`); };
  const pt = n => { const c = d.state.battlefield.find(x => x.name.startsWith(n)); return c ? d.ptCalc(c).p + '/' + d.ptCalc(c).t : '-'; };
  const res = () => { const t = ([...document.querySelectorAll('#modalRoot .ge-big')].pop() || {}).textContent || ''; return t; };
  const run = async (id, steps) => { log.push('== ' + id); document.getElementById('modalRoot').innerHTML = ''; d.startPuzzle(d.PUZZLES.find(p => p.id === id)); await W(400); try { await steps(); } catch (e) { log.push('ERR ' + e.message); } await W(1500); log.push(`RESULT ${id}: opp ${d.state.oppLife} ${res()} ${hdrs().join('|')}`); document.getElementById('modalRoot').innerHTML = ''; };
  const only = (window.__only || '').split(',').filter(Boolean);
  const P = {
    'p-double': async () => { await cast('Giant Growth', { tgt: /Goblin Guide/ }); await cast('Temur Battle Rage', { tgt: /Goblin Guide/ }); log.push('guide ' + pt('Goblin Guide')); await attack(); },
    'p-landfall': async () => { await play('Arid Mesa'); log.push('geo ' + pt('Plated') + ' lynx ' + pt('Steppe')); await act('Arid Mesa', { pick: /Mountain/ }); log.push('geo ' + pt('Plated') + ' lynx ' + pt('Steppe') + ' life ' + d.state.life); await attack(); },
    'p-cascade': async () => { await cast('Monastery Swiftspear'); await cast('Bloodbraid Elf', { tgt: /opponent/i }); log.push('sw ' + pt('Monastery')); await attack(); },
    'p-snap': async () => { await cast('Snapcaster Mage', { tgt: /Lightning Bolt/ }); const b = d.state.graveyard.find(x => x.name === 'Lightning Bolt'); d.castFromGraveyard(b.id); await settle({ tgt: /opponent/i }); log.push('fb bolt: opp ' + d.state.oppLife); await cast('Lava Spike', { tgt: /opponent/i }); await attack(); },
    'p-dungeon': async () => { await cast('Find the Path', { tgt: /Forest|Opponent/, room: /Trap/ }); log.push('dungeon ' + JSON.stringify(d.state.dungeon)); await settle({ tgt: /opponent/i }); await cast('Lightning Bolt', { tgt: /opponent/i }); },
    'p-storm': async () => { await cast('Lotus Petal'); await cast('Desperate Ritual'); await cast('Manamorphose', { color: 'R' }); log.push('pool ' + JSON.stringify(d.state.manaPool)); await cast('Grapeshot', { tgt: /opponent/i }); },
    'p-fireblast': async () => { await cast('Lightning Bolt', { tgt: /opponent/i }); await cast('Lava Spike', { tgt: /opponent/i }); await cast('Fireblast', { tgt: /opponent/i, alt: /Sacrifice two Mountains|sacrifice/i, pick: /Mountain/, n: 2 }); log.push('sw ' + pt('Monastery')); await attack(); },
    'p-fiend': async () => { await cast('Desperate Ritual'); await cast('Manamorphose', { color: 'R' }); await cast('Manamorphose', { color: 'R' }); await cast('Lava Spike', { tgt: /opponent/i }); log.push('fiend ' + pt('Kiln')); await attack(); } };
  for (const [id, f] of Object.entries(P)) if (!only.length || only.includes(id)) await run(id, f);
  return log.join('\n'); })()
