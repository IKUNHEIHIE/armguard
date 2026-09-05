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

def run_cmd(title, cmd):
    print(f"\n==================== {title} ====================")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='ignore')
    err = stderr.read().decode('utf-8', errors='ignore')
    if out:
        print(out.strip())
    if err:
        print("STDERR:", err.strip())

# Generate safe /etc/wireguard/warp.conf
setup_conf_script = """
import json

with open('/var/lib/armguard/warp_account.json') as f:
    acc = json.load(f)

# Note: In pure IPv6 environment, peer endpoint is IPv6 [2606:4700:d0::a29f:c001]:2408
# Table = off prevents overriding default routing table automatically, allows policy routing!
conf = f'''[Interface]
PrivateKey = {acc['private_key']}
Address = {acc['v4']}/32, {acc['v6']}/128
DNS = 1.1.1.1, 2606:4700:4700::1111
Table = 51820

[Peer]
PublicKey = {acc['peer_pubkey']}
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = {acc['endpoint_v6']}
PersistentKeepalive = 25
'''

with open('/etc/wireguard/warp.conf', 'w') as f:
    f.write(conf)

print('Written /etc/wireguard/warp.conf')
"""

escaped_setup = setup_conf_script.replace('"', '\\"').replace('$', '\\$')
run_cmd("1. Generate warp.conf", f'python3 -c "{escaped_setup}"')
run_cmd("2. Check warp.conf", "cat /etc/wireguard/warp.conf")

# Test starting wg-quick warp with Table 51820
start_cmd = """
wg-quick down warp 2>/dev/null || true
wg-quick up warp
wg show warp
ip -4 rule add not fwmark 51820 table 51820 2>/dev/null || true
ip -4 rule add table main suppress_prefixlength 0 2>/dev/null || true
"""
run_cmd("3. Bring Up WireGuard Tunnel (Safe Table 51820)", start_cmd)

# Test outbound through warp!
test_trace = """
curl -s -4 -m 5 https://www.cloudflare.com/cdn-cgi/trace || echo 'Trace via IPv4 failed'
"""
run_cmd("4. Real Cloudflare Trace Outbound Test", test_trace)

# Disconnect
down_cmd = """
wg-quick down warp 2>/dev/null || true
ip -4 rule del table 51820 2>/dev/null || true
ip -4 rule del table main suppress_prefixlength 0 2>/dev/null || true
"""
run_cmd("5. Disconnect and restore", down_cmd)

transport.close()
sock.close()
