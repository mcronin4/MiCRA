"""
Comparison test script for image-text matching implementations.

Compares two approaches:
1. Original (SigLIP/BLIP-2/Tesseract OCR)
2. VLM Staged (Multi-stage API calls)

Usage:
    python test_vlm_comparison.py [--skip-original] [--downsampling PIXELS]
"""

import os
import sys
import argparse
import asyncio
import json
from pathlib import Path
from typing import List, Dict, Optional
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from app.agents.image_text_matching.embeddings import (
    ImageTextMatcher,
    TextSummary,
    ImageCandidate,
    ImageMatch
)
from app.agents.image_text_matching.vlm_analysis import ImageTextMatcherVLM


# ============================================================================
# TEST DATA (same as test_matching.py)
# ============================================================================

CUSTOM_TEXT_SUMMARIES = [
    TextSummary(
        summary_id="Opening and Vision",
        video_id="openai_devday_2025",
        start_time=0.0,
        end_time=180.0,
        text_content="""
        OpenAI kicks off DevDay with a clear message: AI has moved from novelty to daily tool. With 4M+ developers, 800M weekly ChatGPT users, and 6B tokens/min on the API, the focus now is enabling builders to ship faster. The theme of the day: reduce friction so ideas turn into real products in hours, not months.
        """
    ),
    TextSummary(
        summary_id="Apps SDK",
        video_id="openai_devday_2025",
        start_time=180.0,
        end_time=940.0,
        text_content="""
        OpenAI introduces the Apps SDK so developers can build fully interactive apps inside ChatGPT—complete with UI, actions, and data connections (built on MCP). Live demos show Coursera lessons pinned while you chat, Canva generating posters and pitch decks, and Zillow maps you can filter conversationally. Discovery and future monetization are on the roadmap, turning ChatGPT into a distribution platform as well as a canvas.
        """
    ),
    TextSummary(
        summary_id="Agent Kit",
        video_id="openai_devday_2025",
        start_time=940.0,
        end_time=1770.0,
        text_content="""
    Agents get production-ready building blocks: Agent Builder (visual node editor), Chat Kit (embeddable chat UI), guardrails, evals, and connector registry. In an eight-minute live demo, a DevDay site adds an “Ask Froge” agent that routes queries, pulls session info, renders widgets, and enforces PII guardrails—then publishes with a single workflow ID. The takeaway: complex orchestration without the scaffolding slog.
        """
    ),
    TextSummary(
        summary_id="CodeX on GPT-5 Code",
        video_id="openai_devday_2025",
        start_time=1770.0,
        end_time=2600.0,
        text_content="""
        CodeX leaves research preview and becomes a team-grade coding partner powered by GPT-5 Code. Demos include auto-wiring a Sony camera over VISCA, adding Xbox controller support, voice control via the real-time API, and even live venue light control through an MCP server—without hand-coding. New features (Slack integration, SDK, admin analytics) push CodeX from assistant to autonomous collaborator for refactoring, reviews, and rapid prototyping.
        """
    ),
    TextSummary(
        summary_id="New Models & Closing",
        video_id="openai_devday_2025",
        start_time=2600.0,
        end_time=2900.0,
        text_content="""
    GPT-5 Pro lands in the API for tougher reasoning tasks; Sora 2 brings controllable, cinematic video with synchronized audio (including product concepting workflows, shown with Mattel). The keynote closes on a builder’s note: software timelines are collapsing. With apps in ChatGPT, agent tooling, team-ready coding agents, and new models, the barrier to shipping meaningful AI products has never been lower
        """
    ),
]

IMAGE_TIMESTAMPS = {
    "TI1": 73.0,
    "TI2": 387.0,
    "TI3": 1522.2,
    "TI4": 2581.8,
    "TI5": 2892.6,
}


# ============================================================================
# GROUND TRUTH ANNOTATIONS
# ============================================================================

# Map summary_id -> list of acceptable image IDs (in preference order)
# These are the "gold standard" correct matches for evaluation
GROUND_TRUTH = {
    "Opening and Vision": ["TI1"],
    "Apps SDK": ["TI2"],
    "Agent Kit": ["TI3"],
    "CodeX on GPT-5 Code": ["TI4"],
    "New Models & Closing": ["TI5"],
}


# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

def load_images_from_folder(folder_path: str = "test_images") -> List[str]:
    """Load image file paths from test_images folder."""
    folder = Path(__file__).parent / folder_path
    
    if not folder.exists():
        print(f"Folder '{folder_path}' does not exist!")
        return []
    
    image_extensions = ['.png', '.jpg', '.jpeg', '.webp', '.bmp']
    image_files = []
    for ext in image_extensions:
        image_files.extend(folder.glob(f'*{ext}'))
    
    # Remove duplicates and sort
    seen_paths = set()
    unique_files = []
    for img in image_files:
        abs_path = str(img.resolve())
        if abs_path not in seen_paths:
            seen_paths.add(abs_path)
            unique_files.append(img)
    
    image_files = sorted(unique_files)
    filepaths = [str(img.absolute()) for img in image_files]
    
    print(f"Found {len(filepaths)} image(s) in '{folder_path}':")
    for fp in filepaths:
        print(f"   - {Path(fp).name}")
    
    return filepaths


def create_image_candidates(
    image_filepaths: List[str],
    video_id: str = "openai_devday_2025"
) -> List[ImageCandidate]:
    """Create image candidates from file paths."""
    candidates = []
    for i, filepath in enumerate(image_filepaths):
        image_filename = Path(filepath).stem
        
        # Use hardcoded timestamp if available
        timestamp = IMAGE_TIMESTAMPS.get(image_filename, 10.0 + (i * 20.0))
        
        candidate = ImageCandidate(
            image_id=image_filename,  # Use simple filename (e.g., "TI1")
            video_id=video_id,
            timestamp=timestamp,
            filepath=filepath
        )
        candidates.append(candidate)
    
    return candidates


def get_test_data():
    """Load test summaries and candidates."""
    summaries = CUSTOM_TEXT_SUMMARIES
    image_paths = load_images_from_folder("test_images")
    candidates = create_image_candidates(image_paths)
    return summaries, candidates


# ============================================================================
# MATCHER RUNNERS
# ============================================================================

def run_original_matcher(
    summaries: List[TextSummary],
    candidates: List[ImageCandidate]
) -> Optional[Dict[str, List[ImageMatch]]]:
    """Run original SigLIP/BLIP/OCR matcher."""
    print("\n" + "="*80)
    print("RUNNING: Original Matcher (SigLIP/BLIP-2/OCR)")
    print("="*80)
    
    try:
        matcher = ImageTextMatcher(
            use_timestamp_matching=False,  # Disabled for fair comparison
            use_detail_verification=True,
            use_ocr=True
        )
        
        results = matcher.match_summaries_to_images(summaries, candidates, top_k=3)
        return results
    except ImportError as e:
        print(f"⚠️  Skipping original matcher: {e}")
        print("   (ML dependencies not installed)")
        return None
    except Exception as e:
        print(f"❌ Error running original matcher: {e}")
        import traceback
        traceback.print_exc()
        return None


async def run_staged_vlm_matcher(
    summaries: List[TextSummary],
    candidates: List[ImageCandidate],
    api_key: str,
    max_dimension: Optional[int] = None
) -> Optional[Dict[str, List[ImageMatch]]]:
    """Run multi-stage VLM matcher."""
    print("\n" + "="*80)
    print("RUNNING: VLM Staged Matcher (Multi-stage API calls)")
    print("="*80)
    
    try:
        matcher = ImageTextMatcherVLM(
            api_key=api_key,
            max_image_dimension=max_dimension
        )
        
        results = await matcher.match_summaries_to_images(summaries, candidates, top_k=3)
        return results
    except Exception as e:
        print(f"❌ Error running staged VLM matcher: {e}")
        import traceback
        traceback.print_exc()
        return None




# ============================================================================
# COMPARISON & DISPLAY
# ============================================================================

def calculate_overlap(matches1: List[ImageMatch], matches2: List[ImageMatch]) -> float:
    """Calculate Jaccard similarity between two match lists."""
    if not matches1 or not matches2:
        return 0.0
    
    ids1 = set(m.image_id for m in matches1)
    ids2 = set(m.image_id for m in matches2)
    
    intersection = len(ids1 & ids2)
    union = len(ids1 | ids2)
    
    return intersection / union if union > 0 else 0.0


# ============================================================================
# EVALUATION METRICS
# ============================================================================

def evaluate_matches(
    results: Dict[str, List[ImageMatch]],
    ground_truth: Dict[str, List[str]],
    approach_name: str
) -> Dict[str, any]:
    """
    Evaluate matching results against ground truth.
    
    Args:
        results: Matching results (summary_id -> list of ImageMatch)
        ground_truth: Ground truth annotations (summary_id -> list of correct image_ids)
        approach_name: Name of the approach for reporting
    
    Returns:
        Dict with metrics: top1_accuracy, top3_accuracy, mrr, per_summary_results
    """
    metrics = {
        "top1_correct": 0,
        "top3_correct": 0,
        "reciprocal_ranks": [],
        "total": 0,
        "per_summary": {}
    }
    
    for summary_id, ground_truth_ids in ground_truth.items():
        if summary_id not in results:
            continue
            
        matches = results[summary_id]
        if not matches:
            metrics["per_summary"][summary_id] = {
                "correct": False,
                "rank": None,
                "predicted": []
            }
            continue
        
        metrics["total"] += 1
        
        # Get predicted image IDs
        predicted_ids = [m.image_id for m in matches]
        
        # Top-1 accuracy
        top1_correct = predicted_ids[0] in ground_truth_ids
        if top1_correct:
            metrics["top1_correct"] += 1
        
        # Top-K accuracy (e.g., top-3)
        topk_correct = any(pid in ground_truth_ids for pid in predicted_ids[:3])
        if topk_correct:
            metrics["top3_correct"] += 1
        
        # Mean Reciprocal Rank
        found_rank = None
        for rank, pred_id in enumerate(predicted_ids, 1):
            if pred_id in ground_truth_ids:
                metrics["reciprocal_ranks"].append(1.0 / rank)
                found_rank = rank
                break
        else:
            metrics["reciprocal_ranks"].append(0.0)
        
        # Store per-summary result
        metrics["per_summary"][summary_id] = {
            "correct": top1_correct,
            "rank": found_rank,
            "predicted": predicted_ids[:3],
            "ground_truth": ground_truth_ids
        }
    
    # Calculate final metrics
    total = metrics["total"]
    if total > 0:
        top1_acc = metrics["top1_correct"] / total
        top3_acc = metrics["top3_correct"] / total
        mrr = sum(metrics["reciprocal_ranks"]) / len(metrics["reciprocal_ranks"])
    else:
        top1_acc = top3_acc = mrr = 0.0
    
    return {
        "approach": approach_name,
        "top1_accuracy": top1_acc,
        "top3_accuracy": top3_acc,
        "mean_reciprocal_rank": mrr,
        "total_evaluated": total,
        "per_summary": metrics["per_summary"]
    }


def display_evaluation_summary(
    original_metrics: Optional[Dict],
    staged_metrics: Optional[Dict]
):
    """Display evaluation metrics summary table."""
    print("\n" + "="*80)
    print("EVALUATION AGAINST GROUND TRUTH")
    print("="*80)
    
    # Table header
    print(f"\n{'Approach':<30} {'Top-1 Acc':<15} {'Top-3 Acc':<15} {'MRR':<10}")
    print("-" * 80)
    
    # Display metrics for each approach
    for metrics in [original_metrics, staged_metrics]:
        if metrics:
            print(f"{metrics['approach']:<30} "
                  f"{metrics['top1_accuracy']:<15.2%} "
                  f"{metrics['top3_accuracy']:<15.2%} "
                  f"{metrics['mean_reciprocal_rank']:<10.3f}")
    
    # Determine winner
    print("\n" + "-"*80)
    all_metrics = [m for m in [original_metrics, staged_metrics] if m]
    if all_metrics:
        best = max(all_metrics, key=lambda x: x['top1_accuracy'])
        print(f"🏆 Best Top-1 Accuracy: {best['approach']} ({best['top1_accuracy']:.2%})")
        
        best_mrr = max(all_metrics, key=lambda x: x['mean_reciprocal_rank'])
        print(f"🏆 Best MRR: {best_mrr['approach']} ({best_mrr['mean_reciprocal_rank']:.3f})")


def display_detailed_evaluation(
    original_metrics: Optional[Dict],
    staged_metrics: Optional[Dict],
    ground_truth: Dict[str, List[str]]
):
    """Display detailed per-summary evaluation."""
    print("\n" + "="*80)
    print("DETAILED PER-SUMMARY EVALUATION")
    print("="*80)
    
    for summary_id in ground_truth.keys():
        print(f"\n{'-'*80}")
        print(f"Summary: {summary_id}")
        print(f"Ground Truth: {', '.join(ground_truth[summary_id])}")
        print(f"{'-'*80}")
        
        # Original
        if original_metrics and summary_id in original_metrics['per_summary']:
            result = original_metrics['per_summary'][summary_id]
            status = "✓" if result['correct'] else "✗"
            rank = f"(rank {result['rank']})" if result['rank'] else "(not found)"
            print(f"Original:     {status} {', '.join(result['predicted'][:3])} {rank}")
        
        # Staged
        if staged_metrics and summary_id in staged_metrics['per_summary']:
            result = staged_metrics['per_summary'][summary_id]
            status = "✓" if result['correct'] else "✗"
            rank = f"(rank {result['rank']})" if result['rank'] else "(not found)"
            print(f"VLM Staged:   {status} {', '.join(result['predicted'][:3])} {rank}")


# ============================================================================
# COMPARISON DISPLAY (existing)
# ============================================================================


def display_comparison(
    original_results: Optional[Dict[str, List[ImageMatch]]],
    staged_results: Optional[Dict[str, List[ImageMatch]]]
):
    """Display side-by-side comparison of results."""
    print("\n" + "="*80)
    print("COMPARISON RESULTS")
    print("="*80)
    
    # Get all summary IDs
    all_summary_ids = set()
    if original_results:
        all_summary_ids.update(original_results.keys())
    if staged_results:
        all_summary_ids.update(staged_results.keys())
    
    for summary_id in sorted(all_summary_ids):
        print(f"\n{'='*80}")
        print(f"Summary: {summary_id}")
        print('='*80)
        
        # Get matches from each approach
        orig_matches = original_results.get(summary_id, []) if original_results else []
        staged_matches = staged_results.get(summary_id, []) if staged_results else []
        
        # Display in columns
        print(f"\n{'Original (SigLIP/BLIP)':<40} {'VLM Staged':<40}")
        print("-" * 80)
        
        max_rows = max(len(orig_matches), len(staged_matches))
        
        for i in range(max_rows):
            # Original
            if i < len(orig_matches):
                m = orig_matches[i]
                orig_str = f"{i+1}. {m.image_id} ({m.combined_score:.3f})"
            else:
                orig_str = ""
            
            # Staged
            if i < len(staged_matches):
                m = staged_matches[i]
                staged_str = f"{i+1}. {m.image_id} ({m.combined_score:.3f})"
            else:
                staged_str = ""
            
            print(f"{orig_str:<40} {staged_str:<40}")
        
        # Analysis
        print("\nAnalysis:")
        
        # Top match agreement
        if orig_matches and staged_matches and orig_matches[0].image_id == staged_matches[0].image_id:
            print(f"  ✓ Top match agreement: Orig-Staged")
        else:
            print(f"  ✗ No top match agreement")
        
        # Overlap scores
        if orig_matches and staged_matches:
            overlap = calculate_overlap(orig_matches, staged_matches)
            print(f"  Orig-Staged overlap: {overlap:.2%}")


def save_results_json(
    results: Dict[str, any],
    output_file: str = "comparison_results.json"
):
    """Save comparison results to JSON file."""
    output_path = Path(__file__).parent / output_file
    
    with open(output_path, 'w') as f:
        json.dump(results, f, indent=2)
    
    print(f"\n✓ Results saved to {output_path}")


# ============================================================================
# MAIN
# ============================================================================

async def main():
    parser = argparse.ArgumentParser(description="Compare image-text matching approaches")
    parser.add_argument(
        '--skip-original',
        action='store_true',
        help='Skip original matcher (useful if ML deps not installed)'
    )
    parser.add_argument(
        '--downsampling',
        type=int,
        default=None,
        help='Max image dimension for downsampling (e.g., 1024)'
    )
    parser.add_argument(
        '--save-json',
        action='store_true',
        help='Save results to JSON file'
    )
    parser.add_argument(
        '--detailed',
        action='store_true',
        help='Show detailed per-summary evaluation results'
    )
    
    args = parser.parse_args()
    
    # Load test data
    print("\n" + "="*80)
    print("IMAGE-TEXT MATCHING COMPARISON TEST")
    print("="*80)
    
    summaries, candidates = get_test_data()
    
    if not candidates:
        print("❌ No test images found!")
        return
    
    print(f"\nTest configuration:")
    print(f"  Summaries: {len(summaries)}")
    print(f"  Images: {len(candidates)}")
    if args.downsampling:
        print(f"  Image downsampling: {args.downsampling}px")
    
    # Get API key for VLM matchers
    api_key = os.getenv("FIREWORK_API_KEY")
    if not api_key:
        print("\n⚠️  Warning: FIREWORK_API_KEY not found in environment")
        print("   VLM matchers will be skipped")
    
    # Run matchers
    original_results = None
    if not args.skip_original:
        original_results = run_original_matcher(summaries, candidates)
    
    staged_results = None
    if api_key:
        staged_results = await run_staged_vlm_matcher(
            summaries,
            candidates,
            api_key,
            args.downsampling
        )
    
    # Display comparison
    display_comparison(original_results, staged_results)
    
    # Evaluate against ground truth
    if GROUND_TRUTH:
        original_metrics = None
        if original_results:
            original_metrics = evaluate_matches(
                original_results, 
                GROUND_TRUTH, 
                "Original (SigLIP/BLIP)"
            )
        
        staged_metrics = None
        if staged_results:
            staged_metrics = evaluate_matches(
                staged_results, 
                GROUND_TRUTH, 
                "VLM Staged"
            )
        
        # Display evaluation summary
        display_evaluation_summary(original_metrics, staged_metrics)
        
        # Optionally show detailed per-summary results
        if args.detailed:
            display_detailed_evaluation(
                original_metrics, 
                staged_metrics,
                GROUND_TRUTH
            )
    
    # Save to JSON if requested
    if args.save_json:
        results_data = {
            "timestamp": datetime.now().isoformat(),
            "config": {
                "num_summaries": len(summaries),
                "num_candidates": len(candidates),
                "downsampling": args.downsampling
            },
            "ground_truth": GROUND_TRUTH if GROUND_TRUTH else None,
            "evaluation": {
                "original": original_metrics if GROUND_TRUTH and original_results else None,
                "staged": staged_metrics if GROUND_TRUTH and staged_results else None
            } if GROUND_TRUTH else None,
            "original": {
                summary_id: [
                    {
                        "image_id": m.image_id,
                        "combined_score": m.combined_score,
                        "semantic_score": m.semantic_score,
                        "detail_score": m.detail_score
                    }
                    for m in matches
                ]
                for summary_id, matches in (original_results or {}).items()
            } if original_results else None,
            "staged": {
                summary_id: [
                    {
                        "image_id": m.image_id,
                        "combined_score": m.combined_score,
                        "semantic_score": m.semantic_score,
                        "detail_score": m.detail_score
                    }
                    for m in matches
                ]
                for summary_id, matches in (staged_results or {}).items()
            } if staged_results else None
        }
        save_results_json(results_data)
    
    print("\n" + "="*80)
    print("✓ COMPARISON TEST COMPLETE")
    print("="*80)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\n⚠️  Test interrupted by user")
        sys.exit(0)
    except Exception as e:
        print(f"\n\n❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


