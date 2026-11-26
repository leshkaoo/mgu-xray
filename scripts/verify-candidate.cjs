'use strict';
// Local-only upstream pack/link/validator verification, never install/main.
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const vm = require('vm'), crypto = require('crypto'), assert = require('assert');
const root = path.resolve(__dirname, '..');
const upstream = path.join(root, 'research/upstream/robertnisipeanu--mgu-store');
assert.equal(cp.execFileSync('git', ['-C', upstream, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), '37702a880f1ed5fd346f4c944127fb276920be9c');
const out = path.join(root, 'dist/candidate');
const version = JSON.parse(fs.readFileSync(path.join(root, 'apps/izum_mgu_xray/mgu-app.json'))).version;
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mgu-candidate-verify-'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function unpack(file, dest) {
    fs.mkdirSync(dest);
    const members = cp.execFileSync('tar', ['-tzf', file], { encoding: 'utf8' }).trim().split('\n');
    members.forEach(name => assert(name && !name.startsWith('/') && !name.split('/').includes('..')));
    cp.execFileSync('tar', ['-xzf', file, '-C', dest]);
    return members;
}
try {
    const catalog = JSON.parse(fs.readFileSync(path.join(out, 'catalog.json')));
    assert.equal(catalog.schema, 2); assert.equal(catalog.components.length, 2);
    catalog.components.forEach(component => {
        const packed = fs.readFileSync(path.join(out, component.artifact.name));
        assert.equal(packed.length, component.artifact.size); assert.equal(hash(packed), component.artifact.sha256);
        assert.deepEqual(component.mguHmi, ['ID7']);
    });
    const engineVersion = catalog.components.find(c => c.id === 'izum-mgu-xray').version;
    const tool = path.join(temp, 'tool'), app = path.join(temp, 'app');
    unpack(path.join(out, 'izum-mgu-xray@' + engineVersion + '.tgz'), tool);
    const appMembers = unpack(path.join(out, 'izum_mgu_xray@' + version + '.tgz'), app);
    assert(!appMembers.some(name => /(?:node_modules|private\/|profile\.txt|sdk\/)/.test(name)));
    const component = JSON.parse(fs.readFileSync(path.join(tool, 'component.json')));
    ['units', 'enable', 'restart', 'recmgr', 'dropins'].forEach(key => assert.deepEqual(component[key], []));
    ['activate', 'deactivate', 'postInstall'].forEach(key => assert.equal(component[key], undefined));

    const source = fs.readFileSync(path.join(upstream, 'deploy/unit/mgu-deploy.js'), 'utf8');
    function extract(name) {
        const start = source.indexOf('function ' + name + '('); assert(start >= 0);
        const lineEnd = source.indexOf('\n', start);
        if (source.slice(start, lineEnd).trim().endsWith('}')) return source.slice(start, lineEnd);
        const match = /^}/m.exec(source.slice(lineEnd)); assert(match);
        return source.slice(start, lineEnd + match.index + 1);
    }
    const helpers = ['refuse', 'lstatOrNull', 'sha256File', 'octalMode', 'semverParts', 'safeRel', 'hmiList', 'hookOk', 'validateTool'];
    const constants = ['RECMGR_NAME', 'CRASH_NAME', 'PROVIDES', 'DROPIN_UNIT', 'DROPIN_NAME', 'HOOK_SHAPE', 'HMIS'];
    const pure = constants.map(name => {
        const expression = new RegExp('^var ' + name + ' = .+$', 'm').exec(source); assert(expression); return expression[0];
    }).concat(helpers.map(extract)).join('\n');
    const context = { fs: { existsSync: fs.existsSync, lstatSync: fs.lstatSync, readFileSync: fs.readFileSync }, path, crypto };
    vm.createContext(context); vm.runInContext(pure, context);
    const validated = context.validateTool('local-candidate', tool, component);
    assert.equal(validated.id, 'izum-mgu-xray');
    const executable = path.join(tool, 'files/mgu-xray'); const saved = fs.readFileSync(executable);
    fs.appendFileSync(executable, 'tampered');
    assert.throws(() => context.validateTool('local-candidate', tool, component), /sha256 mismatch/);
    fs.writeFileSync(executable, saved);

    const deploymentFile = path.join(app, 'src/deployment.js');
    const deployment = require(deploymentFile);
    assert.equal(deployment.supervisorSHA256, hash(saved));
    assert.equal(deployment.engineSHA256, hash(fs.readFileSync(path.join(tool, 'files/xray'))));
    const link = require(path.join(upstream, 'tools/oap_link.js'));
    const donor = require(path.join(upstream, 'tools/test/synthetic_donor.js'));
    const donorFile = path.join(temp, 'donor.tgz'); donor.tgz(donorFile, { main: 'javascript/runner.js' });
    const one = path.join(temp, 'linked-one.tgz'), two = path.join(temp, 'linked-two.tgz');
    const result = link.build(app, one, { donors: [donorFile], epoch: 1795694400 });
    link.build(app, two, { donors: [donorFile], epoch: 1795694400 });
    assert.equal(hash(fs.readFileSync(one)), hash(fs.readFileSync(two)));
    assert.equal(result.id, 'izum_mgu_xray');
    const linked = path.join(temp, 'linked'); const linkedNames = unpack(one, linked);
    assert(linkedNames.includes('javascript/runner.js')); assert(linkedNames.includes('javascript/app.js'));
    const pkg = JSON.parse(fs.readFileSync(path.join(linked, 'package.json')));
    assert.equal(pkg.mguInternet, true);
    const acl = JSON.parse(fs.readFileSync(path.join(linked, 'permissions.json')));
    assert(Array.isArray(acl.masterAccessTable) && acl.masterAccessTable.length >= 4);
    assert(Array.isArray(acl.masterRegistrationTable) && acl.masterRegistrationTable.length >= 1);
    assert(acl.masterAccessTable.some(item => item.interfaceName.endsWith('/appstatus/AppStatus')));
    assert(acl.masterRegistrationTable.some(item => item.interfaceName.endsWith('/heartbeat/HeartbeatMonitor')));
    const manifest = JSON.parse(fs.readFileSync(path.join(linked, 'manifest.json')));
    assert.deepEqual(manifest.services['de.bmw.infotainment.telematic.oap.AppStatus'].instances, ['${userId}']);
    ['PrivateEntryPoint', 'AppBookmarks', 'WakeUpOnDemand', 'WodControl'].forEach(name => assert(manifest.proxies['de.bmw.infotainment.telematic.oap.' + name]));
    assert(!Object.keys(manifest.proxies).some(name => name.includes('.vehicle.')));
    const shrinkwrap = JSON.parse(fs.readFileSync(path.join(linked, 'npm-shrinkwrap.json')));
    assert.equal(shrinkwrap.name, pkg.name); assert.equal(shrinkwrap.version, version); assert.equal(shrinkwrap.lockfileVersion, 1);
    assert(pkg.oapAppSettings.maxDiskUsage > fs.statSync(path.join(tool, 'files/xray')).size + 16 * 1024 * 1024);
    console.log('PASS: catalog sizes/hashes, no SDK/secrets in source package, no service/hooks, upstream validateTool + tamper rejection, UI/engine digest match, actual upstream source link/pack with synthetic donor, deterministic linked bytes.');
    console.log('PASS: linked OAP lifecycle ACL tables, AppStatus service, core proxies, shrinkwrap and disk budget exceeding actual engine + margin.');
    console.log('NOT TESTED: real BMW donor/SDK runtime, installed updater, target ABI, install/rollback, Linux execution.');
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
