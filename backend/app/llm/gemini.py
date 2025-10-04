from google import genai
from dotenv import load_dotenv
load_dotenv()
import os
gemini_api_key = os.getenv("GEMINI_API_KEY")

client = genai.Client(api_key=gemini_api_key)



def query_gemini(prompt: str):
  response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents="Explain how AI works in a few words",
  )
  return response.text