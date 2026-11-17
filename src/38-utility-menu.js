// ---------------------------------------------------------------- utility menu
function toggleUtilityMenu(force) {
  const menu = $('#utilityMenu');
  const btn = $('#btnTools');
  if (!menu || !btn) return;
  const open = force === undefined ? menu.hidden : !!force;
  menu.hidden = !open;
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

