from fastapi import APIRouter
from .v1 import hitl, trigger_job, transcription, image_matching, files

api_router = APIRouter(prefix="/api", tags=["content-pipeline"])

api_router.include_router(hitl.router, prefix="/v1", tags=["hitl"])
api_router.include_router(trigger_job.router, prefix="/v1", tags=["trigger_job"])
api_router.include_router(transcription.router, prefix="/v1", tags=["transcription"])
api_router.include_router(image_matching.router, prefix="/v1", tags=["image-matching"])
api_router.include_router(files.router, prefix="/v1", tags=["files"])

@api_router.get("/")
def read_root():
    return {"message": "Hello, World!"}