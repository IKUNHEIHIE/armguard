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

local_tar = r"D:\admin\desktop\codex\panel\release\armguard-panel-v0.1.0.tar.gz"
remote_tar = "/root/armguard-panel-v0.1.0.tar.gz"

sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.connect((proxy_host, proxy_port))
sock.sendall(b"\x05\x01\x00")
sock.recv(2)
ipv6_bytes = socket.inet_pton(socket.AF_INET6, target_host)
sock.sendall(b"\x05\x01\x00\x04" + ipv6_bytes + struct.pack(">H", target_port))
sock.recv(4 + 16 + 2)

transport = paramiko.Transport(sock)
transport.connect(username=user, password=pwd)

print("[1/3] Uploading updated ArmGuard production bundle to ARM server...")
sftp = paramiko.SFTPClient.from_transport(transport)
sftp.put(local_tar, remote_tar)
sftp.close()
print("[OK] Package uploaded.")

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh._transport = transport

print("[2/3] Extracting and restarting systemd service...")
cmd = """
tar -zxvf /root/armguard-panel-v0.1.0.tar.gz -C /opt/
systemctl restart armguard
sleep 2
echo "=== Service Status ==="
systemctl is-active armguard
echo "=== Real File List Test ==="
curl -s -6 "http://[::1]:8888/api/v1/files/list?path=/opt/armguard" | head -c 200
echo ""
"""

stdin, stdout, stderr = ssh.exec_command(cmd)
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))

transport.close()
sock.close()
print("[3/3] [SUCCESS] Real Linux Engine Live on ARM Server!")
