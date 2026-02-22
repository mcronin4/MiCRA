"""
Dev-local artifact storage backend.

Activated by env var ARTIFACT_BACKEND=local.
Stores artifacts under .artifacts/ at the repo root.
Provides the same interface shape (IDs, mime, size, read/write) as R2+Supabase
so that workflow executors can work without cloud dependencies.
"""

from __future__ import annotations

import hashlib
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional


_ARTIFACTS_ROOT: Path | None = None


def _root() -> Path:
    global _ARTIFACTS_ROOT
    if _ARTIFACTS_ROOT is None:
        env = os.getenv("ARTIFACTS_DIR")
        if env:
            _ARTIFACTS_ROOT = Path(env)
        else:
            # Default: repo_root/.artifacts
            _ARTIFACTS_ROOT = Path(__file__).resolve().parents[3] / ".artifacts"
    _ARTIFACTS_ROOT.mkdir(parents=True, exist_ok=True)
    return _ARTIFACTS_ROOT


def _run_dir() -> Path | None:
    """Return a per-run subdirectory when ARTIFACTS_RUN_ID is set."""
    run_id = os.getenv("ARTIFACTS_RUN_ID")
    if run_id:
        d = _root() / run_id
        d.mkdir(parents=True, exist_ok=True)
        return d
    return None


def _write_dir() -> Path:
    """Return the directory to write new artifacts into."""
    return _run_dir() or _root()


def _meta_path(artifact_id: str) -> Path:
    return _write_dir() / f"{artifact_id}.meta.json"


def _find_meta(artifact_id: str) -> Path | None:
    """Find a meta.json for an artifact ID, searching current dir then all subdirs."""
    # Check current write dir first
    p = _write_dir() / f"{artifact_id}.meta.json"
    if p.exists():
        return p
    # Check root (flat layout)
    p = _root() / f"{artifact_id}.meta.json"
    if p.exists():
        return p
    # Search all subdirectories
    for p in _root().rglob(f"{artifact_id}.meta.json"):
        return p
    return None


def _blob_path(artifact_id: str, ext: str = "", name: str = "") -> Path:
    d = _write_dir()
    # In run dirs, use the friendly name when available
    if _run_dir() and name:
        return d / name
    return d / f"{artifact_id}{ext}"


# ---- public API -----------------------------------------------------------

def write_artifact(
    data: bytes,
    mime: str,
    name: str = "",
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Write bytes to the local artifact store.

    Returns a metadata dict with: id, name, mime, size, sha256, path, created_at.
    """
    artifact_id = str(uuid.uuid4())
    sha = hashlib.sha256(data).hexdigest()

    # Determine file extension from mime
    ext_map = {
        "video/mp4": ".mp4",
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "audio/mpeg": ".mp3",
        "audio/wav": ".wav",
        "application/json": ".json",
        "text/plain": ".txt",
    }
    ext = ext_map.get(mime, "")

    blob = _blob_path(artifact_id, ext, name=name)
    blob.write_bytes(data)

    meta = {
        "id": artifact_id,
        "name": name or blob.name,
        "mime": mime,
        "size": len(data),
        "sha256": sha,
        "path": str(blob),
        "metadata": metadata or {},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _meta_path(artifact_id).write_text(json.dumps(meta, indent=2))
    return meta


def read_artifact(artifact_id: str) -> tuple[bytes, dict[str, Any]]:
    """
    Read artifact bytes and metadata by ID.

    Returns (data_bytes, metadata_dict).
    Raises FileNotFoundError if the artifact does not exist.
    """
    meta_file = _find_meta(artifact_id)
    if meta_file is None:
        raise FileNotFoundError(f"Artifact {artifact_id} not found")

    meta = json.loads(meta_file.read_text())
    blob = Path(meta["path"])
    if not blob.exists():
        raise FileNotFoundError(f"Artifact blob missing: {blob}")

    return blob.read_bytes(), meta


def read_artifact_meta(artifact_id: str) -> dict[str, Any]:
    """Read only the metadata for an artifact."""
    meta_file = _find_meta(artifact_id)
    if meta_file is None:
        raise FileNotFoundError(f"Artifact {artifact_id} not found")
    return json.loads(meta_file.read_text())


def list_artifacts() -> list[dict[str, Any]]:
    """List all artifact metadata entries (searches root and all run subdirs)."""
    results = []
    for p in _root().rglob("*.meta.json"):
        results.append(json.loads(p.read_text()))
    results.sort(key=lambda m: m.get("created_at", ""))
    return results


def is_local_backend() -> bool:
    """Return True if ARTIFACT_BACKEND is set to 'local'."""
    return os.getenv("ARTIFACT_BACKEND", "").lower() == "local"
