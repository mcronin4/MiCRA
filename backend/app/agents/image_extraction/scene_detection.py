import os

import yt_dlp

from scenedetect import open_video, SceneManager, ContentDetector


def download_youtube_video(url, output_dir="mp4_downloads") -> str:
    os.makedirs(output_dir, exist_ok=True)

    ydl_opts = {
        "format": "bestvideo+bestaudio/best",
        "outtmpl": os.path.join(output_dir, "%(title)s.%(ext)s"),
        "merge_output_format": "mp4",
        "quiet": False,
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        filename = ydl.prepare_filename(info).rsplit(".", 1)[0] + ".mp4"
        if not filename:
            raise ValueError("Failed to generate filename from video info")
        print(f"✅ Downloaded video: {filename}")
        return filename


def detect_scenes(video_path, threshold=30.0, show_progress=True):
    """
    Detect scenes using PySceneDetect's modern API.
    Returns list of (start_timecode, end_timecode) tuples.
    """
    print(f"🎬 Detecting scenes in: {video_path}")
    
    video = open_video(video_path)
    scene_manager = SceneManager()
    scene_manager.add_detector(ContentDetector(threshold=threshold))
    
    # detect_scenes with show_progress shows a progress bar
    scene_manager.detect_scenes(video, show_progress=show_progress)
    scene_list = scene_manager.get_scene_list()
    
    print(f"✅ Detected {len(scene_list)} scenes:")
    for i, (start, end) in enumerate(scene_list):
        print(f"  Scene {i+1}: {start.get_timecode()} → {end.get_timecode()}")

    return scene_list


if __name__ == "__main__":
    url = "https://www.youtube.com/watch?app=desktop&v=frMH2k-0PPE"
    video_path = None
    try:
        video_path = download_youtube_video(url)
        detect_scenes(video_path, threshold=30.0)
    finally:
        if video_path and os.path.exists(video_path):
            os.remove(video_path)
            print(f"🗑️ Deleted video: {video_path}")
        else:
            print("⚠️ Could not delete video (file not found).")
