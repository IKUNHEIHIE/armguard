#!/usr/bin/env node
/**
 * 生成可发布的发行包：release/armguard-panel-v<版本>.tar.gz
 *
 * 包内结构（install.sh 依赖这个布局）：
 *   armguard-panel/
 *     backend/       后端源码
 *     dist/          前端构建产物
 *     node_modules/  仅运行期依赖（ws）
 *     package.json
 *     BUILD_COMMIT
 *     VERSION
 *     install.sh
 *
 * 用法：node backend/scripts/package_release.mjs [--version 0.2.0]
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(ROOT, 'release');
const STAGE_ROOT = path.join(ROOT, '.release-stage');
const PKG_NAME = 'armguard-panel';

const args = process.argv.slice(2);
let version = null;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--version' && args[i + 1]) version = args[++i];
}
if (!version) {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  version = pkg.version;
}

function log(msg) {
  console.log(`[package] ${msg}`);
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isSymbolicLink()) {
      fs.symlinkSync(fs.readlinkSync(s), d);
    } else if (e.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

// ---- 1. 前置检查 ----
const distIndex = path.join(ROOT, 'frontend/dist/index.html');
if (!fs.existsSync(distIndex)) {
  log('未找到 frontend/dist，先构建前端...');
  execFileSync('npm', ['--prefix', 'frontend', 'run', 'build'], { cwd: ROOT, stdio: 'inherit', shell: true });
}

const wsPkg = path.join(ROOT, 'node_modules/ws/package.json');
if (!fs.existsSync(wsPkg)) {
  log('缺少运行期依赖 ws，执行 npm ci --omit=dev ...');
  execFileSync('npm', ['ci', '--omit=dev'], { cwd: ROOT, stdio: 'inherit', shell: true });
}

let commit = 'unknown';
try {
  commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
} catch {}

// ---- 2. 组装暂存目录 ----
fs.rmSync(STAGE_ROOT, { recursive: true, force: true });
const stage = path.join(STAGE_ROOT, PKG_NAME);
fs.mkdirSync(stage, { recursive: true });

log('复制 backend/');
copyDir(path.join(ROOT, 'backend'), path.join(stage, 'backend'));
log('复制 dist/');
copyDir(path.join(ROOT, 'frontend/dist'), path.join(stage, 'dist'));
log('复制 node_modules/ws');
copyDir(path.join(ROOT, 'node_modules/ws'), path.join(stage, 'node_modules/ws'));
fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(stage, 'package.json'));
for (const sh of ['install.sh', 'ag.sh']) {
  const src = path.join(ROOT, sh);
  if (!fs.existsSync(src)) continue;
  fs.copyFileSync(src, path.join(stage, sh));
  fs.chmodSync(path.join(stage, sh), 0o755);
}
fs.writeFileSync(path.join(stage, 'BUILD_COMMIT'), commit);
fs.writeFileSync(path.join(stage, 'VERSION'), version);

// ---- 3. 打包 ----
fs.mkdirSync(OUT_DIR, { recursive: true });
const tarball = path.join(OUT_DIR, `${PKG_NAME}-v${version}.tar.gz`);
fs.rmSync(tarball, { force: true });
// 用相对路径 + cwd：Windows 上 GNU tar 会把 "D://..." 当成远程主机名
const tarRel = path.relative(ROOT, tarball).split(path.sep).join('/');
const stageRel = path.relative(ROOT, STAGE_ROOT).split(path.sep).join('/');
execFileSync('tar', ['-czf', tarRel, '-C', stageRel, PKG_NAME], { cwd: ROOT, stdio: 'inherit' });

// ---- 4. 生成校验和 ----
const sha = execFileSync('sha256sum', [tarRel], { cwd: ROOT, encoding: 'utf8' }).trim().split(/\s+/)[0];
fs.writeFileSync(`${tarball}.sha256`, `${sha}  ${path.basename(tarball)}\n`);

const sizeMb = (fs.statSync(tarball).size / 1024 / 1024).toFixed(2);
fs.rmSync(STAGE_ROOT, { recursive: true, force: true });

log(`完成: ${path.relative(ROOT, tarball)} (${sizeMb} MB)`);
log(`版本: v${version} | 提交: ${commit}`);
log(`SHA256: ${sha}`);
