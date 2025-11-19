"""
test script for the modulee

shows the matching functionality with images from test_images folder.
python test_matching.py

to customize:
  - text summaries: edit custom text summaries ~line 84
  - image timestamps: ~line 171 (needs to match name of each image)
  - images: add images to the test_images folder
"""

import os
import sys
from pathlib import Path
from typing import List, Dict
import numpy as np
from PIL import Image, ImageDraw, ImageFont

# Add parent directory to path for imports, gets all the root directtory for all imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from app.agents.image_text_matching.embeddings import (
    ImageTextMatcher,
    TextSummary,
    ImageCandidate
)


def load_images_from_folder(folder_path: str = "test_images") -> List[str]:
    folder = Path(__file__).parent / folder_path
    
    if not folder.exists():
        print(f"Folder '{folder_path}' does not exist!")
        return []
    
    # Supported image extensions (case-insensitive on Windows)
    image_extensions = ['.png', '.jpg', '.jpeg', '.webp', '.bmp']
    
    # Find all images (use lowercase pattern - works case-insensitively on Windows)
    image_files = []
    for ext in image_extensions:
        # Use lowercase pattern - will match both .png and .PNG on case-insensitive filesystems
        image_files.extend(folder.glob(f'*{ext}'))
    
    # Remove duplicates by converting to absolute paths (handles case-insensitive duplicates)
    seen_paths = set()
    unique_files = []
    for img in image_files:
        abs_path = str(img.resolve())  # resolve() handles case-insensitive duplicates
        if abs_path not in seen_paths:
            seen_paths.add(abs_path)
            unique_files.append(img)
    
    # Sort by filename for consistency
    image_files = sorted(unique_files)
    
    # Convert to absolute paths
    filepaths = [str(img.absolute()) for img in image_files]
    
    print(f"Found {len(filepaths)} image(s) in '{folder_path}':")
    #print the file names
    for fp in filepaths:
        print(f"   - {Path(fp).name}")
    
    return filepaths


# ============================================================================
# EDIT TEXT SUMMARIES HERE
# ============================================================================
#
# Add or modify text summaries below. Each summary will be matched against
# all images in the test_images folder.
# do as many as you want, they will all be matched against the images

CUSTOM_TEXT_SUMMARIES = [
    TextSummary(
        summary_id="Opening and Vision",
        video_id="openai_devday_2025",
        start_time=0.0, #0 seconds
        end_time=180.0, #3 minutes
        text_content="""
        OpenAI kicks off DevDay with a clear message: AI has moved from novelty to daily tool. With 4M+ developers, 800M weekly ChatGPT users, and 6B tokens/min on the API, the focus now is enabling builders to ship faster. The theme of the day: reduce friction so ideas turn into real products in hours, not months.
        """
    ),
    TextSummary(
        summary_id="Apps SDK",
        video_id="openai_devday_2025",
        start_time=180.0, #3 minutes
        end_time=940.0, #15 minutes and 40 seconds
        text_content="""
        OpenAI introduces the Apps SDK so developers can build fully interactive apps inside ChatGPT—complete with UI, actions, and data connections (built on MCP). Live demos show Coursera lessons pinned while you chat, Canva generating posters and pitch decks, and Zillow maps you can filter conversationally. Discovery and future monetization are on the roadmap, turning ChatGPT into a distribution platform as well as a canvas.
        """
    ),
    TextSummary(
        summary_id="Agent Kit",
        video_id="openai_devday_2025",
        start_time=940.0, # 15 minutes and 40 seconds
        end_time=1770.0, # 29 minutes and 30 seconds
        text_content="""
        Agents get production-ready building blocks: Agent Builder (visual node editor), Chat Kit (embeddable chat UI), guardrails, evals, and connector registry. In an eight-minute live demo, a DevDay site adds an “Ask Froge” agent that routes queries, pulls session info, renders widgets, and enforces PII guardrails—then publishes with a single workflow ID. The takeaway: complex orchestration without the scaffolding slog.
        """
    ),
    TextSummary(
        summary_id="CodeX on GPT-5 Code",
        video_id="openai_devday_2025",
        start_time=1800.0, # 30 minutes
        end_time=2760.0, # 46 minutes
        text_content="""
        CodeX leaves research preview and becomes a team-grade coding partner powered by GPT-5 Code. Demos include auto-wiring a Sony camera over VISCA, adding Xbox controller support, voice control via the real-time API, and even live venue light control through an MCP server—without hand-coding. New features (Slack integration, SDK, admin analytics) push CodeX from assistant to autonomous collaborator for refactoring, reviews, and rapid prototyping.
        """
    ),
    TextSummary(
        summary_id="New Models & Closing",
        video_id="openai_devday_2025",
        start_time=2760.0, # 46 minutes
        end_time=3140.0, # 52 minutes and 20 seconds
        text_content="""
        GPT-5 Pro lands in the API for tougher reasoning tasks; Sora 2 brings controllable, cinematic video with synchronized audio (including product concepting workflows, shown with Mattel). The keynote closes on a builder’s note: software timelines are collapsing. With apps in ChatGPT, agent tooling, team-ready coding agents, and new models, the barrier to shipping meaningful AI products has never been lower
        """
    )
    # Add more summaries here as needed...
]


def get_text_summaries() -> List[TextSummary]:
    """
    Get text summaries for testing.
    
    Returns:
        List of TextSummary objects from CUSTOM_TEXT_SUMMARIES
    """
    return CUSTOM_TEXT_SUMMARIES




IMAGE_TIMESTAMPS = {
    "TI1": 73.0,
    "TI2": 387.0,
    "TI3": 1522.2,
    "TI4": 2581.8,
    "TI5": 2892.6,
}


def create_image_candidates(image_filepaths: List[str], 
                           video_id: str = "openai_devday_2025",
                           start_timestamp: float = 10.0,
                           interval: float = 20.0) -> List[ImageCandidate]:
    """
    Create image candidates from image file paths.
    """
    candidates = []
    for i, filepath in enumerate(image_filepaths):
        # Get image filename (without extension)
        image_filename = Path(filepath).stem
        
        # Check if we have a hardcoded timestamp for this image
        if image_filename in IMAGE_TIMESTAMPS:
            timestamp = IMAGE_TIMESTAMPS[image_filename]
            print(f"{image_filename}: Using hardcoded timestamp {timestamp}s")
        else:
            # Fall back to auto-generated timestamp
            timestamp = start_timestamp + (i * interval)
            print(f"{image_filename}: Using auto-generated timestamp {timestamp}s (not in IMAGE_TIMESTAMPS)")
        
        candidate = ImageCandidate(
            image_id=f"img_{i+1:03d}_{image_filename}",
            video_id=video_id,
            timestamp=timestamp,
            filepath=filepath
        )
        candidates.append(candidate)
    
    return candidates


def print_match_results(results: Dict[str, List]):
    """
    Pretty-print the matching results.
    
    Args:
        results: Dictionary of summary_id to list of ImageMatch objects
    """
    print("\n" + "="*80)
    print("MATCHING RESULTS")
    print("="*80)
    
    for summary_id, matches in results.items():
        print(f"\nSummary: {summary_id}")
        print("-" * 80)
        
        if not matches:
            print("  No matches found.")
            continue
        
        for rank, match in enumerate(matches, 1):
            print(f"\n  Rank #{rank}: Image {match.image_id}")
            print(f"    Combined Score:  {match.combined_score:.4f}")
            print(f"    ├─ Timestamp:    {match.timestamp_score:.4f}")
            print(f"    ├─ Semantic:     {match.semantic_score:.4f}")
            print(f"    └─ Detail:       {match.detail_score:.4f}")
    
    print("\n" + "="*80)


def run_basic_test():
    """Run a basic matching test with images from test_images folder."""
    
    print("\n" + "="*80)
    print("IMAGE-TEXT MATCHING TEST")
    print("="*80)
    
    # Step 1: Load images from test_images folder
    print("\nStep 1: Loading images from test_images folder...")
    image_paths = load_images_from_folder("test_images")
    
    if not image_paths:
        print("No images found! Please add images to test_images folder.")
        return
    
    # Step 2: Load text summaries and create image candidates
    print("\nStep 2: Loading text summaries and creating image candidates...")
    summaries = get_text_summaries()
    candidates = create_image_candidates(image_paths)
    
    print(f"  Loaded {len(summaries)} text summary(ies)")
    print(f"  Created {len(candidates)} image candidate(s)")
    
    # Step 3: Initialize matcher
    print("\nStep 3: Initializing ImageTextMatcher...")
    matcher = ImageTextMatcher(
        timestamp_weight=0.3,
        semantic_weight=0.5,
        detail_weight=0.2,
        timestamp_window=10.0,
        use_ocr=True,
        use_timestamp_matching=True,  # Set to False if text summaries don't have timestamps
        use_detail_verification=True   # Set to False to skip BLIP-2 captioning (faster but less accurate)
    )
    
    # Step 4: Run matching
    print("\nStep 4: Running matching algorithm...")
    results = matcher.match_summaries_to_images(text_summaries=summaries, image_candidates=candidates, top_k=3)
    
    # Step 5: Display results
    print_match_results(results)
    
    # Step 6: Test single pair matching
    print("\n" + "="*80)
    print("🔬 SINGLE PAIR MATCHING TEST")
    print("="*80)
    
    test_summary = summaries[0]
    test_candidate = candidates[0]
    
    print(f"\nMatching:")
    print(f"  Summary: {test_summary.summary_id} ({test_summary.start_time}s - {test_summary.end_time}s)")
    print(f"  Image: {test_candidate.image_id} (timestamp: {test_candidate.timestamp}s)")
    
    single_match = matcher.match_single_pair(test_candidate, test_summary)
    
    print(f"\nResults:")
    print(f"  Combined Score:  {single_match.combined_score:.4f}")
    print(f"  ├─ Timestamp:    {single_match.timestamp_score:.4f}")
    print(f"  ├─ Semantic:     {single_match.semantic_score:.4f}")
    print(f"  └─ Detail:       {single_match.detail_score:.4f}")
    
    print("\n✅ Test completed successfully!")
    print(f"\n💡 Note: Used {len(image_paths)} image(s) from 'test_images' folder")
    print(f"💡 Note: Matched against {len(summaries)} text summary(ies)")

"""
def run_timestamp_scoring_test():
    Test timestamp proximity scoring in isolation.
    
    print("\n" + "="*80)
    print("⏱️  TIMESTAMP PROXIMITY SCORING TEST")
    print("="*80)
    
    matcher = ImageTextMatcher()
    
    test_cases = [
        # (image_ts, text_start, text_end, expected_behavior)
        (30.0, 20.0, 40.0, "Inside segment"),
        (15.0, 20.0, 40.0, "5s before start"),
        (45.0, 20.0, 40.0, "5s after end"),
        (10.0, 20.0, 40.0, "10s before start"),
        (50.0, 20.0, 40.0, "10s after end"),
        (5.0, 20.0, 40.0, "Far before (15s)"),
    ]
    
    print("\nTest Cases:")
    print("-" * 80)
    
    for img_ts, txt_start, txt_end, description in test_cases:
        score = matcher.compute_timestamp_proximity_score(img_ts, txt_start, txt_end)
        print(f"  {description:20s} | Image@{img_ts:5.1f}s | Segment[{txt_start:5.1f}s - {txt_end:5.1f}s] | Score: {score:.3f}")
    
    print("\n✅ Timestamp scoring test completed!")
"""

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Test Image-Text Matching Module")
    parser.add_argument(
        '--test',
        type=str,
        choices=['all', 'basic', 'timestamp'],
        default='all',
        help='Which test to run (default: all)'
    )
    
    args = parser.parse_args()
    
    try:
        if args.test in ['all', 'basic']:
            run_basic_test()
        
        '''if args.test in ['all', 'timestamp']:
            run_timestamp_scoring_test()'''
            
    except KeyboardInterrupt:
        print("\n\n⚠️  Test interrupted by user")
        sys.exit(0)
    except Exception as e:
        print(f"\n\n❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

