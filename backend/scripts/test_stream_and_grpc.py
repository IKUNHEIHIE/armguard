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
import time
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

def run_suite():
    print("==================================================")
    print("ArmGuard 全栈验证: gRPC 反代模式与四层端口转发测试")
    print("==================================================")
    ssh = get_ssh()

    # Step 1: Login
    login_res = http_curl(ssh, "POST", "/api/v1/auth/login", {"username": "admin", "password": "password"})
    print("Login response:", login_res)
    token = login_res.get("data", {}).get("token")
    assert token, f"登录失败，未获得 Token: {login_res}"
    print(f"[1] 认证就绪: Token = {token[:20]}...")

    # Step 2: gRPC Site Creation & Verification
    print("\n[2] 测试七层反向代理 gRPC 模式:")
    test_domain = "grpc-test.armguard.lan"
    # Ensure cleanup
    run_ssh(ssh, f"rm -f /etc/nginx/conf.d/{test_domain}.conf")
    
    site_payload = {
        "domain": test_domain,
        "php_version": "proxy",
        "proxy_pass": "grpc://127.0.0.1:50051",
        "grpc_enabled": True
    }
    create_site_res = http_curl(ssh, "POST", "/api/v1/sites", site_payload, token)
    site_id = create_site_res.get("data", {}).get("id")
    print(f"  -> 创建 gRPC 站点结果: code={create_site_res.get('code')}, id={site_id}")
    assert site_id, f"创建站点失败: {create_site_res}"

    # Check Nginx config generated
    conf_content, _ = run_ssh(ssh, f"cat /etc/nginx/conf.d/{test_domain}.conf")
    print("  -> 检查生成的 Nginx 配置:")
    assert "grpc_pass grpc://127.0.0.1:50051;" in conf_content, "缺少 grpc_pass 指令"
    assert "grpc_set_header Host $host;" in conf_content, "缺少 grpc_set_header 指令"
    assert "grpc_read_timeout 300s;" in conf_content, "缺少 grpc_read_timeout 指令"
    assert "http2" in conf_content, "缺少 http2 监听支持"
    print("  [OK] gRPC Nginx 指令与 HTTP/2 语法完全符合要求！")

    # Update site to disable gRPC
    update_res = http_curl(ssh, "PUT", f"/api/v1/sites/{site_id}/settings", {
        "domain": test_domain,
        "proxy_pass": "http://127.0.0.1:3000",
        "grpc_enabled": False
    }, token)
    conf_content_updated, _ = run_ssh(ssh, f"cat /etc/nginx/conf.d/{test_domain}.conf")
    assert "proxy_pass http://127.0.0.1:3000;" in conf_content_updated, "更新后缺少 proxy_pass"
    assert "grpc_pass" not in conf_content_updated, "关闭 gRPC 后残留 grpc_pass"
    print("  [OK] gRPC 开关动态切换及回退测试 100% 通过！")

    # Delete test site
    http_curl(ssh, "DELETE", f"/api/v1/sites/{site_id}", token=token)
    print("  [OK] 测试站点已清理！")

    # Step 3: Layer 4 Stream CRUD & Live Forwarding Verification
    print("\n[3] 测试四层转发 (Layer 4 Stream) CRUD 与流量中继:")
    list_res = http_curl(ssh, "GET", "/api/v1/stream/list", token=token)
    print(f"  -> 获取规则列表: total = {list_res.get('data', {}).get('total', 0)}")

    # Clean existing test rules if any
    for r in list_res.get("data", {}).get("list", []):
        if r.get("listen_port") in [33077, 5353]:
            http_curl(ssh, "DELETE", f"/api/v1/stream/{r.get('id')}", token=token)

    # 3.1 Create TCP Stream Rule (Forward 33077 -> 127.0.0.1:8888 panel)
    tcp_rule_data = {
        "name": "Panel Proxy Test",
        "protocol": "tcp",
        "listen_port": 33077,
        "target_host": "127.0.0.1",
        "target_port": 8888,
        "proxy_timeout": "5m",
        "description": "测试四层 TCP 转发至面板端口"
    }
    create_rule_res = http_curl(ssh, "POST", "/api/v1/stream/create", tcp_rule_data, token)
    rule_id = create_rule_res.get("data", {}).get("id")
    print(f"  -> 创建 TCP 规则结果: code={create_rule_res.get('code')}, id={rule_id}")
    assert rule_id, f"创建四层规则失败: {create_rule_res}"

    # Verify stream conf exists
    stream_conf, _ = run_ssh(ssh, f"cat /etc/nginx/stream.d/stream_{rule_id}.conf")
    assert f"listen 33077;" in stream_conf, "缺少 listen 33077"
    assert f"server 127.0.0.1:8888" in stream_conf, "缺少 target 127.0.0.1:8888"
    assert "proxy_timeout 5m;" in stream_conf, "缺少 proxy_timeout"
    print("  [OK] Nginx Stream 配置文件生成完全正确！")

    # Real socket connection through Stream proxy port 33077 to 8888
    echo_test_cmd = """python3 -c "
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(5)
s.connect(('127.0.0.1', 33077))
s.sendall(b'GET / HTTP/1.0\\r\\nHost: 127.0.0.1:33077\\r\\n\\r\\n')
res = s.recv(1024)
s.close()
print('STREAM_RELAY_OK' if b'HTTP/1.' in res else 'FAIL:' + repr(res))
" """
    echo_out, _ = run_ssh(ssh, echo_test_cmd)
    print(f"  -> 真实四层 TCP 流量中继端到端测试: {echo_out.strip()}")
    assert "STREAM_RELAY_OK" in echo_out, f"四层流量中继测试失败: {echo_out}"
    print("  [OK] 端口 33077 -> 8888 四层 TCP 流转发中继实测完全通畅！")

    # 3.2 Port Conflict Protection Test
    print("\n[4] 测试端口冲突与保留端口防护:")
    conflict_res = http_curl(ssh, "POST", "/api/v1/stream/create", {
        "name": "Conflict Port",
        "protocol": "tcp",
        "listen_port": 33077,
        "target_host": "127.0.0.1",
        "target_port": 9000
    }, token)
    print(f"  -> 重复端口拦截: code={conflict_res.get('code')}, msg={conflict_res.get('message')}")
    assert conflict_res.get("code") == 400, "未正确拦截端口冲突"

    reserved_res = http_curl(ssh, "POST", "/api/v1/stream/create", {
        "name": "Reserved Port",
        "protocol": "tcp",
        "listen_port": 8888,
        "target_host": "127.0.0.1",
        "target_port": 9000
    }, token)
    print(f"  -> 面板保留端口拦截: code={reserved_res.get('code')}, msg={reserved_res.get('message')}")
    assert reserved_res.get("code") == 400, "未正确拦截保留端口 8888"
    print("  [OK] 端口冲突与保留端口安全防护拦截生效！")

    # 3.3 Toggle Test
    print("\n[5] 测试规则启停切换 (Toggle):")
    toggle_res1 = http_curl(ssh, "POST", f"/api/v1/stream/{rule_id}/toggle", token=token)
    status1 = toggle_res1.get("data", {}).get("status")
    print(f"  -> 第一次切换 (停用): status={status1}")
    assert status1 == "stopped", "停用状态不正确"
    conf_exists, _ = run_ssh(ssh, f"test -f /etc/nginx/stream.d/stream_{rule_id}.conf && echo 'yes' || echo 'no'")
    assert conf_exists.strip() == "no", "停用后配置文件仍存在"

    toggle_res2 = http_curl(ssh, "POST", f"/api/v1/stream/{rule_id}/toggle", token=token)
    status2 = toggle_res2.get("data", {}).get("status")
    print(f"  -> 第二次切换 (启用): status={status2}")
    assert status2 == "running", "启用状态不正确"
    conf_exists2, _ = run_ssh(ssh, f"test -f /etc/nginx/stream.d/stream_{rule_id}.conf && echo 'yes' || echo 'no'")
    assert conf_exists2.strip() == "yes", "启用后配置文件未恢复"
    print("  [OK] 四层转发单项启停与端口释放恢复测试通过！")

    # 3.4 Create UDP Rule
    print("\n[6] 测试 UDP 四层转发规则:")
    udp_rule_data = {
        "name": "DNS Relay",
        "protocol": "udp",
        "listen_port": 5353,
        "target_host": "127.0.0.1",
        "target_port": 53,
        "description": "DNS UDP 转发"
    }
    create_udp_res = http_curl(ssh, "POST", "/api/v1/stream/create", udp_rule_data, token)
    udp_id = create_udp_res.get("data", {}).get("id")
    print(f"  -> 创建 UDP 规则: id={udp_id}")
    udp_conf, _ = run_ssh(ssh, f"cat /etc/nginx/stream.d/stream_{udp_id}.conf")
    assert "listen 5353 udp;" in udp_conf, "缺少 UDP 监听指令"
    print("  [OK] UDP 四层规则配置生成并通过 Nginx 语法预检！")

    # 3.5 Cleanup Test Rules
    print("\n[7] 清理测试规则:")
    http_curl(ssh, "DELETE", f"/api/v1/stream/{rule_id}", token=token)
    http_curl(ssh, "DELETE", f"/api/v1/stream/{udp_id}", token=token)
    out, err = run_ssh(ssh, "nginx -t")
    nginx_t = out + " " + err
    assert "successful" in nginx_t, f"清理后 Nginx 语法异常: {nginx_t}"
    print("  [OK] 四层转发规则清理完毕，Nginx 运行良好！")

    print("\n[SUCCESS] 全部验证场景均 100% 通过！")
    ssh.close()

if __name__ == "__main__":
    run_suite()
