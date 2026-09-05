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

print("=== 1. Creating Swapfile (1GB) for Low-RAM ARM Node ===")
swap_cmds = """
if [ ! -f /swapfile ]; then
    fallocate -l 1G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=1024
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
swapon --show
"""
stdin, stdout, stderr = ssh.exec_command(swap_cmds)
print(stdout.read().decode('utf-8'))

print("=== 2. Updating /etc/systemd/system/armguard.service without restrictive MemoryMax ===")
service_content = """[Unit]
Description=ArmGuard Server Management Panel (ARM64)
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/armguard
ExecStart=/usr/bin/node /opt/armguard/backend/dev_server.js
Restart=always
RestartSec=5s
Environment=PORT=8888
LimitNOFILE=65535
MemoryHigh=600M
MemoryMax=850M

[Install]
WantedBy=multi-user.target
"""

sftp = ssh.open_sftp()
with sftp.file('/etc/systemd/system/armguard.service', 'w') as f:
    f.write(service_content)
sftp.close()

print("=== 3. Reloading systemd and finishing dpkg configure ===")
reload_cmds = """
killall -9 apt-get dpkg 2>/dev/null || true
systemctl daemon-reload
systemctl restart armguard
dpkg --configure -a
apt-get install -y php-fpm
"""
stdin, stdout, stderr = ssh.exec_command(reload_cmds)
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))

print("=== 4. Checking New Service Status ===")
stdin, stdout, stderr = ssh.exec_command("systemctl status armguard")
print(stdout.read().decode('utf-8'))

print("=== 5. Checking PHP-FPM Version ===")
stdin, stdout, stderr = ssh.exec_command("php -v && systemctl status php8.3-fpm || true")
print(stdout.read().decode('utf-8'))

transport.close()
sock.close()
