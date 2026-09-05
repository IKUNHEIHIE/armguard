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
import paramiko
import sys

host = os.environ.get("ARMGUARD_SSH_HOST", "127.0.0.1")
port = 22
user = "root"
pwd = os.environ.get("ARMGUARD_SSH_PASSWORD", "")

print(f"Resolving {host}...")
try:
    addr_info = socket.getaddrinfo(host, port, socket.AF_UNSPEC, socket.SOCK_STREAM)
    print("getaddrinfo result:", addr_info)
    
    af, socktype, proto, canonname, sa = addr_info[0]
    sock = socket.socket(af, socktype, proto)
    sock.settimeout(10)
    print(f"Connecting socket to {sa}...")
    sock.connect(sa)
    print("✓ Socket connected successfully!")

    transport = paramiko.Transport(sock)
    transport.connect(username=user, password=pwd)
    print("✓ Paramiko transport authenticated!")

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh._transport = transport

    stdin, stdout, stderr = ssh.exec_command("uname -a; uname -m; cat /etc/os-release | head -n 5")
    print("\n--- Output ---")
    print(stdout.read().decode('utf-8', errors='ignore'))
    print(stderr.read().decode('utf-8', errors='ignore'))

    transport.close()
    sock.close()
except Exception as e:
    import traceback
    traceback.print_exc()
    sys.exit(1)
