// ---- Spacecraft and Station (CR 702.184, 721)
// Station: "Tap another untapped creature you control: Put charge counters equal to its power on this Spacecraft. Station only as a sorcery."
// STATION N+ lines (CR 721.2): while it has N or more charge counters it has the abilities printed under that symbol; the highest reached one with a power/toughness makes it an artifact creature with that P/T.
// Oracle text (Scryfall) writes each station symbol as "N+ | ability" with the Spacecraft's power/toughness in the card's P/T box, and the reminder
// "It's an artifact creature at N+." names the threshold that box belongs to; an older form wrote "STATION N+" on its own line with the P/T under it. Both are read.
// Lines that follow a station line without a threshold of their own belong to that station box (CR 721.2a).
const STATION_RE = /^STATION\s+(\d+)\+?\s*$/i, STATION_BAR = /^(\d+)\+\s*\|\s*(.*)$/;
function stationSections(c) {
  if (!c) return null; let raw; try { raw = stripAW(cardTextRaw(c)); } catch (e) { return null; }
  const lines = String(raw || '').split('\n'); const isSec = l => STATION_RE.test(l.trim()) || STATION_BAR.test(l.trim());
  const first = lines.findIndex(isSec); if (first < 0) return null;
  const secs = []; let cur = null; for (let i = first; i < lines.length; i++) { const l = lines[i].trim(); const m = STATION_RE.exec(l), b = STATION_BAR.exec(l);
    if (m) { cur = { n: +m[1], lines: [], pt: '' }; secs.push(cur); }
    else if (b) { cur = { n: +b[1], lines: b[2] ? [b[2]] : [], pt: '' }; secs.push(cur); }
    else if (cur) { if (/^\d+\/\d+$/.test(l)) cur.pt = l; else if (l) cur.lines.push(l); } }
  if (secs.length && !secs.some(x => x.pt)) {   // the P/T box: the printed power/toughness goes with the threshold the reminder names, else the highest one
    const info = cardInfo(c.name) || {}; if (info.pt) { let rt = raw; try { rt = cardTextRaw(c); } catch (e) {} const at = String(rt).match(/artifact creature at (\d+)\+/i); const sec = (at && secs.find(x => x.n === +at[1])) || secs[secs.length - 1]; sec.pt = info.pt; } }
  return { base: lines.slice(0, first), secs };
}
const stationCharge = c => counterCount(c, 'charge');
function stationText(c, txt) {   // only the lines whose threshold is reached count as the card's text
  if (!c || !/\bSTATION\s+\d|^\d+\+\s*\|/im.test(txt || '')) return txt; const st = stationSections(Object.assign({}, c, { gained: [], splicedTx: '' })); if (!st) return txt;
  const n = stationCharge(c), out = st.base.slice(); for (const s of st.secs) if (n >= s.n) out.push(...s.lines);
  return out.join('\n') + (c.gained && c.gained.length ? '\n' + c.gained.join('\n') : '');
}
function stationPT(c) { if (!c || c.token || !state) return ''; const t = ((cardInfo(c.name) || {}).t || ''); if (!/\bSpacecraft\b/.test(t)) return ''; const st = stationSections(c); if (!st) return ''; const n = stationCharge(c); let pt = ''; for (const s of st.secs) if (n >= s.n && s.pt) pt = s.pt; return pt; }
const stationCands = sp => state.battlefield.filter(x => x.id !== sp.id && !x.tapped && permTypeInfo(x).types.has('creature'));
function stationPick(sp, cb) {
  const cands = stationCands(sp); if (!cands.length) { toast('Cannot station', 'You need another untapped creature you control to tap.'); return; }
  openPickCards({ title: `${sp.name}: Station`, note: 'Tap another untapped creature you control. The Spacecraft gets charge counters equal to its power. Summoning-sick creatures can do this.', cards: cands, min: 1, max: 1,
    done: picked => { const x = picked[0], n = Math.max(0, powerOf(x).n); snap(); x.tapped = true; log(`${sp.name}: stationed by tapping ${x.name} (power ${n})`); cb(n); } });
}
