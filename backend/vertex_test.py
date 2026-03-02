import google.auth
from google.auth.transport.requests import Request
import requests

PROJECT_ID = "core-avenue-488216-t2"
LOCATION = "us-central1"
MODEL = "veo-3.1-generate-001"  # Veo 3.1 model ID :contentReference[oaicite:2]{index=2}

creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
creds.refresh(Request())
token = creds.token

url = (
    "https://aiplatform.googleapis.com/v1beta1/"
    f"projects/{PROJECT_ID}/locations/{LOCATION}/publishers/google/models/{MODEL}:predictLongRunning"
)  # Veo uses predictLongRunning :contentReference[oaicite:3]{index=3}

headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json",
}

# Intentionally invalid payload so it errors BEFORE any generation
r = requests.post(url, headers=headers, json={})
print(r.status_code)
print(r.text[:1200])