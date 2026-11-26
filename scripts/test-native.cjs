'use strict';
// Boundary and lifecycle tests of original code; NOT real BMW SDK execution.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const EventEmitter = require('events');
const PassThrough = require('stream').PassThrough;
const vm = require('vm');
const cp = require('child_process');
const root = path.resolve(__dirname, '..');
const api = require('../apps/izum_mgu_xray/src/control.js');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mgu-native-test-'));
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
let checks = 0;
function check(name, test) { test(); checks++; console.log('PASS ' + name); }
async function main() {
    const dir = path.join(temp, 'private'); fs.mkdirSync(dir, { mode: 0o700 });
    const profilePath = path.join(dir, 'profile.txt');
    const secret = 'SYNTHETIC_PROFILE_NEVER_LOG_THIS';
    fs.writeFileSync(profilePath, secret, { mode: 0o600 });
    check('0600 profile accepted', () => assert.equal(api.privateProfile(temp).toString(), secret));
    check('world-readable profile refused', () => { fs.chmodSync(profilePath, 0o644); assert.throws(() => api.privateProfile(temp)); fs.chmodSync(profilePath, 0o600); });
    check('oversize profile refused', () => { fs.writeFileSync(profilePath, Buffer.alloc(65537)); assert.throws(() => api.privateProfile(temp)); fs.writeFileSync(profilePath, secret); });
    check('symlink profile refused', () => { fs.renameSync(profilePath, profilePath + '.real'); fs.symlinkSync(profilePath + '.real', profilePath); assert.throws(() => api.privateProfile(temp)); fs.unlinkSync(profilePath); fs.renameSync(profilePath + '.real', profilePath); });
    check('FIFO profile cannot block UI before regular-file validation', () => {
        fs.renameSync(profilePath, profilePath + '.real'); cp.execFileSync('mkfifo', [profilePath]); fs.chmodSync(profilePath, 0o600);
        const result = cp.spawnSync(process.execPath, ['-e', 'try { require(process.argv[1]).privateProfile(process.argv[2]); process.exit(2); } catch (_) { process.exit(0); }', path.join(root, 'apps/izum_mgu_xray/src/control.js'), temp], { timeout: 1500 });
        assert(!result.error); assert.equal(result.status, 0);
        fs.unlinkSync(profilePath); fs.renameSync(profilePath + '.real', profilePath);
    });
    check('public private-directory refused', () => { fs.chmodSync(dir, 0o755); assert.throws(() => api.privateProfile(temp)); fs.chmodSync(dir, 0o700); });
    check('shared writable data root refused', () => { fs.chmodSync(temp, 0o777); assert.throws(() => api.privateProfile(temp)); fs.chmodSync(temp, 0o700); });
    const deadPID = Number(cp.execFileSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' }));
    const stale = path.join(temp, '.mgu-xray-run-' + deadPID + '-stale');
    fs.mkdirSync(stale, { mode: 0o700 }); fs.mkdirSync(path.join(stale, 'mgu-xray-fixture'), { mode: 0o700 });
    fs.writeFileSync(path.join(stale, 'mgu-xray-fixture/xray'), 'stale synthetic engine');
    fs.writeFileSync(path.join(stale, 'owner.json'), JSON.stringify({ pid: deadPID, bootId: null, startTime: null }), { mode: 0o600 });
    const live = path.join(temp, '.mgu-xray-run-' + process.pid + '-live');
    fs.mkdirSync(live, { mode: 0o700 }); fs.writeFileSync(path.join(live, 'owner.json'), JSON.stringify(api.runtimeOwner()), { mode: 0o600 });
    api.sweepStaleRuntime(temp);
    check('dead-owner runtime reclaimed without touching live owner', () => { assert(!fs.existsSync(stale)); assert(fs.existsSync(live)); });
    check('previous Linux boot proves stale even with reused live PID', () => {
        assert(api.staleOwner({ pid: process.pid, bootId: '00000000-0000-0000-0000-000000000001', startTime: '1' }, '00000000-0000-0000-0000-000000000002'));
        assert(!api.staleOwner({ pid: process.pid, bootId: 42 }, '00000000-0000-0000-0000-000000000002'));
    });
    check('FIFO runtime owner marker cannot block cleanup', () => {
        const fifoDir = path.join(temp, '.mgu-xray-run-' + deadPID + '-fifo'); fs.mkdirSync(fifoDir, { mode: 0o700 }); cp.execFileSync('mkfifo', [path.join(fifoDir, 'owner.json')]);
        const result = cp.spawnSync(process.execPath, ['-e', 'require(process.argv[1]).sweepStaleRuntime(process.argv[2]);', path.join(root, 'apps/izum_mgu_xray/src/control.js'), temp], { timeout: 1500 });
        assert(!result.error); assert.equal(result.status, 0); assert(fs.existsSync(fifoDir));
    });
    let child, argv, spawnOptions, received = '', starts = 0, kills = 0;
    const binary = path.join(temp, 'supervisor'); fs.writeFileSync(binary, 'synthetic executable fixture');
    const options = {
        root: temp, supervisor: binary, engine: '/fixture/xray', supervisorSHA256: sha(fs.readFileSync(binary)), engineSHA256: 'a'.repeat(64),
        spawn: (file, args, opts) => {
            starts++; argv = args; spawnOptions = opts;
            fs.mkdirSync(path.join(opts.env.TMPDIR, 'mgu-xray-fixture'));
            fs.writeFileSync(path.join(opts.env.TMPDIR, 'mgu-xray-fixture/xray'), 'synthetic frozen engine');
            child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough();
            child.stdin.on('data', data => { received += data.toString(); });
            child.kill = signal => { kills++; assert.equal(signal, 'SIGTERM'); setImmediate(() => child.emit('close', 0)); };
            return child;
        }
    };
    const control = new api.Control(options); control.start();
    check('stdin only, no secret in args/env, no shell', () => {
        assert.equal(received, secret); assert(!JSON.stringify(argv).includes(secret)); assert(!JSON.stringify(spawnOptions).includes(secret));
        assert.equal(spawnOptions.shell, false); assert.equal(spawnOptions.stdio[2], 'ignore');
        assert(argv.includes('-parent-pid')); assert(argv.includes(String(process.pid))); assert.equal(control.state, 'starting');
    });
    check('duplicate start is suppressed', () => { control.start(); assert.equal(starts, 1); });
    check('arbitrary child output never displayed', () => { child.stdout.write(secret + '\n'); assert(!JSON.stringify(control.snapshot()).includes(secret)); assert.equal(control.state, 'starting'); });
    check('split lifecycle lines supported', () => {
        child.stdout.write('engine started; upstream connectivity '); assert.equal(control.state, 'starting');
        child.stdout.write('not yet verified\n'); assert.equal(control.state, 'running');
    });
    check('retry distinguished from running', () => { child.stdout.write('engine stopped; bounded retry\n'); assert.equal(control.state, 'retry'); assert.equal(control.snapshot().retries, 1); });
    const stopping = control.stop(); const again = control.stop();
    check('stop is idempotent; no restart while stopping', () => { assert.strictEqual(stopping, again); control.start(); assert.equal(starts, 1); assert.equal(kills, 1); });
    await stopping;
    check('owned runtime clone removed on process close', () => assert(!fs.existsSync(spawnOptions.env.TMPDIR)));
    check('close clears owned process', () => { assert.equal(control.state, 'off'); assert.equal(control.child, null); });
    await control.shutdown(); control.start();
    check('shutdown forbids future launch', () => assert.equal(starts, 1));
    const wrong = new api.Control(Object.assign({}, options, { supervisorSHA256: '0'.repeat(64) })); wrong.start();
    check('tampered supervisor refused before spawn', () => { assert.equal(wrong.state, 'error'); assert.equal(starts, 1); assert.equal(wrong.error, 'configuration'); });
    const failed = new api.Control(Object.assign({}, options, { spawn: () => { throw new Error(secret); } })); failed.start();
    check('spawn exceptions redacted', () => { assert.equal(failed.state, 'error'); assert(!JSON.stringify(failed.snapshot()).includes(secret)); });

    // Explicit mock contract: resolves our state/component/entry wiring only.
    // It cannot validate the BMW donor's actual implementation or firmware.
    const values = {}, components = {}; let writes = 0, active = false, hmiVisible = false, rejectActive = false;
    const description = JSON.parse(fs.readFileSync(path.join(root, 'apps/izum_mgu_xray/package/rhmiData/uiDescriptions/ID7/uiDescription.json')));
    Object.keys(description.containers['1'].components).forEach(id => {
        const c = description.containers['1'].components[id]; const emitter = new EventEmitter();
        emitter.getId = () => Number(id); emitter.setValue = (row, cell, value) => { writes++; values[c.name] = value; return Promise.resolve(); }; components[c.name] = emitter;
    });
    const rhmi = new EventEmitter(); rhmi.getByName = name => name === 'XR_Main' ? {} : components[name];
    rhmi.mapEntryState = () => Promise.resolve(); rhmi.openEntryState = () => Promise.resolve();
    let instance, controlOptions;
    class OnlineApp extends EventEmitter {
        constructor() { super(); instance = this; this.rhmiApplication = rhmi; this.appDescription = { application: { entryPoints: [{ uuid: 'fixture' }] } }; }
        getEntryPoints() { return [{ getDescription: () => ({ uuid: 'fixture' }), init: () => Promise.resolve(), setAvailability: () => Promise.resolve() }]; }
        registerActive() { if (rejectActive) return Promise.reject(new Error("fixture lifecycle error")); active = true; return Promise.resolve(); } registerInactive() { active = false; return Promise.resolve(); }
        registerHmiVisible() { hmiVisible = true; return Promise.resolve(); } unregisterHmiVisible() { hmiVisible = false; return Promise.resolve(); }
        initialized() { return Promise.resolve(); } getLastExecutedEntryPointUuid() { return 'fixture'; }
        start() { this.emit('initialized'); return Promise.resolve(); }
    }
    class FakeControl extends EventEmitter {
        constructor(options) { super(); controlOptions = options; this.starts = this.stops = 0; this.state = "off"; this.child = null; }
        snapshot() { return { state: this.state, seconds: 0, retries: 0 }; }
        start() { this.starts++; this.state = "running"; this.child = {}; this.emit("change"); } stop() { this.stops++; this.state = "off"; this.child = null; this.emit("change"); return Promise.resolve(); } shutdown() { return this.stop(); }
    }
    const entry = path.join(root, 'apps/izum_mgu_xray/src/app.js');
    vm.runInNewContext(fs.readFileSync(entry, 'utf8'), {
        __dirname: path.join(temp, 'source/javascript'), process: { on: () => {}, exit: () => {} },
        setInterval, clearInterval, Date,
        require: name => name === 'oap-sdk/src/core/OnlineApp.js' ? OnlineApp : name === './control.js' ? { Control: FakeControl } : name === './deployment.js' ? {} : require(name)
    });
    await new Promise(resolve => setImmediate(resolve));
    check('profile/runtime root uses persistent OAP home data not replaceable source', () => assert.equal(controlOptions.root, path.join(temp, 'data')));
    check('RHMI components mapped; Russian default', () => { assert.equal(instance.uiReady, true); assert.equal(values.XR_start, 'Запустить прокси'); });
    components.XR_start.emit('action'); rhmi.emit('userEvent', { eventType: 'ACTION', sourceId: components.XR_start.getId() });
    await new Promise(resolve => setImmediate(resolve));
    check('native buttons and duplicate action dedupe', () => assert.equal(instance.control.starts, 1));
    check('RU/EN language switch', () => { components.XR_language.emit('action'); assert.equal(values.XR_start, 'Start proxy'); });
    instance.emit('changeVisibility', { visible: false }); await instance.lifeQueue;
    check('hide retains running proxy, ACTIVE without HMI visibility', () => { assert.equal(instance.control.stops, 0); assert(active); assert(!hmiVisible); });
    check('hidden rendering sends no RHMI writes', () => { const before = writes; instance.render(); assert.equal(writes, before); });
    await instance.open('fixture');
    check('reopen displays existing process without duplicate launch', () => { assert.equal(instance.control.starts, 1); assert(active); assert(hmiVisible); });
    instance.emit('changeVisibility', { visible: false }); await instance.lifeQueue;
    await instance.requestStop(); await instance.lifeQueue;
    check('explicit hidden stop releases ACTIVE retention', () => { assert(!active); assert.equal(instance.control.stops, 1); });
    instance.requestStart(); instance.requestStop(); await new Promise(resolve => setImmediate(resolve));
    check('stop cancels pending asynchronous start', () => assert.equal(instance.control.starts, 1));
    rejectActive = true; instance.lifeSent.active = null;
    instance.requestStart(); await new Promise(resolve => setImmediate(resolve));
    check('failed lifecycle retention forbids engine launch without retry loop', () => { assert.equal(instance.control.starts, 1); assert(instance.failed); });
    rejectActive = false; instance.emit('appStatusProxyReady'); await new Promise(resolve => setImmediate(resolve));
    instance.requestStart(); await new Promise(resolve => setImmediate(resolve));
    check('status channel recovery allows deliberate new start', () => assert.equal(instance.control.starts, 2));
    instance.emit('shutdown'); await instance.shutdownPromise;
    check('shutdown stops background work and releases retention', () => { assert(!active); assert(!hmiVisible); assert.equal(instance.control.child, null); });
    console.log('Native checks: ' + checks + ' passed (filesystem/process boundaries and mock RHMI contract).');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => fs.rmSync(temp, { recursive: true, force: true }));
