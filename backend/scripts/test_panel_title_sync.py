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

token = "armguard_live_jwt_token"

print("=== 1. Set Custom Panel Title ===")
custom_title = "My ARM Cloud"
update_payload = json.dumps({"panel_title": custom_title}).replace('"', '\\"')
stdin, stdout, stderr = ssh.exec_command(f'curl -s -6 -X PUT "http://[::1]:8888/api/v1/settings/panel" -H "Authorization: Bearer {token}" -H "Content-Type: application/json" -d "{update_payload}"')
print("Update Response:", stdout.read().decode('utf-8'))

print("=== 2. Verify GET Panel Settings returns new title ===")
stdin, stdout, stderr = ssh.exec_command(f'curl -s -6 "http://[::1]:8888/api/v1/settings/panel" -H "Authorization: Bearer {token}"')
res = json.loads(stdout.read().decode('utf-8'))
print("Retrieved Title:", res.get('data', {}).get('panel_title'))

transport.close()
sock.close()
