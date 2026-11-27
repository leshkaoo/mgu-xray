'use strict';
// Run over ALREADY configured SSH. stdout -> a private file on the Mac.
// Reads existing journal only. No sudo, DLT setup, systemctl, updater or restart.
const cp=require('child_process');
const args=process.argv.slice(2), since=args.shift(), until=args.shift();
if(!since || !until || !args.length || args.length>6 || !args.every(x=>/^[0-9]{1,8}$/.test(x))) {
 console.error('Usage: node - "YYYY-MM-DD HH:MM:SS" "YYYY-MM-DD HH:MM:SS" APP_UID MAINAPP_UID [STORE_UID WAZE_UID]');process.exit(2);
}
const a=Date.parse(since.replace(' ','T')+'Z'),b=Date.parse(until.replace(' ','T')+'Z');
if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a||b-a>180000){console.error('Use UTC interval of 1..180 seconds');process.exit(2);}
const filters=[];args.forEach((uid,i)=>{if(i)filters.push('+');filters.push('_UID='+uid);});
const r=cp.spawnSync('journalctl',['--utc','--since',since,'--until',until,'--no-pager','-n','2000','-o','json'].concat(filters),{encoding:'utf8',timeout:8000,maxBuffer:2*1024*1024});
// Journal may contain private SDK/system payloads: keep this output LOCAL.
console.log(JSON.stringify({schema:1,since,until,uids:args,status:r.status,error:r.error?'JOURNAL_UNAVAILABLE_OR_LIMIT':null,rawJournal:r.stdout||'',notice:'PRIVATE RAW CAPTURE. Review/redact locally before sharing. Empty output does not prove no failure.'}));
