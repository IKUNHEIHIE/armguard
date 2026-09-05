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
import sys

# Ensure UTF-8 output encoding on Windows console
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

print("=== 1. Systemd Service Status ===")
stdin, stdout, stderr = ssh.exec_command("systemctl is-active armguard")
print("ArmGuard Status:", stdout.read().decode('utf-8').strip())

print("=== 2. Real System Memory & Swap ===")
stdin, stdout, stderr = ssh.exec_command("free -h")
print(stdout.read().decode('utf-8'))

print("=== 3. Testing Real Panel REST API (System Info) ===")
stdin, stdout, stderr = ssh.exec_command('curl -s -6 "http://[::1]:8888/api/v1/system/info" -H "Authorization: Bearer armguard_live_jwt_token"')
print(stdout.read().decode('utf-8'))

print("=== 4. Testing App Store Status (Checking PHP) ===")
stdin, stdout, stderr = ssh.exec_command('curl -s -6 "http://[::1]:8888/api/v1/apps/market" -H "Authorization: Bearer armguard_live_jwt_token"')
apps_json = stdout.read().decode('utf-8')
print("Market apps status length:", len(apps_json), "bytes")

print("=== 5. PHP CLI Version on Host ===")
stdin, stdout, stderr = ssh.exec_command("php -v")
print(stdout.read().decode('utf-8'))

transport.close()
sock.close()
