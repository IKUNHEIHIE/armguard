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

# Ensure ufw allows 8888, 80, 443, 22
cmds = [
    "ufw status",
    "iptables -I INPUT -p tcp --dport 8888 -j ACCEPT 2>/dev/null || true",
    "ip6tables -I INPUT -p tcp --dport 8888 -j ACCEPT 2>/dev/null || true",
    "systemctl status armguard --no-pager"
]

for cmd in cmds:
    stdin, stdout, stderr = ssh.exec_command(cmd)
    print(f"\n--- {cmd} ---")
    print(stdout.read().decode('utf-8'))

transport.close()
sock.close()
