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

print("=== Testing Gzip Compression and Cache-Control Headers ===")
# Find one asset file from index.html
cmd = "curl -s -6 http://[::1]:8888/ | grep -o 'assets/index-[a-zA-Z0-9_-]*\\.js' | head -n 1"
stdin, stdout, stderr = ssh.exec_command(cmd)
asset_path = stdout.read().decode('utf-8').strip()
print(f"Discovered Asset: {asset_path}")

cmd_headers = f'curl -s -I -6 -H "Accept-Encoding: gzip" "http://[::1]:8888/{asset_path}"'
stdin, stdout, stderr = ssh.exec_command(cmd_headers)
headers_out = stdout.read().decode('utf-8')
print("Response Headers:")
print(headers_out)

transport.close()
sock.close()
