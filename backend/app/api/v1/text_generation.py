"""
Text generation API endpoints with preset management.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from uuid import UUID
from datetime import datetime
from ...agents.text_generation.generator import generate_text
from ...db.supabase import get_supabase

router = APIRouter(prefix="/text-generation", tags=["text-generation"])


# Request/Response Models
class PresetCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    prompt: str = Field(..., min_length=1)
    output_format: Optional[Dict[str, Any]] = None
    max_length: Optional[int] = Field(None, gt=0)
    tone_guidance: Optional[str] = None
    structure_template: Optional[str] = None
    output_limit: Optional[int] = Field(None, gt=0)
    is_default: bool = False


class PresetUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    prompt: Optional[str] = Field(None, min_length=1)
    output_format: Optional[Dict[str, Any]] = None
    max_length: Optional[int] = Field(None, gt=0)
    tone_guidance: Optional[str] = None
    structure_template: Optional[str] = None
    output_limit: Optional[int] = Field(None, gt=0)
    is_default: Optional[bool] = None


class PresetResponse(BaseModel):
    id: str
    name: str
    prompt: str
    output_format: Optional[Dict[str, Any]] = None
    max_length: Optional[int] = None
    tone_guidance: Optional[str] = None
    structure_template: Optional[str] = None
    output_limit: Optional[int] = None
    is_default: bool
    created_at: datetime
    updated_at: datetime


class GenerateRequest(BaseModel):
    input_text: str = Field(..., min_length=1)
    preset_id: str
    source_texts: Optional[List[Dict[str, Any]]] = None


class GenerateResponse(BaseModel):
    success: bool
    output: Dict[str, Any]
    error: Optional[str] = None


# Endpoints
@router.get("/presets", response_model=List[PresetResponse])
async def list_presets():
    """List all text generation presets."""
    try:
        supabase = get_supabase()
        result = supabase.client.table("text_generation_presets").select("*").order("name").execute()
        
        presets = []
        for preset in result.data:
            # Parse output_format if it's a string
            output_format = preset.get("output_format")
            if isinstance(output_format, str):
                try:
                    import json
                    output_format = json.loads(output_format)
                except:
                    output_format = None
            
            presets.append(PresetResponse(
                id=str(preset["id"]),
                name=preset["name"],
                prompt=preset["prompt"],
                output_format=output_format,
                max_length=preset.get("max_length"),
                tone_guidance=preset.get("tone_guidance"),
                structure_template=preset.get("structure_template"),
                output_limit=preset.get("output_limit"),
                is_default=preset.get("is_default", False),
                created_at=preset["created_at"],
                updated_at=preset["updated_at"]
            ))
        
        return presets
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch presets: {str(e)}")


@router.get("/presets/{preset_id}", response_model=PresetResponse)
async def get_preset(preset_id: str):
    """Get a single preset by ID."""
    try:
        supabase = get_supabase()
        result = supabase.client.table("text_generation_presets").select("*").eq("id", preset_id).execute()
        
        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=404, detail="Preset not found")
        
        preset = result.data[0]
        
        # Parse output_format if it's a string
        output_format = preset.get("output_format")
        if isinstance(output_format, str):
            try:
                import json
                output_format = json.loads(output_format)
            except:
                output_format = None
        
        return PresetResponse(
            id=str(preset["id"]),
            name=preset["name"],
            prompt=preset["prompt"],
            output_format=output_format,
            max_length=preset.get("max_length"),
            tone_guidance=preset.get("tone_guidance"),
            structure_template=preset.get("structure_template"),
            output_limit=preset.get("output_limit"),
            is_default=preset.get("is_default", False),
            created_at=preset["created_at"],
            updated_at=preset["updated_at"]
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch preset: {str(e)}")


@router.post("/presets", response_model=PresetResponse, status_code=201)
async def create_preset(preset: PresetCreate):
    """Create a new text generation preset."""
    try:
        supabase = get_supabase()
        
        # Prepare data for insertion
        preset_data = {
            "name": preset.name,
            "prompt": preset.prompt,
            "output_format": preset.output_format,
            "max_length": preset.max_length,
            "tone_guidance": preset.tone_guidance,
            "structure_template": preset.structure_template,
            "output_limit": preset.output_limit,
            "is_default": preset.is_default
        }
        
        # Remove None values
        preset_data = {k: v for k, v in preset_data.items() if v is not None}
        
        result = supabase.client.table("text_generation_presets").insert(preset_data).execute()
        
        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=500, detail="Failed to create preset")
        
        created_preset = result.data[0]
        
        # Parse output_format if it's a string
        output_format = created_preset.get("output_format")
        if isinstance(output_format, str):
            try:
                import json
                output_format = json.loads(output_format)
            except:
                output_format = None
        
        return PresetResponse(
            id=str(created_preset["id"]),
            name=created_preset["name"],
            prompt=created_preset["prompt"],
            output_format=output_format,
            max_length=created_preset.get("max_length"),
            tone_guidance=created_preset.get("tone_guidance"),
            structure_template=created_preset.get("structure_template"),
            output_limit=created_preset.get("output_limit"),
            is_default=created_preset.get("is_default", False),
            created_at=created_preset["created_at"],
            updated_at=created_preset["updated_at"]
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create preset: {str(e)}")


@router.put("/presets/{preset_id}", response_model=PresetResponse)
async def update_preset(preset_id: str, preset: PresetUpdate):
    """Update an existing preset."""
    try:
        supabase = get_supabase()
        
        # Check if preset exists
        check_result = supabase.client.table("text_generation_presets").select("id").eq("id", preset_id).execute()
        if not check_result.data or len(check_result.data) == 0:
            raise HTTPException(status_code=404, detail="Preset not found")
        
        # Prepare update data
        update_data = preset.dict(exclude_unset=True)
        
        if not update_data:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        result = supabase.client.table("text_generation_presets").update(update_data).eq("id", preset_id).execute()
        
        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=500, detail="Failed to update preset")
        
        updated_preset = result.data[0]
        
        # Parse output_format if it's a string
        output_format = updated_preset.get("output_format")
        if isinstance(output_format, str):
            try:
                import json
                output_format = json.loads(output_format)
            except:
                output_format = None
        
        return PresetResponse(
            id=str(updated_preset["id"]),
            name=updated_preset["name"],
            prompt=updated_preset["prompt"],
            output_format=output_format,
            max_length=updated_preset.get("max_length"),
            tone_guidance=updated_preset.get("tone_guidance"),
            structure_template=updated_preset.get("structure_template"),
            output_limit=updated_preset.get("output_limit"),
            is_default=updated_preset.get("is_default", False),
            created_at=updated_preset["created_at"],
            updated_at=updated_preset["updated_at"]
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update preset: {str(e)}")


@router.delete("/presets/{preset_id}", status_code=204)
async def delete_preset(preset_id: str):
    """Delete a preset."""
    try:
        supabase = get_supabase()
        
        # Check if preset exists
        check_result = supabase.client.table("text_generation_presets").select("id").eq("id", preset_id).execute()
        if not check_result.data or len(check_result.data) == 0:
            raise HTTPException(status_code=404, detail="Preset not found")
        
        supabase.client.table("text_generation_presets").delete().eq("id", preset_id).execute()
        
        return None
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete preset: {str(e)}")


@router.post("/generate", response_model=GenerateResponse)
async def generate_text_endpoint(request: GenerateRequest):
    """Generate text using a preset."""
    try:
        output = generate_text(
            input_text=request.input_text,
            preset_id=request.preset_id,
            source_texts=request.source_texts
        )
        
        return GenerateResponse(
            success=True,
            output=output,
            error=None
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        return GenerateResponse(
            success=False,
            output={},
            error=str(e)
        )

