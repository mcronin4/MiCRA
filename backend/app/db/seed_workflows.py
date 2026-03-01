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
        "name": "Image to Text Generation",
        "description": "Match images with text descriptions, then generate content from the matches",
        "workflow_data": {
            "nodes": [
                {
                    "id": "img-bucket-1",
                    "type": "ImageBucket",
                    "position": {"x": 50, "y": 200},
                    "data": {"label": "Image Bucket", "selected_file_ids": []}
                },
                {
                    "id": "img-match-1",
                    "type": "ImageMatching",
                    "position": {"x": 250, "y": 200},
                    "data": {"label": "Image Matching"}
                },
                {
                    "id": "text-gen-1",
                    "type": "TextGeneration",
                    "position": {"x": 500, "y": 200},
                    "data": {"label": "Text Generation"}
                }
            ],
            "edges": [
                {
                    "id": "e1",
                    "source": "img-bucket-1",
                    "target": "img-match-1",
                    "sourceHandle": "images",
                    "targetHandle": "images"
                },
                {
                    "id": "e2",
                    "source": "img-match-1",
                    "target": "text-gen-1",
                    "sourceHandle": "captions",
                    "targetHandle": "text"
                }
            ]
        }
    },
    {
        "name": "Video Transcription Pipeline",
        "description": "Transcribe video/audio content and generate text outputs",
        "workflow_data": {
            "nodes": [
                {
                    "id": "audio-bucket-1",
                    "type": "AudioBucket",
                    "position": {"x": 50, "y": 200},
                    "data": {"label": "Audio Bucket", "selected_file_ids": []}
                },
                {
                    "id": "transcription-1",
                    "type": "Transcription",
                    "position": {"x": 250, "y": 200},
                    "data": {"label": "Transcription"}
                },
                {
                    "id": "text-gen-1",
                    "type": "TextGeneration",
                    "position": {"x": 500, "y": 200},
                    "data": {"label": "Text Generation"}
                }
            ],
            "edges": [
                {
                    "id": "e1",
                    "source": "audio-bucket-1",
                    "target": "transcription-1",
                    "sourceHandle": "audio",
                    "targetHandle": "audio"
                },
                {
                    "id": "e2",
                    "source": "transcription-1",
                    "target": "text-gen-1",
                    "sourceHandle": "transcription",
                    "targetHandle": "text"
                }
            ]
        }
    },
    {
        "name": "Content Generation Starter",
        "description": "Simple template with text bucket and text generation node ready to use",
        "workflow_data": {
            "nodes": [
                {
                    "id": "text-bucket-1",
                    "type": "TextBucket",
                    "position": {"x": 100, "y": 200},
                    "data": {"label": "Text Bucket", "selected_file_ids": []}
                },
                {
                    "id": "text-gen-1",
                    "type": "TextGeneration",
                    "position": {"x": 350, "y": 200},
                    "data": {"label": "Text Generation"}
                }
            ],
            "edges": [
                {
                    "id": "e1",
                    "source": "text-bucket-1",
                    "target": "text-gen-1",
                    "sourceHandle": "text",
                    "targetHandle": "text"
                }
            ]
        }
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
