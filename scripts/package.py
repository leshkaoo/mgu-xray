#!/usr/bin/env python3
"""Build a local non-running engineering tool kit. Never installs or publishes."""
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path
import struct
import tarfile

ID, VERSION = 'izum-mgu-xray', '0.1.0'
TITLE = 'MGU-Xray engineering kit (not beta)'
DESCRIPTION = 'Local engineering artifact. No service, UI, autostart or vehicle validation. Not approved for vehicle installation or redistribution.'
ROOT = Path(__file__).resolve().parents[1]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def elf(path):
    data = path.read_bytes()
    if len(data) < 64 or data[:6] != b'\x7fELF\x02\x01' or struct.unpack_from('<H', data, 18)[0] != 62:
        raise ValueError('linux/amd64 ELF required: ' + path.name)
    offset = struct.unpack_from('<Q', data, 32)[0]
    size, count = struct.unpack_from('<HH', data, 54)
    if size < 56 or count < 1 or offset + size * count > len(data):
        raise ValueError('invalid ELF program headers')
    for index in range(count):
        if struct.unpack_from('<I', data, offset + size * index)[0] == 3:
            raise ValueError('dynamic ELF loader not allowed')
    return data


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--engine', type=Path, default=ROOT / 'build/xray-linux-amd64')
    p.add_argument('--supervisor', type=Path, default=ROOT / 'build/mgu-xray-linux-amd64')
    p.add_argument('--notices', type=Path, default=ROOT / 'build/notices')
    p.add_argument('--out', type=Path, default=ROOT / 'dist/engineering')
    args = p.parse_args()
    engine, supervisor = elf(args.engine), elf(args.supervisor)
    manifest = json.loads((args.notices / 'manifest.json').read_text())
    if manifest.get('schema') != 1 or not manifest.get('complete') or manifest.get('missing'):
        raise ValueError('dependency notice inventory incomplete; packaging blocked')
    if manifest.get('engineSha256') != sha(engine):
        raise ValueError('notice inventory belongs to a different engine')
    payload = {'xray': (engine, 0o755), 'mgu-xray': (supervisor, 0o755)}
    for name in ['README.engineering.md']:
        payload[name] = ((ROOT / 'packaging' / name).read_bytes(), 0o644)
    for name in ['CANDIDATE.md', 'CANDIDATE_TEST_REPORT.md', 'INSTALL-RU.md', 'SOURCES.md']:
        path = ROOT / 'packaging' / name
        if path.is_file():
            payload[name] = (path.read_bytes(), 0o644)
    for entry in manifest.get('files', []):
        relative = Path(entry['path'])
        if relative.is_absolute() or '..' in relative.parts:
            raise ValueError('unsafe notice path')
        data = (args.notices / relative).read_bytes()
        if sha(data) != entry['sha256']:
            raise ValueError('notice checksum mismatch')
        payload['notices/' + relative.as_posix()] = (data, 0o644)
    if not manifest.get('files'):
        raise ValueError('empty notice inventory')
    payload['notices/manifest.json'] = ((args.notices / 'manifest.json').read_bytes(), 0o644)
    for name in ['LICENSE', 'SECURITY.md', 'RESEARCH.md', 'RISKS.md', 'ARCHITECTURE.md']:
        path = ROOT / name
        if not path.is_file():
            raise ValueError('required project document absent: ' + name)
        payload[name] = (path.read_bytes(), 0o644)
    for name in ['README.md', 'PROGRESS.md', 'TEST_REPORT.md', 'TODO.md', 'CHANGELOG.md']:
        path = ROOT / name
        if path.is_file():
            payload[name] = (path.read_bytes(), 0o644)
    sums = ''.join(sha(data) + '  ' + name + '\n' for name, (data, _) in sorted(payload.items()))
    payload['SHA256SUMS'] = (sums.encode(), 0o644)
    component = {'id': ID, 'kind': 'tool', 'version': VERSION,
                 'title': TITLE,
                 'description': DESCRIPTION,
                 'uninstallable': True, 'mguHmi': ['ID7'], 'requires': {'mgu-deploy': '0.7.0'},
                 'files': [{'path': name, 'mode': format(mode, '04o'), 'sha256': sha(data)} for name, (data, mode) in sorted(payload.items())],
                 'units': [], 'enable': [], 'restart': [], 'recmgr': [], 'dropins': []}
    all_files = {'component.json': (json.dumps(component, indent=2).encode() + b'\n', 0o644)}
    all_files.update({'files/' + key: val for key, val in payload.items()})
    stream = io.BytesIO()
    with gzip.GzipFile(filename='', mode='wb', fileobj=stream, mtime=0) as zipped:
        with tarfile.open(fileobj=zipped, mode='w|', format=tarfile.USTAR_FORMAT) as archive:
            for name, (data, mode) in sorted(all_files.items()):
                info = tarfile.TarInfo(name)
                info.size, info.mode, info.mtime = len(data), mode, 0
                info.uid = info.gid = 0
                info.uname = info.gname = ''
                archive.addfile(info, io.BytesIO(data))
    packed = stream.getvalue()
    filename = ID + '@' + VERSION + '.tgz'
    catalog = {'schema': 2, 'components': [{'id': ID, 'kind': 'tool', 'version': VERSION,
                 'title': component['title'], 'description': component['description'], 'mguHmi': ['ID7'],
                 'optional': True, 'uninstallable': True, 'requires': component['requires'],
                 'artifact': {'name': filename, 'size': len(packed), 'sha256': sha(packed), 'url': filename}}]}
    args.out.mkdir(parents=True, exist_ok=True)
    usb = args.out / 'usb/mgu-repo' / ID
    usb.mkdir(parents=True, exist_ok=True)
    for target in [args.out, usb]:
        (target / filename).write_bytes(packed)
        (target / 'catalog.json').write_text(json.dumps(catalog, indent=2) + '\n')
        (target / 'SHA256SUMS').write_text(sha(packed) + '  ' + filename + '\n')
        (target / 'README.engineering.md').write_bytes(payload['README.engineering.md'][0])
    print(json.dumps({'artifact': str(args.out / filename), 'sha256': sha(packed), 'bytes': len(packed), 'legalAudit': manifest.get('legalAudit', 'pending'), 'targetTested': False}))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError, json.JSONDecodeError) as error:
        raise SystemExit('package refused: ' + str(error))
