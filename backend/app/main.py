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
# Allow localhost for dev, the configured production frontend origin, and Vercel preview domains
frontend_origin = os.getenv("FRONTEND_ORIGIN", "https://mi-cra.vercel.app")
allowed_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    frontend_origin,
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    # allow Vercel preview deployments
    allow_origin_regex=r"^https:\/\/.*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)
# Add routes here
