# interacte with operating system, create folders, handle file path...
import os
from dotenv import load_dotenv
import yt_dlp
import traceback  # print error
import re
import time
import tempfile
from openai import OpenAI

# load vitual environment variables
load_dotenv()
ASR_MODEL = os.getenv("ASR_MODEL", "whisper-1")

ASR_DEVICE = os.getenv("ASR_DEVICE", "cpu")  # cuda | metal | cpu | auto
# float16 | int8_float16 | int8
ASR_COMPUTE = os.getenv("ASR_COMPUTE", "int8_float16")
ASR_VAD = os.getenv("ASR_VAD", "true").lower() == "true"


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


def transcribe_audio_or_video_file(audio_path: str, client: OpenAI):
    """
    Transcribes an audio file using OpenAI API.

    Args:
        audio_path (str): Path to the audio file.
        client (OpenAI): The OpenAI client instance.

    Returns:
        list: A list of transcription segments with start/end timestamps.
    """
    # normalize path
    audio_path = os.path.normpath(audio_path)
    try:
        # if the file does not exist at file path, exit
        if not os.path.exists(audio_path):
            print(f"Audio file not found at: {audio_path}")
            return None

        # transcribe video
        print("Transcribing audio...")
        start_time = time.time()

        # CHANGED: Open file in binary mode and call OpenAI API
        with open(audio_path, "rb") as audio_file:
            # We use response_format="verbose_json" to get timestamps (segments)
            transcript = client.audio.transcriptions.create(
                model=ASR_MODEL, 
                file=audio_file, 
                response_format="verbose_json"
            )

        end_time = time.time()
        elapsed = end_time - start_time

        print(f"Detected lanuaguge: {transcript.language}")
        results = []
        # CHANGED: Parse OpenAI 'segments' object to match your old output format
        # OpenAI segments come as objects, accessing via dot notation
        if hasattr(transcript, 'segments'):
            for seg in transcript.segments:
                results.append({
                    "start": seg['start'],
                    "end": seg['end'],
                    "text": seg['text'].strip()
                })
                print(f"[{seg['start']:.2f} - {seg['end']:.2f}] {seg['text']}")
        else:
            # Fallback if no segments returned (rare with verbose_json)
            results.append({
                "start": 0.0,
                "end": transcript.duration,
                "text": transcript.text
            })
            print(f"{transcript.text}")
            
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

    # CHANGED: Initialize OpenAI client instead of loading local WhisperModel
    # Ensure OPENAI_API_KEY is in your .env file
    try:
        client = OpenAI()
        print("OpenAI Client initialized successfully.")
    except Exception as e:
        print(f"Failed to initialize OpenAI Client: {e}")
        exit(1)
        
    try:
        choice, input_value = get_user_choice()

        if choice == "file":
            print(f"\nTranscribing: {input_value}")
            results = transcribe_audio_or_video_file(input_value, client=client)
            if not results:
                print("Transcription failed.")

        elif choice == "url":
            print(f"\nDownloading and transcribing: {input_value}")
            file_path = download_audio(input_value)
            if file_path:
                results = transcribe_audio_or_video_file(file_path, client=client)
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
