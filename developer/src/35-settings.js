// ---------------------------------------------------------------- settings (card sizes, playmat)
const SET_DEFAULT = {
  bfs: 1, hs: 1, stripOpacity: 0.86, zonea: 0.22, dim: 0.35, theme: 'green', custom: false, fit: 'cover', frame: 'none', frameAnim: true, frameGlow: 0.7, frameA: '#ff7a2f', frameB: '#ffd45c', frameC: '#fff1c9',
  layout: { zoneDepth: true, stackCards: true, dimIdle: true, boardStrip: true, combatLane: true, gyFan: true }, layoutMode: 'updated', lay: {}, matMotion: 'off', matSpeed: 1, sleevePreset: '', matPreset: '', uiTheme: 'default',
  anim: { on: true, move: true, spell: true, life: true, turn: true, fan: true, hand3d: true, bfFloat: true, handFloat: true, cardDrag: true, shuffle: true, speed: 1, fanAmt: 1, spark: 1, spotSize: 1 }, foil: 'off', foilStr: 0.6, cursor: 'default', cursorSize: 32, cursorHot: 'tl', cursorImg: '',
  sound: { on: true, vol: 0.5, music: true, musicStyle: 'ambient', musicBeat: true, musicVol: 0.4, draw: true, cast: true, enter: true, land: true, resolve: true, counter: true },
  teaching: { master: true, playability: true, phasePopups: true, phasePauses: true, stackGuidance: true,
    triggerPrompts: true, gapNotes: true, gapBadges: true, dredgePrompts: true, replaceNotes: true, libraryPreview: true, combatHelper: true, rulesHints: true, phaseBar: true,
    keywordTips: true, autoResolve: true, vaultPrompt: true, keywordIcons: true, stateIcons: true, durationHints: true, replaceNotes: true, costGuidance: true, preGame: true, autoStart: true, summoningSick: true, libraryMenu: true }
};
let settings = Object.assign({}, SET_DEFAULT, lsGet('mtgpt.settings', {}));
if (/^set-/.test(String(settings.matPreset || ''))) settings.matPreset = 'kitchen';
if (/^set-/.test(String(settings.sleevePreset || ''))) settings.sleevePreset = 'worn';   // colour sets were removed in v0.89
if (settings.uiTheme === 'set') settings.uiTheme = 'default';
for (const k of ['border', 'borderSize', 'borderAnim', 'setApply', 'uiSet']) delete settings[k];
settings.teaching = Object.assign({}, SET_DEFAULT.teaching, settings.teaching || {});
settings.layout = Object.assign({}, SET_DEFAULT.layout, settings.layout || {});
settings.sound = Object.assign({}, SET_DEFAULT.sound, settings.sound || {});
settings.anim = Object.assign({}, SET_DEFAULT.anim, settings.anim || {});
function teach(key){ return settings.teaching[key] !== false; }   // every aid is its own switch
let matUrl = null;
let sleeveUrl = null;
const THEMES = {
  green: 'radial-gradient(ellipse at 50% 25%, #1f3d35 0%, #14261f 52%, #0b1512 100%)',
  blue: 'radial-gradient(ellipse at 50% 25%, #1d3552 0%, #121f33 52%, #0a1220 100%)',
  red: 'radial-gradient(ellipse at 50% 25%, #4a2323 0%, #2c1515 52%, #160b0b 100%)',
  purple: 'radial-gradient(ellipse at 50% 25%, #3a2850 0%, #231832 52%, #120c1b 100%)',
  slate: 'radial-gradient(ellipse at 50% 25%, #2d3138 0%, #1b1e23 52%, #0f1114 100%)',
  black: '#07080a'
};
// Board frames: a coloured, glowing outline for the playmat, zones and hand. Each is two colours + a glow colour.
const FRAMES = {
  none:   { label: 'None' },
  fire:   { label: 'Fire',      a: '#ff4a1c', b: '#ffc23a', c: '#fff1c9', glow: 'rgba(255,110,30,.55)' },
  ice:    { label: 'Ice',       a: '#6fd6ff', b: '#e8fbff', c: '#4aa8ff', glow: 'rgba(120,214,255,.5)' },
  grass:  { label: 'Grass',     a: '#3fbf54', b: '#b6e86a', c: '#2f8f4a', glow: 'rgba(90,200,90,.45)' },
  storm:  { label: 'Storm',     a: '#7b6bff', b: '#f4e86a', c: '#6ad7ff', glow: 'rgba(140,120,255,.5)' },
  shadow: { label: 'Shadow',    a: '#8a3fd1', b: '#d96bff', c: '#4a1a7a', glow: 'rgba(160,70,220,.5)' },
  gold:   { label: 'Royal gold',a: '#d9a53a', b: '#fff0b0', c: '#b8741a', glow: 'rgba(235,185,70,.45)' },
  custom: { label: 'Custom' }
};
function frameColors() {
  const f = FRAMES[settings.frame];
  if (!f || settings.frame === 'none') return null;
  if (settings.frame === 'custom') return { a: settings.frameA, b: settings.frameB, c: settings.frameC || settings.frameA, glow: hexA(settings.frameA, .5) };
  return { ...f, c: f.c || f.a };
}
function hexA(hex, a) { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return `rgba(255,255,255,${a})`; const n = parseInt(m[1], 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
function applyFrame() {
  const b = document.body, fc = frameColors();
  b.dataset.frame = fc ? settings.frame : 'none';
  b.classList.toggle('frame-anim', !!fc && settings.frameAnim !== false);
  if (fc) {
    b.style.setProperty('--fa', fc.a); b.style.setProperty('--fb', fc.b); b.style.setProperty('--fc', fc.c); b.style.setProperty('--fglow', fc.glow);
    b.style.setProperty('--fi', String(settings.frameGlow));
  } else for (const k of ['--fa', '--fb', '--fc', '--fglow', '--fi']) b.style.removeProperty(k);
}
// v0.96.18 One-click sets: each interface theme comes with a matching card sleeve, playmat, board frame and song. Applying one changes all of them together.
const UI_SETS = [
  { id: 'default', label: 'Midnight (default)', ui: 'default', sleeve: 'star', mat: 'nebula', frame: 'none', song: 'lofi', note: 'Night sky sleeve, nebula mat, cosmic low-fi.' },
  { id: 'obsidian', label: 'Obsidian & gold', ui: 'obsidian', sleeve: 'deco', mat: 'deco', frame: 'gold', song: 'boombap', note: 'Gilded deco sleeve and mat, royal gold frame, dusty boom-bap.' },
  { id: 'abyss', label: 'Abyss blue', ui: 'abyss', sleeve: 'waves', mat: 'ocean', frame: 'ice', song: 'rain', note: 'Tides sleeve, ocean mat, ice frame, rainy-window music.' },
  { id: 'forest', label: 'Forest', ui: 'forest', sleeve: 'forest', mat: 'grove', frame: 'grass', song: 'golden', note: 'Forest sleeve, moonlit grove mat, grass frame, golden-hour music.' },
  { id: 'neon', label: 'Neon', ui: 'neon', sleeve: 'wheel', mat: 'storm', frame: 'storm', song: 'arcade', note: 'Mana wheel sleeve, storm mat, storm frame, arcade chill.' },
  { id: 'parchment', label: 'Parchment', ui: 'parchment', sleeve: 'worn', mat: 'map', frame: 'none', song: 'jazzhop', note: 'Worn card back, old map mat, midnight jazz-hop.' },
  { id: 'light', label: 'Light', ui: 'light', sleeve: 'check', mat: 'kitchen', frame: 'none', song: 'golden', note: 'Checker sleeve, kitchen-table mat, golden-hour music.' },
  { id: 'cosmos', label: 'Pixel cosmos (lo-fi)', ui: 'cosmos', sleeve: 'pixcosmos', mat: 'pixcosmos', frame: 'none', song: 'lofi', note: 'Pixel sleeve and mat, cosmic low-fi.' }
];
function applyUiSet(id) {
  const st = UI_SETS.find(x => x.id === id); if (!st) return;
  settings.uiSet = st.id; settings.uiTheme = st.ui; settings.sleevePreset = st.sleeve; settings.matPreset = st.mat; settings.custom = false; settings.frame = st.frame;
  if (st.cursor) { settings.cursor = st.cursor; try { applyCursor(); } catch (e) {} }
  if (settings.setMusic !== false) { settings.sound.musicStyle = st.song; settings.sound.music = true; settings.sound.on = true; }
  saveSettings(); try { applySettings(); } catch (e) {} try { applyUiTheme(); } catch (e) {} try { applySleeve(); } catch (e) {}
  if (settings.setMusic !== false) { try { musicSettingsChanged(); } catch (e) {} }
  toast(st.label, 'Theme, sleeve, playmat' + (st.cursor ? ', mouse pointer' : '') + (st.frame !== 'none' ? ', frame' : '') + (settings.setMusic !== false ? ' and music' : '') + ' set.');
}
function applySettings() {
  applyFrame(); applyCursor(); applyUiTheme();
  const b = document.body.style;
  b.setProperty('--bfs', settings.bfs); b.setProperty('--bsa', String(settings.stripOpacity ?? 0.86));
  b.setProperty('--hs', settings.hs);
  b.setProperty('--zonea', settings.zonea);
  b.setProperty('--foil', String(settings.foilStr === undefined ? 0.6 : settings.foilStr));
  // The playmat picture lives on a layer behind the board (#mat::before) so it can move without moving any cards.
  const mat = $('#mat'), mo = settings.matMotion || 'off', shim = mo === 'shimmer';
  const SHIM = 'linear-gradient(105deg, transparent 38%, rgba(255,255,255,.13) 50%, transparent 62%)';
  let bg, size, pos;
  const presetMat = !(settings.custom && matUrl) && settings.matPreset ? artUrl('mat', settings.matPreset) : '';
  if ((settings.custom && matUrl) || presetMat) {
    const fitSize = presetMat ? 'cover' : settings.fit === 'stretch' ? '100% 100%' : settings.fit, dm = presetMat ? settings.dim * 0.4 : settings.dim;
    bg = `${shim ? SHIM + ',' : ''}linear-gradient(rgba(0,0,0,${dm}),rgba(0,0,0,${dm})), url("${presetMat || matUrl}")`;
    size = `${shim ? '250% 100%,' : ''}100% 100%, ${fitSize}`; pos = `${shim ? '0% 0,' : ''}0 0, center`;
  } else {
    let t = THEMES[settings.theme] || THEMES.green; if (t[0] === '#') t = `linear-gradient(${t},${t})`;
    bg = `${shim ? SHIM + ',' : ''}${t}`; size = `${shim ? '250% 100%,' : ''}cover`; pos = `${shim ? '0% 0,' : ''}center`;
  }
  mat.style.backgroundImage = 'none';
  mat.style.setProperty('--matbg', bg); mat.style.setProperty('--matsize', size); mat.style.setProperty('--matpos', pos);
  mat.style.setProperty('--matspeed', String(1 / Math.max(0.25, settings.matSpeed || 1)));
  document.body.dataset.matmotion = mo;
  layoutHand();
}
function saveSettings() { settings.anim=Object.assign({},SET_DEFAULT.anim,settings.anim||{}); settings.sound=Object.assign({},SET_DEFAULT.sound,settings.sound||{}); settings.teaching=Object.assign({},SET_DEFAULT.teaching,settings.teaching||{}); settings.layout=Object.assign({},SET_DEFAULT.layout,settings.layout||{}); lsSet('mtgpt.settings', settings); applySettings(); }
async function loadPlaymat() {
  try {
    const blob = await idbGet('playmat');
    if (blob) { matUrl = URL.createObjectURL(blob); applySettings(); }
  } catch (e) { /* ignore */ }
}


function applySleeve() {
  const el=$('#libstack .cardback');
  if(!el)return;
  const sp = !sleeveUrl && settings.sleevePreset ? artUrl('sleeve', settings.sleevePreset) : '';
  if(sleeveUrl||sp){el.style.backgroundImage=`url("${sleeveUrl||sp}")`;el.style.backgroundSize='cover';el.style.backgroundPosition='center';el.classList.add('custom-sleeve');}
  else{el.style.backgroundImage='';el.classList.remove('custom-sleeve');}
}
async function loadSleeve() {
  try{const blob=await idbGet('sleeve');if(blob){sleeveUrl=URL.createObjectURL(blob);}}catch(e){}
  applySleeve();   // v0.94.3 also applies the chosen sleeve preset at start-up (it used to be applied only when a custom upload existed, so presets looked reset)
}
let settingsTab = 'gfx';
// v0.99.70 merged: Board layout + Playmat & frame = Table; Animations + Sound = Motion & sound; the Library look window and the card-data / update
// windows have their own tabs. ('mat' and 'snd' panes are still built, then folded into their merged tab.)
const SET_TABS = [['gfx', 'Look & feel'], ['board', 'Table'], ['lib', 'Library'], ['anim', 'Motion & sound'], ['a11y', 'Accessibility'], ['tutor', 'Tutor mode'], ['data', 'Card data & updates'], ['legal', 'Legal notice']];
const SET_TAB_ALIAS = { mat: 'board', snd: 'anim' };
const TAB_INFO = { a11y: ['♿', 'Interface size, contrast, calm motion, larger targets, keyboard focus and screen-reader support'], gfx: ['🎨', 'Theme, card sizes, foil cards, sleeves and the mouse cursor'], board: ['🧩', 'How the table is arranged (lanes, zone rail, piles, board effects), the playmat and the frame around the board'], lib: ['📚', 'The Library: wall and desk, and whether the app opens there'], anim: ['✨', 'Motion and visual effects, sound effects and music'], data: ['🗂', 'Card data, card pictures and app updates'], tutor: ['🎓', 'Teaching aids and rules help: every one has its own switch'], legal: ['⚖', 'Fan-content notice, data sources, privacy and no-warranty statement'] };
// v0.96.0 The legal notice. README.md carries the same text; keep them in step.
const LEGAL_SECTIONS = [
  ['Fan content', ['Library of Alexandria (MTG Playtester) is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. \u00a9Wizards of the Coast LLC.', 'Magic: The Gathering, its card names, mana symbols and related marks are trademarks of Wizards of the Coast LLC. This project is free, is not sold, and is not affiliated with, sponsored or endorsed by Wizards of the Coast, Hasbro or Scryfall.']],
  ['What is and is not included', ['This program contains no card images, no card artwork, no Oracle card database and no Wizards logos or set symbols. Mana and tap symbols are drawn by the app itself as plain coloured text circles. The icon, playmats, sleeves and cursors are original artwork made for this project.', 'Card data and card images are downloaded by you, onto your own computer, from Scryfall (scryfall.com), or card text from MTGJSON (mtgjson.com), when you choose to. They stay on your computer and are never uploaded anywhere by this app. Card images and text remain the property of their owners. The app does not sell them or put watermarks on them.', 'Scryfall is a separate service with its own terms (scryfall.com/docs/api). Data is provided by Scryfall. This app is not affiliated with Scryfall and Scryfall does not endorse it. Please keep the delay between requests the app uses.']],
  ['Rules', ['Game rules are implemented from the Magic: The Gathering Comprehensive Rules and official Oracle text and rulings. The app is a goldfish practice tool and is not a judge. It can be wrong or incomplete. For tournament play, the Comprehensive Rules, Oracle and the judges at your event are the authority.']],
  ['Privacy', ['There are no accounts, no tracking and no advertising. Your decks, settings, card data and images are stored only on your own computer. The app connects to the internet only to download card data and images from Scryfall or MTGJSON and to check for and download new versions from GitHub. Downloads happen when you ask for them. The update check also runs when the app starts; you can switch that off in the update window.']],
  ['No warranty', ['This software is provided "as is", without warranty of any kind, express or implied, including fitness for a particular purpose. The authors are not liable for any damage or loss arising from its use. Use it at your own risk.']],
  ['Third-party software', ['The desktop version is built with Electron, which is open source (MIT licence) and includes Chromium and other open-source components under their own licences.']]
];
function openSettings() {
  const m = modal('Settings', { width: 860 }); m.el.classList.add('settingsModal');
  const slider = (label, key, min, max, step, fmt) => {
    const val = h('span', { class: 'val', text: fmt(settings[key]) });
    const inp = h('input', { type: 'range', min, max, step, value: settings[key] });
    inp.addEventListener('input', () => { settings[key] = parseFloat(inp.value); val.textContent = fmt(settings[key]); saveSettings(); });
    return h('div', { class: 'setrow' }, h('label', { text: label }), inp, val);
  };
  const pct = v => Math.round(v * 100) + '%';
  const body = m.body;
  const sleeveBox = h('div');
  const sleeveFile = h('input',{type:'file',accept:'image/*',hidden:true});
  const gallery = (kind, list, cur, pick) => h('div', { class: 'artgal' }, [['', kind === 'sleeve' ? 'Classic' : 'Plain colour'], ...list].map(([id, label]) =>
    h('button', { class: 'arttile ' + kind + (cur === id ? ' on' : ''), title: label, onclick: () => pick(id) },
      h('span', { class: 'artimg', style: id ? `background-image:url("${artUrl(kind, id)}")` : '' }), h('span', { class: 'artlbl', text: label }))));
  const drawSleeve = () => sleeveBox.replaceChildren(
    h('div',{class:'small muted',text:'Built-in sleeves for your library pile'}),
    gallery('sleeve', SLEEVES, settings.sleevePreset || '', id => { settings.sleevePreset = id; saveSettings(); applySleeve(); drawSleeve(); }),
    h('div',{class:'setrow'},h('label',{text:'Custom card sleeve'}),h('button',{text:sleeveUrl?'Change sleeve':'Upload sleeve',onclick:()=>sleeveFile.click()}),sleeveFile),
    sleeveUrl ? h('div',{class:'setrow'},h('label',{text:'Status'}),h('button',{class:'tgl on',text:'Enabled',onclick:async()=>{try{URL.revokeObjectURL(sleeveUrl);}catch(e){} sleeveUrl=null;try{await idbDelete(['sleeve']);}catch(e){} applySleeve();drawSleeve();}})) : null
  );
  sleeveFile.addEventListener('change',async()=>{const f=sleeveFile.files[0];if(!f)return;if(sleeveUrl)URL.revokeObjectURL(sleeveUrl);sleeveUrl=URL.createObjectURL(f);try{await idbSet('sleeve',f);}catch(e){}applySleeve();drawSleeve();});
  drawSleeve();
  const matBox = h('div');
  const drawMat = () => {
    matBox.replaceChildren(h('div', { class: 'small muted', text: 'Built-in playmats (your own image, if switched on, is shown instead)' }), gallery('mat', MATS, settings.matPreset || '', id => { settings.matPreset = id; if (id) settings.custom = false; saveSettings(); drawMat(); }));
    const sw = h('div', { class: 'swatches' });
    for (const [k, bg] of Object.entries(THEMES)) {
      const b = h('button', { class: 'swatch' + (!settings.custom && settings.theme === k ? ' on' : ''), title: k, style: `background:${bg}` });
      b.addEventListener('click', () => { settings.theme = k; settings.custom = false; saveSettings(); drawMat(); });
      sw.append(b);
    }
    const file = h('input', { type: 'file', accept: 'image/*', hidden: true });
    file.addEventListener('change', async () => {
      const f = file.files[0]; if (!f) return;
      if (matUrl) URL.revokeObjectURL(matUrl);
      matUrl = URL.createObjectURL(f);
      settings.custom = true; saveSettings();
      try { await idbSet('playmat', f); } catch (e) { appNotice('Playmat', 'Applied, but it could not be saved. You will need to pick it again next time.'); }
      drawMat();
    });
    const fit = h('select');
    for (const [v, l] of [['cover', 'Fill (crop to fit)'], ['contain', 'Fit whole image'], ['stretch', 'Stretch']]) fit.append(h('option', { value: v, text: l }));
    fit.value = settings.fit;
    const motion = h('select'); for (const [v, l] of [['off', 'Still'], ['drift', 'Slow drift'], ['breathe', 'Breathing'], ['shimmer', 'Passing light'], ['parallax', 'Follow the mouse']]) motion.append(h('option', { value: v, text: l }));
    motion.value = settings.matMotion || 'off'; motion.addEventListener('change', () => { settings.matMotion = motion.value; saveSettings(); });
    fit.addEventListener('change', () => { settings.fit = fit.value; saveSettings(); });
    matBox.append(
      h('div', { class: 'setrow' }, h('label', { text: 'Colour' }), sw),
      h('div', { class: 'setrow' }, h('label', { text: 'Custom playmat' }),
        h('button', { text: matUrl ? 'Change image' : 'Upload image', onclick: () => file.click() }), file,
        matUrl ? h('button', { class: settings.custom ? 'tgl on' : 'tgl', text: settings.custom ? 'In use' : 'Use it', onclick: () => { settings.custom = !settings.custom; saveSettings(); drawMat(); } }) : '',
        matUrl ? h('button', { class: 'danger', text: 'Remove', onclick: async () => { settings.custom = false; if (matUrl) URL.revokeObjectURL(matUrl); matUrl = null; saveSettings(); try { await idbDelete(['playmat']); } catch (e) { /* ignore */ } drawMat(); } }) : ''),
      h('div', { class: 'setrow' }, h('label', { text: 'Image fit' }), fit),
      slider('Darken playmat', 'dim', 0, 0.85, 0.05, pct),
      h('div', { class: 'setrow' }, h('label', { text: 'Playmat motion' }), motion, h('span', { class: 'muted small', text: 'Slow drift · gentle breathing · a passing light · follows the mouse. Only the picture moves, never the cards.' })),
      slider('Motion speed', 'matSpeed', 0.25, 3, 0.25, v => v + '×'));
  };
  drawMat();
  const frameBox = h('div');
  const drawFrame = () => {
    frameBox.replaceChildren();
    const sw = h('div', { class: 'swatches' });
    for (const [k, f] of Object.entries(FRAMES)) {
      const c = k === 'custom' ? { a: settings.frameA, b: settings.frameB, c: settings.frameC || settings.frameA } : f;
      const bg = k === 'none' ? 'var(--panel-2)' : `linear-gradient(135deg, ${c.a}, ${c.b}, ${c.c || c.a})`;
      const b = h('button', { class: 'fswatch' + (settings.frame === k ? ' on' : ''), title: f.label }, h('span', { class: 'fsw-dot', style: `background:${bg}` }), h('span', { text: f.label }));
      b.addEventListener('click', () => { settings.frame = k; saveSettings(); drawFrame(); });
      sw.append(b);
    }
    const colA = h('input', { type: 'color', value: settings.frameA }), colB = h('input', { type: 'color', value: settings.frameB }), colC = h('input', { type: 'color', value: settings.frameC || settings.frameA });
    colA.addEventListener('input', () => { settings.frameA = colA.value; saveSettings(); });
    colB.addEventListener('input', () => { settings.frameB = colB.value; saveSettings(); });
    colC.addEventListener('input', () => { settings.frameC = colC.value; saveSettings(); });
    const anim = h('input', { type: 'checkbox' }); anim.checked = settings.frameAnim !== false;
    anim.addEventListener('change', () => { settings.frameAnim = anim.checked; saveSettings(); });
    frameBox.append(...[
      h('div', { class: 'setrow' }, h('label', { text: 'Board frame' }), sw),
      settings.frame === 'custom' ? h('div', { class: 'setrow' }, h('label', { text: 'Custom colours' }), colA, colB, colC, h('span', { class: 'muted small', text: 'Edge, highlight and accent (the glow follows the first)' })) : null,
      h('div', { class: 'setrow' }, h('label', { text: 'Animated glow' }), anim, h('span', { class: 'muted small', text: 'Slowly moving light around the frame (off = still outline)' })),
      slider('Frame glow strength', 'frameGlow', 0.1, 1, 0.05, pct)].filter(Boolean));
  };
  drawFrame();
  const teachBox=h('div');
  const teachDefs=[
    ['playability','Card playability indicators','Green/red/gold outlines and the instant-speed badge on cards in hand; green outline on permanents with an activated ability you can use now'],
    ['phaseBar','Phase window','Shows the current phase and the next one at the top of the table'],
    ['phasePopups','Phase explanations','Short pop-up explaining each phase or step as it begins'],
    ['phasePauses','Pause at phase/step starts','Stops the game at each step so triggers and priority can be handled'],
    ['autoStart','Auto-run start of turn','When pauses are off: untap, upkeep and draw happen by themselves'],
    ['preGame','Pre-game actions screen','Pause after keeping a hand for Leylines, Serum Powder and similar'],
    ['stackGuidance','Stack & priority guidance','Explains priority and opens the mana payment window; off = auto-pay'],
    ['vaultPrompt','Time Vault prompt','When you press Next turn while Time Vault (or a card like it) is tapped, ask whether to skip that turn and untap it. Off = just take the turn.'],
    ['autoResolve','Auto-apply obvious effects','When you press Resolve and exactly one clear effect applies (a +1/+1 counter, draw a card, 3 damage to your chosen target), it is applied at once. You are only asked when there is a real choice. Off = always show the effect window'],
    ['keywordIcons','Active keyword icons','Small icons on creatures for keywords they have right now from another permanent or a condition (wings = flying, wizard hat = hexproof…). Hover one for its name and source'],
    ['stateIcons','Game-state icons','A row of small pictures in the top bar (Storm, Monarch, Day/Night, Delirium, Threshold, Metalcraft, Poison…) that light up while that state applies. Hover one for the rule; the grey ones you set by clicking'],
    ['durationHints','Effect timers','Hourglass badge on permanents with a lasting effect, the explanation in the Active effects window, and a reminder when an effect tied to a source ends'],
    ['replaceNotes','Replacement-effect notes','Log line showing which replacement effects changed an event and in what order (the order choice itself is always asked when it matters)'],
    ['costGuidance','Cost explanations','Explains alternative costs, taxes and Delve/Convoke when you cast (the cost windows themselves always appear)'],
    ['triggerPrompts','Triggered ability prompts','Shows a window to order abilities that trigger together. Off: they still trigger, and go on the stack by themselves in the order they happened (you still pick their targets)'],
    ['gapBadges','Warning badge on cards with rules the app cannot apply','A small \u26a0 on a permanent when part of its rules text is only a reminder (hover it to see which lines)'],
    ['gapNotes','Log rules the app cannot apply','When a card enters, logs any of its rules the app only reminds you of'],
    ['dredgePrompts','Dredge prompt','When you would draw and have a dredge card in your graveyard, asks whether to dredge instead (the dredge rule itself is always correct)'],
    ['libraryPreview','Library card previews','Large card preview while hovering library lists'],
    ['combatHelper','Combat teaching helper','Attack and block guidance during combat, and the reminder when you skip attacking'],
    ['summoningSick','Summoning sickness indicator','Faint red glow and tooltip on creatures that cannot attack or use {T} abilities yet (the rule itself is always enforced)'],
    ['libraryMenu','Library menu tip','Hover tip on the library pile explaining that clicking it opens draw, scry, search and the other library actions (the menu itself always works)'],
    ['rulesHints','Rules hints','Explanations when an action is blocked'],
    ['keywordTips','Keyword explanations','Underlined keywords and keyword chips with hover explanations']
  ];
  // v0.99.40 the aids are grouped by when you meet them, two columns wide
  const TEACH_GROUPS=[['Turn flow',['phaseBar','phasePopups','phasePauses','autoStart','preGame','vaultPrompt','combatHelper']],
    ['Casting & the stack',['stackGuidance','costGuidance','autoResolve','triggerPrompts','dredgePrompts','replaceNotes']],
    ['On the cards',['playability','summoningSick','keywordIcons','keywordTips','stateIcons','durationHints','gapBadges']],
    ['Help & the log',['rulesHints','gapNotes','libraryPreview','libraryMenu']]];
  { const seen=new Set(TEACH_GROUPS.flatMap(g=>g[1])); const rest=teachDefs.map(d=>d[0]).filter(k=>!seen.has(k)); if(rest.length) TEACH_GROUPS.push(['More',rest]); }
  const drawTeaching=()=>{teachBox.replaceChildren(
    h('div',{class:'setrow'},h('button',{text:'Turn all on',onclick:()=>{for(const [k] of teachDefs)settings.teaching[k]=true;saveSettings();render();drawTeaching();}}),h('button',{text:'Turn all off',onclick:()=>{for(const [k] of teachDefs)settings.teaching[k]=false;saveSettings();render();drawTeaching();}})),
    ...TEACH_GROUPS.flatMap(([g,keys])=>[h('div',{class:'subhead',text:g}),h('div',{class:'setgrid'},keys.map(k=>teachDefs.find(d=>d[0]===k)).filter(Boolean).map(([k,label,desc])=>{
    const cb=h('input',{type:'checkbox'});cb.checked=settings.teaching[k]!==false;
    cb.addEventListener('change',()=>{settings.teaching[k]=cb.checked;saveSettings();render();});
    return h('label',{class:'teachopt'},cb,h('span',null,h('b',{text:label}),h('span',{class:'muted small',text:desc})));
  }))]))};
  drawTeaching();
  const animBox=h('div');
  const drawAnim=()=>{ animBox.replaceChildren(
    (()=>{ const cb=h('input',{type:'checkbox'}); cb.checked=settings.anim.on!==false; cb.addEventListener('change',()=>{settings.anim.on=cb.checked;saveSettings();render();}); return h('label',{class:'teachopt'},cb,h('span',null,h('b',{text:'Animations & effects'}),h('span',{class:'muted small',text:'Master switch. They only decorate: nothing here changes the game itself. Also off if your system asks for reduced motion.'}))); })(),
    h('div',{class:'setgrid'},ANIM_DEFS.map(([k,label,desc])=>{ const cb=h('input',{type:'checkbox'}); cb.checked=settings.anim[k]!==false; cb.addEventListener('change',()=>{settings.anim[k]=cb.checked;saveSettings();render();}); return h('label',{class:'teachopt'},cb,h('span',null,h('b',{text:label}),h('span',{class:'muted small',text:desc}))); })),
    (()=>{ const mk=(label,key,min,max,step,fmt,desc)=>{ const val=h('span',{class:'val',text:fmt(settings.anim[key])}); const r=h('input',{type:'range',min,max,step,value:settings.anim[key]}); r.addEventListener('input',()=>{settings.anim[key]=parseFloat(r.value);val.textContent=fmt(settings.anim[key]);saveSettings();if(key==='fanAmt')applyFan();}); return h('div',{class:'setrow'},h('label',{text:label}),r,val,h('span',{class:'muted small',text:desc})); };
      return h('div',{class:'animsl'},h('div',{class:'fhead',text:'Fine tuning'}),
        mk('Animation speed','speed',0.4,2.5,0.1,v=>v+'×','Higher = faster. Applies to every animation'),
        mk('Hand fan curve','fanAmt',0,2,0.1,v=>Math.round(v*100)+'%','How strongly the hand arcs (0 = flat row)'),
        mk('Sparkle amount','spark',0,2,0.25,v=>Math.round(v*100)+'%','How many sparks bursts and spell flashes throw (0 = none)'),
        mk('Spell spotlight size','spotSize',0.6,1.5,0.1,v=>Math.round(v*100)+'%','Size of the card shown when a spell is cast or resolves')); })()
  ); }; drawAnim();
  const themeBox=h('div'); themeBox.append((()=>{ const sel=h('select'); for(const [v,l] of UI_THEMES) sel.append(h('option',{value:v,text:l})); sel.value=settings.uiTheme||'default'; sel.addEventListener('change',()=>{settings.uiTheme=sel.value;saveSettings();}); return h('div',{class:'setrow'},h('label',{text:'Interface theme'}),sel,h('span',{class:'muted small',text:'Colours of the panels and buttons'})); })());
  themeBox.append((()=>{ const sel=h('select'); for(const st of UI_SETS) sel.append(h('option',{value:st.id,text:st.label})); sel.value=settings.uiSet||(UI_SETS.find(x=>x.ui===settings.uiTheme)||UI_SETS[0]).id;
    const mcb=h('input',{type:'checkbox'}); mcb.checked=settings.setMusic!==false; mcb.addEventListener('change',()=>{settings.setMusic=mcb.checked;saveSettings();});
    const go=h('button',{text:'Apply set',onclick:()=>applyUiSet(sel.value)});
    sel.addEventListener('change',()=>{const st=UI_SETS.find(x=>x.id===sel.value); note.textContent=st?st.note:'';});
    const note=h('span',{class:'muted small',text:(UI_SETS.find(x=>x.id===sel.value)||{}).note||''});
    return h('div',{class:'setrow'},h('label',{text:'One-click set'}),sel,go,h('label',{class:'muted small',style:'display:flex;gap:6px;align-items:center;white-space:nowrap'},mcb,'Matching music'),note); })());
  const P={}; for(const [k] of SET_TABS) P[k]=h('div',{class:'settab'}); P.mat=h('div',{class:'settab'}); P.snd=h('div',{class:'settab'}); P.layout=h('div');
  P.anim.append(animBox); P.a11y.append(buildA11yTab());
  { const box = h('div'), draw = () => {
      const mk = (v, label, desc) => { const r = h('input', { type: 'radio', name: 'laymode' }); r.checked = (settings.layoutMode || 'updated') === v; r.addEventListener('change', () => { settings.layoutMode = v; saveSettings(); applyLayout(); render(); draw(); });
        return h('label', { class: 'teachopt' }, r, h('span', null, h('b', { text: label }), ' \u2014 ' + desc)); };
      box.replaceChildren(
        h('div', { class: 'fhead', text: 'Board layout' }),
        mk('updated', 'Updated', 'two lanes, slim zone rail, slimmer right column, one pile per land name'),
        mk('original', 'Original', 'the arrangement from before v0.74. Switch back any time; the table changes immediately'),
        h('div', { class: 'fhead', text: 'Parts of the updated layout' }),
        h('div', { class: 'small muted', style: 'margin:-2px 0 6px', text: layMode() ? 'Each part has its own switch.' : 'These apply only when Updated is selected.' }),
        h('div', { class: 'setgrid' }, LAY_DEFS.map(([k, label, desc]) => { const cb = h('input', { type: 'checkbox' }); cb.checked = !(settings.lay && settings.lay[k] === false); cb.disabled = !layMode();
          cb.addEventListener('change', () => { settings.lay = { ...(settings.lay || {}), [k]: cb.checked }; saveSettings(); applyLayout(); render(); });
          return h('label', { class: 'teachopt' + (layMode() ? '' : ' dis'), style: layMode() ? '' : 'opacity:.5' }, cb, h('span', null, h('b', { text: label }), h('span', { class: 'muted small', text: desc }))); })),
        h('div', { class: 'small muted', style: 'margin-top:8px', text: 'Card sizes are under Look & feel; the playmat and the frame are further down this tab.' }));
    }; draw(); P.layout.append(box); }
  const foilBox=h('div');
  const drawFoil=()=>{ const sel=h('select'); for(const [v,l] of [['off','Off'],['some','Some cards (about 1 in 5)'],['all','Every card']]) sel.append(h('option',{value:v,text:l})); sel.value=settings.foil||'off';
    sel.addEventListener('change',()=>{settings.foil=sel.value;saveSettings();render();});
    const r=h('input',{type:'range',min:0.2,max:1,step:0.05}); r.value=settings.foilStr===undefined?0.6:settings.foilStr; r.addEventListener('input',()=>{settings.foilStr=+r.value;saveSettings();});
    foilBox.replaceChildren(h('div',{class:'setrow'},h('label',{text:'Foil effect'}),sel,h('span',{class:'muted small',text:'A rainbow holographic sheen that slowly sweeps over the card and follows your mouse'})),h('div',{class:'setrow'},h('label',{text:'Foil strength'}),r)); }; drawFoil();
  const curBox=h('div');
  const drawCursor=()=>{
    const sel=h('select'); for(const [v,l] of CURSOR_STYLES) sel.append(h('option',{value:v,text:l})); sel.value=settings.cursor||'default';
    sel.addEventListener('change',()=>{settings.cursor=sel.value;saveSettings();drawCursor();});
    const sz=h('select'); for(const [v,l] of [[24,'Small'],[32,'Medium'],[48,'Large']]) sz.append(h('option',{value:v,text:l})); sz.value=String(settings.cursorSize||32);
    sz.addEventListener('change',()=>{settings.cursorSize=+sz.value;saveSettings();});
    const file=h('input',{type:'file',accept:'image/*',hidden:true});
    file.addEventListener('change',()=>{ const f=file.files[0]; if(!f)return; const img=new Image(), u=URL.createObjectURL(f);
      img.onload=()=>{ const cv=document.createElement('canvas'); cv.width=cv.height=64; const cx=cv.getContext('2d'); const r=Math.min(64/img.width,64/img.height); cx.drawImage(img,(64-img.width*r)/2,(64-img.height*r)/2,img.width*r,img.height*r); settings.cursorImg=cv.toDataURL('image/png'); settings.cursor='custom'; URL.revokeObjectURL(u); saveSettings(); drawCursor(); };
      img.src=u; });
    const hot=h('select'); for(const [v,l] of [['tl','Top-left corner'],['center','Centre']]) hot.append(h('option',{value:v,text:l})); hot.value=settings.cursorHot||'tl';
    hot.addEventListener('change',()=>{settings.cursorHot=hot.value;saveSettings();});
    curBox.replaceChildren(h('div',{class:'setrow'},h('label',{text:'Cursor'}),sel,sz),
      settings.cursor==='custom'?h('div',{class:'setrow'},h('label',{text:'My image'}),h('button',{text:settings.cursorImg?'Change image':'Choose image',onclick:()=>file.click()}),file,h('label',{text:'Click point'}),hot,h('span',{class:'muted small',text:'Any picture; it is shrunk to a cursor. Transparent PNGs look best.'})):null);
  }; drawCursor();
  const soundBox=h('div');
  const drawSound=()=>{ soundBox.replaceChildren(
    (()=>{ const cb=h('input',{type:'checkbox'}); cb.checked=!!settings.sound.on; cb.addEventListener('change',()=>{settings.sound.on=cb.checked;saveSettings();musicSettingsChanged();try{if(!cb.checked)ambStop();else if(hallOpen())ambStart();}catch(e){}if(cb.checked)sfx('cast');}); return h('label',{class:'teachopt'},cb,h('span',null,h('b',{text:'Sound effects'}),h('span',{class:'muted small',text:'Master switch for all game sounds (made on the fly, no files, works offline)'}))); })(),
    (()=>{ const r=h('input',{type:'range',min:0,max:1,step:0.05}); r.value=settings.sound.vol; r.addEventListener('input',()=>{settings.sound.vol=+r.value;saveSettings();}); r.addEventListener('change',()=>sfx('draw')); return h('div',{class:'setrow'},h('label',{text:'Volume'}),r); })(),
    (()=>{ const cb=h('input',{type:'checkbox'}); cb.checked=settings.sound.ambience!==false; cb.addEventListener('change',()=>{settings.sound.ambience=cb.checked;saveSettings();try{if(hallOpen())ambStart();}catch(e){}}); return h('label',{class:'teachopt'},cb,h('span',null,h('b',{text:'Library room sounds'}),h('span',{class:'muted small',text:'A quiet sound for each Library room while it is open: torches in the dungeon, birds in the grove, wind in the castle.'}))); })(),
    (()=>{ const cb=h('input',{type:'checkbox'}); cb.checked=settings.sound.music!==false; cb.addEventListener('change',()=>{settings.sound.music=cb.checked;saveSettings();musicSettingsChanged();}); return h('label',{class:'teachopt'},cb,h('span',null,h('b',{text:'Background music'}),h('span',{class:'muted small',text:'A calm, never-ending ambient loop generated in the app. It starts after your first click.'}))); })(),
    (()=>{ const sel=h('select',null,h('option',{value:'ambient',text:'Calm ambient (pads and bells)'}),...Object.entries(LOFI_SONGS).map(([k,v])=>h('option',{value:k,text:v.label}))); sel.value=musicStyleId(); sel.addEventListener('change',()=>{settings.sound.musicStyle=sel.value;saveSettings();musicSettingsChanged();const d=document.querySelector('.modal .drums-opt');if(d)d.hidden=!LOFI_SONGS[sel.value];}); return h('div',{class:'setrow'},h('label',{text:'Music style'}),sel); })(),
    (()=>{ const cb=h('input',{type:'checkbox'}); cb.checked=settings.sound.musicBeat!==false; cb.addEventListener('change',()=>{settings.sound.musicBeat=cb.checked;saveSettings();}); return h('label',{class:'teachopt drums-opt',hidden:!LOFI_SONGS[settings.sound.musicStyle]},cb,h('span',null,h('b',{text:'Low-fi drums'}),h('span',{class:'muted small',text:'Kick, snare and hats in the low-fi and hip-hop songs. Turn off for just keys, bass and crackle.'}))); })(),
    (()=>{ const r=h('input',{type:'range',min:0,max:1,step:0.05}); r.value=settings.sound.musicVol; r.addEventListener('input',()=>{settings.sound.musicVol=+r.value;saveSettings();musicSettingsChanged();}); return h('div',{class:'setrow'},h('label',{text:'Music volume'}),r); })(),
    h('div',{class:'setgrid'},SOUND_DEFS.map(([k,label,desc])=>{ const cb=h('input',{type:'checkbox'}); cb.checked=settings.sound[k]!==false; cb.addEventListener('change',()=>{settings.sound[k]=cb.checked;saveSettings();if(cb.checked)sfx(k);}); return h('label',{class:'teachopt'},cb,h('span',null,h('b',{text:label}),h('span',{class:'muted small',text:desc}))); }))
  ); }; drawSound();
  P.snd.append(h('div',{class:'fhead',text:'Sound'}),soundBox);
  P.legal.append(h('div',{class:'fhead',text:'Legal notice'}), ...LEGAL_SECTIONS.flatMap(([t, ps]) => [h('div',{class:'legalhead',text:t}), ...ps.map(x => h('div',{class:'psub legalp',text:x}))]));
  P.tutor.append(h('div',{class:'fhead',text:'Teaching aids'}),h('div',{class:'small muted',text:'Every aid is its own switch. Mix and match; none depends on another.'}),teachBox);
  P.gfx.append(
    h('div',{class:'fhead',text:'Interface theme'}),themeBox,
    h('div',{class:'fhead',text:'Card size'}),
    slider('Battlefield cards', 'bfs', 0.6, 1.6, 0.05, pct),
    slider('Hand cards', 'hs', 0.6, 1.6, 0.05, pct),
    slider('Turn-flow bar opacity', 'stripOpacity', 0.15, 1, 0.05, pct),
    h('div',{class:'fhead',text:'Foil cards'}),foilBox,
    h('div',{class:'fhead',text:'Card sleeves'}), sleeveBox,
    h('div',{class:'fhead',text:'Mouse cursor'}),curBox);
  P.board.append(
    P.layout,
    h('div', { class: 'fhead', text: 'Board effects' }),
    h('div', { class: 'setgrid' }, LAYOUT_DEFS.map(([k, label, desc]) => { const cb = h('input', { type: 'checkbox' }); cb.checked = layoutOn(k); cb.addEventListener('change', () => { settings.layout[k] = cb.checked; saveSettings(); render(); }); return h('label', { class: 'teachopt' }, cb, h('span', null, h('b', { text: label }), h('span', { class: 'muted small', text: desc }))); })));
  P.mat.append(
    h('div', { class: 'fhead', text: 'Playmat' }),
    matBox,
    slider('Zone panel opacity', 'zonea', 0, 0.7, 0.02, pct),
    h('div', { class: 'fhead', text: 'Board frame' }),
    frameBox,
    h('div', { class: 'small muted', style: 'margin-top:8px', text: 'Playmat images are stored in this browser only, so they work offline.' }));
  // v0.99.70 fold the merged panes in, and fill the two new tabs
  P.board.append(h('div', { class: 'fhead', text: 'Playmat & frame' }), ...[...P.mat.childNodes].filter(n => !(n.classList && n.classList.contains('fhead') && n.textContent === 'Playmat'))); delete P.mat;
  P.anim.append(h('div', { class: 'fhead', text: 'Sound' }), ...P.snd.childNodes); delete P.snd;
  P.lib.append(buildHallLook(), h('div', { class: 'fhead', text: 'Start-up' }),
    (() => { const cb = h('input', { type: 'checkbox' }); cb.checked = lsGet(HALL_KEY, true) !== false; cb.addEventListener('change', () => lsSet(HALL_KEY, cb.checked)); return h('label', { class: 'teachopt' }, cb, h('span', null, h('b', { text: 'Open the Library when the app starts' }), h('span', { class: 'muted small', text: ' \u2014 otherwise the app opens straight at the table' }))); })());
  { const go = (t, d, f) => h('div', { class: 'setrow' }, h('label', { text: t }), h('button', { text: 'Open\u2026', onclick: () => { m.close(); f(); } }), h('span', { class: 'muted small', text: d }));
    const upd = (k, t) => { const cb = h('input', { type: 'checkbox' }); cb.checked = settings[k] !== false; cb.addEventListener('change', () => { settings[k] = cb.checked; saveSettings(); }); return h('label', { class: 'teachopt' }, cb, h('span', null, h('b', { text: t }))); };
    P.data.append(h('div', { class: 'fhead', text: 'Card data' }), go('Card data', `Names, costs and rules text (${cardCount ? cardCount.toLocaleString() + ' cards loaded' : 'not loaded yet'})`, openCardData), go('Card pictures', 'Download pictures, or play with text cards', openImages),
      h('div', { class: 'fhead', text: 'Updates' }), window.desktop ? go('Update app', 'Check GitHub for a new version and install it', () => openUpdate()) : h('div', { class: 'setrow' }, h('span', { class: 'muted small', text: 'The web app updates itself the next time it is opened.' })),
      ...(window.desktop ? [upd('autoUpdateCheck', 'Check for updates when the app starts'), upd('updatePrompt', 'Open the update window when an update is found (otherwise a small notice)')] : [])); }
  // v0.89: sidebar of tabs, a title for each tab, and a search box that filters every tab at once.
  const tabbar = h('div', { class: 'setnav' }), stage = h('div', { class: 'setmain' });
  const search = h('input', { type: 'search', class: 'setsearch', placeholder: 'Search settings' });
  // v0.99.40 search looks inside every group: each setting row is matched on its own, and a heading or group stays only while something under it matches
  const LEAF = '.setrow, .teachopt, .legalp, .artgal';
  const applyFilter = q => {
    q = q.trim().toLowerCase();
    for (const k of Object.keys(P)) { if (k === 'layout') continue;
      for (const el of P[k].querySelectorAll('[data-fhid]')) { el.hidden = false; delete el.dataset.fhid; }
      if (!q) continue;
      const hide = el => { if (!el.hidden) { el.hidden = true; el.dataset.fhid = '1'; } };
      const leaves = [...P[k].querySelectorAll(LEAF)].filter(el => !el.parentElement.closest(LEAF));
      for (const el of leaves) if (!el.textContent.toLowerCase().includes(q)) hide(el);
      const shown = el => [...el.querySelectorAll(LEAF)].some(x => !x.hidden && !x.closest('[hidden]'));
      for (const el of [...P[k].querySelectorAll('div, label')].reverse()) { if (el.matches(LEAF) || el.closest(LEAF) || el.matches('.fhead, .subhead')) continue; if (!shown(el)) hide(el); }
      for (const hd of P[k].querySelectorAll('.fhead, .subhead')) { let any = false; for (let n = hd.nextElementSibling; n && !n.matches(hd.matches('.fhead') ? '.fhead' : '.fhead, .subhead'); n = n.nextElementSibling) if (!n.hidden && (n.matches(LEAF) || shown(n))) { any = true; break; } if (!any) hide(hd); }
    }
  };
  const showTab = k => {
    settingsTab = k; search.value = ''; applyFilter('');
    for (const b of tabbar.querySelectorAll('.settabbtn')) b.classList.toggle('on', b.dataset.k === k);
    const lbl = SET_TABS.find(t => t[0] === k)[1];
    stage.replaceChildren(h('div', { class: 'settitle' }, h('h3', { text: lbl }), h('div', { class: 'muted small', text: TAB_INFO[k][1] })), P[k]); stage.scrollTop = 0;
  };
  search.addEventListener('input', () => {
    const q = search.value; for (const b of tabbar.querySelectorAll('.settabbtn')) b.classList.remove('on');
    if (!q.trim()) { showTab(settingsTab); search.focus(); return; }
    applyFilter(q);
    const out = [];
    for (const [k, label] of SET_TABS) { if (![...P[k].querySelectorAll(LEAF)].some(el => !el.hidden && !el.closest('[hidden]'))) continue; out.push(h('div', { class: 'settitle' }, h('h3', { text: label })), P[k]); }
    stage.replaceChildren(...(out.length ? out : [h('div', { class: 'muted', style: 'padding:18px 4px', text: 'No setting matches \u201c' + q + '\u201d.' })])); stage.scrollTop = 0;
  });
  tabbar.append(search);
  for (const [k, label] of SET_TABS) tabbar.append(h('button', { class: 'settabbtn', 'data-k': k, onclick: () => showTab(k) }, h('span', { class: 'ti', text: TAB_INFO[k][0] }), h('span', { text: label })));
  const shell = h('div', { class: 'setshell' }, tabbar, stage);
  body.append(shell); { const t0 = SET_TAB_ALIAS[settingsTab] || settingsTab; showTab(P[t0] ? t0 : 'gfx'); }
  m.foot.append(
    h('button', { text: 'Welcome tour', title: 'Run the first-launch walkthrough again', onclick: () => { m.close(); openWelcome(); } }),
    h('button', { text: 'Reset to defaults', onclick: () => { Object.assign(settings, SET_DEFAULT); delete settings.a11y; saveSettings(); applyA11y(); m.close(); openSettings(); } }),
    h('button', { class: 'primary', text: 'Close', onclick: () => m.close() }));
}

