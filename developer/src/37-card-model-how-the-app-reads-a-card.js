// ---------------------------------------------------------------- card model: how the app READS a card (v0.35)
// compileCard() walks the Oracle text line by line and says, for each line, what kind of rule it is
// (keyword, mana ability, activated, triggered, static, loyalty, spell effect) and how much of it the app handles.
// status: 'ok' = the app handles it, 'part' = recognised but some of it is done by hand, 'unk' = not understood, 'info' = reminder text.
const KW_ENFORCED = new Set([...GRANTABLE, 'flash', 'changeling', 'cascade', 'prowess', 'overload', 'bestow', 'escalate', 'replicate', 'emerge', 'prowl', 'miracle', 'plot', 'foretell', 'blitz', 'dash', 'spectacle', 'surge', 'casualty', 'exalted', 'battle cry', 'annihilator', 'evolve', 'renown', 'mentor', 'training', 'dethrone', 'melee', 'fabricate', 'modular', 'bloodthirst', 'extort', 'riot', 'ninjutsu', 'flashback', 'spree', 'suspend', 'living weapon', 'dredge', 'embalm', 'eternalize', 'unearth', 'outlast', 'rebound', 'cumulative upkeep', 'vanishing', 'fading', 'decayed', 'exert', 'monstrosity', 'populate', 'boast', 'devoid']);
const STATIC_PATTERNS = [
  [/don'?t lose unspent (?:white |blue |black |red |green )?mana as steps and phases end|mana pools? (?:don'?t|doesn'?t) empty|(?:white|blue|black|red|green) mana doesn'?t empty from/i, 'Mana stays in your pool when a step or phase ends (rule 106.4): the app skips emptying the pool for those colours.'],
  [/^if you would draw a card, you may skip that draw instead\.?$/i, 'A "Skip draws" icon appears in the top bar while this is on the battlefield. Switch it on and every card you would draw is skipped (rule 614.1a); switch it off to draw normally.'],
  [/^if you would begin your turn while (?:this artifact|~) is tapped, you may skip that turn instead\. If you do, untap (?:this artifact|~)\.?$/i, 'When you press Next turn while it is tapped, a window asks whether to skip that turn. Skipping untaps it. (Turn off under Tutor mode \u2192 Time Vault prompt.)'],
  [/^if an opponent would draw a card except the first one they draw in each of their draw steps, instead you create a Treasure token\./i, 'Press the \uD83C\uDCCF button by your opponent\u2019s life and choose "an extra draw": the draw is replaced by a Treasure token for you, and "whenever an opponent draws" triggers do not fire.'],
  [/^if a creature an opponent controls would die, exile it instead\.?$/i, 'A replacement effect (rule 614) that only matters for your opponent\u2019s creatures. The app does not track an opposing board, so if you play one out by hand, exile their dying creatures instead of putting them in the graveyard.', 'info'],
  [/^you may play lands from your graveyard\.?$/i, 'Open your graveyard and press "Play land" on a land card: it uses a land drop and goes through the normal land-play steps (landfall, shock lands, and so on).'],
  [/^as long as (?:~|this artifact) is untapped, each spell that would cost less than three mana to cast costs three mana to cast/i, 'Cost floor: while it is untapped, spells you cast cost at least three mana in total. The app raises the cost it asks you to pay (the hand tooltip says why).'],
  [/\bskip your draw step\b/i, 'Skips your draw step (the app skips the draw).'],
  [/maximum hand size/i, 'Changes your maximum hand size (applied at cleanup).'],
  [/would be put into (?:your |a )?graveyard from anywhere, exile/i, 'Replacement effect: cards that would go to a graveyard are exiled instead.'],
  [/(?:each land|lands) you control (?:is|are) every basic land type|\b(?:each|all) lands? (?:is|are) (?:every basic land type|a (?:swamp|forest|island|plains|mountain))|nonbasic lands are mountains/i, 'Changes land types (affects Domain, fetch lands on the battlefield, and mana).'],
  [/power and toughness are each equal to|power is equal to|toughness is equal to/i, 'Characteristic-defining ability: power/toughness is calculated live.'],
  [/costs? (?:\{[^}]+\})+ less to cast/i, 'Cost reduction: shown on the card and used when paying.'],
  [/\benters(?: the battlefield)? tapped\b|you may pay 2 life\. if you don't/i, 'Enters tapped (or asks you to pay life, for shock lands).'],
  [/opening hand, you may begin the game with it on the battlefield/i, 'Opening-hand ability: offered on the pre-game screen.'],
  [/enters(?: the battlefield)? with (?:X|twice X|\w+) \+1\/\+1 counters? on it/i, 'Enters with counters: the app adds them when it resolves (X is the X you chose).'],
  [/^(?:this spell|~) can'?t be countered\.?$/i, "Can't be countered: counterspells and abilities that counter it do nothing (checked when you try to counter it)."],
  [/enters(?: the battlefield)? with (?:an?|one|two|three|four|five|six|seven|eight|nine|ten|\d+|X) [a-z-]+ counters? on it/i, 'Enters with counters: the app puts them on as it enters (counter-kind is tracked and shown on the card).'],
  [/you may play (?:an|one|two|three|\d+) additional lands? on each of your turns/i, 'Extra land drops: the app counts land plays against 1 + the additional plays your permanents allow.'],
  [/^(?:~|this \w+) doesn'?t untap during your untap step\.?$|nonbasic lands don'?t untap during their controllers' untap steps/i, "Doesn't untap: the app leaves it tapped during your untap step."],
  [/^As ~ enters the battlefield, choose an? (?!.*\bfrom among\b)/i, 'Choice as it enters: a window asks for your choice (creature type, card name, colour…) and the app remembers it on the card (shown on the tile).'],
  [/^If ~ would enter the battlefield, you may discard an? \w+ card instead/i, 'Replacement effect: when it would enter, a window asks you to discard or sends it to the graveyard (rule 614.1).'],
  [/counters? would be put on .*(?:that many plus (?:one|two|\d+)|twice that many)|would put one or more counters on .*twice that many/i, 'Replacement effect: whenever counters are put on a matching permanent (including as it enters) the app adds the extra counters and logs it. Manual +/- counter buttons are not changed.'],
  [/^Activated abilities of sources with the chosen name can't be activated/i, 'Ability lock: the app refuses to activate abilities of sources with the chosen name.'],
  [/you may have ~ enter the battlefield tapped as a copy of any land/i, 'Vesuva: a window asks which land to copy as it enters; it enters tapped (the Vesuva window handles the name swap).'],
  [/\bdraw a card\b.*\bcycling\b/i, null]
];
const EVENT_DESC = { 'etb-self': 'this enters the battlefield', 'etb-other': 'another permanent enters', landfall: 'a land enters under your control', 'cast-self': 'you cast this spell', cast: 'you cast a matching spell', 'attack-self': 'this attacks', 'attack-any': 'you attack with creatures', 'dies-self': 'this dies', 'dies-other': 'another creature dies', draw: 'you draw a card', 'leaves-self': 'this leaves the battlefield', lifegain: 'you gain life', 'combat-damage-self': 'this deals combat damage', 'combat-damage-any': 'a creature you control deals combat damage' };
// Official-ruling notes for lines the app cannot automate (v0.63). Each is [pattern, note]; a matching line is shown as "partly" (never "understood")
// and carries the rule to follow by hand, instead of the vague "not understood". Patterns run on the text with the card's name replaced by ~.
const RULINGS = [
  [/can block only creatures with flying/i, 'Block restriction (rule 509.1b): it can only be declared as a blocker against flyers. The app has no opposing attackers, so apply this when you block.'],
  [/can'?t be blocked except by/i, 'Evasion (rule 509.1b): only creatures with the listed abilities can block it. The goldfish has no blockers; against a real opponent they must follow this.'],
  [/^(?:equipped|enchanted) (?:creature|permanent) gets? /i, 'Attachment bonus (rules 301.5, 303.4): applies only while attached. The app does not track attachments, so add the bonus with a temporary effect while it is attached.'],
  [/^equip\b|^attach ~ to target creature/i, 'Equip (rule 702.6): sorcery speed, target creature you control; the Equipment stays attached until it moves. Attachments are not tracked by the app.'],
  [/^activated abilities of .* can'?t be activated/i, 'Ability lock (rule 602.5): the listed abilities cannot be activated while this is on the battlefield. The app does not block them; honour it by hand.'],
  [/^as ~ enters(?: the battlefield)?, choose /i, 'Choice as it enters (rule 614.12 / 614.1c): the choice is made as it enters, not when it resolves. Note the choice (for example in the log) and honour it by hand.'],
  [/^if ~ would enter the battlefield, you may /i, 'Replacement effect (rule 614.1): the alternative happens instead of entering. Make the choice as it would enter.'],
  [/counters? would be put (?:on|onto)/i, 'Counter replacement (rule 614.1): adds extra counters whenever the counters are placed. Add the extra counters yourself when it is on the battlefield.'],
  [/^all creatures have |^creatures you control have |^each creature has /i, 'Granted ability (rule 613.1f): applies to every matching creature while this is on the battlefield. Treat the creatures as having it.'],
  [/^you may cast spells from your hand without paying their mana costs/i, 'Alternative cost (rule 118.9): you may cast spells from hand for {0}. Spells with X must use X=0, and additional costs and taxes still apply. Use the "pay" window and choose to pay nothing.'],
  [/^(?:\w+)cycling\b/i, 'Typecycling (rule 702.29e): a cycling ability that searches your library for a card of that type instead of drawing. Pay the cost, discard it, then search by hand.'],
  [/^escape\b/i, 'Escape (rule 702.138): you may cast it from your graveyard by paying the cost and exiling the stated number of other cards from it; some cards have an extra condition (for example, they are sacrificed unless they escaped).'],
  [/^(?:flashback|retrace|jump-start|disturb|aftermath)\b/i, 'Graveyard casting (rules 702.34 and similar): cast it from the graveyard by paying the stated cost; it is exiled if it would leave the stack.'],
  [/^untap ~ during each other player'?s untap step/i, 'Untap (rule 502.3): you also untap this during your opponents\' untap steps. Untap it yourself when the opponent\'s turn begins.'],
  [/^(?:metalcraft|threshold|spell mastery|revolt|ferocious|hellbent|formidable|raid|morbid|fateful hour|coven|descend \d+) —/i, 'Ability word (rule 207.2c): the condition is checked continuously. Count it yourself (metalcraft = three or more artifacts, threshold = seven or more cards in your graveyard).'],
  [/^(?:i|ii|iii|iv|v)(?:, (?:i|ii|iii|iv|v))* —/i, 'Saga chapter (rule 714): put a lore counter on it as your first main phase begins, then the chapter ability triggers; sacrifice it after the final chapter has resolved.'],
  [/^level up\b|^level \d/i, 'Class level (rule 716): pay the level cost at sorcery speed; levels are gained one at a time in order.'],
  [/^(?:this spell|~) can'?t be countered/i, "Can't be countered (rule 101.2 / 701.5): the app refuses to counter it."],
  [/^when you cast this spell, take an extra turn|^take an extra turn after this one/i, 'Extra turn (rule 500.7): the extra turn is taken immediately after this one; extra turns stack, with the last created taken first. Use the "extra turn" tools to start another turn.'],
  [/^this spell costs \{\w\} less to cast for each/i, 'Cost reduction by count (rule 601.2f): the reduction is applied while paying. Enter it in the cost window.'],
  [/^\{T\}: add .* for each /i, 'Variable mana (rule 106.1): the amount depends on the game state when you tap. Float the amount into the pool by hand.']
];
function rulingFor(normText) { const r = RULINGS.find(([re]) => re.test(normText)); return r ? r[1] : null; }
// Rulings for triggers the app cannot watch for (they happen off the battlefield, or on events it does not track).
function triggerRuling(t) {
  const x = String(t).toLowerCase();
  if (/is put into (?:your|a|an opponent's) graveyard from (?:your library|anywhere|the battlefield)|put into a graveyard from anywhere|put into your graveyard from the battlefield/.test(x)) return 'Zone-change trigger (rule 603.6c/603.10a): it looks back at the object as it left. The app watches only permanents on the battlefield, so when this happens add the effect by hand.';
  if (/at the beginning of (?:your|each) upkeep, if ~ is in your graveyard|if ~ is in your graveyard/.test(x)) return 'Graveyard trigger (rule 113.6k): this ability works from the graveyard. The app only watches the battlefield, so check it at the right time yourself (e.g. your upkeep).';
  if (/whenever you cycle|whenever you discard|whenever you cycle or discard/.test(x)) return 'Cycle/discard trigger (rule 702.29d): triggers on each card discarded or cycled. Apply by hand when you discard.';
  if (/becomes the target of|whenever an opponent|opponent controls? .* (?:enters|dies)|whenever a creature an opponent/.test(x)) return 'Opponent-event trigger: the app does not track the opponent\'s board, so apply it when it happens.';
  if (/when ~ has no [a-z+\/-]+ counters on it/.test(x)) return null;
  if (/whenever a player casts/.test(x)) return "Triggers on every player's spells, including yours (rule 603.2). The app only watches your own casts; apply it by hand when the opponent casts.";
  if (/deals combat damage to a creature|dealt damage by|deals damage to a creature/.test(x)) return 'Combat-damage trigger on a creature (rule 510.2): triggers after combat damage is dealt. The goldfish has no opposing creatures; apply when it happens against a real opponent.';
  if (/whenever you tap .* for mana|whenever .* is tapped for mana/.test(x)) return 'Mana-tap trigger (rule 605.5): it triggers when the mana ability resolves and goes on the stack after it. Apply by hand when you tap it.';
  if (/becomes level|becomes the target/.test(x)) return 'Class/level trigger (rule 716.2c): triggers when it reaches that level. Apply by hand when you level it up.';
  if (/you may pay \{.*\}\. when you do|reflexive/.test(x)) return 'Reflexive trigger (rule 603.12): you pay as the first ability resolves; only if you did, the second ability triggers and goes on the stack.';
  if (/when ~ is turned face up|transforms|return him to the battlefield transformed|transformed under/.test(x)) return 'Transform (rule 701.28 / 712): turn the card to its other face; it stays the same object. Right-click it on the battlefield and choose Transform (a trigger that says transform offers it too).';
  return null;
}
const COMPILE_CACHE = new Map();
function compileCardOne(c) {
  const info = c && !c.token ? cardInfo(c.name) : null;
  if (!info) return null;
  const ck = norm(info.name) + '|' + (info.tx || '').length + '|' + (info.t || '');
  if (COMPILE_CACHE.has(ck)) return COMPILE_CACHE.get(ck);
  const short = info.name.split(' // ')[0];
  const nameRe = selfNameRe(short);
  const isLand = !!info.land, front = (info.t || '').split(' // ')[0];
  let isSpell = /\b(Instant|Sorcery)\b/.test(front);
  const card = { name: info.name };
  const trig = parseTriggers(card);
  let trigIx = 0;
  const statRecs = parseStaticCard({ id: -1, name: info.name, token: false });
  const lines = [];
  const push = (text, kind, status, note, extra) => lines.push({ text, kind, status, note, ...extra });
  const restrictionNote = (txt) => {
    const rm = txt.match(/Activate (?:this ability )?only ([^.]+)\./i); if (!rm) return { note: '', ok: true };
    const parts = parseRestriction(rm[1]); const bad = parts.filter(p => !p.rec);
    return { note: bad.length ? ` Restriction "${bad.map(b => b.raw).join('; ')}" is not understood and is only a reminder.` : ` Restriction understood: ${parts.map(p => p.rec.label).join(' and ')} (checked as a soft warning).`, ok: !bad.length };
  };
  const faceTypes = String(info.t || '').split(' // '); let faceIx = 0;
  for (const raw of String(info.tx || '').replace(/,\n/g, ', ').replace(/\n(?=\s*[\u2022\u2023])/g, ' ').split('\n')) {
    const text = raw.trim(); if (!text) continue;
    if (text === '//') { faceIx++; isSpell = /\b(Instant|Sorcery)\b/.test(faceTypes[faceIx] || ''); continue; }
    const stripped = text.replace(/\([^)]*\)/g, '').trim();
    if (!stripped) { push(text, 'reminder', 'info', 'Reminder text: it only explains the rules.'); continue; }
    const norml = stripped.replace(nameRe, '~').replace(/\u2019/g, "'");
    let m;
    // loyalty ability
    if (/^[+−–-]?\d+:|^0:/.test(stripped) && /\bPlaneswalker\b/.test(front)) {
      const eff = recognizedEffects(stripped.replace(/^[^:]+:\s*/, '').replace(nameRe, '~'));
      push(text, 'loyalty', eff.length ? 'ok' : 'part', eff.length ? `Loyalty ability: the cost is tracked and the app can apply: ${eff.join('; ')}.` : 'Loyalty ability: the loyalty cost is tracked; apply its effect by hand.');
      continue;
    }
    // cost lines (v0.46)
    if ((m = stripped.match(/^(Evoke|Kicker|Delve|Convoke|Improvise|Cycling|Affinity for\b)/i))) {
      const w = m[1].toLowerCase();
      const NOTE = { evoke: 'Evoke: when you cast it the app offers the evoke cost as a way to pay (including "exile a card from your hand" costs). If you use it, a sacrifice trigger goes on the stack when it enters.',
        kicker: 'Kicker: an optional extra cost offered when you cast it and remembered as "kicked" in the log. The kicked effect itself is applied by hand.',
        delve: 'Delve: a window lets you exile graveyard cards; each pays {1} of the generic cost.', convoke: 'Convoke: a window lets you tap creatures; each pays {1} or one mana of its colour.',
        improvise: 'Improvise: a window lets you tap artifacts; each pays {1}.', cycling: 'Cycling: right-click the card in your hand and choose Cycle. The app pays the cost, discards the card and puts "draw a card" on the stack.',
        'affinity for': 'Affinity: the cost is reduced automatically by the permanents you control.' };
      push(text, 'keyword', w === 'kicker' ? 'part' : 'ok', NOTE[w] || ''); continue;
    }
    if ((m = stripped.match(/^As an additional cost to cast this spell, (.+?)\.?$/i))) {
      const cs = parseCostComps(m[1].replace(/^you may /i, ''), short), unk = cs.filter(k => k.k === 'other');
      push(text, 'cost', unk.length ? 'part' : 'ok', `Additional cost${/^you may/i.test(m[1]) ? ' (optional)' : ''}: the app asks what to pay${unk.length ? ', but "' + unk.map(k => k.text).join('; ') + '" is a cost it does not understand and is left for you to pay by hand' : ' (sacrifice / discard / exile choices appear before the mana window)'}.`); continue;
    }
    if (/rather than pay (?:this spell's|its) mana cost/i.test(stripped)) {
      const alts = altCostsFor({ name: info.name }), bad = alts.some(a => a.comps.some(k => k.k === 'other'));
      push(text, 'cost', alts.length && !bad ? 'ok' : 'part', alts.length ? 'Alternative cost: offered in the "how do you pay?" window when you cast it' + (bad ? ', but part of it is not understood.' : '. Taxes still apply to it.') : 'Alternative cost, but the app could not read it.'); continue;
    }
    if (/\bspells?\b.*\bcost\b.*\b(?:more|less) to cast\b/i.test(stripped) && !/^this\b/i.test(stripped)) {
      push(text, 'static', 'ok', /opponents/i.test(stripped) ? 'Cost effect on opponents’ spells: not used in a goldfish game.' : 'Cost modifier: applied automatically to every spell you cast while this is on the battlefield (shown on the card in hand). Add effects the app cannot see with Tools → Cost effects.'); continue;
    }
    if (/^Equip\b/i.test(stripped)) { push(text, 'activated', 'ok', 'Equip (rule 702.6): a sorcery-speed ability. Right-click the Equipment, choose Activate, pay the cost and pick a creature you control; it stays attached until it moves or either leaves.'); continue; }
    if (/^(?:equipped|enchanted) (?:creature|permanent|land|artifact)\b/i.test(norml) && /can't (?:attack|block)/i.test(norml) && statRecs.some(r => r.kind === 'cant')) { push(text, 'static', 'ok', "Attachment restriction: while attached the creature can't attack (the app removes it from your attackers). Blocking only matters against a real opponent."); continue; }
    if (/^(?:equipped|enchanted) (?:creature|permanent|land|artifact)\b/i.test(norml) && statRecs.some(r => r.subj && r.subj.attach && norml.replace(/,?\s*"[^"]*"/g, '').replace(/\.$/, '').trim() === r.line)) { const q = /"/.test(norml); push(text, 'static', q ? 'part' : 'ok', 'Attachment bonus: applied live to the permanent it is attached to (+P/T, keywords, counted "for each" amounts)' + (q ? '; the quoted ability it also grants is not applied by the app.' : '.')); continue; }
    // keyword line
    if (!/[.:;—]/.test(stripped)) {
      const words = stripped.split(/,\s*/).map(w => w.trim()).filter(Boolean);
      const names = words.map(w => w.toLowerCase().replace(/\s*(?:\{.*|\d+.*)$/, '').trim());
      const known = names.filter(n => KW_ENFORCED.has(n)), other = names.filter(n => !KW_ENFORCED.has(n));
      push(text, 'keyword', !other.length ? 'ok' : known.length ? 'part' : 'part', !other.length ? `Keyword rules known: ${known.join(', ')}.` : `${known.length ? known.join(', ') + ' handled; ' : ''}${other.join(', ')}: explained by the hover tips, but its rules are not enforced.`, { kws: names });
      continue;
    }
    // triggered ability
    if (/^(?:[A-Z][A-Za-z' ]+ — )?(?:When|Whenever|At)\b/.test(stripped)) {
      const t = trig[trigIx++];
      if (t && t.ev) { const eff = recognizedEffects(t.effect); push(text, 'triggered', eff.length ? 'ok' : 'part', `Triggered ability: the app notices the trigger event (${EVENT_DESC[t.ev] || t.ev.replace(/-/g, ' ').replace(':', ': ')}) and puts it on the stack.` + (eff.length ? ` It can apply: ${eff.join('; ')}.` : ' Its effect is applied by hand.'), { ev: t.ev }); }
      else if (/^(?:when|whenever) ~ has no [a-z+\/-]+ counters on it/i.test(norml)) push(text, 'triggered', 'ok', 'State trigger (rule 603.8): the app watches the counters and puts this on the stack once, each time the last one is removed.');
      else { const rl = rulingFor(norml) || triggerRuling(norml); if (rl) push(text, 'triggered', 'part', rl); else push(text, 'triggered', 'unk', 'Triggered ability, but the app does not recognise when it triggers, so it will not fire automatically.'); }
      continue;
    }
    // mana ability
    if (/^(?:[A-Z][A-Za-z' ]+ \u2014 )?\{T\}(?:,[^:]+)?: Add\b/.test(stripped)) {
      const r = isLand ? null : rockInfo(card);
      const extra = /^\{T\},/.test(stripped);
      const rn = restrictionNote(stripped);
      if (isLand && landManaAbilities(card).some(a => a.unread && a.unread.length)) { const un = landManaAbilities(card).flatMap(a => a.unread); push(text, 'mana', 'part', 'Mana ability of a land: the mana is handled, but NOT applied by the app (do this by hand): ' + un.map(x => '"' + x + '"').join(' ')); }
      else if (isLand) push(text, 'mana', 'ok', 'Mana ability of a land: taps for the listed mana' + (/ for each | \{C\}\{C\}\./.test(stripped) ? ' (the amount is counted from the board when you tap)' : '') + '.' + rn.note);
      else if (r && !extra) push(text, 'mana', rn.ok ? 'ok' : 'part', `Mana ability: taps for ${r.fixed ? r.fixed.join('') : r.among ? 'one mana of a colour among your legendary permanents' : r.choice.length === 5 ? 'one mana of any colour' : 'a choice of ' + r.choice.join('/')}.` + rn.note, { restriction: rn });
      else if (extra && /^\{T\},\s*Sacrifice [^,:]+:/.test(stripped) && !/,\s*(?!Sacrifice)[A-Z{]/.test(stripped.split(':')[0].replace(/^\{T\},\s*Sacrifice [^,:]+/, '')) && recognizedEffects(stripped.replace(/^[^:]+:\s*/, '').replace(nameRe, '~')).length) push(text, 'mana', 'ok', 'Mana ability with a sacrifice cost: the tap and the sacrifice are paid as you activate it, and the mana is added at once without using the stack (rule 605.3b).' + rn.note);
      else push(text, 'mana', 'part', (extra ? 'Mana ability with an extra cost. The tap is handled, the extra cost (' + stripped.split(':')[0].replace('{T},', '').trim() + ') is not enforced.' : 'Mana ability the app cannot produce automatically: float the mana by hand.') + rn.note);
      continue;
    }
    // activated ability (cost: effect)
    if ((m = stripped.match(/^([^:]+):\s*(.+)$/)) && COST_WORDS.test(m[1]) && !/^(?:When|Whenever|At)\b/.test(stripped)) {
      const fetch = isLand && fetchInfo({ name: info.name, id: -1 });
      const eff = recognizedEffects(m[2].replace(nameRe, '~'));
      const rn = restrictionNote(stripped);
      const pc = parseAbilityCost(m[1], short), bits = [];
      if (pc.tap) bits.push('{T}'); if (pc.mana) bits.push('mana (payment window)'); if (pc.selfSac) bits.push('sacrifice itself'); if (pc.removeN) bits.push('remove counters'); if (pc.life) bits.push('pay life'); for (const k of pc.comps) bits.push(k.k === 'sac' ? 'sacrifice (you choose which)' : k.k === 'discard' ? 'discard (you choose which)' : k.k === 'exile' ? 'exile (you choose which)' : k.k === 'tapOther' ? 'tap other permanents (you choose)' : 'return to hand (you choose)');
      if (fetch) push(text, 'activated', 'ok', 'Fetch land ability: the app sacrifices the land, pays any life and searches for a matching land.');
      else push(text, 'activated', eff.length && !pc.byHand.length ? 'ok' : 'part', `Activated ability. The app pays: ${bits.join(', ') || 'nothing automatically'}${pc.byHand.length ? '; you pay by hand: ' + pc.byHand.join(', ') : ''}.` + (eff.length ? ` It can apply: ${eff.join('; ')}.` : ' Its effect is applied by hand.') + rn.note);
      continue;
    }
    // static abilities with an engine
    const rec = statRecs.find(r => r.line === norml.replace(/\.$/, ''));
    if (rec) {
      const subjText = norml.replace(/ (?:has|have|get|gets|is|are) .*$/i, '');
      if (rec.kind === 'cond') { push(text, 'static', rec.other.length ? 'part' : 'ok', `${rec.cond === 'ctrl' ? 'Conditional bonus: while you control a ' + rec.need + ' the app applies' : 'Delirium: while there are ' + rec.n + '+ card types in your graveyard the app applies'}`.replace(/applies$/, 'applies') + `  ${[(rec.p || rec.t) ? (rec.p >= 0 ? '+' : '') + rec.p + '/' + (rec.t >= 0 ? '+' : '') + rec.t : '', ...rec.kws].filter(Boolean).join(', ')} live${rec.other.length ? '; “' + rec.other.join('; ') + '” is not enforced' : ''}. A badge on the card shows the count.`); continue; }
      const note = rec.kind === 'color' ? `Static ability: changes the colours of ${subjText.toLowerCase()} (applied to every permanent it describes).`
        : rec.kind === 'kw' ? `Static ability: grants ${rec.items.map(i => i.kws.join('/') + (i.cond ? ' if it’s ' + i.cond : '')).join('; ')} to ${subjText.toLowerCase()}.`
        : `Static ability: ${rec.p >= 0 ? '+' : ''}${rec.p}/${rec.t >= 0 ? '+' : ''}${rec.t} to ${subjText.toLowerCase()}.`;
      push(text, 'static', 'ok', note); continue;
    }
    const sp = STATIC_PATTERNS.find(([re]) => re.test(stripped) || re.test(norml));
    if (sp && sp[1]) { push(text, 'static', sp[2] || 'ok', sp[1]); continue; }
    // spell effect
    if (isSpell) {
      const eff = recognizedEffects(stripped);
      if (/^(?:Domain|Landfall|Delirium|Metalcraft|Threshold|Revolt|Spell mastery)\b/.test(stripped) && sp) { push(text, 'spell', 'ok', sp[1]); continue; }
      push(text, 'spell', eff.length ? 'ok' : 'part', eff.length ? `Spell effect: when it resolves the app offers: ${eff.join('; ')}.` : 'Spell effect: the app puts the spell on the stack and tells you when it resolves, but you apply the effect by hand.'); continue;
    }
    if (/^\+\s*(?:\{[^}]+\})+\s*\u2014/.test(stripped)) { const eff = recognizedEffects(stripped.replace(/^[^\u2014]*\u2014\s*/, '').replace(nameRe, '~')); push(text, 'spell', eff.length ? 'ok' : 'part', `Spree mode: you pick it as you cast, and its cost is added to the spell.` + (eff.length ? ` The app can apply: ${eff.join('; ')}.` : ' You apply its effect by hand.')); continue; }
    { const rl = rulingFor(norml); if (rl) { push(text, 'other', 'part', rl); continue; } }
    push(text, 'other', 'unk', 'Not understood: the app does nothing for this line. Handle it by hand.');
  }
  // modal lines ("Choose one \u2014 \u2022 ... \u2022 ...")
  for (const l of lines) {
    const md = parseModal(l.text); if (!md || md.spree) continue;
    const per = md.modes.map((mo, i) => { const e = recognizedEffects(mo.text.replace(nameRe, '~')); return `mode ${i + 1}: ${e.length ? e.join('; ') : 'by hand'}`; });
    l.note = `Choose ${md.label}. ` + (md.kind==='trigger' ? 'This is a triggered ability, so you pick the mode as the trigger goes on the stack, not when the card is cast. ' : md.kind==='ability' ? 'This is an activated ability, so you pick the mode when you activate it. ' : 'You pick the mode(s) as you cast the spell. ') + `Applied automatically per mode \u2014 ${per.join(' | ')}.`;
    l.status = md.modes.every(mo => recognizedEffects(mo.text.replace(nameRe, '~')).length) ? 'ok' : 'part';
    l.kind = 'modal';
  }
  // X in the mana cost
  if ((info.mc || '').split(' // ')[0].includes('{X}')) lines.unshift({ text: info.mc.split(' // ')[0], kind: 'cost', status: 'ok', note: 'Mana cost with {X}: you choose X when casting; it is remembered on the stack and for enters-the-battlefield effects.' });
  // v0.77 honesty pass: a line only counts as understood when the engine handles EVERY sentence of its effect, not just the first one it recognises.
  for (const l of lines) {
    if (l.status !== 'ok' || l.def || !['spell', 'triggered', 'activated', 'modal'].includes(l.kind)) continue;
    let part = String(l.text).replace(nameRe, '~'), mm;
    if (l.kind === 'triggered' && (mm = part.match(/^(?:When|Whenever|At)\b[^,]*,\s*([\s\S]*)$/i))) part = mm[1];
    else if (l.kind === 'activated' && (mm = part.match(/^[^:]+:\s*([\s\S]*)$/))) part = mm[1];
    const parts = l.kind === 'modal' ? ((parseModal(l.text) || { modes: [] }).modes.map(mo => String(mo.text).replace(nameRe, '~'))) : [part];
    const missed = parts.flatMap(p => uncoveredClauses(p));
    if (missed.length) { l.status = 'part'; l.missed = missed; l.note += ` NOT applied by the app (do this by hand): ${missed.map(x => '"' + (x.length > 90 ? x.slice(0, 88) + '…' : x) + '"').join(' ')}`; }
  }
  // v0.80 hand-written definitions override whatever the reader decided for the lines they cover.
  if (CARD_DEFS.length) for (const l of lines) {
    if (!['spell', 'triggered', 'activated', 'modal'].includes(l.kind)) continue;
    let part = String(l.text).replace(nameRe, '~').replace(/^[A-Z][A-Za-z' ]+\s\u2014\s/, ''), mm;   // v0.86: drop a "Landfall — " style word
    if (l.kind === 'triggered' && (mm = part.match(/^(?:When|Whenever|At)\b[^,]*,\s*([\s\S]*)$/i))) part = mm[1];
    else if (l.kind === 'activated' && (mm = part.match(/^[^:]+:\s*([\s\S]*)$/))) part = mm[1];
    const L = defLine(info.name, part) || defLine(info.name, l.text);
    if (L) { l.status = 'ok'; l.def = true; l.note = `Hand-written definition: ${L.note || 'the app applies this exactly as written.'}`; }
  }
  for (const l of lines) if (l.status === 'ok' && !l.def && /counters? on it for each (?![^.]*\bexiled with it\b)/i.test(String(l.text))) { l.status = 'part'; l.note += ' NOT counted by the app: add the counters for the "for each" part by hand.'; }
  const counts = { ok: 0, part: 0, unk: 0, info: 0 };
  for (const l of lines) counts[l.status]++;
  const out = { name: info.name, type: info.t || '', mc: info.mc || '', pt: info.pt || '', lines, counts };
  COMPILE_CACHE.set(ck, out);
  return out;
}
// v0.73 a double-faced card is read one face at a time, so a back-face line is judged on its own and never credited to the front.
function compileCard(c) {
  const info = c && !c.token ? cardInfo(c.name) : null;
  if (!info || !info.fc || info.fi !== undefined) return compileCardOne(c);
  const ck = 'F|' + norm(info.name) + '|' + info.fc.map(f => f.tx.length).join(',');
  if (COMPILE_CACHE.has(ck)) return COMPILE_CACHE.get(ck);
  const splitLike = info.kind === 'split' || info.kind === 'aftermath';
  const front = splitLike ? { name: info.name, type: info.t || '', mc: info.mc || '', pt: '', lines: [], counts: {} } : compileCardOne(c), lines = front.lines.slice();
  info.fc.forEach((fr, i) => { if (i < 1 && !splitLike) return; const b = compileCardOne({ name: fr.name }); if (!b) return;
    if (!b.lines.length) lines.push({ text: `(${fr.name}: no rules text)`, kind: 'reminder', status: 'info', note: `Back face (${fr.t}).`, face: fr.name });
    for (const l of b.lines) lines.push({ ...l, note: `[Back face: ${fr.name}] ` + l.note, face: fr.name }); });
  const counts = { ok: 0, part: 0, unk: 0, info: 0 }; for (const l of lines) counts[l.status]++;
  const out = { ...front, name: info.name, lines, counts, type: info.t || front.type, faces: info.fc.map(f => f.name) };
  COMPILE_CACHE.set(ck, out); return out;
}
// The effects the app can actually apply for a piece of rules text (mirrors the patterns in openAbilityEffect).
// The sentences of an effect the engine does NOT carry out. A multi-sentence effect is only as handled as its least-handled sentence (v0.77).
const DEP_SENT = /^(?:If|Then|Otherwise|Instead|Unless|That|Those|It|Its|They|Their|Each of|For each|And)\b/i;
const DEP_HANDLED = [/^That creature gains haste\b/i, /^Exile it at the beginning of the next end step/i, /^Then discard (?:a|an|one|two|three|four|\d+) cards?\b/i, /^(?:Then|If you do,) (?:draw|discard) (?:a|an|one|two|three|four|that many|\d+) cards?\b/i, /^If you do, create\b/i, /^Then (?:sacrifice|shuffle)\b/i, /^Then amass [A-Z][a-z]+ (?:\d+|an?|one|two|three)\b/];
function uncoveredClauses(effectText) {
  const t = String(effectText || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const sents = t.split(/(?<=[.!?])\s+/).map(x => x.trim()).filter(Boolean);
  if (sents.length < 2) return [];
  try { const whole = effectOptions(t, { sourceName: '~', sourceId: -1 }); if (whole.some(o => o.full)) return []; } catch (e) { /* ignore */ }
  const missed = [];
  sents.forEach((x, i) => {
    if (/^(?:Flashback|Kicker|Multikicker|Buyback|Cycling|Escape|Jump-start|Retrace|Entwine|Storm|Foretell|Suspend)\b/i.test(x)) return;
    if (/^(?:Activate|Cast this spell|This ability|You can't|Spend only|Play this|Cast only|Cast it|This spell can't be countered)\b/i.test(x)) return;
    if (i > 0 && DEP_SENT.test(x)) { if (!DEP_HANDLED.some(r => r.test(x))) missed.push(x); return; }
    let ok = false; try { ok = recognizedEffects(x).length > 0; } catch (e) { /* ignore */ }
    if (!ok) missed.push(x);
  });
  return missed;
}
function recognizedEffects(tx) {
  const r = effectOptions(tx, { sourceName: '~', sourceId: -1 }).map(o => o.label ? o.label.toLowerCase() : o.summary);
  if (r.length) return r;
  // effects on a chosen target are applied once the target is picked (targetedOptions), so they count as handled
  const t = String(tx).replace(/\([^)]*\)/g, '');
  if (/\btarget\b/i.test(t) && /\b(?:destroy|exile|tap|untap|counter target|return [^.]*to (?:its|their) owner'?s hand|put (?:a|an|one|two|three|\d+) \+1\/\+1 counters? on|gains? \d+ life|loses? \d+ life|draws? (?:a|one|two|three|\d+) cards?|deals? \d+ damage)/i.test(t)) return ['applies to the target you pick'];
  return r;
}
const READ_CHIP = { ok: ['✓ Understood', 'ok'], part: ['~ Partly', 'part'], unk: ['? Not understood', 'unk'], info: ['• Info', 'info'] };
function readingBody(cc) {
  const box = h('div', { class: 'rd' });
  box.append(h('div', { class: 'rd-head' }, h('b', { text: cc.name }), h('span', { class: 'muted', text: [cc.mc, cc.type, cc.pt].filter(Boolean).join(' · ') })));
  if (!cc.lines.length) box.append(h('div', { class: 'muted', text: 'This card has no rules text, so there is nothing to read.' }));
  for (const l of cc.lines) box.append(h('div', { class: 'rd-line ' + l.status },
    h('span', { class: 'rd-chip ' + l.status, text: READ_CHIP[l.status][0] }),
    h('div', { class: 'rd-txt' }, h('div', { class: 'rd-q', text: l.text }), h('div', { class: 'rd-note', text: `${l.kind[0].toUpperCase() + l.kind.slice(1)}. ${l.note}` }))));
  return box;
}
function openCardReading(name) {
  const cc = compileCard({ name });
  const m = modal('How the app reads this card', { width: 640 });
  if (!cc) { m.body.append(h('div', { class: 'psub', text: 'No card data is loaded for ' + name + '.' })); m.foot.append(h('button', { text: 'Close', onclick: () => m.close() })); return; }
  m.body.append(readingBody(cc), h('div', { class: 'muted small', text: 'Green lines are handled by the app, gold lines are recognised but finished by hand, red lines are ignored by the app.' }));
  m.foot.append(h('button', { text: 'Close', onclick: () => m.close() }));
}
function openCoverage() {
  const m = modal('How the app reads your deck', { width: 760 });
  const names = [...new Set(currentDeckNames())];
  const rows = names.map(n => compileCard({ name: n })).filter(Boolean);
  const tot = { ok: 0, part: 0, unk: 0 };
  for (const r of rows) for (const k of ['ok', 'part', 'unk']) tot[k] += r.counts[k];
  const all = tot.ok + tot.part + tot.unk || 1;
  m.body.append(h('div', { class: 'psub', text: `${rows.length} cards, ${all} rules lines: ${tot.ok} understood (${Math.round(100 * tot.ok / all)}%), ${tot.part} partly (${Math.round(100 * tot.part / all)}%), ${tot.unk} not understood (${Math.round(100 * tot.unk / all)}%).` }));
  if (!rows.length) m.body.append(h('div', { class: 'muted', text: 'No card data loaded for this deck yet. Import the card data first (Tools & Settings > Card data).' }));
  if (cardCount) m.body.append(h('div', { class: 'setrow' }, h('button', { text: 'Scan every card in the card data…', title: 'Ranks the phrasings the reader does not understand across the whole card pool', onclick: () => { m.close(); openPoolScan(); } })));
  const look = h('input', { type: 'text', placeholder: 'Look up any card by name…', style: 'width:100%;margin:6px 0' });
  const list = h('div', { class: 'rd-list' });
  const draw = () => {
    list.replaceChildren();
    const q = look.value.trim().toLowerCase();
    const src = q ? [...CARDS.values()].filter(v => v.name && v.name.toLowerCase().includes(q)).slice(0, 30).map(v => compileCard({ name: v.name })).filter(Boolean) : rows.slice().sort((a, b) => b.counts.unk - a.counts.unk || b.counts.part - a.counts.part || a.name.localeCompare(b.name));
    for (const r of src) {
      const det = h('div', { class: 'rd-detail' }); det.hidden = true;
      const hd = h('button', { class: 'rd-row' }, h('span', { class: 'rd-nm', text: r.name }), h('span', { class: 'rd-ct' }, h('span', { class: 'rd-chip ok', text: '✓ ' + r.counts.ok }), h('span', { class: 'rd-chip part', text: '~ ' + r.counts.part }), h('span', { class: 'rd-chip unk', text: '? ' + r.counts.unk })));
      hd.addEventListener('click', () => { if (det.hidden && !det.firstChild) det.append(readingBody(r)); det.hidden = !det.hidden; });
      list.append(h('div', { class: 'rd-card' }, hd, det));
    }
    if (!src.length) list.append(h('div', { class: 'muted', text: q ? 'No card with that name in the card data.' : '' }));
  };
  look.addEventListener('input', draw); draw();
  m.body.append(look, list);
  m.foot.append(h('button', { text: 'Close', onclick: () => m.close() }));
}

// ---- Coverage scan of the whole card pool: which phrasings does the reader NOT understand, most common first?
function covShape(text, name) {
  let s = String(text || '').replace(/\([^)]*\)/g, '').replace(/\u2019/g, "'").trim();
  const short = String(name || '').split(' // ')[0];
  if (short) s = s.replace(new RegExp(short.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '~');
  return s.toLowerCase().replace(/\{[^}]+\}/g, '{m}').replace(/\b(?:one|two|three|four|five|six|seven|eight|nine|ten|x|\d+)\b/g, 'n').replace(/\s+/g, ' ').trim().slice(0, 120);
}
function covCore(line) {   // the part of a line that says WHAT happens (so cards that differ only in their trigger share a row)
  const t = line.text.replace(/\([^)]*\)/g, '').trim();
  if (line.kind === 'triggered') { const m = t.match(/^(?:[^,]*?\b(?:When|Whenever|At)\b[^,]*,)\s*(.+)$/); return m ? m[1] : t; }
  if (line.kind === 'activated') { const i = t.indexOf(':'); return i > 0 ? t.slice(i + 1).trim() : t; }
  return t;
}
async function scanCardPool(opts, onProgress, cancelled) {
  const seen = new Set(), cards = [];
  for (const v of CARDS.values()) { if (!v || seen.has(v.name)) continue; seen.add(v.name); if (opts.modernOnly && !v.mod) continue; if (opts.format && !(v.lg ? v.lg.includes(opts.format) : (opts.format === 'm' && v.mod))) continue; if (!v.tx || !v.tx.trim()) continue; cards.push(v); }
  const res = { cards: cards.length, full: 0, withUnk: 0, lines: { ok: 0, part: 0, unk: 0, info: 0 }, shapes: new Map(), starts: new Map(), kws: new Map(), byKind: {} };
  const bump = (map, key, extra, name) => { let e = map.get(key); if (!e) { e = { n: 0, ex: [], ...extra }; map.set(key, e); } e.n++; if (e.ex.length < 3 && !e.ex.includes(name)) e.ex.push(name); };
  for (let i = 0; i < cards.length; i++) {
    if (cancelled()) return null;
    const cc = compileCard({ name: cards[i].name }); if (!cc) continue;
    let bad = false;
    for (const l of cc.lines) {
      res.lines[l.status]++;
      const k = (res.byKind[l.kind] = res.byKind[l.kind] || { ok: 0, part: 0, unk: 0, info: 0 }); k[l.status]++;
      if (l.status === 'ok' || l.status === 'info') continue;
      bad = true;
      if (l.kind === 'keyword') {
        for (const w of l.text.split(/,\s*/)) { const n = w.toLowerCase().replace(/\s*(?:\{.*|\d+.*)$/, '').replace(/\u2014.*$/, '').trim(); if (n && !KW_ENFORCED.has(n)) bump(res.kws, n, {}, cc.name); }
        continue;
      }
      const sh = covShape(covCore(l), cc.name); if (!sh) continue;
      bump(res.shapes, l.kind + '|' + sh, { kind: l.kind, status: l.status, shape: sh }, cc.name);
      const st = sh.split(' ').slice(0, 4).join(' ');
      bump(res.starts, l.kind + '|' + st, { kind: l.kind, status: l.status, shape: st + ' …' }, cc.name);
    }
    if (!bad) res.full++; else res.withUnk++;
    if (i % 150 === 0) { onProgress(i + 1, cards.length); await new Promise(r => setTimeout(r, 0)); }
  }
  COMPILE_CACHE.clear();
  return res;
}
function coverageReportText(res, opts) {
  const top = (map, n) => [...map.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, n);
  const L = [];
  const all = res.lines.ok + res.lines.part + res.lines.unk || 1;
  L.push(`MTG Playtester coverage scan (v${APP_VERSION})${opts.format ? ' - ' + ({ s: 'Standard', p: 'Pioneer', m: 'Modern', l: 'Legacy', v: 'Vintage', u: 'Pauper', c: 'Commander' }[opts.format] || opts.format) + '-legal cards only' : opts.modernOnly ? ' - Modern-legal cards only' : ''}`);
  L.push(`${res.cards} cards, ${all} rules lines. Understood ${res.lines.ok} (${Math.round(100 * res.lines.ok / all)}%), partly ${res.lines.part} (${Math.round(100 * res.lines.part / all)}%), not understood ${res.lines.unk} (${Math.round(100 * res.lines.unk / all)}%).`);
  L.push(`Cards fully handled: ${res.full} of ${res.cards} (${Math.round(100 * res.full / (res.cards || 1))}%).`, '');
  L.push('BY KIND (understood / partly / not understood)');
  for (const [k, v] of Object.entries(res.byKind)) L.push(`  ${k}: ${v.ok} / ${v.part} / ${v.unk}`);
  L.push('', 'MOST COMMON UNRECOGNISED PHRASES (count | kind | status | phrase | example cards)');
  for (const [, e] of top(res.shapes, 150)) L.push(`  ${e.n} | ${e.kind} | ${e.status} | ${e.shape} | ${e.ex.join('; ')}`);
  L.push('', 'MOST COMMON PHRASE STARTS');
  for (const [, e] of top(res.starts, 60)) L.push(`  ${e.n} | ${e.kind} | ${e.shape} | ${e.ex.join('; ')}`);
  L.push('', 'KEYWORDS THE APP ONLY EXPLAINS (does not enforce)');
  for (const [k, e] of top(res.kws, 80)) L.push(`  ${e.n} | ${k}${crTag(k)} | ${e.ex.join('; ')}`);
  { const c = { tested: 0, named: 0, none: 0 }; for (const r of RULES_TABLE) c[r[3]]++; L.push('', `CR KEYWORD TABLE (Comprehensive Rules 701 and 702): ${RULES_TABLE.length} rules. tested ${c.tested}, named in the app ${c.named}, never mentioned ${c.none}.`); }
  return L.join('\n');
}
// v0.96.0 "(CR 702.15, named)": where a keyword sits in the Comprehensive Rules and how far the app has got with it.
function crTag(name) { const r = crKeyword(name); return r ? ` (CR ${r[0]}, ${r[3]})` : ' (not a CR keyword)'; }
function openPoolScan() {
  if (!cardCount) { toast('No card data', 'Load the Scryfall Oracle file first (Tools & Settings > Card data).'); return; }
  const m = modal('Scan every card', { width: 860 });
  const hasMod = [...CARDS.values()].some(v => v.mod);
  const hasLg = [...CARDS.values()].some(v => v.lg);
  const fmtSel = h('select', { title: 'Only scan cards legal in this format' }, ...[['', 'All cards'], ['s', 'Standard'], ['p', 'Pioneer'], ['m', 'Modern'], ['l', 'Legacy'], ['v', 'Vintage'], ['u', 'Pauper'], ['c', 'Commander']].map(([v, t]) => h('option', { value: v, text: t })));
  fmtSel.value = hasLg || hasMod ? 'm' : '';
  const modChk = { get checked() { return false; }, set checked(v) {} };
  const out = h('div'), prog = h('div', { class: 'muted small', text: '' });
  let cancel = false, last = null, lastOpts = null, running = false;
  const origClose = m.close; m.close = () => { cancel = true; origClose(); };
  const tabs = ['Phrases', 'Phrase starts', 'Keywords']; let tab = 0;
  const draw = () => {
    out.replaceChildren(); if (!last) return;
    const res = last, all = res.lines.ok + res.lines.part + res.lines.unk || 1;
    out.append(h('div', { class: 'psub', text: `${res.cards.toLocaleString()} cards, ${all.toLocaleString()} rules lines: ${Math.round(100 * res.lines.ok / all)}% understood, ${Math.round(100 * res.lines.part / all)}% partly, ${Math.round(100 * res.lines.unk / all)}% not understood. ${res.full.toLocaleString()} cards (${Math.round(100 * res.full / (res.cards || 1))}%) are fully handled.` }));
    const bar = h('div', { class: 'tabs' }); tabs.forEach((t, i) => bar.append(h('button', { class: 'tgl' + (i === tab ? ' on' : ''), text: t, onclick: () => { tab = i; draw(); } }))); out.append(bar);
    const src = tab === 0 ? res.shapes : tab === 1 ? res.starts : res.kws;
    const rows = [...src.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 80);
    const tbl = h('div', { class: 'cov-tbl' });
    for (const [key, e] of rows) tbl.append(h('div', { class: 'cov-row' }, h('span', { class: 'cov-n', text: String(e.n) }), h('span', { class: 'cov-k ' + (e.status || ''), text: tab === 2 ? 'keyword' : e.kind }), h('span', { class: 'cov-s', text: tab === 2 ? key + crTag(key) : e.shape }), h('span', { class: 'cov-x muted small', text: e.ex.join(' · ') })));
    out.append(tbl);
  };
  const goBtn = h('button', { class: 'primary', text: 'Scan' });
  const saveBtn = h('button', { text: 'Save report…', disabled: true });
  const copyBtn = h('button', { text: 'Copy report', disabled: true });
  const run = async () => {
    if (running) return; running = true; cancel = false; lastOpts = { modernOnly: false, format: fmtSel.value };
    prog.textContent = 'Scanning…'; goBtn.disabled = true;
    const res = await scanCardPool(lastOpts, (i, n) => { prog.textContent = `Scanning ${i.toLocaleString()} / ${n.toLocaleString()}…`; }, () => cancel);
    running = false; goBtn.disabled = false; if (!res) return;
    last = res; prog.textContent = 'Done.'; draw(); saveBtn.disabled = false; copyBtn.disabled = false;
  };
  goBtn.addEventListener('click', run);
  saveBtn.addEventListener('click', () => { const a = h('a', { href: URL.createObjectURL(new Blob([coverageReportText(last, lastOpts)], { type: 'text/plain' })), download: 'mtg-playtester-coverage.txt' }); document.body.append(a); a.click(); a.remove(); });
  copyBtn.addEventListener('click', async () => { try { await navigator.clipboard.writeText(coverageReportText(last, lastOpts)); toast('Copied', 'The report is on your clipboard.'); } catch (e) { toast('Could not copy', 'Use Save report instead.'); } });
  m.body.append(h('div', { class: 'psub', text: 'Runs the card reader over every card in your card data and ranks the rules phrasings it does not understand, most common first. That list is the to-do list for teaching the app new effects.' }),
    h('div', { class: 'setrow' }, hasLg || hasMod ? h('label', { class: 'chk' }, 'Only cards legal in: ', fmtSel) : h('span', { class: 'muted small', text: 'Re-import the Oracle file to enable the format filter.' }), goBtn, prog), out);
  m.foot.append(copyBtn, saveBtn, h('button', { text: 'Close', onclick: () => m.close() }));
}

