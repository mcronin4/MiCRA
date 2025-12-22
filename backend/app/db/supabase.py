"""
Supabase client wrapper for server-side operations.
Uses service role key for admin operations.
"""
import os
from typing import Optional
from supabase import create_client, Client
from fastapi import HTTPException


class SupabaseClient:
    """Singleton Supabase client wrapper."""
    
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
    """Get the Supabase client singleton."""
    return SupabaseClient()

