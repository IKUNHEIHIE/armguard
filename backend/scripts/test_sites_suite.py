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

print("=== 1. Create a Test Site with SPA Rewrite ===")
create_payload = json.dumps({
    "domain": "test-spa.armguard.dev",
    "domains": ["test-spa.armguard.dev", "www.test-spa.armguard.dev"],
    "php_version": "static",
    "rewrite_preset": "spa"
}).replace('"', '\\"')

stdin, stdout, stderr = ssh.exec_command(f'curl -s -6 -X POST "http://[::1]:8888/api/v1/sites" -H "Authorization: Bearer {token}" -H "Content-Type: application/json" -d "{create_payload}"')
res = stdout.read().decode('utf-8')
print("Create Site Result:", res)
site_id = json.loads(res).get('data', {}).get('id')

print(f"=== 2. Get Details for Site #{site_id} ===")
stdin, stdout, stderr = ssh.exec_command(f'curl -s -6 "http://[::1]:8888/api/v1/sites/{site_id}/details" -H "Authorization: Bearer {token}"')
print("Details:", stdout.read().decode('utf-8'))

print(f"=== 3. Update Settings (Reverse Proxy + SubDir + BasicAuth) ===")
update_payload = json.dumps({
    "proxy_enabled": True,
    "proxy_pass": "http://127.0.0.1:3000",
    "websocket_enabled": True,
    "sub_dir": "/dist",
    "basic_auth_enabled": True,
    "basic_auth_user": "devuser",
    "basic_auth_pass": "secret123"
}).replace('"', '\\"')

stdin, stdout, stderr = ssh.exec_command(f'curl -s -6 -X PUT "http://[::1]:8888/api/v1/sites/{site_id}/settings" -H "Authorization: Bearer {token}" -H "Content-Type: application/json" -d "{update_payload}"')
print("Update Result:", stdout.read().decode('utf-8'))

print("=== 4. Verify Nginx Syntax on Host ===")
stdin, stdout, stderr = ssh.exec_command('nginx -t')
print("Nginx Test:", stdout.read().decode('utf-8') + stderr.read().decode('utf-8'))

print(f"=== 5. Toggle Site Status ===")
stdin, stdout, stderr = ssh.exec_command(f'curl -s -6 -X PUT "http://[::1]:8888/api/v1/sites/{site_id}/toggle" -H "Authorization: Bearer {token}"')
print("Toggle Result:", stdout.read().decode('utf-8'))

print(f"=== 6. Cleanup Test Site ===")
stdin, stdout, stderr = ssh.exec_command(f'curl -s -6 -X DELETE "http://[::1]:8888/api/v1/sites/{site_id}" -H "Authorization: Bearer {token}"')
print("Delete Result:", stdout.read().decode('utf-8'))

transport.close()
sock.close()
