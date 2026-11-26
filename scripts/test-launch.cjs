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
const diagnosticTemplate = fs.readFileSync(path.join(root, 'apps/izum_mgu_xray_diag/src/app.js'), 'utf8');
const template = fs.readFileSync(path.join(root, 'apps/izum_mgu_xray/src/app.js'), 'utf8');
const pause = () => new Promise(resolve => setImmediate(resolve));
const referenceSource = fs.readFileSync(path.join(path.dirname(store), 'robertnisipeanu--idrive-apps/apps/robertn_waze_cluster/src/robertn_waze_cluster.js'), 'utf8');
function method(name) {
    const start = referenceSource.indexOf('    ' + name + '(');
    assert(start >= 0);
    const tail = referenceSource.slice(start);
    const end = tail.indexOf('\n    }') + '\n    }'.length;
    assert(end > 5); return tail.slice(0, end);
}
// Narrow positive control: unchanged reference entry registration/open methods,
// not a claim that the entire reference app/SDK/vehicle ran in this fixture.
const referenceTemplate = `const sdk=require('oap-sdk/src/core/OnlineApp.js');
const OnlineApp=sdk.OnlineApp||sdk; const logger={info(){},warn(){}};
class Ref extends OnlineApp {
constructor(){super();this.control={child:null};this.lifeQueue=Promise.resolve();this.failed=false;
this._pages={logs:false};this._logs={close(){}};this._state=this.rhmiApplication.getByName('XR_Main');
this.on('initialized',()=>this._state.updateResources().then(()=>this._registerEntryPoints()).then(()=>this.initialized()).then(()=>{this.uiReady=true;return this.open('test');}).catch(()=>{this.failed=true;}));}
_setVisible(){}
${method('_registerEntryPoints')}
${method('_onEntryPointExecute')}
open(uuid){return this._onEntryPointExecute(uuid);}
shutdown(){return Promise.resolve();}
} new Ref().start();`;
const traces = []; const unhandled = [];
const onUnhandled = () => unhandled.push(true); process.on('unhandledRejection', onUnhandled);
async function run(form, early, broken, fault) {
    fault = fault || "none";
    const fixture = { trace: [], resources: false, initialized: false, ready: false, calls: [], opens: [], writes: 0 };
    const rhmi = new EventEmitter();
    const components = {};
    rhmi.getByName = name => {
        if (fault === 'state' && name === 'XR_Main' || fault === 'component' && name === 'XR_start') return null;
        if (!components[name]) {
            const component = new EventEmitter();
            component.getId = () => Object.keys(components).indexOf(name) + 10;
            component.updateResources = () => { if (fault === 'resource') return Promise.reject(new Error('private path')); fixture.resources = true; fixture.calls.push('RHMI_SETUP'); return Promise.resolve(); };
            component.setValue = () => { fixture.writes++; return Promise.resolve(); };
            components[name] = component;
        }
        return components[name];
    };
    rhmi.mapEntryState = () => { fixture.calls.push('ENTRY_MAP'); return fault === 'map' ? Promise.reject(new Error('SECRET_PROFILE_MUST_NOT_LOG')) : Promise.resolve(); };
    rhmi.openEntryState = uuid => { assert(fixture.resources, 'RHMI rows must exist before open'); fixture.calls.push('OPEN_STATE'); fixture.opens.push(uuid); if (fault === 'open') return Promise.reject(new Error('SECRET_PROFILE_MUST_NOT_LOG')); if (fault === 'hang') return new Promise(() => {}); return Promise.resolve(); };
    class SDK extends EventEmitter {
        constructor() { super(); fixture.app = this; this.rhmiApplication = rhmi; this.appDescription = { application: { entryPoints: [{ uuid: 'test' }] } }; }
        getEntryPoints() { return [{ getDescription: () => ({ uuid: 'test' }), init: () => fault === 'entry' ? Promise.reject(new Error('private raw error')) : Promise.resolve(), setAvailability: () => Promise.resolve() }]; }
        getLastExecutedEntryPointUuid() { return 'test'; }
        initialized() { if (fault === 'ackhang') return new Promise(() => {}); fixture.initialized = true; fixture.calls.push('INIT_ACK'); return Promise.resolve(); }
        report(name) { assert(fixture.initialized && fixture.ready, 'premature lifecycle RPC'); fixture.calls.push(name); return Promise.resolve(); }
        registerActive() { return this.report('active'); } registerInactive() { return this.report('inactive'); }
        registerHmiVisible() { return this.report('visible'); } unregisterHmiVisible() { return this.report('hidden'); }
        start() { if (early) { fixture.ready = true; this.emit('appStatusProxyReady'); } this.emit('entryPointExecute', 'test'); if (fault === 'sdk') return Promise.reject(new Error('bad resource private detail')); if (fault !== 'noinit') this.emit('initialized'); return Promise.resolve(); }
    }
    const dir = path.join(temp, form + early + broken + fault);
    fs.cpSync(path.join(root, fault === 'diagnostic' ? 'apps/izum_mgu_xray_diag' : 'apps/izum_mgu_xray'), dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'src/app.js'), fault === 'reference' ? referenceTemplate : fault === 'diagnostic' ? diagnosticTemplate : broken ? template.replace('const OnlineApp = onlineAppModule.OnlineApp || onlineAppModule;', 'const OnlineApp = onlineAppModule;') : template);
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
        process: { on: () => {}, exit: () => {}, stderr: { write: line => fixture.trace.push(JSON.parse(line)) } }, setInterval, clearInterval, setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 60)), clearTimeout
    });
    if (broken) { execute(); assert(fixture.trace.some(e => e.code === 'E_BOOT')); assert(!fixture.app); console.log('PASS: old import reproduces constructor failure through upstream linker'); traces.push({ form, early, fault: 'old-import', trace: fixture.trace }); return; }
    execute(); await pause();
    if (fault !== 'none' && fault !== 'diagnostic' && fault !== 'reference') {
        await new Promise(resolve => setTimeout(resolve, 100));
        assert(fixture.app.failed, fault + ' must fail within deadline');
        assert(fixture.trace.some(e => e.code.indexOf('E_') === 0), 'coded diagnostic missing');
        assert(!JSON.stringify(fixture.trace).includes('SECRET_PROFILE'));
        await fixture.app.shutdown();
        traces.push({ form, early, fault, calls: fixture.calls, opens: fixture.opens, writes: fixture.writes, trace: fixture.trace });
        console.log('PASS: finite failure with sanitized stage/code: ' + fault); return;
    }
    assert(fixture.app.uiReady && !fixture.app.failed);
    assert.deepEqual(fixture.opens, ['test']); if (fault !== 'reference') assert(fixture.writes > 0);
    if (!early) { assert(!fixture.calls.includes('active') && !fixture.calls.includes('visible')); fixture.ready = true; fixture.app.emit('appStatusProxyReady'); await pause(); }
    if (fault !== 'diagnostic' && fault !== 'reference') assert(fixture.calls.includes('active') && fixture.calls.includes('visible'));
    fixture.app.emit('changeVisibility', { visible: false }); await fixture.app.lifeQueue;
    await fixture.app.open('test');
    assert.equal(fixture.app.control.child, null, 'opening without profile/engine never starts a process');
    await fixture.app.shutdown();
    traces.push({ form, early, fault, calls: fixture.calls, opens: fixture.opens, writes: fixture.writes, trace: fixture.trace });
    if (fault !== 'diagnostic' && fault !== 'reference') assert(fixture.calls.includes('inactive') && fixture.calls.includes('hidden'));
    console.log('PASS: linked ' + form + ' SDK export (' + fault + '), ' + (early ? 'early' : 'late') + ' proxy-ready, screen opens and lifecycle stops');
}
const suiteDeadline = setTimeout(() => { console.error('launch suite deadline'); process.exit(124); }, 15000);
(async () => {
    try {
        await run('named', false, true);
        await run('named', true, false, 'diagnostic');
        await run('named', true, false, 'reference');
        for (const form of ['named', 'direct']) for (const early of [true, false]) await run(form, early, false);
        for (const fault of ['resource', 'state', 'component', 'entry', 'map', 'open', 'hang', 'ackhang', 'sdk', 'noinit']) await run('named', true, false, fault);
        assert.equal(unhandled.length, 0); console.log('PASS: no unhandled rejections across launch fault cases');
        if (process.env.MGU_TRACE_OUT) fs.writeFileSync(process.env.MGU_TRACE_OUT, JSON.stringify(traces, null, 2) + '\n');
    } finally { clearTimeout(suiteDeadline); process.removeListener('unhandledRejection', onUnhandled); fs.rmSync(temp, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exit(1); });
