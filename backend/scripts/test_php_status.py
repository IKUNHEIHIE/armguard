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
import socket, struct, paramiko

proxy_host = '127.0.0.1'
proxy_port = 10808
target_host = os.environ.get("ARMGUARD_SSH_HOST", "127.0.0.1")
target_port = 22
user = 'root'
pwd = os.environ.get("ARMGUARD_SSH_PASSWORD", "")

sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.connect((proxy_host, proxy_port))
sock.sendall(b'\x05\x01\x00')
sock.recv(2)
ipv6_bytes = socket.inet_pton(socket.AF_INET6, target_host)
sock.sendall(b'\x05\x01\x00\x04' + ipv6_bytes + struct.pack('>H', target_port))
sock.recv(4 + 16 + 2)

transport = paramiko.Transport(sock)
transport.connect(username=user, password=pwd)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh._transport = transport

cmd = '''
node -e "
const { execSync } = require('child_process');
const fs = require('fs');

const appKey = 'php';
let serviceName = fs.existsSync('/lib/systemd/system/php8.3-fpm.service') ? 'php8.3-fpm' : 'php8.2-fpm';
console.log('serviceName:', serviceName);

let status = 'stopped';
let pid = 0;
let memory_mb = 0;

try {
  const act = execSync(\`systemctl is-active \${serviceName} 2>/dev/null || true\`).toString().trim();
  console.log('act:', JSON.stringify(act));
  status = act === 'active' ? 'running' : 'stopped';
  console.log('status:', status);
} catch (e) {
  console.log('err:', e);
}
"
'''

stdin, stdout, stderr = ssh.exec_command(cmd)
print('STDOUT:', stdout.read().decode())
print('STDERR:', stderr.read().decode())

transport.close()
sock.close()
