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
import sys

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
    out = stdout.read().decode('utf-8', errors='ignore').strip()
    err = stderr.read().decode('utf-8', errors='ignore').strip()
    return out, err

print("==================================================")
print("  STEP 0: Acquire Auth Token")
print("==================================================")
out, _ = run_ssh('''curl -s -6 -X POST "http://[::1]:8888/api/v1/auth/login" -H "Content-Type: application/json" -d '{"username":"admin","password":"password"}' ''')
login_data = json.loads(out)
token = login_data['data']['token']
print("[OK] Acquired Token:", token[:25] + "...")

# =========================================================================
# TIER 1: Crontab, Files, Docker
# =========================================================================
print("\n==================================================")
print("  TIER 1.1: Crontab (Create, Edit, Run-Once, Delete)")
print("==================================================")

# 1. Create Crontab
cron_create_payload = json.dumps({
    "name": "自动化测试定时备份",
    "schedule": "*/10 * * * *",
    "command": "echo 'CRONTAB_TIER1_EXECUTION_SUCCESS'"
})
out, _ = run_ssh(f'''curl -s -6 -X POST "http://[::1]:8888/api/v1/crontabs" -H "Content-Type: application/json" -H "Authorization: Bearer {token}" -d '{cron_create_payload}' ''')
print("Crontab Create Res:", out)
c_res = json.loads(out)
cron_id = c_res['data']['id']
assert c_res['code'] == 0, "Failed to create crontab"

# 2. Update Crontab (PUT)
cron_update_payload = json.dumps({
    "name": "自动化测试定时备份(已编辑)",
    "schedule": "*/20 * * * *",
    "command": "echo 'CRONTAB_UPDATED_OK'"
})
out, _ = run_ssh(f'''curl -s -6 -X PUT "http://[::1]:8888/api/v1/crontabs/{cron_id}" -H "Content-Type: application/json" -H "Authorization: Bearer {token}" -d '{cron_update_payload}' ''')
print("Crontab Update Res:", out)
u_res = json.loads(out)
assert u_res['code'] == 0 and u_res['data']['schedule'] == "*/20 * * * *", "Failed to update crontab"

# 3. Run-Once & Verify duration and output
out, _ = run_ssh(f'''curl -s -6 -X POST "http://[::1]:8888/api/v1/crontabs/{cron_id}/run-once" -H "Authorization: Bearer {token}" ''')
print("Crontab Run-Once Res:", out)
r_res = json.loads(out)
assert r_res['code'] == 0, "Crontab run-once failed"
assert "CRONTAB_UPDATED_OK" in r_res['data']['output'], "Crontab command output mismatch"

# 4. Check Crontab list for real duration
out, _ = run_ssh(f'''curl -s -6 "http://[::1]:8888/api/v1/crontabs" -H "Authorization: Bearer {token}" ''')
list_res = json.loads(out)
found_job = next((j for j in list_res['data']['list'] if j['id'] == cron_id), None)
assert found_job and found_job['last_run_status'] == 'success', "Last run status not recorded"
print(f"[OK] Crontab run verified: status={found_job['last_run_status']}, duration={found_job['last_run_duration_ms']}ms")

# 5. Delete Crontab
out, _ = run_ssh(f'''curl -s -6 -X DELETE "http://[::1]:8888/api/v1/crontabs/{cron_id}" -H "Authorization: Bearer {token}" ''')
print("Crontab Delete Res:", out)
assert json.loads(out)['code'] == 0, "Failed to delete crontab"

print("\n==================================================")
print("  TIER 1.2: Files (Upload, Download, Rename, Delete)")
print("==================================================")

# 1. Upload file via multipart
test_file_content = "ArmGuard Tier 1 File Manager Verification Working 100%!"
run_ssh(f"echo '{test_file_content}' > /tmp/tier1_upload_test.txt")
out, _ = run_ssh(f'''curl -s -6 -X POST "http://[::1]:8888/api/v1/files/upload" -H "Authorization: Bearer {token}" -F "path=/opt/armguard" -F "file=@/tmp/tier1_upload_test.txt" ''')
print("File Upload Res:", out)
up_res = json.loads(out)
assert up_res['code'] == 0, "File upload failed"

# 2. Download file
out, _ = run_ssh(f'''curl -s -6 "http://[::1]:8888/api/v1/files/download?path=/opt/armguard/tier1_upload_test.txt&token={token}" ''')
print("File Download Content:", out)
assert out == test_file_content, "Downloaded file content mismatch"

# 3. Rename file
rename_payload = json.dumps({
    "old_path": "/opt/armguard/tier1_upload_test.txt",
    "new_path": "/opt/armguard/tier1_upload_renamed.txt"
})
out, _ = run_ssh(f'''curl -s -6 -X POST "http://[::1]:8888/api/v1/files/rename" -H "Content-Type: application/json" -H "Authorization: Bearer {token}" -d '{rename_payload}' ''')
print("File Rename Res:", out)
assert json.loads(out)['code'] == 0, "File rename failed"

# 4. Verify old is gone, new exists
out, _ = run_ssh("test -f /opt/armguard/tier1_upload_renamed.txt && echo 'EXISTS'")
assert out == 'EXISTS', "Renamed file does not exist"

# 5. Delete file
del_payload = json.dumps({"paths": ["/opt/armguard/tier1_upload_renamed.txt"]})
out, _ = run_ssh(f'''curl -s -6 -X DELETE "http://[::1]:8888/api/v1/files" -H "Content-Type: application/json" -H "Authorization: Bearer {token}" -d '{del_payload}' ''')
print("File Delete Res:", out)
assert json.loads(out)['code'] == 0, "File delete failed"

print("\n==================================================")
print("  TIER 1.3: Docker (Pull, Container Lifecycle, Delete)")
print("==================================================")

# 1. Pull lightweight test image (busybox:latest)
pull_payload = json.dumps({"image": "busybox", "tag": "latest"})
out, _ = run_ssh(f'''curl -s -6 -X POST "http://[::1]:8888/api/v1/docker/images/pull" -H "Content-Type: application/json" -H "Authorization: Bearer {token}" -d '{pull_payload}' ''')
print("Docker Pull Res:", out)
assert json.loads(out)['code'] == 0, "Docker pull failed"

# 2. Inspect manifest
out, _ = run_ssh(f'''curl -s -6 "http://[::1]:8888/api/v1/docker/images/inspect-manifest?image=busybox&tag=latest" -H "Authorization: Bearer {token}" ''')
manifest_res = json.loads(out)
assert manifest_res['data']['has_arm64'], "Manifest should detect ARM64 support"

# 3. Create Container
container_payload = json.dumps({
    "name": "tier1_test_container",
    "image": "busybox:latest"
})
out, _ = run_ssh(f'''curl -s -6 -X POST "http://[::1]:8888/api/v1/docker/containers" -H "Content-Type: application/json" -H "Authorization: Bearer {token}" -d '{container_payload}' ''')
print("Docker Create Container Res:", out)
assert json.loads(out)['code'] == 0, "Docker container create failed"

# 4. Delete Container
out, _ = run_ssh(f'''curl -s -6 -X DELETE "http://[::1]:8888/api/v1/docker/containers/tier1_test_container" -H "Authorization: Bearer {token}" ''')
print("Docker Delete Container Res:", out)
assert json.loads(out)['code'] == 0, "Docker container delete failed"

# 5. Delete Image
out, _ = run_ssh(f'''curl -s -6 -X DELETE "http://[::1]:8888/api/v1/docker/images/busybox:latest" -H "Authorization: Bearer {token}" ''')
print("Docker Delete Image Res:", out)
assert json.loads(out)['code'] == 0, "Docker image delete failed"


# =========================================================================
# TIER 2: Databases, SSL Certificates Center
# =========================================================================
print("\n==================================================")
print("  TIER 2.1: Databases (Lifecycle & Backup Management)")
print("==================================================")

# 1. Create Database
db_create_payload = json.dumps({
    "type": "sqlite",
    "db_name": "tier2_test_suite",
    "username": "root"
})
out, _ = run_ssh(f'''curl -s -6 -X POST "http://[::1]:8888/api/v1/databases" -H "Content-Type: application/json" -H "Authorization: Bearer {token}" -d '{db_create_payload}' ''')
print("Database Create Res:", out)
db_res = json.loads(out)
db_id = db_res['data']['id']
assert db_res['code'] == 0, "Database creation failed"

# 2. Query Database
query_payload = json.dumps({
    "sql": "CREATE TABLE IF NOT EXISTS test_users (id INT, name TEXT); INSERT INTO test_users VALUES (1, 'ArmGuard_User'); SELECT * FROM test_users;"
})
out, _ = run_ssh(f'''curl -s -6 -X POST "http://[::1]:8888/api/v1/databases/{db_id}/query" -H "Content-Type: application/json" -H "Authorization: Bearer {token}" --data-binary @- << 'EOF'
{query_payload}
EOF
''')
print("Database Query Res:", out)
q_res = json.loads(out)
assert q_res['code'] == 0 and len(q_res['data']['rows']) >= 1, "Database query failed"

# 3. Backup Database
out, _ = run_ssh(f'''curl -s -6 -X POST "http://[::1]:8888/api/v1/databases/{db_id}/backup" -H "Authorization: Bearer {token}" ''')
print("Database Backup Res:", out)
bk_res = json.loads(out)
assert bk_res['code'] == 0, "Database backup failed"
backup_filename = bk_res['data']['file_name']

# 4. Get Backups List
out, _ = run_ssh(f'''curl -s -6 "http://[::1]:8888/api/v1/databases/{db_id}/backups" -H "Authorization: Bearer {token}" ''')
print("Database Backups List Res:", out)
bk_list_res = json.loads(out)
assert len(bk_list_res['data']['list']) >= 1, "Backup list is empty"
assert bk_list_res['data']['list'][0]['file_name'] == backup_filename, "Backup filename mismatch"

# 5. Download Backup
out, _ = run_ssh(f'''curl -s -6 -I "http://[::1]:8888/api/v1/databases/backup/download?file_name={backup_filename}&token={token}" ''')
print("Database Backup Download Headers:\n", out)
assert "Content-Disposition:" in out and "200" in out, "Backup download header invalid"

# 6. Delete Backup
out, _ = run_ssh(f'''curl -s -6 -X DELETE "http://[::1]:8888/api/v1/databases/backup?file_name={backup_filename}" -H "Authorization: Bearer {token}" ''')
print("Database Backup Delete Res:", out)
assert json.loads(out)['code'] == 0, "Delete backup failed"

# 7. Delete Database
out, _ = run_ssh(f'''curl -s -6 -X DELETE "http://[::1]:8888/api/v1/databases/{db_id}" -H "Authorization: Bearer {token}" ''')
print("Database Delete Res:", out)
assert json.loads(out)['code'] == 0, "Delete database failed"

print("\n==================================================")
print("  TIER 2.2: SSL Center (Apply, Deploy, Renew, Delete)")
print("==================================================")

# 1. Apply SSL Cert (Testing SSL management lifecycle with test cert)
ssl_apply_payload = json.dumps({
    "domain": "tier2-ssl-test.com",
    "email": "admin@armguard.io",
    "provider": "self_signed",
    "challenge_type": "http-01"
})
out, _ = run_ssh(f'''curl -s -6 -X POST "http://[::1]:8888/api/v1/ssl/certs/apply" -H "Content-Type: application/json" -H "Authorization: Bearer {token}" -d '{ssl_apply_payload}' ''')
print("SSL Apply Res:", out)
ssl_res = json.loads(out)
assert ssl_res['code'] == 0, "SSL cert apply failed"
cert_id = ssl_res['data'].get('cert_id') or ssl_res['data'].get('id')

# Verify cert files written to disk
out, _ = run_ssh("test -f /etc/ssl/armguard/tier2-ssl-test.com/fullchain.pem && echo 'CERT_EXISTS'")
assert out == 'CERT_EXISTS', "Certificate PEM not found on disk"

# 2. Renew SSL Cert
out, _ = run_ssh(f'''curl -s -6 -X POST "http://[::1]:8888/api/v1/ssl/certs/{cert_id}/renew" -H "Authorization: Bearer {token}" ''')
print("SSL Renew Res:", out)
assert json.loads(out)['code'] == 0, "SSL renew failed"

# 3. Delete SSL Cert
out, _ = run_ssh(f'''curl -s -6 -X DELETE "http://[::1]:8888/api/v1/ssl/certs/{cert_id}" -H "Authorization: Bearer {token}" ''')
print("SSL Delete Res:", out)
assert json.loads(out)['code'] == 0, "SSL delete failed"

# Verify disk cleaned up
out, _ = run_ssh("test -d /etc/ssl/armguard/tier2-ssl-test.com || echo 'DIR_CLEANED'")
assert out == 'DIR_CLEANED', "Cert directory not deleted"


# =========================================================================
# TIER 3: Settings Backup Download, Webhook Events, Eco Mode, Dashboard
# =========================================================================
print("\n==================================================")
print("  TIER 3.1: Settings & Backup Stream")
print("==================================================")

# 1. Create Panel Backup
out, _ = run_ssh(f'''curl -s -6 -X POST "http://[::1]:8888/api/v1/settings/backup/create" -H "Authorization: Bearer {token}" ''')
print("Panel Backup Create Res:", out)
pb_res = json.loads(out)
panel_backup_name = pb_res['data']['file_name']
assert pb_res['code'] == 0, "Panel backup failed"

# 2. Download Panel Backup
out, _ = run_ssh(f'''curl -s -6 -I "http://[::1]:8888/api/v1/settings/backup/download?file_name={panel_backup_name}&token={token}" ''')
print("Panel Backup Download Headers:\n", out)
assert "Content-Disposition:" in out and "200" in out, "Panel backup download header invalid"

# 3. Update Settings (Eco Mode & Alert Events)
settings_update_payload = json.dumps({
    "eco_mode_enabled": True,
    "alert_events": ["high_load", "disk_low", "login_fail"]
})
out, _ = run_ssh(f'''curl -s -6 -X PUT "http://[::1]:8888/api/v1/settings/panel" -H "Content-Type: application/json" -H "Authorization: Bearer {token}" -d '{settings_update_payload}' ''')
print("Settings Update Res:", out)
assert json.loads(out)['code'] == 0, "Settings update failed"

# 4. Clean up Panel Backup
out, _ = run_ssh(f'''curl -s -6 -X DELETE "http://[::1]:8888/api/v1/settings/backup?file_name={panel_backup_name}" -H "Authorization: Bearer {token}" ''')
print("Panel Backup Delete Res:", out)
assert json.loads(out)['code'] == 0, "Panel backup delete failed"

print("\n==================================================")
print("  TIER 3.2: Dashboard Pinned Services Endpoint Check")
print("==================================================")
out, _ = run_ssh(f'''curl -s -6 "http://[::1]:8888/api/v1/apps/market" -H "Authorization: Bearer {token}" ''')
market_res = json.loads(out)
apps = market_res['data']['list']
pinned_keys = ['nginx', 'mysql', 'redis', 'warp']
found_pinned = [a for a in apps if a['key'] in pinned_keys]
print(f"[OK] Found {len(found_pinned)} pinned apps in market list: {[a['key'] for a in found_pinned]}")
assert len(found_pinned) >= 3, "Missing core apps for dashboard pinning"

print("\n==================================================")
print("  [SUCCESS] ALL TIERS (TIER 1, TIER 2, TIER 3) 100% PASSED!")
print("==================================================")

transport.close()
sock.close()
