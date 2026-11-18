// ---- v0.97 LAN / local multiplayer (stage 1: a shared table).
// Two copies of the app connect straight to each other over WebRTC (no server, no install change): the host makes an invite code,
// the guest pastes it and sends back a reply code. Each player runs their OWN game as before; the other player sees a live,
// read-only view of your public board (battlefield, graveyard, exile, stack, life, hand/library SIZES only — your hand and library
// never leave your machine), can chat, and can change your life total by asking (combat damage, drain effects).
const MP = { pc: null, ch: null, role: null, name: '', peer: null, status: 'off', snapTimer: 0, lastSnap: '', opp: null, chat: [], panelOpen: true };
const mpOn = () => !!(MP.ch && MP.ch.readyState === 'open');
const mpEnc = o => btoa(unescape(encodeURIComponent(JSON.stringify(o))));
const mpDec = s => JSON.parse(decodeURIComponent(escape(atob(String(s).replace(/\s+/g, '')))));
function mpSend(msg) { if (mpOn()) { try { MP.ch.send(JSON.stringify(msg)); } catch (e) { /* closed */ } } }
function mpIceDone(pc) {
  return new Promise(res => { if (pc.iceGatheringState === 'complete') return res(); const t = setTimeout(res, 4000); pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } }); });
}
function mpNewPc() {
  mpClose(true);
  const pc = new RTCPeerConnection({ iceServers: [] });   // LAN only: host candidates are enough
  pc.addEventListener('connectionstatechange', () => { if (['failed', 'closed', 'disconnected'].includes(pc.connectionState) && MP.pc === pc) mpLost(); });
  MP.pc = pc; return pc;
}
function mpWire(ch) {
  MP.ch = ch;
  ch.addEventListener('open', () => { MP.status = 'connected'; mpSend({ t: 'hello', name: MP.name || 'Player' }); MP.lastSnap = ''; mpSnapNow(); mpUi(); toast('Multiplayer', 'Connected. Your opponent can now see your public board.'); if (state) log('Multiplayer: connected'); mpRenderPanel(); });
  ch.addEventListener('close', () => { if (MP.ch === ch) mpLost(); });
  ch.addEventListener('message', ev => { try { mpGot(JSON.parse(ev.data)); } catch (e) { console.error(e); } });
}
function mpLost() { if (MP.status === 'off') return; MP.status = 'off'; MP.ch = null; MP.opp = null; try { if (state) log('Multiplayer: disconnected'); } catch (e) { /* no game */ } mpRenderPanel(); mpUi(); }
function mpClose(quiet) { try { if (MP.ch) MP.ch.close(); } catch (e) { /* closing */ } try { if (MP.pc) MP.pc.close(); } catch (e) { /* closing */ } MP.ch = null; MP.pc = null; if (!quiet) { MP.status = 'off'; MP.opp = null; mpRenderPanel(); mpUi(); } }
async function mpHostInvite() {
  const pc = mpNewPc(); MP.role = 'host'; MP.status = 'inviting'; mpWire(pc.createDataChannel('mtg', { ordered: true }));
  await pc.setLocalDescription(await pc.createOffer()); await mpIceDone(pc);
  return mpEnc({ k: 'mtgpt', t: 'offer', sdp: pc.localDescription.sdp });
}
async function mpHostAccept(code) {
  const o = mpDec(code); if (o.k !== 'mtgpt' || o.t !== 'answer') throw new Error('That is not a reply code.');
  await MP.pc.setRemoteDescription({ type: 'answer', sdp: o.sdp });
}
async function mpGuestReply(code) {
  const o = mpDec(code); if (o.k !== 'mtgpt' || o.t !== 'offer') throw new Error('That is not an invite code.');
  const pc = mpNewPc(); MP.role = 'guest'; MP.status = 'joining'; pc.addEventListener('datachannel', e => mpWire(e.channel));
  await pc.setRemoteDescription({ type: 'offer', sdp: o.sdp }); await pc.setLocalDescription(await pc.createAnswer()); await mpIceDone(pc);
  return mpEnc({ k: 'mtgpt', t: 'answer', sdp: pc.localDescription.sdp });
}
// What the other player may see of you. Hidden zones are sizes only.
function mpSnapshot() {
  if (!state) return null;
  const cp = c => { const o = { id: c.id, name: c.name, tapped: !!c.tapped, att: c.att || null, loyalty: c.loyalty, counters: c.counters || null, token: !!c.token, flipped: !!c.flipped };
    if (c.token) o.tk = c.tk || null; return o; };
  return { name: MP.name || 'Player', life: state.life, turn: state.turn, step: (STEPS[state.step] || {}).id || '', hand: state.hand.length, lib: state.library.length,
    bf: state.battlefield.map(cp), gy: state.graveyard.map(cp), ex: state.exile.filter(c => !c.hiddenBy).map(cp), stack: state.stack.map(x => x.name) };
}
function mpSnapNow() { if (!mpOn()) return; const s = mpSnapshot(); if (!s) return; const j = JSON.stringify(s); if (j === MP.lastSnap) return; MP.lastSnap = j; mpSend({ t: 'snap', s }); }
function mpQueueSnap() { if (!mpOn() || MP.snapTimer) return; MP.snapTimer = setTimeout(() => { MP.snapTimer = 0; try { mpSnapNow(); } catch (e) { console.error(e); } }, 250); }
function mpGot(m) {
  if (m.t === 'hello') { MP.peer = String(m.name || 'Opponent').slice(0, 40); mpUi(); mpRenderPanel(); }
  else if (m.t === 'snap') { MP.opp = m.s; if (state && typeof m.s.life === 'number') { state.oppLife = m.s.life; } mpRenderPanel(); try { render(); } catch (e) { /* ui only */ } }
  else if (m.t === 'chat') { MP.chat.push({ who: MP.peer || 'Opponent', text: String(m.text || '').slice(0, 500) }); if (MP.chat.length > 80) MP.chat.shift(); if (state) log(`${MP.peer || 'Opponent'}: ${String(m.text || '').slice(0, 200)}`); mpRenderPanel(); }
  else if (m.t === 'life' && state && Number.isFinite(+m.d)) { const d = Math.max(-999, Math.min(999, Math.trunc(+m.d))); changeLife(d); toast('Life', `${MP.peer || 'Opponent'} changed your life by ${d > 0 ? '+' : ''}${d}.`); mpSnapNow(); }
}
function mpChat(text) { text = String(text || '').trim(); if (!text || !mpOn()) return; MP.chat.push({ who: 'You', text }); mpSend({ t: 'chat', text }); mpRenderPanel(); }
// In a shared game, "the opponent loses N life" goes to the other player's real life total.
function mpOppLife(d) { if (mpOn() && d) mpSend({ t: 'life', d }); }
// ---- the opponent's table: a docked, read-only strip
function mpRenderPanel() {
  let p = $('#mpPanel');
  if (!mpOn() || !MP.opp) { if (p) p.remove(); document.body.classList.remove('mp-open'); return; }
  if (!p) { p = h('div', { id: 'mpPanel' }); document.body.append(p); }
  const o = MP.opp, size = (a) => a.length;
  const lands = o.bf.filter(c => !c.token && isLandName(c.name)), rest = o.bf.filter(c => !(!c.token && isLandName(c.name)));
  const tile = c => { let e; try { e = cardEl(Object.assign({}, c, { id: 'mp' + c.id }), 'opp'); } catch (err) { e = h('div', { class: 'card', text: c.name }); } e.removeAttribute('draggable'); e.classList.add('mpcard'); if (c.tapped) e.classList.add('tapped'); return e; };
  const zone = (label, cards, names) => h('div', { class: 'mpz' }, h('div', { class: 'mpzl', text: label }), h('div', { class: 'mpcards' }, ...(names ? cards.map(c => h('span', { class: 'mpchip', text: c.name })) : cards.map(tile))));
  const chat = h('div', { class: 'mpchat' }, h('div', { class: 'mpmsgs' }, ...MP.chat.slice(-8).map(x => h('div', { class: 'mpmsg' + (x.who === 'You' ? ' me' : ''), text: `${x.who}: ${x.text}` }))),
    (() => { const i = h('input', { type: 'text', placeholder: 'Chat…', maxlength: 300 }); i.addEventListener('keydown', e => { if (e.key === 'Enter') { mpChat(i.value); i.value = ''; } }); return i; })());
  const head = h('div', { class: 'mphead' },
    h('b', { text: `${o.name || MP.peer || 'Opponent'}'s table` }),
    h('span', { class: 'mplife', text: `❤ ${o.life}` }),
    h('span', { class: 'muted small', text: `Turn ${o.turn} · ${o.step || ''} · hand ${o.hand} · library ${o.lib}${o.stack.length ? ' · stack: ' + o.stack.join(', ') : ''}` }),
    h('span', { class: 'mpbtns' },
      h('button', { text: '−1', title: 'Ask your opponent to lose 1 life', onclick: () => mpOppLife(-1) }), h('button', { text: '+1', onclick: () => mpOppLife(1) }),
      h('button', { text: '−5', onclick: () => mpOppLife(-5) }),
      h('button', { text: MP.panelOpen ? 'Hide' : 'Show', onclick: () => { MP.panelOpen = !MP.panelOpen; mpRenderPanel(); } })));
  p.replaceChildren(head, ...(MP.panelOpen ? [h('div', { class: 'mpbody' }, h('div', { class: 'mpboard' }, zone('Permanents', rest), zone('Lands', lands)),
    h('div', { class: 'mpside' }, zone(`Graveyard (${size(o.gy)})`, o.gy, true), zone(`Exile (${size(o.ex)})`, o.ex, true), chat))] : []));
  document.body.classList.toggle('mp-open', MP.panelOpen);
}
// ---- the connect window
function mpUi() { const d = $('#mpDlg'); if (d && d._refresh) d._refresh(); }
function openMultiplayer() {
  if (!FEATURES.multiplayer) return;   // switched off for now
  const m = modal('Multiplayer (LAN)', { width: 640 });
  m.body.append(h('div', { class: 'psub', text: 'Play against a friend on the same network. No account or server: one of you makes an invite code, the other pastes it and sends back a reply code (text them, or paste into any chat). You each play your own deck as usual and see each other\'s public board live. Your hand and library never leave your computer.' }));
  const nm = h('input', { type: 'text', value: MP.name || '', placeholder: 'Your name', maxlength: 24, style: 'width:180px' }); nm.addEventListener('input', () => { MP.name = nm.value.trim(); });
  const status = h('div', { class: 'muted small' }), root = h('div'); root._refresh = null; root.id = 'mpDlg';
  const ta = ph => h('textarea', { rows: 4, placeholder: ph, style: 'width:100%;font-family:monospace;font-size:11px' });
  const copy = t => { try { navigator.clipboard.writeText(t.value); toast('Copied', 'The code is on your clipboard.'); } catch (e) { t.select(); } };
  const busy = (b, on) => { b.disabled = on; };
  const draw = () => {
    status.textContent = MP.status === 'connected' ? `Connected${MP.peer ? ' to ' + MP.peer : ''}.` : MP.status === 'inviting' ? 'Waiting for your friend\'s reply code…' : MP.status === 'joining' ? 'Send the reply code back to the host; they will connect automatically.' : 'Not connected.';
    if (MP.status === 'connected') { root.replaceChildren(h('div', null, h('button', { class: 'primary', text: 'Disconnect', onclick: () => { mpClose(); draw(); } }))); return; }
    const inv = ta('Your invite code appears here'), rep = ta('Paste your friend\'s reply code here'), jin = ta('Paste the invite code your friend sent'), jout = ta('Your reply code appears here');
    const bI = h('button', { class: 'primary', text: 'Create invite code' }), bC = h('button', { text: 'Connect', disabled: true }), bR = h('button', { class: 'primary', text: 'Create reply code' });
    bI.addEventListener('click', async () => { busy(bI, true); try { inv.value = await mpHostInvite(); bC.disabled = false; copy(inv); } catch (e) { toast('Could not create an invite', String(e.message || e)); } busy(bI, false); draw0(); });
    bC.addEventListener('click', async () => { try { await mpHostAccept(rep.value); toast('Connecting…', 'Waiting for the connection to open.'); } catch (e) { toast('Could not connect', String(e.message || e)); } });
    bR.addEventListener('click', async () => { busy(bR, true); try { jout.value = await mpGuestReply(jin.value); copy(jout); } catch (e) { toast('Could not join', String(e.message || e)); } busy(bR, false); draw0(); });
    const draw0 = () => { status.textContent = MP.status === 'inviting' ? 'Send the invite code to your friend, then paste their reply code below and press Connect.' : MP.status === 'joining' ? 'Send the reply code back to the host; they will connect automatically.' : 'Not connected.'; };
    root.replaceChildren(
      h('div', { class: 'mpcol' }, h('b', { text: 'Host a game' }), inv, h('div', { class: 'row' }, bI, h('button', { text: 'Copy', onclick: () => copy(inv) })), rep, bC),
      h('hr'),
      h('div', { class: 'mpcol' }, h('b', { text: 'Join a game' }), jin, bR, jout, h('div', { class: 'row' }, h('button', { text: 'Copy', onclick: () => copy(jout) }))));
  };
  root._refresh = draw; m.body.append(h('div', { class: 'row' }, h('span', { text: 'Name' }), nm), status, root); draw();
  m.foot.append(h('button', { class: 'primary', text: 'Close', onclick: () => m.close() }));
}
