#!/usr/bin/env python

import argparse
import sys
import os
import random

# Add parent paths for imports when running as script
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from app.agents.image_extraction.keyframe_pipeline import run_keyframe_pipeline, DEFAULT_CONFIG
from app.agents.image_extraction.scene_detection import download_youtube_video


def generate_debug_visualizations(output_dir: str, num_samples: int = 5):

    import cv2
    import numpy as np
    from pathlib import Path
    
    try:
        import matplotlib.pyplot as plt
        import matplotlib.patches as patches
    except ImportError:
        print("⚠️ matplotlib not installed. Skipping debug visualizations.")
        print("   Install with: pip install matplotlib")
        return
    
    candidates_dir = Path(output_dir) / "candidates"
    debug_dir = Path(output_dir) / "debug_viz"
    debug_dir.mkdir(exist_ok=True)
    
    # Get all candidate images
    image_files = list(candidates_dir.glob("*.jpg"))
    if not image_files:
        print("⚠️ No candidate images found for debug visualization.")
        return
    
    #Randomly sample
    sample_files = random.sample(image_files, min(num_samples, len(image_files)))
    
    #Load Haar cascades
    face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    eye_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_eye.xml')
    
    print(f"\n🔍 Generating debug visualizations for {len(sample_files)} frames...")
    
    for img_path in sample_files:
        # Read image
        img_bgr = cv2.imread(str(img_path))
        if img_bgr is None:
            continue
        
        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        
        h, w = gray.shape
        
        # Detect faces
        faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60))
        
        # Compute blur region (same logic as pipeline)
        blur_region = "full"
        blur_roi_coords = None
        if len(faces) > 0:
            fx, fy, fw, fh = max(faces, key=lambda f: f[2] * f[3])
            #Expand for body region
            expand_x = int(fw * 0.75)
            expand_y_up = int(fh * 0.3)
            expand_y_down = int(fh * 1.5)
            x1 = max(0, fx - expand_x)
            y1 = max(0, fy - expand_y_up)
            x2 = min(w, fx + fw + expand_x)
            y2 = min(h, fy + fh + expand_y_down)
            blur_roi_coords = (x1, y1, x2 - x1, y2 - y1)
            blur_region = "body"
            roi_gray = gray[y1:y2, x1:x2]
            blur_score = cv2.Laplacian(roi_gray, cv2.CV_64F).var()
        else:
            blur_score = cv2.Laplacian(gray, cv2.CV_64F).var()
        
        # Compute full Laplacian for visualization
        laplacian = cv2.Laplacian(gray, cv2.CV_64F)
        laplacian_abs = np.abs(laplacian)
        
        # Create figure with 3 subplots
        fig, axes = plt.subplots(1, 3, figsize=(18, 6))
        fig.suptitle(f"{img_path.name}\nBlur Score: {blur_score:.1f} (region: {blur_region})", fontsize=12, fontweight='bold')
        
        # 1. Original image with face/eye boxes
        axes[0].imshow(img_rgb)
        axes[0].set_title("Original + Face Detection", fontsize=10)
        axes[0].axis('off')
        
        for (x, y, w, h) in faces:
            # Face box (green)
            rect = patches.Rectangle((x, y), w, h, linewidth=2, edgecolor='lime', facecolor='none')
            axes[0].add_patch(rect)
            axes[0].text(x, y-5, f"Face {w}x{h}px", color='lime', fontsize=8, 
                        bbox=dict(boxstyle='round', facecolor='black', alpha=0.7))
            
            # Detect eyes within face
            face_roi_gray = gray[y:y+h, x:x+w]
            eyes = eye_cascade.detectMultiScale(face_roi_gray, scaleFactor=1.1, minNeighbors=3, minSize=(20, 20))
            
            for (ex, ey, ew, eh) in eyes:
                # Eye box (cyan) - offset by face position
                eye_rect = patches.Rectangle((x+ex, y+ey), ew, eh, linewidth=1.5, edgecolor='cyan', facecolor='none')
                axes[0].add_patch(eye_rect)
        
        if len(faces) == 0:
            axes[0].text(10, 30, "No face detected", color='red', fontsize=10,
                        bbox=dict(boxstyle='round', facecolor='black', alpha=0.7))
        
        # 2. Blur/Sharpness map (Laplacian absolute values) with focus region
        im = axes[1].imshow(laplacian_abs, cmap='hot')
        axes[1].set_title("Blur Map (Laplacian)\nBrighter = Sharper edges", fontsize=10)
        axes[1].axis('off')
        plt.colorbar(im, ax=axes[1], fraction=0.046, pad=0.04)
        
        # Draw blur focus region (yellow dashed box)
        if blur_roi_coords:
            rx, ry, rw, rh = blur_roi_coords
            blur_rect = patches.Rectangle((rx, ry), rw, rh, linewidth=2, 
                                          edgecolor='yellow', facecolor='none', linestyle='--')
            axes[1].add_patch(blur_rect)
            axes[1].text(rx, ry-5, "Blur Focus Region", color='yellow', fontsize=8,
                        bbox=dict(boxstyle='round', facecolor='black', alpha=0.7))
        
        # 3. Exposure map (grayscale with histogram)
        axes[2].imshow(gray, cmap='gray')
        mean_exp = gray.mean()
        axes[2].set_title(f"Exposure Map\nMean: {mean_exp:.1f} / 255", fontsize=10)
        axes[2].axis('off')
        
        # Add exposure indicator
        if mean_exp < 50:
            exp_label = "TOO DARK"
            exp_color = "red"
        elif mean_exp > 175:
            exp_label = "TOO BRIGHT"
            exp_color = "red"
        else:
            exp_label = "OK"
            exp_color = "lime"
        axes[2].text(10, 30, f"Exposure: {exp_label}", color=exp_color, fontsize=10,
                    bbox=dict(boxstyle='round', facecolor='black', alpha=0.7))
        
        plt.tight_layout()
        
        # Save debug image
        debug_filename = f"debug_{img_path.stem}.png"
        debug_path = debug_dir / debug_filename
        plt.savefig(debug_path, dpi=100, bbox_inches='tight')
        plt.close(fig)
        
        print(f"  ✅ {debug_filename}")
    
    print(f"\n📁 Debug visualizations saved to: {debug_dir}")


def main():
    parser = argparse.ArgumentParser(
        description="Extract quality-filtered keyframes from video for Image-Text Matching.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter
    )
    
    # Video source (one required)
    source_group = parser.add_mutually_exclusive_group(required=True)
    source_group.add_argument(
        "--video", "-v",
        type=str,
        help="Path to input video file"
    )
    source_group.add_argument(
        "--url", "-u",
        type=str,
        help="YouTube URL to download and process"
    )
    
    # YouTube options
    parser.add_argument(
        "--keep-video",
        action="store_true",
        help="Keep downloaded video after processing (only for --url)"
    )
    parser.add_argument(
        "--download-dir",
        type=str,
        default="downloads",
        help="Directory for downloaded videos (only for --url)"
    )
    
    # Output
    parser.add_argument(
        "--out", "-o",
        type=str,
        default="outputs/keyframes",
        help="Base output directory"
    )
    
    # Selection params
    parser.add_argument(
        "--max_total",
        type=int,
        default=DEFAULT_CONFIG["max_total_frames"],
        help="Maximum total keyframes to select"
    )
    parser.add_argument(
        "--per_scene",
        type=int,
        default=DEFAULT_CONFIG["per_scene_target"],
        help="Target frames per scene"
    )
    
    # Sampling params
    parser.add_argument(
        "--sample_period",
        type=float,
        default=DEFAULT_CONFIG["sample_period_seconds"],
        help="Seconds between samples within a scene"
    )
    parser.add_argument(
        "--min_extra",
        type=int,
        default=DEFAULT_CONFIG["min_extra"],
        help="Minimum extra samples per scene beyond 1"
    )
    parser.add_argument(
        "--max_extra",
        type=int,
        default=DEFAULT_CONFIG["max_extra"],
        help="Maximum extra samples per scene beyond 1"
    )
    
    # Quality thresholds
    parser.add_argument(
        "--blur_threshold",
        type=float,
        default=DEFAULT_CONFIG["blur_threshold"],
        help="Minimum blur score (Laplacian variance)"
    )
    parser.add_argument(
        "--exposure_low",
        type=int,
        default=DEFAULT_CONFIG["exposure_low"],
        help="Minimum acceptable mean grayscale"
    )
    parser.add_argument(
        "--exposure_high",
        type=int,
        default=DEFAULT_CONFIG["exposure_high"],
        help="Maximum acceptable mean grayscale"
    )
    
    # Face/eye detection params
    parser.add_argument(
        "--min_face_eye_check",
        type=int,
        default=DEFAULT_CONFIG["min_face_size_for_eye_check"],
        help="Min face size (px) to apply eyes-closed rejection (smaller faces ignored)"
    )
    parser.add_argument(
        "--face_closeup_weight",
        type=float,
        default=DEFAULT_CONFIG["face_closeup_weight"],
        help="Score weight for close-up faces (larger = higher score)"
    )
    parser.add_argument(
        "--frontal_face_weight",
        type=float,
        default=DEFAULT_CONFIG["frontal_face_weight"],
        help="Score weight for frontal faces (looking at camera)"
    )
    
    # Deduplication
    parser.add_argument(
        "--dedup_threshold",
        type=int,
        default=DEFAULT_CONFIG["dedup_threshold"],
        help="pHash Hamming distance threshold for duplicates"
    )
    
    # Scene detection
    parser.add_argument(
        "--scene_threshold",
        type=float,
        default=DEFAULT_CONFIG["scene_threshold"],
        help="PySceneDetect content detector threshold"
    )
    
    # Debug visualization
    parser.add_argument(
        "--debug-viz",
        type=int,
        default=0,
        metavar="N",
        help="Generate debug visualizations for N random frames (shows blur map, face detection)"
    )
    
    args = parser.parse_args()
    
    # Resolve video path
    video_path = None
    downloaded = False
    
    if args.url:
        print(f"Downloading video from: {args.url}")
        try:
            video_path = download_youtube_video(args.url, output_dir=args.download_dir)
            downloaded = True
        except Exception as e:
            print(f"Failed to download video: {e}", file=sys.stderr)
            sys.exit(1)
    else:
        video_path = args.video
    
    # Build config from args
    config = {
        "output_dir": args.out,
        "max_total_frames": args.max_total,
        "per_scene_target": args.per_scene,
        "sample_period_seconds": args.sample_period,
        "min_extra": args.min_extra,
        "max_extra": args.max_extra,
        "blur_threshold": args.blur_threshold,
        "exposure_low": args.exposure_low,
        "exposure_high": args.exposure_high,
        "min_face_size_for_eye_check": args.min_face_eye_check,
        "face_closeup_weight": args.face_closeup_weight,
        "frontal_face_weight": args.frontal_face_weight,
        "dedup_threshold": args.dedup_threshold,
        "scene_threshold": args.scene_threshold,
    }
    
    # Run pipeline
    try:
        result = run_keyframe_pipeline(video_path, config)
        print(f"\nDone! Selected {len(result['selected_frames'])} keyframes.")
        print(f"Output: {result['output_dir']}")
        
        # Generate debug visualizations if requested
        if args.debug_viz > 0:
            generate_debug_visualizations(result['output_dir'], num_samples=args.debug_viz)
    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n\nInterrupted by user.", file=sys.stderr)
        sys.exit(130)
    except Exception as e:
        print(f"Pipeline failed: {e}", file=sys.stderr)
        raise
    finally:
        # Clean up downloaded video unless --keep-video
        if downloaded and not args.keep_video and video_path:
            import time
            time.sleep(0.5)  # Brief delay to release file handles
            try:
                if os.path.exists(video_path):
                    os.remove(video_path)
                    print(f"🗑️ Deleted downloaded video: {video_path}")
            except PermissionError:
                print(f"⚠️ Could not delete video (file in use): {video_path}")


if __name__ == "__main__":
    main()
