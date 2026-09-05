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
import sys

proxy_host = "127.0.0.1"
proxy_port = 10808

target_host = os.environ.get("ARMGUARD_SSH_HOST", "127.0.0.1")
target_port = 22
user = "root"
pwd = os.environ.get("ARMGUARD_SSH_PASSWORD", "")

print(f"Connecting to v2ray SOCKS5 proxy at {proxy_host}:{proxy_port}...")

try:
    # 1. Connect to local SOCKS5 proxy
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(15)
    sock.connect((proxy_host, proxy_port))
    print("[OK] Connected to local v2ray proxy port 10808!")

    # 2. SOCKS5 Greeting (No Auth)
    sock.sendall(b"\x05\x01\x00")
    resp = sock.recv(2)
    if resp != b"\x05\x00":
        raise Exception(f"SOCKS5 auth failed or unsupported: {resp}")
    print("[OK] SOCKS5 handshake accepted!")

    # 3. SOCKS5 Connect Request (IPv6 address type = 0x04)
    ipv6_bytes = socket.inet_pton(socket.AF_INET6, target_host)
    port_bytes = struct.pack(">H", target_port)
    req = b"\x05\x01\x00\x04" + ipv6_bytes + port_bytes
    sock.sendall(req)

    reply = sock.recv(4)
    if len(reply) < 4:
        raise Exception(f"Short reply from SOCKS5 proxy: {reply}")
    
    ver, rep, rsv, atyp = reply
    if rep != 0x00:
        rep_errors = {
            0x01: "General SOCKS server failure",
            0x02: "Connection not allowed by ruleset",
            0x03: "Network unreachable (Target IPv6 not routed by proxy server)",
            0x04: "Host unreachable",
            0x05: "Connection refused",
            0x06: "TTL expired",
            0x07: "Command not supported",
            0x08: "Address type not supported"
        }
        err_msg = rep_errors.get(rep, f"Unknown SOCKS error {rep}")
        raise Exception(f"Proxy failed to connect to IPv6 target: {err_msg} (code {rep})")

    # Read the rest of the bind address in SOCKS reply
    if atyp == 0x01: # IPv4
        sock.recv(4 + 2)
    elif atyp == 0x04: # IPv6
        sock.recv(16 + 2)
    elif atyp == 0x03: # Domain
        dlen = sock.recv(1)[0]
        sock.recv(dlen + 2)

    print(f"[OK] Proxy successfully bridged to remote IPv6 host [{target_host}]:{target_port}!")

    # 4. Hand off socket to Paramiko SSH
    transport = paramiko.Transport(sock)
    transport.connect(username=user, password=pwd)
    print("[OK] SSH Authentication successful! Logged in as root.")

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh._transport = transport

    # Run system diagnostic commands
    cmds = [
        "uname -a",
        "cat /etc/os-release | grep -E 'PRETTY_NAME|VERSION_ID'",
        r"lscpu | grep -E 'Architecture|Model name|CPU\(s\):|Byte Order'",
        "free -h",
        "df -h /",
        "command -v node; command -v npm; command -v go; command -v docker; command -v nginx"
    ]

    for cmd in cmds:
        stdin, stdout, stderr = ssh.exec_command(cmd)
        out = stdout.read().decode('utf-8', errors='ignore').strip()
        print(f"\n>>> [cmd] {cmd}")
        print(out)

    transport.close()
    sock.close()
    print("\n[SUCCESS] Test completed successfully!")

except Exception as e:
    print(f"\n[ERROR] {e}", file=sys.stderr)
    sys.exit(1)
