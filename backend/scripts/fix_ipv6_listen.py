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

print("Updating /opt/armguard/backend/dev_server.js to bind to '::' (Dual Stack IPv6 + IPv4)...")

# 1. Update dev_server.js on remote server
update_cmd = """
sed -i "s/server.listen(PORT, '0.0.0.0'/server.listen(PORT, '::'/g" /opt/armguard/backend/dev_server.js
sed -i "s/server.listen(PORT, '0.0.0.0'/server.listen(PORT, '::'/g" /opt/armguard/dev_server.js 2>/dev/null || true
systemctl restart armguard
sleep 2
echo "=== Listening Sockets ==="
ss -tulpn | grep 8888
echo "=== Testing IPv6 curl ==="
curl -s -6 http://[::1]:8888/api/v1/system/info | head -c 100
echo ""
"""

stdin, stdout, stderr = ssh.exec_command(update_cmd)
print(stdout.read().decode('utf-8', errors='ignore'))
print(stderr.read().decode('utf-8', errors='ignore'))

transport.close()
sock.close()
