"""Live computer-vision checks against real frames. Skips if the model is missing."""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
import pytest

from app.detector import DogAnalyzer
from app.session import SessionState

ROOT = Path(__file__).resolve().parents[2]
DEMO = ROOT / "frontend" / "public" / "assets" / "demo-dog.mp4"
SWIM = Path("/tmp/pettalk-vids/swim.webm")
MODEL = ROOT / "backend" / "models" / "yolo11n-seg.pt"


@pytest.fixture(scope="module")
def analyzer():
    if not MODEL.exists():
        pytest.skip("YOLO weights not present")
    return DogAnalyzer()


def _run_video(analyzer: DogAnalyzer, path: Path, n: int = 16) -> list[dict]:
    cap = cv2.VideoCapture(str(path))
    assert cap.isOpened(), path
    session = SessionState()
    out = []
    for _ in range(n):
        ok, frame = cap.read()
        if not ok:
            break
        out.append(analyzer.analyze(frame, session, {"name": "Mochi", "traits": ["害羞"]}))
    cap.release()
    return out


def test_black_frame_is_no_dog(analyzer):
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    session = SessionState()
    result = analyzer.analyze(frame, session)
    assert result["detection"]["present"] is False
    assert result["detection"]["count"] == 0
    assert result["message"] == "未偵測到狗狗"
    assert result["action"]["id"] == "insufficient"
    assert result["mood"]["id"] == "insufficient"
    assert result["pose"]["movement"]["id"] == "insufficient"
    labels = [e["label"] for e in result["timeline"]]
    assert "坐下" not in labels
    assert "好奇／警覺" not in labels


def test_demo_sitting_clip_does_not_fake_a_mood_carousel(analyzer):
    if not DEMO.exists():
        pytest.skip("demo video missing")
    results = _run_video(analyzer, DEMO, 18)
    assert results
    last = results[-1]
    assert last["detection"]["present"] is True
    assert last["detection"]["confidence"] > 0.55
    labels = [e["label"] for e in last["timeline"]]
    assert labels.count("坐下") <= 1
    assert labels.count("好奇／警覺") == 0
    moods = {row["mood"]["id"] for row in results if row["detection"]["present"]}
    assert "alert_curious" not in moods or last["pose"]["ears"]["id"] == "forward"
    bodies = [row["action"]["id"] for row in results[-8:]]
    assert "walking" not in bodies or last["pose"]["movement"]["id"] in {"medium", "high"}


def test_different_inputs_are_not_identical(analyzer):
    black = analyzer.analyze(np.zeros((480, 640, 3), dtype=np.uint8), SessionState())
    demo_rows = _run_video(analyzer, DEMO, 12) if DEMO.exists() else []
    swim_rows = _run_video(analyzer, SWIM, 12) if SWIM.exists() else []
    assert black["detection"]["present"] is False
    if demo_rows:
        demo = demo_rows[-1]
        assert demo["detection"]["present"] is True
        assert demo["detection"]["confidence"] != black["detection"]["confidence"]
        assert demo["keypoints"] != black["keypoints"]
    if demo_rows and swim_rows:
        demo = demo_rows[-1]
        swim = swim_rows[-1]
        if swim["detection"]["present"]:
            assert swim["pose"]["movement"]["id"] != demo["pose"]["movement"]["id"] or swim["action"]["id"] != demo["action"]["id"]
            demo_xy = [(k["x"], k["y"]) for k in demo["keypoints"] if k["visible"]]
            swim_xy = [(k["x"], k["y"]) for k in swim["keypoints"] if k["visible"]]
            assert demo_xy != swim_xy
