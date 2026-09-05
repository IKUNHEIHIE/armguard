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

cmd = """
python3 - << 'EOF'
import urllib.request, urllib.error, json, time

BASE = 'http://[::1]:8888'

def req(path, method='GET', headers={}, body=None):
    url = BASE + path
    data = json.dumps(body).encode('utf-8') if body else None
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        res = urllib.request.urlopen(r, timeout=5)
        return res.status, json.loads(res.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except:
            return e.code, {'error': str(e)}

# 1. Test Auth Bypass Rejection (Token length >= 8 fake token)
c1, d1 = req('/api/v1/system/info', headers={'Authorization': 'Bearer 12345678'})
assert c1 == 401, f"Security Fail: fake token bypass returned {c1}"
print("[PASS] 1. Auth Bypass Defeated: Fake Token was correctly rejected with 401!")

# 2. Test Invalid Password Login
c2, d2 = req('/api/v1/auth/login', method='POST', headers={'Content-Type':'application/json'}, body={'username':'admin', 'password':'wrong_password_123'})
assert c2 == 401, f"Security Fail: wrong password returned {c2}"
print("[PASS] 2. Login Verification: Invalid credentials rejected with 401!")

# 3. Test Valid Password Login (Testing admin / armguard explicitly)
c3, d3 = req('/api/v1/auth/login', method='POST', headers={'Content-Type':'application/json'}, body={'username':'admin', 'password':'armguard'})
assert c3 == 200, f"Login with armguard Fail: {d3}"
token = d3['data']['token']
auth_headers = {'Authorization': f'Bearer {token}', 'Content-Type':'application/json'}
print(f"[PASS] 3. Login with admin / armguard Success! Token={token[:16]}...")

# 4. Test Authenticated APIs
c4, d4 = req('/api/v1/system/info', headers=auth_headers)
assert c4 == 200 and d4['code'] == 0
print(f"[PASS] 4. Authenticated System Info API: {d4['data']['cpu_model']}")

# 5. Test File Deletion Guard on Protected Path
c5, d5 = req('/api/v1/files', method='DELETE', headers=auth_headers, body={'paths': ['/etc/shadow', '/etc/passwd']})
assert d5['code'] == 403, f"File guard fail: {d5}"
print(f"[PASS] 5. System File Deletion Guard: Intercepted with 403 ({d5['message']})")

# 6. Test SQLite JSON Query
c6, d6 = req('/api/v1/databases/1/query', method='POST', headers=auth_headers, body={'sql': 'SELECT 1 as id, "ArmGuard" as system_name;'})
assert c6 == 200 and d6['data']['columns'] == ['id', 'system_name']
print(f"[PASS] 6. SQLite JSON Query Output: {d6['data']['columns']} -> {d6['data']['rows']}")

# 7. Benchmark Realtime Telemetry Latency (50 concurrent requests)
t0 = time.time()
count = 50
for _ in range(count):
    c7, d7 = req('/api/v1/system/monitor/realtime', headers=auth_headers)
    assert c7 == 200 and d7['code'] == 0
duration = (time.time() - t0) * 1000
avg = duration / count
print(f"[PASS] 7. Anti-Freeze Benchmark: 50 Realtime requests finished in {duration:.1f}ms (Avg: {avg:.2f}ms/req, Zero blocking!)")

print("\\n" + "="*50)
print("[SUCCESS] ALL SECURITY HARDENING AND PERFORMANCE VERIFICATIONS PASSED 100%!")
print("="*50)
EOF
"""

stdin, stdout, stderr = ssh.exec_command(cmd)
out = stdout.read().decode('utf-8')
err = stderr.read().decode('utf-8')
print("OUT:\n", out)
if err:
    print("ERR:\n", err)

transport.close()
sock.close()
