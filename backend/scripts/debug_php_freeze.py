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

print("=== 1. Systemd ArmGuard Service Status ===")
stdin, stdout, stderr = ssh.exec_command("systemctl status armguard")
print(stdout.read().decode('utf-8'))

print("=== 2. Running Processes Related to APT / DPKG / NEEDRESTART / PHP ===")
stdin, stdout, stderr = ssh.exec_command("ps aux | grep -E 'apt|dpkg|php|needrestart|frontend' | grep -v grep")
print(stdout.read().decode('utf-8'))

print("=== 3. Recent Service Logs ===")
stdin, stdout, stderr = ssh.exec_command("journalctl -u armguard -n 40 --no-pager")
print(stdout.read().decode('utf-8'))

print("=== 4. Port 8888 and 80 Listening Status ===")
stdin, stdout, stderr = ssh.exec_command("ss -tlpn | grep -E '8888|80'")
print(stdout.read().decode('utf-8'))

transport.close()
sock.close()
