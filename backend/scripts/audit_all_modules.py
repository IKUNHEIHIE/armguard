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

endpoints = [
    "/api/v1/system/info",
    "/api/v1/system/monitor/realtime",
    "/api/v1/system/processes",
    "/api/v1/system/hardware/thermal",
    "/api/v1/apps/market",
    "/api/v1/settings/panel",
    "/api/v1/firewall/rules",
    "/api/v1/firewall/fail2ban/status",
    "/api/v1/crontabs",
    "/api/v1/logs/operation",
    "/api/v1/logs/system",
    "/api/v1/ssl/certs",
    "/api/v1/sites",
    "/api/v1/databases",
    "/api/v1/docker/containers",
    "/api/v1/files/list?path=/opt/armguard"
]

print("==========================================================")
print("       ArmGuard Comprehensive System Audit & Verification")
print("==========================================================")

all_passed = True
for ep in endpoints:
    cmd = f'curl -s -w "\\n---STATUS:%{{http_code}}---" -6 "http://[::1]:8888{ep}"'
    stdin, stdout, stderr = ssh.exec_command(cmd)
    res = stdout.read().decode('utf-8').strip()
    
    parts = res.split('---STATUS:')
    body = parts[0].strip()
    status_code = parts[1].replace('---', '').strip() if len(parts) > 1 else 'ERR'
    
    is_valid_json = False
    try:
        j = json.loads(body)
        if j.get('code') == 0:
            is_valid_json = True
    except:
        pass
    
    status_mark = "PASS" if (status_code == "200" and is_valid_json) else "FAIL"
    if status_mark != "PASS":
        all_passed = False
        
    print(f"[{status_mark}] {ep:<40} HTTP: {status_code:<4} (Payload size: {len(body)} bytes)")

print("----------------------------------------------------------")
if all_passed:
    print("[AUDIT SUCCESS] 100% of all system modules & endpoints PASSED inspection!")
else:
    print("[AUDIT WARNING] Some endpoints did not pass inspection.")
print("==========================================================")

transport.close()
sock.close()
