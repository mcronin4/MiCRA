# This file will contain the HITL (Human-in-the-loop) functionality for the content pipeline
# After the job completes, users will be able to review and adjust/approve the output

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/hitl")

class HITLResponse(BaseModel):
    message: str
    status: str

@router.get("/", status_code=200, response_model=HITLResponse)
async def hitl():
    return HITLResponse(
        message="Dummy HITL response",
        status="completed"
    )
