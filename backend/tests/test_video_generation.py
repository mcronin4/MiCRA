"""
Tests for the VideoGeneration workflow node.

All tests mock the Veo wrapper so no external network calls are made.
Tests cover:
  - video/mp4 artifact creation
  - video_prompt_bundle.json creation
  - Local artifact backend read/write
  - Prompt assembly with and without images/text
  - Error on missing VEO_ENABLE_LIVE_CALLS
"""

import asyncio
import base64
import json
import os
import sys
import tempfile
from pathlib import Path
from typing import Any
from unittest.mock import patch, MagicMock

import pytest

# Ensure backend is importable
backend_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_root))

from app.models.blueprint import (
    Blueprint,
    BlueprintNode,
    BlueprintConnection,
    WorkflowOutput,
)
from app.services.workflow_executor import execute_workflow, _registry


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

# Minimal valid MP4 bytes (ftyp box only — enough to pass as MP4)
FAKE_MP4 = (
    b"\x00\x00\x00\x18"  # box size = 24
    b"ftyp"               # box type
    b"isom"               # major brand
    b"\x00\x00\x02\x00"  # minor version
    b"isomiso2mp41"       # compatible brands
)


def _make_blueprint(
    params: dict | None = None,
    with_image_input: bool = False,
    with_text_input: bool = False,
) -> Blueprint:
    """Build a minimal Blueprint for VideoGeneration testing."""
    nodes: list[BlueprintNode] = []
    connections: list[BlueprintConnection] = []
    execution_order: list[str] = []

    if with_image_input:
        nodes.append(BlueprintNode(
            node_id="img-src",
            type="MockImageSource",
            params={},
        ))
        connections.append(BlueprintConnection(
            from_node="img-src", from_output="images",
            to_node="video-gen", to_input="images",
        ))
        execution_order.append("img-src")

    if with_text_input:
        nodes.append(BlueprintNode(
            node_id="txt-src",
            type="MockTextSource",
            params={},
        ))
        connections.append(BlueprintConnection(
            from_node="txt-src", from_output="text",
            to_node="video-gen", to_input="text",
        ))
        execution_order.append("txt-src")

    video_params = {
        "duration_seconds": "8",
        "aspect_ratio": "9:16",
        "resolution": "720p",
        "user_prompt": "Test video prompt",
    }
    if params:
        video_params.update(params)

    nodes.append(BlueprintNode(
        node_id="video-gen",
        type="VideoGeneration",
        params=video_params,
    ))
    execution_order.append("video-gen")

    return Blueprint(
        workflow_id="test-video",
        name="Test Video Workflow",
        nodes=nodes,
        connections=connections,
        execution_order=execution_order,
        workflow_outputs=[
            WorkflowOutput(key="video", from_node="video-gen", from_output="generated_video"),
            WorkflowOutput(key="bundle", from_node="video-gen", from_output="prompt_bundle"),
        ],
    )


# Register mock source executors for tests
from app.services.workflow_executor import executor as _executor_decorator


@_executor_decorator("MockImageSource")
async def _mock_image_source(params: dict, inputs: dict) -> dict[str, Any]:
    # Return a tiny 1x1 white JPEG as a data URL
    pixel = base64.b64encode(
        b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
    ).decode()
    return {"images": [f"data:image/jpeg;base64,{pixel}"]}


@_executor_decorator("MockTextSource")
async def _mock_text_source(params: dict, inputs: dict) -> dict[str, Any]:
    return {"text": "This is a sample transcript for the video."}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestVideoGenerationNode:
    """Tests for the VideoGeneration executor."""

    @pytest.fixture(autouse=True)
    def _setup_env(self, tmp_path):
        """Set up local artifact backend in a temp directory for each test."""
        self._orig_env = {
            "ARTIFACT_BACKEND": os.environ.get("ARTIFACT_BACKEND"),
            "ARTIFACTS_DIR": os.environ.get("ARTIFACTS_DIR"),
            "VEO_ENABLE_LIVE_CALLS": os.environ.get("VEO_ENABLE_LIVE_CALLS"),
        }
        os.environ["ARTIFACT_BACKEND"] = "local"
        os.environ["ARTIFACTS_DIR"] = str(tmp_path)
        # Reset the cached root so it picks up the new ARTIFACTS_DIR
        import app.storage.local_artifacts as _la
        _la._ARTIFACTS_ROOT = None

        yield

        # Restore env
        for k, v in self._orig_env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        _la._ARTIFACTS_ROOT = None

    @pytest.mark.asyncio
    async def test_video_artifact_created(self, tmp_path):
        """Generated video/mp4 artifact must be written to local store."""
        bp = _make_blueprint()

        with patch(
            "app.agents.video_generation.generator.generate_video_with_veo",
            return_value=FAKE_MP4,
        ), patch(
            "app.agents.video_generation.generator._is_live",
            return_value=True,
        ):
            result = await execute_workflow(bp)

        assert result.success, f"Workflow failed: {result.error}"
        video_out = result.workflow_outputs.get("video")
        assert video_out is not None

        # Should be a local path (not data URL) since ARTIFACT_BACKEND=local
        assert Path(video_out).exists(), f"Video file does not exist: {video_out}"
        assert Path(video_out).read_bytes() == FAKE_MP4

    @pytest.mark.asyncio
    async def test_prompt_bundle_created(self, tmp_path):
        """prompt_bundle output must contain expected fields."""
        bp = _make_blueprint()

        with patch(
            "app.agents.video_generation.generator.generate_video_with_veo",
            return_value=FAKE_MP4,
        ), patch(
            "app.agents.video_generation.generator._is_live",
            return_value=True,
        ):
            result = await execute_workflow(bp)

        assert result.success
        bundle = result.workflow_outputs.get("bundle")
        assert isinstance(bundle, dict)

        required_keys = {
            "workflow_run_id",
            "node_params",
            "input_artifacts",
            "final_veo_prompt",
            "veo_model",
            "veo_generation_params",
            "timestamp",
        }
        assert required_keys.issubset(bundle.keys()), (
            f"Missing keys: {required_keys - bundle.keys()}"
        )
        assert bundle["veo_model"] == "veo-3.1-generate-preview"
        assert bundle["node_params"]["duration_seconds"] == "8"
        assert bundle["node_params"]["aspect_ratio"] == "9:16"

    @pytest.mark.asyncio
    async def test_prompt_from_user_prompt_only(self, tmp_path):
        """When only user_prompt is provided, it should be the final prompt."""
        bp = _make_blueprint(params={"user_prompt": "My custom prompt"})

        with patch(
            "app.agents.video_generation.generator.generate_video_with_veo",
            return_value=FAKE_MP4,
        ) as mock_veo, patch(
            "app.agents.video_generation.generator._is_live",
            return_value=True,
        ):
            result = await execute_workflow(bp)

        assert result.success
        # Check the prompt passed to Veo
        call_args = mock_veo.call_args
        assert "My custom prompt" in call_args.kwargs.get("prompt", call_args.args[0] if call_args.args else "")

    @pytest.mark.asyncio
    async def test_prompt_with_text_input(self, tmp_path):
        """When text input is connected, it should appear in the prompt."""
        bp = _make_blueprint(
            params={"user_prompt": ""},
            with_text_input=True,
        )

        with patch(
            "app.agents.video_generation.generator.generate_video_with_veo",
            return_value=FAKE_MP4,
        ) as mock_veo, patch(
            "app.agents.video_generation.generator._is_live",
            return_value=True,
        ):
            result = await execute_workflow(bp)

        assert result.success
        call_args = mock_veo.call_args
        prompt_arg = call_args.kwargs.get("prompt", call_args.args[0] if call_args.args else "")
        assert "sample transcript" in prompt_arg

    @pytest.mark.asyncio
    async def test_images_passed_to_veo(self, tmp_path):
        """When images are connected, their bytes should reach generate_video_with_veo."""
        bp = _make_blueprint(with_image_input=True)

        with patch(
            "app.agents.video_generation.generator.generate_video_with_veo",
            return_value=FAKE_MP4,
        ) as mock_veo, patch(
            "app.agents.video_generation.generator._is_live",
            return_value=True,
        ):
            result = await execute_workflow(bp)

        assert result.success
        call_args = mock_veo.call_args
        images_arg = call_args.kwargs.get("images", call_args.args[1] if len(call_args.args) > 1 else None)
        assert images_arg is not None
        assert len(images_arg) > 0
        assert isinstance(images_arg[0], bytes)

    @pytest.mark.asyncio
    async def test_error_when_veo_disabled(self, tmp_path):
        """Workflow should fail gracefully when VEO_ENABLE_LIVE_CALLS is off."""
        os.environ.pop("VEO_ENABLE_LIVE_CALLS", None)
        bp = _make_blueprint()

        # Do NOT mock generate_video_with_veo — let it raise
        result = await execute_workflow(bp)

        assert not result.success
        assert "VEO_ENABLE_LIVE_CALLS" in result.error

    @pytest.mark.asyncio
    async def test_duration_passthrough(self, tmp_path):
        """Duration value is passed through to the prompt bundle."""
        bp = _make_blueprint(params={"duration_seconds": "6"})

        with patch(
            "app.agents.video_generation.generator.generate_video_with_veo",
            return_value=FAKE_MP4,
        ) as mock_veo, patch(
            "app.agents.video_generation.generator._is_live",
            return_value=True,
        ):
            result = await execute_workflow(bp)

        assert result.success
        bundle = result.workflow_outputs["bundle"]
        assert bundle["node_params"]["duration_seconds"] == "6"

    @pytest.mark.asyncio
    async def test_default_prompt_when_nothing_provided(self, tmp_path):
        """If no user_prompt and no text input, a sensible default is used."""
        bp = _make_blueprint(params={"user_prompt": ""})

        with patch(
            "app.agents.video_generation.generator.generate_video_with_veo",
            return_value=FAKE_MP4,
        ) as mock_veo, patch(
            "app.agents.video_generation.generator._is_live",
            return_value=True,
        ):
            result = await execute_workflow(bp)

        assert result.success
        call_args = mock_veo.call_args
        prompt_arg = call_args.kwargs.get("prompt", call_args.args[0] if call_args.args else "")
        assert len(prompt_arg) > 10  # some non-trivial default


class TestLocalArtifactBackend:
    """Tests for the local artifact storage backend."""

    @pytest.fixture(autouse=True)
    def _setup_env(self, tmp_path):
        os.environ["ARTIFACT_BACKEND"] = "local"
        os.environ["ARTIFACTS_DIR"] = str(tmp_path)
        import app.storage.local_artifacts as _la
        _la._ARTIFACTS_ROOT = None
        yield
        os.environ.pop("ARTIFACT_BACKEND", None)
        os.environ.pop("ARTIFACTS_DIR", None)
        _la._ARTIFACTS_ROOT = None

    def test_write_and_read(self, tmp_path):
        from app.storage.local_artifacts import write_artifact, read_artifact

        data = b"hello world"
        meta = write_artifact(data=data, mime="text/plain", name="test.txt")

        assert meta["id"]
        assert meta["mime"] == "text/plain"
        assert meta["size"] == len(data)
        assert meta["sha256"]

        read_data, read_meta = read_artifact(meta["id"])
        assert read_data == data
        assert read_meta["id"] == meta["id"]

    def test_write_mp4(self, tmp_path):
        from app.storage.local_artifacts import write_artifact, read_artifact

        meta = write_artifact(data=FAKE_MP4, mime="video/mp4", name="test.mp4")
        assert meta["path"].endswith(".mp4")

        read_data, _ = read_artifact(meta["id"])
        assert read_data == FAKE_MP4

    def test_list_artifacts(self, tmp_path):
        from app.storage.local_artifacts import write_artifact, list_artifacts

        write_artifact(data=b"a", mime="text/plain", name="a.txt")
        write_artifact(data=b"b", mime="text/plain", name="b.txt")

        arts = list_artifacts()
        assert len(arts) == 2

    def test_read_missing_artifact(self, tmp_path):
        from app.storage.local_artifacts import read_artifact

        with pytest.raises(FileNotFoundError):
            read_artifact("nonexistent-id")

    def test_is_local_backend(self, tmp_path):
        from app.storage.local_artifacts import is_local_backend

        assert is_local_backend() is True

        os.environ["ARTIFACT_BACKEND"] = "r2"
        assert is_local_backend() is False

        os.environ["ARTIFACT_BACKEND"] = "local"


class TestVideoGenerationRegistry:
    """Verify the VideoGeneration node is properly registered."""

    def test_node_in_registry(self):
        from app.models.node_registry import NODE_REGISTRY
        assert "VideoGeneration" in NODE_REGISTRY

    def test_executor_registered(self):
        assert "VideoGeneration" in _registry

    def test_node_spec_shape(self):
        from app.models.node_registry import NODE_REGISTRY
        spec = NODE_REGISTRY["VideoGeneration"]
        input_keys = {p.key for p in spec.inputs}
        output_keys = {p.key for p in spec.outputs}
        assert "images" in input_keys
        assert "text" in input_keys
        assert "generated_video" in output_keys
        assert "prompt_bundle" in output_keys
