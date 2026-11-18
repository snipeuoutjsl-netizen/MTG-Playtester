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
  back.addEventListener('mousedown', e => { if (e.target === back && !opts.sticky && !opts.dock) close(); });
  root.append(back);
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    back.remove();
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
  if (document.querySelector('#modalRoot .modal')) { toast('Finish this window first', 'Close the open window, then drop the file again.'); return; }
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
    curName && decks[curName] ? h('button', { class: 'danger', text: 'Delete deck', onclick: () => {
      if (!confirm(`Delete "${curName}"?`)) return;
      delete decks[curName]; saveDecks(decks); clearDeckArt(curName); lsSet('mtgpt.current', null);
      refreshDeckSelect(); m.close(); render();
    } }) : null,
    h('button', { text: 'Cancel', onclick: () => m.close() }),
    h('button', { class: 'primary', text: 'Save', onclick: () => {
      const name = nameIn.value.trim();
      if (!name) { alert('Give the deck a name.'); return; }
      const d = parseDeck(ta.value);
      if (!d.main.length) { alert('The decklist is empty.'); return; }
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
  const shuffleChk = h('input', { type: 'checkbox', checked: true });
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
    if (zone === 'library' || zone === 'sideboard') list.sort((a, b) => a.name.localeCompare(b.name));
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
        moveCard(c.id, to, pos);
        if (to === 'hand') { /* keep window open for multi-pick */ }
        draw();
      } });
      if(teach('libraryPreview')) row.addEventListener('mouseenter', () => showPreview(c));
      if (zone === 'command' && c.isCommander) row.append(h('button', { class: 'primary', text: `Cast${(c.cmdCasts || 0) ? ' (+{' + 2 * c.cmdCasts + '} tax)' : ''}`, title: 'Cast your commander from the command zone (CR 903.8): it costs {2} more for each time you have cast it from there', onclick: () => { m.close(); castFromCommand(c.id); } }));
      if (zone === 'exile' && (c.mayPlayTurn === state.turn || c.mayPlayAlways)) row.append(h('button', { class: 'primary', text: isLandName(c.name) ? 'Play land' : 'Cast', title: 'You may play this card this turn (it was exiled with permission)', onclick: () => { m.close(); playFromExile(c.id); } }));
      if (zone === 'exile' && c.freeCastTurn === state.turn && !isLandName(c.name)) row.append(h('button', { class: 'primary', text: 'Cast free (this turn)', title: 'An effect lets you cast this exiled card without paying its mana cost until end of turn', onclick: () => { m.close(); suspendCastFree(c.id, null, 'Free cast'); } }));
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
    if (!confirm('Delete all saved card images from this browser? You can download them again later.')) return;
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
  const pages = [
    ['Welcome to MTG Playtester', [P('A solo "goldfish" table for Magic: The Gathering. Load your deck, draw a hand, and practise sequencing your turns with no opponent needed. It runs fully offline once your card data is loaded.'),
      P('This short tour covers getting set up, how a turn works, and how to make the table look the way you like. You can skip it now and reopen it any time from the ', B('⚙ menu → Welcome tour'), '.')]],
    ['1. Get your card data', [P('The app needs card data (names, costs, types, rules text) to know what each card does. The first time you open it, it offers to download this once (about 150 MB). It also saves every official token and emblem (a few thousand small entries), so tokens work offline too.'),
      P('Open it later from ', B('⚙ → Card data'), '. Card pictures are separate: ', B('⚙ → Images'), ' downloads them, and you can turn pictures off to use plain text cards.')]],
    ['2. Add your deck', [P('Open ', B('⚙ → Import / edit deck'), ' (or click ', B('Import a deck'), ' on the start screen) and paste a decklist, one card per line like ', B('4 Lightning Bolt'), '. A blank line, or a line that says Sideboard, starts your sideboard. You can also drag a .txt decklist file onto the window.'),
      P('The deck button at the top left lists your saved decks and switches between them.'), P('For Commander, put the commander under a ', B('Commander'), ' heading (or mark it ', B('*CMDR*'), '). On the deck screen (click the deck name) pick ', B('Commander'), ' mode: Commander decks are listed only there. It gives you 40 life, a command zone, the {2} commander tax, a free first mulligan, the choice to return your commander to the command zone, commander damage and a deck check (100 cards, singleton, colour identity).')]],
    ['3. Start a game', [P('Pick your deck and press ', B('New game'), '. Tick ', B('On the play'), ' if you go first (no draw on turn 1). You get your opening hand and can mulligan. Turn 1 starts in Main phase 1.'),
      P('Move through the turn with ', B('Next phase'), ' or the Space bar, and ', B('Next turn'), ' (N) when you are done. The turn-flow bar between the battlefield and your lower zones shows every step, lights the one you are in and fills up like a loading bar as the turn goes on. It never moves or changes size. If a zone fills up, its cards shrink automatically so all of them stay visible.')]],
    ['4. Playing cards', [P('Drag a card from your hand onto the battlefield, or click it for a menu (play, cast, discard, and more). Lands tap for mana when you click them. Spells go on the stack; resolve them from the stack window or the card in the middle of the table.'),
      P('While something is on the stack, only responses are possible: instants, abilities and resolving. Made a mistake? ', B('Ctrl+Z'), ' undoes it. Handy keys: ', B('D'), ' draw, ', B('U'), ' untap all, ', B('S'), ' shuffle, ', B('T'), ' tap the selected card.'),
      P('Tired of the same trigger asking every time? The first time an ability goes on the stack you are asked about ', B('Always yield'), ': say yes and it goes on the stack, picks the same targets and applies the same effect by itself for the rest of that game. Review or remove them under ', B('\u2630 \u2192 Always yield'), '.'),
      P('Tokens never have official art here, so the app draws generic art for every token. Open ', B('\u2630 \u2192 Token glossary & art'), ' to browse every token and add your own picture to any of them.'),
      ...(FEATURES.multiplayer ? [P('To play a friend on the same network open ', B('☰ → Multiplayer (LAN)'), ': one player makes an invite code, the other pastes it and sends back a reply code. You each play your own deck and see each other\'s battlefield, graveyard, exile, life and chat live (hands and libraries stay private), and combat damage you deal goes to their real life total.')] : []),
      P('For coin flips and die rolls open ', B('☰ → Dice & coin'), ': a real coin or die tumbles and lands on the actual random result. Cards that say "flip a coin" or "roll a d20" use it too. When a game ends (0 life, ten poison, empty library) a ', B('Next round'), ' screen offers a rematch, sideboarding or another deck.')]],
    ['5. Settings', [P('The ', B('⚙ gear'), ' holds settings and updates (Settings, Update app, Import / edit deck, Card data, Images, help). The ', B('☰ Game tools'), ' button beside it holds the in-game tools (Active effects, Cost effects, Deck stats, Always yield, Token glossary, Dice & coin).'), P('Open ', B('⚙ → Settings'), '. The tabs are:'),
      h('ul', null, h('li', null, B('Look & feel'), ' – interface theme, one-click sets, foil, cursor, card sizes, turn-flow bar opacity and card sleeves.'), h('li', null, B('Accessibility'), ' – interface size, high contrast, calm motion, larger click targets, strong keyboard focus and screen-reader log announcements.'), h('li', null, B('Board'), ' – board layout, playmat and the frame around it.'), h('li', null, B('Animations'), ' – every effect has its own switch, including the dice and coin.'), h('li', null, B('Sound'), ' – effect volume, and background music with several generated songs (low-fi, boom-bap, rain, jazz-hop, arcade, golden hour).'), h('li', null, B('Tutor mode'), ' – the teaching aids, each one on its own switch.'), h('li', null, B('Legal notice'), ' – fan content and privacy information.'))]],
    ['6. Themes, playmats and sleeves', [P('Under ', B('Settings → Look & feel'), ' the ', B('One-click set'), ' picker changes everything at once: interface theme, card sleeve, playmat, board frame and (if ticked) a matching song. Or choose each part yourself.'),
      P('Pick a built-in playmat under ', B('Settings → Board'), ', or ', B('Custom playmat → Upload'), ' to use your own picture; choose a built-in sleeve or ', B('Upload sleeve…'), ' under Look & feel. Your choices are saved on this computer.')]],
    ['7. What the icons and colours mean', [P('Cards in your hand glow to tell you what you can do: ', B('Playable'), ' (green), ', B('Can\'t pay'), ' (not enough or wrong mana), ', B('Wrong timing'), ' (sorcery-speed card outside your main phase), ', B('Instant speed'), ' (can be cast in response), and ', B('Selected'), '.'),
      P('The row of small icons at the top shows game states (monarch, initiative, storm count, energy, poison and more); they light up when active, and you can click them to change them. Tapped cards are turned sideways, summoning-sick creatures are dimmed, and a count badge like ', B('×4'), ' means identical cards are piled together (click it to spread them out).'),
      P('Round icons on a creature are keywords it has right now. ', B('Card outline key'), ' in the \u2630 Game tools menu explains the glow colours. The Stack panel shows what is waiting to resolve.')]],
    ['8. Learning and honesty', [P('Tutor mode adds hints such as phase pauses, mana payment help and rules reminders. Turn off whatever you do not want.'),
      P('A small ', B('\u26a0'), ' on a permanent means part of its rules text is only a reminder: the app does not apply it, so do it by hand. Hover the badge to see which lines. A power/toughness shown with a ', B('?'), ' means a condition on the card could not be read.'),
      P('The app reads the rules text on each card and applies what it understands, then tells you what is left for you to do by hand. ', B('⚙ → How the app reads cards'), ' shows, card by card, which lines it handles and which it does not. When in doubt, the official rules text is what counts.'),
      P('In "How the app reads cards", ', B('understood'), ' means the app carries out every part of that line; ', B('partly'), ' or ', B('by hand'), ' means some of it is left to you, and the app says which part.')]],
    ['9. Updates', [P('The version number at the top right shows what changed in each release when you click it. New versions are published on GitHub.'),
      P('Open ', B('⚙ → Update app'), ' to check for a new version. If one is found it shows what is new and installs it; restart the app when asked. A few releases change the app shell itself (for example graphics settings); for those, run the installer from the Windows or SteamDeck-and-Linux folder once.'),
      P('Your decks, settings, playmats and sleeves stay on this computer through updates. You can reopen this tour any time from ', B('⚙ → Welcome tour'), ' or from the Settings window.')]]
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

