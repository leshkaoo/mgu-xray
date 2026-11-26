#!/usr/bin/env python3
"""Synthetic REALITY test. All network endpoints are loopback; no owner secrets."""
import hashlib
import http.server
import json
import os
import pathlib
import select
import signal
import socket
import ssl
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parents[1]
ENGINE = ROOT / ('build/xray-darwin-arm64' if sys.platform == 'darwin' else 'build/xray-linux-amd64')
SUPERVISOR = ROOT / 'build/mgu-xray'
MARKER = b'MGU-Xray synthetic loopback fixture\n'

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Length', str(len(MARKER)))
        self.end_headers()
        self.wfile.write(MARKER)
    def log_message(self, *args):
        pass

class ConcurrentTLS(http.server.ThreadingHTTPServer):
    # REALITY sends concurrent cover probes. TLS handshakes must occur in
    # workers, not the accept loop (a wrapped listening socket serializes them).
    def process_request_thread(self, connection, address):
        connection.settimeout(3)
        try:
            wrapped = self.tls_context.wrap_socket(connection, server_side=True)
        except (OSError, ssl.SSLError):
            connection.close()
            return
        super().process_request_thread(wrapped, address)

def wait_port(port, child=None):
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        if child is not None and child.poll() is not None:
            raise RuntimeError('fixture child exited')
        try:
            with socket.create_connection(('127.0.0.1', port), timeout=.2):
                return
        except OSError:
            time.sleep(.1)
    raise RuntimeError('fixture listener timeout')

def wait_engine_started(child):
    # A transient port reservation during supervisor preflight is not a live
    # proxy. Wait for lifecycle start before probing listeners. This also keeps
    # the invalid-UUID test from mistaking connection-refused for auth denial.
    deadline = time.monotonic() + 20
    pending = b''
    background_seen = False
    while time.monotonic() < deadline:
        if child.poll() is not None:
            raise RuntimeError('fixture client exited before engine startup')
        readable, _, _ = select.select([child.stdout], [], [], .2)
        if readable:
            # Read the descriptor, not BufferedReader.readline(): readline may
            # prefetch the next lifecycle line into Python while select() then
            # sees an empty OS pipe and waits forever for that buffered line.
            pending += os.read(child.stdout.fileno(), 4096)
            while b'\n' in pending:
                line, pending = pending.split(b'\n', 1)
                if line.strip() == b'fixture: UI hidden; proxy retained ACTIVE':
                    background_seen = True
                if line.strip() in [b'engine started; upstream connectivity not yet verified', b'native controller: running']:
                    if globals().get('TEST_NATIVE_BACKGROUND', False) and not background_seen:
                        raise RuntimeError('native fixture did not confirm hidden background state')
                    return
            pending = pending[-1024:]
    raise RuntimeError('fixture engine startup timeout')

def reserve_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]

def stop(p):
    if p and p.poll() is None:
        p.send_signal(signal.SIGTERM)
        try:
            p.wait(timeout=8)
        except subprocess.TimeoutExpired:
            p.kill()
            p.wait(timeout=3)

def main():
    results = []
    children = []
    servers = []
    with tempfile.TemporaryDirectory(prefix='mgu-xray-fixture-') as temp:
        work = pathlib.Path(temp)
        try:
            # No existing listeners are ever killed or replaced.
            socks_port, http_port = reserve_port(), reserve_port()
            for port in [socks_port, http_port]:
                with socket.socket() as s:
                    s.bind(('127.0.0.1', port))
            tls_port, reality_port = reserve_port(), reserve_port()
            cert, key = work/'cert.pem', work/'key.pem'
            subprocess.run(['openssl','req','-x509','-newkey','ec','-pkeyopt',
                            'ec_paramgen_curve:P-256','-nodes','-keyout',str(key),
                            '-out',str(cert),'-days','1','-subj','/CN=localhost'],
                           check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            target = http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
            servers.append(target)
            threading.Thread(target=target.serve_forever,daemon=True).start()
            cover=ConcurrentTLS(('127.0.0.1',tls_port),Handler)
            context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            context.minimum_version=ssl.TLSVersion.TLSv1_3
            context.set_alpn_protocols(['h2','http/1.1'])
            context.set_ecdh_curve('X25519')
            context.load_cert_chain(str(cert),str(key))
            cover.tls_context=context
            servers.append(cover)
            threading.Thread(target=cover.serve_forever,daemon=True).start()
            pair = subprocess.check_output([str(ENGINE),'x25519'],text=True)
            private = next(x.split(': ',1)[1] for x in pair.splitlines() if x.startswith('PrivateKey:'))
            public = next(x.split(': ',1)[1] for x in pair.splitlines() if x.startswith('Password (PublicKey):'))
            identity = '00000000-0000-4000-8000-000000000001'
            server = {'log':{'loglevel':'debug'},'inbounds':[{
                'listen':'127.0.0.1','port':reality_port,'protocol':'vless',
                'settings':{'clients':[{'id':identity,'flow':'xtls-rprx-vision'}],'decryption':'none'},
                'streamSettings':{'network':'tcp','security':'reality','realitySettings':{
                    'target':'127.0.0.1:'+str(tls_port),'serverNames':['localhost'],
                    'privateKey':private,'shortIds':['0123456789abcdef']}}}],
                # Only the synthetic server can reach this exact local fixture.
                # Modern Xray blocks private egress by default; this exception
                # never enters the product importer or generated client config.
                'outbounds':[{'protocol':'freedom','settings':{'finalRules':[{
                    'action':'allow','ip':['127.0.0.1/32'],'port':str(target.server_port)}]}}]}
            def start_server():
                log=open(work/'server.log','ab')
                p=subprocess.Popen([str(ENGINE),'run','-config','stdin:'],stdin=subprocess.PIPE,
                                   stdout=log,stderr=log)
                log.close()
                p.stdin.write(json.dumps(server).encode());p.stdin.close();children.append(p)
                time.sleep(.2)
                return p
            remote = start_server()
            digest = hashlib.sha256(ENGINE.read_bytes()).hexdigest()
            query=urllib.parse.urlencode({'type':'tcp','security':'reality','encryption':'none',
                  'flow':'xtls-rprx-vision','sni':'localhost','fp':'chrome','pbk':public,'sid':'0123456789abcdef'})
            uri='vless://'+identity+'@127.0.0.1:'+str(reality_port)+'?'+query
            command=[str(SUPERVISOR),'-run','-engine',str(ENGINE),'-engine-sha256',digest,
                     '-socks-port',str(socks_port),'-http-port',str(http_port)]
            payload=uri.encode()
            if os.environ.get('MGU_FIXTURE_DEBUG')=='1':
                command=[str(ENGINE),'run','-config','stdin:']
                generated={'log':{'loglevel':'debug'},'inbounds':[
                    {'listen':'127.0.0.1','port':socks_port,'protocol':'socks','settings':{'auth':'noauth','udp':False}},
                    {'listen':'127.0.0.1','port':http_port,'protocol':'http','settings':{}}],
                    'outbounds':[{'protocol':'vless','settings':{'vnext':[{'address':'127.0.0.1',
                        'port':reality_port,'users':[{'id':identity,'encryption':'none','flow':'xtls-rprx-vision'}]}]},
                        'streamSettings':{'network':'tcp','security':'reality','realitySettings':{
                            'serverName':'localhost','fingerprint':'chrome','publicKey':public,'shortId':'0123456789abcdef'}}}]}
                payload=json.dumps(generated).encode()
            client=subprocess.Popen(command,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            children.append(client);client.stdin.write(payload);client.stdin.close()
            if os.environ.get('MGU_FIXTURE_DEBUG') != '1':
                wait_engine_started(client)
            wait_port(socks_port,client);wait_port(http_port,client)
            if globals().get('TEST_NATIVE_BACKGROUND', False):
                results.append('real app hidden, ACTIVE retained, HMI visibility released: PASS (SDK transport mocked)')
            url='http://127.0.0.1:'+str(target.server_port)+'/'
            def request(proxy):
                return subprocess.run(['curl','--silent','--show-error','--max-time','15',
                    '--noproxy','','--proxy',proxy,url],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            socks_proxy='socks5h://127.0.0.1:'+str(socks_port)
            http_proxy='http://127.0.0.1:'+str(http_port)
            for label,proxy in [('SOCKS5',socks_proxy),('HTTP',http_proxy)]:
                r=request(proxy)
                if r.returncode or r.stdout!=MARKER:
                    stop(client)
                    print('Supervisor fixture status:', client.stdout.read().decode(),client.stderr.read().decode())
                    debug=(work/'server.log').read_text(errors='replace')[-8000:]
                    for secret in [private,public,identity]:debug=debug.replace(secret,'[synthetic-redacted]')
                    print('Synthetic server log:',debug)
                    raise RuntimeError(label+' REALITY transfer failed: '+r.stderr.decode()[:400])
                results.append(label+' through synthetic REALITY: PASS')
            stop(remote)
            r=request(socks_proxy)
            if r.returncode==0 or MARKER in r.stdout:
                raise RuntimeError('unexpected direct fallback')
            results.append('upstream loss, no direct fallback: PASS')
            remote=start_server()
            r=request(socks_proxy)
            if r.returncode or r.stdout!=MARKER:
                raise RuntimeError('recovery failed')
            results.append('upstream recovery: PASS')
            if globals().get('TEST_PARENT_LOSS', False):
                client.kill()
                client.wait(timeout=3)
                deadline = time.monotonic() + 8
                while True:
                    try:
                        for port in [socks_port, http_port]:
                            with socket.socket() as probe:
                                probe.bind(('127.0.0.1', port))
                        break
                    except OSError:
                        if time.monotonic() >= deadline:
                            raise RuntimeError('UI parent death left proxy running')
                        time.sleep(.1)
                results.append('UI SIGKILL -> supervisor parent monitor closes listeners: PASS')
            else:
                stop(client)
            for port in [socks_port,http_port]:
                with socket.socket() as s:
                    s.bind(('127.0.0.1',port))
            results.append(('parent-loss cleanup' if globals().get('TEST_PARENT_LOSS', False) else 'SIGTERM') + ' removes both listeners: PASS')
            # Correctly formed but unauthorized identity must not reach target.
            wrong=uri.replace(identity,'00000000-0000-4000-8000-000000000002')
            rejected=subprocess.Popen([str(SUPERVISOR),'-run','-engine',str(ENGINE),
                '-engine-sha256',digest,'-socks-port',str(socks_port),'-http-port',str(http_port)],
                stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
            children.append(rejected);rejected.stdin.write(wrong.encode());rejected.stdin.close()
            wait_engine_started(rejected)
            wait_port(socks_port,rejected)
            denied=request(socks_proxy)
            if denied.returncode==0 or MARKER in denied.stdout:
                raise RuntimeError('unauthorized identity reached target')
            results.append('invalid VLESS identity denied, no direct fallback: PASS')
        finally:
            for p in reversed(children):stop(p)
            for s in servers:s.shutdown();s.server_close()
    print('\n'.join(results))

if __name__=='__main__':
    main()
