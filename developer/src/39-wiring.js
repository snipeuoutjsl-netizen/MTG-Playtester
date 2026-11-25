// ---------------------------------------------------------------- wiring
function init() {
  refreshDeckSelect();
  loadCustomArt().then(n => { if (n) render(); });
  loadTokenArt().then(n => { if (n) render(); });
  $('#btnTokenGloss').addEventListener('click', () => { toggleUtilityMenu(false); openTokenGlossary(); });
  if (!settings.kitchenSeen) { settings.kitchenSeen = true; if (!settings.matPreset) settings.matPreset = 'kitchen'; if (!settings.sleevePreset) settings.sleevePreset = 'worn'; saveSettings(); try { applySettings(); applySleeve(); } catch (e) { /* ignore */ } }   // v0.69.3: the new table and card back become the look once; change them in Settings > Graphics
  $('#deckSelect').addEventListener('change', e => { lsSet('mtgpt.current', e.target.value); prepareImages(); });
  $('#btnDecks').addEventListener('click', openHall);   // v0.99.48 the deck button takes you back to the Library
  { const cm = $('#cmdWrap'); if (cm) cm.addEventListener('click', openDeckPicker); }
  $('#btnTools').addEventListener('click', e => { e.stopPropagation(); toggleUtilityMenu(); });
  $('#utilityMenu').addEventListener('click', e => e.stopPropagation());
  $('#btnGameTools').addEventListener('click', e => { e.stopPropagation(); toggleGameMenu(); });
  $('#gameMenu').addEventListener('click', e => e.stopPropagation());
  $('#btnDeckEdit').addEventListener('click', () => { toggleUtilityMenu(false); openDeckEditor(); });
  setupVersionBadge();
  if (window.desktop && window.desktop.ghCheck && settings.autoUpdateCheck !== false) setTimeout(async () => { try { const r = await window.desktop.ghCheck(); if (r && r.ok && r.newer) { window.__updAvail = r; try { if (hallOpen()) drawHall(); } catch (e) {} const b = $('#btnUpdate'); if (b) b.textContent = b.textContent.replace(/ \u25CF$/, '') + ' \u25CF'; if (settings.updatePrompt !== false) { if (settings.skipUpdate !== r.latest) openUpdatePrompt(r); } else toast('Update available', `Version ${r.latest} is on GitHub. Open the menu \u2192 Update app to read what changed and install it.`); } } catch (e) { /* offline: stay quiet */ } }, 3500);
  if (window.desktop) { $('#btnUpdate').hidden = false; $('#btnUpdate').addEventListener('click', () => { toggleUtilityMenu(false); openUpdate(); }); }
  if ($('#btnFx')) $('#btnFx').addEventListener('click', openEffects);
  if ($('#btnFxMenu')) $('#btnFxMenu').addEventListener('click', () => { toggleUtilityMenu(false); openEffects(); });
  if ($('#btnCostFx')) $('#btnCostFx').addEventListener('click', () => { toggleUtilityMenu(false); openCostFx(); });
  $('#btnCards').addEventListener('click', () => { toggleUtilityMenu(false); openCardData(); });
  $('#fileCards').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) importCardData(f); });
  $('#btnNew').addEventListener('click', startGame);
  $('#btnDraw').addEventListener('click', drawOne);
  $('#btnUntap').addEventListener('click', untapAll);
  $('#btnNext').addEventListener('click', nextTurn);
  $('#btnNextPhase').addEventListener('click', nextPhase);
  setupLibraryMenu();
  window.addEventListener('resize', layoutHand);
  $('#btnShuffle').addEventListener('click', shuffleLibrary);
  $('#btnUndo').addEventListener('click', undo);
  $('#btnToken').addEventListener('click', openToken);
  $('#btnStack').addEventListener('click', openStack);
  $('#imgStatus').addEventListener('click', () => { if (!imgJob.running) { imgMissing.clear(); downloadImages(currentDeckNames()); } });
  $('#btnLogToggle').addEventListener('click', () => { lsSet('mtgpt.logopen', lsGet('mtgpt.logopen', '0') === '1' ? '0' : '1'); render(); });
  $('#btnStats').addEventListener('click', () => { toggleUtilityMenu(false); openStats(); });
  $('#btnYield').addEventListener('click', () => { toggleUtilityMenu(false); openAlwaysYield(); });
  { const mb = $('#btnMulti'); if (mb) { mb.hidden = !FEATURES.multiplayer; mb.addEventListener('click', () => { toggleUtilityMenu(false); if (FEATURES.multiplayer) openMultiplayer(); }); } }   // multiplayer is built but switched off for now (FEATURES in 01-helpers.js)
  $('#btnDiceCoin').addEventListener('click', () => { toggleUtilityMenu(false); openDiceCoin(); });
  $('#btnReading').addEventListener('click', () => { toggleUtilityMenu(false); openCoverage(); });
  $('#btnWelcome').addEventListener('click', () => { toggleUtilityMenu(false); openWelcome(); });
  setupKeywordTips();
  $('#btnSettings').addEventListener('click', () => { toggleUtilityMenu(false); openSettings(); });
  $('#btnImages').addEventListener('click', () => { toggleUtilityMenu(false); openImages(); });
  window.addEventListener('online', () => { setImgStatus(); maybeAutoDownload(); });
  window.addEventListener('offline', () => setImgStatus('Images: offline'));
  for (const b of $$('[data-open]')) b.addEventListener('click', () => openZone(b.dataset.open));
  $('#btnOppDraw').addEventListener('click', openOppDraw);
  $('#btnOppSearch').addEventListener('click', openOppSearch);
  $('#btnTokens').addEventListener('click', openTokenTray);
  for (const b of $$('[data-opp]')) b.addEventListener('click', () => changeOppLife(parseInt(b.dataset.opp, 10)));
  $('#btnCombat').addEventListener('click', openCombatHelper);
  for (const b of $$('[data-life]')) b.addEventListener('click', () => changeLife(parseInt(b.dataset.life, 10)));
  $('#mat').addEventListener('click', () => { if (selected) { selected = null; render(); } });
  setupDrop();

  document.addEventListener('click', () => toggleUtilityMenu(false));

  let fitResizeTimer = 0;
try { const ro = new ResizeObserver(() => { clearTimeout(fitResizeTimer); fitResizeTimer = setTimeout(() => { fitBattlefieldCards(); layoutHand(); }, 30); }); for (const id of ['mat', 'zone-creatures', 'zone-noncreature', 'zone-lands', 'row-hand']) { const el = document.getElementById(id); if (el) ro.observe(el); } } catch (e) { /* no ResizeObserver */ }   // v0.96.11 re-fit whenever the zones or the hand change size
window.addEventListener('resize', () => { try { scheduleLayout(); } catch (e) { /* ignore */ } });
window.addEventListener('resize', () => {
  clearTimeout(fitResizeTimer);
  fitResizeTimer = setTimeout(() => { fitBattlefieldCards(); layoutHand(); }, 60);
});

document.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    if ($('#modalRoot').children.length) { const top = [...document.querySelectorAll('#modalRoot .modal')].pop(); if (e.key === 'Escape' && top && !top.matches('[data-noclose]')) { const x = top.querySelector('header button'); if (x) x.click(); } return; }   // v0.99.66 the resolve panel may sit in the stack window
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); undo(); }
    else if (e.ctrlKey || e.metaKey || e.altKey) return;
    else if (k === 'd') drawOne();
    else if (k === 'u') untapAll();
    else if (k === 'n') nextTurn();
    else if (k === ' ') { e.preventDefault(); if (document.activeElement) document.activeElement.blur(); nextPhase(); }
    else if (k === 's') shuffleLibrary();
    else if (k === 't' && selected) toggleTap(selected);
    else if (k === 'escape') hideMenu();
  });

  applySettings();
  loadPlaymat();
  loadSleeve();
  render();
  if (lsGet(HALL_KEY, true) !== false) openHall();   // v0.99.48 every session starts in the Library
  updateDbStatus();
  idbGet('tokens').then(t => { if (Array.isArray(t)) { installTokens(t); updateDbStatus(); } }).catch(() => {}).then(() => setTimeout(() => syncTokens(false), 2500));
  idbGet('cards').then(list => {
    if (Array.isArray(list) && list.length) { installCards(list); render(); }
    else updateDbStatus();
  }).then(() => { prepareImages(); if (hallOpen()) drawHall(); setTimeout(() => { if (!lsGet('mtgpt.welcomeSeen', false) && !Object.keys(loadDecks()).length && !cardCount) openWelcome(() => setTimeout(promptFirstBoot, 300)); else promptFirstBoot(); }, 600); });
}

