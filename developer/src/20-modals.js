// ---------------------------------------------------------------- modals
function modal(title, opts) {
  opts = opts || {};
  const root = $('#modalRoot');
  const body = h('div', { class: 'mbody' });
  const foot = h('footer');
  // Native append() turns null into the text "null": make modal bodies skip empty children.
  for (const el of [body, foot]) { const nativeAppend = el.append.bind(el); el.append = (...kids) => nativeAppend(...kids.flat(Infinity).filter(k => k != null && k !== false)); }
  const m = h('div', { class: 'modal', style: `width:${opts.width || 560}px` },
    h('header', null, h('span', { text: title }), h('button', { text: '✕', hidden: !!opts.noClose, title: opts.onCancel ? 'Cancel and go back' : 'Close', onclick: () => { close(); if (opts.onCancel) opts.onCancel(); } })),
    body, foot);
  if (opts.noClose) m.dataset.noclose = '1';
  const back = h('div', { class: 'backdrop' + (opts.dock ? ' dock' : '') + (opts.resolve ? ' resolve' : '') }, m);
  // v0.99.66 a resolving effect's choices live inside the stack window (drawStackStage moves this panel there), so the card being resolved,
  // the stack behind it and the choices are one window; when the stack window is not shown it stays a floating window as before
  if (opts.resolve) { m.classList.add('res-panel'); m._home = back; setTimeout(() => { try { drawStackStage(); } catch (e) { /* no table */ } }, 0); }
  back.addEventListener('mousedown', e => { if (e.target === back && !opts.sticky && !opts.dock) close(); });
  root.append(back);
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    back.remove(); if (m.isConnected) m.remove();
    if (opts.resolve) setTimeout(() => { try { drawStackStage(); } catch (e) { /* no table */ } }, 0);
    if (state && state.halfChosen) setTimeout(checkHalfAbandon, 80);
    if (opts.onClose) opts.onClose();
  }
  return { body, foot, close, el: m };
}

// Deck editor
// Dropping a decklist file anywhere on the app opens the importer with it loaded (v0.70.2).
document.addEventListener('dragover', ev => { if (ev.dataTransfer && [...ev.dataTransfer.types].includes('Files')) ev.preventDefault(); });
document.addEventListener('drop', async ev => {
  const fs = ev.dataTransfer && ev.dataTransfer.files; if (!fs || !fs.length) return;
  ev.preventDefault();
  if (document.querySelector('#modalRoot .modal, #stackStage .modal.res-panel')) { toast('Finish this window first', 'Close the open window, then drop the file again.'); return; }
  const f = [...fs].find(x => /\.(txt|dec|dek|text)$/i.test(x.name) || /^text\//.test(x.type));
  if (!f) { toast('Not a decklist', 'Drop a .txt decklist file.'); return; }
  openDeckEditor({ blank: true, text: (await f.text()).replace(/\r\n?/g, '\n'), name: f.name.replace(/\.[^.]+$/, '').replace(/_+/g, ' ').trim() });
});
// opts.blank = a clean importer (nothing from the last deck); opts.text / opts.name = a decklist that was just loaded from a file.
function openDeckEditor(opts) {
  opts = opts && !opts.target ? opts : {};
  const decks = loadDecks();
  const curName = opts.blank ? null : currentDeckName();
  const nameIn = h('input', { type: 'text', placeholder: 'Deck name', value: curName || opts.name || '' });
  const ta = h('textarea', { spellcheck: 'false', placeholder: '4 Lightning Bolt\n20 Mountain\n...\n\nSideboard\n3 Smash to Smithereens' });
  ta.value = opts.text != null ? opts.text : (curName && decks[curName] ? decks[curName].text : '');
  const info = h('div', { class: 'small', style: 'margin-top:8px' });
  const m = modal(opts.blank ? 'Import a new deck' : 'Import / edit deck', { width: 640 });
  // Load decklists from .txt files (v0.70.2): pick a file, or drop one on this window. One file fills the editor; several are saved as one deck each.
  const loadFiles = async files => {
    const list = [...files].filter(f => /\.(txt|dec|dek|text)$/i.test(f.name) || /^text\//.test(f.type));
    if (!list.length) { toast('Not a decklist', 'Choose a .txt file (an MTGO, Arena or plain-text decklist).'); return; }
    const nm = f => f.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
    if (list.length === 1) { const t = await list[0].text(); ta.value = t.replace(/\r\n?/g, '\n'); nameIn.value = nm(list[0]); updateInfo(); toast('Decklist loaded', `${list[0].name} is in the box. Check it and press Save.`); return; }
    const all = loadDecks(); let last = '';
    for (const f of list) { const t = (await f.text()).replace(/\r\n?/g, '\n'); if (!parseDeck(t).main.length) continue; all[nm(f)] = Object.assign({}, all[nm(f)] || {}, { text: t, updated: Date.now() }); last = nm(f); }
    if (!last) { toast('Nothing imported', 'None of those files looked like a decklist.'); return; }
    saveDecks(all); lsSet('mtgpt.current', last); refreshDeckSelect(); m.close(); render(); prepareImages(); toast('Decks imported', `${list.length} files added. “${last}” is selected.`);
  };
  m.el.addEventListener('dragover', ev => { if (ev.dataTransfer && [...ev.dataTransfer.types].includes('Files')) ev.preventDefault(); });
  m.el.addEventListener('drop', ev => { if (ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files.length) { ev.preventDefault(); ev.stopPropagation(); loadFiles(ev.dataTransfer.files); } });
  const fileBtn = h('button', { text: 'Load .txt file…', title: 'Choose one or more decklist files. You can also drag them onto this window.', onclick: () => { const inp = h('input', { type: 'file', accept: '.txt,.dec,.dek,text/plain', multiple: true, style: 'display:none' }); inp.addEventListener('change', () => { const fs = [...inp.files]; inp.remove(); if (fs.length) loadFiles(fs); }); document.body.append(inp); inp.click(); } });

  function updateInfo() {
    const d = parseDeck(ta.value);
    const unknown = cardCount ? [...new Set([...d.main, ...d.side].filter(x => !resolve(x.name)).map(x => x.name))] : [];
    info.replaceChildren(
      h('div', { text: `Main: ${sum(d.main)} cards (${d.main.length} unique) · Sideboard: ${sum(d.side)}` }),
      cardCount
        ? (unknown.length ? h('div', { class: 'bad', text: 'Not found in card data: ' + unknown.join(', ') }) : (d.main.length ? h('div', { class: 'ok', text: 'All cards found in card data.' }) : null))
        : h('div', { class: 'muted', text: 'Load card data to check names, see card text, and detect lands.' }),
      (() => { const cm = d.main.filter(x => x.cmd); return cm.length ? h('div', { class: 'ok', text: 'Commander: ' + cm.map(x => x.name).join(' + ') + ' (this deck is listed under Commander mode)' }) : (gameMode() === 'commander' ? h('div', { class: 'bad', text: 'No commander yet: put it under a “Commander” heading.' }) : null); })(),
      h('div', { class: 'muted', text: 'Tip: put a “Sideboard” line before your sideboard (or leave one blank line).' })
    );
  }
  ta.addEventListener('input', updateInfo);

  m.body.append(h('div', { class: 'small muted', text: 'Deck name' }), nameIn, h('div', { class: 'small muted', style: 'margin-top:8px', text: 'Decklist (MTGO, Arena or plain text)' }), ta, info);
  m.foot.append(
    fileBtn,
    h('button', { text: 'New deck', onclick: () => { nameIn.value = ''; ta.value = ''; updateInfo(); nameIn.focus(); } }),
    h('button', { text: 'Load sample', onclick: () => { ta.value = SAMPLE; if (!nameIn.value.trim()) nameIn.value = 'Green Domain Stirrings (sample)'; updateInfo(); } }),
    curName && decks[curName] ? h('button', { class: 'danger', text: 'Delete deck', onclick: async () => {
      if (!(await appAsk('Delete deck', `Delete "${curName}"? This cannot be undone.`, 'Delete', true))) return;
      delete decks[curName]; saveDecks(decks); clearDeckArt(curName); lsSet('mtgpt.current', null);
      refreshDeckSelect(); m.close(); render();
    } }) : null,
    h('button', { text: 'Cancel', onclick: () => m.close() }),
    h('button', { class: 'primary', text: 'Save', onclick: () => {
      const name = nameIn.value.trim();
      if (!name) { appNotice('No name', 'Give the deck a name.'); nameIn.focus(); return; }
      const d = parseDeck(ta.value);
      if (!d.main.length) { appNotice('Empty decklist', 'The decklist is empty.'); return; }
      const all = loadDecks();
      const keepSb = all[name] && all[name].text === ta.value ? all[name].sb : undefined;   // editing the list itself discards any sideboard changes
      all[name] = Object.assign({}, all[name] || {}, { text: ta.value, updated: Date.now() }); if (keepSb) all[name].sb = keepSb; else delete all[name].sb;
      saveDecks(all);
      lsSet('mtgpt.current', name);
      refreshDeckSelect();
      m.close(); render();
      prepareImages();
    } })
  );
  updateInfo();
  nameIn.focus();
}

// Zone viewer (library search, graveyard, exile, sideboard)
function openZone(zone) {
  if (!state) return;
  const names = { library: 'Library', graveyard: 'Graveyard', exile: 'Exile', sideboard: 'Sideboard', hand: 'Hand', command: 'Command zone' };
  // v0.99.49 just looking through the library no longer shuffles it (that undid scry and other ordering); taking a card out
  // of it ticks "Shuffle when closed", since a search ends with a shuffle (CR 701.23 / 701.20).
  const shuffleChk = h('input', { type: 'checkbox', checked: false });
  let libOrder = false;
  const m = modal(names[zone], {
    width: 680,
    onClose: () => {
      if (zone === 'library' && shuffleChk.checked) {
        snap(); shuffleLib(); log('Searched library and shuffled'); render();
      }
    }
  });
  function draw() {
    m.body.replaceChildren();
    if (zone === 'graveyard') {
      const d = deliriumSummary();
      const box = h('div', { class: 'delirium-box' },
        h('div', { class: 'delirium-total' }, h('b', { text: String(d.total) }), h('span', { text: ' card types in graveyard' })),
        h('div', { class: 'delirium-types' })
      );
      const typeBox = box.querySelector('.delirium-types');
      const order = ['Creature','Artifact','Enchantment','Instant','Sorcery','Planeswalker','Land','Battle','Kindred','Tribal'];
      for (const t of order) if (d.counts.has(t)) typeBox.append(h('div', { class: 'delirium-type' }, h('span', { text: t }), h('b', { text: String(d.counts.get(t)) })));
      m.body.append(box);
    }
    let list = state[zone].slice();
    if (zone === 'library') m.body.append(h('div', { class: 'row lib-order' }, h('span', { class: 'muted small', text: 'Show:' }),
      h('button', { class: libOrder ? '' : 'primary', text: 'A–Z', title: 'Sorted by name, like searching for a card', onclick: () => { libOrder = false; draw(); } }),
      h('button', { class: libOrder ? 'primary' : '', text: 'Library order (top first)', title: 'The real order: the first card is the one you draw next, the last is the bottom card', onclick: () => { libOrder = true; draw(); } })));
    if ((zone === 'library' && !libOrder) || zone === 'sideboard') list.sort((a, b) => a.name.localeCompare(b.name));
    else if (zone === 'library') { /* top first, as stored */ }
    else list.reverse();
    if (!list.length) m.body.append(h('div', { class: 'muted', text: 'Empty.' }));
    for (const c of list) {
      const info = cardInfo(c.name);
      const row = h('div', { class: 'row' },
        h('span', { class: 'nm' }, c.name, ' ', info && info.mc ? symbols(info.mc) : ''),
        h('span', { class: 'muted small', text: info ? info.t.split(' // ')[0] : '' }),
        c.timeCounters > 0 ? h('span', { class: 'ok', title: 'Suspended: one time counter is removed at each of your upkeeps', text: `\u23F3 ${c.timeCounters} time counter${c.timeCounters === 1 ? '' : 's'}` }) : null
      );
      const act = (label, to, pos) => h('button', { text: label, onclick: () => {
        if (zone === 'library' && to !== 'library') shuffleChk.checked = true;
        moveCard(c.id, to, pos);
        if (to === 'hand') { /* keep window open for multi-pick */ }
        draw();
      } });
      if(teach('libraryPreview')) row.addEventListener('mouseenter', () => showPreview(c));
      if (zone === 'command' && c.isCommander) row.append(h('button', { class: 'primary', text: `Cast${(c.cmdCasts || 0) ? ' (+{' + 2 * c.cmdCasts + '} tax)' : ''}`, title: 'Cast your commander from the command zone (CR 903.8): it costs {2} more for each time you have cast it from there', onclick: () => { m.close(); castFromCommand(c.id); } }));
      if (zone === 'exile' && mayPlayNow(c) && !(c.mayCastOnly && isLandName(c.name))) row.append(h('button', { class: 'primary', text: isLandName(c.name) ? 'Play land' : 'Cast', title: 'You may play this card this turn (it was exiled with permission)', onclick: () => { m.close(); playFromExile(c.id); } }));
      if (zone === 'exile' && c.freeCastTurn === state.turn && !isLandName(c.name)) row.append(h('button', { class: 'primary', text: 'Cast free (this turn)', title: 'An effect lets you cast this exiled card without paying its mana cost until end of turn', onclick: () => { m.close(); suspendCastFree(c.id, null, 'Free cast'); } }));
      if (zone === 'exile' && c.prepCopy !== undefined && preparedCastable(c)) row.append(h('button', { class: 'primary', text: `Cast (prepared by ${c.prepSource})`, title: 'A copy of a prepared creature\'s spell: cast it for its own mana cost, with its normal timing. Casting it unprepares the creature (CR 722.3c).', onclick: () => { m.close(); castPrepared(c); } }));
      if (zone === 'exile' && warpCastable(c)) row.append(h('button', { class: 'primary', text: 'Cast (warped earlier)', title: 'This card was exiled by warp: you may cast it from exile on a later turn, for its normal cost', onclick: () => { m.close(); castFromExile(c.id); } }));
      if (zone === 'exile' && stashReady(c)) row.append(h('button', { class: 'primary', text: c.plotted ? 'Cast free (plotted)' : 'Cast (foretold)', title: c.plotted ? 'You plotted this on an earlier turn: cast it without paying its mana cost, at sorcery speed' : 'You foretold this on an earlier turn: cast it for its foretell cost', onclick: () => { m.close(); castFromExile(c.id); } }));
      if (zone === 'exile' && c.onAdv) row.append(h('button', { class: 'primary', text: 'Cast creature', title: 'This card was exiled on an adventure: you may cast it from exile', onclick: () => { m.close(); castFromExile(c.id); } }));
      if (zone === 'graveyard' && gyLandPlayable(c)) row.append(h('button', { class: 'primary', text: 'Play land', title: 'You may play lands from your graveyard (uses a land drop)', onclick: () => { m.close(); playLandFromGy(c.id); } }));
      if (zone === 'graveyard') for (const ga of gyAbilitiesFor(c)) row.append(h('button', { class: 'primary', text: ga.label, title: ga.kind === 'encore' ? 'Exile it from your graveyard: create a hasty token copy that attacks this turn and is sacrificed at the end step (sorcery speed)' : ga.kind === 'scavenge' ? 'Exile it from your graveyard: put +1/+1 counters equal to its power on target creature (sorcery speed)' : ga.kind === 'unearth' ? 'Return it to the battlefield with haste; exile it at the next end step (sorcery speed)' : `Exile it from your graveyard and create a ${ga.kind === 'embalm' ? 'white' : 'black 4/4'} Zombie token copy (sorcery speed)`, onclick: () => { m.close(); useGyAbility(c.id, ga.kind); } }));
      if (zone === 'graveyard') { const go = gyCastOptions(c); if (go.length) row.append(h('button', { class: 'primary', text: go.length > 1 ? 'Cast…' : (go[0].kind === 'aftermath' ? 'Cast ' + (cardInfo(c.name).fc[1].name) : go[0].kind === 'escape' ? 'Escape' : 'Flashback'), title: go.map(x => x.label).join('\n'), onclick: () => { m.close(); castFromGraveyard(c.id); } })); }
      if (zone !== 'hand') row.append(act('Hand', 'hand'));
      row.append(act('Play', 'battlefield'));
      if (zone !== 'library') { row.append(act('Top', 'library', 'top')); row.append(act('Bottom', 'library', 'bottom')); }
      else row.append(act('Top', 'library', 'top'));
      if (zone !== 'graveyard') row.append(act('GY', 'graveyard'));
      if (zone !== 'exile') row.append(act('Exile', 'exile'));
      m.body.append(row);
    }
  }
  draw();
  if (zone === 'library') m.foot.append(h('label', { class: 'chk' }, shuffleChk, ' Shuffle when closed'));
  m.foot.append(h('button', { class: 'primary', text: 'Close', onclick: () => m.close() }));
}

function openScry(n, surveil=false, srcText='', onDone=null) {
  if(!state)return;
  const want=n; n=Math.max(1,Math.min(n,state.library.length)); if(!state.library.length){ log(`${surveil?'Surveil':'Scry'} ${want}: library is empty`); toast(`${surveil?'Surveil':'Scry'} ${want}`,'Your library is empty, so there is nothing to look at.'); if(onDone) onDone(); return; }
  const top=state.library.slice(0,n);
  const word=surveil?'Surveil':'Scry', outName=surveil?'graveyard':'bottom of library';
  // two ordered lists of indexes into `top`: cards that stay on top (first = top card) and cards that leave
  let keep=top.map((_,i)=>i), out=[];
  const m=modal(`${word} ${want}`,{width:600,sticky:true,noClose:true});
  const move=(list,i,d)=>{ const k=list.indexOf(i), t=k+d; if(t<0||t>=list.length)return; [list[k],list[t]]=[list[t],list[k]]; draw(); };
  const send=(i,toOut)=>{ const from=toOut?keep:out, to=toOut?out:keep; from.splice(from.indexOf(i),1); to.push(i); draw(); };
  const cardRow=(i,list,isKeep,pos)=>{
    const c=top[i], info=cardInfo(c.name);
    const row=h('div',{class:'row sv-row'},
      h('span',{class:'sv-pos',text:isKeep?(pos===0?'TOP':String(pos+1)):'—'}),
      h('span',{class:'nm'},c.name,' ',info&&info.mc?symbols(info.mc):''),
      list.length>1?h('button',{class:'sv-mv',text:'↑',title:'Move up',disabled:pos===0,onclick:()=>move(list,i,-1)}):null,
      list.length>1?h('button',{class:'sv-mv',text:'↓',title:'Move down',disabled:pos===list.length-1,onclick:()=>move(list,i,1)}):null,
      h('button',{class:isKeep?'':'primary',text:isKeep?(surveil?'Put in graveyard':'Put on bottom'):'Keep on top',onclick:()=>send(i,isKeep)}));
    row.addEventListener('mouseenter',()=>showPreview(c)); return row;
  };
  function draw(){
    m.body.replaceChildren();
    if(srcText) m.body.append(h('div',{class:'sv-src',text:srcText}));
    { const nIn=h('input',{type:'number',min:'1',max:'99',value:String(want),style:'width:64px'}); let moved=false; nIn.addEventListener('change',()=>{ const v=Math.max(1,parseInt(nIn.value,10)||1); if(v!==want&&!moved){ moved=true; m.close(); openScry(v,surveil,srcText,onDone); } });
      m.body.append(h('div',{class:'row'},h('span',{class:'nm',text:`Cards to ${word.toLowerCase()}:`}),nIn,h('span',{class:'muted small',text:'Change it if an effect makes you look at more or fewer cards.'}))); }
    m.body.append(h('div',{class:'psub sv-rule',text:surveil
      ? `Look at the top ${n===1?'card':n+' cards'} of your library. Put any number of them into your graveyard and the rest back on top in any order.`
      : `Look at the top ${n===1?'card':n+' cards'} of your library. Put any number of them on the bottom and the rest back on top in any order.`}));
    if(n<want) m.body.append(h('div',{class:'muted small',text:`Your library only has ${n} card${n===1?'':'s'}, so you look at all of them.`}));
    m.body.append(h('div',{class:'sv-head'},h('b',{text:keep.length?`Stay on top (${keep.length})`:'Stay on top'}),h('span',{class:'muted small',text:keep.length>1?' — first in the list is drawn first':''})));
    if(keep.length) keep.forEach((i,p)=>m.body.append(cardRow(i,keep,true,p))); else m.body.append(h('div',{class:'muted small sv-empty',text:'Nothing — every card is leaving.'}));
    m.body.append(h('div',{class:'sv-head'},h('b',{text:out.length?`Going to the ${outName} (${out.length})`:`Going to the ${outName}`})));
    if(out.length) out.forEach((i,p)=>m.body.append(cardRow(i,out,false,p))); else m.body.append(h('div',{class:'muted small sv-empty',text:'Nothing — all cards stay on top.'}));
    confirm.textContent = out.length ? `Confirm — ${out.length} to the ${outName}` : 'Confirm — keep all on top';
  }
  const confirm=h('button',{class:'primary',onclick:()=>{
    snap(); state.library.splice(0,n);
    const k=keep.map(i=>top[i]), o=out.map(i=>top[i]);
    if(surveil){ state.library=[...k,...state.library]; o.forEach(x=>gyPush(x,'library')); log(`Surveil ${n}: ${k.length} stay on top${o.length?`; ${o.map(x=>x.name).join(', ')} to the graveyard`:''}`); }
    else { state.library=[...k,...state.library,...o]; log(`Scry ${n}: ${k.length} stay on top${o.length?`; ${o.length} to the bottom`:''}`); }
    m.close(); render(); if(onDone) onDone();
  }});
  m.foot.append(confirm);
  draw(); showPreview(top[0]);
}

function openToken() {
  if (!state) return;
  const name = h('input', { type: 'text', value: 'Token' });
  const pt = h('input', { type: 'text', placeholder: 'e.g. 1/1' });
  const m = modal('Create token', { width: 360 });
  m.body.append(h('div', { class: 'small muted', text: 'Name' }), name, h('div', { class: 'small muted', style: 'margin-top:8px', text: 'Power/toughness (optional)' }), pt);
  const go = () => { makeToken(name.value.trim() || 'Token', pt.value.trim()); m.close(); };
  [name, pt].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') go(); }));
  m.foot.append(h('button', { text: 'Cancel', onclick: () => m.close() }), h('button', { class: 'primary', text: 'Create', onclick: go }));
  name.select();
}


function openImages() {
  const m = modal('Card images', { width: 560, onClose: () => { imgUi = null; } });
  const showChk = h('input', { type: 'checkbox' }); showChk.checked = showImages;
  const autoChk = h('input', { type: 'checkbox' }); autoChk.checked = autoImages;
  showChk.addEventListener('change', () => { showImages = showChk.checked; lsSet('mtgpt.showImages', showImages); if (showImages) prepareImages(); render(); });
  autoChk.addEventListener('change', () => { autoImages = autoChk.checked; lsSet('mtgpt.autoImages', autoImages); if (autoImages) maybeAutoDownload(); });
  const info = h('div');
  const bDeck = h('button', { class: 'primary', text: 'Download for this deck', onclick: () => { imgMissing.clear(); downloadImages(currentDeckNames()); } });
  const bAll = h('button', { text: 'Download for all saved decks', onclick: () => { imgMissing.clear(); downloadImages(allDeckNames()); } });
  const bStop = h('button', { text: 'Stop', onclick: () => { imgJob.cancel = true; } });
  const bClear = h('button', { class: 'danger', text: 'Delete saved images', onclick: async () => {
    if (!(await appAsk('Delete saved images', 'Delete all saved card images from this computer? You can download them again later.', 'Delete', true))) return;
    try { await idbDelete(await idbKeys('img:')); } catch (e) { /* ignore */ }
    for (const e of IMG.values()) for (const u of [e.front, e.back]) if (u && u.startsWith('blob:')) URL.revokeObjectURL(u);
    IMG.clear(); imgMissing.clear(); render(); setImgStatus();
  } });
  m.body.append(
    h('p', { class: 'muted', text: 'Images come from Scryfall. When you are online, the app can download the pictures for your deck once and keep them on this computer, so they still show when you are offline. Only card names are sent to Scryfall.' }),
    h('label', { class: 'chk', style: 'display:flex;margin:6px 0' }, showChk, ' Show card images on the table'),
    h('label', { class: 'chk', style: 'display:flex;margin:6px 0' }, autoChk, ' Download automatically when online'),
    info
  );
  m.foot.append(bClear, bStop, bAll, bDeck, h('button', { text: 'Close', onclick: () => m.close() }));
  async function refresh() {
    const { have, total } = imgSummary();
    const saved = (await idbKeys('img:')).length;
    const remoteOnly = [...IMG.values()].filter(e => e.remote).length;
    const online = navigator.onLine !== false;
    info.replaceChildren(...[
      h('div', { text: `This deck: ${have} of ${total} cards have images.` }),
      h('div', { text: `Saved on this computer: ${saved} images.` }),
      h('div', { class: online ? 'ok' : 'bad', text: online ? 'Online: Scryfall can be reached.' : 'Offline: showing saved images only.' }),
      imgJob.running ? h('div', { text: `Downloading ${imgJob.done} of ${imgJob.total}…` }) : null,
      remoteOnly ? h('div', { class: 'bad', text: `${remoteOnly} image(s) could not be saved and only show while you are online.` }) : null,
      imgMissing.size ? h('div', { class: 'muted small', text: `Scryfall had no picture for: ${[...imgMissing].join(', ')}` }) : null
    ].filter(Boolean));
    bDeck.disabled = bAll.disabled = imgJob.running || !online;
    bStop.disabled = !imgJob.running;
  }
  imgUi = refresh;
  refresh();
}

// Download card data. Order of sources (v0.71): Scryfall's Oracle Cards bulk file, then MTGJSON's AtomicCards file (a separate, free card database
// that does not depend on Scryfall). Both are public downloads meant for this kind of use.
async function streamDownload(res, total, onProgress, label) {
  const reader = res.body.getReader(), chunks = []; let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); got += value.length;
    onProgress(`${label}… ${(got / 1048576).toFixed(0)}${total ? ' of ' + (total / 1048576).toFixed(0) : ''} MB`);
  }
  return new Blob(chunks, { type: 'application/octet-stream' });
}
async function downloadBulk(onProgress) {
  onProgress('Asking Scryfall for the latest file…');
  const list = await (await netFetch('https://api.scryfall.com/bulk-data')).json();
  const entry = (list.data || []).find(d => d.type === 'oracle_cards');
  if (!entry) throw new Error('Scryfall did not list an Oracle Cards file.');
  const res = await netFetch(entry.download_uri, 2);
  if (!res.ok) throw Object.assign(new Error('Download failed (HTTP ' + res.status + ').'), { status: res.status, reason: netReason({ status: res.status }, 'Scryfall') });
  return streamDownload(res, entry.size || +res.headers.get('content-length') || 0, onProgress, 'Downloading from Scryfall');
}
const MTGJSON_URLS = ['https://mtgjson.com/api/v5/AtomicCards.json.gz', 'https://mtgjson.com/api/v5/AtomicCards.json'];
async function downloadMtgjson(onProgress) {
  let err;
  for (const url of MTGJSON_URLS) {
    try {
      onProgress('Contacting MTGJSON…');
      const res = await netFetch(url, 2);
      if (!res.ok) { err = Object.assign(new Error('HTTP ' + res.status), { status: res.status, reason: netReason({ status: res.status }, 'mtgjson.com') }); continue; }
      return await streamDownload(res, +res.headers.get('content-length') || 0, onProgress, 'Downloading from MTGJSON');
    } catch (e) { err = e; }
  }
  throw err || new Error('MTGJSON download failed.');
}
// Turn MTGJSON "AtomicCards" ({ meta, data: { "Card Name": [faces…] } }) into the Scryfall-like objects the rest of the app reads.
function mtgjsonToCards(raw) {
  const out = [], lg = o => { const r = {}; for (const [k, v] of Object.entries(o || {})) r[k] = String(v).toLowerCase() === 'legal' ? 'legal' : String(v).toLowerCase() === 'restricted' ? 'restricted' : 'not_legal'; return r; };
  for (const [name, faces] of Object.entries(raw.data || {})) {
    if (!Array.isArray(faces) || !faces.length) continue;
    const f0 = faces[0], one = faces.length === 1;
    const face = f => ({ name: f.faceName || f.name, mana_cost: f.manaCost || '', type_line: f.type || '', oracle_text: f.text || '', colors: f.colors || [], power: f.power, toughness: f.toughness, loyalty: f.loyalty });
    const o = { name, layout: f0.layout || 'normal', cmc: f0.manaValue != null ? f0.manaValue : f0.convertedManaCost || 0, legalities: lg(f0.legalities) };
    if (f0.producedMana && f0.producedMana.length) o.produced_mana = f0.producedMana;
    if (one) Object.assign(o, face(f0)); else { o.card_faces = faces.map(face); o.colors = f0.colors || []; }
    out.push(o);
  }
  return out;
}
async function runBulkDownload(onProgress) {
  let blob = null, why = '';
  try { blob = await downloadBulk(m => { onProgress(m); updateDbStatus(m); }); }
  catch (e) {
    console.error(e); why = e.reason || netReason(e, 'Scryfall');
    onProgress(`Scryfall did not work: ${why} Trying MTGJSON instead…`);
    try { blob = await downloadMtgjson(m => { onProgress(`Scryfall did not work. ${m}`); updateDbStatus(m); }); }
    catch (e2) {
      console.error(e2); updateDbStatus();
      onProgress(`Could not download from either source. Scryfall: ${why} MTGJSON: ${e2.reason || netReason(e2, 'mtgjson.com')} You can still download a file in your web browser and use “Choose file…” (Scryfall “Oracle Cards” or MTGJSON “AtomicCards”).`);
      return false;
    }
  }
  try { await importCardData(blob); return true; }
  catch (e) { console.error(e); updateDbStatus(); onProgress('Could not use the download: ' + e.message); return false; }
}
// ---- v0.81 Welcome tour: a short walkthrough for first-time users, reopenable from the gear menu.
function openWelcome(onDone) {
  const P = (...x) => h('p', null, ...x), B = t => h('b', { text: t });
  // v0.99.69 rewritten for the current app: the Library, phones and tablets, the stack window, how effects and triggers resolve, the end of a game, updates
  const pages = [
    ['Welcome to the Library of Alexandria', [P('A solo "goldfish" table for Magic: The Gathering. Load your deck, draw a hand, and practise sequencing your turns with no opponent needed. It runs offline once your card data is loaded, on a computer or as an app on your phone or tablet.'),
      P('This tour covers getting set up, the Library, how a turn works, playing on a phone, and making the table your own. Skip it now and reopen it any time from ', B('⚙ → Welcome tour'), '.')]],
    ['1. Card data', [P('The app reads each card’s name, cost, types and rules text to know what it does. The first time, it offers to download this once (about 150 MB) from Scryfall, with every official token and emblem; if Scryfall cannot be reached it uses MTGJSON instead. Without the full file it still learns the cards in your decks as their pictures download.'),
      P('Open it later from ', B('⚙ → Card data'), '. Pictures are separate: ', B('⚙ → Images'), ' downloads them, or turn pictures off to play with plain text cards.')]],
    ['2. The Library', [P('Every session opens in the Library. Your decks are books on the shelves; the open book on the desk is the menu. Its left page is a chapter for the game mode (pick the ', B('Standard'), ' or ', B('Commander'), ' ribbon to turn to the other), with your deck, who goes first and ', B('Begin a new game'), '. The right page is the contents: Import a deck, Scan all decks, Settings, Accessibility, Library look, Rules & help, How cards are read, What’s new and Check for updates.'),
      P('Click a book to take it down. The desk then lays out the whole deck by card type and mana value, like Deck stats; rest the pointer (or your finger) on a card and the book turns to that card’s page. The book also offers ', B('Begin a game with this deck'), ', Edit list, Sideboard, Box art, Card art & printings, Buy this deck, Put it back and Delete deck. Click another book to swap.'),
      P(B('Return to the Library'), ' at the top left of the table brings you back here and keeps your game; Esc goes back to the table.')]],
    ['3. Add a deck', [P('Choose ', B('Import a deck'), ' in the book (or ', B('⚙ → Import / edit deck'), ') and paste a decklist, one card per line like ', B('4 Lightning Bolt'), '. A blank line or a line that says Sideboard starts the sideboard; a Commander section makes it a Commander deck, found under the Commander chapter. You can also drop a .txt decklist file onto the window.')]],
    ['4. A turn', [P('Set ', B('On the play'), ' if you go first (no draw on turn 1), then start the game. You see your opening hand and can mulligan. Cards that act from the opening hand (a Leyline, a card you reveal for its first-upkeep effect) are offered before turn 1.'),
      P('Move on with ', B('Next phase'), ' (Space) and end the turn with ', B('Next turn'), ' (N). The turn bar between the battlefield zones shows every step and fills as the turn goes on. Cards shrink when a zone gets crowded, and identical lands or artifacts pile up only when they would not otherwise fit.')]],
    ['5. Casting and the stack', [P('Drag a card onto the battlefield, double-click it, or click it for its menu. Lands tap for mana when you click them. Casting follows the rules’ order: modes and targets first (an “up to one” target may be none), then X and how to pay. Planeswalker abilities ask for their targets when you activate them.'),
      P('The stack window, docked at the top right of the table, shows what is waiting: resolve the top object, pass priority, or mark it countered. When something resolves, its choices appear inside that window. Effects that simply happen (“gain 3 life and draw a card”) are applied by themselves; anything optional or with a choice waits for you, and each effect can be applied only once.'),
      P('Triggered abilities go on the stack when they trigger; if several trigger together you choose the order. The first time one triggers you can choose ', B('Always yield'), ' so it handles itself for the rest of the game (review under ', B('☰ → Always yield'), '). Made a mistake? ', B('Ctrl+Z'), ' undoes it. Keys: ', B('D'), ' draw, ', B('U'), ' untap all, ', B('S'), ' shuffle, ', B('T'), ' tap the selected card.')]],
    ['6. On a phone or tablet', [P('Open the web version and add it to your home screen (Safari → Share → Add to Home Screen; Chrome → Install app). Held upright, the table is one column: your piles, creatures, the turn bar, other permanents and lands, with your hand fanned at the bottom; turned sideways it shows the full table.'),
      P('Double-tap a card to play or cast it, press and hold for its menu, drag to move it, and swipe the table left to go to the next step. ', B('Stack & log'), ' opens the stack, the card preview and the game log. Upright, ', B('▾ Hand'), ' tucks your hand down to a strip to see the whole table, and ', B('⋯'), ' beside the game-state icons shows the ones that are not active (to add energy or poison).')]],
    ['7. Settings and tools', [P('The ', B('⚙ gear'), ' holds settings and updates (Settings, Update app, Import / edit deck, Card data, Images, help). The ', B('☰ Game tools'), ' button holds the in-game tools: lasting effects, cost effects, deck stats, Always yield, the token glossary, dice & coin', FEATURES.multiplayer ? ' and multiplayer' : '', '.'),
      h('ul', null, h('li', null, B('Look & feel'), ': interface theme, one-click sets, card sizes, foil, sleeves, cursor.'), h('li', null, B('Accessibility'), ': interface size, high contrast, calm motion, larger targets, keyboard focus, screen-reader announcements.'), h('li', null, B('Board layout'), ': lanes, the zone rail, piles.'), h('li', null, B('Playmat & frame'), ': built-in playmats or your own picture.'), h('li', null, B('Animations'), ' and ', B('Sound'), ': what moves and what you hear.'), h('li', null, B('Tutor mode'), ': hints and pop-ups you can switch off one by one (the Pay window, phase pauses, the trigger-ordering window and more). Turning a hint off never turns off a rule: triggers still trigger and costs are still paid.'))]],
    ['8. What the colours and icons mean', [P('Cards in your hand glow: ', B('green'), ' you can play it now, ', B('red'), ' the timing is fine but you cannot pay, ', B('gold'), ' wrong timing; a lightning badge means instant speed. ', B('Card outline key'), ' in the ☰ menu explains them.'),
      P('The small icons above the life totals are game states (storm count, monarch, city’s blessing, delirium, energy, poison…); they light up when active and you can click them. Tapped cards are turned sideways, summoning-sick creatures are dimmed, a badge like ', B('×4'), ' is a pile (click to spread it), and round icons on a creature are the keywords it has right now.')]],
    ['9. What the app does, and what it leaves to you', [P('The app reads each card’s rules text and carries out what it understands. A small ', B('⚠'), ' on a permanent means part of its text is only a reminder: do that part by hand (hover it to see which). The app does not track your opponent’s permanents: an effect on one of them is noted in the log for you to apply on the real table.'),
      P(B('⚙ → How the app reads cards'), ' (or How cards are read in the book) shows, card by card, which lines it handles: ', B('understood'), ' means it carries out every part of the line; ', B('partly'), ' means some of it is left to you, and it says which. When in doubt, the official rules text is what counts.')]],
    ['10. The end of a game', [P('When a player reaches 0 life (or ten poison, or draws from an empty library) the game ends with a ', B('Victory'), ' or ', B('Defeat'), ' screen: play the next round with the same deck, sideboard first, or choose another deck. Your session record is kept, and the Library notes which turn each deck won on.'),
      P('Coin flips and die rolls (', B('☰ → Dice & coin'), ') use a real random result, and cards that say "flip a coin" or "roll a d20" use them too. Tokens get generated art; add your own picture to any token in ', B('☰ → Token glossary & art'), '.'), ...(FEATURES.multiplayer ? [P('To play a friend on the same network open ', B('☰ → Multiplayer (LAN)'), ': one player makes an invite code, the other answers it, and you see each other’s battlefield, graveyard, exile, life and chat live.')] : [])]],
    ['11. Updates', [P('Click the version number at the top to see what changed. ', B('Check for updates'), ' in the book (or ', B('⚙ → Update app'), ') finds a new version, shows what is new and installs it; restart when asked. On a phone the web app updates itself the next time you open it.'),
      P('On Windows a few releases change the app’s own window code; when one does, the update says so and you run the new Setup file from the releases page once. Your decks, settings, playmats and sleeves stay on your device through every update.')]]
  ];
  let i = 0;
  const m = modal('Welcome', { width: 600, sticky: true, onClose: () => { lsSet('mtgpt.welcomeSeen', true); if (onDone) onDone(); } });
  function draw() {
    const [title, body] = pages[i];
    m.body.replaceChildren(h('div', { class: 'ptitle', text: title }), ...body, h('div', { class: 'wel-dots' }, pages.map((_, k) => h('span', { class: k === i ? 'on' : '' }))));
    m.foot.replaceChildren(
      h('button', { text: i === pages.length - 1 ? 'Close' : 'Skip tour', onclick: () => m.close() }),
      i > 0 ? h('button', { text: '◂ Back', onclick: () => { i--; draw(); } }) : null,
      i < pages.length - 1 ? h('button', { class: 'primary', text: 'Next ▸', onclick: () => { i++; draw(); } }) : h('button', { class: 'primary', text: 'Import a deck', onclick: () => { m.close(); if (!state) openDeckEditor({ blank: true }); } }));
  }
  draw();
}
let firstBootPrompt = null;
function promptFirstBoot() {
  if (cardCount || !navigator.onLine || lsGet('mtgpt.bulkPrompt', '') === 'off') return;
  const m = modal('Download card data?', { width: 520, sticky: true });
  firstBootPrompt = m;   // v0.99.34 closed by updateDbStatus once card data arrives some other way (a file loaded from Card data...)
  const msg = h('p', { text: 'The app needs card data (names, costs, types, text) to know which cards are lands, creatures and so on. It can download it now (from Scryfall, or from the MTGJSON project if Scryfall is unreachable): about 150 MB, once. After that it works fully offline.' });
  const go = h('button', { class: 'primary', text: 'Download now' });
  go.addEventListener('click', async () => {
    go.disabled = true;
    const ok = await runBulkDownload(t => { msg.textContent = t; });
    if (ok) m.close();
    else go.disabled = false;
  });
  m.body.append(msg);
  m.foot.append(
    h('button', { text: 'Don’t ask again', onclick: () => { lsSet('mtgpt.bulkPrompt', 'off'); m.close(); } }),
    h('button', { text: 'Not now', onclick: () => m.close() }), go);
}

