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
import socket
import struct
import paramiko
import json
import sys

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

proxy_host = "127.0.0.1"
proxy_port = 10808
target_host = os.environ.get("ARMGUARD_SSH_HOST", "127.0.0.1")
target_port = 22
user = "root"
pwd = os.environ.get("ARMGUARD_SSH_PASSWORD", "")

sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.connect((proxy_host, proxy_port))
sock.sendall(b"\x05\x01\x00")
sock.recv(2)
ipv6_bytes = socket.inet_pton(socket.AF_INET6, target_host)
sock.sendall(b"\x05\x01\x00\x04" + ipv6_bytes + struct.pack(">H", target_port))
sock.recv(4 + 16 + 2)

transport = paramiko.Transport(sock)
transport.connect(username=user, password=pwd)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh._transport = transport

def run_remote(script_content):
    escaped = script_content.replace('"', '\\"').replace('$', '\\$')
    cmd = f'python3 -c "{escaped}"'
    stdin, stdout, stderr = ssh.exec_command(cmd)
    print(stdout.read().decode('utf-8', errors='ignore'))
    err = stderr.read().decode('utf-8', errors='ignore')
    if err:
        print("STDERR:", err)

test_script = """
import urllib.request
import json
import subprocess

# 1. Generate Wireguard Private Key
try:
    privkey = subprocess.check_output(['wg', 'genkey']).decode().strip()
    pubkey = subprocess.check_output(['wg', 'pubkey'], input=privkey.encode()).decode().strip()
    print('Generated Keypair:', pubkey)
except Exception as e:
    print('wg genkey error:', e)
    privkey = ''
    pubkey = ''

# 2. Register Cloudflare WARP Account
if pubkey:
    url = 'https://api.cloudflareclient.com/v0a2158/reg'
    data = json.dumps({'key': pubkey, 'install_id': '', 'fcm_token': '', 'tos': '2020-09-01T00:00:00.000Z', 'model': 'Linux', 'type': 'Android', 'locale': 'zh_CN'}).encode()
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json', 'User-Agent': 'okhttp/3.12.1'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            res = json.loads(r.read().decode())
            print('CF Registration Success!')
            print('Account ID:', res.get('id'))
            print('Interface Address v4:', res.get('config', {}).get('interface', {}).get('addresses', {}).get('v4'))
            print('Interface Address v6:', res.get('config', {}).get('interface', {}).get('addresses', {}).get('v6'))
            print('Endpoint v4:', res.get('config', {}).get('peers', [{}])[0].get('endpoint', {}).get('v4'))
            print('Endpoint v6:', res.get('config', {}).get('peers', [{}])[0].get('endpoint', {}).get('v6'))
            print('Peer Pubkey:', res.get('config', {}).get('peers', [{}])[0].get('public_key'))
    except Exception as e:
        print('CF Registration error:', e)
"""

run_remote(test_script)

transport.close()
sock.close()
