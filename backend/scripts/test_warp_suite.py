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
import json
import sys

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

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

token = "armguard_live_jwt_token"

def run_api(title, method, path, payload=None):
    print(f"\n=== {title} ===")
    cmd = f'curl -s -6 -X {method} "http://[::1]:8888/api/v1{path}" -H "Authorization: Bearer {token}"'
    if payload:
        escaped = json.dumps(payload).replace('"', '\\"')
        cmd += f' -H "Content-Type: application/json" -d "{escaped}"'
    stdin, stdout, stderr = ssh.exec_command(cmd)
    raw = stdout.read().decode('utf-8')
    try:
        data = json.loads(raw)
        print(json.dumps(data, indent=2, ensure_ascii=False))
    except Exception as e:
        print("Raw output:", raw)

# 1. Check Software Market (Verify WARP is in App Catalog)
run_api("1. Market List (Check WARP)", "GET", "/apps/market")

# 1.5 Check WARP Management API
run_api("1.5. GET /apps/warp/management", "GET", "/apps/warp/management")

# 2. Get WARP Status
run_api("2. GET WARP Status", "GET", "/plugins/warp/status")

# 3. Update WARP Config (WireGuard-Go with Reserved Bytes)
run_api("3. POST WARP Config (WireGuard-Go with Reserved)", "POST", "/plugins/warp/config", {
    "mode": "ipv4",
    "wireguard_type": "wireguard-go",
    "reserved_bytes": "0,0,0",
    "auto_start": True
})

# 4. Connect WARP
run_api("4. POST WARP Connect", "POST", "/plugins/warp/connect", {
    "mode": "ipv4",
    "wireguard_type": "wireguard-go"
})

# 5. Probe Cloudflare Trace
run_api("5. POST WARP Trace Probe", "POST", "/plugins/warp/trace", {})

# 6. Disconnect WARP
run_api("6. POST WARP Disconnect", "POST", "/plugins/warp/disconnect", {})

transport.close()
sock.close()
