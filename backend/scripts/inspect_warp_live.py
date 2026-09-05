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

def run_cmd(title, cmd):
    print(f"\n==================== {title} ====================")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='ignore')
    err = stderr.read().decode('utf-8', errors='ignore')
    if out:
        print(out.strip())
    if err:
        print("STDERR:", err.strip())

run_cmd("1. 面板 WARP 配置持久化状态 (/var/lib/armguard/warp_config.json)", "cat /var/lib/armguard/warp_config.json")
run_cmd("2. 面板 API WARP 探针接口 (/api/v1/plugins/warp/status)", "curl -s -6 http://[::1]:8888/api/v1/plugins/warp/status -H 'Authorization: Bearer armguard_live_jwt_token'")
run_cmd("3. 主机网卡与 IP 列表 (ip -br addr)", "ip -br addr")
run_cmd("4. 宿主机 WireGuard 状态 (wg show)", "which wg && wg show || echo 'wg not loaded'")
run_cmd("5. 宿主机直连 Cloudflare Anycast Trace 状态", "curl -s -m 5 https://www.cloudflare.com/cdn-cgi/trace || echo 'Outbound curl failed'")

transport.close()
sock.close()
