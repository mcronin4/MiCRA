"""
Tests for media persistence helpers:
- _offload_generated_media  (workflow_executor.py)
- _refresh_media_urls       (workflows.py)
- _enforce_run_retention    (workflow_executor.py)
- _purge_r2_run_media       (workflow_executor.py)
- _build_terminal_node_outputs (workflow_executor.py)
"""

import base64
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch, call

import pytest

backend_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_root))

from app.services.workflow_executor import (
    _offload_generated_media,
    _build_terminal_node_outputs,
    _enforce_run_retention,
    _purge_r2_run_media,
    MAX_RUNS_PER_WORKFLOW,
)
from app.api.v1.workflows import _refresh_media_urls

PRESIGN_EXPIRY = 21600  # 6 hours — must match the constant in _refresh_media_urls


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_b64(mime: str, size: int = 16) -> str:
    raw = bytes(range(size))
    return f"data:{mime};base64," + base64.b64encode(raw).decode()


def _make_jpeg_b64(size: int = 16) -> str:
    return _make_b64("image/jpeg", size)


def _make_png_b64() -> str:
    return _make_b64("image/png")


def _make_mp4_b64() -> str:
    return _make_b64("video/mp4")


def _make_webm_b64() -> str:
    return _make_b64("video/webm")


# ---------------------------------------------------------------------------
# Tests for _offload_generated_media — scalar values
# ---------------------------------------------------------------------------

class TestOffloadGeneratedMedia:

    def _mock_r2(self):
        r2 = MagicMock()
        r2.upload_bytes = MagicMock()
        return r2

    def test_replaces_jpeg_base64_with_r2_sentinel(self):
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
        r2 = self._mock_r2()
        b64 = _make_png_b64()
        node_outputs = {"n": {"generated_image": b64}}

        with patch("app.storage.r2.get_r2", return_value=r2):
            _offload_generated_media(node_outputs, "exec-xyz")

        assert node_outputs["n"]["generated_image"] == "r2://runs/exec-xyz/n/generated_image.png"

    def test_leaves_non_base64_strings_unchanged(self):
        r2 = self._mock_r2()
        node_outputs = {"n": {"generated_text": "hello world"}}

        with patch("app.storage.r2.get_r2", return_value=r2):
            _offload_generated_media(node_outputs, "exec-1")

        assert node_outputs["n"]["generated_text"] == "hello world"
        r2.upload_bytes.assert_not_called()

    def test_leaves_r2_sentinels_unchanged(self):
        r2 = self._mock_r2()
        sentinel = "r2://runs/exec-1/n/generated_image.jpg"
        node_outputs = {"n": {"generated_image": sentinel}}

        with patch("app.storage.r2.get_r2", return_value=r2):
            _offload_generated_media(node_outputs, "exec-1")

        assert node_outputs["n"]["generated_image"] == sentinel
        r2.upload_bytes.assert_not_called()

    def test_leaves_presigned_urls_unchanged(self):
        r2 = self._mock_r2()
        url = "https://example.r2.cloudflarestorage.com/some/path?X-Amz-Signature=abc"
        node_outputs = {"n": {"images": [url]}}

        with patch("app.storage.r2.get_r2", return_value=r2):
            _offload_generated_media(node_outputs, "exec-1")

        assert node_outputs["n"]["images"] == [url]
        r2.upload_bytes.assert_not_called()

    def test_upload_failure_keeps_original_base64(self):
        r2 = self._mock_r2()
        r2.upload_bytes.side_effect = RuntimeError("network error")
        b64 = _make_jpeg_b64()
        node_outputs = {"n": {"generated_image": b64}}

        with patch("app.storage.r2.get_r2", return_value=r2):
            _offload_generated_media(node_outputs, "exec-1")

        assert node_outputs["n"]["generated_image"] == b64

    def test_handles_non_dict_outputs(self):
        r2 = self._mock_r2()
        node_outputs = {"n": None, "m": "string", "k": [1, 2, 3]}

        with patch("app.storage.r2.get_r2", return_value=r2):
            _offload_generated_media(node_outputs, "exec-1")

        r2.upload_bytes.assert_not_called()

    def test_handles_multiple_nodes(self):
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
        node_outputs = {"n": {"generated_image": _make_jpeg_b64()}}

        with patch("app.storage.r2.get_r2", side_effect=RuntimeError("no R2")):
            _offload_generated_media(node_outputs, "exec-1")

    def test_unknown_mime_type_skipped(self):
        r2 = self._mock_r2()
        b64 = _make_b64("application/pdf")
        node_outputs = {"n": {"doc": b64}}

        with patch("app.storage.r2.get_r2", return_value=r2):
            _offload_generated_media(node_outputs, "exec-1")

        assert node_outputs["n"]["doc"] == b64
        r2.upload_bytes.assert_not_called()


# ---------------------------------------------------------------------------
# Tests for _offload_generated_media — list values
# ---------------------------------------------------------------------------

class TestOffloadGeneratedMediaLists:

    def _mock_r2(self):
        r2 = MagicMock()
        r2.upload_bytes = MagicMock()
        return r2

    def test_list_of_images_all_offloaded(self):
        """ImageExtraction-style output: list of base64 PNGs."""
        r2 = self._mock_r2()
        imgs = [_make_png_b64(), _make_png_b64(), _make_png_b64()]
        node_outputs = {"node-ie": {"images": list(imgs)}}

        with patch("app.storage.r2.get_r2", return_value=r2):
            _offload_generated_media(node_outputs, "exec-list")

        result_list = node_outputs["node-ie"]["images"]
        assert len(result_list) == 3
        for idx in range(3):
            assert result_list[idx] == f"r2://runs/exec-list/node-ie/images_{idx}.png"
        assert r2.upload_bytes.call_count == 3

    def test_mixed_list_only_data_urls_offloaded(self):
        """List with both data URLs and plain strings — only data URLs are replaced."""
        r2 = self._mock_r2()
        plain_url = "https://example.com/already-hosted.jpg"
        b64 = _make_jpeg_b64()
        node_outputs = {"n": {"images": [plain_url, b64]}}

        with patch("app.storage.r2.get_r2", return_value=r2):
            _offload_generated_media(node_outputs, "exec-mix")

        result = node_outputs["n"]["images"]
        assert result[0] == plain_url
        assert result[1] == "r2://runs/exec-mix/n/images_1.jpg"
        r2.upload_bytes.assert_called_once()

    def test_list_with_non_string_items_skipped(self):
        """Non-string items in a list are left unchanged."""
        r2 = self._mock_r2()
        node_outputs = {"n": {"data": [42, None, {"key": "val"}, _make_jpeg_b64()]}}

        with patch("app.storage.r2.get_r2", return_value=r2):
            _offload_generated_media(node_outputs, "exec-1")

        result = node_outputs["n"]["data"]
        assert result[0] == 42
        assert result[1] is None
        assert result[2] == {"key": "val"}
        assert result[3] == "r2://runs/exec-1/n/data_3.jpg"

    def test_empty_list_unchanged(self):
        r2 = self._mock_r2()
        node_outputs = {"n": {"images": []}}

        with patch("app.storage.r2.get_r2", return_value=r2):
            _offload_generated_media(node_outputs, "exec-1")

        assert node_outputs["n"]["images"] == []
        r2.upload_bytes.assert_not_called()

    def test_list_upload_partial_failure(self):
        """If one upload in a list fails, others still succeed."""
        r2 = self._mock_r2()
        call_count = [0]
        def side_effect(*args, **kwargs):
            call_count[0] += 1
            if call_count[0] == 2:
                raise RuntimeError("transient failure")
        r2.upload_bytes.side_effect = side_effect

        imgs = [_make_jpeg_b64(), _make_jpeg_b64(), _make_jpeg_b64()]
        node_outputs = {"n": {"images": list(imgs)}}

        with patch("app.storage.r2.get_r2", return_value=r2):
            _offload_generated_media(node_outputs, "exec-partial")

        result = node_outputs["n"]["images"]
        assert result[0] == "r2://runs/exec-partial/n/images_0.jpg"
        assert result[1] == imgs[1]  # failed — kept original
        assert result[2] == "r2://runs/exec-partial/n/images_2.jpg"


# ---------------------------------------------------------------------------
# Tests for _offload_generated_media — video MIME types
# ---------------------------------------------------------------------------

class TestOffloadGeneratedMediaVideo:

    def _mock_r2(self):
        r2 = MagicMock()
        r2.upload_bytes = MagicMock()
        return r2

    def test_mp4_video_offloaded(self):
        r2 = self._mock_r2()
        b64 = _make_mp4_b64()
        node_outputs = {"vg": {"generated_video": b64}}

        with patch("app.storage.r2.get_r2", return_value=r2):
            _offload_generated_media(node_outputs, "exec-vid")

        assert node_outputs["vg"]["generated_video"] == "r2://runs/exec-vid/vg/generated_video.mp4"
        args = r2.upload_bytes.call_args
        assert args[0][2] == "video/mp4"

    def test_webm_video_offloaded(self):
        r2 = self._mock_r2()
        b64 = _make_webm_b64()
        node_outputs = {"vg": {"generated_video": b64}}

        with patch("app.storage.r2.get_r2", return_value=r2):
            _offload_generated_media(node_outputs, "exec-vid2")

        assert node_outputs["vg"]["generated_video"] == "r2://runs/exec-vid2/vg/generated_video.webm"

    def test_mov_video_offloaded(self):
        r2 = self._mock_r2()
        b64 = _make_b64("video/quicktime")
        node_outputs = {"vg": {"generated_video": b64}}

        with patch("app.storage.r2.get_r2", return_value=r2):
            _offload_generated_media(node_outputs, "exec-vid3")

        assert node_outputs["vg"]["generated_video"] == "r2://runs/exec-vid3/vg/generated_video.mov"


# ---------------------------------------------------------------------------
# Tests for _refresh_media_urls
# ---------------------------------------------------------------------------

class TestRefreshMediaUrls:

    def _mock_r2(self, signed_url="https://fresh.example.com/signed"):
        r2 = MagicMock()
        r2.sign_path = MagicMock(return_value=signed_url)
        return r2

    def _mock_supabase(self, file_records):
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
        r2.sign_path.assert_called_once_with("users/u1/images/abc.jpg", expires_in=PRESIGN_EXPIRY)

    def test_audio_bucket_urls_replaced(self):
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

        assert node_outputs["n"]["images"] == []
        r2.sign_path.assert_not_called()

    def test_node_not_in_outputs_skipped(self):
        r2 = self._mock_r2()
        supabase = self._mock_supabase([])
        blueprint_snapshot_raw = {
            "nodes": [
                {"node_id": "ghost-node", "type": "ImageBucket",
                 "params": {"selected_file_ids": ["f1"]}}
            ]
        }
        node_outputs = {}

        with patch("app.storage.r2.get_r2", return_value=r2):
            _refresh_media_urls(node_outputs, blueprint_snapshot_raw, "user-1", supabase)

        r2.sign_path.assert_not_called()

    def test_no_blueprint_snapshot_still_signs_sentinels(self):
        r2 = self._mock_r2("https://fresh.example.com/generated.jpg")
        supabase = MagicMock()
        node_outputs = {"n": {"generated_image": "r2://runs/exec-1/n/generated_image.jpg"}}

        with patch("app.storage.r2.get_r2", return_value=r2):
            _refresh_media_urls(node_outputs, None, "user-1", supabase)

        assert node_outputs["n"]["generated_image"] == "https://fresh.example.com/generated.jpg"
        r2.sign_path.assert_called_once_with(
            "runs/exec-1/n/generated_image.jpg", expires_in=PRESIGN_EXPIRY
        )

    # ── r2:// sentinel signing — scalars ──────────────────────────────────

    def test_r2_sentinel_replaced_with_signed_url(self):
        r2 = self._mock_r2("https://signed.example.com/img.jpg")
        supabase = self._mock_supabase([])
        node_outputs = {"gen": {"generated_image": "r2://runs/exec/gen/generated_image.jpg"}}

        with patch("app.storage.r2.get_r2", return_value=r2):
            _refresh_media_urls(node_outputs, None, "u1", supabase)

        assert node_outputs["gen"]["generated_image"] == "https://signed.example.com/img.jpg"
        r2.sign_path.assert_called_once_with("runs/exec/gen/generated_image.jpg", expires_in=PRESIGN_EXPIRY)

    def test_non_r2_strings_not_touched(self):
        r2 = self._mock_r2()
        supabase = self._mock_supabase([])
        node_outputs = {"n": {"generated_text": "Hello, world!"}}

        with patch("app.storage.r2.get_r2", return_value=r2):
            _refresh_media_urls(node_outputs, None, "u1", supabase)

        assert node_outputs["n"]["generated_text"] == "Hello, world!"
        r2.sign_path.assert_not_called()

    def test_sign_failure_leaves_sentinel_unchanged(self):
        r2 = MagicMock()
        r2.sign_path = MagicMock(side_effect=RuntimeError("signing failed"))
        supabase = self._mock_supabase([])
        original = "r2://runs/exec/n/generated_image.jpg"
        node_outputs = {"n": {"generated_image": original}}

        with patch("app.storage.r2.get_r2", return_value=r2):
            _refresh_media_urls(node_outputs, None, "u1", supabase)

        assert node_outputs["n"]["generated_image"] == original

    def test_r2_unavailable_does_not_raise(self):
        supabase = MagicMock()
        node_outputs = {"n": {"generated_image": "r2://runs/exec/n/generated_image.jpg"}}

        with patch("app.storage.r2.get_r2", side_effect=RuntimeError("no R2")):
            _refresh_media_urls(node_outputs, None, "u1", supabase)

    # ── r2:// sentinel signing — lists ────────────────────────────────────

    def test_list_of_r2_sentinels_all_signed(self):
        """List of r2:// sentinels (ImageExtraction offloaded output) are all signed."""
        r2 = MagicMock()
        r2.sign_path = MagicMock(side_effect=lambda p, **_: f"https://signed/{p}")
        supabase = self._mock_supabase([])

        node_outputs = {"ie": {"images": [
            "r2://runs/exec/ie/images_0.png",
            "r2://runs/exec/ie/images_1.png",
            "r2://runs/exec/ie/images_2.png",
        ]}}

        with patch("app.storage.r2.get_r2", return_value=r2):
            _refresh_media_urls(node_outputs, None, "u1", supabase)

        result = node_outputs["ie"]["images"]
        assert result[0] == "https://signed/runs/exec/ie/images_0.png"
        assert result[1] == "https://signed/runs/exec/ie/images_1.png"
        assert result[2] == "https://signed/runs/exec/ie/images_2.png"
        assert r2.sign_path.call_count == 3

    def test_mixed_list_only_sentinels_signed(self):
        """List with r2:// sentinels and plain URLs — only sentinels are re-signed."""
        r2 = self._mock_r2("https://signed.example.com/fresh")
        supabase = self._mock_supabase([])
        plain_url = "https://example.com/already-valid.jpg"

        node_outputs = {"n": {"images": [
            plain_url,
            "r2://runs/exec/n/images_1.png",
        ]}}

        with patch("app.storage.r2.get_r2", return_value=r2):
            _refresh_media_urls(node_outputs, None, "u1", supabase)

        result = node_outputs["n"]["images"]
        assert result[0] == plain_url
        assert result[1] == "https://signed.example.com/fresh"
        r2.sign_path.assert_called_once()

    def test_list_sign_failure_leaves_failed_items_unchanged(self):
        """Signing failure for one list item doesn't affect others."""
        call_idx = [0]
        def sign_side_effect(path, **kwargs):
            call_idx[0] += 1
            if call_idx[0] == 2:
                raise RuntimeError("transient failure")
            return f"https://signed/{path}"

        r2 = MagicMock()
        r2.sign_path = MagicMock(side_effect=sign_side_effect)
        supabase = self._mock_supabase([])

        sentinel_1 = "r2://runs/exec/n/images_0.png"
        sentinel_2 = "r2://runs/exec/n/images_1.png"
        sentinel_3 = "r2://runs/exec/n/images_2.png"
        node_outputs = {"n": {"images": [sentinel_1, sentinel_2, sentinel_3]}}

        with patch("app.storage.r2.get_r2", return_value=r2):
            _refresh_media_urls(node_outputs, None, "u1", supabase)

        result = node_outputs["n"]["images"]
        assert result[0] == "https://signed/runs/exec/n/images_0.png"
        assert result[1] == sentinel_2  # failed — kept original
        assert result[2] == "https://signed/runs/exec/n/images_2.png"

    # ── Combined bucket + sentinel ─────────────────────────────────────────

    def test_bucket_and_sentinel_both_refreshed(self):
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


# ---------------------------------------------------------------------------
# Tests for _build_terminal_node_outputs
# ---------------------------------------------------------------------------

class TestBuildTerminalNodeOutputs:

    def _make_blueprint(self, workflow_outputs):
        """Build a minimal Blueprint-like object with workflow_outputs."""
        from unittest.mock import MagicMock
        bp = MagicMock()
        bp.workflow_outputs = workflow_outputs
        return bp

    def _make_wf_output(self, from_node, from_output, output_key="output_1"):
        out = MagicMock()
        out.from_node = from_node
        out.from_output = from_output
        out.output_key = output_key
        return out

    def test_only_terminal_node_outputs_included(self):
        """Only outputs from nodes referenced in workflow_outputs are included."""
        node_outputs = {
            "text_gen": {"generated_text": "Hello world"},
            "image_gen": {"generated_image": "r2://some/path.jpg"},
            "intermediate": {"summary": "This should not appear"},
        }
        bp = self._make_blueprint([
            self._make_wf_output("text_gen", "generated_text"),
            self._make_wf_output("image_gen", "generated_image"),
        ])

        result = _build_terminal_node_outputs(node_outputs, bp)

        assert "text_gen" in result
        assert "image_gen" in result
        assert "intermediate" not in result
        assert result["text_gen"] == {"generated_text": "Hello world"}
        assert result["image_gen"] == {"generated_image": "r2://some/path.jpg"}

    def test_missing_upstream_node_skipped(self):
        """If a workflow_output references a node not in node_outputs, it's skipped."""
        node_outputs = {"text_gen": {"generated_text": "Hello"}}
        bp = self._make_blueprint([
            self._make_wf_output("text_gen", "generated_text"),
            self._make_wf_output("missing_node", "some_output"),
        ])

        result = _build_terminal_node_outputs(node_outputs, bp)

        assert "text_gen" in result
        assert "missing_node" not in result

    def test_missing_output_key_skipped(self):
        """If a workflow_output references a key not in the node's outputs, it's skipped."""
        node_outputs = {"text_gen": {"generated_text": "Hello"}}
        bp = self._make_blueprint([
            self._make_wf_output("text_gen", "nonexistent_key"),
        ])

        result = _build_terminal_node_outputs(node_outputs, bp)

        assert result == {}

    def test_no_blueprint_returns_empty(self):
        result = _build_terminal_node_outputs({"n": {"text": "hi"}}, None)
        assert result == {}

    def test_no_workflow_outputs_returns_empty(self):
        bp = self._make_blueprint([])
        result = _build_terminal_node_outputs({"n": {"text": "hi"}}, bp)
        assert result == {}

    def test_same_node_multiple_outputs(self):
        """A node with multiple outputs feeding into different workflow outputs."""
        node_outputs = {
            "multi": {"text": "Hello", "summary": "Short", "unused": "Don't include"},
        }
        bp = self._make_blueprint([
            self._make_wf_output("multi", "text"),
            self._make_wf_output("multi", "summary"),
        ])

        result = _build_terminal_node_outputs(node_outputs, bp)

        assert result["multi"] == {"text": "Hello", "summary": "Short"}
        assert "unused" not in result["multi"]


# ---------------------------------------------------------------------------
# Tests for _enforce_run_retention
# ---------------------------------------------------------------------------

class TestEnforceRunRetention:

    def _mock_supabase(self, run_rows):
        """Build a mock supabase that returns run_rows from workflow_run_outputs."""
        mock_execute_select = MagicMock()
        mock_execute_select.data = run_rows

        mock_order = MagicMock()
        mock_order.execute = MagicMock(return_value=mock_execute_select)

        mock_eq_user = MagicMock()
        mock_eq_user.order = MagicMock(return_value=mock_order)

        mock_eq_wf = MagicMock()
        mock_eq_wf.eq = MagicMock(return_value=mock_eq_user)

        mock_select = MagicMock()
        mock_select.eq = MagicMock(return_value=mock_eq_wf)

        mock_delete_execute = MagicMock()
        mock_delete_in = MagicMock()
        mock_delete_in.execute = MagicMock(return_value=mock_delete_execute)
        mock_delete = MagicMock()
        mock_delete.in_ = MagicMock(return_value=mock_delete_in)

        mock_table = MagicMock()
        mock_table.select = MagicMock(return_value=mock_select)
        mock_table.delete = MagicMock(return_value=mock_delete)

        supabase_wrapper = MagicMock()
        supabase_wrapper.client = MagicMock()
        supabase_wrapper.client.table = MagicMock(return_value=mock_table)

        return supabase_wrapper, mock_table

    def test_under_limit_no_deletions(self):
        rows = [{"execution_id": f"exec-{i}", "created_at": f"2026-03-0{i+1}T00:00:00Z"}
                for i in range(10)]
        supabase_wrapper, mock_table = self._mock_supabase(rows)

        with patch("app.services.workflow_executor.get_supabase", return_value=supabase_wrapper), \
             patch("app.services.workflow_executor._purge_r2_run_media") as mock_purge:
            _enforce_run_retention("wf-1", "user-1")

        mock_table.delete.assert_not_called()
        mock_purge.assert_not_called()

    def test_at_limit_no_deletions(self):
        rows = [{"execution_id": f"exec-{i}", "created_at": f"2026-03-0{i+1}T00:00:00Z"}
                for i in range(MAX_RUNS_PER_WORKFLOW)]
        supabase_wrapper, mock_table = self._mock_supabase(rows)

        with patch("app.services.workflow_executor.get_supabase", return_value=supabase_wrapper), \
             patch("app.services.workflow_executor._purge_r2_run_media") as mock_purge:
            _enforce_run_retention("wf-1", "user-1")

        mock_table.delete.assert_not_called()
        mock_purge.assert_not_called()

    def test_over_limit_deletes_oldest(self):
        num_rows = MAX_RUNS_PER_WORKFLOW + 3
        rows = [{"execution_id": f"exec-{i}", "created_at": f"2026-03-{i+1:02d}T00:00:00Z"}
                for i in range(num_rows)]
        supabase_wrapper, mock_table = self._mock_supabase(rows)

        expected_stale_ids = [f"exec-{i}" for i in range(MAX_RUNS_PER_WORKFLOW, num_rows)]

        with patch("app.services.workflow_executor.get_supabase", return_value=supabase_wrapper), \
             patch("app.services.workflow_executor._purge_r2_run_media") as mock_purge:
            _enforce_run_retention("wf-1", "user-1")

        mock_table.delete.assert_called_once()
        mock_purge.assert_called_once_with(expected_stale_ids)

    def test_cleanup_failure_does_not_raise(self):
        rows = [{"execution_id": f"exec-{i}", "created_at": f"2026-03-{i+1:02d}T00:00:00Z"}
                for i in range(MAX_RUNS_PER_WORKFLOW + 2)]
        supabase_wrapper, mock_table = self._mock_supabase(rows)
        mock_table.delete.side_effect = RuntimeError("DB error")

        with patch("app.services.workflow_executor.get_supabase", return_value=supabase_wrapper), \
             patch("app.services.workflow_executor._purge_r2_run_media"):
            _enforce_run_retention("wf-1", "user-1")  # must not raise

    def test_supabase_unavailable_does_not_raise(self):
        with patch("app.services.workflow_executor.get_supabase", side_effect=RuntimeError("no DB")):
            _enforce_run_retention("wf-1", "user-1")  # must not raise


# ---------------------------------------------------------------------------
# Tests for _purge_r2_run_media
# ---------------------------------------------------------------------------

class TestPurgeR2RunMedia:

    def test_deletes_objects_under_execution_prefix(self):
        r2 = MagicMock()
        r2.client = MagicMock()
        r2.client.list_objects_v2 = MagicMock(return_value={
            "Contents": [
                {"Key": "runs/exec-1/node-a/img.jpg"},
                {"Key": "runs/exec-1/node-b/vid.mp4"},
            ]
        })
        r2.client.delete_objects = MagicMock()

        with patch("app.storage.r2.get_r2", return_value=r2), \
             patch("app.storage.r2.R2_BUCKET", "micra"):
            _purge_r2_run_media(["exec-1"])

        r2.client.list_objects_v2.assert_called_once_with(
            Bucket="micra", Prefix="runs/exec-1/"
        )
        r2.client.delete_objects.assert_called_once_with(
            Bucket="micra",
            Delete={"Objects": [
                {"Key": "runs/exec-1/node-a/img.jpg"},
                {"Key": "runs/exec-1/node-b/vid.mp4"},
            ]}
        )

    def test_no_objects_skips_delete(self):
        r2 = MagicMock()
        r2.client = MagicMock()
        r2.client.list_objects_v2 = MagicMock(return_value={"Contents": []})
        r2.client.delete_objects = MagicMock()

        with patch("app.storage.r2.get_r2", return_value=r2), \
             patch("app.storage.r2.R2_BUCKET", "micra"):
            _purge_r2_run_media(["exec-1"])

        r2.client.delete_objects.assert_not_called()

    def test_no_contents_key_skips_delete(self):
        r2 = MagicMock()
        r2.client = MagicMock()
        r2.client.list_objects_v2 = MagicMock(return_value={})
        r2.client.delete_objects = MagicMock()

        with patch("app.storage.r2.get_r2", return_value=r2), \
             patch("app.storage.r2.R2_BUCKET", "micra"):
            _purge_r2_run_media(["exec-1"])

        r2.client.delete_objects.assert_not_called()

    def test_multiple_execution_ids_purged(self):
        r2 = MagicMock()
        r2.client = MagicMock()
        r2.client.list_objects_v2 = MagicMock(return_value={
            "Contents": [{"Key": "runs/x/a.jpg"}]
        })
        r2.client.delete_objects = MagicMock()

        with patch("app.storage.r2.get_r2", return_value=r2), \
             patch("app.storage.r2.R2_BUCKET", "micra"):
            _purge_r2_run_media(["exec-1", "exec-2", "exec-3"])

        assert r2.client.list_objects_v2.call_count == 3
        assert r2.client.delete_objects.call_count == 3

    def test_r2_unavailable_does_not_raise(self):
        with patch("app.storage.r2.get_r2", side_effect=RuntimeError("no R2")):
            _purge_r2_run_media(["exec-1"])  # must not raise

    def test_list_objects_failure_does_not_raise(self):
        r2 = MagicMock()
        r2.client = MagicMock()
        r2.client.list_objects_v2 = MagicMock(side_effect=RuntimeError("AWS error"))

        with patch("app.storage.r2.get_r2", return_value=r2), \
             patch("app.storage.r2.R2_BUCKET", "micra"):
            _purge_r2_run_media(["exec-1"])  # must not raise


# ---------------------------------------------------------------------------
# Tests for removed raw execute endpoints
# ---------------------------------------------------------------------------

class TestRemovedRawExecuteEndpoints:
    """Verify that raw (unsaved) execute endpoints no longer exist."""

    @pytest.fixture(autouse=True)
    def setup_client(self):
        from app.main import app
        from app.auth.dependencies import get_current_user
        from fastapi.testclient import TestClient

        app.dependency_overrides[get_current_user] = lambda: MagicMock(
            sub="test-user", email="test@example.com", role="authenticated"
        )
        self.client = TestClient(app, raise_server_exceptions=False)
        yield
        app.dependency_overrides.pop(get_current_user, None)

    def test_post_execute_not_found(self):
        resp = self.client.post("/api/v1/workflows/execute", json={
            "nodes": [], "edges": []
        })
        # 404 (no matching route) or 405 (method not allowed)
        assert resp.status_code in (404, 405, 422)
        # Make sure it's NOT a 200 success
        assert resp.status_code != 200

    def test_post_execute_stream_not_found(self):
        resp = self.client.post("/api/v1/workflows/execute/stream", json={
            "nodes": [], "edges": []
        })
        assert resp.status_code in (404, 405, 422)
        assert resp.status_code != 200
