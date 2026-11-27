'use strict';
// On the MGU: node - [oap-root] < this-file. stdout ONLY. No installs/status CLI.
// No VPN profile/data files, environment, process arguments, VIN or full registry.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=process.argv[2] || '/var/opt/public/oap';
const ids=['izum_mgu_xray','izum_mgu_xray_lite','robertn_store','robertn_waze_cluster'];
const result={schema:1,time:new Date().toISOString(),node:process.version,inspectionNodePath:process.execPath,installed:[],errors:[]};
function read(p,limit){const s=fs.lstatSync(p);if(!s.isFile()||s.size>(limit||1048576))throw Error('not regular/bounded');return fs.readFileSync(p);}
function json(p){return JSON.parse(read(p,262144).toString());}
function hash(p){const b=read(p,32*1024*1024);return {bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')};}
let dirs=[];try{dirs=fs.readdirSync(root).filter(n=>/^oap_[0-9]+$/.test(n));}catch(_){result.errors.push('OAP_ROOT_UNREADABLE');}
// Inspect only our/reference app registry entries, never dump provisioningCache.
for(const dir of dirs) for(const id of ids){
 const reg=path.join(root,dir,'data/apps',id+'.json');
 if(!fs.existsSync(reg))continue;
 try{
  const e=json(reg);if(!/^[0-9]+$/.test(String(e.userId)))throw Error('uid');
  const home=path.join(root,'oap_'+e.userId),source=path.join(home,'source');
  const p=json(path.join(source,'package.json'));
  if(p.name!==id)throw Error('identity');
  const item={id,registryManager:dir,home,version:p.version,registryVersion:typeof e.version==='string' && /^[0-9A-Za-z.+_-]{1,40}$/.test(e.version)?e.version:null,main:p.main,sdk:p.dependencies&&p.dependencies['oap-sdk'],loggingId:p.oapAppSettings&&p.oapAppSettings.loggingId,files:{}};
  for(const name of ['package.json','javascript/runner.js','javascript/app.js','javascript/runnerConfig.json','javascript/build.json','config/base.json','manifest.json','permissions.json']){
   try{item.files[name]=hash(path.join(source,name));}catch(_){item.files[name]={unavailable:true};}
  }
  try{const b=json(path.join(source,'javascript/build.json'));item.build={version:b.version,name:b.name,main:b.main,bundle:b.bundle};}catch(_){}
  try{const c=json(path.join(source,'javascript/runnerConfig.json'));item.runnerConfig={DATA_RELATIVE_PATH:c.DATA_RELATIVE_PATH,JS_RELATIVE_PATH:c.JS_RELATIVE_PATH};}catch(_){}
  try{const c=json(path.join(source,'config/base.json'));item.loading={rhmiLoadingEnabled:c.rhmiLoadingEnabled,entryPointLoadingEnabled:c.entryPointLoadingEnabled};}catch(_){}
  try{const a=json(path.join(home,'rhmiData/application.json')).application;item.rhmi={version:a.version,hmi:(a.uiDescriptions||[]).map(u=>u.hmi),entryCount:(a.entryPoints||[]).length};}catch(_){item.rhmi={unavailable:true};}
  item.processes=[];
  try { fs.readdirSync('/proc').filter(pid=>/^[0-9]+$/.test(pid)).forEach(pid=>{
   try { if(fs.statSync('/proc/'+pid).uid===Number(e.userId)) {
    const stat=fs.readFileSync('/proc/'+pid+'/stat','utf8');
    let exe=null;try{exe=fs.readlinkSync('/proc/'+pid+'/exe');}catch(_){}
    item.processes.push({pid:Number(pid),startTicks:stat.slice(stat.lastIndexOf(')')+2).trim().split(/\s+/)[19],executable:exe,usesInspectionNode:exe===process.execPath});
   }} catch(_) {}
  }); } catch(_) {}
  result.installed.push(item);
 }catch(_){result.errors.push(id+':INSPECTION_FAILED');}
}
console.log(JSON.stringify(result,null,2));
