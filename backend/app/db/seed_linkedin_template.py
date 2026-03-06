"""
Seed script to add the "Video + Text to LinkedIn Post" workflow template.

Run with:
    cd backend
    uv run python -m app.db.seed_linkedin_template
"""

import sys
from pathlib import Path

backend_root = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(backend_root))

from app.db.supabase import get_supabase
from app.services.blueprint_compiler import compile_workflow
from dotenv import load_dotenv
load_dotenv()


TEMPLATE = {
    "name": "Image + Text to LinkedIn",
    "description": "Combine images and text to generate a polished LinkedIn post with matched visuals — generates copy from your text and pairs the best images to accompany it",
    "workflow_data": {
        "edges": [
            {
                "id": "xy-edge__TextGeneration-3generated_text-ImageMatching-2text",
                "source": "TextGeneration-3",
                "target": "ImageMatching-2",
                "sourceHandle": "generated_text",
                "targetHandle": "text",
            },
            {
                "id": "xy-edge__ImageMatching-2images-End-4end-input",
                "source": "ImageMatching-2",
                "target": "End-4",
                "sourceHandle": "images",
                "targetHandle": "end-input",
            },
            {
                "id": "xy-edge__TextGeneration-3generated_text-End-4end-input",
                "source": "TextGeneration-3",
                "target": "End-4",
                "sourceHandle": "generated_text",
                "targetHandle": "end-input",
            },
            {
                "id": "xy-edge__ImageBucket-0images-ImageMatching-2images",
                "source": "ImageBucket-0",
                "target": "ImageMatching-2",
                "sourceHandle": "images",
                "targetHandle": "images",
            },
            {
                "id": "xy-edge__TextBucket-1text-TextGeneration-3text",
                "source": "TextBucket-1",
                "target": "TextGeneration-3",
                "sourceHandle": "text",
                "targetHandle": "text",
            },
        ],
        "nodes": [
            {
                "id": "ImageMatching-2",
                "data": {
                    "label": "ImageMatching node",
                    "max_matches": 5,
                    "match_count_mode": "all",
                    "selectedImageIds": [],
                },
                "type": "ImageMatching",
                "position": {"x": 1734.1452422990783, "y": 323.5803856358876},
            },
            {
                "id": "TextGeneration-3",
                "data": {
                    "label": "TextGeneration node",
                    "preset_id": "be078774-4e86-4a49-b156-03696eaa90f3",
                },
                "type": "TextGeneration",
                "position": {"x": 1218.6491444726537, "y": 645.5808135045426},
            },
            {
                "id": "End-4",
                "data": {"label": "End node", "output_key": "linkedin_post"},
                "type": "End",
                "position": {"x": 2509.6049883130413, "y": 398.17222787151644},
            },
            {
                "id": "ImageBucket-0",
                "data": {"label": "ImageBucket node"},
                "type": "ImageBucket",
                "position": {"x": 777.8340129495693, "y": 217.2344141441734},
            },
            {
                "id": "TextBucket-1",
                "data": {"label": "TextBucket node"},
                "type": "TextBucket",
                "position": {"x": 753.5873809589301, "y": 789.827954230809},
            },
        ],
    },
}


def seed_linkedin_template():
    """Create the Video + Text to LinkedIn Post template."""
    print("🌱 Seeding 'Image + Text to LinkedIn' template...")

    try:
        supabase = get_supabase().client

        compilation = compile_workflow(
            nodes=TEMPLATE["workflow_data"].get("nodes", []),
            edges=TEMPLATE["workflow_data"].get("edges", []),
            name=TEMPLATE["name"],
        )
        if not compilation.success:
            print(f"  ❌ Template failed compile validation:")
            for diag in compilation.diagnostics:
                print(f"      - [{diag.level}] {diag.message}")
            sys.exit(1)

        existing = supabase.table("workflows")\
            .select("id")\
            .eq("name", TEMPLATE["name"])\
            .eq("is_system", True)\
            .execute()

        if existing.data:
            print(f"  ⏭️  Template already exists, skipping.")
            return

        workflow_data = {
            "name": TEMPLATE["name"],
            "description": TEMPLATE["description"],
            "user_id": None,
            "is_system": True,
        }

        result = supabase.table("workflows").insert(workflow_data).execute()

        if not result.data:
            print("  ❌ Failed to create workflow row.")
            sys.exit(1)

        workflow_id = result.data[0]["id"]

        version_data = {
            "workflow_id": workflow_id,
            "payload": TEMPLATE["workflow_data"],
        }

        version_result = supabase.table("workflow_versions").insert(version_data).execute()

        if version_result.data:
            print(f"  ✅ Created template: {TEMPLATE['name']}")
        else:
            supabase.table("workflows").delete().eq("id", workflow_id).execute()
            print("  ❌ Failed to create template version, rolled back.")
            sys.exit(1)

    except Exception as e:
        print(f"❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    seed_linkedin_template()
