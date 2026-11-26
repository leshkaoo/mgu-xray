'use strict';
const d = require('./diagnostics.js');
const sdk = require('oap-sdk/src/core/OnlineApp.js');
const OnlineApp = sdk.OnlineApp || sdk;
class DiagnosticApp extends OnlineApp {
    constructor() {
        super(); this.control = { child: null }; this.uiReady = false; this.failed = false; this.lifeQueue = Promise.resolve();
        this.on('initialized', () => {
            const rhmi = this.rhmiApplication;
            if (!rhmi) { this.failed = true; return; }
            const state = rhmi.getByName('XR_Main');
            const ep = this.getEntryPoints()[0];
            d.step('RHMI_SETUP', () => state.updateResources()).then(() => d.step('ENTRY_INIT', () => ep.init()))
                .then(() => d.step('ENTRY_MAP', () => rhmi.mapEntryState(ep.getDescription().uuid, state)))
                .then(() => d.step('ENTRY_ENABLE', () => ep.setAvailability('ENABLED'))).then(() => d.step('INIT_ACK', () => this.initialized()))
                .then(() => rhmi.getByName('XR_status').setValue(0, 'Text', 'UI OK — proxy disabled', 'Text'))
                .then(() => { this.uiReady = true; return this.open(this.pending || this.getLastExecutedEntryPointUuid()); })
                .catch(() => { this.failed = true; });
        });
        this.on('entryPointExecute', uuid => { this.pending = uuid; if (this.uiReady) this.open(uuid).catch(() => { this.failed = true; }); });
    }
    open(uuid) { return d.step('OPEN_STATE', () => this.rhmiApplication.openEntryState(uuid)); }
    shutdown() { return Promise.resolve(); }
}
const app = new DiagnosticApp(); d.step('SDK_START', () => app.start()).catch(() => { app.failed = true; });
