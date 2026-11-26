'use strict';
// Original MIT code. No HTTP API, shell, network reconfiguration or daemon.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');
const EventEmitter = require('events');

function dataRoot(root) {
    const stat = fs.lstatSync(root);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o022)) throw new Error('unsafe app data root');
}
function privateProfile(root) {
    dataRoot(root);
    const directory = path.join(root, 'private');
    const stat = fs.lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) || stat.uid !== process.getuid()) throw new Error('private directory');
    const fd = fs.openSync(path.join(directory, 'profile.txt'), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    try {
        const info = fs.fstatSync(fd);
        if (!info.isFile() || (info.mode & 0o077) || info.uid !== process.getuid() || info.size < 1 || info.size > 65536) throw new Error('private profile');
        const buffer = Buffer.alloc(65537);
        let total = 0, n;
        while (total < buffer.length && (n = fs.readSync(fd, buffer, total, buffer.length - total, null)) > 0) total += n;
        if (total > 65536) throw new Error('oversize profile');
        return buffer.slice(0, total);
    } finally { fs.closeSync(fd); }
}

function cleanupRuntime(directory) {
    // Only the exact launch-owned temp directory and known frozen xray files.
    // Unexpected entries/symlinks are left alone, never followed recursively.
    if (!directory) return;
    try {
        fs.readdirSync(directory).slice(0, 4).forEach(name => {
            if (!/^mgu-xray-[A-Za-z0-9-]+$/.test(name)) return;
            const folder = path.join(directory, name), stat = fs.lstatSync(folder);
            if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid()) return;
            const files = fs.readdirSync(folder);
            if (files.some(file => file !== 'xray')) return;
            if (files.length) {
                const file = path.join(folder, 'xray'), item = fs.lstatSync(file);
                if (!item.isFile() || item.isSymbolicLink() || item.uid !== process.getuid()) return;
                fs.unlinkSync(file);
            }
            fs.rmdirSync(folder);
        });
        const left = fs.readdirSync(directory);
        if (left.length === 1 && left[0] === 'owner.json') {
            const owner = path.join(directory, 'owner.json'), stat = fs.lstatSync(owner);
            if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid()) return;
            fs.unlinkSync(owner);
        }
        fs.rmdirSync(directory);
    } catch (_) { /* no deletion outside the launch-owned directory */ }
}

function bootIdentity() {
    try {
        const value = fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
        return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value) ? value : null;
    } catch (_) { return null; }
}
function processStart(pid) {
    try {
        const stat = fs.readFileSync('/proc/' + pid + '/stat', 'utf8');
        const value = stat.slice(stat.lastIndexOf(')') + 1).trim().split(/\s+/)[19];
        return /^\d+$/.test(value) ? value : null;
    } catch (_) { return null; }
}
function runtimeOwner() { return { pid: process.pid, bootId: bootIdentity(), startTime: processStart(process.pid) }; }
function staleOwner(owner, boot) {
    if (!owner || !Number.isInteger(owner.pid) || owner.pid <= 0 || owner.pid > 2147483647) return false;
    if (owner.bootId != null && (typeof owner.bootId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(owner.bootId))) return false;
    if (owner.startTime != null && (typeof owner.startTime !== 'string' || !/^\d+$/.test(owner.startTime))) return false;
    if (owner.bootId && boot) {
        if (owner.bootId !== boot) return true;
        const start = processStart(owner.pid);
        if (start && typeof owner.startTime === 'string' && /^\d+$/.test(owner.startTime) && start !== owner.startTime) return true;
        if (start) return false;
    }
    try { process.kill(owner.pid, 0); return false; } catch (error) { return error.code === 'ESRCH'; }
}
function sweepStaleRuntime(root) {
    // Bounded, no symlink traversal. Unknown/live owners are never removed.
    const boot = bootIdentity();
    let candidates;
    try { dataRoot(root); candidates = fs.readdirSync(root).filter(name => /^\.mgu-xray-run-\d+-[A-Za-z0-9-]+$/.test(name)).slice(0, 64); } catch (_) { return; }
    candidates.forEach(name => {
        try {
            const directory = path.join(root, name), stat = fs.lstatSync(directory);
            if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o077)) return;
            const file = path.join(directory, 'owner.json');
            let fd;
            try { fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK); }
            catch (error) {
                // Crash before marker creation: only remove an EMPTY directory
                // if the PID encoded in its name is demonstrably gone.
                if (error.code === 'ENOENT' && staleOwner({ pid: Number(name.split('-')[3]) }, boot)) {
                    try { fs.rmdirSync(directory); } catch (_) {}
                }
                return;
            }
            let owner;
            try {
                const info = fs.fstatSync(fd);
                if (!info.isFile() || info.uid !== process.getuid() || (info.mode & 0o077) || info.size > 512) return;
                const bytes = Buffer.alloc(513); let total = 0, n;
                while (total < bytes.length && (n = fs.readSync(fd, bytes, total, bytes.length - total, null)) > 0) total += n;
                if (total > 512) return;
                owner = JSON.parse(bytes.slice(0, total).toString('utf8'));
            } finally { fs.closeSync(fd); }
            if (String(owner.pid) !== name.split('-')[3]) return;
            if (staleOwner(owner, boot)) cleanupRuntime(directory);
        } catch (_) { /* incomplete/unknown metadata: preserve, never guess */ }
    });
}

class Control extends EventEmitter {
    constructor(options) {
        super();
        this.options = options;
        this.child = null;
        this.state = 'off';
        this.error = '';
        this.since = 0;
        this.retry = 0;
        this.stopping = false;
        this.closed = false;
        this.killTimer = null;
        this.stopPromise = null;
        this.spawn = options.spawn || cp.spawn;
    }
    snapshot() {
        return { state: this.state, error: this.error, seconds: this.since ? Math.floor((Date.now() - this.since) / 1000) : 0, retries: this.retry };
    }
    change(state, error) { this.state = state; this.error = error || ''; this.emit('change', this.snapshot()); }
    start() {
        if (this.closed || this.child || this.state === 'starting' || this.stopping) return;
        this.change('starting');
        let profile;
        try {
            profile = privateProfile(this.options.root);
            const binaryStat = fs.statSync(this.options.supervisor);
            if (!binaryStat.isFile() || binaryStat.size > 128 * 1024 * 1024) throw new Error('binary size');
            const binary = fs.readFileSync(this.options.supervisor);
            if (!/^[a-f0-9]{64}$/.test(this.options.supervisorSHA256) || crypto.createHash('sha256').update(binary).digest('hex') !== this.options.supervisorSHA256) throw new Error('binary integrity');
            if (!/^[a-f0-9]{64}$/.test(this.options.engineSHA256)) throw new Error('engine integrity metadata');
        } catch (_) {
            if (profile) profile.fill(0);
            this.change('error', 'configuration');
            return;
        }
        let child, runtime;
        try {
            const socks = this.options.socksPort || 10808, http = this.options.httpPort || 10809;
            if (!Number.isInteger(socks) || !Number.isInteger(http) || socks < 1024 || socks > 65535 || http < 1024 || http > 65535 || socks === http) throw new Error('ports');
            sweepStaleRuntime(this.options.root);
            runtime = fs.mkdtempSync(path.join(this.options.root, '.mgu-xray-run-' + process.pid + '-'));
            fs.writeFileSync(path.join(runtime, 'owner.json'), JSON.stringify(runtimeOwner()), { mode: 0o600, flag: 'wx' });
            child = this.spawn(this.options.supervisor, ['-run', '-parent-pid', String(process.pid), '-engine', this.options.engine, '-engine-sha256', this.options.engineSHA256, '-socks-port', String(socks), '-http-port', String(http)], {
                shell: false, detached: true, stdio: ['pipe', 'pipe', 'ignore'],
                env: { GOGC: '30', GOMEMLIMIT: '64MiB', TMPDIR: runtime }
            });
        } catch (_) { cleanupRuntime(runtime); profile.fill(0); this.change('error', 'start'); return; }
        this.child = child;
        this.retry = 0;
        let pending = '';
        child.stdout.on('data', data => {
            // Supervisor emits fixed, secret-free lifecycle lines only. Never
            // retain or display arbitrary output from a damaged executable.
            pending = (pending + data.toString('utf8')).slice(-1024);
            let end;
            while ((end = pending.indexOf('\n')) !== -1) {
                const line = pending.slice(0, end).trim(); pending = pending.slice(end + 1);
                if (this.stopping) continue;
                if (line === 'engine started; upstream connectivity not yet verified') {
                    this.since = Date.now(); this.change('running');
                } else if (line === 'engine stopped; bounded retry') {
                    this.since = 0; this.retry++; this.change('retry');
                }
            }
        });
        child.stdin.on('error', () => {});
        child.stdout.on('error', () => {});
        child.on('error', () => this.change('error', 'start'));
        child.on('close', () => {
            cleanupRuntime(runtime);
            profile.fill(0);
            clearTimeout(this.killTimer); this.killTimer = null;
            this.child = null; this.since = 0;
            const stopped = this.stopping;
            this.stopping = false; this.stopPromise = null;
            this.change(stopped ? 'off' : 'error', stopped ? '' : 'engine');
        });
        child.stdin.end(profile, () => profile.fill(0));
    }
    stop() {
        if (this.stopPromise) return this.stopPromise;
        const child = this.child;
        if (!child) { this.since = 0; this.change('off'); return Promise.resolve(); }
        this.stopping = true; this.change('stopping');
        this.stopPromise = new Promise(resolve => {
            child.once('close', resolve);
            try { child.kill('SIGTERM'); } catch (_) {}
            this.killTimer = setTimeout(() => {
                try { child.kill('SIGKILL'); } catch (_) {}
            }, 7000);
        });
        return this.stopPromise;
    }
    shutdown() { this.closed = true; return this.stop(); }
}
module.exports = { Control, privateProfile, cleanupRuntime, sweepStaleRuntime, runtimeOwner, staleOwner };
