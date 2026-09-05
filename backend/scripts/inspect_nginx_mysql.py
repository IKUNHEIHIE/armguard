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
import sys
sys.stdout.reconfigure(encoding='utf-8')
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

remote_py = """
import urllib.request, json

def request_api(path, method='GET', body=None, token=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(f'http://[::1]:8888{path}', data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as res:
            return json.loads(res.read().decode())
    except urllib.error.HTTPError as e:
        return {'error': e.code, 'msg': e.read().decode()}

auth = request_api('/api/v1/auth/login', 'POST', {'username': 'admin', 'password': 'armguard'})
token = auth['data']['token']

print('=== NGINX MANAGEMENT ===')
nginx = request_api('/api/v1/apps/nginx/management', 'GET', token=token)
print(json.dumps(nginx, indent=2, ensure_ascii=False))

print('=== MYSQL MANAGEMENT ===')
mysql = request_api('/api/v1/apps/mysql/management', 'GET', token=token)
print(json.dumps(mysql, indent=2, ensure_ascii=False))
"""

sftp = paramiko.SFTPClient.from_transport(transport)
with sftp.open('/tmp/test_nginx_mysql.py', 'w') as f:
    f.write(remote_py)
sftp.close()

stdin, stdout, stderr = ssh.exec_command('python3 /tmp/test_nginx_mysql.py')
print(stdout.read().decode('utf-8', errors='replace'))
print(stderr.read().decode('utf-8', errors='replace'))

transport.close()
sock.close()
