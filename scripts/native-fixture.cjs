#!/usr/bin/env node
'use strict';
// Test adapter: actual app.js + Control + supervisor/Xray, but explicitly
// fake OnlineApp/RHMI transport. No BMW SDK is supplied or emulated in full.
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const vm = require('vm'), assert = require('assert'), EventEmitter = require('events');
const Control = require('../apps/izum_mgu_xray/src/control.js').Control;
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(process.env.MGU_FIXTURE_TMPDIR || os.tmpdir(), 'mgu-native-e2e-'));
const supervisor = path.join(root, 'build/mgu-xray');
const argument = name => process.argv[process.argv.indexOf(name) + 1];
let instance, active = false, visible = false, hidden = false;
const rhmi = new EventEmitter();
const ui = JSON.parse(fs.readFileSync(path.join(root, 'apps/izum_mgu_xray/package/rhmiData/uiDescriptions/ID7/uiDescription.json')));
const components = {};
Object.keys(ui.containers['1'].components).forEach(id => {
    const component = new EventEmitter(); component.getId = () => Number(id); component.setValue = () => Promise.resolve();
    components[ui.containers['1'].components[id].name] = component;
});
rhmi.getByName = name => name === 'XR_Main' ? {} : components[name];
rhmi.mapEntryState = () => Promise.resolve(); rhmi.openEntryState = () => Promise.resolve();
class OnlineApp extends EventEmitter {
    constructor() { super(); instance = this; this.rhmiApplication = rhmi; this.appDescription = { application: { entryPoints: [{ uuid: 'fixture' }] } }; }
    getEntryPoints() { return [{ getDescription: () => ({ uuid: 'fixture' }), init: () => Promise.resolve(), setAvailability: () => Promise.resolve() }]; }
    registerActive() { active = true; return Promise.resolve(); } registerInactive() { active = false; return Promise.resolve(); }
    registerHmiVisible() { visible = true; return Promise.resolve(); } unregisterHmiVisible() { visible = false; return Promise.resolve(); }
    initialized() { return Promise.resolve(); } getLastExecutedEntryPointUuid() { return 'fixture'; }
    destroyBundles() { return Promise.resolve(); }
    start() {
        this.emit('appStatusProxyReady');
        this.emit('initialized');
        setImmediate(() => this.requestStart());
        return Promise.resolve();
    }
}
class ObservedControl extends Control {
    constructor(options) {
        super(Object.assign({}, options, {
            root: temp, supervisor, engine: argument('-engine'), engineSHA256: argument('-engine-sha256'),
            supervisorSHA256: crypto.createHash('sha256').update(fs.readFileSync(supervisor)).digest('hex'),
            socksPort: Number(argument('-socks-port')), httpPort: Number(argument('-http-port'))
        }));
        this.on('change', status => {
            if (status.state === 'running') {
                if (!hidden) {
                    hidden = true;
                    instance.emit('changeVisibility', { visible: false });
                    instance.lifeQueue.then(() => {
                        assert(active && !visible && this.child, 'hidden proxy must remain active without HMI');
                        process.stdout.write('fixture: UI hidden; proxy retained ACTIVE\n');
                        process.stdout.write('native controller: running\n');
                    }).catch(() => process.exit(1));
                } else process.stdout.write('native controller: running\n');
            } else process.stdout.write('native controller: ' + status.state + '\n');
            if (status.state === 'error' && !instance.closing) process.exit(1);
        });
    }
}
let chunks = [], size = 0;
process.stdin.on('data', chunk => { size += chunk.length; if (size > 65536) process.exit(1); chunks.push(chunk); });
process.stdin.on('end', () => {
    fs.mkdirSync(path.join(temp, 'private'), { mode: 0o700 });
    const bytes = Buffer.concat(chunks); chunks = [];
    fs.writeFileSync(path.join(temp, 'private/profile.txt'), bytes, { mode: 0o600 }); bytes.fill(0);
    const file = path.join(root, 'apps/izum_mgu_xray/src/app.js');
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
        __dirname: path.join(temp, 'javascript'), process, setInterval, clearInterval,
        require: name => name === 'oap-sdk/src/core/OnlineApp.js' ? OnlineApp : name === './control.js' ? { Control: ObservedControl } : name === './deployment.js' ? {} : require(name)
    });
});
process.on('exit', () => fs.rmSync(temp, { recursive: true, force: true }));
