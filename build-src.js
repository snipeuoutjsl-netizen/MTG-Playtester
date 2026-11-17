// Builds app.js from src/*.js (concatenated in file-name order). Edit the files in src/, then run:  node build-src.js
// The result is the same single file the app has always loaded, so nothing else changes. `node build-src.js --check` fails if app.js is out of date.
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'src'), out = path.join(__dirname, 'app.js');
const text = fs.readdirSync(dir).filter(f => /\.js$/.test(f)).sort().map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('');
if (process.argv.includes('--check')) { const cur = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : ''; if (cur !== text) { console.error('app.js is out of date: run node build-src.js'); process.exit(1); } console.log('app.js is up to date'); }
else { fs.writeFileSync(out, text); console.log('wrote app.js (' + text.length + ' bytes from ' + fs.readdirSync(dir).filter(f => /\.js$/.test(f)).length + ' files)'); }
