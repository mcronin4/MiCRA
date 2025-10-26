# This file will contain the HITL (Human-in-the-loop) functionality for the content pipeline
# After the job completes, users will be able to review and adjust/approve the output

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from ...agents.text_generation.chatbot_generation import generate_chatbot_response
from ...agents.text_generation.linkedin_generation import generate_linkedin_post
from ...agents.text_generation.email_generation import generate_email
from ...agents.summarization.summarizer import summarize
from google.genai.errors import ServerError
import re

router = APIRouter(prefix="/hitl")

class HITLResponse(BaseModel):
    message: str
    status: str

class ChatRequest(BaseModel):
    message: str
    conversation_state: Optional[dict] = None  # Track conversation state

class ChatResponse(BaseModel):
    message: str
    action: Optional[str] = None  # "create_linkedin", "create_email", "create_tiktok", None
    content: Optional[str] = None  # Generated content if action is triggered
    conversation_state: Optional[dict] = None  # Return updated conversation state

@router.get("/", status_code=200, response_model=HITLResponse)
async def hitl():
    return HITLResponse(
        message="Dummy HITL response",
        status="completed"
    )

def detect_intent(message: str) -> Optional[str]:
    """Detect if the user wants to create specific content"""
    message_lower = message.lower()
    
    # LinkedIn detection
    linkedin_keywords = ['linkedin', 'linkedin post', 'professional post']
    if any(keyword in message_lower for keyword in linkedin_keywords):
        if any(action in message_lower for action in ['create', 'generate', 'make', 'write', 'help me create', 'help me with']):
            return "linkedin"
    
    # Email detection
    email_keywords = ['email', 'email draft', 'mail']
    if any(keyword in message_lower for keyword in email_keywords):
        if any(action in message_lower for action in ['create', 'generate', 'make', 'write', 'draft', 'help me create', 'help me with']):
            return "email"
    
    # TikTok detection
    tiktok_keywords = ['tiktok', 'tik tok', 'video script', 'short video']
    if any(keyword in message_lower for keyword in tiktok_keywords):
        if any(action in message_lower for action in ['create', 'generate', 'make', 'write', 'help me create', 'help me with']):
            return "tiktok"
    
    return None

@router.post("/chat", status_code=200, response_model=ChatResponse)
async def chat(request: ChatRequest):
    try:
        conversation_state = request.conversation_state or {}
        
        # Check if we're waiting for context
        if conversation_state.get("waiting_for_context"):
            content_type = conversation_state.get("content_type")
            user_context = request.message
            
            # Generate content with the provided context
            if content_type == "linkedin":
                generated_content = generate_linkedin_post(user_context)
                return ChatResponse(
                    message="Great! I've created a LinkedIn post for you. Check the canvas!",
                    action="create_linkedin",
                    content=generated_content,
                    conversation_state={}  # Clear state
                )
            elif content_type == "email":
                generated_content = generate_email(user_context)
                return ChatResponse(
                    message="Perfect! I've drafted an email for you. Check the canvas!",
                    action="create_email",
                    content=generated_content,
                    conversation_state={}  # Clear state
                )
            elif content_type == "tiktok":
                # For TikTok, we can use a simple placeholder for now
                generated_content = f"TikTok Script:\n\n{user_context}\n\n#viral #fyp #content"
                return ChatResponse(
                    message="Awesome! I've created a TikTok script for you. Check the canvas!",
                    action="create_tiktok",
                    content=generated_content,
                    conversation_state={}  # Clear state
                )
        
        # Detect if user wants to create content
        intent = detect_intent(request.message)
        
        if intent:
            # Ask for context before generating
            if intent == "linkedin":
                return ChatResponse(
                    message="I'd love to help you create a LinkedIn post! What topic or message would you like to share?",
                    conversation_state={"waiting_for_context": True, "content_type": "linkedin"}
                )
            elif intent == "email":
                return ChatResponse(
                    message="I'll help you draft an email! What's the main message or purpose of this email?",
                    conversation_state={"waiting_for_context": True, "content_type": "email"}
                )
            elif intent == "tiktok":
                return ChatResponse(
                    message="Let's create a TikTok script! What's the topic or idea you want to create content about?",
                    conversation_state={"waiting_for_context": True, "content_type": "tiktok"}
                )
        
        # Default chatbot response
        response = generate_chatbot_response(request.message)
        return ChatResponse(message=response, conversation_state={})
    except ServerError:
        return ChatResponse(message="The model is currently overloaded. Please try again later.", conversation_state={})
