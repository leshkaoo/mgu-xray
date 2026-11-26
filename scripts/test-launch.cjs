'use strict';
// Execute the actual upstream-linked application, with a synthetic donor only.
// This checks SDK export and lifecycle contracts, not BMW runtime compatibility.
const fs = require('fs'), os = require('os'), path = require('path');
const vm = require('vm'), cp = require('child_process'), assert = require('assert');
const EventEmitter = require('events');
const root = path.resolve(__dirname, '..');
const store = path.resolve(process.argv[2]);
const link = require(path.join(store, 'tools/oap_link.js'));
const donor = require(path.join(store, 'tools/test/synthetic_donor.js'));
const pack = require(path.join(store, 'tools/oap_pack.js'));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mgu-launch-'));
const template = fs.readFileSync(path.join(root, 'apps/izum_mgu_xray/src/app.js'), 'utf8');
const pause = () => new Promise(resolve => setImmediate(resolve));
async function run(form, early, broken) {
    const fixture = { initialized: false, ready: false, calls: [], opens: [], writes: 0 };
    const rhmi = new EventEmitter();
    const components = {};
    rhmi.getByName = name => {
        if (!components[name]) {
            const component = new EventEmitter();
            component.getId = () => Object.keys(components).indexOf(name) + 10;
            component.setValue = () => { fixture.writes++; return Promise.resolve(); };
            components[name] = component;
        }
        return components[name];
    };
    rhmi.mapEntryState = () => Promise.resolve();
    rhmi.openEntryState = uuid => { fixture.opens.push(uuid); return Promise.resolve(); };
    class SDK extends EventEmitter {
        constructor() { super(); fixture.app = this; this.rhmiApplication = rhmi; this.appDescription = { application: { entryPoints: [{ uuid: 'test' }] } }; }
        getEntryPoints() { return [{ getDescription: () => ({ uuid: 'test' }), init: () => Promise.resolve(), setAvailability: () => Promise.resolve() }]; }
        getLastExecutedEntryPointUuid() { return 'test'; }
        initialized() { fixture.initialized = true; return Promise.resolve(); }
        report(name) { assert(fixture.initialized && fixture.ready, 'premature lifecycle RPC'); fixture.calls.push(name); return Promise.resolve(); }
        registerActive() { return this.report('active'); } registerInactive() { return this.report('inactive'); }
        registerHmiVisible() { return this.report('visible'); } unregisterHmiVisible() { return this.report('hidden'); }
        start() { if (early) { fixture.ready = true; this.emit('appStatusProxyReady'); } this.emit('entryPointExecute', 'test'); this.emit('initialized'); return Promise.resolve(); }
    }
    const dir = path.join(temp, form + early + broken);
    fs.cpSync(path.join(root, 'apps/izum_mgu_xray'), dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'src/app.js'), broken ? template.replace('const OnlineApp = onlineAppModule.OnlineApp || onlineAppModule;', 'const OnlineApp = onlineAppModule;') : template);
    const sdk = donor.bundle().replace('class OnlineApp{constructor(name){this.name=name;this.log=logging_1.getLogger()}}', 'const OnlineApp = fixture.SDK;')
        .replace('exports.OnlineApp=OnlineApp;', form === 'named' ? 'exports.OnlineApp=OnlineApp;' : 'module.exports=OnlineApp;');
    const donorFile = path.join(dir, 'donor.tgz');
    fs.writeFileSync(donorFile, pack.tgz([
        { name: 'javascript/app.js', data: Buffer.from(sdk), mode: 0o644 },
        { name: 'javascript/entry.js', data: Buffer.from(donor.ENTRY), mode: 0o644 },
        { name: 'package.json', data: Buffer.from(JSON.stringify({ name: 'fixture', version: '1.0.0', main: 'javascript/runner.js', dependencies: { 'oap-sdk': '24.10.2' } })), mode: 0o644 }
    ], 1700000000));
    const packed = path.join(dir, 'linked.tgz');
    link.build(dir, packed, { donors: [donorFile], epoch: 1795694400 });
    const extracted = path.join(dir, 'extracted'); fs.mkdirSync(extracted);
    cp.execFileSync('tar', ['-xzf', packed, '-C', extracted]);
    fixture.SDK = SDK;
    const execute = () => vm.runInNewContext(fs.readFileSync(path.join(extracted, 'javascript/app.js'), 'utf8'), {
        fixture, require, __dirname: path.join(extracted, 'javascript'),
        process: { on: () => {}, exit: () => {} }, setInterval, clearInterval
    });
    if (broken) { assert.throws(execute, /not a constructor or null/); console.log('PASS: old import reproduces startup TypeError through upstream linker'); return; }
    execute(); await pause();
    assert(fixture.app.uiReady && !fixture.app.failed);
    assert.deepEqual(fixture.opens, ['test']); assert(fixture.writes > 0);
    if (!early) { assert.equal(fixture.calls.length, 0); fixture.ready = true; fixture.app.emit('appStatusProxyReady'); await pause(); }
    assert(fixture.calls.includes('active') && fixture.calls.includes('visible'));
    await fixture.app.shutdown();
    assert(fixture.calls.includes('inactive') && fixture.calls.includes('hidden'));
    console.log('PASS: linked ' + form + ' SDK export, ' + (early ? 'early' : 'late') + ' proxy-ready, screen opens and lifecycle stops');
}
(async () => {
    try {
        await run('named', false, true);
        for (const form of ['named', 'direct']) for (const early of [true, false]) await run(form, early, false);
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exit(1); });
