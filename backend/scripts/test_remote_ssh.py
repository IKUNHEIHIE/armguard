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
import paramiko
import sys

host = os.environ.get("ARMGUARD_SSH_HOST", "127.0.0.1")
port = 22
user = "root"
pwd = os.environ.get("ARMGUARD_SSH_PASSWORD", "")

print(f"Connecting to {host}:{port} as {user}...")

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

try:
    ssh.connect(hostname=host, port=port, username=user, password=pwd, timeout=15)
    print("✓ SSH connected successfully!")

    commands = [
        "uname -a",
        "uname -m",
        "cat /etc/os-release | head -n 5",
        "lscpu | grep -E 'Architecture|Model name|CPU\(s\):|Byte Order'",
        "free -h",
        "df -h /",
        "command -v go; command -v node; command -v python3; command -v docker; command -v nginx"
    ]

    for cmd in commands:
        stdin, stdout, stderr = ssh.exec_command(cmd)
        out = stdout.read().decode('utf-8', errors='ignore').strip()
        err = stderr.read().decode('utf-8', errors='ignore').strip()
        print(f"\n--- [cmd] {cmd} ---")
        if out:
            print(out)
        if err:
            print(f"[stderr] {err}")

    ssh.close()
except Exception as e:
    print(f"SSH Connection Failed: {e}", file=sys.stderr)
    sys.exit(1)
