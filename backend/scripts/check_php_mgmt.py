try:
    from test_env import load_dotenv
    load_dotenv()
except ImportError:
    try:
        from backend.scripts.test_env import load_dotenv
        load_dotenv()
    except ImportError:
        pass

import os
import socket, struct, paramiko, json

proxy_host = '127.0.0.1'
proxy_port = 10808
target_host = os.environ.get("ARMGUARD_SSH_HOST", "127.0.0.1")
target_port = 22
user = 'root'
pwd = os.environ.get("ARMGUARD_SSH_PASSWORD", "")

sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.connect((proxy_host, proxy_port))
sock.sendall(b'\x05\x01\x00')
sock.recv(2)
ipv6_bytes = socket.inet_pton(socket.AF_INET6, target_host)
sock.sendall(b'\x05\x01\x00\x04' + ipv6_bytes + struct.pack('>H', target_port))
sock.recv(4 + 16 + 2)

transport = paramiko.Transport(sock)
transport.connect(username=user, password=pwd)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh._transport = transport

cmd = '''python3 -c "
import urllib.request, json
req = urllib.request.Request('http://[::1]:8888/api/v1/auth/login', data=json.dumps({'username':'admin', 'password':'armguard'}).encode(), headers={'Content-Type':'application/json'})
res = urllib.request.urlopen(req)
d = json.loads(res.read().decode())
token = d['data']['token']

req2 = urllib.request.Request('http://[::1]:8888/api/v1/apps/php/management', headers={'Authorization': 'Bearer ' + token})
res2 = urllib.request.urlopen(req2)
d2 = json.loads(res2.read().decode())
d2['data'].pop('raw_config', None)
print('RAW DATA:', json.dumps(d2['data']))
"'''
stdin, stdout, stderr = ssh.exec_command(cmd)
print(stdout.read().decode())
err = stderr.read().decode()
if err: print('ERR:', err)

transport.close()
sock.close()
