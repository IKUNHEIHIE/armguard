import os
import tarfile
import zipfile
import shutil

base_dir = r"D:\admin\desktop\codex\panel"
release_dir = os.path.join(base_dir, "release")
os.makedirs(release_dir, exist_ok=True)

tar_path = os.path.join(release_dir, "armguard-panel-v0.1.0.tar.gz")
zip_path = os.path.join(release_dir, "armguard-panel-v0.1.0.zip")

print("Creating standalone distribution package...")

# Files and folders to include
items_to_pack = [
    ("frontend/dist", "dist"),
    ("backend", "backend"),
    ("backend/templates", "templates"),
    ("backend/scripts/install.sh", "install.sh"),
    ("package.json", "package.json")
]

with tarfile.open(tar_path, "w:gz") as tar:
    for src_rel, dest_rel in items_to_pack:
        full_src = os.path.join(base_dir, src_rel)
        if os.path.exists(full_src):
            print(f"Adding {src_rel} -> {dest_rel}")
            tar.add(full_src, arcname=os.path.join("armguard", dest_rel))

with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
    for src_rel, dest_rel in items_to_pack:
        full_src = os.path.join(base_dir, src_rel)
        if os.path.isdir(full_src):
            for root, _, files in os.walk(full_src):
                for f in files:
                    file_full = os.path.join(root, f)
                    rel = os.path.relpath(file_full, full_src)
                    zipf.write(file_full, arcname=os.path.join("armguard", dest_rel, rel))
        elif os.path.isfile(full_src):
            zipf.write(full_src, arcname=os.path.join("armguard", dest_rel))

print("[SUCCESS] Packages created successfully:")
print("Tarball:", tar_path, f"({os.path.getsize(tar_path) / 1024 / 1024:.2f} MB)")
print("Zip archive:", zip_path, f"({os.path.getsize(zip_path) / 1024 / 1024:.2f} MB)")
