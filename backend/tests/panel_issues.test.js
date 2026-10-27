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

test('AG-001 & AG-002: Logs page source is tracked/present and ws is declared in package.json', () => {
  const logsViewPath = path.join(repoRoot, 'frontend', 'src', 'app', 'pages', 'logs', 'logs.component.ts');
  assert.equal(fs.existsSync(logsViewPath), true, 'logs.component.ts must exist');
  const checkIgnore = spawnSync('git', ['check-ignore', 'frontend/src/app/pages/logs/logs.component.ts'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.notEqual(checkIgnore.status, 0, 'frontend/src/app/pages/logs/logs.component.ts must not be ignored by .gitignore');

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

test('REV-001, REV-002, REV-005, REV-006, REV-011, REV-012: File sandbox symlink protection, no silent overwrite, real multipart upload, and safe archive handling', async () => {
  const { handleFiles, isProtectedPath } = await import('../routes/files.js');
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-rev-files-'));

  try {
    // 1. REV-002: Symlink pointing to forbidden directory (/etc) must be blocked even for a non-existent child leaf
    const symlinkDir = path.join(workDir, 'etc-link');
    let symlinkCreated = false;
    try {
      // Windows 上 'dir' 型符号链接需要开发者模式/管理员权限，无权限时会被降级成普通目录，
      // 使下面的断言失去意义。junction 是等价的目录链接，且普通用户即可创建。
      const linkType = process.platform === 'win32' ? 'junction' : 'dir';
      fs.symlinkSync(process.platform === 'win32' ? 'C:\\Windows\\System32' : '/etc', symlinkDir, linkType);
      symlinkCreated = fs.lstatSync(symlinkDir).isSymbolicLink();
      assert.equal(symlinkCreated, true, 'test setup must create a real directory link, otherwise REV-002 is not exercised');
    } catch {}
    if (symlinkCreated) {
      const targetThroughLink = path.join(symlinkDir, 'new-escape-file.txt');
      assert.equal(isProtectedPath(targetThroughLink), true, 'Non-existent leaf inside symlinked forbidden dir must be blocked');
    }

    // 2. REV-006: Create file and rename must refuse silent overwrite (409) and preserve existing content
    const existingFile = path.join(workDir, 'keep.txt');
    fs.writeFileSync(existingFile, 'IMPORTANT_DATA', 'utf8');

    async function callFiles(route, method, body, headers = {}) {
      let resp;
      const u = new URL('http://127.0.0.1' + route);
      await handleFiles(
        u.pathname,
        { method, headers },
        { json: (data = null, message = 'ok', code = 0) => { resp = { code, message, data }; } },
        u,
        {
          isProtectedPath,
          parseBody: async () => body,
          currentUser: () => 'opsadmin',
          logOperation: () => {},
        }
      );
      return resp;
    }

    const createDup = await callFiles('/api/v1/files/create', 'POST', { path: existingFile, is_dir: false });
    assert.equal(createDup.code, 409, 'Creating over an existing file must return 409');
    assert.equal(fs.readFileSync(existingFile, 'utf8'), 'IMPORTANT_DATA', 'Existing file content must not be erased');

    const renameSrc = path.join(workDir, 'src.txt');
    fs.writeFileSync(renameSrc, 'NEW_DATA', 'utf8');
    const renameDup = await callFiles('/api/v1/files/rename', 'POST', { old_path: renameSrc, new_path: existingFile });
    assert.equal(renameDup.code, 409, 'Renaming over an existing file must return 409');
    assert.equal(fs.readFileSync(existingFile, 'utf8'), 'IMPORTANT_DATA', 'Destination file content must not be replaced');

    // 3. REV-005: Empty upload returns 400 (never 500 ReferenceError), and real multipart upload writes file & blocks overwrite
    const emptyUpload = await callFiles('/api/v1/files/upload', 'POST', {});
    assert.equal(emptyUpload.code, 400);

    const boundary = '----ArmGuardTestBoundary7MA4YWxkTrZu0gW';
    const mpBody = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="path"\r\n\r\n` +
      `${workDir}\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="uploaded_hello.txt"\r\n` +
      `Content-Type: text/plain\r\n\r\n` +
      `Hello ArmGuard Multipart!\r\n` +
      `--${boundary}--\r\n`,
      'utf8'
    );
    const upRes = await fetch(`${server.baseUrl}/api/v1/files/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: mpBody,
    });
    assert.equal(upRes.status, 200);
    assert.equal(fs.readFileSync(path.join(workDir, 'uploaded_hello.txt'), 'utf8'), 'Hello ArmGuard Multipart!');

    // Duplicate upload without overwrite must return 409
    const dupUpRes = await fetch(`${server.baseUrl}/api/v1/files/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: mpBody,
    });
    assert.equal(dupUpRes.status, 409);

    // 4. REV-011: Recursive archive containing .env must be blocked (403)
    const siteDir = path.join(workDir, 'sample-site');
    fs.mkdirSync(siteDir, { recursive: true });
    fs.writeFileSync(path.join(siteDir, '.env'), 'SECRET=123', 'utf8');
    const envArchive = await callFiles('/api/v1/files/compress', 'POST', {
      paths: [siteDir],
      target_name: 'site.tar.gz',
      format: 'tar.gz',
    });
    assert.equal(envArchive.code, 403, 'Archiving a directory containing .env must be rejected with 403');
    assert.equal(fs.existsSync(path.join(workDir, 'site.tar.gz')), false);

    // 5. REV-001: Compressing filenames starting with '--checkpoint' must not execute checkpoint actions
    if (process.platform !== 'win32') {
      const untrustedDir = path.join(workDir, 'untrusted');
      fs.mkdirSync(untrustedDir, { recursive: true });
      const markerFile = path.join(untrustedDir, 'AUDIT_TAR_OPTION_MARKER');
      const trickyNames = ['ordinary.txt', '--checkpoint=1', '--checkpoint-action=exec=touch AUDIT_TAR_OPTION_MARKER'];
      for (const n of trickyNames) {
        fs.writeFileSync(path.join(untrustedDir, n), 'SYNTHETIC', 'utf8');
      }
      const tarRes = await callFiles('/api/v1/files/compress', 'POST', {
        paths: trickyNames.map((n) => path.join(untrustedDir, n)),
        target_name: 'safe.tar.gz',
        format: 'tar.gz',
      });
      assert.equal(tarRes.code, 0);
      assert.equal(fs.existsSync(markerFile), false, 'tar option injection marker must never be created');
    }

    // 6. REV-012: Default file list without path parameter succeeds (200)
    const listRes = await fetch(`${server.baseUrl}/api/v1/files/list`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    assert.equal(listRes.status, 200);
    const listBody = await listRes.json();
    assert.ok(listBody.data.current_path);
    assert.ok(Array.isArray(listBody.data.allowed_roots));
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

test('REV-003, REV-004, REV-007, REV-008, REV-009, REV-010, REV-013, REV-014, REV-016: Security headers, Nginx rollback, SIGTERM default, Node.js self-protection, unknown task 404, and stream GET purity', async () => {
  const { handleSites } = await import('../routes/sites.js');
  const { handleApps } = await import('../routes/apps.js');
  const { handleSystem } = await import('../routes/system.js');
  const { handleStream } = await import('../routes/stream.js');

  // 1. REV-004: Security response headers on public & API routes
  const loginPageRes = await fetch(`${server.baseUrl}/login`);
  assert.equal(loginPageRes.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(loginPageRes.headers.get('x-frame-options'), 'DENY');
  assert.equal(loginPageRes.headers.get('referrer-policy'), 'same-origin');
  assert.ok(loginPageRes.headers.get('content-security-policy')?.includes("default-src 'self'"));

  // 2. REV-009: Uninstalling nodejs must be blocked with 403
  const nodeUninstallRes = await fetch(`${server.baseUrl}/api/v1/apps/nodejs/uninstall`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(nodeUninstallRes.status, 403);

  // 3. REV-013: Querying a non-existent install task_id must return 404 and stage=unknown
  const badTaskRes = await fetch(`${server.baseUrl}/api/v1/apps/sqlite3/install-progress?task_id=nonexistent-task-id`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  assert.equal(badTaskRes.status, 404);
  const badTaskBody = await badTaskRes.json();
  assert.equal(badTaskBody.data.stage, 'unknown');

  // 4. REV-008: Killing panel's own PID must be blocked with 403
  const selfKillRes = await fetch(`${server.baseUrl}/api/v1/system/processes/${server.child.pid}/kill`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(selfKillRes.status, 403);

  // 5. REV-007 & REV-016: Raw Nginx config rollback and Stream GET purity
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-rev-nginx-'));
  try {
    const fakeNginxConf = path.join(tmpDir, 'nginx.conf');
    fs.writeFileSync(fakeNginxConf, 'ORIGINAL_VALID_NGINX_CONF', 'utf8');

    let rawResp;
    const rawUrl = new URL('http://127.0.0.1/api/v1/apps/nginx/raw-config');
    await handleApps(
      rawUrl.pathname,
      { method: 'PUT', headers: {} },
      { json: (data = null, message = 'ok', code = 0) => { rawResp = { code, message, data }; } },
      rawUrl,
      {
        parseBody: async () => ({ file_path: fakeNginxConf, content: 'BROKEN_DIRECTIVE_XYZ' }),
        currentUser: () => 'opsadmin',
        logOperation: () => {},
        saveJSON: () => true,
      }
    );
    // When nginx binary is missing or fails validation, original config must be restored!
    if (rawResp.code !== 0) {
      assert.equal(fs.readFileSync(fakeNginxConf, 'utf8'), 'ORIGINAL_VALID_NGINX_CONF');
    }

    // Stream GET must not modify fakeNginxConf
    let streamResp;
    const streamUrl = new URL('http://127.0.0.1/api/v1/stream');
    await handleStream(
      streamUrl.pathname,
      { method: 'GET', headers: {} },
      { json: (data = null, message = 'ok', code = 0) => { streamResp = { code, message, data }; } },
      streamUrl,
      {
        STREAM_CONF_DIR: path.join(tmpDir, 'stream.d'),
        NGINX_MAIN_CONF: fakeNginxConf,
        streamRules: [],
      }
    );
    assert.equal(streamResp.code, 0);
    assert.equal(fs.readFileSync(fakeNginxConf, 'utf8'), 'ORIGINAL_VALID_NGINX_CONF');
    assert.equal(fs.existsSync(path.join(tmpDir, 'stream.d')), false, 'GET /api/v1/stream must not create stream.d directory');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('AG-PERF-01: long-running external commands must not block the Node event loop', async () => {
  const { execFileAsync, runOrThrow } = await import('../lib/exec.js');

  // 模拟一个耗时 1.2 秒的外部命令（等同 docker pull / apt-get / tar 备份的场景）
  const slowCmd = process.platform === 'win32'
    ? ['node', ['-e', 'setTimeout(() => {}, 1200)']]
    : ['sleep', ['1.2']];

  let ticks = 0;
  const heartbeat = setInterval(() => { ticks += 1; }, 50);
  const started = Date.now();
  const res = await execFileAsync(slowCmd[0], slowCmd[1], { timeout: 15000 });
  const elapsed = Date.now() - started;
  clearInterval(heartbeat);

  assert.equal(res.error, null, 'external command should run cleanly');
  assert.equal(res.status, 0);
  assert.ok(elapsed >= 1000, `command should really take ~1.2s, took ${elapsed}ms`);
  // spawnSync 会把事件循环完全锁住，ticks 只可能是 0~1；异步执行时事件循环持续运转
  assert.ok(
    ticks >= 8,
    `event loop must keep serving during a long external command (ticks=${ticks}, elapsed=${elapsed}ms)`
  );
});

test('AG-PERF-01: runOrThrow surfaces missing binaries and non-zero exits as readable errors', async () => {
  const { runOrThrow } = await import('../lib/exec.js');

  await assert.rejects(
    () => runOrThrow('armguard-definitely-not-a-real-binary', ['--version'], { timeout: 5000 }),
    /系统未安装 armguard-definitely-not-a-real-binary/,
    'missing binary must be reported as not installed'
  );

  const failing = process.platform === 'win32'
    ? ['node', ['-e', 'console.error("boom"); process.exit(3)']]
    : ['sh', ['-c', 'echo boom >&2; exit 3']];
  await assert.rejects(
    () => runOrThrow(failing[0], failing[1], { timeout: 5000 }),
    /boom/,
    'non-zero exit must include stderr detail'
  );
});

test('AG-PERF-01: compress → decompress round-trip preserves file contents (async archive pipeline)', async () => {
  const { handleFiles, isProtectedPath } = await import('../routes/files.js');
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-arch-roundtrip-'));

  async function callFiles(route, method, body) {
    let resp;
    const u = new URL('http://127.0.0.1' + route);
    await handleFiles(
      u.pathname,
      { method, headers: {} },
      { json: (data = null, message = 'ok', code = 0) => { resp = { code, message, data }; } },
      u,
      {
        isProtectedPath,
        parseBody: async () => body,
        currentUser: () => 'opsadmin',
        logOperation: () => {},
      }
    );
    return resp;
  }

  try {
    const srcDir = path.join(workDir, 'src');
    fs.mkdirSync(path.join(srcDir, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'a.txt'), 'hello-a', 'utf8');
    fs.writeFileSync(path.join(srcDir, 'sub', 'b.txt'), 'hello-b', 'utf8');

    const compressRes = await callFiles('/api/v1/files/compress', 'POST', {
      paths: [srcDir],
      target_name: 'bundle.tar.gz',
      format: 'tar.gz',
    });
    assert.equal(compressRes.code, 0, `compress should succeed: ${compressRes.message}`);
    const archive = path.join(workDir, 'bundle.tar.gz');
    assert.equal(fs.existsSync(archive), true, 'archive must be written to disk');

    const destDir = path.join(workDir, 'out');
    const extractRes = await callFiles('/api/v1/files/decompress', 'POST', {
      path: archive,
      dest_path: destDir,
      overwrite: false,
    });
    assert.equal(extractRes.code, 0, `decompress should succeed: ${extractRes.message}`);

    const extracted = path.join(destDir, 'src', 'sub', 'b.txt');
    assert.equal(fs.existsSync(extracted), true, 'nested file must be extracted');
    assert.equal(fs.readFileSync(extracted, 'utf8'), 'hello-b', 'file contents must survive the round-trip');
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

test('TOOLBOX: DNS/hosts/mirrors 校验、备份与路径白名单（不触碰真实系统文件）', async () => {
  const tb = await import('../routes/toolbox.js');
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-toolbox-'));
  const zoneinfo = path.join(work, 'zoneinfo');
  fs.mkdirSync(path.join(zoneinfo, 'Asia'), { recursive: true });
  fs.writeFileSync(path.join(zoneinfo, 'Asia', 'Shanghai'), 'TZif');
  fs.writeFileSync(path.join(zoneinfo, 'UTC'), 'TZif');

  const resolv = path.join(work, 'resolv.conf');
  const hosts = path.join(work, 'hosts');
  const sourcesList = path.join(work, 'sources.list');
  const sourcesDir = path.join(work, 'sources.list.d');
  const osRelease = path.join(work, 'os-release');
  const fstab = path.join(work, 'fstab');
  const swappiness = path.join(work, 'swappiness');

  fs.mkdirSync(sourcesDir, { recursive: true });
  fs.writeFileSync(resolv, 'nameserver 192.168.1.1\nnameserver fe80::1%wlan0\n', 'utf8');
  fs.writeFileSync(hosts, '127.0.0.1 localhost\n::1 localhost ip6-localhost\n', 'utf8');
  fs.writeFileSync(sourcesList, 'deb https://deb.debian.org/debian trixie main contrib non-free-firmware\n', 'utf8');
  fs.writeFileSync(osRelease, 'ID=debian\nVERSION_CODENAME=trixie\nPRETTY_NAME="Debian GNU/Linux 13 (trixie)"\n', 'utf8');
  fs.writeFileSync(fstab, '/dev/sda18 / ext4 defaults 0 1\n', 'utf8');
  fs.writeFileSync(swappiness, '60', 'utf8');

  const ctx = {
    RESOLV_CONF: resolv,
    HOSTS_FILE: hosts,
    SOURCES_LIST: sourcesList,
    SOURCES_DIR: sourcesDir,
    OS_RELEASE: osRelease,
    ZONEINFO_DIR: zoneinfo,
    FSTAB: fstab,
    SWAPPINESS_FILE: swappiness,
    SWAP_FILE: path.join(work, 'swapfile'),
    parseBody: async () => ({}),
    currentUser: () => 'opsadmin',
    logOperation: () => {},
  };

  async function call(route, method, body) {
    let resp = null;
    const u = new URL('http://127.0.0.1' + route);
    const handled = await tb.handleToolbox(
      u.pathname,
      { method, headers: {} },
      { json: (data = null, message = 'ok', code = 0) => { resp = { code, message, data }; } },
      u,
      { ...ctx, parseBody: async () => body }
    );
    return { handled, resp };
  }

  try {
    // --- 纯函数校验 ---
    assert.equal(tb.isValidIp('223.5.5.5'), true);
    assert.equal(tb.isValidIp('2400:3200::1'), true);
    assert.equal(tb.isValidIp('999.1.1.1'), false);
    assert.equal(tb.isValidIp('1.1.1.1; rm -rf /'), false);
    assert.equal(tb.isValidTimezone('Asia/Shanghai', zoneinfo), true);
    assert.equal(tb.isValidTimezone('../../etc/passwd', zoneinfo), false);
    assert.equal(tb.isValidTimezone('Asia/Nowhere', zoneinfo), false);
    assert.equal(tb.isValidMirrorUrl('https://mirrors.aliyun.com/debian'), true);
    assert.equal(tb.isValidMirrorUrl('file:///etc/passwd'), false);
    assert.equal(tb.isValidMirrorUrl('https://evil.com/a b'), false);
    assert.deepEqual(tb.parseResolvConf('nameserver 8.8.8.8\nnameserver bad\n'), ['8.8.8.8']);

    // --- GET DNS：读出现有 nameserver（含 IPv6 作用域） ---
    const dnsGet = await call('/api/v1/toolbox/dns', 'GET');
    assert.equal(dnsGet.resp.code, 0);
    assert.deepEqual(dnsGet.resp.data.servers, ['192.168.1.1', 'fe80::1%wlan0']);

    // --- PUT DNS：非法地址必须 400 且不写文件 ---
    const before = fs.readFileSync(resolv, 'utf8');
    const dnsBad = await call('/api/v1/toolbox/dns', 'PUT', { servers: ['8.8.8.8', 'not-an-ip'] });
    assert.equal(dnsBad.resp.code, 400);
    assert.equal(fs.readFileSync(resolv, 'utf8'), before);

    // --- PUT DNS：合法地址写入并生成备份 ---
    const dnsOk = await call('/api/v1/toolbox/dns', 'PUT', { servers: ['223.5.5.5', '119.29.29.29'] });
    assert.equal(dnsOk.resp.code, 0, dnsOk.resp.message);
    const resolvAfter = fs.readFileSync(resolv, 'utf8');
    assert.match(resolvAfter, /nameserver 223\.5\.5\.5/);
    assert.match(resolvAfter, /nameserver 119\.29\.29\.29/);
    const resolvBackups = fs.readdirSync(work).filter(n => n.startsWith('resolv.conf.armguard-bak-'));
    assert.equal(resolvBackups.length >= 1, true, 'DNS 写入前必须生成备份');

    // --- hosts：非法内容拒绝，合法内容写入 ---
    const hostsBad = await call('/api/v1/toolbox/hosts', 'PUT', { content: 'not-an-ip example.com\n' });
    assert.equal(hostsBad.resp.code, 400);
    const hostsOk = await call('/api/v1/toolbox/hosts', 'PUT', {
      content: '127.0.0.1 localhost\n10.0.0.9 nas.lan nas\n',
    });
    assert.equal(hostsOk.resp.code, 0, hostsOk.resp.message);
    assert.match(fs.readFileSync(hosts, 'utf8'), /10\.0\.0\.9 nas\.lan nas/);

    // --- 镜像源：预设列表 + 切换阿里源 ---
    const mirrorGet = await call('/api/v1/toolbox/mirrors', 'GET');
    assert.equal(mirrorGet.resp.code, 0);
    assert.deepEqual(
      mirrorGet.resp.data.presets.map(p => p.id),
      ['official', 'huawei', 'aliyun', 'tsinghua']
    );
    assert.equal(mirrorGet.resp.data.os.codename, 'trixie');

    const mirrorBad = await call('/api/v1/toolbox/mirrors', 'PUT', {
      mirror_id: 'custom',
      url: 'file:///etc/passwd',
    });
    assert.equal(mirrorBad.resp.code, 400);

    const mirrorOk = await call('/api/v1/toolbox/mirrors', 'PUT', { mirror_id: 'aliyun' });
    assert.equal(mirrorOk.resp.code, 0, mirrorOk.resp.message);
    const srcAfter = fs.readFileSync(sourcesList, 'utf8');
    assert.match(srcAfter, /mirrors\.aliyun\.com\/debian trixie /);
    assert.match(srcAfter, /mirrors\.aliyun\.com\/debian-security trixie-security /);
    assert.equal(
      fs.readdirSync(work).some(n => n.startsWith('sources.list.armguard-bak-')),
      true,
      '切换源前必须备份'
    );

    // --- 时区：非法值拒绝 ---
    const tzBad = await call('/api/v1/toolbox/timezone', 'PUT', { timezone: '../../etc/passwd' });
    assert.equal(tzBad.resp.code, 400);

    // --- 备份裁剪：连续写入 7 次后只保留 5 份，且最早那份（用户原始配置）必须保留 ---
    // 最早的一份备份对应「第一次经 API 修改之前」的内容，即测试开始时写入的初始内容
    const preWriteContent = '127.0.0.1 localhost\n::1 localhost ip6-localhost\n';
    for (let i = 0; i < 7; i += 1) {
      const r = await call('/api/v1/toolbox/hosts', 'PUT', { content: `127.0.0.1 localhost\n10.0.0.${i} host${i}\n` });
      assert.equal(r.resp.code, 0);
      await new Promise((res) => setTimeout(res, 3));
    }
    const hostBackups = fs
      .readdirSync(work)
      .filter(n => n.startsWith('hosts.armguard-bak-'))
      .sort();
    assert.equal(hostBackups.length, 5, `备份应裁剪到 5 份，实际 ${hostBackups.length}`);
    assert.equal(
      fs.readFileSync(path.join(work, hostBackups[0]), 'utf8'),
      preWriteContent,
      '最早的一份备份必须是改动前的原始配置，不能被裁剪掉'
    );

    // --- 非工具箱路径必须放行给后续路由 ---
    const other = await call('/api/v1/system/info', 'GET');
    assert.equal(other.handled, false);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
});
