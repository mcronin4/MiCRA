# Storage — R2 & Local Artifacts

## Purpose
This module owns two storage backends: Cloudflare R2 (production) and a
local filesystem artifact store (development). It does NOT own file metadata
persistence in Supabase (that is `api/v1/files.py`), nor presigned URL
generation for workflow bucket node outputs (that is done directly in
`services/workflow_executor.py`, bypassing this module).

## Architecture
`r2.py` exports a `get_r2() -> R2Client` singleton used by `api/v1/files.py`
for upload, download, and listing. `local_artifacts.py` is activated when
`ARTIFACT_BACKEND=local` and provides a filesystem-backed store used in
development and testing without cloud credentials.

The executor (`services/workflow_executor.py`) bypasses `R2Client.sign_path()`
and calls `r2.client.generate_presigned_url()` directly via `ThreadPoolExecutor`
for parallel URL signing. This is intentional for performance and is the only
place the raw boto3 client is used directly.

## Contracts
- `R2_BUCKET = "micra"` is a hardcoded constant exported from `r2.py` and
  imported in `api/v1/files.py` and the executor. Changing the bucket name
  requires updating every import site.
- R2 env vars: `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.
- Local backend env vars: `ARTIFACT_BACKEND` (set to `"local"` to activate),
  `ARTIFACTS_DIR` (default: `.artifacts/` relative to process CWD),
  `ARTIFACTS_RUN_ID` (optional subdirectory per run).
- `write_artifact(data, mime, name, metadata) -> dict` returns a dict with
  `id`, `name`, `mime`, `size`, `sha256`, `path`, `metadata`, `created_at`.
  The `id` is a UUID used as the artifact key for subsequent reads.

## Pitfalls
- The local artifact store writes to `.artifacts/` relative to the working
  directory of the running process. If the backend is started from outside
  `backend/`, artifacts land in an unexpected path and may not be found on
  subsequent reads. Always start the backend from `backend/` or set
  `ARTIFACTS_DIR` explicitly.
- `R2Client.sign_path()` and the executor's direct `generate_presigned_url()`
  call use different code paths. If you need to change signing behavior (e.g.
  expiry duration), you must update both places.
- There is no automatic failover between R2 and local — the backend selects one
  at startup based on `ARTIFACT_BACKEND`. There is no mixed-mode operation.
- The R2 singleton is pre-warmed at startup by `main.py`. R2 credential errors
  surface at startup, not at the first upload attempt.
