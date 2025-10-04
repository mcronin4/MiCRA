# This file will contain the functionality to trigger a job. We will send the job id from the frontend and the backend will trigger the job.

from fastapi import APIRouter

router = APIRouter(prefix="/trigger_job")

# create a POST endpoint here that accepts a job id (string) and triggers the job, returns a 202 accepted status. Return a message indicating the job has been triggered.
# fake comment