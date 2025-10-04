# This file will contain the functionality to trigger a job. We will send the job id from the frontend and the backend will trigger the job.

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel 
import uuid

router = APIRouter(prefix="/trigger_job") #path for the endpoint

class JobRequest(BaseModel):
    job_id: str
    text: str

class JobResponse(BaseModel):
    message: str
    job_id: str
    status: str

@router.post("/", response_model=JobResponse, status_code=202) #This handles the POST REQUEST, sends back jobResponse
async def trigger_job(job_request: JobRequest):
    """
    Trigger a job with the provided job_id and text content.
    Returns a 202 Accepted status indicating the job has been triggered.
    """
    try:
        # Here you would typically add your job processing logic
        # For now, we'll just simulate job triggering
        
        # Validate job_id format (basic validation)
        if not job_request.job_id or len(job_request.job_id.strip()) == 0:
            raise HTTPException(status_code=400, detail="Job ID cannot be empty")
        
        if not job_request.text or len(job_request.text.strip()) == 0:
            raise HTTPException(status_code=400, detail="Text content cannot be empty")
        
        # Simulate job processing (replace with actual job logic)
        print(f"Triggering job {job_request.job_id} with text: {job_request.text[:100]}...")
        
        return JobResponse(
            message=f"Job {job_request.job_id} has been successfully triggered and is being processed",
            job_id=job_request.job_id,
            status="accepted"
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to trigger job: {str(e)}")
