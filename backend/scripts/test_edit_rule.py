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
import sys, socket, struct, json, time

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
    bdy = parts[1].decode('utf-8', errors='replace') if len(parts) > 1 else ""
    return json.loads(bdy)

# 1. Login
res = http_raw("POST", "/api/v1/auth/login", {"username": "admin", "password": "password"})
token = res["data"]["token"]

# 2. Add rule 7777
print("Adding rule 7777...")
add_res = http_raw("POST", "/api/v1/firewall/rules", {
    "type": "port",
    "protocol": "tcp",
    "port": "7777",
    "source_ip": "0.0.0.0/0",
    "description": "原始测试规则7777"
}, token=token)
print("Add result:", add_res)

# 3. Query rule
rules_res = http_raw("GET", "/api/v1/firewall/rules", token=token)
r_7777 = next((r for r in rules_res["data"]["rules"] if "7777" in r["port"]), None)
assert r_7777 is not None, "Rule 7777 not found!"
print("Found rule 7777:", r_7777)

# 4. Edit rule 7777 -> 7788 (UDP, 10.0.0.0/8, new description)
print("Editing rule to 7788 (UDP)...")
edit_res = http_raw("PUT", "/api/v1/firewall/rules", {
    "old_raw_spec": r_7777.get("raw_spec"),
    "type": "port",
    "protocol": "udp",
    "port": "7788",
    "source_ip": "10.0.0.0/8",
    "description": "编辑更新后的规则7788"
}, token=token)
print("Edit result:", edit_res)
assert edit_res["code"] == 0

# 5. Verify rules list
rules_res_after = http_raw("GET", "/api/v1/firewall/rules", token=token)
r_7777_after = next((r for r in rules_res_after["data"]["rules"] if "7777" in r["port"]), None)
r_7788_after = next((r for r in rules_res_after["data"]["rules"] if "7788" in r["port"]), None)
assert r_7777_after is None, "Old rule 7777 should have been deleted!"
assert r_7788_after is not None, "New rule 7788 should exist!"
assert r_7788_after["protocol"] == "UDP", f"Expected UDP, got {r_7788_after['protocol']}"
assert r_7788_after["description"] == "编辑更新后的规则7788"
print("Verified updated rule in kernel:", r_7788_after)

# 6. Cleanup
del_res = http_raw("DELETE", f"/api/v1/firewall/rules/{r_7788_after['id']}", {"raw_spec": r_7788_after.get("raw_spec")}, token=token)
print("Cleanup result:", del_res)
print("[SUCCESS] Rule Edit Test Passed Completely!")
