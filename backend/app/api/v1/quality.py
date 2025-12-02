from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from ...quality.checker import QualityChecker, QualityFlag, QualityResponse
from ...quality.dictionary import DictionaryManager

router = APIRouter(prefix="/quality")
checker = QualityChecker()
dictionary_manager = DictionaryManager()

class CheckRequest(BaseModel):
    text: str

class StandardizeRequest(BaseModel):
    term: str
    correction: str

@router.post("/check", response_model=QualityResponse)
async def check_quality(request: CheckRequest):
    """
    Analyze text for quality issues including spelling, grammar, proper nouns, and brand consistency.
    """
    try:
        flags = checker.check_content(request.text)
        return QualityResponse(flags=flags)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/standardize")
async def standardize_term(request: StandardizeRequest):
    """
    Add a term to the project-wide standard dictionary.
    """
    try:
        dictionary_manager.add_term(request.term, request.correction)
        return {"status": "success", "message": f"Added '{request.term}' -> '{request.correction}' to dictionary"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


