"""YOLO dog detection + instance mask, then anatomical keypoints and behaviour rules."""

from __future__ import annotations

import logging
import os
import time
from pathlib import Path

import cv2
import numpy as np

from .behaviour import INSUFFICIENT, interpret
from .config import get_settings
from .keypoints import SKELETON_INDEX, empty_keypoints
from .pose import estimate_keypoints, smooth_keypoints
from .session import SessionState

logger = logging.getLogger(__name__)

COCO_DOG = 16
MODEL_CANDIDATES = ("yolo11n-seg.pt", "yolov8n-seg.pt")
BACKEND_DIR = Path(__file__).resolve().parents[1]
os.environ.setdefault("YOLO_CONFIG_DIR", str(BACKEND_DIR / "Ultralytics"))
os.environ.setdefault("MPLCONFIGDIR", str(BACKEND_DIR / "Ultralytics" / "mpl"))
(BACKEND_DIR / "Ultralytics" / "mpl").mkdir(parents=True, exist_ok=True)


def _pick_device() -> str:
    try:
        import torch

        if torch.cuda.is_available():
            return "cuda"
        if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
            return "mps"
    except Exception:
        pass
    return "cpu"


class DogAnalyzer:
    def __init__(self) -> None:
        from ultralytics import YOLO

        settings = get_settings()
        custom = (settings.custom_pose_model or "").strip()
        model_path = None
        if custom and Path(custom).exists():
            model_path = custom
        else:
            models_dir = Path(__file__).resolve().parents[1] / "models"
            for name in MODEL_CANDIDATES:
                local = models_dir / name
                if local.exists():
                    model_path = str(local)
                    break
            if model_path is None:
                model_path = MODEL_CANDIDATES[0]

        logger.info("Loading segmentation model %s", model_path)
        last_error: Exception | None = None
        loaded = None
        names = [model_path, *[n for n in MODEL_CANDIDATES if n != model_path]]
        for name in names:
            try:
                loaded = YOLO(name)
                model_path = name
                break
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                logger.warning("Could not load %s: %s", name, exc)
        if loaded is None:
            raise RuntimeError(f"Unable to load a YOLO segmentation model: {last_error}")
        self.model = loaded
        self.device = _pick_device()
        self.imgsz = settings.analysis_imgsz
        self.model_name = str(model_path)
        dummy = np.zeros((self.imgsz, self.imgsz, 3), dtype=np.uint8)
        try:
            self.model.predict(dummy, verbose=False, device=self.device, imgsz=self.imgsz)
        except Exception:
            self.device = "cpu"
            self.model.predict(dummy, verbose=False, device=self.device, imgsz=self.imgsz)
        logger.info("Analyzer ready on %s", self.device)

    def analyze(self, frame_bgr: np.ndarray, session: SessionState, profile: dict | None = None) -> dict:
        t0 = time.perf_counter()
        h, w = frame_bgr.shape[:2]
        now = time.monotonic()

        results = self.model.predict(
            frame_bgr,
            verbose=False,
            device=self.device,
            imgsz=self.imgsz,
            conf=0.25,
            iou=0.5,
            classes=[COCO_DOG],
        )
        result = results[0]

        best = None
        if result.boxes is not None and len(result.boxes):
            confs = result.boxes.conf.cpu().numpy()
            idx = int(np.argmax(confs))
            best = idx

        if best is None:
            payload = self._empty(session, now, t0, "no_dog")
            payload["message"] = "Move a dog into the camera view."
            return payload

        box = result.boxes.xyxyn[best].cpu().numpy().tolist()
        conf = float(result.boxes.conf[best].cpu().numpy())
        xyxy = result.boxes.xyxy[best].cpu().numpy()

        mask = None
        if result.masks is not None and len(result.masks) > best:
            m = result.masks.data[best].cpu().numpy()
            mask = cv2.resize(m, (w, h), interpolation=cv2.INTER_NEAREST)
            mask = (mask > 0.5).astype(np.uint8)

        pose_quality = 0.0
        keypoints = empty_keypoints()
        if mask is not None and int(mask.sum()) > 80:
            keypoints, session.head_sign, pose_quality = estimate_keypoints(
                mask, xyxy, w, h, session.head_sign
            )
            keypoints = smooth_keypoints(session.prev_keypoints, keypoints, alpha=0.42)
            session.prev_keypoints = keypoints

        cx = (box[0] + box[2]) / 2
        cy = (box[1] + box[3]) / 2
        speed = 0.0
        if session.last_centroid is not None and session.last_ts:
            dt = max(now - session.last_ts, 1e-3)
            dx = cx - session.last_centroid[0]
            dy = cy - session.last_centroid[1]
            speed = float(np.hypot(dx, dy) / dt)
        session.last_centroid = (cx, cy)
        session.last_ts = now
        session.speeds.append(speed)
        session.speeds = session.speeds[-12:]
        smooth_speed = float(np.median(session.speeds))

        border = 0.02
        truncated = box[0] < border or box[1] < border or box[2] > 1 - border or box[3] > 1 - border

        pet_name = (profile or {}).get("name") or "Mochi"
        interp = interpret(keypoints, box, pose_quality, smooth_speed, truncated, pet_name=pet_name)

        visible_kps = sum(1 for k in keypoints if k["visible"] and k["confidence"] >= 0.3)
        if visible_kps >= 8 and pose_quality >= 0.38:
            state = "pose"
        else:
            state = "detected"

        action_label = interp["action"]["label"]
        mood_label = interp["mood"]["label"]
        if action_label != INSUFFICIENT:
            state = "behaviour"
        elif visible_kps < 6:
            state = "insufficient" if conf < 0.55 else "detected"

        stable_action = _stick(session, "action", action_label)
        stable_mood = _stick(session, "mood", mood_label)
        interp["action"]["label"] = stable_action
        interp["mood"]["label"] = stable_mood

        flags = ["DOG DETECTED"]
        if state in ("pose", "behaviour"):
            flags.append("POSE DETECTED")
        if state == "behaviour":
            flags.append("BEHAVIOUR ANALYSIS")
        else:
            flags.append("ANALYZING...")

        self._timeline(session, conf, stable_action, stable_mood)

        latency_ms = (time.perf_counter() - t0) * 1000
        return {
            "t": round(session.elapsed(), 3),
            "state": state,
            "message": _state_message(state),
            "detection": {
                "present": True,
                "label": "DOG",
                "confidence": round(conf, 4),
                "bbox": [round(v, 4) for v in box],
            },
            "keypoints": keypoints,
            "skeleton": SKELETON_INDEX,
            "pose": interp["pose"],
            "action": interp["action"],
            "mood": interp["mood"],
            "cues": interp["cues"],
            "why": interp["why"],
            "observeNext": interp["observeNext"],
            "statusFlags": flags,
            "timeline": session.timeline[-16:],
            "model": self.model_name,
            "device": self.device,
            "latencyMs": round(latency_ms, 1),
            "poseQuality": round(pose_quality, 3),
        }

    def _empty(self, session: SessionState, now: float, t0: float, state: str) -> dict:
        session.last_ts = now
        session.prev_keypoints = None
        return {
            "t": round(session.elapsed(), 3),
            "state": state,
            "message": "No dog detected",
            "detection": {"present": False, "label": "DOG", "confidence": 0.0, "bbox": None},
            "keypoints": empty_keypoints(),
            "skeleton": SKELETON_INDEX,
            "pose": {
                "head": INSUFFICIENT,
                "ears": INSUFFICIENT,
                "body": INSUFFICIENT,
                "tail": INSUFFICIENT,
                "movement": "Low",
            },
            "action": {"label": INSUFFICIENT, "confidence": 0.0, "icon": "◌"},
            "mood": {"label": INSUFFICIENT, "confidence": 0.0, "icon": "◌"},
            "cues": [],
            "why": "No dog is currently in view, so no posture cues can be observed.",
            "observeNext": "Move a dog into the camera view.",
            "statusFlags": ["SCANNING"],
            "timeline": session.timeline[-16:],
            "model": self.model_name,
            "device": self.device,
            "latencyMs": round((time.perf_counter() - t0) * 1000, 1),
            "poseQuality": 0.0,
        }

    def _timeline(self, session: SessionState, conf: float, action: str, mood: str) -> None:
        elapsed = session.elapsed()

        def push(kind: str, label: str, icon: str) -> None:
            if session.timeline and session.timeline[-1]["label"] == label:
                return
            session.timeline.append(
                {
                    "t": round(elapsed, 2),
                    "kind": kind,
                    "label": label,
                    "icon": icon,
                }
            )

        if not session.dog_announced:
            session.dog_announced = True
            push("detection", "Dog detected", "🐕")
        if action != INSUFFICIENT:
            icon = {
                "Attentive": "👀",
                "Walking / moving": "🐾",
                "Play bow / playful posture": "🎾",
                "Lying down": "😌",
                "Sitting": "🐕",
                "Standing": "🐕",
                "Head turned": "👀",
            }.get(action, "•")
            push("action", action, icon)
        if mood not in (INSUFFICIENT, None) and mood != action:
            icon = {
                "Curious / Alert": "👀",
                "Playful": "🎾",
                "Relaxed": "😌",
                "Possible Stress / Fear": "😟",
                "Possible Defensive Behaviour": "🛡️",
            }.get(mood, "•")
            push("mood", mood, icon)


def _stick(session: SessionState, key: str, label: str) -> str:
    pending = f"pending_{key}"
    count = f"pending_{key}_count"
    stable = f"stable_{key}"
    if getattr(session, pending) == label:
        setattr(session, count, getattr(session, count) + 1)
    else:
        setattr(session, pending, label)
        setattr(session, count, 1)
    if getattr(session, count) >= 3 or getattr(session, stable) in (None, INSUFFICIENT):
        setattr(session, stable, label)
    return getattr(session, stable) or label


def _state_message(state: str) -> str:
    return {
        "no_dog": "No dog detected",
        "detected": "Dog detected",
        "pose": "Pose tracking active",
        "behaviour": "Possible behaviour inferred from posture",
        "insufficient": "Insufficient visual evidence",
        "idle": "Waiting for video",
    }.get(state, state)
