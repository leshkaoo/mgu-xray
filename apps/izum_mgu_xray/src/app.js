'use strict';
const OnlineApp = require('oap-sdk/src/core/OnlineApp.js');
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
        candidate: 'Кандидат 0.2.0 · на BMW не проверен'
    },
    en: {
        off: 'Disconnected', starting: 'Starting…', running: 'Engine running · uplink unverified', retry: 'Restarting engine', stopping: 'Stopping…', error: 'Could not start',
        start: 'Start proxy', stop: 'Stop proxy', language: 'Язык: Русский',
        limits: 'TCP REALITY · no VPN or XHTTP',
        setup: 'Configure off driving display, while parked',
        config: 'Needs local 0600 profile and verified binaries',
        session: 'Engine runtime: ', retries: 'Restarts: ',
        metrics: 'Latency and traffic: not measured',
        candidate: 'Candidate 0.2.0 · not tested on BMW'
    }
};

class XrayApp extends OnlineApp {
    constructor() {
        super();
        this.language = 'ru';
        this.components = {};
        this.written = {};
        this.uiReady = false;
        this.lastPress = {};
        this.closing = false;
        this.pendingEntry = null;
        this.control = new Control(Object.assign({}, deployment, { root: path.resolve(__dirname, '..') }));
        this.control.on('change', () => this.render());
        this.on('initialized', () => Promise.resolve().then(() => this.setup()).catch(() => this.fail()));
        this.on('entryPointExecute', uuid => {
            this.pendingEntry = uuid;
            if (this.uiReady) this.open(uuid).catch(() => this.fail());
        });
        this.on('shutdown', () => this.shutdown().then(() => process.exit(0)));
        this.on('error', () => this.fail());
        this.on('changeVisibility', data => {
            // Foreground-only first candidate: do not leave a proxy running
            // when the app is hidden. Continued background use is not claimed.
            if (data && data.visible === false) {
                this.control.stop();
                Promise.resolve(this.unregisterHmiVisible()).catch(() => {});
                Promise.resolve(this.registerInactive()).catch(() => {});
            }
        });
    }
    setup() {
        if (!this.rhmiApplication) return Promise.resolve(this.initialized());
        const rhmi = this.rhmiApplication;
        const state = rhmi.getByName('XR_Main');
        if (!state) return Promise.reject(new Error('missing state'));
        ['status', 'detail', 'session', 'metrics', 'limits', 'setup', 'candidate', 'start', 'stop', 'language'].forEach(name => {
            const component = rhmi.getByName('XR_' + name);
            if (!component) throw new Error('missing component');
            this.components[name] = component;
        });
        const actions = {
            start: () => this.control.start(),
            stop: () => this.control.stop(),
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
        if (!entry) return Promise.reject(new Error('entry point missing'));
        return Promise.resolve(entry.init())
            .then(() => rhmi.mapEntryState(entry.getDescription().uuid, state))
            .then(() => entry.setAvailability('ENABLED'))
            .then(() => this.registerActive())
            .then(() => this.initialized())
            .then(() => {
                this.uiReady = true;
                this.render();
                this.interval = setInterval(() => this.render(), 1000);
                const uuid = this.pendingEntry || (this.getLastExecutedEntryPointUuid && this.getLastExecutedEntryPointUuid());
                return uuid ? this.open(uuid) : undefined;
            });
    }
    open(uuid) {
        if (this.closing) return Promise.resolve();
        return Promise.resolve(this.registerActive()).then(() => this.registerHmiVisible())
            .then(() => this.rhmiApplication.openEntryState(uuid));
    }
    render() {
        if (!this.uiReady || this.closing) return;
        const words = WORDS[this.language];
        const snapshot = this.control.snapshot();
        const runtime = Math.floor(snapshot.seconds / 60) + ':' + String(snapshot.seconds % 60).padStart(2, '0');
        const texts = {
            status: words[snapshot.state], detail: snapshot.error ? words.config : 'SOCKS5 127.0.0.1:10808 / HTTP 127.0.0.1:10809',
            session: words.session + runtime + ' · ' + words.retries + snapshot.retries,
            metrics: words.metrics, limits: words.limits, setup: words.setup, candidate: words.candidate,
            start: words.start, stop: words.stop, language: words.language
        };
        Object.keys(texts).forEach(name => {
            if (texts[name] === this.written[name]) return;
            this.written[name] = texts[name];
            Promise.resolve(this.components[name].setValue(0, 'Text', texts[name], 'Text')).catch(() => { delete this.written[name]; });
        });
    }
    fail() {
        // Deliberately no exception, profile, SDK object or child output logs.
        this.control.stop();
    }
    shutdown() {
        if (this.shutdownPromise) return this.shutdownPromise;
        this.closing = true;
        clearInterval(this.interval);
        this.shutdownPromise = this.control.shutdown().then(() => {
            if (typeof this.destroyBundles === 'function') return Promise.resolve().then(() => this.destroyBundles()).catch(() => {});
        });
        return this.shutdownPromise;
    }
}

const app = new XrayApp();
process.on('SIGTERM', () => app.shutdown().then(() => process.exit(0)));
process.on('SIGINT', () => app.shutdown().then(() => process.exit(0)));
app.start().catch(() => app.fail());
