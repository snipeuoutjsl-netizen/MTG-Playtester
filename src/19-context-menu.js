// ---------------------------------------------------------------- context menu
const menu = $('#ctxMenu');
function showMenu(x, y, items) {
  menu.replaceChildren();
  for (const it of items) {
    if (it === '-') { menu.append(h('hr')); continue; }
    menu.append(h('button', { text: it.label, onclick: () => { hideMenu(); it.fn(); } }));
  }
  menu.hidden = false;
  const w = menu.offsetWidth, hh = menu.offsetHeight;
  menu.style.left = Math.max(4, Math.min(x, window.innerWidth - w - 4)) + 'px';
  menu.style.top = Math.max(4, Math.min(y, window.innerHeight - hh - 4)) + 'px';
}
function hideMenu() { menu.hidden = true; }
document.addEventListener('click', hideMenu);
document.addEventListener('contextmenu', e => { if (!e.target.closest('.card')) hideMenu(); });
window.addEventListener('blur', hideMenu);

// Finds the first non-mana activated ability ("cost: effect") of a permanent.
const COST_WORDS = /\{[^}]+\}|\bSacrifice\b|\bDiscard\b|\bPay\b|\bExile\b|\bRemove\b|\bReturn\b|\bTap\b|\bPut\b/;
// Split an ability cost into the parts the app can pay itself and the parts you pay by hand.
function parseAbilityCost(cost, short) {
  const out = { tap: false, mana: '', selfSac: false, removeN: 0, removeKind: '', life: 0, byHand: [], comps: [] };
  for (const k of parseCostComps(cost, short)) {
    if (k.k === 'tap') out.tap = true;
    else if (k.k === 'mana') out.mana += k.mana;
    else if (k.k === 'sacSelf') out.selfSac = true;
    else if (k.k === 'removeCounter') { out.removeN = k.n; out.removeKind = k.kind; }
    else if (k.k === 'life') out.life = k.n;
    else if (k.k === 'other') out.byHand.push(k.text);
    else out.comps.push(k);
  }
  return out;
}
function activatedAbilitiesFor(c){
  const tx=cardText(c); if(!tx)return [];
  const nm=cardInfo(c.name)?.name||c.name, short=nm.split(' // ')[0];
  const res=[];
  for(const raw of tx.replace(/,\n/g,', ').split('\n')){
    let line=raw.trim(), boast=false;
    if(/^Boast\s*[\u2014-]\s*/i.test(line)){ line=line.replace(/^Boast\s*[\u2014-]\s*/i,''); boast=true; }   // CR 702.142a: "Boast \u2014 [Cost]: [Effect]" means "[Cost]: [Effect]. Activate only if this creature attacked this turn and only once each turn."
    if(!line || /^(When|Whenever|At)\b/i.test(line) || /^[+−–-]?\d+:/.test(line) || SAGA_CH_RE.test(line)) continue;
    { const eq=line.match(/^Equip\b\s*(?:(legendary creature|[a-z]+ creature)\s+)?((?:\{[^}]+\})+|\u2014.+)$/i);   // Equip (v0.64): a sorcery-speed ability that attaches to a creature you control
      if(eq){ const cs=eq[2].replace(/^\u2014\s*/,'').replace(/\.$/,''), pc=parseAbilityCost(cs,short);
        res.push({cost:'Equip '+eq[2].replace(/^\u2014\s*/,'\u2014 '),effect:`Attach ~ to target ${eq[1]?eq[1].toLowerCase():'creature'} you control. Activate only as a sorcery.`,tap:pc.tap,selfSac:pc.selfSac,mana:pc.mana,removeN:pc.removeN,removeKind:pc.removeKind,life:pc.life,other:pc.byHand.join(', '),comps:pc.comps,ix:res.length,equip:true}); continue; } }
    { const ol=line.match(/^Outlast\s+((?:\{[^}]+\})+)\s*(?:\(.*\))?$/i);   // Outlast (CR 702.107a): "[Cost], {T}: Put a +1/+1 counter on this creature. Activate only as a sorcery."
      if(ol){ const pc=parseAbilityCost(ol[1]+', {T}',short);
        res.push({cost:'Outlast '+ol[1],effect:'Put a +1/+1 counter on ~. Activate only as a sorcery.',tap:pc.tap,selfSac:pc.selfSac,mana:pc.mana,removeN:pc.removeN,removeKind:pc.removeKind,life:pc.life,other:pc.byHand.join(', '),comps:pc.comps,ix:res.length}); continue; } }
    const i=line.indexOf(':'); if(i<1) continue;
    const cost=line.slice(0,i).trim(), effect=line.slice(i+1).trim()+(boast?' Activate only if this creature attacked this turn and only once each turn.':'');
    if(!COST_WORDS.test(cost) || /^(Add\b)/i.test(effect) && /\{T\}/.test(cost) && !/Sacrifice/.test(cost)) continue;
    const pc=parseAbilityCost(cost,short);
    res.push({cost:boast?'Boast \u2014 '+cost:cost,effect,tap:pc.tap,selfSac:pc.selfSac,mana:pc.mana,removeN:pc.removeN,removeKind:pc.removeKind,life:pc.life,other:pc.byHand.join(', '),comps:pc.comps,ix:res.length});
  }
  return res;
}
function activatedAbilityFor(c){ return activatedAbilitiesFor(c)[0]||null; }
function abilityReady(c, ab) {   // can this particular ability be activated right now? returns '' or a reason string for the outline tooltip
  if (ab.tap && (c.tapped || isSick(c))) return 'tap';
  if (ab.removeN) { const cc = typeof c.counters === 'number' ? { plus: c.counters, minus: 0 } : (c.counters || {}); if ((cc[ab.removeKind] || 0) < ab.removeN) return 'counters'; }
  if (ab.life && state.life < ab.life) return 'life';
  if (ab.comps && ab.comps.length && compsFeasible(ab.comps, c.id)) return 'cost';
  const rm = ab.effect.match(/Activate (?:this ability )?only ([^.]+)\./i);
  if (rm && staticCheck(rm[1].trim(), c).ok === false) return 'restriction';
  if (ab.mana) { const plan = manaPaymentAllocation(manaCostParts(ab.mana), state.manaPool || {}, manaSources(), null); if (!plan.ok) return 'mana'; }
  return '';
}
function activateAbility(id, ack, ix, modes){ /* ack = restriction already acknowledged; ix = which ability on the card */
  const f=findCard(id); if(!f||f.zone!=='battlefield')return;
  if(isLandName(f.card.name) && fetchInfo(f.card)){ if(f.card.tapped){toast('Cannot fetch','Fetch lands have {T} in their cost, so the land must be untapped.');return;} openFetch(f.card); return; }
  { const lk=abilityLockedBy(f.card,false); if(lk){ toast("Ability can't be activated", `${lk.name} says activated abilities of sources named “${lk.chosen}” can't be activated.`); return; } }
  let ab=activatedAbilitiesFor(f.card)[ix||0]; if(!ab)return;
  if(splitSecondOn() && !ab.mana){ toast('Split second','A spell with split second is on the stack: only mana abilities can be activated until it resolves (rule 702.61).'); return; }
  { const md=parseModal(ab.effect); if(md && modes===undefined){ openModeChoice(f.card.name, md, idxs=>activateAbility(id,ack,ix,idxs), ab.mana); return; } if(md) ab={...ab, effect:modalText(md,modes)}; }
  if(!state || state.phase!=='play' || holdForTriggers() || state.discarding || state.step===0 || state.step===CLEANUP){ toast('Cannot activate now', state && holdForTriggers() ? 'A triggered ability is waiting to go on the stack. Press Continue and it resolves first, then you get priority.' : 'You can only activate abilities when you have priority (not during untap or cleanup).'); return; }
  if(ab.tap && f.card.tapped){toast('Ability cannot be activated','This ability requires the permanent to be untapped.');return;}
  if(ab.tap && isSick(f.card) && !ack){ softWarn(`${f.card.name}: summoning sick`, 'Summoning sickness: this creature came under your control this turn, so it cannot use abilities with {T} in the cost (and it has no haste). If a card effect gave it haste, you may continue.', ()=>activateAbility(id,true,ix)); return; }
  if(ab.removeN && abilityReady(f.card,ab)==='counters'){ toast('Cannot pay the cost',`This ability needs you to remove ${ab.removeN} ${ab.removeKind==='plus'?'+1/+1':'−1/−1'} counter${ab.removeN===1?'':'s'} from ${f.card.name}, and it does not have enough.`); return; }
  if(ab.life && state.life<ab.life){ toast('Cannot pay the cost',`You cannot pay ${ab.life} life.`); return; }
  const rm=ab.effect.match(/Activate (?:this ability )?only ([^.]+)\./i), chk=rm?staticCheck(rm[1].trim(), f.card):{ok:true};
  if(chk.ok!==true && !ack){ softWarn(`${f.card.name}: restriction`, chk.why, ()=>activateAbility(id,true,ix)); return; }
  const go=(picked,manaIds,picks)=>{
    const g=findCard(id); if(!g||g.zone!=='battlefield') return;
    const targets=Array.isArray(picked)&&picked.length?picked:null, target=targets&&targets[0].kind==='player'?targets[0].id:undefined;
    snap();
    const c=g.card;
    if(manaIds) tapManaIds(manaIds);
    if(ab.tap) c.tapped=true;
    markAbilityUsed(c);
    if(picks&&picks.length) applyCostPicks(c,picks,0);
    if(ab.life){ state.life-=ab.life; log(`${c.name}: paid ${ab.life} life as a cost`); }
    if(ab.removeN){ addCounter(c.id,-ab.removeN,ab.removeKind); log(`${c.name}: removed ${ab.removeN} counter${ab.removeN===1?'':'s'} as a cost`); }
    // Costs are paid as the ability is activated, so a sacrificed permanent is already gone when the ability resolves.
    if(ab.selfSac){ log(`${c.name}: sacrificed as a cost`); leaveBattlefield(c,'graveyard'); }
    const obj={ability:true,id:state.nextId++,name:`${c.name} — ability`,sourceId:ab.selfSac?null:c.id,sourceName:c.name,cost:ab.cost,text:ab.effect,target,targets};
    // v0.86 rule 605.3b: a mana ability (no target, adds mana, not a loyalty ability) does not use the stack: it resolves the moment it is activated, so Black Lotus works.
    if(!targets && /^Add\b/i.test(String(ab.effect).trim())){
      log(`Activated ${c.name}: ${ab.cost} — a mana ability: it resolves immediately and does not use the stack (rule 605.3b)`);
      if(ab.other) toast('Other costs',`Pay the rest of the cost yourself: ${ab.other}.`);
      render(); openAbilityEffect(obj,()=>{ render(); }); return;
    }
    state.stack.push(obj); state.priority={active:true,passed:false};
    log(`Activated ${c.name}: ${ab.cost}${targets?` (target: ${targets.map(t=>t.name).join(', ')})`:''} — ability on the stack`);
    if(ab.other) toast('Other costs',`Pay the rest of the cost yourself: ${ab.other}.`);
    render(); openStack();
  };
  const payThen=target=>{
    { const why=compsFeasible(ab.comps||[],f.card.id); if(why){ toast('Cannot pay the cost',why); return; } }
    gatherCosts({id:f.card.id,name:f.card.name,ability:true},ab.comps||[],picks=>{
      if(!ab.mana){ go(target,null,picks); return; }
      const skip=ab.tap?f.card.id:undefined;
      if(teach('stackGuidance')){ openManaPayment(f.card,ids=>go(target,ids,picks),ab.mana,'Pay and activate',skip); return; }
      const srcs=manaSources().filter(x=>x.card.id!==skip);
      const plan=manaPaymentAllocation(manaCostParts(ab.mana),state.manaPool||{},srcs,null);
      if(!plan.ok){ toast('Cannot pay the cost','Not enough mana.'); return; }
      state.manaPool=plan.pool; go(target,plan.used.map(i=>srcs[i].card.id),picks);
    });
  };
  { const specs=parseTargetSpecs(ab.effect);
    if(specs.length) chooseTargets(f.card.name,specs,picked=>payThen(picked),{srcId:f.card.id}); else payThen(null); }
}
function showCardMenu(c, zone, x, y) {
  if (!state) return;
  const items = [];
  if (zone === 'battlefield') {
    if (isManaPermanent(c) && !c.tapped && !(isLandName(c.name) && fetchInfo(c))) items.push({ label: 'Tap for mana…', fn: () => tapForMana(c.id) });
    else { items.push({ label: c.tapped ? 'Untap' : 'Tap', fn: () => toggleTap(c.id) }); if (c.tapped) items.push({ label: 'Untap (a card effect untaps it)', fn: () => untapByEffect(c.id) }); }
    if (isLandName(c.name) && !c.tapped) items.push({ label: 'Tap without floating mana', fn: () => { snap(); c.tapped=true; render(); } });
    if (permZone(c) === 'creatures') items.push({ label: isSick(c) ? 'Remove summoning sickness (it has haste / was untapped)' : 'Mark as summoning sick', fn: () => { snap(); c.sickManual = isSick(c) ? 'off' : 'on'; render(); } });
    if (permZone(c) === 'creatures') { items.push({ label: 'Until end of turn: +1/+1', fn: () => addTempPT(c.id, 1, 1) }); items.push({ label: 'Until end of turn: +2/+2', fn: () => addTempPT(c.id, 2, 2) }); items.push({ label: 'Until end of turn: \u22121/\u22121', fn: () => addTempPT(c.id, -1, -1) }); if (fxOn(c, 'pt').length) items.push({ label: 'Clear temporary power/toughness changes', fn: () => { snap(); state.fx = state.fx.filter(e => !(e.kind === 'pt' && e.targetId === c.id)); render(); } }); }
    if (isTransformCard(c)) { const p = faceParent(c); items.push({ label: c.face ? `Transform back into ${p.fc[0].name}` : `Transform into ${p.fc[1].name}`, fn: () => transformPerm(c.id) }); }
    if (isEquipmentCard(c) || isAuraCard(c)) { items.push({ label: c.att ? 'Attach to a different permanent…' : 'Attach to…', fn: () => openAttachPicker(c) }); if (c.att) items.push({ label: 'Unattach', fn: () => unattach(c.id) }); }
    items.push({ label: 'Add +1 counter', fn: () => addCounter(c.id, 1, 'plus', true) });
    items.push({ label: 'Remove +1 counter', fn: () => addCounter(c.id, -1, 'plus', true) });
    items.push({ label: 'Add −1 counter', fn: () => addCounter(c.id, 1, 'minus', true) });
    items.push({ label: 'Remove −1 counter', fn: () => addCounter(c.id, -1, 'minus', true) });
    if (isPlaneswalker(c)) { items.push({ label: 'Loyalty abilities…', fn: () => openLoyalty(c) }); items.push({ label: 'Loyalty +1 (manual)', fn: () => adjustLoyalty(c.id, 1) }); items.push({ label: 'Loyalty −1 (manual)', fn: () => adjustLoyalty(c.id, -1) }); }
    else if(isLandName(c.name) && fetchInfo(c)) { /* the Fetch… item below performs the search */ }
    else for(const ab of activatedAbilitiesFor(c)) items.push({ label: `Activate ability: ${ab.cost}`, fn: () => activateAbility(c.id, false, ab.ix) });
    items.push('-');
  }
  if (zone === 'battlefield' && fetchInfo(c)) { items.push({ label: c.tapped ? 'Fetch… (needs an untapped land)' : 'Activate: sacrifice and fetch…', fn: () => c.tapped ? toast('Cannot fetch', 'Fetch lands have {T} in their cost, so the land must be untapped.') : openFetch(c) }); items.push('-'); }
  if (zone === 'hand') {
    if (isLandName(c.name)) items.push({ label: 'Play land', fn: () => playLand(c.id) });
    else if (mdfcLandFace(c)) { items.push({ label: `Play ${mdfcLandFace(c).name} (land)`, fn: () => playLand(c.id, 1) }); items.push({ label: `Cast ${c.name.split(' // ')[0]} — put on stack`, fn: () => castSpell(c.id) }); }
    else if (isSpellCard(c) || isInstantSpeed(c)) items.push({ label: 'Cast — put on stack', fn: () => castSpell(c.id) });
    else items.push({ label: 'Play to battlefield', fn: () => {
      if (!canPlaySorcerySpeedNow()) { toast('Wrong phase', 'This card can only be played during your main phase.'); return; }
      moveCard(c.id, 'battlefield');
    }});
    { const pl = plotFor(c); if (pl) items.push({ label: `Plot (${pl.cost})`, title: 'Pay the plot cost and exile it; cast it free on a later turn at sorcery speed', fn: () => stashCard(c.id, 'plot') }); const ft = foretellFor(c); if (ft) items.push({ label: `Foretell ({2})`, title: `Pay {2} and exile it; cast it later for ${ft.castCost}`, fn: () => stashCard(c.id, 'foretell') }); }
    { const su = suspendFor(c); if (su) items.push({ label: `Suspend ${su.n} (${su.cost})`, fn: () => suspendCard(c.id) }); }
    { const nj = ninjutsuFor(c); if (nj) { const w = ninjutsuWhy(c); items.push({ label: `Ninjutsu (${nj.cost})` + (w ? ' \u2014 not now' : ''), title: w || 'Return an unblocked attacker and put this onto the battlefield tapped and attacking', fn: () => activateNinjutsu(c.id) }); } }
    { const cy = cyclingFor(c); if (cy) items.push({ label: `Cycle (${cy.label.replace(/^Cycling\s*(?:\u2014\s*)?/, '') || 'free'})`, fn: () => cycleCard(c.id) }); }
  }
  if (c.token) {
    items.push({ label: 'Remove token', fn: () => moveCard(c.id, 'graveyard') });
  } else {
    const labels = { hand: 'Return to hand', battlefield: 'Put onto battlefield', graveyard: 'Put in graveyard', exile: 'Exile' };
    for (const z of ['hand', 'battlefield', 'graveyard', 'exile']) {
      if (z !== zone && !(zone === 'hand' && z === 'battlefield')) items.push({ label: labels[z], fn: () => moveCard(c.id, z) });
    }
    items.push('-');
    items.push({ label: 'Top of library', fn: () => moveCard(c.id, 'library', 'top') });
    items.push({ label: 'Bottom of library', fn: () => moveCard(c.id, 'library', 'bottom') });
  }
  if (!c.token && cardInfo(c.name)) { items.push('-'); items.push({ label: 'How the app reads this card…', fn: () => openCardReading(c.name) }); }
  showMenu(x, y, items);
}

