import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

async function startPanelInstance({ dataDir, backupDir, port, extraEnv = {} }) {
  const stdoutChunks = [];
  const stderrChunks = [];
  const child = spawn(process.execPath, [path.join(repoRoot, 'backend', 'dev_server.js')], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      ARMGUARD_DATA_DIR: dataDir,
      ARMGUARD_BACKUP_DIR: backupDir,
      ...(port ? { PORT: String(port) } : {}),
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (d) => stdoutChunks.push(d.toString('utf8')));
  child.stderr.on('data', (d) => stderrChunks.push(d.toString('utf8')));

  const targetPort = port || JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8')).port;
  const baseUrl = `http://127.0.0.1:${targetPort}`;

  const deadline = Date.now() + 10000;
  let ready = false;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${baseUrl}/api/v1/auth/captcha`);
      if (r.status === 200) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }

  if (!ready) {
    child.kill();
    throw new Error(`Server failed to start on ${baseUrl}. stdout=${stdoutChunks.join('')} stderr=${stderrChunks.join('')}`);
  }

  return {
    child,
    port: targetPort,
    baseUrl,
    getStdout: () => stdoutChunks.join(''),
    getStderr: () => stderrChunks.join(''),
    stop: () =>
      new Promise((resolve) => {
        if (child.exitCode !== null) return resolve();
        child.once('exit', () => resolve());
        child.kill('SIGTERM');
        setTimeout(() => {
          if (child.exitCode === null) child.kill('SIGKILL');
          resolve();
        }, 1500);
      }),
  };
}

let tempRoot;
let dataDir;
let backupDir;
let server;
let initialPassword;
let authToken;

before(async () => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'armguard-test-'));
  dataDir = path.join(tempRoot, 'data');
  backupDir = path.join(tempRoot, 'backups');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(backupDir, { recursive: true });

  const port = await getFreePort();
  server = await startPanelInstance({ dataDir, backupDir, port });
});

after(async () => {
  if (server) await server.stop();
  if (tempRoot && fs.existsSync(tempRoot)) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('AG-001 & AG-002: LogsView.vue is tracked/present and ws is declared in package.json', () => {
  const logsViewPath = path.join(repoRoot, 'frontend', 'src', 'views', 'logs', 'LogsView.vue');
  assert.equal(fs.existsSync(logsViewPath), true, 'LogsView.vue must exist');
  const checkIgnore = spawnSync('git', ['check-ignore', 'frontend/src/views/logs/LogsView.vue'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.notEqual(checkIgnore.status, 0, 'frontend/src/views/logs/LogsView.vue must not be ignored by .gitignore');

  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  assert.ok(pkg.dependencies && pkg.dependencies.ws, 'package.json must declare ws in dependencies');
  assert.equal(fs.existsSync(path.join(repoRoot, 'package-lock.json')), true, 'package-lock.json must exist');
});

test('AG-004: First-run admin password is randomly generated, PBKDF2 hashed, never logged to stdout, and default password fails', async () => {
  const initPassPath = path.join(dataDir, 'initial_admin_password');
  assert.equal(fs.existsSync(initPassPath), true, 'initial_admin_password file must be created on first run');
  const initContent = fs.readFileSync(initPassPath, 'utf8');
  const match = initContent.match(/password=(\S+)/);
  assert.ok(match && match[1].length >= 12, 'initial password must be at least 12 chars');
  initialPassword = match[1];
  assert.notEqual(initialPassword, 'armguard');

  const stdout = server.getStdout();
  assert.equal(stdout.includes(initialPassword), false, 'stdout must not leak the plaintext initial password');

  const usersJson = JSON.parse(fs.readFileSync(path.join(dataDir, 'users.json'), 'utf8'));
  const admin = Array.isArray(usersJson) ? usersJson[0] : usersJson.users[0];
  assert.ok(admin.password.includes(':') && admin.password.split(':').length === 3, 'stored password must be PBKDF2 salt:hash:iterations');
  assert.NotEqual?.(admin.password, initialPassword);
  assert.notEqual(admin.password, initialPassword, 'plaintext password must not be stored');

  // Default password 'armguard' must fail
  const badRes = await fetch(`${server.baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-security-entrance': '/armguard' },
    body: JSON.stringify({ username: 'admin', password: 'armguard' }),
  });
  assert.equal(badRes.status, 401);

  // Generated initial password must succeed
  const okRes = await fetch(`${server.baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-security-entrance': '/armguard' },
    body: JSON.stringify({ username: 'admin', password: initialPassword }),
  });
  assert.equal(okRes.status, 200);
  const body = await okRes.json();
  assert.ok(body.data?.token);
  authToken = body.data.token;
});

test('AG-005: Telemetry endpoints return real host data without fabricated Raspberry Pi / Ampere Altra / 38.5C values', async () => {
  const headers = { Authorization: `Bearer ${authToken}` };
  const [infoRes, rtRes, thRes] = await Promise.all([
    fetch(`${server.baseUrl}/api/v1/system/info`, { headers }),
    fetch(`${server.baseUrl}/api/v1/system/monitor/realtime`, { headers }),
    fetch(`${server.baseUrl}/api/v1/system/hardware/thermal`, { headers }),
  ]);

  assert.equal(infoRes.status, 200);
  assert.equal(rtRes.status, 200);
  assert.equal(thRes.status, 200);

  const info = (await infoRes.json()).data;
  const rt = (await rtRes.json()).data;
  const th = (await thRes.json()).data;

  assert.equal(info.hostname, os.hostname());
  assert.equal(String(info.board_model).includes('Raspberry Pi 5 Model B Rev 1.0'), false);
  assert.equal(String(info.cpu_model).includes('Ampere Altra'), false);
  assert.ok(rt.memory.total > 0);
  assert.ok('swap_total' in rt.memory);
  assert.ok(Array.isArray(rt.cpu.cores_percent));

  if (!th.throttle_source) {
    assert.equal(th.throttling_flags_hex, null);
    assert.equal(th.under_voltage, null);
    assert.equal(th.voltage_v, null);
  }
});

test('AG-006 & AG-014: WebSocket /system/monitor/ws connects via Sec-WebSocket-Protocol without ReferenceError and streams telemetry', async () => {
  const wsUrl = server.baseUrl.replace(/^http/, 'ws') + '/system/monitor/ws';
  const msg = await new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, ['armguard.v1', authToken], {
      headers: { Cookie: 'ag_entrance=1' },
    });
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error('Timed out waiting for /system/monitor/ws message'));
    }, 5000);

    ws.on('message', (data) => {
      clearTimeout(timer);
      const parsed = JSON.parse(data.toString('utf8'));
      ws.close();
      resolve(parsed);
    });
    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

  assert.ok(msg.realtime);
  assert.ok(msg.arm_thermal);
  assert.ok(msg.monitor);
  assert.ok(msg.monitor.interval_ms === 1000 || msg.monitor.interval_ms === 3000);
});

test('AG-008 & AG-007: Panel backup creation succeeds without backupPath ReferenceError and downloads via single-use ticket', async () => {
  const headers = {
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json',
  };

  const createRes = await fetch(`${server.baseUrl}/api/v1/settings/backup/create`, {
    method: 'POST',
    headers,
  });
  assert.equal(createRes.status, 200);
  const createBody = await createRes.json();
  const fileName = createBody.data?.file_name;
  assert.ok(fileName && fileName.endsWith('.tar.gz'));

  // Request single-use download ticket
  const ticketRes = await fetch(`${server.baseUrl}/api/v1/auth/download-ticket`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      path: `/api/v1/settings/backup/download?file_name=${encodeURIComponent(fileName)}`,
    }),
  });
  assert.equal(ticketRes.status, 200);
  const ticketBody = await ticketRes.json();
  const ticketUrl = `${server.baseUrl}${ticketBody.data.url}`;
  assert.equal(ticketUrl.includes(authToken), false, 'ticket URL must not contain session token');

  // HEAD precheck does not consume the ticket
  const headRes = await fetch(ticketUrl, { method: 'HEAD' });
  assert.equal(headRes.status, 200);

  // First GET consumes the ticket and downloads the archive
  const get1 = await fetch(ticketUrl);
  assert.equal(get1.status, 200);
  const buf = Buffer.from(await get1.arrayBuffer());
  assert.ok(buf.length > 32, 'downloaded archive must be non-empty');

  // Second GET with same single-use ticket must be rejected (401)
  const get2 = await fetch(ticketUrl);
  assert.equal(get2.status, 401);
});

test('AG-013: Webhook test performs real HTTP request and validates platform business status code', async () => {
  let mockMode = 'feishu_ok';
  const mockWebhookServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (mockMode === 'feishu_ok') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 0, msg: 'success' }));
      } else if (mockMode === 'feishu_biz_err') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 19021, msg: 'sign match fail' }));
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Error');
      }
    });
  });

  await new Promise((resolve) => mockWebhookServer.listen(0, '127.0.0.1', resolve));
  const whPort = mockWebhookServer.address().port;
  const whUrl = `http://127.0.0.1:${whPort}/hook`;

  try {
    const headers = {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    };

    // 1. Valid Feishu response (HTTP 200, code: 0)
    mockMode = 'feishu_ok';
    const okRes = await fetch(`${server.baseUrl}/api/v1/settings/webhook-test`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ webhook_type: 'feishu', webhook_url: whUrl }),
    });
    assert.equal(okRes.status, 200);

    // 2. Feishu business error (HTTP 200, code: 19021) must fail!
    mockMode = 'feishu_biz_err';
    const bizFailRes = await fetch(`${server.baseUrl}/api/v1/settings/webhook-test`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ webhook_type: 'feishu', webhook_url: whUrl }),
    });
    assert.equal(bizFailRes.status, 502);
  } finally {
    await new Promise((resolve) => mockWebhookServer.close(resolve));
  }
});

test('AG-011 & AG-012: Renaming admin username updates session identity and operation logs pagination/filtering', async () => {
  const headers = {
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json',
  };

  const newPassword = 'NewStrongPassword!2026';
  const chgRes = await fetch(`${server.baseUrl}/api/v1/settings/admin/password`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      old_password: initialPassword,
      new_username: 'opsadmin',
      new_password: newPassword,
    }),
  });
  assert.equal(chgRes.status, 200);

  // Verify user-info reflects new username 'opsadmin'
  const infoRes = await fetch(`${server.baseUrl}/api/v1/auth/user-info`, { headers });
  assert.equal(infoRes.status, 200);
  const infoBody = await infoRes.json();
  assert.equal(infoBody.data.username, 'opsadmin');

  // Verify operation logs pagination and filtering
  const logsRes = await fetch(`${server.baseUrl}/api/v1/logs/operation?page=1&page_size=5&action=opsadmin`, {
    headers,
  });
  assert.equal(logsRes.status, 200);
  const logsBody = await logsRes.json();
  assert.ok(logsBody.data.total >= 1);
  assert.equal(logsBody.data.page, 1);
  assert.equal(logsBody.data.page_size, 5);
  assert.equal(logsBody.data.list[0].username, 'opsadmin');
});

test('AG-009 & AG-010: Settings validation rejects invalid SSL cert/key, enforces max_login_retry lockout, and reports runtime port status', async () => {
  const headers = {
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json',
  };

  // Enabling ssl_enabled without valid cert/key paths must return 400
  const badSslRes = await fetch(`${server.baseUrl}/api/v1/settings/panel`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      ssl_enabled: true,
      panel_ssl_cert: '/nonexistent/cert.pem',
      panel_ssl_key: '/nonexistent/key.pem',
    }),
  });
  assert.equal(badSslRes.status, 400);

  // Set max_login_retry = 3 and login_lock_minutes = 5
  const saveRes = await fetch(`${server.baseUrl}/api/v1/settings/panel`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      ssl_enabled: false,
      max_login_retry: 3,
      login_lock_minutes: 5,
    }),
  });
  assert.equal(saveRes.status, 200);
  const saveBody = await saveRes.json();
  assert.ok(saveBody.data.runtime);
  assert.equal(saveBody.data.runtime.effective_port, server.port);

  // Trigger 3 failed logins -> 3rd attempt locks IP (429)
  const fail1 = await fetch(`${server.baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-security-entrance': '/armguard' },
    body: JSON.stringify({ username: 'opsadmin', password: 'wrong-password-1' }),
  });
  assert.equal(fail1.status, 401);

  const fail2 = await fetch(`${server.baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-security-entrance': '/armguard' },
    body: JSON.stringify({ username: 'opsadmin', password: 'wrong-password-2' }),
  });
  assert.equal(fail2.status, 401);

  const fail3 = await fetch(`${server.baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-security-entrance': '/armguard' },
    body: JSON.stringify({ username: 'opsadmin', password: 'wrong-password-3' }),
  });
  assert.equal(fail3.status, 429);
});
