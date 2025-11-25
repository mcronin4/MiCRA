#!/usr/bin/env python

import argparse
import json
import os
import urllib.request
import cv2
import numpy as np
from PIL import Image

# Shhh, TensorFlow
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'

try:
    from deepface import DeepFace
    import torch
    import torch.nn.functional as F
    from torchvision import models
    from torchvision import transforms as T
except ImportError:
    print("Error: Missing required libraries.")
    print("Please run: pip install deepface opencv-python torch torchvision pillow numpy")
    exit(1)

# Globals for the Places365 model files
PLACES_CATEGORIES_FILE = 'categories_places365.txt'
PLACES_WEIGHTS_FILE = 'resnet18_places365.pth.tar'
PLACES_CATEGORIES_URL = 'https://raw.githubusercontent.com/csailvision/places365/master/categories_places365.txt'
PLACES_WEIGHTS_URL = 'http://places2.csail.mit.edu/models_places365/resnet18_places365.pth.tar'


# 1. PLACES365 SCENE CLASSIFICATION

def _download_file_if_not_exists(url, filename):
    # Download model files if we don't have them
    if not os.path.exists(filename):
        print(f"Downloading {filename} from {url}...")
        try:
            urllib.request.urlretrieve(url, filename)
            print("Download complete.")
        except Exception as e:
            print(f"Error downloading {filename}: {e}")
            print("Please download it manually and place it in the same directory.")
            exit(1)

def load_places_model():
    # Load the pre-trained Places365 ResNet18 model
    
    # Make sure we have the model files
    _download_file_if_not_exists(PLACES_CATEGORIES_URL, PLACES_CATEGORIES_FILE)
    _download_file_if_not_exists(PLACES_WEIGHTS_URL, PLACES_WEIGHTS_FILE)

    try:
        # Load class labels
        with open(PLACES_CATEGORIES_FILE) as f:
            # Format is: '/a/abbey 0' -> we want 'abbey'
            classes = [line.strip().split(' ')[0][3:] for line in f]
        
        # Load model architecture
        model = models.resnet18(weights=None)
        # Fix the final layer for 365 classes
        model.fc = torch.nn.Linear(model.fc.in_features, 365)
        
        # Load pre-trained weights
        checkpoint = torch.load(PLACES_WEIGHTS_FILE, map_location=torch.device('cpu'))
        # The weights are saved with a 'module.' prefix, so we strip it
        state_dict = {k.replace('module.', ''): v for k, v in checkpoint['state_dict'].items()}
        model.load_state_dict(state_dict)
        
        # Set model to eval mode (important!)
        model.eval()

        # Define the image preprocessing steps
        transform = T.Compose([
            T.Resize(256, interpolation=T.InterpolationMode.BICUBIC),
            T.CenterCrop(224),
            T.ToTensor(),
            T.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ])
        
        return model, classes, transform
        
    except Exception as e:
        print(f"Error loading Places365 model: {e}")
        print("Please ensure files are downloaded correctly.")
        exit(1)

@torch.no_grad()
def classify_scene(frame_bgr, places_model, places_classes, places_transform, topk=5):
    # Get top-k scene classifications for a single frame
    try:
        # Convert from BGR (OpenCV) to RGB (PIL)
        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        pil_img = Image.fromarray(frame_rgb)
        
        # Apply transform and add batch dimension
        input_tensor = places_transform(pil_img).unsqueeze(0)
        
        # Get model output
        logits = places_model(input_tensor)
        probabilities = F.softmax(logits, dim=1).cpu()[0]
        
        # Get top-k results
        top_scores, top_idx = torch.topk(probabilities, topk)
        
        # Convert tensors to python lists to avoid indexing errors
        top_scores = top_scores.tolist()
        top_idx = top_idx.tolist()

        # Format results
        top_k_list = []
        for i in range(topk):
            top_k_list.append({
                "label": places_classes[top_idx[i]],
                "probability": float(top_scores[i])
            })
            
        return {
            "top_scene": top_k_list[0]["label"],
            "top_k_scenes": top_k_list
        }
    except Exception as e:
        return {
            "error": f"Scene classification failed: {e}",
            "top_scene": None,
            "top_k_scenes": []
        }

# 2. DEEPFACE EMOTION DETECTION

def analyze_emotion(frame_bgr):
    # Get facial emotion analysis for a single frame
    try:
        # Convert to RGB for accurate DeepFace analysis
        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)

        # DeepFace.analyze can take a numpy array directly
        # enforce_detection=False -> doesn't crash if no face is found
        results = DeepFace.analyze(
            img_path=frame_rgb,
            actions=['emotion'],
            enforce_detection=False,
            detector_backend='retinaface',
            silent=True # Suppress progress bars
        )
        
        # DeepFace returns a list for >0 faces, or a single dict if 0
        if isinstance(results, list) and len(results) > 0:
            # Multiple faces found, pick the largest one
            main_face = max(results, key=lambda r: r['region']['w'] * r['region']['h'])
        elif isinstance(results, dict):
            # This is the single result (which may or may not have found a face)
            main_face = results
        else:
            # Shouldn't happen, but just in case
            return {"face_detected": False, "dominant_emotion": None, "probabilities": {}}

        # Check if a face was actually detected
        if not main_face.get("region"):
            return {"face_detected": False, "dominant_emotion": None, "probabilities": {}}

        # Convert numpy floats to standard python floats for JSON
        probs = main_face.get("emotion", {})
        clean_probs = {k: float(v) for k, v in probs.items()} if probs else {}

        return {
            "face_detected": True,
            "dominant_emotion": main_face.get("dominant_emotion"),
            "probabilities": clean_probs
        }
        
    except Exception as e:
        # Catch-all if DeepFace fails
        return {
            "error": f"Emotion detection failed: {e}",
            "face_detected": False,
            "dominant_emotion": None,
            "probabilities": {}
        }

# 3. MAIN EXECUTION

def analyze_frame_from_path(image_path, places_model, places_classes, places_transform, topk_scenes=5):
    # Run all analyses on an image file
    
    # Load the frame from the image path
    if not os.path.exists(image_path):
        return {"error": f"File not found: {image_path}"}
        
    frame = cv2.imread(image_path)
    if frame is None:
        return {"error": f"Could not read image file: {image_path}"}
    
    # Run analyses
    emotion_meta = analyze_emotion(frame)
    scene_meta = classify_scene(
        frame, 
        places_model, 
        places_classes, 
        places_transform, 
        topk=topk_scenes
    )
    
    # Combine into final metadata object
    metadata = {
        "frame_path": image_path,
        "emotion_analysis": emotion_meta,
        "scene_analysis": scene_meta
    }
    
    return metadata

if __name__ == "__main__":
    # This makes the script runnable from the command line
    
    parser = argparse.ArgumentParser(
        description="Analyze a single frame for facial emotion and scene classification."
    )
    parser.add_argument(
        "-i", "--image", 
        type=str, 
        required=True, 
        help="Path to the input image frame."
    )
    parser.add_argument(
        "-k", "--topk", 
        type=int, 
        default=3, 
        help="Number of top scene classifications to return."
    )
    args = parser.parse_args()
    
    # Load the (slow) Places365 model ONCE
    print("Loading Places365 model (this may take a moment)...")
    p_model, p_classes, p_transform = load_places_model()
    print("Model loaded.")
    
    # Run the full analysis
    print(f"Analyzing frame: {args.image}...")
    final_metadata = analyze_frame_from_path(
        args.image,
        p_model,
        p_classes,
        p_transform,
        topk_scenes=args.topk
    )
    
    # Print the final result as clean JSON
    print("\n--- ANALYSIS METADATA ---")
    print(json.dumps(final_metadata, indent=2))