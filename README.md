# PetTalk Vision

Real-time canine behaviour analysis prototype: **camera/video → detect dog → pose keypoints → observable actions → possible mood → explanation**.

The dashboard is in **Hong Kong Traditional Chinese**. Mood labels are **possible interpretations of visible cues**, not a claim that the system can read a dog's mind.

Observable detections (dog, pose, sitting/standing/lying/walking) are separated from inferred possible states (好奇／警覺, 放鬆, etc.). Low-confidence keypoints are not drawn and are not used for classification. Behaviour is smoothed over the last ~14 frames.

Thresholds (single config source, overridable via env):

- `DOG_DETECTION_THRESHOLD=0.55`
- `KEYPOINT_CONF_THRESHOLD=0.42`
- `POSE_QUALITY_THRESHOLD=0.40`
- `TEMPORAL_WINDOW=14`

## Architecture

```
Browser webcam or local demo MP4
        │  JPEG frames over WebSocket (~8 fps)
        ▼
FastAPI + Ultralytics YOLO-seg (COCO `dog`)
        │  instance mask + bounding box
        ▼
Anatomical 24-keypoint reconstruction (Stanford Extra / Dog-Pose names)
        │
        ▼
Rule-based action + possible-mood layer
        │
        ▼
React overlay + live dashboard + timeline
```

### Why this model choice

Ultralytics publishes a [Dog-Pose dataset](https://docs.ultralytics.com/datasets/pose/dog-pose) (24 keypoints) but **does not ship pretrained Dog-Pose weights**. Training a custom model is out of scope for this prototype.

The backend therefore uses a **pretrained YOLO nano instance-segmentation model** (`yolo11n-seg.pt`, falling back to `yolov8n-seg.pt`) to detect dogs and extract a silhouette, then reconstructs the 24 Dog-Pose keypoints from that mask each frame. The skeleton tracks the real animal; behaviours the silhouette cannot support are shown as **資料不足** / **未能看見**.

If you later train or obtain a `*.pt` pose checkpoint, set `CUSTOM_POSE_MODEL=/absolute/path/to/model.pt` (the file is still loaded through Ultralytics; detection currently expects a seg model).

## Requirements

- Python 3.11+ (3.13 works)
- Node.js 20+
- A webcam, **or** a local MP4 at `frontend/public/assets/demo-dog.mp4`

## Quick start

```bash
# 1. Python backend (first run downloads YOLO weights)
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

```bash
# 2. Frontend (second terminal)
cd frontend
npm install
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173).

Or from the repo root:

```bash
./start.sh
```

## Demo video

The app always loads **`/assets/demo-dog.mp4`**. Replace that file with any local dog clip. Do not point the UI at a remote URL.

If webcam permission fails, use **Demo Video Mode**.

## Optional LLM explanations

Copy `.env.example` to `.env` and set `OPENAI_API_KEY` if you want richer copy in the AI Explanation panel. The core demo **never requires an API key**.

## What the dashboard means

| Field | Meaning |
| --- | --- |
| Detection | COCO dog class confidence |
| Body / Pose | Observable geometry (head, ears, body, tail, movement) |
| Action | Standing, sitting, lying, walking, attentive, play bow, or insufficient evidence |
| Possible Mood | Cautious interpretation: Curious/Alert, Relaxed, Playful, Possible Stress/Fear, Possible Defensive Behaviour |
| Why? | Which visual cues supported the reading |

Confidence for mood is intentionally lower than detection confidence.

## Tests

```bash
cd backend
source .venv/bin/activate
PYTHONPATH=. python -m pytest -q
```

```bash
cd frontend
npm run build
```

## Disclaimer

PetTalk Vision is a RightPick-style prototype for demonstrating a computer-vision product. It does not diagnose health conditions and does not know a dog's actual emotional state.
