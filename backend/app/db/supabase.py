"""
Supabase client wrapper for server-side operations.
Uses service role key for admin operations.
"""
import os
from typing import Optional
from supabase import create_client, Client, ClientOptions
from fastapi import HTTPException


class SupabaseClient:
    """
    Singleton Supabase client wrapper for ADMIN operations.
    Uses service role key, bypassing RLS. Use with caution.
    """
    
    _instance: Optional['SupabaseClient'] = None
    _client: Optional[Client] = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if self._client is None:
            supabase_url = os.getenv("SUPABASE_URL")
            supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
            
            if not supabase_url:
                raise ValueError("SUPABASE_URL environment variable is required")
            if not supabase_key:
                raise ValueError("SUPABASE_SERVICE_ROLE_KEY environment variable is required")
            
            try:
                self._client = create_client(supabase_url, supabase_key)
            except Exception as e:
                raise ValueError(f"Failed to create Supabase client: {str(e)}")
    
    @property
    def client(self) -> Client:
        """Get the Supabase client instance."""
        if self._client is None:
            raise RuntimeError("Supabase client not initialized. Check environment variables.")
        return self._client
    
    def storage(self):
        """Get the storage client."""
        return self.client.storage


def get_supabase() -> SupabaseClient:
    """
    Get the Supabase client singleton (SERVICE ROLE / ADMIN).
    WARNING: This bypasses RLS. Use get_authenticated_supabase() for user operations.
    """
    return SupabaseClient()


def get_authenticated_supabase(token: str) -> Client:
    """
    Get a Supabase client authenticated as the specific user.
    Uses SUPABASE_ANON_KEY + User JWT to enforce RLS policies.
    """
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_anon_key = os.getenv("SUPABASE_ANON_KEY")
    
    if not supabase_url:
        raise ValueError("SUPABASE_URL environment variable is required")
    # Fallback to service role if anon key missing (risky?) - No, strict fail.
    # Actually user might not have set it if they only had service key before. 
    # But .env shows it exists.
    if not supabase_anon_key:
        # If anon key is missing, we can't do RLS properly without exposed key?
        # Actually we could potentially use service key + perform hacky auth, but standard is anon key.
        # Let's assume it exists as we saw it in .env
        raise ValueError("SUPABASE_ANON_KEY environment variable is required for authenticated requests")
        
    try:
        options = ClientOptions(
            headers={"Authorization": f"Bearer {token}"},
            persist_session=False,
            auto_refresh_token=False
        )
        return create_client(supabase_url, supabase_anon_key, options=options)
    except Exception as e:
        raise ValueError(f"Failed to create authenticated Supabase client: {str(e)}")

