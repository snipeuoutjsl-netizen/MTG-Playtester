// ---------------------------------------------------------------- symbols
function symEl(code) {
  const up = code.toUpperCase();
  const first = (up.match(/[WUBRG]/) || [''])[0];
  const cls = (up === 'T' ? 's-T' : first ? 's-' + first : '') + (up.includes('/') ? ' s-hyb' : '');
  return h('span', { class: 'sym ' + cls, text: up });
}
function symbols(str) {
  const frag = document.createDocumentFragment();
  const re = /\{([^}]+)\}/g;
  let last = 0, m;
  while ((m = re.exec(str))) {
    if (m.index > last) frag.append(str.slice(last, m.index));
    frag.append(symEl(m[1]));
    last = re.lastIndex;
  }
  if (last < str.length) frag.append(str.slice(last));
  return frag;
}


// Does this permanent enter the battlefield tapped? Call it BEFORE the card is put onto the battlefield.
function etbTapped(c) {
  const none = { tapped: false, why: '' };
  if (!c || c.token) return none;
  const tx = cardText(c).replace(selfNameRe(selfNm(c)), '~');
  const key = norm(c.name);
  if (!tx) return /triome/i.test(c.name) ? { tapped: true, why: 'enters tapped' } : none;
  if (shockLife(c) > 0) return none;       // shocklands ask the player
  const others = state ? state.battlefield.filter(x => isLandName(x.name)) : [];
  for (const raw of tx.split(/(?<=\.)\s+|\n/)) {
    if (!/\benters(?: the battlefield)? tapped\b/i.test(raw)) continue;
    if (/\bif you don't\b|\bmay\b/i.test(raw)) continue;
    const un = raw.match(/unless (.+?)\.?$/i);
    if (!un) return { tapped: true, why: 'enters tapped' };
    const cond = un[1];
    let m;
    if ((m = cond.match(/you control (two|three) or fewer other lands/i))) {
      const n = m[1].toLowerCase() === 'two' ? 2 : 3;
      return others.length > n ? { tapped: true, why: `enters tapped (you control more than ${n} other lands)` } : { tapped: false, why: `entered untapped (${others.length} other land${others.length === 1 ? '' : 's'})` };
    }
    if ((m = cond.match(/you control (two|three) or more other lands/i))) {
      const n = m[1].toLowerCase() === 'two' ? 2 : 3;
      return others.length < n ? { tapped: true, why: `enters tapped (fewer than ${n} other lands)` } : { tapped: false, why: `entered untapped (${others.length} other lands)` };
    }
    if ((m = cond.match(/you control an? ((?:Plains|Island|Swamp|Mountain|Forest)(?: or an? (?:Plains|Island|Swamp|Mountain|Forest))*)/i))) {
      const need = m[1].match(/Plains|Island|Swamp|Mountain|Forest/gi).map(x => x[0].toUpperCase() + x.slice(1).toLowerCase());
      const ok = domainAllTypes() || others.some(x => { const lt = landTypesOf(x.name); return lt.types && lt.types.some(t => need.includes(t)); });
      return ok ? { tapped: false, why: `entered untapped (you control a ${need.join(' or ')})` } : { tapped: true, why: `enters tapped (no ${need.join(' or ')})` };
    }
    return none;   // reveal / other conditions: left untapped, the player can tap it manually
  }
  return none;
}
function applyEtbTapped(c, res) {
  c.tapped = !!res.tapped;
  if (res.why) { log(`${c.name} ${res.why.replace(/^enters/, 'entered')}`); if (res.tapped) toast(`${c.name} enters tapped`, res.why.replace(/^enters tapped\s*/, '') || 'It will untap during your next untap step.'); }
}
function playLand(id, fi) {
  const f=findCard(id); if(!f||f.zone!=='hand'||!(isLandName(f.card.name)||(fi&&mdfcLandFace(f.card))))return;
  if (!canPlayLandNow()) {
    toast(landDropUsed() ? 'Land already played' : 'Wrong phase',
      landDropUsed() ? 'You have already used all your land plays this turn (' + landDropsAllowed() + ').' :
      'Lands can only be played during your main phase when the stack is empty.');
    return;
  }
  snap(); const [c]=state.hand.splice(f.idx,1); state.landsPlayed=(state.landsPlayed||0)+1; state.landPlayedThisTurn=state.landsPlayed>=landDropsAllowed();
  const front=c.name; if(fi) setFace(c,fi);
  enterBattlefield(c,{from:'hand',logMsg:fi?`Played land: ${c.name} (the back face of ${front})`:`Played land: ${c.name}`});
  render();
  if(state.pendingTriggers.length) resolvePendingTrigger();
}
function openShockChoice(id, fetched) {
  const f=findCard(id); if(!f||f.zone!=='battlefield')return; const c=f.card;
  // A played land can be taken back (undo); a fetched or put-onto-the-battlefield land cannot, so closing it just means "enter tapped".
  const m=modal(`${c.name}: enter the battlefield`,{width:500,sticky:true,onCancel:()=>{ if(fetched){ snap(); c.tapped=true; log(`${c.name} entered tapped`); render(); } else { undo(); toast('Land play cancelled','Nothing was paid and the land is back in your hand.'); } }});
  const N=shockLife(c)||2;
  m.body.append(h('div',{class:'ptitle',text:`Would you like to pay ${N} life?`},),
    h('div',{class:'psub',text:`Pay ${N} life to have ${c.name} enter untapped. Otherwise it enters tapped.`}));
  const next=()=>{m.close(); if(state.pendingTriggers.length){const t=state.pendingTriggers.shift(); if(t.kind==='shock')openShockChoice(t.cardId,t.fetched); else openScry(t.n,t.kind==='surveil',t.text);} render();};
  m.foot.append(
    h('button',{text:'Enter tapped',onclick:()=>{snap();c.tapped=true;log(`${c.name} entered tapped`);next();}}),
    fetched?null:h('button',{text:'Cancel — take the land back',title:'Undo playing this land (same as the ✕ or Esc)',onclick:()=>{m.close();undo();toast('Land play cancelled','Nothing was paid and the land is back in your hand.');}}),
    h('button',{class:'primary',text:`Pay ${N} life — enter untapped`,onclick:()=>{snap();state.life-=N;c.tapped=false;log(`${c.name} entered untapped; paid ${N} life`);next();}})
  );
}
let stackPanelDraw=null, stackUI=null;
// The stack lives in a permanent panel on the right (v0.70.0), so it never covers the table. On narrow windows (no right column) it falls back to a floating tray.
let stackBoxShown = true;   // v0.96.16 measured once per frame in layoutPass(): reading offsetParent on every redraw forced a full re-measure
const stackPanelVisible=()=>stackBoxShown;
function buildStack(m, panel){
  if(!stackUI){
    stackUI={ oppName:h('input',{type:'text',placeholder:'Opponent casts… (card name)',style:'flex:1;min-width:0'}),
      oppType:h('select',null,...['','Instant','Sorcery','Creature','Artifact','Enchantment','Planeswalker','Ability'].map(t=>h('option',{value:t,text:t==='Ability'?'triggered/activated ability':(t||'type (optional)')}))) };
  }
  const {oppName,oppType}=stackUI;
  const addOpp=()=>{ const n=oppName.value.trim(); if(!n) return; castOppSpell(n,oppType.value); oppName.value=''; draw(); };
  oppName.onkeydown=e=>{ if(e.key==='Enter') addOpp(); };
  const draw=()=>{
    const box=$('#stackBox'), cnt=$('#stackCount');
    if(!state||state.phase==='idle'){ m.body.replaceChildren(h('div',{class:'muted small',text:'Start a game to use the stack.'})); m.foot.replaceChildren(); if(panel&&box){ box.classList.remove('live'); if(cnt) cnt.textContent=''; } return; }
    const top=state.stack[state.stack.length-1];
    if(panel&&box){ box.classList.toggle('live',state.stack.length>0); if(cnt) cnt.textContent=state.stack.length?String(state.stack.length):''; }
    // v0.99.85 the stack itself is the pile of cards on the table (src/91); this panel keeps only your opponent's tools.
    // The old floating stack window and its list, and the "N on the stack · top: …" summary, are gone.
    m.body.replaceChildren(...[
      state.stack.length?h('div',{class:'muted small',text:'The stack is on the table. Add what your opponent casts in response here.'}):h('div',{class:'muted small',text:'Empty. Add what your opponent casts so you can respond to it.'}),
      h('details',Object.assign({class:'stk-opp'},state.stack.length?{}:{open:true}),h('summary',{text:'Opponent casts something'}),h('div',{class:'setrow'},oppName,oppType,h('button',{text:'Add',onclick:addOpp}))),
      h('div',{class:'pbtns',style:'margin-top:8px'},h('button',{text:'View top 10 of library',onclick:()=>openLibraryManipulation()}))
    ].filter(Boolean));
    m.foot.replaceChildren();
  };
  return draw;
}
function ensureStackPanel(){
  if(stackPanelDraw) return;
  stackPanelDraw=buildStack({body:$('#stackBody'),foot:$('#stackFoot'),close(){}},true);
}
function openStack() {
  // v0.99.56 one stack window only: the panel on the table. "Open the stack" unfolds it; with nothing on the stack it opens the
  // opponent tools (the right column, or the drawer when the phone is upright). The old floating "The Stack" window is gone.
  if(!state||state.phase==='idle')return;
  ensureStackPanel(); stackPanelDraw();
  if (typeof stackMin !== 'undefined' && stackMin) { stackMin = false; drawStackStage(); }
  const st=$('#stackStage');
  if (st && !st.hidden) { st.classList.remove('flash'); void st.offsetWidth; st.classList.add('flash'); return; }
  if (document.documentElement.classList.contains('portrait-ui')) { document.body.classList.add('side-open'); return; }
  const box=$('#stackBox'); if (box) { box.classList.remove('flash'); void box.offsetWidth; box.classList.add('flash'); if(box.scrollIntoView) box.scrollIntoView({block:'nearest',behavior:'smooth'}); }
}
function openLibraryManipulation(want) {
  if(!state)return;
  const n=Math.min(Math.max(1,want||10),state.library.length), order=state.library.slice(0,n);
  const m=modal(`Library — top ${n}${want&&want>n?` (you asked for ${want}; the library has ${n})`:''}`,{width:760,sticky:true});
  const draw=()=>{
    m.body.replaceChildren(h('div',{class:'psub',text:'Inspect and reorder the top of your library. This is useful for Brainstorm, Ponder and similar effects.'}),
      ...order.map((c,i)=>{ const row=h('div',{class:'row'},h('span',{class:'nm'},`${i+1}. ${c.name}`),
        h('button',{text:'Hand',onclick:()=>{snap();const j=state.library.findIndex(x=>x.id===c.id);if(j>=0){state.hand.push(state.library.splice(j,1)[0]);log(`${c.name}: library → hand`);m.close();render();}}}),
        h('button',{text:'Exile',title:'Exile it face up',onclick:()=>{snap();const j=state.library.findIndex(x=>x.id===c.id);if(j>=0){state.exile.push(state.library.splice(j,1)[0]);log(`${c.name}: library → exile`);m.close();render();}}}),
        h('button',{text:'Exile (play)',title:'Exile it and mark it playable this turn (impulse draw effects)',onclick:()=>{snap();const j=state.library.findIndex(x=>x.id===c.id);if(j>=0){const x=state.library.splice(j,1)[0]; x.mayPlayTurn=state.turn; state.exile.push(x);log(`${c.name}: library → exile; you may play it this turn`);m.close();render();}}}),
        h('button',{text:'Graveyard',onclick:()=>{snap();const j=state.library.findIndex(x=>x.id===c.id);if(j>=0){const x=state.library.splice(j,1)[0]; gyPush(x,'library'); log(`${c.name}: library → graveyard`);m.close();render();}}}),
        h('button',{text:'Bottom',onclick:()=>{snap();const j=state.library.findIndex(x=>x.id===c.id);if(j>=0){state.library.push(state.library.splice(j,1)[0]);log(`${c.name}: library → bottom`);m.close();render();}}}),
        h('button',{text:'↑',disabled:i===0,onclick:()=>{[order[i-1],order[i]]=[order[i],order[i-1]];draw();}}),
        h('button',{text:'↓',disabled:i===order.length-1,onclick:()=>{[order[i+1],order[i]]=[order[i],order[i+1]];draw();}})
      ); if(teach('libraryPreview')){row.addEventListener('mouseenter',()=>{showPreview(c); row.classList.add('library-hover');}); row.addEventListener('mouseleave',()=>row.classList.remove('library-hover'));} return row;
      }));
  };
  draw();
  m.foot.append(h('button',{text:'Cancel',onclick:()=>m.close()}),h('button',{class:'primary',text:'Apply order',onclick:()=>{snap();const ids=new Set(order.map(c=>c.id));state.library=order.concat(state.library.filter(c=>!ids.has(c.id)));log(`Reordered top ${order.length} cards`);m.close();render();}}));
}
