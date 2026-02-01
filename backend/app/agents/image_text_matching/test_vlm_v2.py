"""
Simple test script for VLM image-text matching.
Runs the VLM matcher on test images without comparison.
"""

import asyncio
import os
from pathlib import Path

# Add parent paths for imports
import sys
backend_root = Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(backend_root))

from app.agents.image_text_matching.vlm_analysis import ImageTextMatcherVLM
from app.agents.image_text_matching.matching_types import TextSummary, ImageCandidate


async def run_vlm_test():
    """Run VLM matching on test images."""
    
    # Get test images directory
    test_images_dir = Path(__file__).parent / "test_images"
    
    if not test_images_dir.exists():
        print(f"❌ Test images directory not found: {test_images_dir}")
        return
    
    # Find all images
    image_files = sorted([
        f for f in test_images_dir.iterdir()
        if f.suffix.lower() in ['.png', '.jpg', '.jpeg', '.webp']
    ])
    
    if not image_files:
        print(f"❌ No images found in {test_images_dir}")
        return
    
    print("=" * 60)
    print("VLM IMAGE-TEXT MATCHING TEST")
    print("=" * 60)
    print(f"\nFound {len(image_files)} images:")
    for f in image_files:
        print(f"  - {f.name}")
    
    # Create test summaries
    summaries = [
        TextSummary(
            summary_id="Opening and Vision",
            text_content="Google DeepMind presents their vision for AI agents and the future of technology.",
            video_id="test"
        ),
        TextSummary(
            summary_id="Apps SDK",
            text_content="The Apps SDK allows developers to build applications that integrate with AI capabilities.",
            video_id="test"
        ),
        TextSummary(
            summary_id="Agent Kit",
            text_content="Agent Kit provides tools for building autonomous AI agents that can take actions.",
            video_id="test"
        ),
    ]
    
    # Create image candidates
    candidates = [
        ImageCandidate(
            image_id=f.stem,
            filepath=str(f),
            video_id="test"
        )
        for f in image_files
    ]
    
    print(f"\nTest summaries: {len(summaries)}")
    for s in summaries:
        print(f"  - {s.summary_id}")
    
    # Initialize matcher and run matching
    print("\n" + "=" * 60)
    print("INITIALIZING VLM MATCHER")
    print("=" * 60)
    
    try:
        async with ImageTextMatcherVLM() as matcher:
            print("✅ Matcher initialized successfully")
            
            # Run matching
            print("\n" + "=" * 60)
            print("RUNNING VLM MATCHING")
            print("=" * 60)
            
            for summary in summaries:
                print(f"\n--- Matching: {summary.summary_id} ---")
                print(f"Text: {summary.text_content[:80]}...")
                
                matches = []
                for candidate in candidates:
                    try:
                        # Call async method properly
                        match = await matcher.match_single_pair(candidate, summary)
                        matches.append(match)
                        print(f"  {candidate.image_id}: "
                              f"semantic={match.semantic_score:.3f}, "
                              f"detail={match.detail_score:.3f}, "
                              f"combined={match.combined_score:.3f}")
                    except Exception as e:
                        print(f"  ❌ Error matching {candidate.image_id}: {e}")
                
                # Sort and show top matches
                if matches:
                    matches.sort(key=lambda x: x.combined_score, reverse=True)
                    print(f"\n  🏆 Top match: {matches[0].image_id} (score: {matches[0].combined_score:.3f})")
    except Exception as e:
        print(f"❌ Failed to initialize or run matcher: {e}")
        return
    
    print("\n" + "=" * 60)
    print("✅ TEST COMPLETE")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(run_vlm_test())

