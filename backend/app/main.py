from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from .api.routes import api_router
from .agents.transcription.asr_service import ASRService
import os


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manage application lifespan: startup and shutdown events.
    Loads the ASR model at startup and closes it at shutdown.
    """
    # Startup: Load the ASR model
    print("🚀 Starting MiCRA application...")
    asr_service = ASRService.get_instance()
    # Pre-load the model at startup (optional, but ensures it's ready)
    # Model will be loaded lazily on first use if you comment this out
    asr_service.get_model()
    print("✅ Application startup complete")

    yield

    # Shutdown: Close the ASR model
    print("🛑 Shutting down MiCRA application...")
    asr_service.close()
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
