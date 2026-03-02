def detect_scenes(video_path, threshold=30.0, show_progress=True):
    """
    Detect scenes using PySceneDetect's modern API.
    Returns list of (start_timecode, end_timecode) tuples.
    """
    from scenedetect import open_video, SceneManager, ContentDetector

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


