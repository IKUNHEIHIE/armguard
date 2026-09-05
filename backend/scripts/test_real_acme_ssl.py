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
import json
import paramiko

# Proxy & Host info
proxy_host = "127.0.0.1"
proxy_port = 10808
target_host = os.environ.get("ARMGUARD_SSH_HOST", "127.0.0.1")
target_port = 22
user = "root"
pwd = os.environ.get("ARMGUARD_SSH_PASSWORD", "")

def get_ssh():
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
    ssh._transport = transport
    return ssh

def run_ssh(ssh, cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd)
    return stdout.read().decode("utf-8").strip(), stderr.read().decode("utf-8").strip()

def http_curl(ssh, method, path, data=None, token=None):
    auth_header = f'-H "Authorization: Bearer {token}"' if token else ""
    data_arg = f"-d '{json.dumps(data)}'" if data is not None else ""
    cmd = f'curl -s -6 -X {method} "http://[::1]:8888{path}" -H "Content-Type: application/json" {auth_header} {data_arg}'
    out, err = run_ssh(ssh, cmd)
    try:
        return json.loads(out)
    except Exception as e:
        return {"raw": out, "error": str(e)}

def test_real_acme():
    print("==================================================")
    print("ArmGuard 全栈验证: 真实 Let's Encrypt ACME 签发测试")
    print("==================================================")
    ssh = get_ssh()

    # Step 1: Login
    login_res = http_curl(ssh, "POST", "/api/v1/auth/login", {"username": "admin", "password": "password"})
    token = login_res.get("data", {}).get("token")
    assert token, f"登录失败: {login_res}"
    print(f"[1] 认证就绪: Token = {token[:20]}...")

    # Step 2: Apply for 123.kuaile.dpdns.org via real ACME
    target_domain = "123.kuaile.dpdns.org"
    print(f"\n[2] 向 Let's Encrypt 官方 CA 申请权威证书: {target_domain}")
    apply_payload = {
        "domain": target_domain,
        "provider": "letsencrypt",
        "challenge_type": "http-01"
    }
    apply_res = http_curl(ssh, "POST", "/api/v1/ssl/certs/apply", apply_payload, token)
    print(f"  -> 申请响应: code={apply_res.get('code')}, message={apply_res.get('message')}")
    assert apply_res.get("code") == 0, f"Let's Encrypt 证书申请失败: {apply_res}"

    cert_data = apply_res.get("data", {})
    print(f"  -> 证书 ID: {cert_data.get('id')}")
    print(f"  -> 证书颁发者 (Issuer): {cert_data.get('issuer')}")
    print(f"  -> 证书到期日 (Expires): {cert_data.get('expires_at')} (剩余 {cert_data.get('days_remaining')} 天)")

    # Step 3: Verify the on-disk certificate with OpenSSL
    print("\n[3] 检查宿主机底层物理证书真实性 (OpenSSL X.509 解析):")
    cert_path = f"/etc/ssl/armguard/{target_domain}/fullchain.pem"
    out, _ = run_ssh(ssh, f"openssl x509 -in {cert_path} -noout -subject -issuer -dates")
    print(out)

    assert "Let's Encrypt" in out or "R3" in out or "E1" in out or "R10" in out or "R11" in out, f"证书不是由 Let's Encrypt 签发: {out}"
    assert f"issuer=CN = {target_domain}" not in out, f"证书仍为自签名证书！{out}"
    print("  [OK] 证书已成功由 Let's Encrypt 权威 CA 机构签发，不再是本地自签名！")

    # Step 4: Verify Certs List in API
    print("\n[4] 检查证书列表 API 返回元数据:")
    list_res = http_curl(ssh, "GET", "/api/v1/ssl/certs", token=token)
    certs_list = list_res.get("data", {}).get("list", [])
    found = next((c for c in certs_list if c.get("domain") == target_domain), None)
    assert found, f"列表中未找到 {target_domain} 证书"
    print(f"  -> 找到证书: {found.get('domain')}, Issuer={found.get('issuer')}, DaysRemaining={found.get('days_remaining')}")
    assert not found.get("is_self_signed", False), "证书被错误标记为自签名"
    print("  [OK] 面板数据库与 API 返回完全同步真实权威证书元数据！")

    print("\n[SUCCESS] 真实 Let's Encrypt ACME 签发与全链路验证 100% 通过！")
    ssh.close()

if __name__ == "__main__":
    test_real_acme()
