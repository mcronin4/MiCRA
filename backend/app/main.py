from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from .api.routes import api_router
import os


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

# Add CORS middleware
# Use regex to allow all Vercel domains and localhost
app.add_middleware(
    CORSMiddleware,
    allow_origins=[],  # Empty list - use regex instead
    # Allow Vercel preview deployments and localhost
    allow_origin_regex=r"^https:\/\/.*\.vercel\.app$|^http:\/\/localhost:\d+$|^http:\/\/127\.0\.0\.1:\d+$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
)

app.include_router(api_router)
# Add routes here
