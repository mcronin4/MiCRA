"""
JWT verification dependencies for FastAPI.
Validates Supabase-issued JWT tokens on protected endpoints.
"""

import os
from typing import Optional
from functools import lru_cache
from fastapi import Depends, HTTPException, status, Header
from pydantic import BaseModel
import jwt
from jwt import PyJWKClient


class User(BaseModel):
    """User information extracted from JWT."""
    sub: str  # User ID (subject)
    email: Optional[str] = None
    role: Optional[str] = None


def get_supabase_jwks_url() -> str:
    """Get the JWKS URL from Supabase URL."""
    supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    if not supabase_url:
        raise ValueError("SUPABASE_URL environment variable is required")
    return f"{supabase_url}/.well-known/jwks.json"


@lru_cache(maxsize=1)
def get_jwks_client() -> PyJWKClient:
    """Get or create cached JWKS client."""
    jwks_url = get_supabase_jwks_url()
    return PyJWKClient(jwks_url)


def get_jwt_issuer() -> str:
    """Get JWT issuer from environment or infer from SUPABASE_URL."""
    issuer = os.getenv("SUPABASE_JWT_ISSUER")
    if issuer:
        return issuer
    # Infer from SUPABASE_URL if not explicitly set
    supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    if supabase_url:
        return f"{supabase_url}/auth/v1"
    raise ValueError("SUPABASE_JWT_ISSUER or SUPABASE_URL environment variable is required")


def get_jwt_audience() -> str:
    """Get JWT audience from environment or use default."""
    return os.getenv("SUPABASE_JWT_AUDIENCE", "authenticated")


def verify_jwt(token: str) -> User:
    """
    Verify a Supabase JWT token and extract user information.
    
    Args:
        token: JWT access token from Supabase
        
    Returns:
        User object with user information
        
    Raises:
        HTTPException: If token is invalid, expired, or verification fails
    """
    try:
        # Get signing key from JWKS
        jwks_client = get_jwks_client()
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        
        # Decode and verify token
        issuer = get_jwt_issuer()
        audience = get_jwt_audience()
        
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=audience,
            issuer=issuer,
        )
        
        # Extract user information
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token missing 'sub' claim"
            )
        
        return User(
            sub=user_id,
            email=payload.get("email"),
            role=payload.get("role", "authenticated"),
        )
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired"
        )
    except jwt.InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}"
        )
    except Exception as e:
        # Handle JWKS fetch errors or other unexpected errors
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token verification failed: {str(e)}"
        )


async def get_current_user(authorization: str = Header(..., description="Bearer token")) -> User:
    """
    FastAPI dependency to extract and verify JWT token from Authorization header.
    
    Usage:
        @router.get("/protected")
        async def protected_endpoint(user: User = Depends(get_current_user)):
            return {"user_id": user.sub}
    
    Args:
        authorization: Authorization header value (format: "Bearer <token>")
        
    Returns:
        User object with verified user information
        
    Raises:
        HTTPException: 401 if token is missing, invalid, or expired
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header must start with 'Bearer '"
        )
    
    token = authorization[7:].strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is required"
        )
    
    return verify_jwt(token)
