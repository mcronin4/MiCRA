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
from uuid import UUID
from dotenv import load_dotenv
load_dotenv()

# Default user ID for system workflows
SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000"

TEMPLATES = [
    {
        "name": "Image to Text Generation",
        "description": "Match images with text descriptions, then generate content from the matches",
        "workflow_data": {
            "nodes": [
                {
                    "id": "img-match-1",
                    "type": "ImageMatching",
                    "position": {"x": 100, "y": 200},
                    "data": {"label": "Image Matching"}
                },
                {
                    "id": "text-gen-1",
                    "type": "TextGeneration",
                    "position": {"x": 400, "y": 200},
                    "data": {"label": "Text Generation"}
                }
            ],
            "edges": [
                {
                    "id": "e1",
                    "source": "img-match-1",
                    "target": "text-gen-1",
                    "sourceHandle": "matches",
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
                    "id": "transcription-1",
                    "type": "Transcription",
                    "position": {"x": 100, "y": 200},
                    "data": {"label": "Transcription"}
                },
                {
                    "id": "text-gen-1",
                    "type": "TextGeneration",
                    "position": {"x": 400, "y": 200},
                    "data": {"label": "Text Generation"}
                }
            ],
            "edges": [
                {
                    "id": "e1",
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
        "description": "Simple template with text generation node ready to use",
        "workflow_data": {
            "nodes": [
                {
                    "id": "text-gen-1",
                    "type": "TextGeneration",
                    "position": {"x": 250, "y": 200},
                    "data": {"label": "Text Generation"}
                }
            ],
            "edges": []
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
            # Check if template already exists (by name and system flag)
            existing = supabase.table("workflows")\
                .select("id")\
                .eq("name", template["name"])\
                .eq("is_system_workflow", True)\
                .execute()
            
            if existing.data:
                print(f"  ⏭️  Template '{template['name']}' already exists, skipping...")
                skipped_count += 1
                continue
            
            data = {
                "name": template["name"],
                "description": template["description"],
                "user_id": SYSTEM_USER_ID,
                "is_system_workflow": True,
                "is_public": True,  # Public for prototype mode
                "workflow_data": template["workflow_data"]
            }
            
            result = supabase.table("workflows").insert(data).execute()
            
            if result.data:
                print(f"  ✅ Created template: {template['name']}")
                created_count += 1
            else:
                print(f"  ❌ Failed to create template: {template['name']}")
        
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
