#!/usr/bin/env python3
"""Generate original RHMI source-package metadata; no BMW SDK or target access."""
import hashlib
import json
from pathlib import Path
import struct
import uuid
import zlib

ROOT = Path(__file__).resolve().parents[1]
ID, VERSION = 'izum_mgu_xray', '0.2.0'
APP = ROOT / 'apps' / ID


def write(name, data):
    path = APP / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')


def main():
    supervisor = ROOT / 'build/mgu-xray-linux-amd64'
    engine = ROOT / 'build/xray-linux-amd64'
    deployment = {
        'supervisor': '/var/opt/izum-mgu-xray/current/mgu-xray',
        'engine': '/var/opt/izum-mgu-xray/current/xray',
        'supervisorSHA256': hashlib.sha256(supervisor.read_bytes()).hexdigest(),
        'engineSHA256': hashlib.sha256(engine.read_bytes()).hexdigest(),
    }
    (APP / 'src/deployment.js').write_text("'use strict';\nmodule.exports = " + json.dumps(deployment, indent=2) + ';\n')
    write('mgu-app.json', {
        'schema': 1, 'id': ID, 'version': VERSION, 'mguHmi': ['ID7'], 'internet': True,
        'tree': 'package', 'modules': ['src/app.js', 'src/control.js', 'src/deployment.js'],
        'sdk': ['oap-sdk/src/core/OnlineApp.js'],
    })
    write('package/package.json', {
        'name': ID, 'version': VERSION, 'private': True, 'mguHmi': ['ID7'], 'mguInternet': True,
        'description': 'Experimental foreground-only REALITY proxy control. Not target-validated.',
        'main': 'javascript/runner.js', 'license': 'MIT',
        'oapAppSettings': {
            'maxDiskUsage': 26214400, 'cpuLimit': 20, 'memoryThresholdKB': 98304,
            'priority': 'PRIO_MEDIUM', 'visibility': 'FOREGROUND', 'latencyClass': 'FOREGROUND',
            'loggingId': 'MXRY', 'userLoginRequired': False, 'backgroundPriority': 150,
            'someipManifest': 'manifest.json',
        },
        'files': ['config', 'rhmiData', 'package.json', 'permissions.json', 'manifest.json', 'javascript', 'LICENSE'],
        'dependencies': {'oap-sdk': '24.10.2'}, 'engines': {'node': '>=8.9.4'},
    })
    write('package/config/base.json', {})
    write('package/permissions.json', {})
    # Only UI/app lifecycle proxies. No vehicle, CAN, telephony or session data.
    proxies = [
        'de.bmw.infotainment.telematic.oapcontroller.OAPController',
        'de.bmw.infotainment.hmi.remote.RemoteHmi',
        'de.bmw.infotainment.hmi.remote.RemoteHmiApplication',
        'de.bmw.infotainment.hmi.entrypoint.EntryPoint',
        'de.bmw.infotainment.hmi.entrypoint.EntryPointManager',
        'de.bmw.infotainment.hmi.resourcemanagement.ResourceManager',
        'de.bmw.infotainment.hmi.resourcemanagement.ResourceBundle',
        'de.bmw.infotainment.hmi.resourcemanagement.StringBundle',
        'de.bmw.infotainment.certification.Certification',
    ]
    write('package/manifest.json', {'proxies': {name: '*' for name in proxies}})
    uid = lambda name: str(uuid.uuid5(uuid.NAMESPACE_URL, 'https://github.com/leshkaoo/mgu-xray/' + name))
    write('package/rhmiData/application.json', {
        'schemaVersion': '1.3.0', 'application': {
            'uuid': uid('app'), 'type': 'OnlineApp', 'name': ID, 'vendor': 'MGU-Xray contributors',
            'version': VERSION, 'defaultLanguage': 'en_GB',
            'uiDescriptions': [{'applicationFilePath': './uiDescriptions/ID7/application.xml', 'uiDescriptionFilePath': './uiDescriptions/ID7/uiDescription.json', 'hmi': ['ID7']}],
            'stringBundleUuid': uid('strings'), 'resourceBundleUuid': uid('resources'),
            'variantGroups': [{'stringsPath': './variantGroups/Common/texts', 'resourcesPath': './variantGroups/Common/images', 'hmi': ['ID7'], 'brands': ['BMW']}],
            'entryPoints': [{'name': ID, 'uuid': uid('entry'), 'textId': 'SID_XR_TITLE', 'icon': 'mgu_xray.png',
                             'insertionStateId': 20974, 'insertionFocusId': 2, 'insertionMode': 'INSERT_BELOW',
                             'insertionOrder': 0, 'insertionPriority': 0, 'previewType': 'NONE', 'bookmarkable': True,
                             'private': None, 'appearance': 'DEFAULT', 'isGroupHeader': False, 'insertionGroup': 0}],
        },
    })
    components = {'10': {'type': 'title', 'name': 'XR_title', 'properties': {'Visible': {'value': 1, 'type': 'UInt'}}, 'rows': [{'Text': {'value': 'SID_XR_TITLE', 'type': 'StringId'}}]}}
    xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<application>', '<container id="1" type="state" widget="LT_State_Wide">', '<layoutGroup id="100" name="Titlebar"><component id="10" type="title"><property id="2" value="1"/></component></layoutGroup>', '<layoutGroup id="200" name="List"><property id="3" value="1"/>']
    rows = ['candidate', 'status', 'detail', 'start', 'stop', 'session', 'metrics', 'limits', 'setup', 'language']
    for number, name in enumerate(rows, 20):
        button = name in ['start', 'stop', 'language']
        kind, widget, focus = ('button', 'LT_Button_1Row', 3) if button else ('label', 'LT_Label_1Row', 0)
        components[str(number)] = {'type': kind, 'name': 'XR_' + name, 'properties': {'Visible': {'value': 1, 'type': 'UInt'}, 'Focusable': {'value': focus, 'type': 'UInt'}}, 'rows': [{'Text': {'value': name, 'type': 'Text'}}]}
        xml.append(f'<component id="{number}" type="{kind}" widget="{widget}"><property id="2" value="1"/><property id="3" value="{focus}"/></component>')
    xml += ['</layoutGroup>', '</container>', '</application>']
    write('package/rhmiData/uiDescriptions/ID7/uiDescription.json', {'schemaVersion': '1.3.0', 'containers': {'1': {'type': 'state', 'name': 'XR_Main', 'components': components}}})
    (APP / 'package/rhmiData/uiDescriptions/ID7/application.xml').write_text('\n'.join(xml) + '\n')
    for language in ['en_GB', 'ru_RU']:
        write('package/rhmiData/variantGroups/Common/texts/' + language + '.json', {'SID_XR_TITLE': 'MGU-Xray'})
    # Original geometric X icon, not BMW artwork. Deterministic PNG, no library.
    pixels = bytearray()
    for y in range(140):
        pixels.append(0)
        for x in range(140):
            cross = 30 < x < 110 and 30 < y < 110 and (abs(x-y) < 8 or abs(x+y-140) < 8)
            pixels.extend((224, 241, 255, 255) if cross else (18, 50 + y // 3, 80 + x // 3, 255))
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 140, 140, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(pixels)) + chunk(b'IEND', b'')
    icon = APP / 'package/rhmiData/variantGroups/Common/images/mgu_xray.png'
    icon.parent.mkdir(parents=True, exist_ok=True)
    icon.write_bytes(png)
    (APP / 'package/LICENSE').write_bytes((ROOT / 'LICENSE').read_bytes())
    print('Generated original RHMI source tree and pinned binary metadata:', APP)


if __name__ == '__main__':
    main()
