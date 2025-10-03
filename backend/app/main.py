from fastapi import FastAPI
from api.routes import api_router

app = FastAPI(title="MiCRA", description="MiCRA is a multi-modal content-repurposing agent that ingests long-form company content (call transcripts, papers, videos) and transforms the message into various outputs potentially including company blogs, marketing content (LinkedIn, X, …), and more.")
app.include_router(api_router)
# Add routes here