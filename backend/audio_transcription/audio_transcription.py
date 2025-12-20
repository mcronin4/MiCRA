# interacte with operating system, create folders, handle file path...
import os
from dotenv import load_dotenv
import yt_dlp
import traceback  # print error
import re
import time
import tempfile
import requests
from typing import Optional, List, Dict, Any

# load vitual environment variables
load_dotenv()
FIREWORK_API_KEY = os.getenv("FIREWORK_API_KEY")
FIREWORK_API_URL = "https://audio-turbo.api.fireworks.ai/v1/audio/transcriptions"


def download_audio(url: str) -> str:
    """
      Download the best audio stream from a YouTube video using yt-dlp.

      Args:
          url (str): The YouTube video URL.

      Returns:
          str: The path to the downloaded audio file.
      """
    try:
        with yt_dlp.YoutubeDL({"quiet": True, "skip_download": True}) as ydl:
            info = ydl.extract_info(url, download=False)
            title = info.get("title", "Unknown_Title")

        # Sanitize title for safe filenames (remove illegal characters)
        safe_title = re.sub(r"[^\w\-_.]", "_", title)

        # Create a unique temporary directory to avoid collisions during concurrent runs
        temp_dir = tempfile.mkdtemp()
        file_path = os.path.join(temp_dir, f"{safe_title}.mp3")

        ydl_opts = {
            "format": "bestaudio/best",
            "outtmpl": file_path.replace(".mp3", ".%(ext)s"),
            "noplaylist": True,
            "geo_bypass": True,
            "geo_bypass_country": "CA",
            "forceipv4": True,
            "extractor_args": {"youtube": {"player_client": ["android", "web"]}},
            "http_headers": {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) "
                    "Gecko/20100101 Firefox/123.0"
                ),
                "Accept-Language": "en-CA,en-US;q=0.9,en;q=0.8",
            },
            "retries": 5,
            "fragment_retries": 5,
        }

        # download mp3 file
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])

        # Find the actual output file (yt-dlp may change extension)
        folder = os.path.dirname(file_path)
        base_name = os.path.basename(file_path).replace(".mp3", "")

        matching_files = [
            f for f in os.listdir(folder)
            if f.startswith(base_name) and os.path.isfile(os.path.join(folder, f))
        ]

        if not matching_files:
            raise FileNotFoundError("yt-dlp did not create an output file.")

        # Use the actual file that was created
        file_path = os.path.join(folder, matching_files[0])

        print(f"✅ Audio downloaded to {file_path}")
        return file_path

    except Exception as e:
        print(f"Error downloading audio: {e}")
        print(f"Error type: {type(e).__name__}")
        print(f"Full error details: {traceback.format_exc()}")
        return None


def transcribe_audio_or_video_file(audio_path: str, model: Any = None):
    """
    Transcribes an audio file using Firework API.

    Args:
        audio_path (str): Path to the audio file.
        model: Ignored (kept for backward compatibility with existing API calls).

    Returns:
        list: A list of transcription segments with 'start', 'end', and 'text' keys.
    """
    # normalize path
    audio_path = os.path.normpath(audio_path)
    
    if not FIREWORK_API_KEY:
        print("Error: FIREWORK_API_KEY not found in environment variables")
        return None
    
    try:
        # if the file does not exist at file path, exit
        if not os.path.exists(audio_path):
            print(f"Audio file not found at: {audio_path}")
            return None

        # transcribe video using Firework API
        print("Transcribing audio with Firework API...")
        start_time = time.time()

        # Open the file and send to Firework API
        with open(audio_path, "rb") as f:
            response = requests.post(
                FIREWORK_API_URL,
                headers={"Authorization": f"Bearer {FIREWORK_API_KEY}"},
                files={"file": f},
                data={
                    "model": "whisper-v3-turbo",
                    "temperature": "0",
                    "vad_model": "silero",
                    "response_format": "verbose_json",
                    "timestamp_granularities": "segment"
                },
            )

        end_time = time.time()
        elapsed = end_time - start_time

        if response.status_code != 200:
            print(f"Error: Firework API returned status {response.status_code}")
            print(f"Response: {response.text}")
            return None

        # Parse the response
        result = response.json()
        
        # Extract language if available
        detected_language = result.get("language", "unknown")
        print(f"Detected language: {detected_language}")
        
        # Extract segments from verbose_json response
        # Firework API returns segments in the verbose_json format
        segments = result.get("segments", [])
        
        # If no segments but there's text, create a single segment (fallback)
        if not segments and result.get("text"):
            print("Warning: No segments found, but text is available. Creating single segment.")
            duration = result.get("duration", 0.0)
            segments = [{
                "start": 0.0,
                "end": duration,
                "text": result.get("text", "")
            }]
        
        if not segments:
            print("Warning: No segments found in Firework API response")
            return []
        
        results = []
        for seg in segments:
            # Firework API segments should have 'start', 'end', and 'text' fields
            # Handle both direct values and nested structures
            start = seg.get("start") if isinstance(seg.get("start"), (int, float)) else 0.0
            end = seg.get("end") if isinstance(seg.get("end"), (int, float)) else 0.0
            text = seg.get("text", "") if seg.get("text") else ""
            
            segment_result = {
                "start": float(start),
                "end": float(end),
                "text": str(text).strip()
            }
            results.append(segment_result)
            print(f"[{segment_result['start']:.2f} - {segment_result['end']:.2f}] {segment_result['text']}")

        print(f"Transcription completed in {elapsed:.2f} seconds.")
        return results  # return a list

    except Exception as e:
        print(f"Error during transcription: {e}")
        # type(e) gives <class 'FileNotFoundError'>, .__name__ extract class name
        print(f"Error type: {type(e).__name__}")
        print(f"Full error details: {traceback.format_exc()}")
        return None


def get_user_choice():
    """
      Get user input for transcription method.

      Returns:
          tuple: (choice, input_value) where choice is 'file', 'youtube', or 'video'
      """
    print("Choose an option:")
    print("1. Upload audio file or video file (mp3, wav, mp4, mov, mkv, etc.)")
    print("2. Provide video URL")

    while True:
        choice = input("\nEnter your choice (1 or 2): ").strip()

        if choice == "1":
            file_path = input("Enter file path: ").strip()
            if file_path:
                return "file", file_path
            else:
                print("Please provide a valid file path")

        elif choice == "2":
            url = input("Enter your video URL:").strip()
            if url:
                return "url", url
            else:
                print("Please provide a valid URL")

        else:
            print(f"Invalid choice. Please enter 1 or 2.")


if __name__ == "__main__":
    file_path = None

    print("Using Firework API for transcription...")
    
    if not FIREWORK_API_KEY:
        print("Error: FIREWORK_API_KEY not found in environment variables")
        exit(1)
    
    print("API key loaded successfully")

    try:
        choice, input_value = get_user_choice()

        if choice == "file":
            print(f"\nTranscribing: {input_value}")
            results = transcribe_audio_or_video_file(input_value)
            if not results:
                print("Transcription failed.")

        elif choice == "url":
            print(f"\nDownloading and transcribing: {input_value}")
            file_path = download_audio(input_value)
            if file_path:
                results = transcribe_audio_or_video_file(file_path)
                if not results:
                    print("Transcription failed.")
            else:
                print("Download failed. Cannot transcribe.")

    except KeyboardInterrupt:
        print("Transcription cancelled by user.")
    except Exception as e:
        print(f"Unexpected error: {e}")

    finally:
        # Clean up after processing
        if file_path:
            try:
                if os.path.exists(file_path):
                    os.remove(file_path)
                    print(f"Temporary file removed: {file_path}")
            except Exception as e:
                print(f"Could not remove file: {e}")

        # Sample tests:
        # file_path = download_audio("https://www.bilibili.com/video/BV1NM1KB3EX5/?spm_id_from=333.40138.feed-card.all.click")
        # transcribe_audio_or_video_file(file_path)
        # transcribe_audio_or_video_file("C:\QMIND\MiCRA-clean\backend\audio-transcription\mp3_files\万能机位思路，5分钟讲透！拍什么都能用（不是套路，是思路_audio.mp3")
        # https://www.youtube.com/watch?v=cAJBA31iu3g
