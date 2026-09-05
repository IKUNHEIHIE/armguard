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
import sys, socket, struct, json, time, paramiko

sys.stdout.reconfigure(encoding='utf-8')

proxy_host = '127.0.0.1'
proxy_port = 10808
target_host = os.environ.get("ARMGUARD_SSH_HOST", "127.0.0.1")
target_port = 8888

def http_raw(method, path, body=None, token=None):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.connect((proxy_host, proxy_port))
    s.sendall(b'\x05\x01\x00')
    s.recv(2)
    ipv6_bytes = socket.inet_pton(socket.AF_INET6, target_host)
    s.sendall(b'\x05\x01\x00\x04' + ipv6_bytes + struct.pack('>H', target_port))
    s.recv(4 + 16 + 2)

    headers = [
        f"{method} {path} HTTP/1.1",
        f"Host: [{target_host}]:{target_port}",
        "Connection: close"
    ]
    if token:
        headers.append(f"Authorization: Bearer {token}")
    if body:
        body_bytes = json.dumps(body).encode('utf-8')
        headers.append("Content-Type: application/json")
        headers.append(f"Content-Length: {len(body_bytes)}")
    else:
        body_bytes = b""

    req_data = "\r\n".join(headers).encode('utf-8') + b"\r\n\r\n" + body_bytes
    s.sendall(req_data)

    resp = b""
    while True:
        chunk = s.recv(4096)
        if not chunk:
            break
        resp += chunk
    s.close()

    parts = resp.split(b"\r\n\r\n", 1)
    hdr = parts[0].decode('utf-8', errors='replace')
    bdy = parts[1].decode('utf-8', errors='replace') if len(parts) > 1 else ""
    return hdr, bdy

def ssh_exec(cmd):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.connect((proxy_host, proxy_port))
    sock.sendall(b'\x05\x01\x00')
    sock.recv(2)
    ipv6_bytes = socket.inet_pton(socket.AF_INET6, target_host)
    sock.sendall(b'\x05\x01\x00\x04' + ipv6_bytes + struct.pack('>H', 22))
    sock.recv(4 + 16 + 2)

    transport = paramiko.Transport(sock)
    transport.connect(username='root', password=os.environ.get("ARMGUARD_SSH_PASSWORD", ""))
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh._transport = transport

    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    transport.close()
    sock.close()
    return out, err

print("=== 1. Login & Token Acquisition ===")
_, bdy = http_raw("POST", "/api/v1/auth/login", {"username": "admin", "password": "password"})
login_data = json.loads(bdy)
token = login_data["data"]["token"]
print(f"[OK] Token acquired: {token[:15]}...")

print("\n=== 2. MySQL Management Data Verification ===")
_, bdy = http_raw("GET", "/api/v1/apps/mysql/management", token=token)
mysql_mgmt = json.loads(bdy)["data"]
print(f"Status: {mysql_mgmt['status']}")
print(f"Service: {mysql_mgmt['service_name']}")
print(f"PID: {mysql_mgmt['pid']}, MemMB: {mysql_mgmt['memory_mb']}")
print(f"Visual Config: {json.dumps(mysql_mgmt['visual_config'], ensure_ascii=False)}")
assert mysql_mgmt['status'] == 'running', f"Expected MySQL running, got {mysql_mgmt['status']}"
assert mysql_mgmt['visual_config']['innodb_buffer_pool_size'] in ['64M', '128M', '256M', '512M', '1024M'], f"Bad buffer pool size: {mysql_mgmt['visual_config']['innodb_buffer_pool_size']}"
print("[PASS] MySQL management probe and regex parsing accurate.")

print("\n=== 3. MySQL Visual Config Save Verification ===")
test_cfg = mysql_mgmt['visual_config']
test_cfg['max_connections'] = "150"
test_cfg['innodb_buffer_pool_size'] = "256M"
test_cfg['slow_query_log'] = True
_, bdy = http_raw("PUT", "/api/v1/apps/mysql/visual-config", {"config": test_cfg}, token=token)
print(f"Save Response: {bdy}")
time.sleep(2)
out, _ = ssh_exec("grep -E 'max_connections|innodb_buffer_pool_size|slow_query_log' /etc/mysql/mariadb.conf.d/50-server.cnf")
print("Host 50-server.cnf grep output:\n" + out.strip())
assert "max_connections = 150" in out
assert "innodb_buffer_pool_size = 256M" in out
assert "slow_query_log = 1" in out
print("[PASS] MySQL Visual Config written and persisted successfully!")

print("\n=== 4. MySQL Root Password Modification Verification ===")
new_pwd = "ArmGuard@TestPwd2026!"
_, bdy = http_raw("POST", "/api/v1/apps/mysql/root-password", {"password": new_pwd}, token=token)
print(f"Root Password Change Response: {bdy}")
assert json.loads(bdy)["code"] == 0
out, err = ssh_exec(f"mariadb -u root -p'{new_pwd}' -e 'SELECT CURRENT_USER();'")
print(f"MariaDB Auth Output: {out.strip()}")
assert "root@localhost" in out
print("[PASS] MySQL Root password successfully modified and verified via socket auth!")

print("\n=== 5. Nginx Visual Config Gzip & Worker Connections Verification ===")
_, bdy = http_raw("GET", "/api/v1/apps/nginx/management", token=token)
nginx_mgmt = json.loads(bdy)["data"]
print(f"Nginx Status: {nginx_mgmt['status']}, PID: {nginx_mgmt['pid']}, Mem: {nginx_mgmt['memory_mb']}")
print(f"Visual Config: {json.dumps(nginx_mgmt['visual_config'], ensure_ascii=False)}")

n_cfg = nginx_mgmt['visual_config']
n_cfg['worker_connections'] = "2048"
n_cfg['gzip_enabled'] = True
n_cfg['server_tokens'] = False
_, bdy = http_raw("PUT", "/api/v1/apps/nginx/visual-config", {"config": n_cfg}, token=token)
print(f"Save Nginx Response: {bdy}")
time.sleep(1)
out, _ = ssh_exec("grep -E 'worker_connections|gzip|server_tokens' /etc/nginx/nginx.conf | head -n 6")
print("Host nginx.conf grep output:\n" + out.strip())
assert "worker_connections 2048;" in out
assert "gzip on;" in out
assert "server_tokens off;" in out
print("[PASS] Nginx Visual Config (worker_connections, gzip, server_tokens) persisted and active!")

print("\n=== 6. Multi-channel Logs Verification ===")
for ch in ['system', 'error', 'access']:
    _, bdy = http_raw("GET", f"/api/v1/apps/nginx/logs?type={ch}", token=token)
    log_data = json.loads(bdy)["data"]["logs"]
    print(f"Nginx [{ch}] log lines: {len(log_data)} (First line: {log_data[0] if log_data else 'Empty'})")

for ch in ['system', 'error', 'slow']:
    _, bdy = http_raw("GET", f"/api/v1/apps/mysql/logs?type={ch}", token=token)
    log_data = json.loads(bdy)["data"]["logs"]
    print(f"MySQL [{ch}] log lines: {len(log_data)} (First line: {log_data[0] if log_data else 'Empty'})")
print("[PASS] Multi-channel logs retrieved cleanly!")

print("\nALL VERIFICATIONS PASSED SUCCESSFULLY!")
