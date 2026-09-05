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

cmd = """
echo "=== 1. Create real file via API ==="
curl -s -6 -X POST http://[::1]:8888/api/v1/files/create -H "Content-Type: application/json" -d '{"path": "/opt/armguard/REAL_LINUX_NODE.txt", "is_dir": false}'
echo ""
echo "=== 2. Write real content via API ==="
curl -s -6 -X PUT http://[::1]:8888/api/v1/files/content -H "Content-Type: application/json" -d '{"path": "/opt/armguard/REAL_LINUX_NODE.txt", "content": "Verified: ArmGuard Real Linux Kernel Operations Working 100%!"}'
echo ""
echo "=== 3. Verify real filesystem on disk ==="
cat /opt/armguard/REAL_LINUX_NODE.txt
"""

stdin, stdout, stderr = ssh.exec_command(cmd)
print(stdout.read().decode('utf-8'))

transport.close()
sock.close()
