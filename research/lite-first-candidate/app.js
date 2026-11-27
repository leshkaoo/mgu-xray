'use strict';
const d = require('./diagnostics.js');
d.record('LOAD', 'BEGIN');
function boot() {
    const sdk = require('oap-sdk/src/core/OnlineApp.js');
    const OnlineApp = sdk.OnlineApp || sdk;
    class Lite extends OnlineApp {
        constructor() {
            super();
            d.record('CONSTRUCT', 'OK');
            this.failed = false; this.closing = false; this.uiReady = false;
            this.visible = false; this.statusReady = false; this.acked = false;
            this.lifeQueue = Promise.resolve(); this.lastStatus = null;
            this.deadline = setTimeout(() => this.fail(d.failure('SDK_READY','E_TIMEOUT')),15000);
            this.proxyDeadline=setTimeout(()=>{if(!this.statusReady && !this.closing)d.record('SDK_READY','E_PROXY_TIMEOUT');},15000);
            this.on('initialized', () => {
                if (this.setupPromise) { d.record('REINIT','IGNORED'); return; }
                this.setupPromise = Promise.resolve().then(() => this.setup()).catch(e => this.fail(e));
            });
            this.on('appStatusProxyReady', () => { d.record('SDK_READY','OK'); this.statusReady=true; clearTimeout(this.proxyDeadline); if(this.failed || this.closing)d.release(this); this.sync(); });
            this.on('entryPointExecute', uuid => {
                d.record('ENTRY_EXEC','BEGIN'); this.pending=uuid;
                if (this.acked && !this.rhmiApplication) this.fail(d.failure('RHMI_SETUP','E_NO_RHMI_FOREGROUND'));
                else if (this.uiReady) this.open(uuid).catch(e=>this.fail(e));
            });
            this.on('changeVisibility', data => {
                if (!data || typeof data.visible !== 'boolean') return;
                this.visible=data.visible; d.record('VISIBILITY',data.visible?'VISIBLE':'HIDDEN'); this.sync();
            });
            this.on('error', () => this.fail(d.failure('ERROR','E_SDK')));
            this.on('shutdown', () => this.shutdown().then(()=>process.exit(0)));
        }
        check() { if (this.failed || this.closing) throw d.failure('ERROR','E_TERMINAL'); }
        call(stage, action) { return d.step(stage,()=>{this.check(); return action();}); }
        setup() {
            this.check();
            const reason=d.reason(this), fg=!!this.pending || d.foreground(reason);
            const rhmi=this.rhmiApplication;
            if (!rhmi) {
                if (fg || reason!=='CONFIG_STATE') throw d.failure('RHMI_SETUP',fg?'E_NO_RHMI_FOREGROUND':'E_NO_RHMI_UNKNOWN');
                d.record('RHMI_SETUP','CONFIG_NO_RHMI');
                return this.call('INIT_ACK',()=>this.initialized()).then(()=>{this.check(); this.acked=true; clearTimeout(this.deadline);});
            }
            const state=rhmi.getByName('XR_Main'), label=rhmi.getByName('XR_status');
            if(!state || !label) throw d.failure('RHMI_SETUP',!state?'E_STATE':'E_COMPONENT');
            const descriptions=this.appDescription && this.appDescription.application && this.appDescription.application.entryPoints;
            this.entry=this.getEntryPoints().filter(e=>(descriptions || []).some(v=>v.uuid===e.getDescription().uuid))[0];
            if(!this.entry) throw d.failure('ENTRY_INIT','E_ENTRY');
            rhmi.on('restoreHmi',()=>{d.record('RESTORE','BEGIN'); if(this.uiReady) this.write().catch(e=>this.fail(e));});
            this.label=label;
            return this.call('RHMI_SETUP',()=>state.updateResources())
                .then(()=>this.call('ENTRY_INIT',()=>this.entry.init()))
                .then(()=>this.call('ENTRY_MAP',()=>rhmi.mapEntryState(this.entry.getDescription().uuid,state)))
                .then(()=>this.call('ENTRY_ENABLE',()=>this.entry.setAvailability('ENABLED')))
                .then(()=>{this.check(); if(fg) d.declareActive(this,e=>this.fail(e));})
                .then(()=>this.call('INIT_ACK',()=>this.initialized()))
                .then(()=>{this.check(); this.acked=true; return this.write();})
                .then(()=>{
                    this.check(); clearTimeout(this.deadline); this.uiReady=true; d.record('UI_READY','OK');
                    const uuid=this.pending || (fg && this.getLastExecutedEntryPointUuid && this.getLastExecutedEntryPointUuid());
                    if(uuid) return this.open(uuid);
                });
        }
        write() { return this.call('UI_READY',()=>this.label.setValue(0,'Text','MGU-Xray UI successfully started','Text')); }
        open(uuid) {
            if(this.failed || this.closing) return Promise.resolve();
            if(this.openPromise) return this.openPromise;
            this.visible=true; this.sync();
            this.openPromise=this.call('OPEN_STATE',()=>this.rhmiApplication.openEntryState(uuid))
                .then(()=>{this.check(); this.openPromise=null;}, e=>{this.openPromise=null; throw e;});
            return this.openPromise;
        }
        sync() {
            this.lifeQueue=this.lifeQueue.catch(()=>{}).then(()=>{
                if(!this.acked || !this.statusReady || this.failed || !this.rhmiApplication) return;
                const visible=!this.closing && this.visible;
                if(this.lastStatus===visible) return;
                return d.step('LIFECYCLE',()=>visible?this.registerActive():this.registerInactive())
                    .then(()=>d.step('LIFECYCLE',()=>visible?this.registerHmiVisible():this.unregisterHmiVisible()))
                    .then(()=>{if(!this.failed) this.lastStatus=visible;});
            }).catch(e=>this.fail(e));
            return this.lifeQueue;
        }
        fail(e) {
            d.record(e && e.stage || 'ERROR',e && e.code || 'E_LAUNCH');
            this.failed=true; clearTimeout(this.deadline); d.release(this);
        }
        shutdown() {
            if(this.shutdownPromise) return this.shutdownPromise;
            d.record('SHUTDOWN','BEGIN'); this.closing=true; clearTimeout(this.deadline); clearTimeout(this.proxyDeadline);
            // Never kill/restart MainApp; a bounded app-only cleanup.
            this.shutdownPromise=this.sync().then(()=>d.step('SHUTDOWN',()=>typeof this.destroyBundles==='function'?this.destroyBundles():undefined))
                .catch(()=>{});
            return this.shutdownPromise;
        }
    }
    const app=new Lite();
    process.on('SIGTERM',()=>app.shutdown().then(()=>process.exit(0)));
    process.on('SIGINT',()=>app.shutdown().then(()=>process.exit(0)));
    d.step('SDK_START',()=>app.start(),15000).catch(e=>app.fail(e));
}
try { boot(); } catch (_) { d.record('CONSTRUCT','E_BOOT'); }
