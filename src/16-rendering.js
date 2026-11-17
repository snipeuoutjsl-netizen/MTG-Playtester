// ---------------------------------------------------------------- rendering
function colorClass(c) {
  if (c.token) return 'art';
  const info = cardInfo(c.name);
  if (!info) return BASIC_LANDS.has(norm(c.name)) ? 'land' : 'art';
  if (info.land) return 'land';
  const cols = effColors(c);
  if (cols.length > 1) return 'multi';
  if (cols.length === 1) return cols[0];
  return 'art';
}

const BASIC_PRODUCES = {
  'plains':['W'], 'island':['U'], 'swamp':['B'], 'mountain':['R'], 'forest':['G'], 'wastes':['C', '1'],
  'snow-covered plains':['W'], 'snow-covered island':['U'], 'snow-covered swamp':['B'], 'snow-covered mountain':['R'], 'snow-covered forest':['G']
};
