"""
Keyframe Pipeline JB Edition v2
Dense frame extraction with SigLIP embedding-based clustering and Instagram-worthiness scoring.
Produces 3-5 diverse, high-quality frames optimized for social media thumbnails.
"""

import os
import json
import cv2
import numpy as np
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple

import imagehash
from PIL import Image
import torch
from sklearn.cluster import AgglomerativeClustering
from transformers import AutoProcessor, AutoModel

from .analyze_frame import (
    load_places_model,
    classify_scene,
    analyze_emotion
)

# SigLIP model configuration
SIGLIP_MODEL = "google/siglip-so400m-patch14-384"

# Global SigLIP model (loaded once)
_siglip_processor = None
_siglip_model = None
_siglip_device = None


def load_siglip_model():
    """Load SigLIP model for embedding-based deduplication."""
    global _siglip_processor, _siglip_model, _siglip_device

    if _siglip_model is not None:
        return _siglip_processor, _siglip_model, _siglip_device

    _siglip_device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f"Loading SigLIP model ({SIGLIP_MODEL}) on {_siglip_device}...")

    _siglip_processor = AutoProcessor.from_pretrained(SIGLIP_MODEL)
    _siglip_model = AutoModel.from_pretrained(SIGLIP_MODEL).to(_siglip_device)
    _siglip_model.eval()

    print("SigLIP loaded successfully")
    return _siglip_processor, _siglip_model, _siglip_device

# Configuration
DEFAULT_CONFIG_JB = {
    # Dense Sampling
    "frame_interval": 3,           # Extract every N frames
    "max_frames_to_sample": 1000,  # Memory safety cap

    # Deduplication - now uses SigLIP embeddings
    "dedup_phash_threshold": 8,    # pHash hamming distance (used for pre-filtering)
    "embedding_similarity_threshold": 0.85,  # SigLIP cosine similarity for clustering

    # Soft Scoring Weights (all factors contribute, none reject)
    "weight_blur": 0.20,
    "weight_exposure": 0.15,
    "weight_face": 0.15,
    "weight_emotion": 0.15,       # Happy/engaged expression
    "weight_closeup": 0.10,
    "weight_frontal": 0.10,
    "weight_composition": 0.15,    # NEW: Rule of thirds, face positioning

    # Exposure soft penalty parameters
    "exposure_optimal_low": 60,
    "exposure_optimal_high": 180,
    "exposure_min": 20,
    "exposure_max": 240,

    # Blur parameters
    "blur_threshold": 30.0,        # Below this = very blurry
    "blur_max_expected": 5000.0,   # For normalization

    # Selection - reduced for Instagram-worthy picks
    "max_final_frames": 5,         # Changed from 25 to 5
    "temporal_buckets": 5,
    "min_per_bucket": 0,           # Changed from 1 to 0 - diversity via clustering, not buckets
    "use_embedding_clustering": True,  # NEW: Use SigLIP for smart dedup

    # Analysis
    "topk_scenes": 5,
}


# =============================================================================
# PHASE 0: DENSE FRAME EXTRACTION
# =============================================================================

def get_video_info(video_path: str) -> Dict[str, Any]:
    """Get video metadata."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    duration = total_frames / fps if fps > 0 else 0

    cap.release()

    return {
        "fps": fps,
        "total_frames": total_frames,
        "width": width,
        "height": height,
        "duration": duration
    }


def sample_frames_dense(
    video_path: str,
    frame_interval: int,
    max_frames: int,
    output_dir: Path
) -> List[Dict]:
    """
    Extract every N frames from video.
    Memory efficient: writes to disk immediately.
    """
    candidates_dir = output_dir / "candidates"
    candidates_dir.mkdir(parents=True, exist_ok=True)

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    frames = []
    frame_number = 0
    extracted_count = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        # Only process every N frames
        if frame_number % frame_interval == 0:
            timestamp = frame_number / fps if fps > 0 else 0
            ms = int(timestamp * 1000)
            filename = f"frame_{frame_number}_t_{ms}.jpg"
            frame_path = candidates_dir / filename

            cv2.imwrite(str(frame_path), frame)

            frames.append({
                "frame_number": frame_number,
                "timestamp": timestamp,
                "frame_path": str(frame_path),
                "frame_bgr": frame  # Keep in memory for immediate processing
            })

            extracted_count += 1
            if extracted_count >= max_frames:
                print(f"  [CAP] Reached max frames limit ({max_frames})")
                break

        frame_number += 1

    cap.release()
    return frames


# =============================================================================
# PHASE 1: EARLY DEDUPLICATION (before quality analysis)
# =============================================================================

def compute_phash(frame_bgr: np.ndarray) -> Optional[imagehash.ImageHash]:
    """Compute perceptual hash for a frame."""
    try:
        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        pil_img = Image.fromarray(frame_rgb)
        return imagehash.phash(pil_img)
    except Exception as e:
        print(f"  [WARN] Could not hash frame: {e}")
        return None


def deduplicate_frames_early(
    frames: List[Dict],
    phash_threshold: int
) -> List[Dict]:
    """
    Group nearly-identical consecutive frames using pHash.
    Keep middle frame from each group (often the most stable).
    """
    if not frames:
        return []

    # Compute hashes
    for frame in frames:
        frame["_phash"] = compute_phash(frame["frame_bgr"])

    # Filter out frames where hashing failed
    frames = [f for f in frames if f["_phash"] is not None]

    if not frames:
        return []

    # Group consecutive similar frames
    groups = []
    current_group = [frames[0]]

    for i in range(1, len(frames)):
        prev_hash = frames[i - 1]["_phash"]
        curr_hash = frames[i]["_phash"]

        distance = prev_hash - curr_hash

        if distance <= phash_threshold:
            # Similar to previous, add to current group
            current_group.append(frames[i])
        else:
            # Different enough, start new group
            groups.append(current_group)
            current_group = [frames[i]]

    # Don't forget the last group
    groups.append(current_group)

    # Pick representative frame from each group (middle frame)
    representatives = []
    for group in groups:
        mid_idx = len(group) // 2
        rep = group[mid_idx]
        rep["_group_size"] = len(group)  # Track how many frames this represents
        representatives.append(rep)

    # Clean up hash field
    for frame in representatives:
        del frame["_phash"]

    return representatives


# =============================================================================
# PHASE 1b: EMBEDDING-BASED CLUSTERING (smarter deduplication)
# =============================================================================

def compute_siglip_embedding(frame_bgr: np.ndarray, processor, model, device) -> Optional[np.ndarray]:
    """Compute SigLIP image embedding for a frame."""
    try:
        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        pil_img = Image.fromarray(frame_rgb)

        with torch.no_grad():
            inputs = processor(images=pil_img, return_tensors="pt").to(device)
            outputs = model.get_image_features(**inputs)
            # Normalize embedding
            embedding = outputs / outputs.norm(dim=-1, keepdim=True)
            return embedding.cpu().numpy().flatten()
    except Exception as e:
        print(f"  [WARN] Could not compute embedding: {e}")
        return None


def compute_embeddings_batch(frames: List[Dict], processor, model, device, batch_size: int = 8) -> List[Dict]:
    """Compute SigLIP embeddings for all frames (batched for efficiency)."""
    print(f"  Computing SigLIP embeddings for {len(frames)} frames...")

    for i in range(0, len(frames), batch_size):
        batch = frames[i:i + batch_size]
        for frame in batch:
            frame_bgr = frame.get("frame_bgr")
            if frame_bgr is not None:
                embedding = compute_siglip_embedding(frame_bgr, processor, model, device)
                frame["_embedding"] = embedding

    # Filter out frames where embedding failed
    valid_frames = [f for f in frames if f.get("_embedding") is not None]
    print(f"  Successfully embedded {len(valid_frames)}/{len(frames)} frames")
    return valid_frames


def cluster_frames_by_embedding(
    frames: List[Dict],
    similarity_threshold: float = 0.85
) -> List[List[Dict]]:
    """
    Cluster frames using SigLIP embeddings with agglomerative clustering.
    Returns list of clusters (each cluster is a list of similar frames).
    """
    if len(frames) <= 1:
        return [frames] if frames else []

    # Extract embeddings into matrix
    embeddings = np.array([f["_embedding"] for f in frames])

    # Compute cosine distance matrix (1 - similarity)
    # Cosine similarity = dot product of normalized vectors
    similarity_matrix = np.dot(embeddings, embeddings.T)
    distance_matrix = 1 - similarity_matrix

    # Clip to [0, 2] range (numerical stability)
    distance_matrix = np.clip(distance_matrix, 0, 2)

    # Agglomerative clustering with distance threshold
    # distance_threshold = 1 - similarity_threshold (e.g., 0.85 sim -> 0.15 dist)
    distance_threshold = 1 - similarity_threshold

    clustering = AgglomerativeClustering(
        n_clusters=None,
        distance_threshold=distance_threshold,
        metric='precomputed',
        linkage='average'
    )

    labels = clustering.fit_predict(distance_matrix)

    # Group frames by cluster
    clusters = {}
    for idx, label in enumerate(labels):
        if label not in clusters:
            clusters[label] = []
        clusters[label].append(frames[idx])

    return list(clusters.values())


def deduplicate_frames_with_embeddings(
    frames: List[Dict],
    similarity_threshold: float = 0.85
) -> Tuple[List[Dict], List[List[Dict]]]:
    """
    Smart deduplication using SigLIP embeddings.
    Returns: (representative_frames, all_clusters)

    Unlike pHash which only catches near-identical frames,
    embeddings catch semantically similar images (same person, different pose).
    """
    if not frames:
        return [], []

    # Load SigLIP model
    processor, model, device = load_siglip_model()

    # Compute embeddings
    frames_with_embeddings = compute_embeddings_batch(frames, processor, model, device)

    if len(frames_with_embeddings) == 0:
        return [], []

    # Cluster similar frames
    print(f"  Clustering frames by visual similarity (threshold={similarity_threshold})...")
    clusters = cluster_frames_by_embedding(frames_with_embeddings, similarity_threshold)

    print(f"  Found {len(clusters)} distinct visual groups from {len(frames_with_embeddings)} frames")

    # For now, just return all clustered frames - selection happens later
    # Clean up embeddings to save memory
    representatives = []
    for cluster in clusters:
        # Pick middle frame as initial representative (will be re-ranked later)
        mid_idx = len(cluster) // 2
        rep = cluster[mid_idx]
        rep["_cluster_size"] = len(cluster)
        rep["_cluster_frames"] = cluster  # Keep reference for later scoring
        representatives.append(rep)

    return representatives, clusters


# =============================================================================
# PHASE 2: SOFT QUALITY SCORING (no rejections)
# =============================================================================

def compute_blur_score(frame_bgr: np.ndarray, face_cascade=None) -> Tuple[float, str]:
    """Compute blur score using Laplacian variance."""
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape

    # Try to focus on face/body region if detected
    if face_cascade is not None:
        faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60))

        if len(faces) > 0:
            fx, fy, fw, fh = max(faces, key=lambda f: f[2] * f[3])

            # Expand region
            expand_x = int(fw * 0.75)
            expand_y_up = int(fh * 0.3)
            expand_y_down = int(fh * 1.5)

            x1 = max(0, fx - expand_x)
            y1 = max(0, fy - expand_y_up)
            x2 = min(w, fx + fw + expand_x)
            y2 = min(h, fy + fh + expand_y_down)

            roi = gray[y1:y2, x1:x2]

            if roi.size > 0:
                blur_score = cv2.Laplacian(roi, cv2.CV_64F).var()
                return float(blur_score), "body"

    blur_score = cv2.Laplacian(gray, cv2.CV_64F).var()
    return float(blur_score), "full"


def compute_exposure_score(frame_bgr: np.ndarray) -> float:
    """Mean grayscale intensity [0-255]."""
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    return float(np.mean(gray))


def normalize_blur(blur_score: float, threshold: float, max_expected: float) -> float:
    """Normalize blur to [0, 1] where 1 = very sharp."""
    normalized = (blur_score - threshold) / (max_expected - threshold)
    return max(0.0, min(1.0, normalized))


def compute_soft_exposure_score(
    exposure: float,
    optimal_low: float,
    optimal_high: float,
    min_exposure: float,
    max_exposure: float
) -> float:
    """
    Compute soft exposure score [0, 1].
    1 = optimal exposure, 0 = extreme dark/bright (but NOT rejected).
    """
    if optimal_low <= exposure <= optimal_high:
        return 1.0

    if exposure < optimal_low:
        # Dark penalty (linear)
        if exposure <= min_exposure:
            return 0.0
        return (exposure - min_exposure) / (optimal_low - min_exposure)
    else:
        # Bright penalty (linear)
        if exposure >= max_exposure:
            return 0.0
        return (max_exposure - exposure) / (max_exposure - optimal_high)


def check_face_features(frame_bgr: np.ndarray, face_cascade, eye_cascade) -> Dict:
    """Check face presence and features."""
    if face_cascade is None:
        return {"face_present": False, "face_size": 0, "is_frontal": False, "eyes_open": True}

    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60))

    if len(faces) == 0:
        return {"face_present": False, "face_size": 0, "is_frontal": False, "eyes_open": True}

    # Use largest face
    x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
    face_size = int(w)

    # Check eyes
    eyes_open = True
    if eye_cascade is not None:
        face_roi = gray[y:y+h, x:x+w]
        eyes = eye_cascade.detectMultiScale(face_roi, scaleFactor=1.1, minNeighbors=3, minSize=(20, 20))
        eyes_open = len(eyes) >= 1

    return {
        "face_present": True,
        "face_size": face_size,
        "is_frontal": True,  # Haar cascade only detects frontal faces
        "eyes_open": eyes_open
    }


def normalize_face_size(face_size: int, frame_width: int) -> float:
    """Normalize face size to [0, 1] where 1 = close-up."""
    if frame_width == 0 or face_size == 0:
        return 0.0
    ratio = face_size / frame_width
    return min(1.0, ratio / 0.4)


def compute_composition_score(
    frame_bgr: np.ndarray,
    face_info: Dict
) -> Tuple[float, Dict]:
    """
    Compute composition score for Instagram-worthiness.

    Scores based on:
    - Rule of thirds positioning (face in power points)
    - Face size (not too small, not too cropped)
    - Headroom (space above head)
    - Visual balance

    Returns: (score, details_dict)
    """
    h, w = frame_bgr.shape[:2]
    details = {}

    if not face_info.get("face_present"):
        # No face - score based on general composition
        return 0.3, {"reason": "no_face", "fallback_score": 0.3}

    # Get face bounding box from face_info
    # We'll need to re-detect to get position - or use the face cascade data
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60))

    if len(faces) == 0:
        return 0.3, {"reason": "face_lost", "fallback_score": 0.3}

    # Use largest face
    fx, fy, fw, fh = max(faces, key=lambda f: f[2] * f[3])

    # 1. Face size score (Instagram optimal: 15-40% of frame width)
    face_ratio = fw / w
    if 0.15 <= face_ratio <= 0.40:
        size_score = 1.0  # Perfect range
    elif 0.10 <= face_ratio < 0.15:
        size_score = 0.7  # A bit small
    elif 0.40 < face_ratio <= 0.60:
        size_score = 0.8  # A bit big but OK
    elif face_ratio < 0.10:
        size_score = 0.3  # Too small
    else:
        size_score = 0.5  # Too cropped
    details["face_size_ratio"] = round(face_ratio, 3)
    details["size_score"] = round(size_score, 2)

    # 2. Rule of thirds - face center position
    face_center_x = fx + fw / 2
    face_center_y = fy + fh / 2

    # Thirds lines at 1/3 and 2/3 of frame
    third_x_left = w / 3
    third_x_right = 2 * w / 3
    third_y_top = h / 3
    third_y_bottom = 2 * h / 3

    # Score higher if face center is near thirds lines (not dead center)
    # Distance to nearest third line, normalized
    dist_to_third_x = min(
        abs(face_center_x - third_x_left),
        abs(face_center_x - third_x_right),
        abs(face_center_x - w / 2)  # Center is OK too for portraits
    ) / (w / 3)
    dist_to_third_y = min(
        abs(face_center_y - third_y_top),
        abs(face_center_y - third_y_bottom)
    ) / (h / 3)

    # Lower distance = better position
    position_score_x = max(0, 1 - dist_to_third_x)
    position_score_y = max(0, 1 - dist_to_third_y)
    position_score = (position_score_x + position_score_y) / 2

    details["face_center"] = (round(face_center_x / w, 2), round(face_center_y / h, 2))
    details["position_score"] = round(position_score, 2)

    # 3. Headroom score (ideal: face not touching top, some space above)
    headroom_ratio = fy / h
    if 0.05 <= headroom_ratio <= 0.25:
        headroom_score = 1.0  # Good headroom
    elif 0.02 <= headroom_ratio < 0.05:
        headroom_score = 0.7  # Tight
    elif headroom_ratio < 0.02:
        headroom_score = 0.3  # Cut off
    else:
        headroom_score = 0.8  # Too much space (OK but not ideal)
    details["headroom_ratio"] = round(headroom_ratio, 3)
    details["headroom_score"] = round(headroom_score, 2)

    # 4. Face not too close to edges
    edge_margin_x = min(fx, w - (fx + fw)) / w
    edge_margin_y = min(fy, h - (fy + fh)) / h
    edge_score = min(1.0, (edge_margin_x + edge_margin_y) * 5)  # Scale up
    details["edge_score"] = round(edge_score, 2)

    # Combined composition score
    composition_score = (
        0.30 * size_score +
        0.30 * position_score +
        0.20 * headroom_score +
        0.20 * edge_score
    )

    details["composition_score"] = round(composition_score, 3)
    return composition_score, details


def compute_expression_quality_score(emotion_result: Dict) -> float:
    """
    Score facial expression for Instagram-worthiness.
    Happy/surprised > neutral > negative emotions.
    """
    if not emotion_result.get("face_detected"):
        return 0.3  # No face = neutral score

    dominant = emotion_result.get("dominant_emotion", "").lower()
    probs = emotion_result.get("probabilities", {})

    # Ideal emotions for thumbnails
    positive_emotions = {"happy", "surprise"}
    neutral_emotions = {"neutral"}
    negative_emotions = {"sad", "angry", "fear", "disgust"}

    if dominant in positive_emotions:
        base_score = 1.0
    elif dominant in neutral_emotions:
        base_score = 0.6
    elif dominant in negative_emotions:
        base_score = 0.3
    else:
        base_score = 0.5

    # Boost if high confidence in positive emotion
    happy_conf = probs.get("happy", 0) / 100 if probs.get("happy", 0) > 1 else probs.get("happy", 0)
    if happy_conf > 0.5:
        base_score = min(1.0, base_score + 0.2)

    return base_score


def compute_quality_score(
    blur_norm: float,
    exposure_norm: float,
    face_info: Dict,
    emotion_result: Dict,
    frame_bgr: np.ndarray,
    frame_width: int,
    config: Dict
) -> Tuple[float, Dict]:
    """
    Compute final quality score as weighted sum including Instagram-worthiness.
    All frames get a score - no rejections.

    Returns: (score, score_breakdown)
    """
    w_blur = config.get("weight_blur", 0.20)
    w_exp = config.get("weight_exposure", 0.15)
    w_face = config.get("weight_face", 0.15)
    w_emotion = config.get("weight_emotion", 0.15)
    w_closeup = config.get("weight_closeup", 0.10)
    w_frontal = config.get("weight_frontal", 0.10)
    w_composition = config.get("weight_composition", 0.15)

    breakdown = {
        "blur_score": round(blur_norm, 3),
        "exposure_score": round(exposure_norm, 3),
    }

    # Base technical scores
    score = w_blur * blur_norm + w_exp * exposure_norm

    # Expression quality score (replaces simple happy check)
    expression_score = compute_expression_quality_score(emotion_result)
    score += w_emotion * expression_score
    breakdown["expression_score"] = round(expression_score, 3)

    # Composition score (NEW - Instagram-worthiness)
    composition_score, composition_details = compute_composition_score(frame_bgr, face_info)
    score += w_composition * composition_score
    breakdown["composition_score"] = round(composition_score, 3)
    breakdown["composition_details"] = composition_details

    if face_info["face_present"]:
        score += w_face
        breakdown["face_bonus"] = w_face

        # Closeup bonus
        closeup_norm = normalize_face_size(face_info["face_size"], frame_width)
        score += w_closeup * closeup_norm
        breakdown["closeup_score"] = round(closeup_norm, 3)

        # Frontal bonus
        if face_info["is_frontal"]:
            score += w_frontal
            breakdown["frontal_bonus"] = w_frontal

    breakdown["total_score"] = round(score, 4)
    return score, breakdown


def analyze_and_score_frames(
    frames: List[Dict],
    config: Dict,
    places_model=None,
    places_classes=None,
    places_transform=None,
    analyzer=None
) -> List[Dict]:
    """Apply soft quality scoring to all frames."""
    blur_thresh = config.get("blur_threshold", 30.0)
    blur_max = config.get("blur_max_expected", 5000.0)
    exp_opt_low = config.get("exposure_optimal_low", 60)
    exp_opt_high = config.get("exposure_optimal_high", 180)
    exp_min = config.get("exposure_min", 20)
    exp_max = config.get("exposure_max", 240)
    topk = config.get("topk_scenes", 5)

    # Initialize Haar cascades
    face_cascade = None
    eye_cascade = None
    try:
        face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        eye_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_eye.xml')
        if face_cascade.empty() or eye_cascade.empty():
            face_cascade = None
            eye_cascade = None
    except Exception:
        pass

    scored_frames = []

    for frame in frames:
        frame_bgr = frame.get("frame_bgr")
        if frame_bgr is None:
            continue

        frame_height, frame_width = frame_bgr.shape[:2]

        # Compute individual scores
        blur_score, blur_region = compute_blur_score(frame_bgr, face_cascade)
        exposure_score = compute_exposure_score(frame_bgr)

        # Normalize scores
        blur_norm = normalize_blur(blur_score, blur_thresh, blur_max)
        exposure_norm = compute_soft_exposure_score(
            exposure_score, exp_opt_low, exp_opt_high, exp_min, exp_max
        )

        # Face analysis
        face_info = check_face_features(frame_bgr, face_cascade, eye_cascade)

        # Emotion analysis
        if analyzer:
            emotion_result = analyzer.analyze_emotion(frame_bgr)
        else:
            emotion_result = analyze_emotion(frame_bgr)
        dominant_emotion = emotion_result.get("dominant_emotion")

        # Scene classification (optional)
        scene_result = None
        if places_model is not None:
            if analyzer:
                scene_result = analyzer.classify_scene(frame_bgr, topk=topk)
            else:
                scene_result = classify_scene(
                    frame_bgr, places_model, places_classes, places_transform, topk=topk
                )

        # Compute final quality score with Instagram-worthiness
        quality_score, score_breakdown = compute_quality_score(
            blur_norm, exposure_norm, face_info, emotion_result,
            frame_bgr, frame_width, config
        )

        # Build output
        scored_frame = {
            "frame_path": frame["frame_path"],
            "frame_number": frame["frame_number"],
            "timestamp": frame["timestamp"],
            "quality_score": round(quality_score, 4),
            "blur_score": round(blur_score, 2),
            "blur_normalized": round(blur_norm, 4),
            "blur_region": blur_region,
            "exposure_score": round(exposure_score, 2),
            "exposure_normalized": round(exposure_norm, 4),
            "face_present": face_info["face_present"],
            "face_size": face_info["face_size"],
            "is_frontal": face_info["is_frontal"],
            "eyes_open": face_info["eyes_open"],
            "emotion_analysis": emotion_result,
            "scene_analysis": scene_result,
            "score_breakdown": score_breakdown,  # NEW: detailed scoring
            "_group_size": frame.get("_group_size", 1),
            "_cluster_size": frame.get("_cluster_size", 1),
            "_embedding": frame.get("_embedding"),  # Keep for later if needed
        }
        scored_frames.append(scored_frame)

    return scored_frames


# =============================================================================
# PHASE 3: DIVERSE SELECTION (cluster-aware + temporal)
# =============================================================================

def select_diverse_frames(
    scored_frames: List[Dict],
    clusters: List[List[Dict]],
    max_final: int,
    video_duration: float
) -> List[Dict]:
    """
    Select highest scoring frames with guaranteed diversity.

    Strategy:
    1. For each cluster, pick the best-scoring frame
    2. If we have more clusters than max_final, pick top-scoring cluster representatives
    3. If we have fewer clusters than max_final, pick additional frames from larger clusters

    This ensures visual diversity (no two similar images) while maximizing quality.
    """
    if not scored_frames:
        return []

    # If no clustering was done, fall back to simple top-k
    if not clusters:
        scored_frames.sort(key=lambda x: x["quality_score"], reverse=True)
        selected = scored_frames[:max_final]
        selected.sort(key=lambda x: x["timestamp"])
        return selected

    # Step 1: For each cluster, find the best frame (already scored)
    cluster_representatives = []

    for cluster_idx, cluster in enumerate(clusters):
        if not cluster:
            continue

        # Find the best-scoring frame in this cluster
        best_frame = max(cluster, key=lambda x: x.get("quality_score", 0))
        best_frame["_cluster_id"] = cluster_idx
        best_frame["_cluster_size"] = len(cluster)
        cluster_representatives.append(best_frame)

    # Sort cluster representatives by quality score
    cluster_representatives.sort(key=lambda x: x["quality_score"], reverse=True)

    print(f"  {len(cluster_representatives)} clusters, selecting top {max_final} diverse frames")

    # Step 2: Select frames
    selected = []
    selected_cluster_ids = set()

    # First pass: one frame per cluster (up to max_final)
    for frame in cluster_representatives:
        if len(selected) >= max_final:
            break
        cluster_id = frame.get("_cluster_id")
        if cluster_id not in selected_cluster_ids:
            selected.append(frame)
            selected_cluster_ids.add(cluster_id)

    # If we still have slots and some clusters are large, consider 2nd-best from big clusters
    if len(selected) < max_final:
        remaining_slots = max_final - len(selected)
        # Find large clusters (>3 frames) and get their 2nd best
        for cluster_idx, cluster in enumerate(clusters):
            if remaining_slots <= 0:
                break
            if len(cluster) >= 3 and cluster_idx in selected_cluster_ids:
                # Sort cluster by score and get 2nd best
                sorted_cluster = sorted(cluster, key=lambda x: x.get("quality_score", 0), reverse=True)
                if len(sorted_cluster) > 1:
                    second_best = sorted_cluster[1]
                    # Only add if significantly different timestamp (>10% of video duration)
                    first_frame = next(f for f in selected if f.get("_cluster_id") == cluster_idx)
                    time_diff = abs(second_best["timestamp"] - first_frame["timestamp"])
                    if time_diff > video_duration * 0.1:
                        second_best["_cluster_id"] = f"{cluster_idx}_alt"
                        selected.append(second_best)
                        remaining_slots -= 1

    # Clean up internal fields
    for frame in selected:
        frame.pop("_cluster_id", None)
        frame.pop("_cluster_frames", None)
        frame.pop("_embedding", None)

    # Sort by timestamp for final output
    selected.sort(key=lambda x: x["timestamp"])

    # Log selection info
    for i, frame in enumerate(selected):
        print(f"    [{i+1}] t={frame['timestamp']:.1f}s, score={frame['quality_score']:.3f}, "
              f"cluster_size={frame.get('_cluster_size', 1)}")

    return selected


def select_with_temporal_diversity(
    scored_frames: List[Dict],
    max_final: int,
    num_buckets: int,
    min_per_bucket: int,
    video_duration: float
) -> List[Dict]:
    """
    Legacy selection function - kept for backwards compatibility.
    Select highest scoring frames while maintaining temporal coverage.
    """
    if not scored_frames:
        return []

    # Adjust buckets if video is very short
    actual_buckets = min(num_buckets, len(scored_frames))
    if actual_buckets < 1:
        actual_buckets = 1

    bucket_duration = video_duration / actual_buckets if video_duration > 0 else 1

    # Assign frames to buckets
    for frame in scored_frames:
        bucket_idx = int(frame["timestamp"] / bucket_duration) if bucket_duration > 0 else 0
        bucket_idx = min(bucket_idx, actual_buckets - 1)
        frame["_bucket"] = bucket_idx

    # Group by bucket
    buckets = {i: [] for i in range(actual_buckets)}
    for frame in scored_frames:
        buckets[frame["_bucket"]].append(frame)

    # Sort each bucket by quality score
    for bucket_idx in buckets:
        buckets[bucket_idx].sort(key=lambda x: x["quality_score"], reverse=True)

    # Phase 1: Guarantee min_per_bucket from each bucket
    selected = []
    selected_paths = set()

    for bucket_idx in range(actual_buckets):
        bucket_frames = buckets[bucket_idx]
        count = 0
        for frame in bucket_frames:
            if count >= min_per_bucket:
                break
            if frame["frame_path"] not in selected_paths:
                selected.append(frame)
                selected_paths.add(frame["frame_path"])
                count += 1

    # Phase 2: Fill remaining slots with globally highest scoring
    remaining_slots = max_final - len(selected)
    if remaining_slots > 0:
        # Get all unselected frames
        unselected = [f for f in scored_frames if f["frame_path"] not in selected_paths]
        unselected.sort(key=lambda x: x["quality_score"], reverse=True)

        for frame in unselected[:remaining_slots]:
            selected.append(frame)

    # Clean up internal fields
    for frame in selected:
        frame.pop("_bucket", None)
        frame.pop("_group_size", None)
        frame.pop("_cluster_size", None)
        frame.pop("_embedding", None)

    # Sort by timestamp for final output
    selected.sort(key=lambda x: x["timestamp"])

    return selected


# =============================================================================
# MAIN PIPELINE
# =============================================================================

def sanitize_filename(name: str) -> str:
    """Remove/replace problematic characters."""
    import re
    name = name.replace('｜', '-').replace('|', '-')
    name = re.sub(r'[<>:"/\\?*]', '_', name)
    name = name.encode('ascii', 'ignore').decode('ascii').strip()
    return name or "video"


def run_keyframe_pipeline_jb(
    video_path: str,
    config: Optional[Dict] = None,
    analyzer=None
) -> Dict[str, Any]:
    """
    Main entry point for JB edition keyframe extraction v2.

    Pipeline phases:
    0. Dense frame sampling (every N frames)
    1. Early deduplication (pHash for speed)
    1b. Smart clustering (SigLIP embeddings for semantic similarity)
    2. Soft quality scoring with Instagram-worthiness
    3. Diverse selection (cluster-aware)
    """
    cfg = {**DEFAULT_CONFIG_JB, **(config or {})}

    video_path = os.path.abspath(video_path)
    if not os.path.exists(video_path):
        raise FileNotFoundError(f"Video not found: {video_path}")

    video_stem = sanitize_filename(Path(video_path).stem)
    run_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_dir = Path(cfg.get("output_dir", "outputs/keyframes_jb")) / video_stem / run_id
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n{'='*60}")
    print(f"KEYFRAME EXTRACTION PIPELINE (JB Edition v2)")
    print(f"Video: {video_path}")
    print(f"Output: {output_dir}")
    print(f"Target: {cfg['max_final_frames']} diverse, Instagram-worthy frames")
    print(f"{'='*60}\n")

    # Get video info
    video_info = get_video_info(video_path)
    print(f"Video info: {video_info['total_frames']} frames, {video_info['duration']:.1f}s, {video_info['fps']:.1f} fps\n")

    # Phase 0: Dense frame extraction
    print(f"[Phase 0] Dense frame extraction (every {cfg['frame_interval']} frames)...")
    frames = sample_frames_dense(
        video_path,
        cfg["frame_interval"],
        cfg["max_frames_to_sample"],
        output_dir
    )
    print(f"  Extracted {len(frames)} frames\n")

    # Phase 1: Early deduplication with pHash (fast, catches near-identical)
    print("[Phase 1] Early deduplication (pHash)...")
    deduped = deduplicate_frames_early(frames, cfg["dedup_phash_threshold"])
    print(f"  {len(frames)} -> {len(deduped)} frames (removed {len(frames) - len(deduped)} near-identical)\n")

    # Phase 1b: Smart clustering with SigLIP embeddings (catches semantically similar)
    clusters = []
    use_embedding = cfg.get("use_embedding_clustering", True)

    if use_embedding and len(deduped) > 1:
        print("[Phase 1b] Smart clustering (SigLIP embeddings)...")
        similarity_threshold = cfg.get("embedding_similarity_threshold", 0.85)
        deduped, clusters = deduplicate_frames_with_embeddings(deduped, similarity_threshold)
        print(f"  Clustered into {len(clusters)} visually distinct groups\n")
    else:
        print("[Phase 1b] Skipping embedding clustering (disabled or not enough frames)")

    # Load Places365 model (optional, for scene classification)
    places_model, places_classes, places_transform = None, None, None
    if analyzer is None:
        print("[Phase 2] Loading analysis models...")
        try:
            places_model, places_classes, places_transform = load_places_model()
        except Exception as e:
            print(f"  Warning: Could not load Places365 model: {e}")
    else:
        print("[Phase 2] Using injected analyzer...")

    # Phase 2: Soft quality scoring with Instagram-worthiness
    print("[Phase 2] Quality scoring (blur, exposure, composition, expression)...")
    scored = analyze_and_score_frames(
        deduped, cfg, places_model, places_classes, places_transform, analyzer
    )
    print(f"  Scored {len(scored)} frames\n")

    # Also score all frames in clusters (for better selection)
    if clusters:
        print("  Re-scoring frames within clusters for optimal selection...")
        for cluster in clusters:
            for frame in cluster:
                if frame.get("quality_score") is None and frame.get("frame_bgr") is not None:
                    # Quick score without full analysis
                    frame_bgr = frame["frame_bgr"]
                    blur_score, _ = compute_blur_score(frame_bgr, None)
                    exposure = compute_exposure_score(frame_bgr)
                    blur_norm = normalize_blur(
                        blur_score,
                        cfg.get("blur_threshold", 30.0),
                        cfg.get("blur_max_expected", 5000.0)
                    )
                    exp_norm = compute_soft_exposure_score(
                        exposure,
                        cfg.get("exposure_optimal_low", 60),
                        cfg.get("exposure_optimal_high", 180),
                        cfg.get("exposure_min", 20),
                        cfg.get("exposure_max", 240)
                    )
                    # Simple score for cluster members
                    frame["quality_score"] = (blur_norm + exp_norm) / 2

    # Phase 3: Diverse selection
    print(f"[Phase 3] Diverse selection (max {cfg['max_final_frames']} frames)...")
    if clusters:
        selected = select_diverse_frames(
            scored,
            clusters,
            cfg["max_final_frames"],
            video_info["duration"]
        )
    else:
        # Fallback to temporal diversity if no clustering
        selected = select_with_temporal_diversity(
            scored,
            cfg["max_final_frames"],
            cfg["temporal_buckets"],
            cfg["min_per_bucket"],
            video_info["duration"]
        )
    print(f"  Selected {len(selected)} diverse, high-quality frames\n")

    # Copy selected frames to selected/ directory
    selected_dir = output_dir / "selected"
    selected_dir.mkdir(exist_ok=True)

    import shutil
    for frame in selected:
        src = Path(frame["frame_path"])
        dst = selected_dir / src.name
        if src.exists():
            shutil.copy2(src, dst)
            frame["selected_path"] = str(dst)

    # Save metadata
    all_scored_json = output_dir / "all_scored.json"
    selected_json = output_dir / "selected.json"
    selected_ranked_json = output_dir / "selected_ranked.json"

    # Clean non-serializable fields
    def clean_frame(f):
        """Remove non-serializable and internal fields."""
        f.pop("frame_bgr", None)
        f.pop("_embedding", None)
        f.pop("_cluster_frames", None)
        f.pop("_phash", None)
        # Convert numpy arrays in score_breakdown if present
        if "score_breakdown" in f:
            breakdown = f["score_breakdown"]
            if "composition_details" in breakdown:
                details = breakdown["composition_details"]
                for key, val in list(details.items()):
                    if isinstance(val, (np.ndarray, np.floating)):
                        details[key] = float(val)
        return f

    for f in scored:
        clean_frame(f)
    for f in selected:
        clean_frame(f)

    with open(all_scored_json, "w") as f:
        json.dump(scored, f, indent=2)

    with open(selected_json, "w") as f:
        json.dump(selected, f, indent=2)

    selected_ranked = sorted(selected, key=lambda x: x["quality_score"], reverse=True)
    with open(selected_ranked_json, "w") as f:
        json.dump(selected_ranked, f, indent=2)

    # Summary
    print(f"{'='*60}")
    print("SUMMARY - Instagram-Worthy Frames Selected")
    print(f"{'='*60}")
    print(f"  Frames sampled:      {len(frames)}")
    print(f"  After pHash dedup:   {len(deduped)}")
    print(f"  Visual clusters:     {len(clusters) if clusters else 'N/A'}")
    print(f"  Final selected:      {len(selected)}")
    print(f"\n  Quality scores:")
    for i, frame in enumerate(selected_ranked[:5]):
        print(f"    {i+1}. score={frame['quality_score']:.3f} @ t={frame['timestamp']:.1f}s")
    print(f"\n  Output directory:    {output_dir}")
    print(f"  Selected JSON:       {selected_json}")
    print(f"{'='*60}\n")

    return {
        "selected_frames": selected,
        "selected_frames_ranked": selected_ranked,
        "output_dir": str(output_dir),
        "candidates_dir": str(output_dir / "candidates"),
        "selected_dir": str(selected_dir),
        "all_scored_json": str(all_scored_json),
        "selected_json": str(selected_json),
        "selected_ranked_json": str(selected_ranked_json),
        "stats": {
            "total_frames_sampled": len(frames),
            "after_deduplication": len(deduped),
            "final_selected": len(selected)
        }
    }
