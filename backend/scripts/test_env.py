import os
import sys
import socket
import struct
import paramiko
from pathlib import Path

# Automatically find and load .env file from project root or current dir
def load_dotenv():
    search_paths = [
        Path(__file__).resolve().parent.parent.parent / ".env",
        Path(__file__).resolve().parent / ".env",
        Path.cwd() / ".env"
    ]
    for p in search_paths:
        if p.is_file():
            with open(p, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    k, v = line.split("=", 1)
                    k, v = k.strip(), v.strip()
                    if k not in os.environ:
                        os.environ[k] = v
            break

load_dotenv()

TARGET_HOST = os.environ.get("ARMGUARD_SSH_HOST", "127.0.0.1")
TARGET_PORT = int(os.environ.get("ARMGUARD_SSH_PORT", "22"))
SSH_USER = os.environ.get("ARMGUARD_SSH_USER", "root")
SSH_PASSWORD = os.environ.get("ARMGUARD_SSH_PASSWORD", "")

PROXY_HOST = os.environ.get("ARMGUARD_SOCKS5_HOST", "127.0.0.1")
PROXY_PORT = int(os.environ.get("ARMGUARD_SOCKS5_PORT", "10808"))
USE_PROXY = os.environ.get("ARMGUARD_USE_PROXY", "true").lower() in ("true", "1", "yes")

def get_ssh_transport():
    """Create an authenticated Paramiko Transport, optionally tunneling through SOCKS5."""
    if USE_PROXY and PROXY_HOST and PROXY_PORT:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.connect((PROXY_HOST, PROXY_PORT))
        sock.sendall(b"\x05\x01\x00")
        sock.recv(2)
        # Check if IPv6 or IPv4
        try:
            ipv6_bytes = socket.inet_pton(socket.AF_INET6, TARGET_HOST)
            sock.sendall(b"\x05\x01\x00\x04" + ipv6_bytes + struct.pack(">H", TARGET_PORT))
            sock.recv(4 + 16 + 2)
        except OSError:
            # Fallback IPv4
            ipv4_bytes = socket.inet_pton(socket.AF_INET, TARGET_HOST)
            sock.sendall(b"\x05\x01\x00\x01" + ipv4_bytes + struct.pack(">H", TARGET_PORT))
            sock.recv(4 + 4 + 2)
        transport = paramiko.Transport(sock)
    else:
        sock = socket.socket(socket.AF_INET6 if ":" in TARGET_HOST else socket.AF_INET, socket.SOCK_STREAM)
        sock.connect((TARGET_HOST, TARGET_PORT))
        transport = paramiko.Transport(sock)

    transport.connect(username=SSH_USER, password=SSH_PASSWORD)
    return transport

def get_ssh_client():
    """Create an authenticated Paramiko SSHClient."""
    transport = get_ssh_transport()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh._transport = transport
    return ssh

def run_ssh_command(cmd, ssh_client=None):
    close_after = False
    if ssh_client is None:
        ssh_client = get_ssh_client()
        close_after = True
    stdin, stdout, stderr = ssh_client.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    if close_after:
        ssh_client.close()
    return out, err
