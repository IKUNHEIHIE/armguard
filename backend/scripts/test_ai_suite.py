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

# 1. Get AI config
run_api("1. GET AI Config", "GET", "/ai/config")

# 2. Update AI config
run_api("2. PUT AI Config", "PUT", "/ai/config", {
    "enabled": True,
    "provider": "deepseek",
    "api_url": "https://api.deepseek.com/v1",
    "model": "deepseek-chat",
    "temperature": 0.3
})

# 3. Generate Shell Command with Risk Rating
run_api("3. POST AI Generate Command", "POST", "/ai/generate-command", {
    "prompt": "查找当前目录下大于100MB的文件并按大小降序排列"
})

# 4. AI Context-Aware Chat
run_api("4. POST AI Context-Aware Chat", "POST", "/ai/chat", {
    "message": "当前服务器的内存负载情况怎么样？"
})

# 5. AI Diagnose Error Log
run_api("5. POST AI Diagnose Error Log", "POST", "/ai/diagnose-log", {
    "log_type": "nginx",
    "log_content": "2026/08/24 20:50:00 [error] 1024#1024: *1 connect() to unix:/run/php/php8.3-fpm.sock failed (111: Connection refused) while connecting to upstream"
})

# 6. AI Full System Health Audit
run_api("6. POST AI Full Health Audit", "POST", "/ai/health-audit", {})

transport.close()
sock.close()
