from fastapi import APIRouter
from .v1 import trigger_job, hitl

api_router = APIRouter(prefix="/api", tags=["content-pipeline"])

api_router.include_router(trigger_job.router, prefix="/v1", tags=["trigger_job"])
api_router.include_router(hitl.router, prefix="/v1", tags=["hitl"])

@api_router.get("/")
def read_root():
    return {"message": "Hello, World!"}