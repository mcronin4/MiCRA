# This file will contain the HITL (Human-in-the-loop) functionality for the content pipeline
# After the job completes, users will be able to review and adjust/approve the output

from fastapi import APIRouter
from pydantic import BaseModel
from ...agents.text_generation.chatbot_generation import generate_chatbot_response
from google.genai.errors import ServerError

router = APIRouter(prefix="/hitl")

class HITLResponse(BaseModel):
    message: str
    status: str

class ChatRequest(BaseModel):
    message: str

class ChatResponse(BaseModel):
    message: str

@router.get("/", status_code=200, response_model=HITLResponse)
async def hitl():
    return HITLResponse(
        message="Dummy HITL response",
        status="completed"
    )

@router.post("/chat", status_code=200, response_model=ChatResponse)
async def chat(request: ChatRequest):
    try:
        response = generate_chatbot_response(request.message)
        return ChatResponse(message=response)
    except ServerError:
        return ChatResponse(message="The model is currently overloaded. Please try again later.")
