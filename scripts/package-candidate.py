#!/usr/bin/env python3
"""Local candidate packages. Never installs, publishes or promotes a release."""
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist/candidate'
VERSION = '0.2.1'
STORE_COMMIT = '37702a880f1ed5fd346f4c944127fb276920be9c'


def main():
    upstream = ROOT / 'research/upstream/robertnisipeanu--mgu-store'
    if subprocess.check_output(['git', '-C', str(upstream), 'rev-parse', 'HEAD'], text=True).strip() != STORE_COMMIT:
        raise SystemExit('Store source revision mismatch')
    if subprocess.check_output(['git', '-C', str(upstream), 'status', '--porcelain'], text=True).strip():
        raise SystemExit('Store source tree modified')
    OUT.mkdir(parents=True, exist_ok=True)
    # Reuse the existing strict ELF/notice/checksum packer, keeping all units,
    # hooks, recmgr and autostart lists empty. It performs no installation.
    spec = importlib.util.spec_from_file_location('engineering_package', ROOT / 'scripts/package.py')
    kit = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(kit)
    kit.VERSION = VERSION
    sys.argv = ['package.py', '--out', str(OUT)]
    kit.main()
    app = ROOT / 'apps/izum_mgu_xray'
    packed = OUT / ('izum_mgu_xray@' + VERSION + '.tgz')
    source = 'const link=require(process.argv[1]);console.log(JSON.stringify(link.packSource(process.argv[2],process.argv[3])));'
    subprocess.run(['node', '-e', source, str(upstream / 'tools/oap_link.js'), str(app), str(packed)], check=True)
    catalog = json.loads((OUT / 'catalog.json').read_text())
    catalog['components'].append({
        'id': 'izum_mgu_xray', 'kind': 'app', 'version': VERSION,
        'title': 'MGU-Xray · experimental candidate',
        'description': 'Background-capable native control. Not BMW-tested; not an approved vehicle release.',
        'mguHmi': ['ID7'], 'uninstallable': True, 'build': 'unit',
        'requires': {'mgu-deploy': '0.7.0', 'izum-mgu-xray': VERSION},
        'artifact': {'name': packed.name, 'size': packed.stat().st_size,
                     'sha256': hashlib.sha256(packed.read_bytes()).hexdigest(), 'url': packed.name},
    })
    (OUT / 'catalog.json').write_text(json.dumps(catalog, indent=2) + '\n')
    repo = {'schema': 1, 'components': [
        {'id': 'izum_mgu_xray', 'kind': 'app', 'path': 'apps/izum_mgu_xray', 'build': 'unit',
         'mguHmi': ['ID7'], 'requires': {'izum-mgu-xray': VERSION}},
    ]}
    (OUT / 'mgu-repo.json.example').write_text(json.dumps(repo, indent=2) + '\n')
    # One folder, one catalog describing BOTH engine and UI. Do not leave the
    # engine-only engineering USB tree that the lower-level packer generated.
    shutil.rmtree(OUT / 'usb')
    usb = OUT / 'usb/mgu-repo/izum-mgu-xray'
    usb.mkdir(parents=True)
    names = ['catalog.json', 'izum-mgu-xray@' + VERSION + '.tgz', packed.name]
    sums = ''.join(hashlib.sha256((OUT / name).read_bytes()).hexdigest() + '  ' + name + '\n' for name in sorted(names))
    (OUT / 'SHA256SUMS').write_text(sums)
    for name in names + ['SHA256SUMS']:
        shutil.copyfile(OUT / name, usb / name)
    print('CANDIDATE ONLY. No target validation, install, autostart or release promotion:', OUT)


if __name__ == '__main__':
    main()
