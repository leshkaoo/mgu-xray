'use strict';
const diagnostics = require('./diagnostics.js');
diagnostics.record('LOAD', 'BEGIN');
function boot() {
// Donor SDKs export either the constructor or a named OnlineApp export.
const onlineAppModule = require('oap-sdk/src/core/OnlineApp.js');
const OnlineApp = onlineAppModule.OnlineApp || onlineAppModule;
const path = require('path');
const Control = require('./control.js').Control;
const deployment = require('./deployment.js');

const WORDS = {
    ru: {
        off: 'Отключено', starting: 'Запуск…', running: 'Движок запущен · сеть не проверена', retry: 'Перезапуск движка', stopping: 'Остановка…', error: 'Не удалось запустить',
        start: 'Запустить прокси', stop: 'Остановить прокси', language: 'Language: English',
        limits: 'TCP REALITY · без VPN и XHTTP',
        setup: 'Настройка только вне дисплея движения, на стоянке',
        config: 'Нужен локальный профиль 0600 и проверенные бинарники',
        session: 'Работа движка: ', retries: 'Перезапусков: ',
        metrics: 'Задержка и трафик: не измеряются',
        candidate: 'Версия 0.2.4-local · на BMW не проверен', mode: 'Работа в фоне · без автозапуска'
    },
    en: {
        off: 'Disconnected', starting: 'Starting…', running: 'Engine running · uplink unverified', retry: 'Restarting engine', stopping: 'Stopping…', error: 'Could not start',
        start: 'Start proxy', stop: 'Stop proxy', language: 'Язык: Русский',
        limits: 'TCP REALITY · no VPN or XHTTP',
        setup: 'Configure off driving display, while parked',
        config: 'Needs local 0600 profile and verified binaries',
        session: 'Engine runtime: ', retries: 'Restarts: ',
        metrics: 'Latency and traffic: not measured',
        candidate: 'Version 0.2.4-local · not tested on BMW', mode: 'Background operation · no autostart'
    }
};

class XrayApp extends OnlineApp {
    constructor() {
        super();
        diagnostics.record('CONSTRUCT', 'OK');
        this.language = 'ru';
        this.components = {};
        this.written = {};
        this.uiReady = false;
        this.lastPress = {};
        this.closing = false;
        this.pendingEntry = null;
        this.visible = false;
        this.seenForeground = false;
        this.startRequested = false;
        this.startSerial = 0;
        this.failed = false;
        this.lifeQueue = Promise.resolve();
        this.sdkInitialized = false;
        this.statusReady = false;
        this.startDeadline = setTimeout(() => {
            if (!this.uiReady && !this.closing) this.fail(diagnostics.failure('SDK_READY', 'E_TIMEOUT'));
        }, 15000);
        this.lifeSent = { active: null, visible: null };
        // Installed bundle: <OAP home>/source/javascript/app.js. Only data/
        // is carried across Store reinstall/update/rollback, not source/.
        this.control = new Control(Object.assign({}, deployment, { root: path.resolve(__dirname, '..', '..', 'data') }));
        this.control.on('change', () => { this.render(); this.syncLifecycle().catch(() => this.fail()); });
        this.on('appStatusProxyReady', () => { diagnostics.record('SDK_READY', 'OK'); this.statusReady = true; this.failed = false; this.syncLifecycle(true).catch(() => this.fail()); });
        this.on('initialized', () => Promise.resolve().then(() => this.setup()).catch(error => this.fail(error)));
        this.on('entryPointExecute', uuid => {
            diagnostics.record('ENTRY_EXEC', 'BEGIN');
            this.pendingEntry = uuid;
            if (this.uiReady) this.open(uuid).catch(error => this.fail(error));
        });
        this.on('shutdown', () => this.shutdown().then(() => process.exit(0)));
        this.on('error', () => this.fail());
        this.on('changeVisibility', data => {
            if (!data || typeof data.visible !== 'boolean') return;
            if (data.visible) this.seenForeground = true;
            if (!data.visible && !this.seenForeground) return;
            this.visible = data.visible;
            this.syncLifecycle().catch(() => this.fail());
            this.render();
        });
    }
    syncLifecycle(force) {
        // ACTIVE is work retention, not HMI visibility. Serialize/coalesce SDK
        // calls so a delayed hide/inactive cannot overtake a new start/open.
        this.lifeQueue = this.lifeQueue.catch(() => {}).then(() => {
            // AppStatus is not callable until the SDK initialization handshake
            // and its proxy-ready notification have both completed.
            if (!this.sdkInitialized || !this.statusReady) return;
            const active = !this.closing && (!this.seenForeground || this.visible || this.startRequested || !!this.control.child);
            const visible = !this.closing && this.visible;
            return Promise.resolve().then(() => {
                if (!force && active === this.lifeSent.active) return;
                return diagnostics.step('LIFECYCLE', () => active ? this.registerActive() : this.registerInactive()).then(() => { this.lifeSent.active = active; });
            }).then(() => {
                if (!force && visible === this.lifeSent.visible) return;
                return diagnostics.step('LIFECYCLE', () => visible ? this.registerHmiVisible() : this.unregisterHmiVisible()).then(() => { this.lifeSent.visible = visible; });
            }).catch(error => { this.lifeSent = { active: null, visible: null }; throw error; });
        });
        return this.lifeQueue;
    }
    requestStart() {
        if (this.closing || this.failed || !this.sdkInitialized || !this.statusReady || this.startRequested || this.control.child) return;
        const serial = ++this.startSerial;
        this.startRequested = true;
        this.syncLifecycle().then(() => {
            if (!this.closing && serial === this.startSerial) { diagnostics.record('ENGINE_PRECHECK', 'BEGIN'); this.control.start(); diagnostics.record('ENGINE_START', this.control.child ? 'OK' : 'E_UNAVAILABLE'); }
        }).catch(() => this.fail()).then(() => {
            if (serial === this.startSerial) this.startRequested = false;
            return this.syncLifecycle();
        }).catch(() => this.fail());
    }
    requestStop() {
        ++this.startSerial; this.startRequested = false;
        return this.control.stop().then(() => this.syncLifecycle()).catch(() => this.fail());
    }
    setup() {
        diagnostics.record('RHMI_SETUP', 'BEGIN');
        if (!this.rhmiApplication) { diagnostics.record('RHMI_SETUP', 'E_NO_RHMI'); return diagnostics.step('INIT_ACK', () => this.initialized()).then(() => { this.sdkInitialized = true; clearTimeout(this.startDeadline); return this.syncLifecycle(); }); }
        const rhmi = this.rhmiApplication;
        const state = rhmi.getByName('XR_Main');
        if (!state) return Promise.reject(diagnostics.failure('RHMI_SETUP', 'E_STATE'));
        ['status', 'detail', 'session', 'metrics', 'limits', 'setup', 'candidate', 'mode', 'start', 'stop', 'language'].forEach(name => {
            const component = rhmi.getByName('XR_' + name);
            if (!component) throw diagnostics.failure('RHMI_SETUP', 'E_COMPONENT');
            this.components[name] = component;
        });
        const actions = {
            start: () => this.requestStart(),
            stop: () => this.requestStop(),
            language: () => { this.language = this.language === 'ru' ? 'en' : 'ru'; this.written = {}; this.render(); }
        };
        const ids = {};
        const press = name => {
            if (this.closing || Date.now() - (this.lastPress[name] || 0) < 400) return;
            this.lastPress[name] = Date.now(); actions[name]();
        };
        Object.keys(actions).forEach(name => {
            const component = this.components[name];
            ids[Number(component.getId())] = name;
            component.on('action', () => press(name));
        });
        rhmi.on('userEvent', event => {
            if (event && event.eventType === 'ACTION' && ids[Number(event.sourceId)]) press(ids[Number(event.sourceId)]);
        });
        rhmi.on('restoreHmi', () => { this.written = {}; this.render(); });
        const descriptions = this.appDescription.application.entryPoints;
        const entry = this.getEntryPoints().filter(e => descriptions.some(d => d.uuid === e.getDescription().uuid))[0];
        if (!entry) return Promise.reject(diagnostics.failure('ENTRY_INIT', 'E_ENTRY'));
        return diagnostics.step('RHMI_SETUP', () => state.updateResources())
            .then(() => diagnostics.step('ENTRY_INIT', () => entry.init()))
            .then(() => diagnostics.step('ENTRY_MAP', () => rhmi.mapEntryState(entry.getDescription().uuid, state)))
            .then(() => diagnostics.step('ENTRY_ENABLE', () => entry.setAvailability('ENABLED')))
            .then(() => diagnostics.step('INIT_ACK', () => this.initialized()))
            .then(() => {
                if (this.closing) return;
                clearTimeout(this.startDeadline);
                this.sdkInitialized = true;
                this.syncLifecycle().catch(() => this.fail());
                this.uiReady = true;
                diagnostics.record('UI_READY', 'OK');
                this.render();
                this.interval = setInterval(() => this.render(), 1000);
                const uuid = this.pendingEntry || (this.getLastExecutedEntryPointUuid && this.getLastExecutedEntryPointUuid());
                return uuid ? this.open(uuid) : undefined;
            });
    }
    open(uuid) {
        if (this.closing) return Promise.resolve();
        this.visible = true; this.seenForeground = true; this.written = {};
        return this.syncLifecycle().then(() => diagnostics.step('OPEN_STATE', () => this.rhmiApplication.openEntryState(uuid))).then(() => this.render());
    }
    render() {
        if (!this.uiReady || this.closing || !this.visible) return;
        const words = WORDS[this.language];
        const snapshot = this.control.snapshot();
        const runtime = Math.floor(snapshot.seconds / 60) + ':' + String(snapshot.seconds % 60).padStart(2, '0');
        const texts = {
            status: words[this.failed ? 'error' : snapshot.state], detail: snapshot.state === 'off' || snapshot.error || this.failed ? words.config : 'SOCKS5 127.0.0.1:10808 / HTTP 127.0.0.1:10809',
            session: words.session + runtime + ' · ' + words.retries + snapshot.retries,
            metrics: words.metrics, limits: words.limits, setup: words.setup, candidate: words.candidate, mode: words.mode,
            start: words.start, stop: words.stop, language: words.language
        };
        Object.keys(texts).forEach(name => {
            if (texts[name] === this.written[name]) return;
            this.written[name] = texts[name];
            Promise.resolve().then(() => this.components[name].setValue(0, 'Text', texts[name], 'Text')).catch(() => { diagnostics.record('UI_READY', 'E_WRITE'); delete this.written[name]; });
        });
    }
    fail(error) {
        diagnostics.record(error && error.stage || 'ERROR', error && error.code || 'E_LAUNCH');
        // Deliberately no exception, profile, SDK object or child output logs.
        if (this.failed) return;
        this.failed = true;
        ++this.startSerial; this.startRequested = false;
        if (this.control.child) this.control.stop();
        this.render();
    }
    shutdown() {
        if (this.shutdownPromise) return this.shutdownPromise;
        diagnostics.record('SHUTDOWN', 'BEGIN');
        this.closing = true;
        ++this.startSerial; this.startRequested = false;
        clearInterval(this.interval);
        clearTimeout(this.startDeadline);
        this.shutdownPromise = this.control.shutdown().then(() => this.syncLifecycle(true).catch(() => {})).then(() => {
            if (typeof this.destroyBundles === 'function') return Promise.resolve().then(() => this.destroyBundles()).catch(() => {});
        });
        return this.shutdownPromise;
    }
}

const app = new XrayApp();
process.on('SIGTERM', () => app.shutdown().then(() => process.exit(0)));
process.on('SIGINT', () => app.shutdown().then(() => process.exit(0)));
diagnostics.step('SDK_START', () => app.start()).catch(error => app.fail(error));
}
try { boot(); } catch (_) { diagnostics.record('CONSTRUCT', 'E_BOOT'); }
