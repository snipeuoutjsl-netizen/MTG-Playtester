// ---------------------------------------------------------------- top-bar menus: the gear (settings & updates) and the game tools menu (v0.98.3)
function setTopMenu(menuSel, btnSel, open) {
  const menu = $(menuSel), btn = $(btnSel); if (!menu || !btn) return;
  menu.hidden = !open; btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}
function toggleUtilityMenu(force) {   // the gear menu; toggleUtilityMenu(false) closes every top-bar menu
  const menu = $('#utilityMenu'); if (!menu) return;
  const open = force === undefined ? menu.hidden : !!force;
  setTopMenu('#utilityMenu', '#btnTools', open); setTopMenu('#gameMenu', '#btnGameTools', false);
}
function toggleGameMenu(force) {
  const menu = $('#gameMenu'); if (!menu) return;
  const open = force === undefined ? menu.hidden : !!force;
  setTopMenu('#gameMenu', '#btnGameTools', open); setTopMenu('#utilityMenu', '#btnTools', false);
}
