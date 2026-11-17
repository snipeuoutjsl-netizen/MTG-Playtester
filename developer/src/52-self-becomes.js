// ---------------------------------------------------------------- v0.96.23 rules-text reading: a permanent's own "is a N/N ... creature" static ability
// CR 613.1d (type-changing effects), CR 613.4b (P/T-setting effects), CR 611.3a (a static ability's effect applies as long as its conditions are true).
// Reads lines like:  "During your turn, as long as Kaito has one or more loyalty counters on him, he's a 3/4 Ninja creature and has hexproof."
//                    "As long as you control a Demon, ~ is a 4/4 Dragon creature with flying."   "As long as it's your turn, Gideon is a 5/5 Human Soldier creature with indestructible."
// No card names appear here: the line is understood from its words, then the condition is evaluated each time the card is read.
const SB_COND = [
  // [pattern, (match, card) => true/false]
  [/^(?:it'?s|it is) your turn$/i, () => true],   // goldfish: it is always your turn
  [/^.+? (?:has|have) (one|a|an|\d+) or more ([\w+\/-]+) counters? on (?:him|her|it|them|~|this \w+)$/i, (m, c) => { const n = /^\d+$/.test(m[1]) ? +m[1] : 1, k = m[2].toLowerCase(); return (k === 'loyalty' ? (c.loyalty || 0) : counterCount(c, k === '+1/+1' ? 'plus' : k)) >= n; }],
  [/^you control (an?|one|two|three|\d+) ?(?:or more )?(.+)$/i, (m, c) => { const n = /^\d+$/.test(m[1]) ? +m[1] : ({ two: 2, three: 3 }[m[1].toLowerCase()] || 1); let ps = null; try { ps = parseSubject('each ' + m[2].replace(/s$/i, '') + ' you control', c); } catch (e) { ps = null; } if (!ps) return null; return state.battlefield.filter(x => x.id !== c.id && ps.test(x)).length >= n; }],
  [/^you have (\d+) or more life$/i, m => state.life >= +m[1]],
  [/^you have (\d+) or less life$/i, m => state.life <= +m[1]],
  [/^an opponent has (\d+) or less life$/i, m => (state.oppLife ?? 20) <= +m[1]],
  [/^an opponent has (\d+) or more life$/i, m => (state.oppLife ?? 20) >= +m[1]],
];
const SB_SUBJ = '(?:~|he|she|it)';
const SB_RE = new RegExp("^([Dd]uring your turn,\\s*)?(?:[Aa]s long as ([^,]+?),\\s*)?([Dd]uring your turn,\\s*)?" + SB_SUBJ + "(?:'s|\\u2019s| is| are)\\s+an?\\s+(?:(\\d+)\\/(\\d+)\\s+)?((?:[A-Za-z-]+\\s+)*?)creature\\b(?:\\s+(?:with|and has|and gains)\\s+(.+?))?\\.?$");
const SB_KW_RE = new RegExp("^(?:[Aa]s long as ([^,]+?),\\s*)?" + SB_SUBJ + " (?:has|have|gains) ([a-z ,]+?)(?: as long as (.+?))?\\.?$");
const SB_NOBLOCK_RE = new RegExp("^(?:[Aa]s long as ([^,]+?),\\s*)?" + SB_SUBJ + " can't block(?: as long as (.+?))?\\.?$");
const SB_COLORS = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
const sbKwList = t => String(t || '').split(/,\s*|\s+and\s+/).map(x => x.trim().toLowerCase()).filter(Boolean);
// Reads ONE rules line (the card's own name already replaced by ~) and returns a spec, or null.
function sbParseLine(line) {
  line = String(line || '').trim(); if (!line || /:/.test(line.replace(/"[^"]*"/g, '')) || /^(When|Whenever|At|Until|Equipped|Enchanted)\b/i.test(line)) return null;
  let m = line.match(SB_RE);
  if (m) {
    const words = (m[6] || '').trim().split(/\s+/).filter(Boolean), types = ['creature'], subs = [], col = [];
    for (const w of words) { const lw = w.toLowerCase(); if (SB_COLORS[lw]) col.push(SB_COLORS[lw]); else if (/^(artifact|enchantment|land)$/.test(lw)) types.push(lw); else if (lw === 'legendary') continue; else subs.push(lw); }
    const kws = m[7] ? sbKwList(m[7]).filter(x => GRANTABLE.includes(x)) : [];
    return { becomes: true, myTurn: !!(m[1] || m[3]), cond: m[2] || '', pt: m[4] ? m[4] + '/' + m[5] : '', types, subs, col, kws };
  }
  if ((m = line.match(SB_NOBLOCK_RE))) return { cantBlock: true, cond: m[1] || m[2] || '', kws: [] };
  if ((m = line.match(SB_KW_RE))) { const kws = sbKwList(m[2]); if (kws.length && kws.every(x => GRANTABLE.includes(x))) return { kws, cond: m[1] || m[3] || '' }; }
  return null;
}
function sbParse(name, tx) {
  const re = selfNameRe(name), out = [];
  for (const raw of String(tx || '').replace(/\([^)]*\)/g, '').split('\n')) { const sp = sbParseLine(raw.trim().replace(re, '~')); if (sp) out.push(sp); }
  return out;
}
const sbMemo = new Map();
// The currently active specs of a permanent on the battlefield (each spec's condition is evaluated now).
function sbActive(c) {
  if (!c || c.token || !state || !state.battlefield.includes(c)) return [];
  const info = cardInfo(c.name); if (!info || !info.tx) return [];
  let specs = sbMemo.get(c.name); if (!specs) { specs = sbParse(c.name, info.tx); sbMemo.set(c.name, specs); }
  const out = [];
  for (const s of specs) {
    if (s.cond) { let ok = null; const cond = s.cond.replace(/[\u2019]/g, "'").trim(); for (const [re, fn] of SB_COND) { const m = cond.match(re); if (m) { ok = fn(m, c); break; } } if (!ok) continue; }
    out.push(s);
  }
  return out;
}
const selfBecomes = c => sbActive(c).find(s => s.becomes) || null;
const sbKeywords = c => sbActive(c).flatMap(s => s.kws || []);
const sbCantBlock = c => sbActive(c).some(s => s.cantBlock);
