"""
Seed script to create pre-built workflow templates.

NOTE: This system only saves workflow structure (nodes, edges, positions).
Node inputs/outputs, attachments, and execution state are NOT persisted.

Run with: 
    cd backend
    python -m app.db.seed_workflows
"""

import sys
from pathlib import Path

# Add backend to path
backend_root = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(backend_root))

from app.db.supabase import get_supabase
from app.services.blueprint_compiler import compile_workflow
from dotenv import load_dotenv
load_dotenv()


TEMPLATES = [
    {
        "name": "Podcast to Blog Post",
        "description": "Transcribe a podcast or audio recording and generate a polished blog post from the transcript",
        "workflow_data": {
            "nodes": [
                {
                    "id": "audio-bucket-1",
                    "type": "AudioBucket",
                    "position": {"x": 100, "y": 200},
                    "data": {"label": "Audio Source", "selected_file_ids": []}
                },
                {
                    "id": "transcription-1",
                    "type": "Transcription",
                    "position": {"x": 400, "y": 200},
                    "data": {"label": "Transcription"}
                },
                {
                    "id": "text-gen-1",
                    "type": "TextGeneration",
                    "position": {"x": 700, "y": 200},
                    "data": {"label": "Blog Post Generator"}
                },
            ],
            "edges": [
                {
                    "id": "e1",
                    "source": "audio-bucket-1",
                    "target": "transcription-1",
                    "sourceHandle": "audio",
                    "targetHandle": "audio",
                },
                {
                    "id": "e2",
                    "source": "transcription-1",
                    "target": "text-gen-1",
                    "sourceHandle": "transcription",
                    "targetHandle": "text",
                },
            ],
        },
    },
    {
        "name": "Video to Visual Blog",
        "description": "Turn a video into a blog post with matched visuals — transcribes the video, generates written content, extracts frames, and pairs the best images with the text",
        "workflow_data": {
            "nodes": [
                {
                    "id": "video-bucket-1",
                    "type": "VideoBucket",
                    "position": {"x": 100, "y": 300},
                    "data": {"label": "Video Source", "selected_file_ids": []}
                },
                {
                    "id": "transcription-1",
                    "type": "Transcription",
                    "position": {"x": 400, "y": 150},
                    "data": {"label": "Transcription"}
                },
                {
                    "id": "text-gen-1",
                    "type": "TextGeneration",
                    "position": {"x": 700, "y": 150},
                    "data": {"label": "Blog Post Generator"}
                },
                {
                    "id": "img-extract-1",
                    "type": "ImageExtraction",
                    "position": {"x": 400, "y": 450},
                    "data": {"label": "Frame Extraction"}
                },
                {
                    "id": "img-match-1",
                    "type": "ImageMatching",
                    "position": {"x": 1000, "y": 300},
                    "data": {"label": "Match Images to Text"}
                },
            ],
            "edges": [
                {
                    "id": "e1",
                    "source": "video-bucket-1",
                    "target": "transcription-1",
                    "sourceHandle": "videos",
                    "targetHandle": "video",
                },
                {
                    "id": "e2",
                    "source": "transcription-1",
                    "target": "text-gen-1",
                    "sourceHandle": "transcription",
                    "targetHandle": "text",
                },
                {
                    "id": "e3",
                    "source": "video-bucket-1",
                    "target": "img-extract-1",
                    "sourceHandle": "videos",
                    "targetHandle": "source",
                },
                {
                    "id": "e4",
                    "source": "img-extract-1",
                    "target": "img-match-1",
                    "sourceHandle": "images",
                    "targetHandle": "images",
                },
                {
                    "id": "e5",
                    "source": "text-gen-1",
                    "target": "img-match-1",
                    "sourceHandle": "generated_text",
                    "targetHandle": "text",
                },
            ],
        },
    },
    {
        "name": "Video to Social Media Kit",
        "description": "Extract the most quotable moments and key frames from a video — generates social-ready captions and visual assets",
        "workflow_data": {
            "nodes": [
                {
                    "id": "video-bucket-1",
                    "type": "VideoBucket",
                    "position": {"x": 100, "y": 300},
                    "data": {"label": "Video Source", "selected_file_ids": []}
                },
                {
                    "id": "transcription-1",
                    "type": "Transcription",
                    "position": {"x": 400, "y": 150},
                    "data": {"label": "Transcription"}
                },
                {
                    "id": "quote-extract-1",
                    "type": "QuoteExtraction",
                    "position": {"x": 700, "y": 150},
                    "data": {"label": "Quote Extraction"}
                },
                {
                    "id": "text-gen-1",
                    "type": "TextGeneration",
                    "position": {"x": 1000, "y": 150},
                    "data": {"label": "Social Caption Generator"}
                },
                {
                    "id": "img-extract-1",
                    "type": "ImageExtraction",
                    "position": {"x": 400, "y": 450},
                    "data": {"label": "Frame Extraction"}
                },
            ],
            "edges": [
                {
                    "id": "e1",
                    "source": "video-bucket-1",
                    "target": "transcription-1",
                    "sourceHandle": "videos",
                    "targetHandle": "video",
                },
                {
                    "id": "e2",
                    "source": "transcription-1",
                    "target": "quote-extract-1",
                    "sourceHandle": "transcription",
                    "targetHandle": "text",
                },
                {
                    "id": "e3",
                    "source": "quote-extract-1",
                    "target": "text-gen-1",
                    "sourceHandle": "quotes",
                    "targetHandle": "text",
                },
                {
                    "id": "e4",
                    "source": "video-bucket-1",
                    "target": "img-extract-1",
                    "sourceHandle": "videos",
                    "targetHandle": "source",
                },
            ],
        },
    },
    {
        "name": "Document to Social Series",
        "description": "Turn a whitepaper, report, or long-form document into a series of social media posts by extracting key insights and expanding them into standalone posts",
        "workflow_data": {
            "nodes": [
                {
                    "id": "text-bucket-1",
                    "type": "TextBucket",
                    "position": {"x": 100, "y": 200},
                    "data": {"label": "Document Source", "selected_file_ids": []}
                },
                {
                    "id": "quote-extract-1",
                    "type": "QuoteExtraction",
                    "position": {"x": 400, "y": 200},
                    "data": {"label": "Key Insight Extraction"}
                },
                {
                    "id": "text-gen-1",
                    "type": "TextGeneration",
                    "position": {"x": 700, "y": 200},
                    "data": {"label": "Social Post Generator"}
                },
            ],
            "edges": [
                {
                    "id": "e1",
                    "source": "text-bucket-1",
                    "target": "quote-extract-1",
                    "sourceHandle": "text",
                    "targetHandle": "text",
                },
                {
                    "id": "e2",
                    "source": "quote-extract-1",
                    "target": "text-gen-1",
                    "sourceHandle": "quotes",
                    "targetHandle": "text",
                },
            ],
        },
    },
    {
        "name": "Quote Card Creator",
        "description": "Extract standout quotes from text content and generate visual quote cards — ready-to-post graphics with key messages",
        "workflow_data": {
            "nodes": [
                {
                    "id": "text-bucket-1",
                    "type": "TextBucket",
                    "position": {"x": 100, "y": 200},
                    "data": {"label": "Text Source", "selected_file_ids": []}
                },
                {
                    "id": "quote-extract-1",
                    "type": "QuoteExtraction",
                    "position": {"x": 400, "y": 200},
                    "data": {"label": "Quote Extraction"}
                },
                {
                    "id": "img-gen-1",
                    "type": "ImageGeneration",
                    "position": {"x": 700, "y": 200},
                    "data": {"label": "Quote Card Generator"}
                },
            ],
            "edges": [
                {
                    "id": "e1",
                    "source": "text-bucket-1",
                    "target": "quote-extract-1",
                    "sourceHandle": "text",
                    "targetHandle": "text",
                },
                {
                    "id": "e2",
                    "source": "quote-extract-1",
                    "target": "img-gen-1",
                    "sourceHandle": "quotes",
                    "targetHandle": "prompt",
                },
            ],
        },
    },
    {
        "name": "Video Highlights Reel",
        "description": "Extract the most visually compelling frames from a long video and generate a short-form highlights video",
        "workflow_data": {
            "nodes": [
                {
                    "id": "video-bucket-1",
                    "type": "VideoBucket",
                    "position": {"x": 100, "y": 200},
                    "data": {"label": "Video Source", "selected_file_ids": []}
                },
                {
                    "id": "img-extract-1",
                    "type": "ImageExtraction",
                    "position": {"x": 400, "y": 200},
                    "data": {"label": "Frame Extraction"}
                },
                {
                    "id": "video-gen-1",
                    "type": "VideoGeneration",
                    "position": {"x": 700, "y": 200},
                    "data": {"label": "Highlights Video Generator"}
                },
            ],
            "edges": [
                {
                    "id": "e1",
                    "source": "video-bucket-1",
                    "target": "img-extract-1",
                    "sourceHandle": "videos",
                    "targetHandle": "source",
                },
                {
                    "id": "e2",
                    "source": "img-extract-1",
                    "target": "video-gen-1",
                    "sourceHandle": "images",
                    "targetHandle": "images",
                },
            ],
        },
    },
    {
        "name": "Brand Visual Storyteller",
        "description": "Generate marketing copy from a text brief, then match the best images from your brand library to pair with the content",
        "workflow_data": {
            "nodes": [
                {
                    "id": "text-bucket-1",
                    "type": "TextBucket",
                    "position": {"x": 100, "y": 150},
                    "data": {"label": "Text Brief", "selected_file_ids": []}
                },
                {
                    "id": "text-gen-1",
                    "type": "TextGeneration",
                    "position": {"x": 400, "y": 150},
                    "data": {"label": "Marketing Copy Generator"}
                },
                {
                    "id": "img-bucket-1",
                    "type": "ImageBucket",
                    "position": {"x": 100, "y": 400},
                    "data": {"label": "Brand Image Library", "selected_file_ids": []}
                },
                {
                    "id": "img-match-1",
                    "type": "ImageMatching",
                    "position": {"x": 700, "y": 275},
                    "data": {"label": "Match Images to Copy"}
                },
            ],
            "edges": [
                {
                    "id": "e1",
                    "source": "text-bucket-1",
                    "target": "text-gen-1",
                    "sourceHandle": "text",
                    "targetHandle": "text",
                },
                {
                    "id": "e2",
                    "source": "text-gen-1",
                    "target": "img-match-1",
                    "sourceHandle": "generated_text",
                    "targetHandle": "text",
                },
                {
                    "id": "e3",
                    "source": "img-bucket-1",
                    "target": "img-match-1",
                    "sourceHandle": "images",
                    "targetHandle": "images",
                },
            ],
        },
    },
]


def seed_workflows():
    """Create pre-built workflow templates."""
    print("🌱 Seeding workflow templates...")
    
    try:
        supabase = get_supabase().client
        
        created_count = 0
        skipped_count = 0
        
        for template in TEMPLATES:
            compilation = compile_workflow(
                nodes=template["workflow_data"].get("nodes", []),
                edges=template["workflow_data"].get("edges", []),
                name=template["name"],
            )
            if not compilation.success:
                print(f"  âŒ Template '{template['name']}' failed compile validation, skipping:")
                for diag in compilation.diagnostics:
                    print(f"      - [{diag.level}] {diag.message}")
                skipped_count += 1
                continue

            # Check if template already exists (by name and system flag)
            existing = supabase.table("workflows")\
                .select("id")\
                .eq("name", template["name"])\
                .eq("is_system", True)\
                .execute()
            
            if existing.data:
                print(f"  ⏭️  Template '{template['name']}' already exists, skipping...")
                skipped_count += 1
                continue
            
            # Create workflow metadata
            # System workflows should have NULL user_id per schema
            workflow_data = {
                "name": template["name"],
                "description": template["description"],
                "user_id": None,  # NULL for system workflows
                "is_system": True,
            }
            
            result = supabase.table("workflows").insert(workflow_data).execute()
            
            if not result.data:
                print(f"  ❌ Failed to create template: {template['name']}")
                continue
            
            workflow_id = result.data[0]["id"]
            
            # Create initial version (version_number will be auto-incremented to 1)
            version_data = {
                "workflow_id": workflow_id,
                "payload": template["workflow_data"]
            }
            
            version_result = supabase.table("workflow_versions").insert(version_data).execute()
            
            if version_result.data:
                print(f"  ✅ Created template: {template['name']}")
                created_count += 1
            else:
                # Rollback: delete the workflow if version creation fails
                supabase.table("workflows").delete().eq("id", workflow_id).execute()
                print(f"  ❌ Failed to create template version: {template['name']}")
        
        print(f"\n✅ Seeding complete!")
        print(f"   Created: {created_count} templates")
        print(f"   Skipped: {skipped_count} existing templates")
        
    except Exception as e:
        print(f"❌ Error seeding workflows: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    seed_workflows()
