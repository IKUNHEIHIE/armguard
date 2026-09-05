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
import socket, struct, paramiko

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

def get_status():
    req = urllib.request.Request('http://[::1]:8888/api/v1/auth/login', data=json.dumps({'username':'admin', 'password':'armguard'}).encode(), headers={'Content-Type':'application/json'})
    token = json.loads(urllib.request.urlopen(req).read().decode())['data']['token']

    req2 = urllib.request.Request('http://[::1]:8888/api/v1/apps/market', headers={'Authorization': 'Bearer ' + token})
    res2 = json.loads(urllib.request.urlopen(req2).read().decode())
    php_item = next(x for x in res2['data']['list'] if x['key'] == 'php')
    return php_item['service_status']

# Test stopped
subprocess.run(['systemctl', 'stop', 'php8.2-fpm', 'php8.3-fpm'])
st_stopped = get_status()
print('When services are stopped -> market service_status is:', st_stopped)

# Test started
subprocess.run(['systemctl', 'start', 'php8.2-fpm', 'php8.3-fpm'])
st_started = get_status()
print('When services are started -> market service_status is:', st_started)
"""

sftp = paramiko.SFTPClient.from_transport(transport)
with sftp.open('/tmp/test_stop_start.py', 'w') as f:
    f.write(remote_py)
sftp.close()

stdin, stdout, stderr = ssh.exec_command('python3 /tmp/test_stop_start.py')
print(stdout.read().decode('utf-8', errors='replace'))
print(stderr.read().decode('utf-8', errors='replace'))

transport.close()
sock.close()
