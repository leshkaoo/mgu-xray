'use strict';
const VERSION = '0.2.6-lite';
const STAGES = ['LOAD','CONSTRUCT','SDK_START','SDK_READY','RHMI_SETUP','ENTRY_INIT','ENTRY_MAP','ENTRY_ENABLE','INIT_ACK','ENTRY_EXEC','OPEN_STATE','UI_READY','ENGINE_PRECHECK','ENGINE_START','ERROR','SHUTDOWN','LIFECYCLE','INITIAL_STATUS','START_REASON','REINIT','VISIBILITY','RESTORE'];
let count = 0;
const seen = Object.create(null);
const started = Date.now();
function record(stage, code) {
    if (STAGES.indexOf(stage) < 0 || !/^[A-Z_0-9]{1,40}$/.test(code)) return;
    const key = stage + ':' + code;
    if (count >= 256 || (seen[key] || 0) >= 12) return;
    seen[key] = (seen[key] || 0) + 1; count++;
    try { process.stderr.write(JSON.stringify({tag:'MXRY',version:VERSION,time:new Date().toISOString(),ms:Date.now()-started,seq:count,stage:stage,code:code}) + '\n'); } catch (_) {}
}
function failure(stage, code) { const e = new Error('launch stage failed'); e.stage=stage; e.code=code; return e; }
function step(stage, action, deadline) {
    record(stage,'BEGIN');
    return new Promise((resolve,reject) => {
        let done=false;
        const timer=setTimeout(() => finish('E_TIMEOUT'),deadline || 5000);
        function finish(error,value) {
            if (done) { record(stage,error ? 'LATE_REJECT':'LATE_OK'); return; }
            done=true; clearTimeout(timer);
            if(error) { record(stage,error); reject(failure(stage,error)); }
            else { record(stage,'OK'); resolve(value); }
        }
        Promise.resolve().then(action).then(v=>finish(null,v),()=>finish('E_REJECT'));
    });
}
const FG=['ENTRY_POINT','LUM','BOOKMARK','START_WIDGET','TRIGGER_HMI','SPEECH_COMMAND'];
function foreground(value) { return FG.indexOf(value)>=0; }
function reason(app) {
    let value;
    try { const d=app.getVisibilityData && app.getVisibilityData(); value=(d && d.reason)||app.startReason; } catch (_) {}
    value=foreground(value)||value==='CONFIG_STATE' ? value : 'UNKNOWN'; record('START_REASON',value); return value;
}
// Match Store/Waze: invoke/cache ACTIVE synchronously, do NOT await the
// return value before initialized(). Some SDKs complete it only after ACK.
// Observe rejection/timeout, but they do not cancel underlying SDK side effects.
function declareActive(app,onFailure) {
    record('INITIAL_STATUS','BEGIN');
    let result;
    try { result=app.registerActive(); } catch (_) { const e=failure('INITIAL_STATUS','E_THROW'); onFailure(e); throw e; }
    step('INITIAL_STATUS',()=>result).catch(onFailure);
    // The SDK operation itself is not cancelled by a deadline. If its side
    // effect arrives after failure/shutdown, best-effort release our app only.
    Promise.resolve(result).then(()=>{if(app.failed || app.closing) release(app);},()=>{});
}
function release(app) {
    if (!(app.acked || app.sdkInitialized) || !app.statusReady || app.releasePending) return;
    app.releasePending=true;
    step('LIFECYCLE',()=>app.registerInactive()).then(()=>step('LIFECYCLE',()=>app.unregisterHmiVisible()))
        .catch(()=>{}).then(()=>{app.releasePending=false;});
}
module.exports={record,step,failure,reason,foreground,declareActive,release};
