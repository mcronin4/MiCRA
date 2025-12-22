# This file will contain the HITL (Human-in-the-loop) functionality for the content pipeline
# After the job completes, users will be able to review and adjust/approve the output

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, Union
from uuid import uuid4
from ...agents.text_generation.chatbot_generation import generate_chatbot_response
from ...agents.text_generation.linkedin_generation import generate_linkedin_post
from ...agents.text_generation.email_generation import generate_email
from ...agents.text_generation.tiktok_generation import generate_tiktok_script
from ...agents.text_generation.content_parser import parse_email_content, parse_linkedin_content, parse_tiktok_content
from ...agents.summarization.summarizer import summarize
from google.genai.errors import ServerError
import re

router = APIRouter(prefix="/hitl")

ACTION_KEYWORDS = [
    "create",
    "generate",
    "make",
    "write",
    "draft",
    "compose",
    "craft",
    "help me create",
    "help me with",
    "turn",
    "convert",
    "develop",
    "produce",
    "build",
    "plan",
]

TONE_KEYWORDS = [
    "friendly",
    "professional",
    "formal",
    "casual",
    "confident",
    "enthusiastic",
    "energetic",
    "inspirational",
    "informative",
    "persuasive",
    "playful",
    "empathetic",
    "supportive",
    "educational",
    "relaxed",
    "bold",
    "concise",
    "upbeat",
    "authoritative",
    "approachable",
    "neutral",
    "warm",
    "expert",
]

INSTRUCTION_KEYWORDS = [
    "create",
    "generate",
    "make",
    "write",
    "draft",
    "compose",
    "craft",
    "help me",
    "i need",
    "i want",
    "can you",
    "could you",
    "would you",
    "please",
    "turn this",
    "convert this",
    "summarize",
    "summarise",
    "outline",
    "explain",
    "tell me",
    "give me",
    "what is",
    "how do",
    "why",
    "should i",
]

GREETING_KEYWORDS = {
    "hi",
    "hey",
    "hello",
    "hola",
    "yo",
    "hiya",
    "sup",
    "good",
}

GREETING_ALLOWED_SUFFIXES = {
    "there",
    "micra",
    "micrai",
    "team",
    "folks",
    "morning",
    "afternoon",
    "evening",
}

CONTENT_CONFIG = {
    "linkedin": {
        "generator": generate_linkedin_post,
        "parser": parse_linkedin_content,
        "action": "create_linkedin",
        "success_messages": {
            "with_source": "Great! I've created a LinkedIn post for you based on your source material. Check the canvas!",
            "without_source": "Great! I've created a LinkedIn post for you. Check the canvas!",
        },
    },
    "email": {
        "generator": generate_email,
        "parser": parse_email_content,
        "action": "create_email",
        "success_messages": {
            "with_source": "Perfect! I've drafted an email for you based on your source material. Check the canvas!",
            "without_source": "Perfect! I've drafted an email for you. Check the canvas!",
        },
    },
    "tiktok": {
        "generator": generate_tiktok_script,
        "parser": parse_tiktok_content,
        "action": "create_tiktok",
        "success_messages": {
            "with_source": "Awesome! I've created a TikTok script for you based on your source material. Check the canvas!",
            "without_source": "Awesome! I've created a TikTok script for you. Check the canvas!",
        },
    },
}

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

def _contains_action_keyword(message_lower: str) -> bool:
    return any(keyword in message_lower for keyword in ACTION_KEYWORDS)


def detect_intent(message: str, require_action: bool = True) -> Optional[str]:
    """Detect if the user wants to create specific content"""
    message_lower = message.lower()

    linkedin_keywords = ['linkedin', 'linkedin post', 'professional post']
    if any(keyword in message_lower for keyword in linkedin_keywords):
        if not require_action or _contains_action_keyword(message_lower):
            return "linkedin"

    email_keywords = ['email', 'email draft', 'mail', 'newsletter']
    if any(keyword in message_lower for keyword in email_keywords):
        if not require_action or _contains_action_keyword(message_lower):
            return "email"

    tiktok_keywords = ['tiktok', 'tik tok', 'video script', 'short video']
    if any(keyword in message_lower for keyword in tiktok_keywords):
        if not require_action or _contains_action_keyword(message_lower):
            return "tiktok"

    return None


def extract_tone_from_message(message: str) -> Optional[str]:
    message_lower = message.lower()
    matches: list[str] = []

    for tone_keyword in TONE_KEYWORDS:
        if re.search(rf'\b{re.escape(tone_keyword)}\b', message_lower):
            matches.append(tone_keyword)

    tone_phrase_match = re.search(r'(?:tone|style|voice)\s*(?:is|should be|=|:)?\s*([a-zA-Z ,\-]{3,60})', message_lower)
    if tone_phrase_match:
        extracted = tone_phrase_match.group(1)
        fragments = re.split(r'(?:,|/| and )', extracted)
        for fragment in fragments:
            cleaned = fragment.strip()
            if cleaned and cleaned not in matches:
                matches.append(cleaned)

    if matches:
        unique_ordered = list(dict.fromkeys(matches))
        return ", ".join(part.title() for part in unique_ordered)

    return None


def is_probable_content_block(message: str) -> bool:
    if not message:
        return False

    stripped = message.strip()
    if len(stripped) < 100:
        return False

    word_count = len(re.findall(r'\w+', stripped))
    if word_count < 50:
        return False

    message_lower = stripped.lower()
    if '?' in stripped:
        return False

    return True


def create_pending_sources_from_text(text: str) -> list[dict]:
    trimmed = text.strip()
    if not trimmed:
        return []

    first_line = trimmed.splitlines()[0].strip()
    preview = first_line[:60]
    if len(first_line) > 60 or len(trimmed.splitlines()) > 1:
        preview += "..."

    if not preview:
        preview = "User provided content"

    return [{
        "id": f"adhoc-{uuid4().hex}",
        "title": preview,
        "content": trimmed,
    }]


def merge_source_texts(primary: Optional[list[dict]], secondary: Optional[list[dict]]) -> list[dict]:
    merged: list[dict] = []
    seen_ids: set[str] = set()

    for source_list in (primary, secondary):
        if not source_list:
            continue
        for source in source_list:
            if not isinstance(source, dict):
                continue
            source_id = source.get("id")
            if source_id:
                if source_id in seen_ids:
                    continue
                seen_ids.add(source_id)
            merged.append(source)

    return merged


def resolve_source_texts(request_sources: Optional[list[dict]], stored_sources: Optional[list[dict]]) -> list[dict]:
    return merge_source_texts(request_sources, stored_sources)


def is_simple_greeting(message: str) -> bool:
    if not message:
        return False

    sanitized = re.sub(r"[^a-z\s]", "", message.lower())
    tokens = [token for token in sanitized.split() if token]

    if not tokens or len(tokens) > 4:
        return False

    has_greeting = any(token in GREETING_KEYWORDS for token in tokens)
    if not has_greeting:
        return False

    for token in tokens:
        if token in GREETING_KEYWORDS or token in GREETING_ALLOWED_SUFFIXES:
            continue
        return False

    return True




def generate_content_response(
    content_type: str,
    source_texts: Optional[list[dict]],
    tone: Optional[str],
    message_override: Optional[str] = None
) -> ChatResponse:
    config = CONTENT_CONFIG.get(content_type)
    if not config:
        raise ValueError(f"Unsupported content type: {content_type}")

    generator = config["generator"]
    parser = config["parser"]
    action = config["action"]

    raw_content = generator(source_texts, tone)
    parsed_content = parser(raw_content)

    if message_override is not None:
        message = message_override
    else:
        message_key = "with_source" if source_texts else "without_source"
        message = config["success_messages"][message_key]

    return ChatResponse(
        message=message,
        action=action,
        content=parsed_content,
        conversation_state={}
    )

@router.get("", status_code=200, response_model=HITLResponse)
async def hitl():
    return HITLResponse(
        message="Dummy HITL response",
        status="completed"
    )

@router.post("/chat", status_code=200, response_model=ChatResponse)
async def chat(request: ChatRequest):
    try:
        conversation_state = request.conversation_state or {}
        source_texts = request.source_texts or []
        tone_preference = request.tone_preference
        has_source_text = len(source_texts) > 0
        state_sources = conversation_state.get("pending_source_texts") or []
        state_tone = conversation_state.get("tone_preference")
        combined_source_texts = resolve_source_texts(source_texts, state_sources)
        has_combined_sources = len(combined_source_texts) > 0
        default_tone = tone_preference or state_tone
        
        if not conversation_state and is_simple_greeting(request.message):
            return ChatResponse(
                message=(
                    "Hi there! I can help turn your ideas into LinkedIn posts, emails, or TikTok scripts. "
                    "What would you like to create or explore today?"
                ),
                conversation_state={}
            )

        # Check if we're generating from canvas with all info
        if conversation_state.get("generating_from_canvas"):
            content_type = conversation_state.get("content_type")
            
            if content_type in CONTENT_CONFIG:
                message_override = CONTENT_CONFIG[content_type]["success_messages"]["with_source"]
                return generate_content_response(
                    content_type,
                    combined_source_texts,
                    default_tone,
                    message_override=message_override
                )
        
        # Check if we're waiting for tone preference
        if conversation_state.get("waiting_for_tone"):
            content_type = conversation_state.get("content_type")
            user_instruction = conversation_state.get("user_instruction", "")
            tone_selection = request.message.strip()
            pending_sources = conversation_state.get("pending_source_texts") or state_sources
            effective_source_texts = resolve_source_texts(source_texts, pending_sources)
            
            if content_type in CONTENT_CONFIG:
                return generate_content_response(
                    content_type,
                    effective_source_texts,
                    tone_selection
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
        
        # Check if we're waiting for content type selection
        if conversation_state.get("waiting_for_content_type"):
            pending_sources = conversation_state.get("pending_source_texts") or state_sources or combined_source_texts
            effective_source_texts = resolve_source_texts(source_texts, pending_sources)
            tone_hint = extract_tone_from_message(request.message)
            selected_intent = detect_intent(request.message, require_action=False)
            updated_tone = tone_hint or tone_preference or state_tone

            if not selected_intent:
                updated_state = dict(conversation_state)
                if effective_source_texts or pending_sources:
                    updated_state["pending_source_texts"] = effective_source_texts or pending_sources or []
                if tone_hint:
                    updated_state["tone_preference"] = tone_hint
                follow_up = "Thanks for sharing that content! What type of piece should I create with it (LinkedIn post, email, TikTok script)?"
                if updated_state.get("tone_preference"):
                    follow_up = "Tone noted. Should I turn this into a LinkedIn post, email, or TikTok script?"
                return ChatResponse(
                    message=follow_up,
                    conversation_state=updated_state
                )

            effective_sources = effective_source_texts or pending_sources

            if updated_tone:
                message_override = CONTENT_CONFIG[selected_intent]["success_messages"]["with_source"] if effective_sources else None
                return generate_content_response(
                    selected_intent,
                    effective_sources,
                    updated_tone,
                    message_override=message_override
                )

            return ChatResponse(
                message="Great! What tone or style would you like me to use?",
                conversation_state={
                    "waiting_for_tone": True,
                    "content_type": selected_intent,
                    "user_instruction": request.message,
                    "pending_source_texts": effective_sources or [],
                    "show_tone_options": True
                }
            )
        
        # If we reach here without a waiting state, but the message looks like source material, capture it and ask for direction
        if is_probable_content_block(request.message):
            new_sources = create_pending_sources_from_text(request.message)
            combined_sources = new_sources
            if has_combined_sources:
                combined_sources = merge_source_texts(combined_source_texts, new_sources)

            new_state = {
                "waiting_for_content_type": True,
                "pending_source_texts": combined_sources,
            }

            tone_hint = extract_tone_from_message(request.message)
            selected_tone = tone_hint or tone_preference or state_tone
            if selected_tone:
                new_state["tone_preference"] = selected_tone

            prompt_message = "Thanks for sharing that content! What should I create with it (LinkedIn post, email, TikTok script)?"
            if selected_tone and not tone_hint:
                prompt_message = "Got it! Should I turn this into a LinkedIn post, email, or TikTok script?"
            elif tone_hint:
                prompt_message = "Tone noted. Should I turn this into a LinkedIn post, email, or TikTok script?"

            return ChatResponse(
                message=prompt_message,
                conversation_state=new_state
            )

        # Detect if user wants to create content
        intent = detect_intent(request.message)
        
        if intent:
            effective_source_texts = resolve_source_texts(source_texts, state_sources)
            tone_from_message = extract_tone_from_message(request.message)
            tone_to_use = tone_preference or tone_from_message or state_tone

            if effective_source_texts:
                if tone_to_use:
                    return generate_content_response(
                        intent,
                        effective_source_texts,
                        tone_to_use
                    )
                return ChatResponse(
                    message="I see you have source material ready! What tone or style would you like for this content?",
                    conversation_state={
                        "waiting_for_tone": True,
                        "content_type": intent,
                        "user_instruction": request.message,
                        "pending_source_texts": effective_source_texts,
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
        fallback_tone = default_tone or extract_tone_from_message(request.message)

# def generate_chatbot_response(
#     user_message: str,
#     source_texts: Optional[list[dict]] = None,
#     tone_preference: Optional[str] = None
# ):


        response = generate_chatbot_response(request.message, combined_source_texts, fallback_tone)
        return ChatResponse(message=response, conversation_state={})
    except ServerError:
        return ChatResponse(message="The model is currently overloaded. Please try again later.", conversation_state={})
