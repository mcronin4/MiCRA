"""
Interactive Console-Based Image-Text Matching Tool

This script matches images from the test_images folder with user-provided text.
Run: python test_matching.py

Features:
  - Loads images from test_images folder
  - Prompts user for timestamps for each image
  - Prompts user to paste text content to match
  - Runs the matching algorithm and displays results
"""

import os
import sys
from pathlib import Path
from typing import List, Dict, Optional
import numpy as np
from PIL import Image

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from app.agents.image_text_matching.embeddings import (
    ImageTextMatcher,
    TextSummary,
    ImageCandidate
)


def load_images_from_folder(folder_path: str = "test_images") -> List[str]:
    """Load all images from the test_images folder."""
    folder = Path(__file__).parent / folder_path
    
    if not folder.exists():
        print(f"Folder '{folder_path}' does not exist!")
        return []
    
    # Supported image extensions
    image_extensions = ['.png', '.jpg', '.jpeg', '.webp', '.bmp']
    
    # Find all images
    image_files = []
    for ext in image_extensions:
        image_files.extend(folder.glob(f'*{ext}'))
    
    # Remove duplicates
    seen_paths = set()
    unique_files = []
    for img in image_files:
        abs_path = str(img.resolve())
        if abs_path not in seen_paths:
            seen_paths.add(abs_path)
            unique_files.append(img)
    
    # Sort by filename
    image_files = sorted(unique_files)
    
    # Convert to absolute paths
    filepaths = [str(img.absolute()) for img in image_files]
    
    return filepaths


def prompt_for_timestamps(image_paths: List[str]) -> Dict[str, float]:
    """Prompt user to enter timestamps for each image."""
    print("\n" + "="*60)
    print("STEP 1: Enter Timestamps for Images")
    print("="*60)
    print("\nFor each image, enter the timestamp (in seconds) when it appears in the video.")
    print("Press Enter to use default value (0.0).\n")
    
    timestamps = {}
    
    for i, filepath in enumerate(image_paths):
        filename = Path(filepath).name
        while True:
            try:
                user_input = input(f"  [{i+1}/{len(image_paths)}] {filename} - Timestamp (seconds): ").strip()
                if user_input == "":
                    timestamp = float(i * 10.0)  # Default: 10 seconds apart
                    print(f"       Using default: {timestamp}s")
                else:
                    timestamp = float(user_input)
                timestamps[Path(filepath).stem] = timestamp
                break
            except ValueError:
                print("       Please enter a valid number (or press Enter for default).")
    
    return timestamps


def prompt_for_text() -> str:
    """Prompt user to paste or type text content to match."""
    print("\n" + "="*60)
    print("STEP 2: Enter Text Content to Match")
    print("="*60)
    print("\nPaste or type the text content you want to match against the images.")
    print("Enter a blank line when done (press Enter twice).\n")
    
    lines = []
    print("Text content (blank line to finish):")
    while True:
        line = input()
        if line == "":
            if lines:  # Only break if we have some content
                break
            print("(Please enter some text first)")
        else:
            lines.append(line)
    
    return "\n".join(lines)


def prompt_for_summary_info() -> Dict[str, Optional[float]]:
    """Prompt for optional summary metadata."""
    print("\n" + "="*60)
    print("STEP 3: Summary Timing (Optional)")
    print("="*60)
    print("\nOptionally specify when this text segment starts and ends in the video.")
    print("This helps with timestamp-based matching. Press Enter to skip.\n")
    
    start_time = None
    end_time = None
    
    start_input = input("  Start time (seconds, or Enter to skip): ").strip()
    if start_input:
        try:
            start_time = float(start_input)
        except ValueError:
            print("  Invalid input, skipping start time.")
    
    end_input = input("  End time (seconds, or Enter to skip): ").strip()
    if end_input:
        try:
            end_time = float(end_input)
        except ValueError:
            print("  Invalid input, skipping end time.")
    
    return {"start_time": start_time, "end_time": end_time}


def create_image_candidates(image_filepaths: List[str], 
                           timestamps: Dict[str, float],
                           video_id: str = "user_video") -> List[ImageCandidate]:
    """Create image candidates from file paths and timestamps."""
    candidates = []
    for i, filepath in enumerate(image_filepaths):
        image_filename = Path(filepath).stem
        timestamp = timestamps.get(image_filename, float(i * 10.0))
        
        candidate = ImageCandidate(
            image_id=f"img_{i+1:03d}_{image_filename}",
            video_id=video_id,
            timestamp=timestamp,
            filepath=filepath
        )
        candidates.append(candidate)
    
    return candidates


def print_match_results(results: Dict[str, List], image_paths: List[str]):
    """Pretty-print the matching results."""
    print("\n" + "="*60)
    print("MATCHING RESULTS")
    print("="*60)
    
    for summary_id, matches in results.items():
        print(f"\nSummary: {summary_id}")
        print("-" * 60)
        
        if not matches:
            print("  No matches found.")
            continue
        
        for rank, match in enumerate(matches, 1):
            # Find the original filename
            original_path = None
            for path in image_paths:
                if Path(path).stem in match.image_id:
                    original_path = Path(path).name
                    break
            
            print(f"\n  🏆 Rank #{rank}: {original_path or match.image_id}")
            print(f"    Combined Score:  {match.combined_score:.4f} ({match.combined_score*100:.1f}%)")
            print(f"    ├─ Timestamp:    {match.timestamp_score:.4f}")
            print(f"    ├─ Semantic:     {match.semantic_score:.4f}")
            print(f"    └─ Detail:       {match.detail_score:.4f}")
            
            if match.caption:
                print(f"    Caption: {match.caption[:100]}{'...' if len(match.caption) > 100 else ''}")
            if match.ocr_text:
                print(f"    OCR Text: {match.ocr_text[:80]}{'...' if len(match.ocr_text) > 80 else ''}")
            if match.matched_words:
                print(f"    Matched Words: {match.matched_words[:80]}{'...' if len(match.matched_words) > 80 else ''}")
    
    print("\n" + "="*60)


def run_interactive_matching():
    """Main interactive matching loop."""
    print("\n" + "="*60)
    print("🖼️  IMAGE-TEXT MATCHING CONSOLE TOOL")
    print("="*60)
    print("\nThis tool matches images from 'test_images' folder with your text.\n")
    
    # Step 1: Load images
    print("Loading images from test_images folder...")
    image_paths = load_images_from_folder("test_images")
    
    if not image_paths:
        print("\n❌ No images found in test_images folder!")
        print("   Please add images to: backend/app/agents/image_text_matching/test_images/")
        return
    
    print(f"\n✓ Found {len(image_paths)} image(s):")
    for fp in image_paths:
        print(f"   - {Path(fp).name}")
    
    # Step 2: Get timestamps for images
    timestamps = prompt_for_timestamps(image_paths)
    
    # Step 3: Get text content
    text_content = prompt_for_text()
    
    if not text_content.strip():
        print("\n❌ No text content provided. Exiting.")
        return
    
    # Step 4: Get optional summary timing
    timing = prompt_for_summary_info()
    
    # Step 5: Configure matcher
    print("\n" + "="*60)
    print("STEP 4: Configure Matching")
    print("="*60)
    
    use_timestamps = timing["start_time"] is not None and timing["end_time"] is not None
    
    print(f"\n  Timestamp matching: {'Enabled' if use_timestamps else 'Disabled (no timing provided)'}")
    
    use_detail = input("\n  Use detail verification (BLIP-2 captioning + OCR)? [Y/n]: ").strip().lower()
    use_detail_verification = use_detail != 'n'
    print(f"  Detail verification: {'Enabled' if use_detail_verification else 'Disabled'}")
    
    # Step 6: Initialize matcher and run
    print("\n" + "="*60)
    print("RUNNING MATCHING ALGORITHM")
    print("="*60)
    print("\nInitializing models (this may take a moment on first run)...\n")
    
    try:
        matcher = ImageTextMatcher(
            timestamp_weight=0.3 if use_timestamps else 0.0,
            semantic_weight=0.5 if use_detail_verification else 0.7,
            detail_weight=0.2 if use_detail_verification else 0.0,
            timestamp_window=30.0,
            use_ocr=use_detail_verification,
            use_timestamp_matching=use_timestamps,
            use_detail_verification=use_detail_verification
        )
    except Exception as e:
        print(f"\n❌ Failed to initialize matcher: {e}")
        return
    
    # Create text summary
    summary = TextSummary(
        summary_id="user_summary",
        video_id="user_video",
        text_content=text_content,
        start_time=timing["start_time"],
        end_time=timing["end_time"]
    )
    
    # Create image candidates
    candidates = create_image_candidates(image_paths, timestamps)
    
    print(f"\nMatching {len(candidates)} images against your text...")
    
    # Run matching
    results = matcher.match_summaries_to_images(
        text_summaries=[summary],
        image_candidates=candidates,
        top_k=min(5, len(candidates))  # Show up to 5 results or all images
    )
    
    # Display results
    print_match_results(results, image_paths)
    
    # Ask if user wants to continue
    print("\n✅ Matching complete!")
    
    continue_choice = input("\nWould you like to match with different text? [y/N]: ").strip().lower()
    if continue_choice == 'y':
        # Clear cache and run again with same images
        matcher.clear_cache()
        
        text_content = prompt_for_text()
        if text_content.strip():
            timing = prompt_for_summary_info()
            
            summary = TextSummary(
                summary_id="user_summary_2",
                video_id="user_video",
                text_content=text_content,
                start_time=timing["start_time"],
                end_time=timing["end_time"]
            )
            
            print("\nRunning matching again...")
            results = matcher.match_summaries_to_images(
                text_summaries=[summary],
                image_candidates=candidates,
                top_k=min(5, len(candidates))
            )
            print_match_results(results, image_paths)
    
    print("\nGoodbye! 👋")


def run_quick_test():
    """Run a quick test with hardcoded values for development/debugging."""
    print("\n" + "="*60)
    print("QUICK TEST MODE")
    print("="*60)
    
    # Load images
    image_paths = load_images_from_folder("test_images")
    if not image_paths:
        print("No images found!")
        return
    
    print(f"Found {len(image_paths)} images")
    
    # Hardcoded timestamps
    timestamps = {
        "TI1": 73.0,
        "TI2": 387.0,
        "TI3": 1522.2,
        "TI4": 2581.8,
        "TI5": 2892.6,
    }
    
    # Sample text
    sample_text = """
    OpenAI introduces the Apps SDK so developers can build fully interactive apps 
    inside ChatGPT—complete with UI, actions, and data connections. Live demos show 
    Coursera lessons pinned while you chat, Canva generating posters and pitch decks.
    """
    
    print(f"\nTest text: {sample_text[:100]}...")
    
    # Initialize matcher with minimal config for speed
    matcher = ImageTextMatcher(
        use_timestamp_matching=False,
        use_detail_verification=False  # Fast mode
    )
    
    # Create summary and candidates
    summary = TextSummary(
        summary_id="test_summary",
        video_id="test_video",
        text_content=sample_text
    )
    
    candidates = create_image_candidates(image_paths, timestamps, "test_video")
    
    # Run matching
    results = matcher.match_summaries_to_images([summary], candidates, top_k=3)
    
    print_match_results(results, image_paths)


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Image-Text Matching Console Tool")
    parser.add_argument(
        '--mode',
        type=str,
        choices=['interactive', 'quick'],
        default='interactive',
        help='Run mode: interactive (prompts for input) or quick (uses test data)'
    )
    
    args = parser.parse_args()
    
    try:
        if args.mode == 'interactive':
            run_interactive_matching()
        else:
            run_quick_test()
            
    except KeyboardInterrupt:
        print("\n\n⚠️  Interrupted by user")
        sys.exit(0)
    except Exception as e:
        print(f"\n\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
