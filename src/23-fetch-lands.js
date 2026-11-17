// ---------------------------------------------------------------- fetch lands
const BASIC_TYPES = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'];
const FETCH_FALLBACK = {
  'wooded foothills': 'Mountain Forest', 'flooded strand': 'Plains Island', 'arid mesa': 'Mountain Plains',
  'bloodstained mire': 'Swamp Mountain', 'verdant catacombs': 'Swamp Forest', 'polluted delta': 'Island Swamp',
  'windswept heath': 'Forest Plains', 'marsh flats': 'Plains Swamp', 'scalding tarn': 'Island Mountain',
  'misty rainforest': 'Forest Island'
};
const LAND_TYPES_FALLBACK = {
  'blood crypt': 'Swamp Mountain', 'stomping ground': 'Mountain Forest', 'overgrown tomb': 'Swamp Forest',
  'temple garden': 'Forest Plains', 'breeding pool': 'Forest Island', 'hallowed fountain': 'Plains Island',
  'steam vents': 'Island Mountain', 'watery grave': 'Island Swamp', 'godless shrine': 'Plains Swamp', 'sacred foundry': 'Mountain Plains',
  'indatha triome': 'Plains Swamp Forest', 'raugrin triome': 'Island Mountain Plains', 'ketria triome': 'Forest Island Mountain',
  'savai triome': 'Swamp Mountain Plains', 'zagoth triome': 'Swamp Forest Island'
};
const SHOCKS = new Set(['blood crypt', 'stomping ground', 'overgrown tomb', 'temple garden', 'breeding pool', 'hallowed fountain', 'steam vents', 'watery grave', 'godless shrine', 'sacred foundry']);

function fetchInfo(c) {
  if (!c || c.token) return null;
  const info = cardInfo(c.name);
  const k = norm(c.name);
  const m = info && info.tx && info.tx.match(/search your library for an? (.+?) card/i);
  if (m && /sacrifice/i.test(info.tx) && info.land) {
    const types = (m[1].match(/Plains|Island|Swamp|Mountain|Forest/g) || []);
    const basic = /basic land/i.test(m[1]);
    if (types.length || basic) return { types: basic ? BASIC_TYPES : types, basicOnly: basic, life: /pay 1 life/i.test(info.tx), tapped: /enters tapped|onto the battlefield tapped/i.test(info.tx) };
  }
  if (FETCH_FALLBACK[k]) return { types: FETCH_FALLBACK[k].split(' '), basicOnly: false, life: true, tapped: false };
  return null;
}

function baseLandTypesOf(name) {
  const k = norm(name);
  const info = cardInfo(name);
  if (info && info.land) {
    const after = info.t.split(' // ')[0].split('—')[1] || '';
    const t = after.match(/Plains|Island|Swamp|Mountain|Forest/g) || [];
    return { types: t, basic: /\bBasic\b/.test(info.t) };
  }
  if (LAND_TYPES_FALLBACK[k]) return { types: LAND_TYPES_FALLBACK[k].split(' '), basic: false };
  const b = BASIC_TYPES.find(x => x.toLowerCase() === k.replace(/^snow-covered /, ''));
  if (b) return { types: [b], basic: true };
  return { types: null, basic: false };
}

// Battlefield-wide land-type effects. These are evaluated from permanents
// currently on the battlefield, so the effect updates immediately when the
// source enters/leaves play.
function landTypeEffects() {
  const all = new Set();
  let bloodMoon = false;
  if (!state) return { all: false, add: [], override: false };
  for (const c of state.battlefield) {
    const tx = cardText(c);
    if (/(?:each land|lands) you control (?:is|are) every basic land type/i.test(tx) || /\b(?:each|all) lands? (?:is|are) every basic land type/i.test(tx)) {
      BASIC_TYPES.forEach(t => all.add(t));
    }
    if (/each land is a swamp/i.test(tx)) all.add('Swamp');
    if (/each land is a forest/i.test(tx)) all.add('Forest');
    if (/nonbasic lands are mountains/i.test(tx)) bloodMoon = true;
  }
  return { all: all.size === 5, add: [...all], override: bloodMoon };
}

function effectiveLandTypes(c) {
  const base = baseLandTypesOf(c.name);
  if (!base.types) return { types: [], basic: false, override: false };
  const fx = landTypeEffects();
  const nonbasic = !base.basic;
  if (fx.override && nonbasic) return { types: ['Mountain'], basic: false, override: true };
  const types = [...new Set([...base.types, ...fx.add])];
  return { types, basic: base.basic, override: false };
}

function landTypesOf(name) {
  return effectiveLandTypes({name});
}

function domainTypeList() {
  if (!state) return [];
  if (domainAllTypes()) return [...BASIC_TYPES];
  const types = new Set();
  for (const c of state.battlefield) {
    if (!isLandName(c.name)) continue;
    const lt = landTypesOf(c.name);
    if (lt.types) for (const t of lt.types) if (BASIC_TYPES.includes(t)) types.add(t);
  }
  return [...types];
}
function domainCount() {
  if (!state) return 0;
  if (domainAllTypes()) return 5;
  const types = new Set();
  for (const c of state.battlefield) {
    if (!isLandName(c.name)) continue;
    const lt = landTypesOf(c.name);
    if (lt.types) for (const t of lt.types) if (BASIC_TYPES.includes(t)) types.add(t);
  }
  return types.size;
}
function domainAllTypes() {
  return !!state && landTypeEffects().all;
}

// A card in the LIBRARY has only its printed land types. Leyline of the Guildpact, Dryad of the Ilysian Grove,
// Prismatic Omen, Urborg, Yavimaya and Blood Moon only change lands on the battlefield, so they never
// widen or narrow what a fetch land can find.
function canFetch(name, fi) {
  if (!isLandName(name)) return false;
  const lt = baseLandTypesOf(name);
  if (!lt.types) return false;
  if (fi.basicOnly) return !!lt.basic;
  return lt.types.some(t => fi.types.includes(t));
}

function fetchLand(fetchId, targetId, opts) {
  const f = findCard(fetchId);
  if (!f || f.zone !== 'battlefield') return;
  if (f.card.tapped) { toast('Cannot fetch', 'Fetch lands have {T} in their cost, so the land must be untapped.'); return; }
  const fi = fetchInfo(f.card);
  snap();
  const fc = f.card;
  leaveBattlefield(fc, 'graveyard');
  let msg = `${fc.name}: sacrificed`;
  if (fi && fi.life) { state.life--; msg += ', paid 1 life'; }
  if (targetId) {
    const i = state.library.findIndex(c => c.id === targetId);
    if (i >= 0) {
      const [t] = state.library.splice(i, 1);
      const info = cardInfo(t.name);
      const tx = info ? info.tx : '';
      const k = norm(t.name);
      const shock = (!info && SHOCKS.has(k)) || shockLife(t) > 0 || /pay 2 life/i.test(tx);
      let tp = shock ? false : etbTapped(t).tapped;   // the shockland question is asked as it enters
      if (fi && fi.tapped) {
        tp = true; msg += ', put onto the battlefield tapped';
        const um = cardText(fc).match(/if you control (\w+) or more lands, untap that land/i);
        const need = um && ({ three: 3, four: 4, five: 5 })[um[1].toLowerCase()];
        if (need && state.battlefield.filter(x => isLandName(x.name)).length + 1 >= need) { tp = false; msg += ' then untapped it (you control enough lands)'; }
      }
      enterBattlefield(t, { from: 'library', tapped: tp });
      msg += ` → fetched ${t.name}${t.tapped ? ' (tapped)' : ''}`;
    }
  } else msg += ', found nothing';
  shuffle(state.library);
  log(msg + '; shuffled');
  render();
  flushTriggers();
}

function openFetch(c) {
  if (!state) return;
  const fi = fetchInfo(c);
  if (!fi) return;
  const all = domainAllTypes();   // only used for the explanatory note below
  const m = modal(`${c.name}: search your library`, { width: 760 });
  const hideChk = h('input', { type: 'checkbox' });
  const groups = new Map();
  for (const x of state.library) { const g = groups.get(x.name) || { name: x.name, ids: [] }; g.ids.push(x.id); groups.set(x.name, g); }
  const list = [...groups.values()].map(g => ({ ...g, ok: canFetch(g.name, fi), land: isLandName(g.name) }));
  const out = h('div');
  const draw = () => {
    out.replaceChildren();
    const sec = (label, items, cls) => {
      if (!items.length) return;
      out.append(h('div', { class: 'fhead', text: label }));
      const grid = h('div', { class: 'fetchgrid' });
      for (const it of items) {
        const lt = baseLandTypesOf(it.name);   // printed types: what the card is while it is in the library
        const row = h('div', { class: 'frow ' + cls, title: it.ok ? 'Click to fetch' : '' },
          h('span', { class: 'q', text: it.ids.length + '×' }),
          h('span', { class: 'nm', text: it.name }),
          h('span', { class: 'ty', text: it.land && lt.types ? lt.types.join(' ') : '' }));
        if(teach('libraryPreview')) row.addEventListener('mouseenter',()=>showPreview(state.library.find(x=>x.id===it.ids[0]) || {name:it.name}));
        if (it.ok) row.addEventListener('click', () => { m.close(); fetchLand(c.id, it.ids[0], {}); });
        grid.append(row);
      }
      out.append(grid);
    };
    const byName = (a, b) => a.name.localeCompare(b.name);
    sec(`Can fetch (${list.filter(x => x.ok).length})`, list.filter(x => x.ok).sort(byName), 'on');
    if (!hideChk.checked) {
      sec('Other lands', list.filter(x => !x.ok && x.land).sort(byName), 'off');
      sec('Other cards', list.filter(x => !x.ok && !x.land).sort(byName), 'off');
    }
  };
  hideChk.addEventListener('change', draw);
  const what = fi.basicOnly ? 'a basic land' : fi.types.join(' or ') + ' card';
  m.body.append(
    h('div', { class: 'small muted', text: `Search for ${what}${all ? ' (Leyline / Dryad / Prismatic Omen only changes lands on the battlefield, so lands in your library still have just their printed types)' : ''}. Click a highlighted land to put it onto the battlefield.` }),
    h('div', { style: 'margin-top:6px;display:flex;gap:16px;flex-wrap:wrap' },
      h('div', { class: 'muted small', text: 'A fetched shockland asks whether to pay 2 life as it enters; surveil lands run their surveil.' }),
      h('label', { class: 'chk' }, hideChk, ' Hide cards that cannot be fetched')),
    out);
  draw();
  m.foot.append(
    h('button', { text: 'Sacrifice, find nothing', onclick: () => { m.close(); fetchLand(c.id, null, {}); } }),
    h('button', { class: 'primary', text: 'Cancel', onclick: () => m.close() }));
}

