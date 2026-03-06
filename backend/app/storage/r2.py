"""
Cloudflare R2 (S3-compatible) storage client.
Uses boto3 for S3-compatible operations.
"""
import os
import boto3
from botocore.client import BaseClient
from typing import Optional


class R2Client:
    """Singleton R2 client wrapper."""
    
    _instance: Optional['R2Client'] = None
    _client: Optional[BaseClient] = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if self._client is None:
            endpoint_url = os.getenv("R2_ENDPOINT")
            access_key_id = os.getenv("R2_ACCESS_KEY_ID")
            secret_access_key = os.getenv("R2_SECRET_ACCESS_KEY")
            
            if not endpoint_url:
                raise ValueError("R2_ENDPOINT environment variable is required")
            if not access_key_id:
                raise ValueError("R2_ACCESS_KEY_ID environment variable is required")
            if not secret_access_key:
                raise ValueError("R2_SECRET_ACCESS_KEY environment variable is required")
            
            try:
                self._client = boto3.client(
                    "s3",
                    endpoint_url=endpoint_url,
                    aws_access_key_id=access_key_id,
                    aws_secret_access_key=secret_access_key,
                    region_name="auto"
                )
            except Exception as e:
                raise ValueError(f"Failed to create R2 client: {str(e)}")
    
    @property
    def client(self) -> BaseClient:
        """Get the R2 client instance."""
        if self._client is None:
            raise RuntimeError("R2 client not initialized. Check environment variables.")
        return self._client

    def upload_bytes(self, path: str, data: bytes, content_type: str) -> None:
        """Upload raw bytes to R2 at the given object key."""
        self.client.put_object(
            Bucket=R2_BUCKET,
            Key=path,
            Body=data,
            ContentType=content_type,
        )

    def sign_path(self, path: str, expires_in: int = 3600) -> str:
        """Generate a presigned GET URL for an object at the given R2 key."""
        return self.client.generate_presigned_url(
            'get_object',
            Params={'Bucket': R2_BUCKET, 'Key': path},
            ExpiresIn=expires_in,
        )


def get_r2() -> R2Client:
    """Get the R2 client singleton."""
    return R2Client()


# R2 bucket name
R2_BUCKET = "micra"
