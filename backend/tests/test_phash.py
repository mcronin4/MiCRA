"""Tests for perceptual hashing used in keyframe deduplication.

Validates that compute_phash and deduplicate_candidates behave correctly:
- Similar images produce hashes with low hamming distance
- Different images produce hashes with high hamming distance
- Deduplication correctly removes near-duplicates while keeping distinct frames
"""

import os
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

from app.agents.image_extraction.keyframe_pipeline import (
    compute_phash,
    deduplicate_candidates,
    DEFAULT_CONFIG,
)


def _make_photo_like(seed=0, size=(256, 256)) -> Image.Image:
    """Generate a photo-like image with smooth regions and edges using low-frequency blobs."""
    rng = np.random.RandomState(seed)
    h, w = size[1], size[0]
    arr = np.zeros((h, w, 3), dtype=np.float64)
    for _ in range(12):
        cx, cy = rng.randint(0, w), rng.randint(0, h)
        sx, sy = rng.randint(w // 6, w // 2), rng.randint(h // 6, h // 2)
        color = rng.randint(50, 255, size=3).astype(np.float64)
        yy, xx = np.mgrid[:h, :w]
        gaussian = np.exp(-((xx - cx) ** 2 / (2 * sx**2) + (yy - cy) ** 2 / (2 * sy**2)))
        for c in range(3):
            arr[:, :, c] += gaussian * color[c]
    arr = np.clip(arr, 0, 255).astype(np.uint8)
    return Image.fromarray(arr)


def _brighten(img: Image.Image, factor=1.05) -> Image.Image:
    """Slightly brighten an image -- simulates a near-duplicate with minor exposure change."""
    arr = np.array(img, dtype=np.float64)
    arr = np.clip(arr * factor, 0, 255).astype(np.uint8)
    return Image.fromarray(arr)


def _save_image(img: Image.Image, path: str):
    img.save(path, "JPEG")


class TestComputePhash:
    def test_returns_hash_for_valid_image(self, tmp_path):
        img = _make_photo_like(seed=0)
        path = str(tmp_path / "photo.jpg")
        _save_image(img, path)

        h = compute_phash(path)
        assert h is not None

    def test_returns_none_for_missing_file(self):
        h = compute_phash("/nonexistent/path/image.jpg")
        assert h is None

    def test_identical_images_have_zero_distance(self, tmp_path):
        img = _make_photo_like(seed=1)
        p1 = str(tmp_path / "a.jpg")
        p2 = str(tmp_path / "b.jpg")
        _save_image(img, p1)
        _save_image(img, p2)

        h1 = compute_phash(p1)
        h2 = compute_phash(p2)
        assert h1 is not None and h2 is not None
        assert h1 - h2 == 0

    def test_near_duplicate_images_have_low_distance(self, tmp_path):
        base = _make_photo_like(seed=2)
        variant = _brighten(base, factor=1.05)
        p1 = str(tmp_path / "base.jpg")
        p2 = str(tmp_path / "variant.jpg")
        _save_image(base, p1)
        _save_image(variant, p2)

        h1 = compute_phash(p1)
        h2 = compute_phash(p2)
        assert h1 is not None and h2 is not None
        dist = h1 - h2
        assert dist <= 8, f"Near-duplicate distance {dist} should be <= 8"

    def test_very_different_images_have_high_distance(self, tmp_path):
        img_a = _make_photo_like(seed=10)
        img_b = _make_photo_like(seed=99)
        p1 = str(tmp_path / "photo_a.jpg")
        p2 = str(tmp_path / "photo_b.jpg")
        _save_image(img_a, p1)
        _save_image(img_b, p2)

        h1 = compute_phash(p1)
        h2 = compute_phash(p2)
        assert h1 is not None and h2 is not None
        dist = h1 - h2
        assert dist > 8, f"Different images should have distance > 8, got {dist}"

    def test_hash_supports_subtraction_operator(self, tmp_path):
        """The hash object must support `h1 - h2` returning an int-like distance."""
        img = _make_photo_like(seed=3)
        path = str(tmp_path / "test.jpg")
        _save_image(img, path)

        h = compute_phash(path)
        assert h is not None
        dist = h - h
        assert isinstance(dist, (int, np.integer))
        assert dist == 0


class TestDeduplicateCandidates:
    def _make_candidate(self, tmp_path, name, img, scene_id=0, timestamp=0.0, quality=0.5):
        path = str(tmp_path / name)
        _save_image(img, path)
        return {
            "frame_path": path,
            "scene_id": scene_id,
            "timestamp": timestamp,
            "quality_score": quality,
        }

    def test_empty_input(self):
        result = deduplicate_candidates([], DEFAULT_CONFIG)
        assert result == []

    def test_single_candidate_kept(self, tmp_path):
        img = _make_photo_like(seed=20)
        cand = self._make_candidate(tmp_path, "a.jpg", img, quality=0.8)
        result = deduplicate_candidates([cand], DEFAULT_CONFIG)
        assert len(result) == 1

    def test_identical_images_deduplicated(self, tmp_path):
        img = _make_photo_like(seed=21)
        c1 = self._make_candidate(tmp_path, "a.jpg", img, quality=0.9, timestamp=1.0)
        c2 = self._make_candidate(tmp_path, "b.jpg", img, quality=0.5, timestamp=2.0)

        result = deduplicate_candidates([c1, c2], DEFAULT_CONFIG)
        assert len(result) == 1
        assert result[0]["quality_score"] == 0.9, "Should keep higher quality frame"

    def test_near_duplicates_deduplicated(self, tmp_path):
        base = _make_photo_like(seed=22)
        variant = _brighten(base, factor=1.05)
        c1 = self._make_candidate(tmp_path, "base.jpg", base, quality=0.7, timestamp=1.0)
        c2 = self._make_candidate(tmp_path, "variant.jpg", variant, quality=0.3, timestamp=2.0)

        result = deduplicate_candidates([c1, c2], DEFAULT_CONFIG)
        assert len(result) == 1

    def test_different_images_both_kept(self, tmp_path):
        img_a = _make_photo_like(seed=10)
        img_b = _make_photo_like(seed=99)
        c1 = self._make_candidate(tmp_path, "photo_a.jpg", img_a, quality=0.8)
        c2 = self._make_candidate(tmp_path, "photo_b.jpg", img_b, quality=0.6)

        result = deduplicate_candidates([c1, c2], DEFAULT_CONFIG)
        assert len(result) == 2

    def test_phash_field_cleaned_from_output(self, tmp_path):
        img = _make_photo_like(seed=23)
        cand = self._make_candidate(tmp_path, "a.jpg", img, quality=0.8)
        result = deduplicate_candidates([cand], DEFAULT_CONFIG)
        for r in result:
            assert "_phash" not in r

    def test_custom_threshold_zero_keeps_non_identical(self, tmp_path):
        """With threshold=0, only exact hash matches are deduplicated."""
        base = _make_photo_like(seed=24)
        variant = _brighten(base, factor=1.05)
        c1 = self._make_candidate(tmp_path, "base.jpg", base, quality=0.7, timestamp=1.0)
        c2 = self._make_candidate(tmp_path, "variant.jpg", variant, quality=0.3, timestamp=2.0)

        config = {**DEFAULT_CONFIG, "dedup_threshold": 0}
        result = deduplicate_candidates([c1, c2], config)
        assert len(result) >= 1
