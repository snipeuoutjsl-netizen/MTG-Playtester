// ---------------------------------------------------------------- v0.99.62 rules batch 1 (from the coverage scan of every Modern card)
// Mass damage (CR 120): "~ deals N damage to each creature [and each player]" with the usual qualifiers. Your opponent's creatures are not
// on this table, so damage to them is only logged; your creatures are marked and the state-based actions do the rest.
function massDamageOptions(tx, obj) {
  const t = String(tx || '').replace(/\([^)]*\)/g, ' ').replace(/’/g, "'").replace(/\s+/g, ' ').trim();
  const nm = String((obj && obj.sourceName) || '').split(' // ')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp('^(?:~|it|this spell|this creature|this enchantment|this artifact|[A-Z][\\w\',-]*(?: [A-Z\\d][\\w\',-]*| of| the| to| and| in| from| a)*' + (nm ? '|' + nm : '') + ') deals (\\d+|x) damage to each (.+?)\\.?$', 'i').exec(t); if (!m) return null;
  const n = /^x$/i.test(m[1]) ? +((obj && obj.xValue) || 0) : +m[1], who = m[2].toLowerCase(), src = (obj && obj.sourceName) || 'It';
  const parts = who.split(/,\s*|\s+and\s+(?:each\s+)?/).map(x => x.replace(/^each\s+/, '').trim()).filter(Boolean);
  const KNOWN = /^(?:(?:other |non-?[a-z]+ |tapped |untapped |attacking |blocking )*creatures?(?: you control| you don't control| your opponents control)?(?: with(?:out)? (?:flying|reach))?|players?|opponents?|planeswalkers?(?: you control| your opponents control)?|creature and planeswalker[a-z ']*|other players?)$/;
  if (!parts.length || !parts.every(p => KNOWN.test(p))) return null;
  const run = () => {
    const me = obj && obj.sourceId;
    for (const p of parts) {
      if (/creature/.test(p)) {
        if (/you don't control|your opponents control/.test(p)) { log(`${src}: ${n} damage to each creature your opponents control (apply it at the table)`); continue; }
        let cs = state.battlefield.filter(c => permZone(c) === 'creatures');
        if (/\bother\b/.test(p)) cs = cs.filter(c => c.id !== me);
        if (/without flying/.test(p)) cs = cs.filter(c => !hasKw(c, 'flying')); else if (/with flying/.test(p)) cs = cs.filter(c => hasKw(c, 'flying'));
        if (/without reach/.test(p)) cs = cs.filter(c => !hasKw(c, 'reach')); else if (/with reach/.test(p)) cs = cs.filter(c => hasKw(c, 'reach'));
        if (/\btapped\b/.test(p) && !/untapped/.test(p)) cs = cs.filter(c => c.tapped); if (/untapped/.test(p)) cs = cs.filter(c => !c.tapped);
        for (const nm of (p.match(/non-?([a-z]+)/g) || [])) { const w = nm.replace(/^non-?/, ''); cs = cs.filter(c => { const pi = permTypeInfo(c); return !pi.types.has(w) && !pi.subs.has(w); }); }
        for (const c of cs) { const d = preventDamage(c.id, n, src); if (!(d > 0)) continue; c.dmg = (c.dmg || 0) + d; if (!c.dmgBy || c.dmgBy.turn !== state.turn) c.dmgBy = { turn: state.turn, srcs: [] }; c.dmgBy.srcs.push(src); log(`${src}: ${d} damage to ${c.name} (${c.dmg} marked this turn)`); }   // v0.99.80 shields and "dealt damage this way"
        if (!/you control/.test(p)) log(`${src}: ${n} damage to each creature your opponents control too (apply it at the table)`);
        if (/planeswalker/.test(p)) log(`${src}: and ${n} damage to each planeswalker`);
      } else if (/^planeswalker/.test(p)) { for (const c of state.battlefield.filter(c => isPlaneswalker(c))) if (!/opponents/.test(p)) { c.loyalty = Math.max(0, (c.loyalty || 0) - n); checkLoyalty(c); } }
      else if (/^(?:other )?players?$/.test(p)) { changeLife(-preventDamage('you', n, src), true); changeOppLife(-n); log(`${src}: ${n} damage to each player`); }
      else if (/^opponents?$/.test(p)) { changeOppLife(-n); log(`${src}: ${n} damage to each opponent`); }
    }
    runToughnessSBA(); render(); flushTriggers();
  };
  return [{ full: true, label: `${src} deals ${n} damage to each ${who}`, fn: () => { if (!state) return; snap(); run(); } }];
}
// CR 608.2n: "Exile ~." as the last instruction of an instant or sorcery: it goes to exile instead of the graveyard as it finishes resolving
function exileSelfOnResolve(c) {
  if (!c || c.copy || c.token) return null;
  const t = String(cardText(c) || '').replace(/\([^)]*\)/g, ' ');
  const nm = String(c.name || '').split(' // ')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!new RegExp('(?:^|[.\\n]\\s*)Exile (?:' + nm + '|this spell|this card)\\.\\s*$', 'i').test(t.trim())) return null;
  state.exile.push(c); return 'exile (it exiles itself, CR 608.2n)';
}
