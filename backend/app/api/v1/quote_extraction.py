from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import List, Optional, Literal

from ...agents.quote_extraction.extractor import extract_quotes

router = APIRouter(prefix="/quote-extraction")


class QuoteExtractionRequest(BaseModel):
    transcript: str
    style: Literal["general", "punchy", "insightful", "contrarian", "emotional"] = "general"
    count: int = Field(10, ge=1, le=30)


class QuoteItem(BaseModel):
    text: str
    reason: Optional[str] = None


class QuoteExtractionResponse(BaseModel):
    success: bool
    quotes: Optional[List[QuoteItem]] = None
    error: Optional[str] = None


@router.post("", response_model=QuoteExtractionResponse)
async def extract_quotes_endpoint(request: QuoteExtractionRequest):
    try:
        quotes = await extract_quotes(
            transcript=request.transcript,
            style=request.style,
            count=request.count,
        )
        return QuoteExtractionResponse(success=True, quotes=quotes)
    except Exception as exc:
        return QuoteExtractionResponse(success=False, error=str(exc))
