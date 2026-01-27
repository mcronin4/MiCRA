"""
Authentication endpoints for user info and protected route demo.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional

from ...auth.dependencies import User, get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


class MeResponse(BaseModel):
    """Response model for /me endpoint."""
    sub: str
    email: Optional[str]
    role: Optional[str]


class ProtectedResponse(BaseModel):
    """Response model for /protected endpoint."""
    message: str
    user_id: str
    user_email: Optional[str]


@router.get("/me", response_model=MeResponse)
async def get_current_user_info(user: User = Depends(get_current_user)):
    """
    Get current authenticated user information.
    
    Requires valid JWT token in Authorization header.
    """
    return MeResponse(
        sub=user.sub,
        email=user.email,
        role=user.role,
    )


@router.get("/protected", response_model=ProtectedResponse)
async def protected_endpoint(user: User = Depends(get_current_user)):
    """
    Example protected endpoint that requires authentication.
    
    Requires valid JWT token in Authorization header.
    """
    return ProtectedResponse(
        message="This is a protected route. You are authenticated!",
        user_id=user.sub,
        user_email=user.email,
    )
