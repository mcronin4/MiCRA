import os

import yt_dlp

from scenedetect import VideoManager, SceneManager
from scenedetect.detectors import ContentDetector

def download_youtube_video(url, output_dir="mp4_downloads"):
    os.makedirs(output_dir, exist_ok=True)

    # Configure yt_dlp options
    ydl_opts = {
        "format": "bestvideo+bestaudio/best",
        "outtmpl": os.path.join(output_dir, "%(title)s.%(ext)s"),
        "merge_output_format": "mp4",
        "quiet": False,
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        filename = ydl.prepare_filename(info).rsplit(".", 1)[0] + ".mp4"
        print(f"✅ Downloaded video: {filename}")
        return filename
      
def detect_scenes(video_path, threshold=30.0):
    print(f"🎬 Detecting scenes in: {video_path}")

    video_manager = VideoManager([video_path])
    scene_manager = SceneManager()
    scene_manager.add_detector(ContentDetector(threshold=threshold))

    video_manager.start()
    scene_manager.detect_scenes(frame_source=video_manager)
    scene_list = scene_manager.get_scene_list()
    video_manager.release()

    print(f"✅ Detected {len(scene_list)} scenes:")
    for i, (start, end) in enumerate(scene_list):
        print(f"  Scene {i+1}: {start.get_timecode()} → {end.get_timecode()}")

    return scene_list
  
if __name__=="__main__":
  url = "https://www.youtube.com/watch?app=desktop&v=frMH2k-0PPE"
  video_path = download_youtube_video(url)
  try:
        detect_scenes(video_path, threshold=30.0)
  finally:
      # 3. Delete the video file after analysis
      if os.path.exists(video_path):
          os.remove(video_path)
          print(f"🗑️ Deleted video: {video_path}")
      else:
          print("⚠️ Could not delete video (file not found).")