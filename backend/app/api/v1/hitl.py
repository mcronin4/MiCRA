# This file will contain the HITL (Human-in-the-loop) functionality for the content pipeline
# After the job completes, users will be able to review and adjust/approve the output

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, Union
from ...agents.text_generation.chatbot_generation import generate_chatbot_response
from ...agents.text_generation.linkedin_generation import generate_linkedin_post
from ...agents.text_generation.email_generation import generate_email
from ...agents.text_generation.tiktok_generation import generate_tiktok_script
from ...agents.text_generation.content_parser import parse_email_content, parse_linkedin_content, parse_tiktok_content
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
    source_texts: Optional[list[dict]] = None  # [{id, title, content}]
    tone_preference: Optional[str] = None  # User's preferred tone/style

class ChatResponse(BaseModel):
    message: str
    action: Optional[str] = None  # "create_linkedin", "create_email", "create_tiktok", None
    content: Optional[Union[str, dict]] = None  # Generated content if action is triggered (can be structured dict)
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
        source_texts = request.source_texts or []
        tone_preference = request.tone_preference
        has_source_text = len(source_texts) > 0
        
        # Check if we're generating from canvas with all info
        if conversation_state.get("generating_from_canvas"):
            content_type = conversation_state.get("content_type")
            
            # Generate content immediately
            if content_type == "linkedin":
                raw_content = generate_linkedin_post("Create content from source material", source_texts, tone_preference)
                parsed_content = parse_linkedin_content(raw_content)
                return ChatResponse(
                    message="Great! I've created a LinkedIn post for you based on your source material. Check the canvas!",
                    action="create_linkedin",
                    content=parsed_content,
                    conversation_state={}
                )
            elif content_type == "email":
                raw_content = generate_email("Create content from source material", source_texts, tone_preference)
                parsed_content = parse_email_content(raw_content)
                return ChatResponse(
                    message="Perfect! I've drafted an email for you based on your source material. Check the canvas!",
                    action="create_email",
                    content=parsed_content,
                    conversation_state={}
                )
            elif content_type == "tiktok":
                raw_content = generate_tiktok_script("Create content from source material", source_texts, tone_preference)
                parsed_content = parse_tiktok_content(raw_content)
                return ChatResponse(
                    message="Awesome! I've created a TikTok script for you based on your source material. Check the canvas!",
                    action="create_tiktok",
                    content=parsed_content,
                    conversation_state={}
                )
        
        # Check if we're waiting for tone preference
        if conversation_state.get("waiting_for_tone"):
            content_type = conversation_state.get("content_type")
            user_instruction = conversation_state.get("user_instruction", "")
            
            # User just provided their tone preference, now generate content
            tone_preference = request.message  # Use their message as the tone
            
            if content_type == "linkedin":
                raw_content = generate_linkedin_post(user_instruction, source_texts, tone_preference)
                parsed_content = parse_linkedin_content(raw_content)
                return ChatResponse(
                    message="Great! I've created a LinkedIn post for you. Check the canvas!",
                    action="create_linkedin",
                    content=parsed_content,
                    conversation_state={}  # Clear state
                )
            elif content_type == "email":
                raw_content = generate_email(user_instruction, source_texts, tone_preference)
                parsed_content = parse_email_content(raw_content)
                return ChatResponse(
                    message="Perfect! I've drafted an email for you. Check the canvas!",
                    action="create_email",
                    content=parsed_content,
                    conversation_state={}  # Clear state
                )
            elif content_type == "tiktok":
                raw_content = generate_tiktok_script(user_instruction, source_texts, tone_preference)
                parsed_content = parse_tiktok_content(raw_content)
                return ChatResponse(
                    message="Awesome! I've created a TikTok script for you. Check the canvas!",
                    action="create_tiktok",
                    content=parsed_content,
                    conversation_state={}  # Clear state
                )
        
        # Check if we're waiting for context (no source text scenario)
        if conversation_state.get("waiting_for_context"):
            content_type = conversation_state.get("content_type")
            user_context = request.message
            
            # Now ask for tone before generating
            return ChatResponse(
                message="Perfect! What tone or style would you like?",
                conversation_state={
                    "waiting_for_tone": True,
                    "content_type": content_type,
                    "user_instruction": user_context,
                    "show_tone_options": True
                }
            )
        
        # Detect if user wants to create content
        intent = detect_intent(request.message)
        
        if intent:
            # If we have source text, ask for tone preference first
            if has_source_text:
                # Check if tone is already provided
                if tone_preference:
                    # Generate content immediately with source text and tone
                    if intent == "linkedin":
                        raw_content = generate_linkedin_post(request.message, source_texts, tone_preference)
                        parsed_content = parse_linkedin_content(raw_content)
                        return ChatResponse(
                            message="Great! I've created a LinkedIn post for you based on your source material. Check the canvas!",
                            action="create_linkedin",
                            content=parsed_content,
                            conversation_state={}
                        )
                    elif intent == "email":
                        raw_content = generate_email(request.message, source_texts, tone_preference)
                        parsed_content = parse_email_content(raw_content)
                        return ChatResponse(
                            message="Perfect! I've drafted an email for you based on your source material. Check the canvas!",
                            action="create_email",
                            content=parsed_content,
                            conversation_state={}
                        )
                    elif intent == "tiktok":
                        raw_content = generate_tiktok_script(request.message, source_texts, tone_preference)
                        parsed_content = parse_tiktok_content(raw_content)
                        return ChatResponse(
                            message="Awesome! I've created a TikTok script for you based on your source material. Check the canvas!",
                            action="create_tiktok",
                            content=parsed_content,
                            conversation_state={}
                        )
                else:
                    # Ask for tone preference
                    return ChatResponse(
                        message="I see you have source material ready! What tone or style would you like for this content?",
                        conversation_state={
                            "waiting_for_tone": True,
                            "content_type": intent,
                            "user_instruction": request.message,
                            "show_tone_options": True
                        }
                    )
            else:
                # No source text - ask for context first
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
        
        # Default chatbot response with source context
        response = generate_chatbot_response(request.message, source_texts, tone_preference)
        return ChatResponse(message=response, conversation_state={})
    except ServerError:
        return ChatResponse(message="The model is currently overloaded. Please try again later.", conversation_state={})
