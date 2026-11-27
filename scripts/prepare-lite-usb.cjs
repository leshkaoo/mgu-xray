'use strict';
// Mac only: create a LOCAL diagnostic USB layout. Does not touch the MGU.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert');
const root=path.resolve(__dirname,'..'),store=path.resolve(process.argv[2]),out=path.join(root,'dist/lite-usb/mgu-repo/xray-lite-diagnostics');
const link=require(path.join(store,'tools/oap_link.js'));
fs.mkdirSync(out,{recursive:true});
const id='izum_mgu_xray_lite',version='0.2.6',name=id+'@'+version+'.tgz';
link.packSource(path.join(root,'apps',id),path.join(out,name));
const bytes=fs.readFileSync(path.join(out,name)),sha256=crypto.createHash('sha256').update(bytes).digest('hex');
const catalog={schema:2,components:[{id,kind:'app',title:'MGU-Xray Lite — DIAGNOSTIC r2',description:'UNVALIDATED diagnostic. No engine/VPN. Install only after existing Store app-only path is verified.',version,artifact:{name,size:bytes.length,sha256,url:name},build:'unit',requires:{},optional:true,uninstallable:true,mguHmi:['ID7']}]};
const raw=JSON.stringify(catalog,null,2)+'\n';
require(path.join(store,'native/mgu-updater/js/catalog.js')).parse(raw);
fs.writeFileSync(path.join(out,'catalog.json'),raw);
fs.writeFileSync(path.join(out,'CANDIDATE-REVISION.json'),JSON.stringify({version,revision:'lite-r2',artifactSHA256:sha256,targetValidated:false,installationSafetyVerified:false,containsEngine:false,containsServices:false},null,2)+'\n');
fs.writeFileSync(path.join(out,'DO-NOT-INSTALL-BEFORE-PREFLIGHT.txt'),'Public diagnostic r2, not target-validated. Verify existing Store can install without BMW-file/service/network changes before inserting USB or pressing Install. Same package version as earlier local candidate: identify by revision and SHA256, not version alone.\n');
assert.equal(catalog.components.length,1);assert(!Object.keys(catalog.components[0].requires).length);
console.log(JSON.stringify({folder:out,artifactSHA256:sha256,bytes:bytes.length,components:1,validatedByUpstreamCatalogParser:true,installed:false},null,2));
