// ---- Class enchantments (CR 716)
// 716.2a "[Cost]: Level N" means "[Cost]: This Class's level becomes N. Activate only if this Class is level N-1 and only as a sorcery."
// 716.2b The abilities printed after a level line are that level's abilities: the Class has them only while its level is N or greater.
// 716.2c "When this Class becomes level N" triggers when the level ability resolves. 716.3 A Class enters at level 1.
const CLASS_LEVEL_RE = /^((?:\{[^}]+\})+):\s*Level (\d+)$/i;
function isClassCard(c) { const t = c && !c.token ? ((cardInfo(c.name) || {}).t || '') : ''; return /\bClass\b/.test(t) && /\bEnchantment\b/.test(t); }
const classLevelOf = c => Math.max(1, (c && c.classLevel) || 1);
function classText(c, txt) {   // only the level sections the Class has reached are its text; the level lines themselves always are
  if (!txt || !isClassCard(c) || !/:\s*Level \d+\s*$/im.test(txt)) return txt;
  const lv = classLevelOf(c), out = []; let cur = 1;
  for (const line of String(txt).split('\n')) { const m = CLASS_LEVEL_RE.exec(line.trim()); if (m) { cur = +m[2]; out.push(line); continue; } if (cur <= lv) out.push(line); }
  return out.join('\n');
}
function classLevelOptions(tx, obj) {
  const m = String(tx || '').trim().match(/^(?:~|this Class)(?:'s level)? becomes level (\d+)\.(?:\s*Activate only as a sorcery\.)?$/i); if (!m || !obj) return null;
  const n = +m[1], name = obj.sourceName || 'Class';
  return [{ full: true, label: `${name} becomes level ${n}`, fn: () => {
    const f = findCard(obj.sourceId); if (!f || f.zone !== 'battlefield') { toast('Already gone', `${name} is no longer on the battlefield.`); return; }
    if (classLevelOf(f.card) !== n - 1) { log(`${name}: already level ${classLevelOf(f.card)}, so level ${n} does nothing`); return; }
    snap(); f.card.classLevel = n; log(`${name} is now level ${n} (CR 716)`); fireTrigger('class-level', { card: f.card, level: n }); render(); flushTriggers();
  } }];
}
