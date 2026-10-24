import io
import os
import subprocess
import sys
import tarfile
import time
import zipfile

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
release_dir = os.path.join(base_dir, "release")
os.makedirs(release_dir, exist_ok=True)

tar_path = os.path.join(release_dir, "armguard-panel-v0.1.0.tar.gz")
zip_path = os.path.join(release_dir, "armguard-panel-v0.1.0.zip")

npm_cmd = "npm.cmd" if os.name == "nt" else "npm"

dist_index = os.path.join(base_dir, "frontend", "dist", "index.html")
if not os.path.isfile(dist_index):
    print("[INFO] frontend/dist/index.html not found; building frontend...")
    subprocess.run([npm_cmd, "--prefix", os.path.join(base_dir, "frontend"), "run", "build"], cwd=base_dir, check=True)

ws_pkg = os.path.join(base_dir, "node_modules", "ws", "package.json")
if not os.path.isfile(ws_pkg):
    print("[INFO] node_modules/ws not found; installing production dependencies...")
    subprocess.run([npm_cmd, "ci", "--omit=dev"], cwd=base_dir, check=True)

print(f"Creating standalone distribution packages from {base_dir}...")

build_commit = "unknown"
try:
    git_res = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"],
        cwd=base_dir,
        capture_output=True,
        text=True,
        timeout=5,
    )
    if git_res.returncode == 0 and git_res.stdout.strip():
        build_commit = git_res.stdout.strip()
except Exception:
    pass
commit_bytes = (build_commit + "\n").encode("utf-8")

items_to_pack = [
    ("frontend/dist", "dist"),
    ("backend", "backend"),
    ("backend/templates", "templates"),
    ("backend/scripts/install.sh", "install.sh"),
    ("package.json", "package.json"),
    ("package-lock.json", "package-lock.json"),
    ("node_modules", "node_modules"),
    ("README.md", "README.md"),
]

SKIP_DIRS = {"__pycache__", ".git", ".pytest_cache"}
SKIP_EXTS = {".pyc", ".pyo"}
TEXT_LF_EXTS = {".sh", ".js", ".mjs", ".cjs", ".json", ".md", ".conf", ".service", ".py"}
EXEC_EXTS = {".sh"}


def should_skip(path_str: str) -> bool:
    parts = set(os.path.normpath(path_str).split(os.sep))
    if parts & SKIP_DIRS:
        return True
    _, ext = os.path.splitext(path_str)
    return ext.lower() in SKIP_EXTS


def read_normalized_bytes(src_path: str):
    _, ext = os.path.splitext(src_path)
    is_exec = ext.lower() in EXEC_EXTS or os.path.basename(src_path) in {"reset_admin.js"}
    with open(src_path, "rb") as f:
        raw = f.read()
    if ext.lower() in TEXT_LF_EXTS:
        raw = raw.replace(b"\r\n", b"\n")
    return raw, is_exec


def iter_files(src_rel: str, dest_rel: str):
    full_src = os.path.join(base_dir, src_rel)
    if not os.path.exists(full_src):
        raise FileNotFoundError(f"Required release input missing: {full_src}")
    if os.path.isfile(full_src):
        if not should_skip(full_src):
            yield full_src, os.path.join("armguard", dest_rel).replace("\\", "/")
    else:
        for root, dirs, files in os.walk(full_src):
            dirs[:] = [d for d in sorted(dirs) if d not in SKIP_DIRS]
            for f in sorted(files):
                file_full = os.path.join(root, f)
                if should_skip(file_full):
                    continue
                rel = os.path.relpath(file_full, full_src)
                arcname = os.path.join("armguard", dest_rel, rel).replace("\\", "/")
                yield file_full, arcname


with tarfile.open(tar_path, "w:gz") as tar:
    for src_rel, dest_rel in items_to_pack:
        print(f"Adding {src_rel} -> armguard/{dest_rel}")
        for file_full, arcname in iter_files(src_rel, dest_rel):
            data, is_exec = read_normalized_bytes(file_full)
            info = tarfile.TarInfo(name=arcname)
            info.size = len(data)
            info.mtime = int(os.path.getmtime(file_full))
            info.mode = 0o755 if is_exec else 0o644
            tar.addfile(info, io.BytesIO(data))
    commit_info = tarfile.TarInfo(name="armguard/BUILD_COMMIT")
    commit_info.size = len(commit_bytes)
    commit_info.mtime = int(time.time())
    commit_info.mode = 0o644
    tar.addfile(commit_info, io.BytesIO(commit_bytes))

with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
    for src_rel, dest_rel in items_to_pack:
        for file_full, arcname in iter_files(src_rel, dest_rel):
            data, is_exec = read_normalized_bytes(file_full)
            mtime = time.localtime(os.path.getmtime(file_full))[:6]
            zinfo = zipfile.ZipInfo(filename=arcname, date_time=mtime)
            zinfo.compress_type = zipfile.ZIP_DEFLATED
            perm = 0o755 if is_exec else 0o644
            zinfo.external_attr = (0o100000 | perm) << 16
            zipf.writestr(zinfo, data)
    zipf.writestr("armguard/BUILD_COMMIT", commit_bytes)

print("[SUCCESS] Packages created successfully:")
print("Tarball:", tar_path, f"({os.path.getsize(tar_path) / 1024 / 1024:.2f} MB)")
print("Zip archive:", zip_path, f"({os.path.getsize(zip_path) / 1024 / 1024:.2f} MB)")
