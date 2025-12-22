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
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH", "HEAD"],
    allow_headers=["*"],
)

app.include_router(api_router)
