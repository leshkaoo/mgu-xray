#!/usr/bin/env python3
"""Inventory linked Go modules and license files; local research, not legal clearance."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess


def objects(raw):
    decoder = json.JSONDecoder()
    while raw.strip():
        raw = raw.lstrip()
        item, end = decoder.raw_decode(raw)
        yield item
        raw = raw[end:]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=Path('research/upstream/XTLS--Xray-core'))
    parser.add_argument('--engine', type=Path, default=Path('build/xray-linux-amd64'))
    parser.add_argument('--output', type=Path, default=Path('build/notices'))
    args = parser.parse_args()
    env = dict(os.environ, GOTOOLCHAIN='go1.27.3', CGO_ENABLED='0', GOOS='linux', GOARCH='amd64', GOAMD64='v1')
    raw = subprocess.check_output(['go', 'list', '-mod=readonly', '-deps', '-json', './main'], cwd=args.source, env=env, text=True)
    modules = {}
    for package in objects(raw):
        module = package.get('Module')
        if module:
            modules[module['Path']] = module.get('Replace', module)
    args.output.mkdir(parents=True, exist_ok=True)
    entries, files, missing = [], [], []

    def save(source, relative):
        target = args.output / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(source.read_bytes())
        files.append({'path': relative, 'sha256': digest(target)})

    for name, module in sorted(modules.items()):
        directory = Path(module['Dir'])
        found = sorted(p for p in directory.iterdir() if p.is_file() and re.match(r'(?i)^(licen[cs]e|copying|notice|copyright)([._-].*)?$', p.name))
        slug = re.sub(r'[^a-zA-Z0-9._-]', '_', name) + '@' + module.get('Version', 'main')
        for item in found:
            save(item, slug + '/' + item.name)
        if not found:
            missing.append(name)
        entries.append({'module': name, 'version': module.get('Version', 'main'), 'sum': module.get('Sum'), 'files': [slug + '/' + p.name for p in found]})
    goroot = Path(subprocess.check_output(['go', 'env', 'GOROOT'], env=env, text=True).strip())
    save(goroot / 'LICENSE', 'go-runtime/LICENSE')
    version = subprocess.check_output(['go', 'version'], env=env, text=True).strip()
    manifest = {'schema': 1, 'engineSha256': digest(args.engine), 'toolchain': version,
                'complete': not missing, 'legalAudit': 'pending', 'modules': entries,
                'files': sorted(files, key=lambda x: x['path']), 'missing': missing,
                'scope': 'Direct license/notice files of modules linked into linux/amd64 ./main plus Go runtime; not a legal audit or complete nested vendored-code audit.'}
    (args.output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({'modules': len(entries), 'noticeFiles': len(files), 'missing': missing, 'legalAudit': 'pending'}))
    return 0 if not missing else 2


if __name__ == '__main__':
    raise SystemExit(main())
