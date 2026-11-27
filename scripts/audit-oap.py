#!/usr/bin/env python3
"""Local static audit: source tgz is NOT the target-built executable tgz."""
import sys,tarfile,json,hashlib,posixpath
p=sys.argv[1]
with tarfile.open(p,'r:gz') as t:
 files={m.name: t.extractfile(m).read() for m in t.getmembers() if m.isfile()}
 prefix='package/' if 'package/package.json' in files else ''
 def get(n): return files[prefix+n]
 def js(n): return json.loads(get(n))
 pkg=js('package.json'); report={'file':p,'sha256':hashlib.sha256(open(p,'rb').read()).hexdigest(),'name':pkg['name'],'version':pkg['version'],'main':pkg.get('main'),'sourcePackage':'mgu-app.json' in files,'files':{}}
 for n in ['javascript/runner.js','javascript/app.js','javascript/runnerConfig.json','javascript/build.json']:
  b=files.get(prefix+n);report['files'][n]=None if b is None else {'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
 if report['sourcePackage']:report['executable']=False
 else:
  main=pkg.get('main','');assert main in [n[len(prefix):] for n in files] and '..' not in main.split('/'),'invalid main'
  assert get('javascript/app.js'),'missing bundle'
  report['executable']=True
  if prefix+'javascript/runnerConfig.json' in files:
   c=js('javascript/runnerConfig.json');report['runnerConfig']=c
   assert posixpath.normpath(posixpath.join('javascript',c['JS_RELATIVE_PATH']))=='javascript/app.js'
   assert c['DATA_RELATIVE_PATH']=='../../data'
  if prefix+'javascript/build.json' in files:report['build']=js('javascript/build.json')
 print(json.dumps(report,indent=2))
