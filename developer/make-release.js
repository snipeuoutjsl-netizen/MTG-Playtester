// Usage: node make-release.js   -> writes release-<version>/ with the files to drag into a GitHub release.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const src = ['app', '../app', 'mtg-playtester/app'].map(d => path.join(__dirname, d)).find(d => fs.existsSync(path.join(d, 'app.js')));
if (!src) throw new Error('could not find the app folder');
const outRoot = fs.existsSync(path.join(__dirname, 'mtg-playtester')) ? __dirname : path.join(__dirname, '..');
const app = fs.readFileSync(path.join(src, 'app.js'), 'utf8');
const ver = app.match(/const APP_VERSION = '([\d.]+)'/)[1];
const pk = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8'));
if (pk.version !== ver) throw new Error(`package.json ${pk.version} != APP_VERSION ${ver}`);
const m = app.match(/const CHANGELOG = \[\n([\s\S]*?)\n\];/);
const entries = new Function('return [' + m[1] + ']')();
const top = entries[0]; if (top.v !== ver) throw new Error('top changelog entry is ' + top.v);
const out = path.join(outRoot, 'release-' + ver); fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out);
const FILES = ['index.html', 'app.js', 'style.css', 'package.json'], files = {};
for (const f of FILES) { const b = fs.readFileSync(path.join(src, f)); fs.copyFileSync(path.join(src, f), path.join(out, f)); files[f] = { sha256: crypto.createHash('sha256').update(b).digest('hex'), size: b.length }; }
const mainSrc = fs.readFileSync(path.join(src, 'main.js'), 'utf8');
const SHELL = +((mainSrc.match(/const SHELL_MIN_FOR_FILES = (\d+)/) || mainSrc.match(/const SHELL_VERSION = (\d+)/) || [0, 0])[1]);
fs.writeFileSync(path.join(out, 'latest.json'), JSON.stringify({ version: ver, shell: SHELL, title: top.title, notes: top.notes, files }, null, 2));
fs.writeFileSync(path.join(out, 'update.json'), JSON.stringify({ version: ver }));
console.log('wrote', out, fs.readdirSync(out).join(', '));
// v0.96.13 update.json is what older app shells read; it was left out of the "five files" list and the updater then failed with "update.json has no version". All SIX go up together, and the zip holds exactly those.
const ALL = ['index.html', 'app.js', 'style.css', 'package.json', 'latest.json', 'update.json'];
for (const f of ALL) if (!fs.existsSync(path.join(out, f))) throw new Error('release is missing ' + f);
const zip = path.join(outRoot, 'release-' + ver + '-files.zip'); fs.rmSync(zip, { force: true });
require('child_process').execFileSync('zip', ['-q', '-j', zip, ...ALL.map(f => path.join(out, f))]);
console.log('\nUPLOAD ALL SIX of these to the GitHub release (zip: ' + zip + '): ' + ALL.join(', '));
