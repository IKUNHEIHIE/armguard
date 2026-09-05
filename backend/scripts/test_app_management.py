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

print("=== 1. Test PHP Management API ===")
stdin, stdout, stderr = ssh.exec_command(f'curl -s -6 "http://[::1]:8888/api/v1/apps/php/management" -H "Authorization: Bearer {token}"')
php_res = stdout.read().decode('utf-8')
print("PHP Management Response:")
print(json.dumps(json.loads(php_res), indent=2, ensure_ascii=False))

print("=== 2. Test Nginx Management API ===")
stdin, stdout, stderr = ssh.exec_command(f'curl -s -6 "http://[::1]:8888/api/v1/apps/nginx/management" -H "Authorization: Bearer {token}"')
nginx_res = stdout.read().decode('utf-8')
print("Nginx Management Response:")
print(json.dumps(json.loads(nginx_res), indent=2, ensure_ascii=False))

print("=== 3. Test Fail2ban Management API ===")
stdin, stdout, stderr = ssh.exec_command(f'curl -s -6 "http://[::1]:8888/api/v1/apps/fail2ban/management" -H "Authorization: Bearer {token}"')
f2b_res = stdout.read().decode('utf-8')
print("Fail2ban Management Response:")
print(json.dumps(json.loads(f2b_res), indent=2, ensure_ascii=False))

print("=== 4. Test PHP Service Logs API ===")
stdin, stdout, stderr = ssh.exec_command(f'curl -s -6 "http://[::1]:8888/api/v1/apps/php/logs" -H "Authorization: Bearer {token}"')
logs_res = stdout.read().decode('utf-8')
print("Logs count:", len(json.loads(logs_res).get('data', {}).get('logs', [])))

transport.close()
sock.close()
