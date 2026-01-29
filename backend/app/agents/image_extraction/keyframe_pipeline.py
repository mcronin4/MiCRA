

import os
import json
import math
import cv2
import numpy as np
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple

import imagehash
from PIL import Image

# Import from sibling modules
from .scene_detection import detect_scenes
from .analyze_frame import (
    load_places_model,
    classify_scene,
    analyze_emotion
)

#config

DEFAULT_CONFIG = {
    # Sampling
    "sample_period_seconds": 5.0,
    "min_extra": 0,
    "max_extra": 3,
    
    # Quality thresholds
    "blur_threshold": 30.0,  #laplacian variance
    "exposure_low": 50,
    "exposure_high": 175,
    
     "min_face_size_for_eye_check": 150,  #inimum face width (pixels) to apply eyes-closed rejection
    
    # Scoring weights
    "face_bias_weight": 0.2,
    "blur_weight": 0.3,
    "exposure_weight": 0.3,
    "happy_emotion_weight": 0.15,
    "face_closeup_weight": 0.1,   # Boost for larger/closer faces
    "frontal_face_weight": 0.2,   # Boost for faces looking at camera
    
    # Selection
    "per_scene_target": 2,
    "max_total_frames": 25,
    
    # Deduplication
    "dedup_threshold": 8,
    
    # Scene detection
    "scene_threshold": 30.0,
    
    # Analysis
    "topk_scenes": 5,
}


#phase 0: scene detection

def get_video_duration(video_path: str) -> float:
    #get video duration in seconds
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")
    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
    cap.release()
    return frame_count / fps if fps > 0 else 0


def run_scene_detection(video_path: str, threshold: float) -> List[Dict]:

    # Detect scenes and convert to simple dict format.
    scene_list = detect_scenes(video_path, threshold=threshold)
    
    if not scene_list:
        duration = get_video_duration(video_path)
        return [{"scene_id": 0, "start_time_seconds": 0.0, "end_time_seconds": duration}]
    
    scenes = []
    for i, (start, end) in enumerate(scene_list):
        scenes.append({
            "scene_id": i,
            "start_time_seconds": start.get_seconds(),
            "end_time_seconds": end.get_seconds()
        })
    return scenes


#phase 1: candidate sampling

def sample_timestamps(scene_start: float, scene_end: float, config: Dict) -> List[float]:
    #uniform-per-scene deterministic sampling that avoids boundaries, returns list of timestamps
    D = scene_end - scene_start #scene duration
    if D <= 0:
        return [scene_start]
    
    sample_period = config.get("sample_period_seconds", 5.0) #sample period in seconds
    min_extra = config.get("min_extra", 0) #min extra frames per scene
    max_extra = config.get("max_extra", 3) #max extra frames per scene
    
    # extra = clamp(floor(D / sample_period), min_extra, max_extra)
    extra = max(min_extra, min(max_extra, int(D / sample_period)))
    n_scene = 1 + extra
    
    # Evenly space timestamps inside scene: t_i = start + (i+1) * D / (n_scene+1)
    timestamps = []
    for i in range(n_scene):
        t = scene_start + (i + 1) * D / (n_scene + 1)
        timestamps.append(t)
    
    return timestamps


def generate_all_candidates(scenes: List[Dict], config: Dict) -> List[Dict]:
    #generate candidate timestamps for all scenes, returns list of {scene_id, timestamp}
    candidates = []
    for scene in scenes:
        #every scene gets a list of timestamps
        timestamps = sample_timestamps(
            scene["start_time_seconds"],
            scene["end_time_seconds"],
            config
        )
        for ts in timestamps:
            candidates.append({
                "scene_id": scene["scene_id"],
                "timestamp": ts
            })
    return candidates


#phase 2: frame extraction

def extract_frame_at_timestamp(video_path: str, timestamp: float) -> Optional[np.ndarray]:
    #extract a single frame at the given timestamp in seconds
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return None
    
    cap.set(cv2.CAP_PROP_POS_MSEC, timestamp * 1000)
    ret, frame = cap.read()
    cap.release()
    
    return frame if ret else None


def extract_candidates(
    video_path: str,
    candidates: List[Dict],
    output_dir: Path #path where to save the frames, using outputs
) -> List[Dict]:
    #extract frames at candidate timestamps and save to disk, returns updated candidates with frame_path added
    candidates_dir = output_dir / "candidates"
    candidates_dir.mkdir(parents=True, exist_ok=True)
    
    extracted = []
    for cand in candidates:
        frame = extract_frame_at_timestamp(video_path, cand["timestamp"])
        if frame is None:
            print(f"  [SKIP] Failed to decode frame at t={cand['timestamp']:.2f}s")
            continue
        
        ms = int(cand["timestamp"] * 1000)
        filename = f"scene_{cand['scene_id']}_t_{ms}.jpg"
        frame_path = candidates_dir / filename
        
        # Write and verify
        success = cv2.imwrite(str(frame_path), frame)
        
        extracted.append({
            **cand,
            "frame_path": str(frame_path),
            "frame_bgr": frame  # Keep in memory for filtering
        })
    
    return extracted


#phase 3: quality filtering + analysis

def compute_blur_score(
    frame_bgr: np.ndarray, 
    face_cascade=None,
    focus_on_subject: bool = True
) -> Tuple[float, str]:
    #variance of laplacian blur detection, focuses on face/body region if detected, returns (blur_score, region_used)
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    
    if focus_on_subject and face_cascade is not None:
        faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60))
        
        if len(faces) > 0:
            # Use largest face
            fx, fy, fw, fh = max(faces, key=lambda f: f[2] * f[3])
            
            # Expand region to include upper body (2x face height below, 1.5x width on sides)
            expand_x = int(fw * 0.75)
            expand_y_up = int(fh * 0.3)  # A bit above head
            expand_y_down = int(fh * 1.5)  # Below face for shoulders/body
            
            x1 = max(0, fx - expand_x)
            y1 = max(0, fy - expand_y_up)
            x2 = min(w, fx + fw + expand_x)
            y2 = min(h, fy + fh + expand_y_down)
            
            roi = gray[y1:y2, x1:x2]
            
            if roi.size > 0:
                blur_score = cv2.Laplacian(roi, cv2.CV_64F).var()
                return float(blur_score), "body"
    
    # Fallback: full image blur
    blur_score = cv2.Laplacian(gray, cv2.CV_64F).var()
    return float(blur_score), "full"


def compute_exposure_score(frame_bgr: np.ndarray) -> float:
    #mean grayscale intensity [0-255]
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    return float(np.mean(gray))


def check_eyes_open(frame_bgr: np.ndarray, eye_cascade, face_cascade) -> Tuple[bool, bool, int, bool]:
    #haar cascade eye detection, returns (face_detected, eyes_open, face_size, is_frontal)
    if eye_cascade is None or face_cascade is None:
        return False, True, 0, False
    
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    
    # Detect frontal faces
    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60))
    if len(faces) == 0:
        return False, True, 0, False  # No face, don't reject
    
    # Use largest face
    x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
    face_size = int(w)  # Width of largest face (convert from numpy int32)
    face_roi = gray[y:y+h, x:x+w]
    
    # Detect eyes within face region
    eyes = eye_cascade.detectMultiScale(face_roi, scaleFactor=1.1, minNeighbors=3, minSize=(20, 20))
    
    # If we detect at least one eye, consider eyes "open"
    eyes_open = len(eyes) >= 1
    is_frontal = True  # Haar cascade only detects frontal faces
    
    return True, eyes_open, face_size, is_frontal


def normalize_blur(blur_score: float, threshold: float) -> float:
    #normalize blur score to [0,1], 0 = at threshold, 1 = very sharp
    # Typical blur scores range from threshold to ~10000+
    max_expected = 5000.0
    normalized = (blur_score - threshold) / (max_expected - threshold)
    return max(0.0, min(1.0, normalized))


def normalize_exposure(exposure: float, low: float, high: float) -> float:
    #normalize exposure to [0,1], 1 = optimal middle, 0 = at boundaries
    mid = (low + high) / 2
    half_range = (high - low) / 2
    distance_from_mid = abs(exposure - mid)
    return max(0.0, 1.0 - distance_from_mid / half_range)


def normalize_face_size(face_size: int, frame_width: int) -> float:
    #normalize face size relative to frame width, returns [0,1] where 1 = close-up
    if frame_width == 0 or face_size == 0:
        return 0.0
    ratio = face_size / frame_width
    # Typical close-up: face is ~30-50% of frame width
    # Scale so 0.4 ratio = 1.0 score
    normalized = min(1.0, ratio / 0.4)
    return normalized


def compute_quality_score(
    blur_norm: float,
    exposure_norm: float,
    face_present: int,
    dominant_emotion: Optional[str],
    face_size: int,
    frame_width: int,
    is_frontal: bool,
    config: Dict
) -> float:
    #deterministic quality score combining blur, exposure, face bias, emotion, and face positioning
    w_blur = config.get("blur_weight", 0.3)
    w_exp = config.get("exposure_weight", 0.3)
    w_face = config.get("face_bias_weight", 0.2)
    w_happy = config.get("happy_emotion_weight", 0.15)
    w_closeup = config.get("face_closeup_weight", 0.25)
    w_frontal = config.get("frontal_face_weight", 0.20)
    
    score = w_blur * blur_norm + w_exp * exposure_norm + w_face * face_present
    
    # Boost score if dominant emotion is happy
    if dominant_emotion and dominant_emotion.lower() == "happy":
        score += w_happy
    
    # Boost for close-up faces (larger faces score higher)
    if face_present and face_size > 0:
        closeup_norm = normalize_face_size(face_size, frame_width)
        score += w_closeup * closeup_norm
    
    # Boost for frontal faces (looking at camera)
    if face_present and is_frontal:
        score += w_frontal
    
    return score


def filter_and_analyze_candidates(
    candidates: List[Dict],
    config: Dict,
    places_model=None,
    places_classes=None,
    places_transform=None,
    analyzer=None
) -> List[Dict]:
    #apply quality filters and run analysis on each candidate, returns (passed, rejected) tuples
    blur_thresh = config.get("blur_threshold", 100.0)
    exp_low = config.get("exposure_low", 30)
    exp_high = config.get("exposure_high", 225)
    topk = config.get("topk_scenes", 5)
    min_face_for_eye_check = config.get("min_face_size_for_eye_check", 150)
    
    # Initialize OpenCV Haar cascades for eye detection
    face_cascade = None
    eye_cascade = None
    try:
        face_cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        eye_cascade_path = cv2.data.haarcascades + 'haarcascade_eye.xml'
        face_cascade = cv2.CascadeClassifier(face_cascade_path)
        eye_cascade = cv2.CascadeClassifier(eye_cascade_path)
        if face_cascade.empty() or eye_cascade.empty():
            print("  ⚠️ Could not load Haar cascades, skipping eye-open detection")
            face_cascade = None
            eye_cascade = None
    except Exception as e:
        print(f"  ⚠️ Haar cascade init failed: {e}, skipping eye-open detection")
    
    passed = []
    rejected = []
    rejected_counts = {"blur": 0, "exposure": 0, "eyes_closed": 0}
    
    for cand in candidates:
        frame_bgr = cand.get("frame_bgr")
        if frame_bgr is None:
            continue
        
        frame_height, frame_width = frame_bgr.shape[:2]
        
        # Blur check (focused on face/body region if detected)
        blur_score, blur_region = compute_blur_score(frame_bgr, face_cascade, focus_on_subject=True)
        if blur_score < blur_thresh:
            rejected_counts["blur"] += 1
            rejected.append({
                "frame_path": cand["frame_path"],
                "timestamp": cand["timestamp"],
                "scene_id": cand["scene_id"],
                "rejection_reason": "blur",
                "blur_score": round(blur_score, 2),
                "blur_region": blur_region,
                "blur_threshold": blur_thresh
            })
            continue
        
        # Exposure check
        exposure_score = compute_exposure_score(frame_bgr)
        if exposure_score < exp_low or exposure_score > exp_high:
            rejected_counts["exposure"] += 1
            reason = "too_dark" if exposure_score < exp_low else "too_bright"
            rejected.append({
                "frame_path": cand["frame_path"],
                "timestamp": cand["timestamp"],
                "scene_id": cand["scene_id"],
                "rejection_reason": reason,
                "exposure_score": round(exposure_score, 2),
                "exposure_range": [exp_low, exp_high]
            })
            continue
        
        # Eye check - returns (face_detected, eyes_open, face_size, is_frontal)
        face_detected_cv, eyes_open, face_size, is_frontal = check_eyes_open(frame_bgr, eye_cascade, face_cascade)
        
        # Only reject for closed eyes if the face is large enough (close-up)
        if face_detected_cv and not eyes_open and face_size >= min_face_for_eye_check:
            rejected_counts["eyes_closed"] += 1
            rejected.append({
                "frame_path": cand["frame_path"],
                "timestamp": cand["timestamp"],
                "scene_id": cand["scene_id"],
                "rejection_reason": "eyes_closed",
                "blur_score": round(blur_score, 2),
                "exposure_score": round(exposure_score, 2),
                "face_size": face_size,
                "min_face_size_for_eye_check": min_face_for_eye_check
            })
            continue
        
        # Run emotion analysis (use injected analyzer or default)
        if analyzer:
            emotion_result = analyzer.analyze_emotion(frame_bgr)
        else:
            emotion_result = analyze_emotion(frame_bgr)
        face_present = 1 if emotion_result.get("face_detected", False) else 0
        dominant_emotion = emotion_result.get("dominant_emotion")
        
        # Run scene classification (use injected analyzer or default)
        if analyzer:
            scene_result = analyzer.classify_scene(frame_bgr, topk=topk)
        else:
            scene_result = classify_scene(
                frame_bgr, places_model, places_classes, places_transform, topk=topk
            )
        
        # Compute normalized scores
        blur_norm = normalize_blur(blur_score, blur_thresh)
        exposure_norm = normalize_exposure(exposure_score, exp_low, exp_high)
        quality_score = compute_quality_score(
            blur_norm, exposure_norm, face_present, dominant_emotion,
            face_size, frame_width, is_frontal, config
        )
        
        # Build metadata
        cand_out = {
            "frame_path": cand["frame_path"],
            "timestamp": cand["timestamp"],
            "scene_id": cand["scene_id"],
            "quality_score": round(quality_score, 4),
            "face_present": face_present,
            "face_size": face_size,
            "is_frontal": is_frontal,
            "blur_score": round(blur_score, 2),
            "blur_region": blur_region,  # 'body' if focused on face/body, 'full' otherwise
            "exposure_score": round(exposure_score, 2),
            "eyes_open": eyes_open,
            "emotion_analysis": emotion_result,
            "scene_analysis": scene_result
        }
        passed.append(cand_out)
    
    print(f"  Rejected: blur={rejected_counts['blur']}, exposure={rejected_counts['exposure']}, eyes_closed={rejected_counts['eyes_closed']}")
    return passed, rejected


#phase 4: deduplication

def compute_phash(frame_path: str) -> Optional[imagehash.ImageHash]:
    #compute perceptual hash for an image
    try:
        img = Image.open(frame_path)
        return imagehash.phash(img)
    except Exception as e:
        print(f"  [WARN] Could not hash {frame_path}: {e}")
        return None


def deduplicate_candidates(candidates: List[Dict], config: Dict) -> List[Dict]:
    #remove near-duplicates using phash, keeps higher quality_score frame when duplicates detected
    if not candidates:
        return []
    
    threshold = config.get("dedup_threshold", 8)
    
    # Compute hashes, skip frames that can't be hashed
    valid_candidates = []
    for cand in candidates:
        phash = compute_phash(cand["frame_path"])
        if phash is not None:
            cand["_phash"] = phash
            valid_candidates.append(cand)
    
    candidates = valid_candidates
    
    # Sort by quality_score descending so we keep best first
    sorted_cands = sorted(candidates, key=lambda x: x["quality_score"], reverse=True)
    
    kept = []
    for cand in sorted_cands:
        is_dup = False
        for existing in kept:
            dist = cand["_phash"] - existing["_phash"]
            #if the phash difference is less than 8 it's a duplicate
            if dist <= threshold:
                is_dup = True
                break
        if not is_dup:
            #its not a duplicate, add it to the kept list
            kept.append(cand)
    
    # Remove internal hash field, dont need ts anymore
    for cand in kept:
        del cand["_phash"]
    
    print(f"  Deduplication: {len(candidates)} -> {len(kept)} frames")
    return kept


#phase 5: selection

def select_final_frames(candidates: List[Dict], config: Dict) -> List[Dict]:
    #select final keyframes ensuring coverage and respecting global cap
    per_scene_target = config.get("per_scene_target", 2)
    max_total = config.get("max_total_frames", 25)
    
    if not candidates:
        return []
    
    # Group by scene_id
    by_scene = {}
    for cand in candidates:
        sid = cand["scene_id"]
        if sid not in by_scene:
            by_scene[sid] = []
        by_scene[sid].append(cand)
    
    # Sort each scene's candidates by quality_score descending
    for sid in by_scene:
        by_scene[sid].sort(key=lambda x: x["quality_score"], reverse=True)
    
    # Pick top per_scene_target from each scene
    selected = []
    for sid in sorted(by_scene.keys()):
        scene_frames = by_scene[sid][:per_scene_target]
        selected.extend(scene_frames)
    
    # Apply global cap if needed
    if len(selected) > max_total:
        # Ensure at least 1 per scene, then fill with highest quality
        guaranteed = []
        extra_pool = []
        
        for sid in sorted(by_scene.keys()):
            if by_scene[sid]:
                guaranteed.append(by_scene[sid][0])
                extra_pool.extend(by_scene[sid][1:per_scene_target])
        
        # Sort extra pool by quality
        extra_pool.sort(key=lambda x: x["quality_score"], reverse=True)
        
        # How many more can we add?
        remaining_slots = max_total - len(guaranteed)
        selected = guaranteed + extra_pool[:remaining_slots]
    
    # Final sort by scene_id then timestamp for deterministic ordering
    selected.sort(key=lambda x: (x["scene_id"], x["timestamp"]))
    
    return selected


#main pipeline

def sanitize_filename(name: str) -> str:
    #remove/replace characters that cause issues in file paths
    import re
    # Replace problematic Unicode characters and Windows-forbidden chars
    name = name.replace('｜', '-').replace('|', '-')
    name = re.sub(r'[<>:"/\\?*]', '_', name)
    # Remove other non-ASCII if causing issues
    name = name.encode('ascii', 'ignore').decode('ascii').strip()
    return name or "video"


def run_keyframe_pipeline(video_path: str, config: Optional[Dict] = None, analyzer=None) -> Dict[str, Any]:
    #main entry point for keyframe extraction pipeline, returns dict with selected_frames, output paths, and stats
    # Merge config with defaults
    cfg = {**DEFAULT_CONFIG, **(config or {})}
    
    video_path = os.path.abspath(video_path)
    if not os.path.exists(video_path):
        raise FileNotFoundError(f"Video not found: {video_path}")
    
    video_stem = sanitize_filename(Path(video_path).stem)
    run_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_dir = Path(cfg.get("output_dir", "outputs/keyframes")) / video_stem / run_id
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"\n{'='*60}")
    print(f"KEYFRAME EXTRACTION PIPELINE")
    print(f"Video: {video_path}")
    print(f"Output: {output_dir}")
    print(f"{'='*60}\n")
    
    # Phase 0: Scene detection
    print("[Phase 0] Detecting scenes...")
    scenes = run_scene_detection(video_path, cfg["scene_threshold"])
    print(f"  Found {len(scenes)} scene(s)\n")
    
    # Phase 1: Candidate sampling
    print("[Phase 1] Generating candidate timestamps...")
    candidates = generate_all_candidates(scenes, cfg)
    print(f"  Generated {len(candidates)} candidate timestamps\n")
    
    # Phase 2: Frame extraction
    print("[Phase 2] Extracting frames...")
    candidates = extract_candidates(video_path, candidates, output_dir)
    print(f"  Extracted {len(candidates)} frames\n")
    
    # Load Places365 model once (skip if using injected analyzer)
    places_model, places_classes, places_transform = None, None, None
    if analyzer is None:
        print("[Phase 3] Loading analysis models...")
        places_model, places_classes, places_transform = load_places_model()
    else:
        print("[Phase 3] Using injected analyzer...")
    
    # Phase 3: Quality filtering + analysis
    print("[Phase 3] Filtering and analyzing candidates...")
    filtered, rejected = filter_and_analyze_candidates(
        candidates, cfg, places_model, places_classes, places_transform, analyzer=analyzer
    )
    print(f"  {len(filtered)} candidates passed filters\n")
    
    # Phase 4: Deduplication
    print("[Phase 4] Deduplicating...")
    deduped = deduplicate_candidates(filtered, cfg)
    print()
    
    # Phase 5: Selection
    print("[Phase 5] Selecting final frames...")
    selected = select_final_frames(deduped, cfg)
    print(f"  Selected {len(selected)} final keyframes\n")
    
    # Copy selected frames to selected/ directory
    selected_dir = output_dir / "selected"
    selected_dir.mkdir(exist_ok=True)
    
    for frame in selected:
        src = Path(frame["frame_path"])
        dst = selected_dir / src.name
        if src.exists():
            import shutil
            shutil.copy2(src, dst)
            frame["selected_path"] = str(dst)
    
    # Save metadata JSON files
    candidates_json = output_dir / "candidates.json"
    rejected_json = output_dir / "rejected.json"
    selected_json = output_dir / "selected.json"
    selected_ranked_json = output_dir / "selected_ranked.json"
    
    # Clean for JSON (remove non-serializable fields)
    for f in filtered:
        f.pop("frame_bgr", None)
        f.pop("_phash", None)
    for f in selected:
        f.pop("_phash", None)
    
    with open(candidates_json, "w") as f:
        json.dump(filtered, f, indent=2)
    
    with open(rejected_json, "w") as f:
        json.dump(rejected, f, indent=2)
    
    with open(selected_json, "w") as f:
        json.dump(selected, f, indent=2)
    
    # Save ranked version (sorted by quality_score descending)
    selected_ranked = sorted(selected, key=lambda x: x["quality_score"], reverse=True)
    with open(selected_ranked_json, "w") as f:
        json.dump(selected_ranked, f, indent=2)
    
    # Summary
    print(f"{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    print(f"  Scenes detected:     {len(scenes)}")
    print(f"  Candidates sampled:  {len(candidates)}")
    print(f"  Passed filters:      {len(filtered)}")
    print(f"  After dedup:         {len(deduped)}")
    print(f"  Final selected:      {len(selected)}")
    print(f"\n  Output directory:    {output_dir}")
    print(f"  Candidates JSON:     {candidates_json}")
    print(f"  Rejected JSON:       {rejected_json}")
    print(f"  Selected JSON:       {selected_json}")
    print(f"  Ranked JSON:         {selected_ranked_json}")
    print(f"{'='*60}\n")
    
    return {
        "selected_frames": selected,
        "selected_frames_ranked": selected_ranked,
        "output_dir": str(output_dir),
        "candidates_dir": str(output_dir / "candidates"),
        "selected_dir": str(selected_dir),
        "candidates_json": str(candidates_json),
        "rejected_json": str(rejected_json),
        "selected_json": str(selected_json),
        "selected_ranked_json": str(selected_ranked_json),
        "stats": {
            "scenes_detected": len(scenes),
            "candidates_sampled": len(candidates),
            "rejected": len(rejected),
            "passed_filters": len(filtered),
            "after_dedup": len(deduped),
            "final_selected": len(selected)
        }
    }

