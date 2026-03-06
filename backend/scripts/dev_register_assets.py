#!/usr/bin/env python3
"""
Register files from local_test_assets/ as local artifacts.

Usage:
    ARTIFACT_BACKEND=local python backend/scripts/dev_register_assets.py

Reads all supported files from local_test_assets/ (at repo root),
writes them into the local artifact store (.artifacts/), and prints
a JSON mapping of filename -> artifact ID.

Supported types: .jpg, .jpeg, .png, .webp, .txt
"""

import json
import mimetypes
import os
import sys
from pathlib import Path

# Ensure backend is on sys.path
_backend = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_backend))

os.environ.setdefault("ARTIFACT_BACKEND", "local")

from app.storage.local_artifacts import write_artifact, is_local_backend

SUPPORTED_EXT = {".jpg", ".jpeg", ".png", ".webp", ".txt"}
ASSETS_DIR = _backend.parent / "local_test_assets"


def main():
    if not is_local_backend():
        print("ERROR: Set ARTIFACT_BACKEND=local to use local artifact storage.")
        sys.exit(1)

    if not ASSETS_DIR.exists():
        print(f"ERROR: {ASSETS_DIR} does not exist.")
        print("Create it and add your images / transcript files. Example:")
        print("  mkdir local_test_assets")
        print("  # Add 1-6 .jpg/.png images + optional transcript.txt")
        sys.exit(1)

    files = sorted(
        p for p in ASSETS_DIR.iterdir()
        if p.is_file() and p.suffix.lower() in SUPPORTED_EXT
    )

    if not files:
        print(f"No supported files in {ASSETS_DIR}")
        print(f"Add .jpg/.png/.webp images or .txt files.")
        sys.exit(1)

    mapping: dict[str, str] = {}

    for fp in files:
        mime, _ = mimetypes.guess_type(str(fp))
        if mime is None:
            mime = "application/octet-stream"
        data = fp.read_bytes()
        meta = write_artifact(data=data, mime=mime, name=fp.name)
        mapping[fp.name] = meta["id"]
        print(f"  Registered: {fp.name} -> {meta['id']}  ({meta['size']} bytes, {mime})")

    print()
    print("=== Artifact mapping ===")
    print(json.dumps(mapping, indent=2))
    print()
    print(f"Total: {len(mapping)} artifact(s) registered.")
    print(f"Stored in: {Path(os.environ.get('ARTIFACTS_DIR', str(_backend.parent / '.artifacts')))}")


if __name__ == "__main__":
    main()
