# This file will contain the functionality to trigger a job. We will send the job id from the frontend and the backend will trigger the job.

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel 
import uuid

from ...agents.summarization.summarizer import summarize
from ...agents.text_generation.linkedin_generation import generate_linkedin_post
from ...agents.text_generation.email_generation import generate_email

router = APIRouter(prefix="/trigger_job") #path for the endpoint

class JobRequest(BaseModel):
    job_id: str
    text: str
    platform: str

class JobResponse(BaseModel):
    message: str
    job_id: str
    status: str

@router.post("/", response_model=JobResponse, status_code=200) #This handles the POST REQUEST, sends back jobResponse
async def trigger_job(job_request: JobRequest):
    """
    Trigger a job with the provided job_id and text content.
    Returns a 200 OK status indicating the job has been triggered.
    """
    try:
        summary = summarize(job_request.text)

        if job_request.platform == "linkedin":
            generated_text = generate_linkedin_post(summary)
        elif job_request.platform == "email":
            generated_text = generate_email(summary)
        else:
            raise HTTPException(status_code=400, detail="Invalid platform")
        
        # Validate job_id format (basic validation)
        if not job_request.job_id or len(job_request.job_id.strip()) == 0:
            raise HTTPException(status_code=400, detail="Job ID cannot be empty")
        
        if not job_request.text or len(job_request.text.strip()) == 0:
            raise HTTPException(status_code=400, detail="Text content cannot be empty")
        
        # Simulate job processing (replace with actual job logic)
        print(f"Triggering job {job_request.job_id} with text: {job_request.text[:100]}...")
        
        return JobResponse(
            message=generated_text,
            job_id=job_request.job_id,
            status="ok"
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to trigger job: {str(e)}")
