'use strict';
// Bounded application stderr: project stage/code only, never exception text.
const VERSION = '0.2.4-local';
const STAGES = ['LOAD', 'CONSTRUCT', 'SDK_START', 'SDK_READY', 'RHMI_SETUP', 'ENTRY_INIT', 'ENTRY_MAP', 'ENTRY_ENABLE', 'INIT_ACK', 'ENTRY_EXEC', 'OPEN_STATE', 'UI_READY', 'ENGINE_PRECHECK', 'ENGINE_START', 'ERROR', 'SHUTDOWN', 'LIFECYCLE'];
let count = 0;
const seen = Object.create(null);
function record(stage, code) {
    if (STAGES.indexOf(stage) < 0 || !/^[A-Z_0-9]{1,32}$/.test(code)) return;
    const key = stage + ':' + code;
    if (count >= 128 || (seen[key] || 0) >= 4) return;
    seen[key] = (seen[key] || 0) + 1; count++;
    try { process.stderr.write(JSON.stringify({ time: new Date().toISOString(), version: VERSION, stage: stage, code: code }) + '\n'); } catch (_) {}
}
function failure(stage, code) {
    const error = new Error('launch stage failed'); error.stage = stage; error.code = code; return error;
}
function step(stage, action, deadline) {
    record(stage, 'BEGIN');
    return new Promise((resolve, reject) => {
        let done = false;
        const finish = (error, value) => {
            if (done) return; done = true; clearTimeout(timer);
            if (error) { const safe = failure(stage, error); record(stage, error); reject(safe); }
            else { record(stage, 'OK'); resolve(value); }
        };
        const timer = setTimeout(() => finish('E_TIMEOUT'), deadline || 5000);
        Promise.resolve().then(action).then(value => finish(null, value), () => finish('E_REJECT'));
    });
}
module.exports = { record: record, step: step, failure: failure };
