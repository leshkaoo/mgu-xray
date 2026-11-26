#!/usr/bin/env python3
"""Offline safety/format tests, using synthetic non-executable ELF headers."""
import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import struct
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('package', Path(__file__).with_name('package.py'))
package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package)


class PackageSafety(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'build/notices').mkdir(parents=True)
        (self.root / 'packaging').mkdir()
        header = bytearray(120)
        header[:6] = b'\x7fELF\x02\x01'
        struct.pack_into('<H', header, 18, 62)
        struct.pack_into('<Q', header, 32, 64)
        struct.pack_into('<HH', header, 54, 56, 1)
        for name in ['xray-linux-amd64', 'mgu-xray-linux-amd64']:
            (self.root / 'build' / name).write_bytes(header)
        for name in ['LICENSE', 'SECURITY.md', 'RESEARCH.md', 'RISKS.md', 'ARCHITECTURE.md', 'packaging/README.engineering.md']:
            (self.root / name).write_text('Synthetic fixture, no real executable.\n')
        notice = self.root / 'build/notices/LICENSE'
        notice.write_text('Synthetic license fixture.\n')
        self.manifest = {'schema': 1, 'complete': True, 'missing': [], 'engineSha256': hashlib.sha256(header).hexdigest(),
                         'legalAudit': 'pending', 'files': [{'path': 'LICENSE', 'sha256': hashlib.sha256(notice.read_bytes()).hexdigest()}]}
        self.write_manifest()

    def write_manifest(self):
        (self.root / 'build/notices/manifest.json').write_text(json.dumps(self.manifest))

    def build(self):
        with patch.object(package, 'ROOT', self.root), patch.object(sys, 'argv', ['package.py']), contextlib.redirect_stdout(io.StringIO()):
            package.main()

    def test_missing_notices_blocks(self):
        self.manifest['complete'] = False
        self.manifest['missing'] = ['missing.module']
        self.write_manifest()
        with self.assertRaisesRegex(ValueError, 'incomplete'):
            self.build()
        self.assertFalse((self.root / 'dist').exists())

    def test_changed_engine_blocks(self):
        self.manifest['engineSha256'] = '0' * 64
        self.write_manifest()
        with self.assertRaisesRegex(ValueError, 'different engine'):
            self.build()

    def test_changed_notice_blocks(self):
        (self.root / 'build/notices/LICENSE').write_text('tampered')
        with self.assertRaisesRegex(ValueError, 'checksum mismatch'):
            self.build()

    def test_notice_traversal_blocks(self):
        self.manifest['files'][0]['path'] = '../secret'
        self.write_manifest()
        with self.assertRaisesRegex(ValueError, 'unsafe notice'):
            self.build()

    def test_dynamic_loader_blocks(self):
        binary = self.root / 'build/xray-linux-amd64'
        data = bytearray(binary.read_bytes())
        struct.pack_into('<I', data, 64, 3)
        binary.write_bytes(data)
        with self.assertRaisesRegex(ValueError, 'dynamic ELF'):
            self.build()

    def test_deterministic_no_execution_metadata(self):
        self.build()
        filename = package.ID + '@' + package.VERSION + '.tgz'
        artifact = self.root / 'dist/engineering' / filename
        first = artifact.read_bytes()
        self.build()
        self.assertEqual(first, artifact.read_bytes())
        with tarfile.open(artifact) as archive:
            component = json.load(archive.extractfile('component.json'))
            for key in ['units', 'enable', 'restart', 'recmgr', 'dropins']:
                self.assertEqual(component[key], [])
            for key in ['activate', 'deactivate', 'postInstall', 'check', 'internet']:
                self.assertNotIn(key, component)
            for entry in component['files']:
                self.assertEqual(entry['sha256'], hashlib.sha256(archive.extractfile('files/' + entry['path']).read()).hexdigest())
        catalog = json.loads((artifact.parent / 'catalog.json').read_text())
        self.assertEqual(catalog['schema'], 2)
        self.assertEqual(catalog['components'][0]['artifact']['sha256'], hashlib.sha256(first).hexdigest())
        self.assertEqual((artifact.parent / 'usb/mgu-repo' / package.ID / filename).read_bytes(), first)


if __name__ == '__main__':
    unittest.main()
