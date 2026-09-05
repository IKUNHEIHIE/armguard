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

local_server_js = r"D:\admin\desktop\codex\panel\backend\dev_server.js"
remote_server_js = "/opt/armguard/backend/dev_server.js"

sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.connect((proxy_host, proxy_port))
sock.sendall(b"\x05\x01\x00")
sock.recv(2)
ipv6_bytes = socket.inet_pton(socket.AF_INET6, target_host)
sock.sendall(b"\x05\x01\x00\x04" + ipv6_bytes + struct.pack(">H", target_port))
sock.recv(4 + 16 + 2)

transport = paramiko.Transport(sock)
transport.connect(username=user, password=pwd)

# Upload updated dev_server.js
sftp = paramiko.SFTPClient.from_transport(transport)
sftp.put(local_server_js, remote_server_js)
sftp.close()

# Restart service and test
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh._transport = transport

cmd = """
systemctl restart armguard
sleep 1.5
echo "=== Systemd Status ==="
systemctl is-active armguard
echo "=== Curl Test Local ==="
curl -i -s -6 http://[::1]:8888/ | head -n 12
"""

stdin, stdout, stderr = ssh.exec_command(cmd)
print(stdout.read().decode('utf-8'))

transport.close()
sock.close()
