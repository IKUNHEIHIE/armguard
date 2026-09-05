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

proxy_host = "127.0.0.1"
proxy_port = 10808
target_host = os.environ.get("ARMGUARD_SSH_HOST", "127.0.0.1")
target_port = 8888

print(f"Testing HTTP connection to [{target_host}]:{target_port} via v2ray SOCKS5 proxy...")

sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.settimeout(10)
sock.connect((proxy_host, proxy_port))

sock.sendall(b"\x05\x01\x00")
sock.recv(2)

ipv6_bytes = socket.inet_pton(socket.AF_INET6, target_host)
sock.sendall(b"\x05\x01\x00\x04" + ipv6_bytes + struct.pack(">H", target_port))
reply = sock.recv(4 + 16 + 2)

# Send HTTP GET /
http_req = b"GET / HTTP/1.1\r\nHost: [" + target_host + "]:8888\r\nUser-Agent: ArmGuardTester/1.0\r\nConnection: close\r\n\r\n"
sock.sendall(http_req)

resp = sock.recv(1024)
print("\n[HTTP Response from Port 8888]:")
print(resp.decode('utf-8', errors='ignore'))
sock.close()
