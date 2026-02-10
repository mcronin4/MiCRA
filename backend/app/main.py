from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os
import logging
from dotenv import load_dotenv
from .api.routes import api_router

# Load environment variables from .env file
load_dotenv()

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manage application lifespan: startup and shutdown events.
    """
    # Startup
    logger.info("🚀 Starting MiCRA application...")

    # Pre-warm JWKS keys (avoids 3-4s network fetch on first request)
    try:
        from .auth.dependencies import get_jwks_client
        jwks_client = get_jwks_client()
        jwks_client.get_jwk_set()  # Force fetch and cache signing keys
        logger.info("✅ JWKS keys pre-warmed")
    except Exception as e:
        logger.warning(f"⚠️ Failed to pre-warm JWKS keys: {e}")

    # Pre-warm Supabase admin client + DB connection pool
    try:
        from .db.supabase import get_supabase
        sb = get_supabase().client
        sb.table("files").select("id").limit(1).execute()
        logger.info("✅ Supabase connection pre-warmed")
    except Exception as e:
        logger.warning(f"⚠️ Failed to pre-warm Supabase connection: {e}")

    # Pre-warm R2 client
    try:
        from .storage.r2 import get_r2
        get_r2()
        logger.info("✅ R2 client pre-warmed")
    except Exception as e:
        logger.warning(f"⚠️ Failed to pre-warm R2 client: {e}")

    logger.info("✅ Application startup complete")

    yield

    # Shutdown
    logger.info("🛑 Shutting down MiCRA application...")
    logger.info("✅ Application shutdown complete")

app = FastAPI(
    title="MiCRA",
    description="MiCRA is a multi-modal content-repurposing agent that ingests long-form company content (call transcripts, papers, videos) and transforms the message into various outputs potentially including company blogs, marketing content (LinkedIn, X, …), and more.",
    lifespan=lifespan
)

# Add CORS middleware - must be first middleware
# Allow specific origins for production; use environment variable or allow localhost for dev
allowed_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,  # Required for Authorization header
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH", "HEAD"],
    allow_headers=["Authorization", "Content-Type", "Accept"],  # Explicitly allow Authorization header
)

app.include_router(api_router)
