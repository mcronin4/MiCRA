from __future__ import annotations

import os
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from google.genai.errors import ClientError

backend_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_root))

from app.agents.image_generation.generator import generate_image_from_text
from app.agents.video_generation import generator as video_generator
from app.api.v1 import workflows as workflows_api
from app.api.v1.workflows import CopilotPlanRequest
from app.llm import gemini as gemini_module
from app.llm.gemini import (
    GEMINI_ALL_PROVIDERS_RATE_LIMIT_MESSAGE,
    GeminiApiKeySlot,
    GeminiProvidersExhaustedError,
    GeminiRotationManager,
    load_gemini_api_key_slots_from_env,
    query_gemini,
)
from app.models.blueprint import Blueprint, BlueprintNode, WorkflowOutput
from app.services.workflow_executor import execute_workflow, executor


class _FakeClock:
    def __init__(self) -> None:
        self.now = 0.0
        self.sleeps: list[float] = []

    def time(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds


def _rate_limit_error(*, retry_delay: str = "5s", daily: bool = False) -> ClientError:
    violations = [
        {
            "quotaMetric": (
                "generate_content.googleapis.com/generate_content_requests"
                if not daily
                else "generate_content.googleapis.com/GenerateRequestsPerDayPerProjectPerModel"
            ),
            "quotaId": (
                "GenerateRequestsPerMinutePerProjectPerModel"
                if not daily
                else "GenerateRequestsPerDayPerProjectPerModel-FreeTier"
            ),
        }
    ]
    return ClientError(
        429,
        {
            "error": {
                "code": 429,
                "message": f"Quota exceeded. Please retry in {retry_delay}.",
                "status": "RESOURCE_EXHAUSTED",
                "details": [
                    {
                        "@type": "type.googleapis.com/google.rpc.Help",
                        "retryDelay": retry_delay,
                    },
                    {
                        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
                        "violations": violations,
                    },
                ],
            }
        },
    )


@executor("MockGeminiFailureNode")
async def _mock_gemini_failure_node(params: dict, inputs: dict) -> dict:
    raise GeminiProvidersExhaustedError(GEMINI_ALL_PROVIDERS_RATE_LIMIT_MESSAGE)


def test_load_gemini_api_key_slots_prefers_numbered_keys_and_dedupes() -> None:
    slots = load_gemini_api_key_slots_from_env(
        {
            "GEMINI_API_KEY_1": "key-a",
            "GEMINI_API_KEY_2": "key-a",
            "GEMINI_API_KEY_3": " key-b ",
            "GEMINI_API_KEY": "legacy-key",
        }
    )

    assert [slot.env_name for slot in slots] == ["GEMINI_API_KEY_1", "GEMINI_API_KEY_3"]
    assert [slot.api_key for slot in slots] == ["key-a", "key-b"]


def test_load_gemini_api_key_slots_uses_legacy_fallback() -> None:
    slots = load_gemini_api_key_slots_from_env({"GEMINI_API_KEY": "legacy-key"})

    assert len(slots) == 1
    assert slots[0].env_name == "GEMINI_API_KEY"
    assert slots[0].api_key == "legacy-key"


def test_rotation_manager_round_robins_successful_calls() -> None:
    slots = (
        GeminiApiKeySlot(1, "GEMINI_API_KEY_1", "key-a"),
        GeminiApiKeySlot(2, "GEMINI_API_KEY_2", "key-b"),
        GeminiApiKeySlot(3, "GEMINI_API_KEY_3", "key-c"),
    )
    manager = GeminiRotationManager(
        slots,
        client_factory=lambda api_key: SimpleNamespace(api_key=api_key),
    )

    seen = [
        manager.execute(
            model="gemini-2.5-flash",
            operation_name="test",
            request_fn=lambda client: client.api_key,
        )
        for _ in range(4)
    ]

    assert seen == ["key-a", "key-b", "key-c", "key-a"]


def test_rotation_manager_rotates_on_rate_limit() -> None:
    slots = (
        GeminiApiKeySlot(1, "GEMINI_API_KEY_1", "key-a"),
        GeminiApiKeySlot(2, "GEMINI_API_KEY_2", "key-b"),
    )
    manager = GeminiRotationManager(
        slots,
        client_factory=lambda api_key: SimpleNamespace(api_key=api_key),
    )
    attempts: list[str] = []

    def request_fn(client: SimpleNamespace) -> str:
        attempts.append(client.api_key)
        if client.api_key == "key-a":
            raise _rate_limit_error(retry_delay="5s")
        return "ok"

    result = manager.execute(
        model="gemini-2.5-flash",
        operation_name="test",
        request_fn=request_fn,
    )

    assert result == "ok"
    assert attempts == ["key-a", "key-b"]


def test_rotation_manager_marks_daily_quota_unavailable_for_follow_up_calls() -> None:
    slots = (
        GeminiApiKeySlot(1, "GEMINI_API_KEY_1", "key-a"),
        GeminiApiKeySlot(2, "GEMINI_API_KEY_2", "key-b"),
    )
    manager = GeminiRotationManager(
        slots,
        client_factory=lambda api_key: SimpleNamespace(api_key=api_key),
    )
    attempts: list[str] = []

    def request_fn(client: SimpleNamespace) -> str:
        attempts.append(client.api_key)
        if client.api_key == "key-a":
            raise _rate_limit_error(retry_delay="5s", daily=True)
        return client.api_key

    first = manager.execute(
        model="gemini-2.5-flash",
        operation_name="test",
        request_fn=request_fn,
    )
    second = manager.execute(
        model="gemini-2.5-flash",
        operation_name="test",
        request_fn=lambda client: attempts.append(client.api_key) or client.api_key,
    )

    assert first == "key-b"
    assert second == "key-b"
    assert attempts == ["key-a", "key-b", "key-b"]


def test_rotation_manager_waits_then_raises_when_all_slots_are_blocked() -> None:
    clock = _FakeClock()
    manager = GeminiRotationManager(
        (GeminiApiKeySlot(1, "GEMINI_API_KEY_1", "key-a"),),
        max_wait_seconds=6,
        client_factory=lambda api_key: SimpleNamespace(api_key=api_key),
        time_fn=clock.time,
        sleep_fn=clock.sleep,
    )

    with pytest.raises(GeminiProvidersExhaustedError) as exc_info:
        manager.execute(
            model="gemini-2.5-flash",
            operation_name="test",
            request_fn=lambda client: (_ for _ in ()).throw(_rate_limit_error(retry_delay="5s")),
        )

    assert str(exc_info.value) == GEMINI_ALL_PROVIDERS_RATE_LIMIT_MESSAGE
    assert clock.sleeps == [5.0]


def test_query_gemini_uses_rotation_helper(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, str]] = []

    def fake_run_with_gemini_client(*, model: str, operation_name: str, request_fn):
        calls.append((model, operation_name))
        return SimpleNamespace(text="plain text response")

    monkeypatch.setattr(gemini_module, "run_with_gemini_client", fake_run_with_gemini_client)

    result = query_gemini("hello", model="gemini-2.5-pro")

    assert result == "plain text response"
    assert calls == [("gemini-2.5-pro", "generate_content")]


def test_image_generation_uses_rotation_helper(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, str]] = []
    fake_part = SimpleNamespace(inline_data=SimpleNamespace(mime_type="image/png", data=b"png-bytes"))
    fake_response = SimpleNamespace(parts=[fake_part])

    def fake_run_with_gemini_client(*, model: str, operation_name: str, request_fn):
        calls.append((model, operation_name))
        return fake_response

    monkeypatch.setattr(
        "app.agents.image_generation.generator.run_with_gemini_client",
        fake_run_with_gemini_client,
    )

    image_data, error = generate_image_from_text("draw a skyline")

    assert error is None
    assert image_data == "data:image/png;base64,cG5nLWJ5dGVz"
    assert calls == [("gemini-2.5-flash-image", "image_generate_from_text")]


def test_video_generation_uses_rotation_helper_for_api_key_auth(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(video_generator, "_is_live", lambda: True)
    monkeypatch.setattr(video_generator, "has_configured_gemini_api_keys", lambda: True)
    monkeypatch.delenv("GOOGLE_APPLICATION_CREDENTIALS", raising=False)

    calls: list[tuple[str, str]] = []

    def fake_run_with_gemini_client(*, model: str, operation_name: str, request_fn):
        calls.append((model, operation_name))
        return b"video-bytes"

    monkeypatch.setattr(video_generator, "run_with_gemini_client", fake_run_with_gemini_client)

    result = video_generator.generate_video_with_veo("make a demo video")

    assert result == b"video-bytes"
    assert calls == [(video_generator.MODEL, "generate_videos")]


def test_video_generation_bypasses_rotation_for_vertex_auth(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(video_generator, "_is_live", lambda: True)
    monkeypatch.setenv("GOOGLE_APPLICATION_CREDENTIALS", "/tmp/fake.json")
    monkeypatch.setattr(video_generator, "_build_vertex_client", lambda: SimpleNamespace(name="vertex"))
    monkeypatch.setattr(
        video_generator,
        "_execute_generate_video_with_client",
        lambda client, **kwargs: b"vertex-video",
    )

    def fail_if_called(**kwargs):
        raise AssertionError("run_with_gemini_client should not be used for Vertex auth")

    monkeypatch.setattr(video_generator, "run_with_gemini_client", fail_if_called)

    result = video_generator.generate_video_with_veo("make a demo video")

    assert result == b"vertex-video"


@pytest.mark.asyncio
async def test_workflow_executor_surfaces_clean_gemini_node_error() -> None:
    blueprint = Blueprint(
        workflow_id="gemini-error-workflow",
        name="Gemini Error Workflow",
        nodes=[BlueprintNode(node_id="gemini-node", type="MockGeminiFailureNode", params={})],
        connections=[],
        execution_order=["gemini-node"],
        workflow_outputs=[WorkflowOutput(key="out", from_node="gemini-node", from_output="text")],
    )

    result = await execute_workflow(blueprint)

    assert result.success is False
    assert result.node_results[0].error == GEMINI_ALL_PROVIDERS_RATE_LIMIT_MESSAGE
    assert "RESOURCE_EXHAUSTED" not in (result.error or "")


@pytest.mark.asyncio
async def test_copilot_plan_endpoint_returns_sanitized_gemini_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fail_plan(**kwargs):
        raise GeminiProvidersExhaustedError(GEMINI_ALL_PROVIDERS_RATE_LIMIT_MESSAGE)

    monkeypatch.setattr("app.services.workflow_copilot.plan_workflow_with_copilot", fail_plan)

    request = CopilotPlanRequest(message="build me a workflow", mode="create")

    with pytest.raises(HTTPException) as exc_info:
        await workflows_api.copilot_plan_workflow(
            request=request,
            user=SimpleNamespace(sub="user-1"),
            supabase=object(),
        )

    assert exc_info.value.status_code == 500
    assert GEMINI_ALL_PROVIDERS_RATE_LIMIT_MESSAGE in str(exc_info.value.detail)
    assert "RESOURCE_EXHAUSTED" not in str(exc_info.value.detail)
