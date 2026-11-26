#!/usr/bin/env node
'use strict';
// Test adapter only. Reuses the actual native Control with synthetic profiles
// supplied by the loopback fixture; never included in the MGU app package.
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const Control = require('../apps/izum_mgu_xray/src/control.js').Control;
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(process.env.MGU_FIXTURE_TMPDIR || os.tmpdir(), 'mgu-native-e2e-'));
const supervisor = path.join(root, 'build/mgu-xray');
const argument = name => process.argv[process.argv.indexOf(name) + 1];
const control = new Control({
    root: temp, supervisor, engine: argument('-engine'), engineSHA256: argument('-engine-sha256'),
    supervisorSHA256: crypto.createHash('sha256').update(fs.readFileSync(supervisor)).digest('hex'),
    socksPort: Number(argument('-socks-port')), httpPort: Number(argument('-http-port'))
});
let chunks = [], size = 0, closing = false;
process.stdin.on('data', chunk => { size += chunk.length; if (size > 65536) process.exit(1); chunks.push(chunk); });
process.stdin.on('end', () => {
    fs.mkdirSync(path.join(temp, 'private'), { mode: 0o700 });
    const bytes = Buffer.concat(chunks); chunks = [];
    fs.writeFileSync(path.join(temp, 'private/profile.txt'), bytes, { mode: 0o600 }); bytes.fill(0);
    control.start();
});
control.on('change', status => {
    process.stdout.write('native controller: ' + status.state + '\n');
    if (status.state === 'error' && !closing) { fs.rmSync(temp, { recursive: true, force: true }); process.exit(1); }
});
function stop() {
    if (closing) return;
    closing = true;
    control.shutdown().then(() => { fs.rmSync(temp, { recursive: true, force: true }); process.exit(0); });
}
process.on('SIGTERM', stop); process.on('SIGINT', stop);
