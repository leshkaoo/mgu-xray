'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert'),EventEmitter=require('events');
const root=path.resolve(__dirname,'..'),pause=ms=>new Promise(r=>setTimeout(r,ms));
const traces=[];
async function run(mode,old) {
 const f={calls:[],trace:[],timers:[],opens:0};let releaseLabel,releaseStatus,releaseInitial,holdLabel=mode==='first-open',holdActive=false,holdInactive=false;
 const rhmi=new EventEmitter();
 const label={setValue(){f.calls.push('write');return holdLabel?new Promise(r=>{releaseLabel=r;}):Promise.resolve();}};
 rhmi.getByName=n=>n==='XR_Main'?{updateResources:()=>Promise.resolve()}:label;
 rhmi.mapEntryState=()=>Promise.resolve();rhmi.openEntryState=()=>{f.opens++;f.calls.push('open');return Promise.resolve();};
 class SDK extends EventEmitter {
  constructor(){super();f.app=this;this.startReason=mode==='entry-before-ack'?'CONFIG_STATE':'ENTRY_POINT';this.rhmiApplication=rhmi;this.appDescription={application:{entryPoints:[{uuid:'test'}]}};}
  getEntryPoints(){return [{getDescription:()=>({uuid:'test'}),init:()=>Promise.resolve(),setAvailability:()=>{if(mode==='entry-before-ack')this.emit('entryPointExecute','test');return Promise.resolve();}}];}
  getLastExecutedEntryPointUuid(){return 'test';}
  registerActive(){f.calls.push('active');if(mode==='initial-active-after-hide' && f.calls.filter(x=>x==='active').length===1)return new Promise(r=>{releaseInitial=r;});return holdActive?new Promise(r=>{releaseStatus=r;}):Promise.resolve();}
  registerInactive(){f.calls.push('inactive');return holdInactive?new Promise(r=>{releaseStatus=r;}):Promise.resolve();}
  registerHmiVisible(){f.calls.push('visible');return Promise.resolve();}
  unregisterHmiVisible(){f.calls.push('hidden');return Promise.resolve();}
  initialized(){f.calls.push('ack');return Promise.resolve();}
  start(){if(mode!=='first-open')this.emit('appStatusProxyReady');if(mode!=='entry-before-ack')this.emit('entryPointExecute','test');this.emit('initialized');return Promise.resolve();}
 }
 const dir=old?'research/lite-first-candidate':'apps/izum_mgu_xray_lite/src',cache={};
 function execute(file){if(cache[file])return cache[file].exports;const m={exports:{}};cache[file]=m;
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{module:m,exports:m.exports,__dirname:path.dirname(file),
 require:n=>n==='oap-sdk/src/core/OnlineApp.js'?{OnlineApp:SDK}:n[0]==='.'?execute(path.resolve(path.dirname(file),n)):require(n),
 process:{on(){},exit(){},stderr:{write:l=>f.trace.push(JSON.parse(l))}},
 setTimeout:(fn,ms)=>{const t=setTimeout(fn,Math.min(ms,75));f.timers.push(t);return t;},clearTimeout},{filename:file});return m.exports;}
 execute(path.join(root,dir,'app.js'));await pause(10);
 if(mode==='initial-active-after-hide'){
  f.app.emit('changeVisibility',{visible:false});await pause(10);assert(releaseInitial);
  const mark=f.calls.length;releaseInitial();await pause(10);
  if(old)assert(!f.calls.slice(mark).includes('inactive'),'negative control misses compensation');
  else assert(f.calls.slice(mark).includes('inactive'),'late initial ACTIVE must reassert hidden/inactive');
  assert(!f.calls.slice(mark).includes('visible'));
 } else if(mode==='entry-before-ack'){
  const ordered=f.calls.indexOf('active')>=0 && f.calls.indexOf('active')<f.calls.indexOf('ack');
  if(old)assert(!ordered,'negative control must reproduce stale CONFIG_STATE classification');
  else assert(ordered,'entry arriving during setup must declare ACTIVE at ACK boundary');
  assert.equal(f.opens,1);
 } else if(mode==='first-open'){
  assert(f.app.acked && !f.app.uiReady);f.app.emit('changeVisibility',{visible:false});f.app.emit('appStatusProxyReady');await pause(10);
  const dropped=f.calls.includes('inactive');if(old)assert(dropped,'negative control must reproduce early inactive');else assert(!dropped,'never release ACTIVE before first open');
  holdLabel=false;releaseLabel();await pause(10);assert(f.app.uiReady && f.opens===1);
 } else if(mode==='hide-reopen'){
  holdInactive=true;f.app.emit('changeVisibility',{visible:false});await pause(5);assert(releaseStatus);
  f.app.emit('entryPointExecute','test');const mark=f.calls.length;holdInactive=false;releaseStatus();await pause(15);
  if(old)assert(f.calls.slice(mark).includes('hidden'),'negative control must send stale hidden');
  else assert(!f.calls.slice(mark).includes('hidden'),'old hide must not overwrite reopened HMI');
  assert.equal(f.calls[f.calls.length-1],'visible');
 } else if(mode==='shutdown-pending'){
  f.app.emit('changeVisibility',{visible:false});await pause(10);
  holdActive=true;f.app.emit('entryPointExecute','test');await pause(5);assert(releaseStatus);
  const mark=f.calls.length,shutdown=f.app.shutdown();holdActive=false;releaseStatus();await shutdown;await pause(10);
  assert(!f.calls.slice(mark).includes('visible'),'shutdown must not send stale visible');
 } else if(mode==='late-status'){
  f.app.emit('changeVisibility',{visible:false});await pause(10);holdActive=true;f.app.emit('entryPointExecute','test');await pause(90);
  assert(f.app.failed);const mark=f.calls.length;holdActive=false;releaseStatus();await pause(15);
  assert(f.calls.slice(mark).includes('inactive') && f.calls.slice(mark).includes('hidden'),'late ACTIVE must be released');
  assert(f.app.failed);assert(!f.calls.slice(mark).includes('visible'));
 }
 await f.app.shutdown();for(const t of f.timers)clearTimeout(t);
 traces.push({mode,old:!!old,calls:f.calls,trace:f.trace});console.log('PASS '+mode+(old?' (negative control: first candidate race reproduced)':''));
}
(async()=>{await run('first-open',true);await run('hide-reopen',true);await run('entry-before-ack',true);await run('initial-active-after-hide',true);for(const mode of ['first-open','hide-reopen','entry-before-ack','initial-active-after-hide','shutdown-pending','late-status'])await run(mode,false);
 fs.writeFileSync(path.join(root,'evidence/lite-race-traces.json'),JSON.stringify(traces,null,2)+'\n');console.log('PASS 10 focused race scenarios; synthetic SDK, not vehicle proof.');})().catch(e=>{console.error(e);process.exit(1);});
