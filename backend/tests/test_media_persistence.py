"""
Tests for media persistence helpers:
- _offload_generated_media  (workflow_executor.py)
- _refresh_media_urls       (workflows.py)
"""

import base64
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch, call

import pytest

backend_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_root))

from app.services.workflow_executor import _offload_generated_media
from app.api.v1.workflows import _refresh_media_urls


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_jpeg_b64(size: int = 16) -> str:
    """Return a small valid base64 JPEG data URL."""
    raw = bytes([0xFF, 0xD8, 0xFF] + [0x00] * size)  # minimal JPEG-ish bytes
    return "data:image/jpeg;base64," + base64.b64encode(raw).decode()


def _make_png_b64() -> str:
    raw = bytes([0x89, 0x50, 0x4E, 0x47] + [0x00] * 12)
    return "data:image/png;base64," + base64.b64encode(raw).decode()


# ---------------------------------------------------------------------------
# Tests for _offload_generated_media
# ---------------------------------------------------------------------------

class TestOffloadGeneratedMedia:

    def _mock_r2(self):
        r2 = MagicMock()
        r2.upload_bytes = MagicMock()
        return r2

    def test_replaces_jpeg_base64_with_r2_sentinel(self):
        """base64 JPEG should be uploaded and replaced with r2:// sentinel."""
        r2 = self._mock_r2()
        b64 = _make_jpeg_b64()
        node_outputs = {"node-1": {"generated_image": b64}}

        with patch("app.storage.r2.get_r2", return_value=r2):
            _offload_generated_media(node_outputs, "exec-abc")

        sentinel = node_outputs["node-1"]["generated_image"]
        assert sentinel == "r2://runs/exec-abc/node-1/generated_image.jpg"
        r2.upload_bytes.assert_called_once()
        args = r2.upload_bytes.call_args
        assert args[0][0] == "runs/exec-abc/node-1/generated_image.jpg"
        assert args[0][2] == "image/jpeg"

    def test_replaces_png_base64_with_correct_extension(self):
        """PNG mime type should produce a .png path."""
        r2 = self._mock_r2()
        b64 = _make_png_b64()
        node_outputs = {"n": {"generated_image": b64}}

        with patch("app.storage.r2.get_r2", return_value=r2):
            _offload_generated_media(node_outputs, "exec-xyz")

        assert node_outputs["n"]["generated_image"] == "r2://runs/exec-xyz/n/generated_image.png"

    def test_leaves_non_base64_strings_unchanged(self):
        """Plain text outputs must not be touched."""
        r2 = self._mock_r2()
        node_outputs = {"n": {"generated_text": "hello world"}}

        with patch("app.storage.r2.get_r2", return_value=r2):
            _offload_generated_media(node_outputs, "exec-1")

        assert node_outputs["n"]["generated_text"] == "hello world"
        r2.upload_bytes.assert_not_called()

    def test_leaves_r2_sentinels_unchanged(self):
        """Already-offloaded sentinels must not be re-processed."""
        r2 = self._mock_r2()
        sentinel = "r2://runs/exec-1/n/generated_image.jpg"
        node_outputs = {"n": {"generated_image": sentinel}}

        with patch("app.storage.r2.get_r2", return_value=r2):
            _offload_generated_media(node_outputs, "exec-1")

        assert node_outputs["n"]["generated_image"] == sentinel
        r2.upload_bytes.assert_not_called()

    def test_leaves_presigned_urls_unchanged(self):
        """Presigned R2 URLs (https://...) must not be touched."""
        r2 = self._mock_r2()
        url = "https://example.r2.cloudflarestorage.com/some/path?X-Amz-Signature=abc"
        node_outputs = {"n": {"images": [url]}}

        with patch("app.storage.r2.get_r2", return_value=r2):
            _offload_generated_media(node_outputs, "exec-1")

        assert node_outputs["n"]["images"] == [url]
        r2.upload_bytes.assert_not_called()

    def test_upload_failure_keeps_original_base64(self):
        """If R2 upload fails, the original base64 value must be preserved."""
        r2 = self._mock_r2()
        r2.upload_bytes.side_effect = RuntimeError("network error")
        b64 = _make_jpeg_b64()
        node_outputs = {"n": {"generated_image": b64}}

        with patch("app.storage.r2.get_r2", return_value=r2):
            _offload_generated_media(node_outputs, "exec-1")  # must not raise

        assert node_outputs["n"]["generated_image"] == b64  # unchanged

    def test_handles_non_dict_outputs(self):
        """Non-dict node outputs must be skipped without error."""
        r2 = self._mock_r2()
        node_outputs = {"n": None, "m": "string", "k": [1, 2, 3]}

        with patch("app.storage.r2.get_r2", return_value=r2):
            _offload_generated_media(node_outputs, "exec-1")  # must not raise

        r2.upload_bytes.assert_not_called()

    def test_handles_multiple_nodes(self):
        """Each node's base64 output is uploaded under its own R2 path."""
        r2 = self._mock_r2()
        b64a = _make_jpeg_b64()
        b64b = _make_jpeg_b64()
        node_outputs = {
            "nodeA": {"generated_image": b64a},
            "nodeB": {"generated_image": b64b},
        }

        with patch("app.storage.r2.get_r2", return_value=r2):
            _offload_generated_media(node_outputs, "exec-multi")

        assert node_outputs["nodeA"]["generated_image"] == "r2://runs/exec-multi/nodeA/generated_image.jpg"
        assert node_outputs["nodeB"]["generated_image"] == "r2://runs/exec-multi/nodeB/generated_image.jpg"
        assert r2.upload_bytes.call_count == 2

    def test_r2_client_unavailable_does_not_raise(self):
        """If R2 is completely unavailable, the function exits silently."""
        node_outputs = {"n": {"generated_image": _make_jpeg_b64()}}

        with patch("app.storage.r2.get_r2", side_effect=RuntimeError("no R2")):
            _offload_generated_media(node_outputs, "exec-1")  # must not raise


# ---------------------------------------------------------------------------
# Tests for _refresh_media_urls
# ---------------------------------------------------------------------------

class TestRefreshMediaUrls:

    def _mock_r2(self, signed_url="https://fresh.example.com/signed"):
        r2 = MagicMock()
        r2.sign_path = MagicMock(return_value=signed_url)
        return r2

    def _mock_supabase(self, file_records):
        """
        Build a mock supabase client whose files.select().in_().eq().execute()
        returns the given file_records list.
        """
        mock_execute = MagicMock()
        mock_execute.data = file_records

        mock_eq = MagicMock()
        mock_eq.execute = MagicMock(return_value=mock_execute)

        mock_in = MagicMock()
        mock_in.eq = MagicMock(return_value=mock_eq)

        mock_select = MagicMock()
        mock_select.in_ = MagicMock(return_value=mock_in)

        mock_table = MagicMock()
        mock_table.select = MagicMock(return_value=mock_select)

        supabase = MagicMock()
        supabase.table = MagicMock(return_value=mock_table)
        return supabase

    # ── Bucket node re-signing ─────────────────────────────────────────────

    def test_image_bucket_urls_replaced_with_fresh_signed(self):
        """Stale ImageBucket URLs are replaced with fresh signed URLs."""
        file_id = "file-uuid-1"
        r2 = self._mock_r2("https://fresh.example.com/image.jpg")
        supabase = self._mock_supabase([
            {"id": file_id, "path": "users/u1/images/abc.jpg", "status": "uploaded"}
        ])

        blueprint_snapshot_raw = {
            "nodes": [
                {"node_id": "node-img", "type": "ImageBucket",
                 "params": {"selected_file_ids": [file_id]}}
            ]
        }
        node_outputs = {
            "node-img": {"images": ["https://expired.example.com/old"]}
        }

        with patch("app.storage.r2.get_r2", return_value=r2):
            _refresh_media_urls(node_outputs, blueprint_snapshot_raw, "user-1", supabase)

        assert node_outputs["node-img"]["images"] == ["https://fresh.example.com/image.jpg"]
        r2.sign_path.assert_called_once_with("users/u1/images/abc.jpg", expires_in=3600)

    def test_audio_bucket_urls_replaced(self):
        """AudioBucket outputs are re-signed."""
        file_id = "audio-file-1"
        r2 = self._mock_r2("https://fresh.example.com/audio.mp3")
        supabase = self._mock_supabase([
            {"id": file_id, "path": "users/u1/audio/song.mp3", "status": "uploaded"}
        ])
        blueprint_snapshot_raw = {
            "nodes": [
                {"node_id": "node-audio", "type": "AudioBucket",
                 "params": {"selected_file_ids": [file_id]}}
            ]
        }
        node_outputs = {"node-audio": {"audio": ["https://expired.example.com/old"]}}

        with patch("app.storage.r2.get_r2", return_value=r2):
            _refresh_media_urls(node_outputs, blueprint_snapshot_raw, "user-1", supabase)

        assert node_outputs["node-audio"]["audio"] == ["https://fresh.example.com/audio.mp3"]

    def test_video_bucket_urls_replaced(self):
        """VideoBucket outputs are re-signed."""
        file_id = "video-file-1"
        r2 = self._mock_r2("https://fresh.example.com/video.mp4")
        supabase = self._mock_supabase([
            {"id": file_id, "path": "users/u1/videos/clip.mp4", "status": "uploaded"}
        ])
        blueprint_snapshot_raw = {
            "nodes": [
                {"node_id": "node-vid", "type": "VideoBucket",
                 "params": {"selected_file_ids": [file_id]}}
            ]
        }
        node_outputs = {"node-vid": {"videos": ["https://expired.example.com/old"]}}

        with patch("app.storage.r2.get_r2", return_value=r2):
            _refresh_media_urls(node_outputs, blueprint_snapshot_raw, "user-1", supabase)

        assert node_outputs["node-vid"]["videos"] == ["https://fresh.example.com/video.mp4"]

    def test_multiple_file_ids_all_signed(self):
        """All file IDs in selected_file_ids get fresh URLs, in order."""
        r2 = MagicMock()
        r2.sign_path = MagicMock(side_effect=lambda p, **_: f"https://fresh/{p}")

        supabase = self._mock_supabase([
            {"id": "f1", "path": "users/u/images/f1.jpg", "status": "uploaded"},
            {"id": "f2", "path": "users/u/images/f2.jpg", "status": "uploaded"},
        ])
        blueprint_snapshot_raw = {
            "nodes": [
                {"node_id": "n", "type": "ImageBucket",
                 "params": {"selected_file_ids": ["f1", "f2"]}}
            ]
        }
        node_outputs = {"n": {"images": ["https://expired/1", "https://expired/2"]}}

        with patch("app.storage.r2.get_r2", return_value=r2):
            _refresh_media_urls(node_outputs, blueprint_snapshot_raw, "user-1", supabase)

        assert node_outputs["n"]["images"] == [
            "https://fresh/users/u/images/f1.jpg",
            "https://fresh/users/u/images/f2.jpg",
        ]

    def test_deleted_file_skipped(self):
        """Files with status != 'uploaded' are skipped."""
        r2 = self._mock_r2()
        supabase = self._mock_supabase([
            {"id": "f1", "path": "users/u/images/f1.jpg", "status": "deleted"}
        ])
        blueprint_snapshot_raw = {
            "nodes": [
                {"node_id": "n", "type": "ImageBucket",
                 "params": {"selected_file_ids": ["f1"]}}
            ]
        }
        node_outputs = {"n": {"images": ["https://expired"]}}

        with patch("app.storage.r2.get_r2", return_value=r2):
            _refresh_media_urls(node_outputs, blueprint_snapshot_raw, "user-1", supabase)

        # Deleted file produces no signed URL → list is cleared (don't show broken images)
        assert node_outputs["n"]["images"] == []
        r2.sign_path.assert_not_called()

    def test_node_not_in_outputs_skipped(self):
        """Bucket nodes absent from node_outputs are skipped without error."""
        r2 = self._mock_r2()
        supabase = self._mock_supabase([])
        blueprint_snapshot_raw = {
            "nodes": [
                {"node_id": "ghost-node", "type": "ImageBucket",
                 "params": {"selected_file_ids": ["f1"]}}
            ]
        }
        node_outputs = {}  # ghost-node not present

        with patch("app.storage.r2.get_r2", return_value=r2):
            _refresh_media_urls(node_outputs, blueprint_snapshot_raw, "user-1", supabase)

        r2.sign_path.assert_not_called()

    def test_no_blueprint_snapshot_still_signs_sentinels(self):
        """Even without a snapshot, r2:// sentinels in node_outputs are signed."""
        r2 = self._mock_r2("https://fresh.example.com/generated.jpg")
        supabase = MagicMock()
        node_outputs = {"n": {"generated_image": "r2://runs/exec-1/n/generated_image.jpg"}}

        with patch("app.storage.r2.get_r2", return_value=r2):
            _refresh_media_urls(node_outputs, None, "user-1", supabase)

        assert node_outputs["n"]["generated_image"] == "https://fresh.example.com/generated.jpg"
        r2.sign_path.assert_called_once_with(
            "runs/exec-1/n/generated_image.jpg", expires_in=3600
        )

    # ── r2:// sentinel signing ─────────────────────────────────────────────

    def test_r2_sentinel_replaced_with_signed_url(self):
        """r2:// sentinels from ImageGeneration are signed and replaced."""
        r2 = self._mock_r2("https://signed.example.com/img.jpg")
        supabase = self._mock_supabase([])
        node_outputs = {"gen": {"generated_image": "r2://runs/exec/gen/generated_image.jpg"}}

        with patch("app.storage.r2.get_r2", return_value=r2):
            _refresh_media_urls(node_outputs, None, "u1", supabase)

        assert node_outputs["gen"]["generated_image"] == "https://signed.example.com/img.jpg"
        r2.sign_path.assert_called_once_with("runs/exec/gen/generated_image.jpg", expires_in=3600)

    def test_non_r2_strings_not_touched(self):
        """Plain text outputs without r2:// prefix are left alone."""
        r2 = self._mock_r2()
        supabase = self._mock_supabase([])
        node_outputs = {"n": {"generated_text": "Hello, world!"}}

        with patch("app.storage.r2.get_r2", return_value=r2):
            _refresh_media_urls(node_outputs, None, "u1", supabase)

        assert node_outputs["n"]["generated_text"] == "Hello, world!"
        r2.sign_path.assert_not_called()

    def test_sign_failure_leaves_sentinel_unchanged(self):
        """If signing an r2:// sentinel fails, the sentinel value is left unchanged."""
        r2 = MagicMock()
        r2.sign_path = MagicMock(side_effect=RuntimeError("signing failed"))
        supabase = self._mock_supabase([])
        original = "r2://runs/exec/n/generated_image.jpg"
        node_outputs = {"n": {"generated_image": original}}

        with patch("app.storage.r2.get_r2", return_value=r2):
            _refresh_media_urls(node_outputs, None, "u1", supabase)  # must not raise

        assert node_outputs["n"]["generated_image"] == original

    def test_r2_unavailable_does_not_raise(self):
        """If R2 client is unavailable, the function exits silently."""
        supabase = MagicMock()
        node_outputs = {"n": {"generated_image": "r2://runs/exec/n/generated_image.jpg"}}

        with patch("app.storage.r2.get_r2", side_effect=RuntimeError("no R2")):
            _refresh_media_urls(node_outputs, None, "u1", supabase)  # must not raise

    # ── Combined bucket + sentinel ─────────────────────────────────────────

    def test_bucket_and_sentinel_both_refreshed(self):
        """A run with both a bucket node and an ImageGeneration sentinel refreshes both."""
        signed_bucket = "https://fresh.example.com/bucket.jpg"
        signed_generated = "https://fresh.example.com/generated.jpg"

        r2 = MagicMock()
        r2.sign_path = MagicMock(side_effect=[signed_bucket, signed_generated])

        supabase = self._mock_supabase([
            {"id": "f1", "path": "users/u/images/f1.jpg", "status": "uploaded"}
        ])

        blueprint_snapshot_raw = {
            "nodes": [
                {"node_id": "bucket-node", "type": "ImageBucket",
                 "params": {"selected_file_ids": ["f1"]}},
                {"node_id": "gen-node", "type": "ImageGeneration", "params": {}},
            ]
        }
        node_outputs = {
            "bucket-node": {"images": ["https://expired.example.com/old"]},
            "gen-node": {"generated_image": "r2://runs/exec/gen-node/generated_image.jpg"},
        }

        with patch("app.storage.r2.get_r2", return_value=r2):
            _refresh_media_urls(node_outputs, blueprint_snapshot_raw, "user-1", supabase)

        assert node_outputs["bucket-node"]["images"] == [signed_bucket]
        assert node_outputs["gen-node"]["generated_image"] == signed_generated
        assert r2.sign_path.call_count == 2

    # ── BlueprintSnapshotNode.params validation ────────────────────────────

    def test_blueprint_snapshot_node_includes_params(self):
        """BlueprintSnapshotNode now exposes params so file IDs survive validation."""
        from app.api.v1.workflows import BlueprintSnapshot

        snapshot = BlueprintSnapshot.model_validate({
            "nodes": [
                {
                    "node_id": "n",
                    "type": "ImageBucket",
                    "params": {"selected_file_ids": ["f1", "f2"]},
                }
            ]
        })
        assert snapshot.nodes is not None
        node = snapshot.nodes[0]
        assert node.params == {"selected_file_ids": ["f1", "f2"]}
