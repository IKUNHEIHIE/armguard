#!/usr/bin/env node
/**
 * 生成 Material Symbols 图标字体子集。
 *
 * 为什么需要这个脚本：
 * 面板从 fonts.googleapis.com 拉图标字体在国内/内网经常失败，一旦失败就回退旧字体，
 * 而 deployed_code / database / check_circle 这些较新的图标名在旧字体里不存在 → 显示为空白或残缺文字。
 * 所以把用到的图标做成子集自托管。
 *
 * 之前踩过的坑：只扫描模板里的 `<mat-icon>name</mat-icon>` 会漏掉 TS 里动态返回的图标名
 * （例如任务中心 stageIcon() 返回 'downloading' / 'check_circle'），导致那些图标仍然空白。
 * 本脚本会同时扫描：模板标签、icon: 'x' / icon="x"、以及函数 return 的图标名。
 *
 * 用法：node frontend/scripts/build-icon-font.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(__dirname, '../src');
const OUT_FILE = path.resolve(__dirname, '../public/fonts/material-symbols-outlined.woff');

// 兜底清单：动态拼接、后端下发或容易被扫描漏掉的图标
const EXTRA_ICONS = [
  'check_circle', 'downloading', 'progress_activity', 'layers', 'error_outline',
  'info_outline', 'warning_amber', 'help_outline', 'gpp_maybe', 'sync_problem',
  'cloud_off', 'cloud_sync', 'deployed_code', 'database', 'folder_zip', 'handyman',
  'space_dashboard', 'settings_applications', 'arrow_upward', 'delete_forever'
];

// 常见非图标单词，避免把类名/键名误当图标请求
const STOP = new Set([
  'true', 'false', 'null', 'undefined', 'string', 'number', 'boolean', 'object',
  'primary', 'accent', 'warn', 'danger', 'warning', 'success', 'info', 'neutral',
  'static', 'proxy', 'php', 'installed', 'done', 'failed', 'installing', 'running',
  'start', 'stop', 'restart', 'reload', 'get', 'post', 'put', 'delete', 'patch',
  'lg', 'md', 'sm', 'xl', 'asc', 'desc', 'all', 'none', 'auto', 'default'
]);

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(ts|html)$/.test(e.name) && !e.name.endsWith('.spec.ts')) acc.push(p);
  }
  return acc;
}

const names = new Set(EXTRA_ICONS);

for (const file of walk(SRC_DIR)) {
  const text = fs.readFileSync(file, 'utf8');

  // 1. <mat-icon ...>name</mat-icon>（允许中间有换行/空白）
  for (const m of text.matchAll(/<mat-icon[^>]*>\s*([a-z][a-z0-9_]{2,40})\s*<\/mat-icon>/g)) {
    names.add(m[1]);
  }
  // 2. icon: 'name' / icon="name"
  for (const m of text.matchAll(/\bicon(?:Name)?\s*[:=]\s*['"]([a-z][a-z0-9_]{2,40})['"]/g)) {
    names.add(m[1]);
  }
  // 3. 函数里 return 'name'（任务中心 stageIcon 这类动态图标）
  for (const m of text.matchAll(/return\s+['"]([a-z][a-z0-9_]{2,40})['"]/g)) {
    names.add(m[1]);
  }
  // 4. 三元/短路里的图标名：? 'a' : 'b'
  for (const m of text.matchAll(/\?\s*['"]([a-z][a-z0-9_]{2,40})['"]\s*:\s*['"]([a-z][a-z0-9_]{2,40})['"]/g)) {
    names.add(m[1]);
    names.add(m[2]);
  }
}

const icons = [...names].filter(n => !STOP.has(n)).sort();
console.log(`扫描到 ${icons.length} 个候选图标名`);

const url =
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0' +
  `&icon_names=${icons.join(',')}`;
console.log('请求 URL 长度:', url.length);

const UA = 'Mozilla/5.0 (Windows NT 6.1; rv:27.0) Gecko/20100101 Firefox/27.0'; // 拿 woff，体积小
const cssRes = await fetch(url, { headers: { 'User-Agent': UA } });
if (!cssRes.ok) {
  console.error(`获取字体 CSS 失败: HTTP ${cssRes.status}`);
  process.exit(1);
}
const css = await cssRes.text();
const srcMatch = css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/);
if (!srcMatch) {
  console.error('CSS 中未找到字体地址');
  process.exit(1);
}
const fontRes = await fetch(srcMatch[1], { headers: { 'User-Agent': UA } });
if (!fontRes.ok) {
  console.error(`下载字体失败: HTTP ${fontRes.status}`);
  process.exit(1);
}
const buf = Buffer.from(await fontRes.arrayBuffer());
fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, buf);
console.log(`已写入 ${path.relative(process.cwd(), OUT_FILE)} (${(buf.length / 1024).toFixed(1)} KB)`);
console.log('图标清单:', icons.join(','));
