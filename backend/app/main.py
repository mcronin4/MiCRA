from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from .api.routes import api_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manage application lifespan: startup and shutdown events.
    """
    # Startup
    print("🚀 Starting MiCRA application...")
    print("✅ Application startup complete")

    yield

    # Shutdown
    print("🛑 Shutting down MiCRA application...")
    print("✅ Application shutdown complete")

app = FastAPI(
    title="MiCRA",
    description="MiCRA is a multi-modal content-repurposing agent that ingests long-form company content (call transcripts, papers, videos) and transforms the message into various outputs potentially including company blogs, marketing content (LinkedIn, X, …), and more.",
    lifespan=lifespan
)

# Add CORS middleware - must be first middleware
# Allow specific origins for production; use environment variable or allow localhost for dev
import os
allowed_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,  # Required for Authorization header
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH", "HEAD"],
    allow_headers=["Authorization", "Content-Type", "Accept"],  # Explicitly allow Authorization header
)

app.include_router(api_router)
