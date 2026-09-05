try:
    from test_env import load_dotenv
    load_dotenv()
except ImportError:
    try:
        from backend.scripts.test_env import load_dotenv
        load_dotenv()
    except ImportError:
        pass

import socket
import struct
import paramiko
import os
import sys
import time

proxy_host = "127.0.0.1"
proxy_port = 10808

target_host = os.environ.get("ARMGUARD_SSH_HOST", "127.0.0.1")
target_port = 22
user = "root"
pwd = os.environ.get("ARMGUARD_SSH_PASSWORD", "")

local_tar = r"D:\admin\desktop\codex\panel\release\armguard-panel-v0.1.0.tar.gz"
remote_tar = "/root/armguard-panel-v0.1.0.tar.gz"

print(f"[1/5] Connecting to v2ray SOCKS5 proxy ({proxy_host}:{proxy_port})...")

try:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(20)
    sock.connect((proxy_host, proxy_port))

    # SOCKS5 Handshake
    sock.sendall(b"\x05\x01\x00")
    resp = sock.recv(2)
    if resp != b"\x05\x00":
        raise Exception(f"SOCKS5 auth failed: {resp}")

    # Connect to target IPv6
    ipv6_bytes = socket.inet_pton(socket.AF_INET6, target_host)
    port_bytes = struct.pack(">H", target_port)
    sock.sendall(b"\x05\x01\x00\x04" + ipv6_bytes + port_bytes)

    reply = sock.recv(4)
    ver, rep, rsv, atyp = reply
    if rep != 0x00:
        raise Exception(f"SOCKS5 proxy error code: {rep}")

    if atyp == 0x01: sock.recv(4 + 2)
    elif atyp == 0x04: sock.recv(16 + 2)
    elif atyp == 0x03: sock.recv(sock.recv(1)[0] + 2)

    print(f"[OK] SOCKS5 connected to [{target_host}]:{target_port}")

    # SSH Authentication
    transport = paramiko.Transport(sock)
    transport.connect(username=user, password=pwd)
    print("[OK] SSH authenticated successfully!")

    # 2. Upload deployment package via SFTP
    print(f"[2/5] Uploading package ({os.path.getsize(local_tar)/1024:.1f} KB) via SFTP...")
    sftp = paramiko.SFTPClient.from_transport(transport)
    sftp.put(local_tar, remote_tar)
    print(f"[OK] Package uploaded to {remote_tar}")
    sftp.close()

    # 3. Execute remote setup commands
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh._transport = transport

    print("[3/5] Setting up ArmGuard on Ubuntu ARM64 server...")

    remote_script = """
set -e
echo "=== 1. Extracting package ==="
mkdir -p /opt/armguard
tar -zxvf /root/armguard-panel-v0.1.0.tar.gz -C /opt/
mv -f /opt/armguard/* /opt/armguard/ 2>/dev/null || true

echo "=== 2. Checking / Installing Node.js for runtime ==="
if ! command -v node >/dev/null 2>&1; then
    echo "Installing Node.js on Ubuntu 24.04 ARM64..."
    apt-get update -qq
    apt-get install -y -qq nodejs npm
fi
node -v

echo "=== 3. Registering Systemd Service ==="
cat << 'EOF' > /etc/systemd/system/armguard.service
[Unit]
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
MemoryHigh=80M
MemoryMax=120M

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable armguard
systemctl restart armguard

echo "=== 4. Checking Service Status ==="
systemctl is-active armguard
"""

    stdin, stdout, stderr = ssh.exec_command(remote_script)
    
    for line in iter(stdout.readline, ""):
        print(line, end="")
    for line in iter(stderr.readline, ""):
        print(f"[stderr] {line}", end="")

    time.sleep(2)

    # 4. Verify port listening
    stdin, stdout, stderr = ssh.exec_command("ss -tulpn | grep 8888 || netstat -tulpn | grep 8888")
    port_out = stdout.read().decode('utf-8').strip()
    print(f"\n[4/5] Port 8888 Listen status:\n{port_out}")

    # 5. Test curl localhost:8888
    stdin, stdout, stderr = ssh.exec_command("curl -s http://localhost:8888/api/v1/system/info | head -n 1")
    curl_out = stdout.read().decode('utf-8').strip()
    print(f"\n[5/5] Internal API verification response:\n{curl_out}")

    transport.close()
    sock.close()
    print("\n=======================================================")
    print("[SUCCESS] ArmGuard Panel has been deployed to the ARM server!")
    print(f"Web Access: http://[{target_host}]:8888")
    print("Default Login: admin / armguard")
    print("=======================================================")

except Exception as e:
    print(f"\n[ERROR] Deployment failed: {e}", file=sys.stderr)
    import traceback
    traceback.print_exc()
    sys.exit(1)
