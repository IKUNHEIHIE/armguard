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
import urllib.request, json, subprocess

def request_api(path, method='GET', body=None, token=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(f'http://[::1]:8888{path}', data=data, headers=headers, method=method)
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read().decode())

# 1. Login
auth = request_api('/api/v1/auth/login', 'POST', {'username': 'admin', 'password': 'armguard'})
token = auth['data']['token']
print('[1] Login OK. Token:', token[:15] + '...')

# 2. Check Apps Market list
market = request_api('/api/v1/apps/market', 'GET', token=token)
php_item = next(item for item in market['data']['list'] if item['key'] == 'php')
print('[2] PHP Market Item:')
print('    Status:', php_item.get('status'))
print('    Service Status:', php_item.get('service_status'))
print('    Current Version:', php_item.get('current_version'))

# 3. Check PHP Management data
mgmt = request_api('/api/v1/apps/php/management', 'GET', token=token)
data = mgmt['data']
print('[3] PHP Management Data:')
print('    App Name:', data.get('app_name'))
print('    Service Name:', data.get('service_name'))
print('    Status:', data.get('status'), 'PID:', data.get('pid'), 'Mem:', data.get('memory_mb'))
cfg = data.get('visual_config', {})
print('    Default CLI:', cfg.get('default_cli_version'))
print('    Selected Ver:', cfg.get('selected_version'))
for v in cfg.get('php_versions', []):
    print(f'      - {v[\"name\"]}: installed={v[\"installed\"]}, default={v[\"is_default\"]}, status={v[\"status\"]}, pid={v[\"pid\"]}, mem={v[\"memory_mb\"]}MB')

# 4. Switch CLI version to 8.2
sw1 = request_api('/api/v1/apps/php/switch-version', 'POST', {'version': '8.2'}, token=token)
print('[4] Switch to PHP 8.2:', sw1['message'])
cli_ver = subprocess.run(['php', '-v'], capture_output=True, text=True).stdout.splitlines()[0]
print('    Host php -v:', cli_ver)

# 5. Switch CLI version back to 8.3
sw2 = request_api('/api/v1/apps/php/switch-version', 'POST', {'version': '8.3'}, token=token)
print('[5] Switch back to PHP 8.3:', sw2['message'])
cli_ver2 = subprocess.run(['php', '-v'], capture_output=True, text=True).stdout.splitlines()[0]
print('    Host php -v:', cli_ver2)

# 6. Service control: restart php8.2-fpm
ctl = request_api('/api/v1/apps/php/service-control', 'POST', {'action': 'restart', 'version': '8.2'}, token=token)
print('[6] Restart php8.2-fpm:', ctl['message'])
fpm_status = subprocess.run(['systemctl', 'is-active', 'php8.2-fpm'], capture_output=True, text=True).stdout.strip()
print('    Host php8.2-fpm status:', fpm_status)
"""

sftp = paramiko.SFTPClient.from_transport(transport)
with sftp.open('/tmp/verify_php_pool.py', 'w') as f:
    f.write(remote_py)
sftp.close()

stdin, stdout, stderr = ssh.exec_command('python3 /tmp/verify_php_pool.py')
print(stdout.read().decode('utf-8', errors='replace'))
print(stderr.read().decode('utf-8', errors='replace'))

transport.close()
sock.close()
