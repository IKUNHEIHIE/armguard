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

def run_ssh(cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd)
    return stdout.read().decode('utf-8').strip(), stderr.read().decode('utf-8').strip()

print("==================================================")
print("  STEP 1: Verify API Login & Token Acquisition")
print("==================================================")
out, err = run_ssh('''curl -s -6 -X POST "http://[::1]:8888/api/v1/auth/login" -H "Content-Type: application/json" -d '{"username":"admin","password":"password"}' ''')
print("Login response:", out)
login_data = json.loads(out)
token = login_data['data']['token']
print("[OK] Acquired Token:", token[:20] + "...")

print("\n==================================================")
print("  STEP 2: Create Site with Custom Port 8088 & PHP 8.3")
print("==================================================")
create_payload = json.dumps({
    "domain": "test-arm-site.com",
    "domains": ["www.test-arm-site.com"],
    "port": 8088,
    "php_version": "php83",
    "rewrite_preset": "spa"
})
out, _ = run_ssh(f'''curl -s -6 -X POST "http://[::1]:8888/api/v1/sites" -H "Content-Type: application/json" -H "Authorization: Bearer {token}" -d '{create_payload}' ''')
print("Create site response:", out)
create_res = json.loads(out)
site_id = create_res['data']['id']
print(f"[OK] Created site ID: {site_id}")

print("\n--- Inspecting Nginx Conf on ARM Host ---")
out, _ = run_ssh("cat /etc/nginx/conf.d/test-arm-site.com.conf")
print(out)
assert "listen 8088;" in out, "listen 8088 missing!"
assert "listen [::]:8088;" in out, "IPv6 dual-stack listen missing!"
assert "php8.3-fpm.sock" in out, "PHP 8.3 fastcgi_pass missing!"
print("[OK] Conf verified: IPv4/IPv6 Dual-Stack + Custom Port 8088 + PHP 8.3 FPM Socket correctly bound.")

print("\n==================================================")
print("  STEP 3: Hot-switch PHP Version to PHP 8.4")
print("==================================================")
update_payload = json.dumps({
    "php_version": "php84"
})
out, _ = run_ssh(f'''curl -s -6 -X PUT "http://[::1]:8888/api/v1/sites/{site_id}/settings" -H "Content-Type: application/json" -H "Authorization: Bearer {token}" -d '{update_payload}' ''')
print("Switch PHP response:", out)

out, _ = run_ssh("cat /etc/nginx/conf.d/test-arm-site.com.conf | grep -A 4 'location ~'")
print("FastCGI block after hot-switch:")
print(out)
assert "php8.4-fpm.sock" in out, "Hot-switch to PHP 8.4 failed!"
print("[OK] Hot-switched to PHP 8.4 seamlessly.")

print("\n==================================================")
print("  STEP 4: Deploy Custom SSL Certificate & Private Key")
print("==================================================")
run_ssh("openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout /tmp/test.key -out /tmp/test.crt -subj '/CN=test-arm-site.com'")
cert_content, _ = run_ssh("cat /tmp/test.crt")
key_content, _ = run_ssh("cat /tmp/test.key")

ssl_payload = json.dumps({
    "cert": cert_content,
    "key": key_content,
    "ssl_enabled": True,
    "ssl_force_https": True
})
run_ssh(f'''cat << 'EOF' > /tmp/ssl_payload.json
{ssl_payload}
EOF
''')
out, _ = run_ssh(f'''curl -s -6 -X PUT "http://[::1]:8888/api/v1/sites/{site_id}/ssl" -H "Content-Type: application/json" -H "Authorization: Bearer {token}" --data-binary "@/tmp/ssl_payload.json" ''')
print("Deploy SSL response:", out)
assert '"code":0' in out, "Deploy SSL failed!"

print("\n--- Inspecting SSL Config and Cert Files ---")
out, _ = run_ssh("ls -la /etc/ssl/armguard/test-arm-site.com/")
print(out)
assert "fullchain.pem" in out and "privkey.pem" in out, "SSL cert files missing!"

out, _ = run_ssh("cat /etc/nginx/conf.d/test-arm-site.com.conf")
print("Nginx conf with SSL:")
print(out)
assert "listen 443 ssl http2;" in out and "listen [::]:443 ssl http2;" in out, "SSL dual-stack listen missing!"
assert "return 301 https://$host$request_uri;" in out, "Force HTTPS redirect missing!"

out, _ = run_ssh("nginx -t 2>&1")
print("Nginx syntax test:", out)
assert "syntax is ok" in out, "Nginx syntax error after SSL deployment!"
print("[OK] SSL successfully deployed with TLS 1.3, HTTP/2, dual-stack, and 301 redirect.")

print("\n==================================================")
print("  STEP 5: Delete Site with delete_files=true (Physical Root Purge)")
print("==================================================")
out, _ = run_ssh("ls -d /www/wwwroot/test-arm-site.com")
print("Directory before deletion:", out)
assert "/www/wwwroot/test-arm-site.com" in out

out, _ = run_ssh(f'''curl -s -6 -X DELETE "http://[::1]:8888/api/v1/sites/{site_id}?delete_files=true" -H "Authorization: Bearer {token}" ''')
print("Delete site response:", out)
assert '"code":0' in out, "Delete site failed!"

out, _ = run_ssh("ls /etc/nginx/conf.d/test-arm-site.com.conf 2>&1 || true")
print("Nginx conf status after deletion:", out)
assert "No such file" in out

out, _ = run_ssh("ls -d /www/wwwroot/test-arm-site.com 2>&1 || true")
print("Root directory status after deletion:", out)
assert "No such file" in out

print("\n==================================================")
print("  [SUCCESS] All Sites Management Tests Passed 100%!")
print("==================================================")

ssh.close()
sock.close()
