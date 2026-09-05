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
import socket, struct, paramiko

proxy_host = '127.0.0.1'
proxy_port = 10808
target_host = os.environ.get("ARMGUARD_SSH_HOST", "127.0.0.1")
target_port = 22
user = 'root'
pwd = os.environ.get("ARMGUARD_SSH_PASSWORD", "")

sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.connect((proxy_host, proxy_port))
sock.sendall(b'\x05\x01\x00')
sock.recv(2)
ipv6_bytes = socket.inet_pton(socket.AF_INET6, target_host)
sock.sendall(b'\x05\x01\x00\x04' + ipv6_bytes + struct.pack('>H', target_port))
sock.recv(4 + 16 + 2)

transport = paramiko.Transport(sock)
transport.connect(username=user, password=pwd)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh._transport = transport

remote_cmd = """
DEBIAN_FRONTEND=noninteractive apt-get install -y php8.2-fpm php8.2-cli php8.2-common php8.2-opcache
systemctl status php8.2-fpm --no-pager | head -n 10
systemctl status php8.3-fpm --no-pager | head -n 10
ls -la /run/php/
"""

stdin, stdout, stderr = ssh.exec_command(remote_cmd)
print(stdout.read().decode('utf-8', errors='replace'))
print(stderr.read().decode('utf-8', errors='replace'))

transport.close()
sock.close()
