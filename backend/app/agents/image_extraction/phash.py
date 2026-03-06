"""Lightweight perceptual hash (pHash) using DCT, requiring only Pillow + NumPy.

Replaces the `imagehash` library (which pulls in scipy ~95 MB and pywavelets ~9 MB)
with an equivalent 64-bit DCT-based perceptual hash.

Algorithm (matches imagehash.phash default behaviour):
  1. Convert to grayscale and resize to (hash_size*4) x (hash_size*4) -- default 32x32
  2. Compute 2-D DCT via matrix multiplication (Type-II, orthonormal)
  3. Keep top-left hash_size x hash_size block (lowest frequencies)
  4. Exclude DC coefficient (0,0), compute median of remaining values
  5. Threshold: bits where value > median = 1, else 0
  6. Pack into a 64-bit integer
"""

from __future__ import annotations

import numpy as np
from PIL import Image


def _dct_matrix(n: int) -> np.ndarray:
    """Build an n x n Type-II DCT matrix (orthonormal)."""
    mat = np.zeros((n, n), dtype=np.float64)
    for k in range(n):
        for i in range(n):
            mat[k, i] = np.cos(np.pi * k * (2 * i + 1) / (2 * n))
    mat[0, :] *= np.sqrt(1.0 / n)
    mat[1:, :] *= np.sqrt(2.0 / n)
    return mat


_DCT32: np.ndarray | None = None


def _get_dct32() -> np.ndarray:
    global _DCT32
    if _DCT32 is None:
        _DCT32 = _dct_matrix(32)
    return _DCT32


class ImageHash:
    """Minimal hash object supporting hamming-distance via subtraction."""

    __slots__ = ("_bits",)

    def __init__(self, bits: np.ndarray):
        self._bits = bits.flatten().astype(bool)

    def __sub__(self, other: ImageHash) -> int:
        return int(np.count_nonzero(self._bits != other._bits))

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, ImageHash):
            return NotImplemented
        return np.array_equal(self._bits, other._bits)

    def __hash__(self) -> int:
        return hash(self._bits.tobytes())

    def __repr__(self) -> str:
        return f"ImageHash(dist_bits={len(self._bits)})"


def phash(image: Image.Image, hash_size: int = 8) -> ImageHash:
    """Compute a perceptual hash for a PIL Image.

    Equivalent to ``imagehash.phash(image, hash_size=8)`` but without
    scipy or pywavelets.
    """
    img_size = hash_size * 4  # 32 for default hash_size=8

    gray = image.convert("L").resize((img_size, img_size), Image.LANCZOS)
    pixels = np.array(gray, dtype=np.float64)

    dct_mat = _get_dct32() if img_size == 32 else _dct_matrix(img_size)
    dct_2d = dct_mat @ pixels @ dct_mat.T

    low_freq = dct_2d[:hash_size, :hash_size]

    # Exclude DC term (top-left corner) when computing median, matching imagehash
    flat = low_freq.flatten()
    median = np.median(flat[1:])

    bits = (flat > median).reshape((hash_size, hash_size))
    return ImageHash(bits)
