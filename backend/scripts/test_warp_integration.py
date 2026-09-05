try:
    from test_env import load_dotenv
    load_dotenv()
except ImportError:
    try:
        from backend.scripts.test_env import load_dotenv
        load_dotenv()
    except ImportError:
        pass

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

def run_cmd(title, cmd):
    print(f"\n==================== {title} ====================")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='ignore')
    err = stderr.read().decode('utf-8', errors='ignore')
    if out:
        print(out.strip())
    if err:
        print("STDERR:", err.strip())

# Test safe wireguard tunnel creation
test_script = """
import subprocess
import urllib.request
import json
import os

os.makedirs('/etc/wireguard', exist_ok=True)
os.makedirs('/var/lib/armguard', exist_ok=True)

# 1. Gen Key
privkey = subprocess.check_output(['wg', 'genkey']).decode().strip()
pubkey = subprocess.check_output(['wg', 'pubkey'], input=privkey.encode()).decode().strip()

# 2. Register
url = 'https://api.cloudflareclient.com/v0a2158/reg'
data = json.dumps({'key': pubkey, 'install_id': '', 'fcm_token': '', 'tos': '2020-09-01T00:00:00.000Z', 'model': 'Linux', 'type': 'Android', 'locale': 'zh_CN'}).encode()
req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json', 'User-Agent': 'okhttp/3.12.1'}, method='POST')

with urllib.request.urlopen(req, timeout=10) as r:
    res = json.loads(r.read().decode())

acc_id = res.get('id')
v4_addr = res.get('config', {}).get('interface', {}).get('addresses', {}).get('v4')
v6_addr = res.get('config', {}).get('interface', {}).get('addresses', {}).get('v6')
peer_pubkey = res.get('config', {}).get('peers', [{}])[0].get('public_key')
endpoint = '162.159.192.1:2408'
# For IPv6 only server, endpoint can be [2606:4700:d0::a29f:c001]:2408
endpoint_v6 = '[2606:4700:d0::a29f:c001]:2408'

print(f"Registered Account: {acc_id}")
print(f"v4: {v4_addr}, v6: {v6_addr}")

# Save account
with open('/var/lib/armguard/warp_account.json', 'w') as f:
    json.dump({
        'account_id': acc_id,
        'private_key': privkey,
        'public_key': pubkey,
        'v4': v4_addr,
        'v6': v6_addr,
        'peer_pubkey': peer_pubkey,
        'endpoint_v6': endpoint_v6,
        'endpoint_v4': endpoint
    }, f, indent=2)

print('Saved /var/lib/armguard/warp_account.json successfully.')
"""

escaped_code = test_script.replace('"', '\\"').replace('$', '\\$')
run_cmd("1. Register Cloudflare WARP Account & Save", f'python3 -c "{escaped_code}"')
run_cmd("2. Check warp_account.json", "cat /var/lib/armguard/warp_account.json")

transport.close()
sock.close()
