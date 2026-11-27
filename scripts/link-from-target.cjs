'use strict';
// Mac/offline only; never installs. Needs an authorized donor FROM THIS MGU.
const path=require('path'),fs=require('fs');
const [store, app, donor, out, interfaces]=process.argv.slice(2);
if(!store || !app || !donor || !out)throw Error('Usage: node link-from-target.cjs STORE_REPO APP_DIR TARGET_DONOR.tgz OUT.tgz [someip-interfaces.json]');
if(process.getuid && process.getuid()===0)throw Error('Run unprivileged on the Mac');
const link=require(path.resolve(store,'tools/oap_link.js'));
const opts={donors:[path.resolve(donor)],epoch:1795773600};
if(interfaces) {
 const db=JSON.parse(fs.readFileSync(interfaces,'utf8'));
 const known=Array.isArray(db)?db:db && db.interfaces && typeof db.interfaces==='object'?Object.keys(db.interfaces):null;
 if(!known)throw Error('Unrecognized SOME/IP database; refusing to guess');
 const missing=link.unknownInterfaces(path.resolve(app,'package'),known);
 if(missing.length)throw Error('Required interfaces absent on target: '+missing.join(', '));
 opts.interfaces=known;
}
console.log(JSON.stringify(link.build(path.resolve(app),path.resolve(out),opts),null,2));
console.log('Built only, not installed and not target-validated. Audit runner/provenance before installation.');
