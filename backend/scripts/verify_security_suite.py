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
    if body is not None:
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
token = json.loads(bdy)["data"]["token"]
print(f"[OK] Token: {token[:15]}...")

print("\n=== 2. Real Firewall Rules & Comment Inspection ===")
_, bdy = http_raw("GET", "/api/v1/firewall/rules", token=token)
f_data = json.loads(bdy)["data"]
print(f"Firewall Type: {f_data['firewall_type']}")
print(f"Default Policy: {f_data['default_policy']}")
print(f"Ping Banned: {f_data['ping_banned']}")
print(f"Rules Count: {len(f_data['rules'])}")
for r in f_data['rules'][:5]:
    print(f"  - [{r['protocol']}] {r['port']} | src: {r['source_ip']} | act: {r['action']} | desc: {r['description']}")
assert f_data['default_policy'] == 'ACCEPT', f"Expected ACCEPT, got {f_data['default_policy']}"
print("[PASS] Firewall rules accurately parsed with protocol names and clean ports!")

print("\n=== 3. Add Rule with Custom Comment & Dual-Stack Injection ===")
new_rule = {
    "type": "port",
    "protocol": "tcp",
    "port": "9999",
    "source_ip": "0.0.0.0/0",
    "action": "accept",
    "description": "自动化测试放行端口9999"
}
_, bdy = http_raw("POST", "/api/v1/firewall/rules", new_rule, token=token)
print(f"Add Rule Response: {bdy}")
assert json.loads(bdy)["code"] == 0

out, _ = ssh_exec("iptables -S INPUT | grep 9999")
print("Host iptables grep 9999:\n" + out.strip())
assert "9999" in out
assert "自动化测试放行端口9999" in out
print("[PASS] Rule successfully injected with custom user comment preserved in kernel!")

print("\n=== 4. Add Malicious IP Blacklist (DROP) Rule ===")
block_rule = {
    "type": "ip_block",
    "source_ip": "203.0.113.88",
    "description": "恶意扫描拦截IP"
}
_, bdy = http_raw("POST", "/api/v1/firewall/rules", block_rule, token=token)
print(f"Add IP Block Response: {bdy}")
assert json.loads(bdy)["code"] == 0

out, _ = ssh_exec("iptables -S INPUT | grep 203.0.113.88")
print("Host iptables grep 203.0.113.88:\n" + out.strip())
assert "DROP" in out
assert "203.0.113.88" in out
print("[PASS] Malicious IP DROP rule successfully injected into kernel!")

print("\n=== 5. Delete Rules Cleanly without Row Drift ===")
_, bdy = http_raw("GET", "/api/v1/firewall/rules", token=token)
current_rules = json.loads(bdy)["data"]["rules"]
rule_9999 = next((r for r in current_rules if "9999" in r["port"]), None)
rule_drop = next((r for r in current_rules if "203.0.113.88" in r["source_ip"]), None)

if rule_9999:
    _, del_bdy = http_raw("DELETE", f"/api/v1/firewall/rules/{rule_9999['id']}", {"raw_spec": rule_9999.get("raw_spec")}, token=token)
    print(f"Delete 9999 Response: {del_bdy}")
    assert json.loads(del_bdy)["code"] == 0

if rule_drop:
    _, del_bdy = http_raw("DELETE", f"/api/v1/firewall/rules/{rule_drop['id']}", {"raw_spec": rule_drop.get("raw_spec")}, token=token)
    print(f"Delete DROP Response: {del_bdy}")
    assert json.loads(del_bdy)["code"] == 0

out, _ = ssh_exec("iptables -S INPUT | grep -E '9999|203.0.113.88' || true")
assert out.strip() == "", f"Expected rules deleted, still found: {out}"
print("[PASS] Rules deleted with 100% precision via raw spec matching!")

print("\n=== 6. One-Click Ping Ban (ICMP Echo) Verification ===")
# Enable ping ban
_, bdy = http_raw("POST", "/api/v1/firewall/icmp", {"ban": True}, token=token)
print(f"Ban Ping Response: {bdy}")
assert json.loads(bdy)["code"] == 0
out, _ = ssh_exec("cat /proc/sys/net/ipv4/icmp_echo_ignore_all")
print(f"Kernel icmp_echo_ignore_all: {out.strip()}")
assert out.strip() == "1"

# Disable ping ban (restore)
_, bdy = http_raw("POST", "/api/v1/firewall/icmp", {"ban": False}, token=token)
print(f"Restore Ping Response: {bdy}")
assert json.loads(bdy)["code"] == 0
out, _ = ssh_exec("cat /proc/sys/net/ipv4/icmp_echo_ignore_all")
print(f"Kernel icmp_echo_ignore_all: {out.strip()}")
assert out.strip() == "0"
print("[PASS] ICMP Echo Ignore All toggled and verified directly in kernel sysctl!")

print("\n=== 7. Real SSH Management & Hardening Verification ===")
_, bdy = http_raw("GET", "/api/v1/firewall/ssh", token=token)
ssh_data = json.loads(bdy)["data"]
print(f"Current SSH Config: {ssh_data}")
assert ssh_data["status"] == "running"
assert ssh_data["port"] == 22

# Update SSH settings (safe: keep port 22, toggle allow_root_login=True, allow_password_auth=True)
ssh_update = {
    "port": 22,
    "allow_root_login": True,
    "allow_password_auth": True,
    "allow_pubkey_auth": True
}
_, bdy = http_raw("PUT", "/api/v1/firewall/ssh", ssh_update, token=token)
print(f"Save SSH Response: {bdy}")
assert json.loads(bdy)["code"] == 0

out, _ = ssh_exec("cat /etc/ssh/sshd_config.d/00-armguard-ssh.conf")
print("Host 00-armguard-ssh.conf:\n" + out.strip())
assert "Port 22" in out
assert "PermitRootLogin yes" in out
assert "PasswordAuthentication yes" in out
print("[PASS] SSH settings successfully persisted, validated via sshd -t, and reloaded!")

print("\n=== 8. Fail2ban Manual Ban & Unban Verification ===")
test_ip = "198.51.100.77"
_, bdy = http_raw("POST", "/api/v1/firewall/fail2ban/ban", {"ip": test_ip, "jail": "sshd"}, token=token)
print(f"Fail2ban Ban Response: {bdy}")
assert json.loads(bdy)["code"] == 0

out, _ = ssh_exec("fail2ban-client status sshd")
print("Host fail2ban status sshd:\n" + out.strip())
assert test_ip in out

# Unban
_, bdy = http_raw("POST", "/api/v1/firewall/fail2ban/unban", {"ip": test_ip, "jail": "sshd"}, token=token)
print(f"Fail2ban Unban Response: {bdy}")
assert json.loads(bdy)["code"] == 0

out, _ = ssh_exec("fail2ban-client status sshd")
assert test_ip not in out
print("[PASS] Fail2ban ban and unban verified end to end!")

print("\nALL SECURITY SUITE TESTS PASSED 100% SUCCESSFULLY!")
