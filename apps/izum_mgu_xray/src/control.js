'use strict';
// Original MIT code. No HTTP API, shell, network reconfiguration or daemon.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');
const EventEmitter = require('events');

function privateProfile(root) {
    const directory = path.join(root, 'private');
    const stat = fs.lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) || stat.uid !== process.getuid()) throw new Error('private directory');
    const fd = fs.openSync(path.join(directory, 'profile.txt'), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
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
        let child;
        try {
            const socks = this.options.socksPort || 10808, http = this.options.httpPort || 10809;
            if (!Number.isInteger(socks) || !Number.isInteger(http) || socks < 1024 || socks > 65535 || http < 1024 || http > 65535 || socks === http) throw new Error('ports');
            child = this.spawn(this.options.supervisor, ['-run', '-parent-pid', String(process.pid), '-engine', this.options.engine, '-engine-sha256', this.options.engineSHA256, '-socks-port', String(socks), '-http-port', String(http)], {
                shell: false, detached: true, stdio: ['pipe', 'pipe', 'ignore'],
                env: { GOGC: '30', GOMEMLIMIT: '64MiB', TMPDIR: this.options.root }
            });
        } catch (_) { profile.fill(0); this.change('error', 'start'); return; }
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
module.exports = { Control, privateProfile };
