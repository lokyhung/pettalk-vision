"""YOLO dog detection + instance mask, then anatomical keypoints and behaviour rules."""

from __future__ import annotations

import logging
import os
import time
from pathlib import Path

import cv2
import numpy as np

from .behaviour import build_why, infer_mood, infer_possible_behaviour, interpret_observable
from .config import get_settings
from .i18n import (
    ANALYSING,
    INSUFFICIENT,
    NOT_VISIBLE,
    ACTION_ICONS,
    ACTION_LABELS,
    STATE_MESSAGES,
    action_pack,
    behaviour_pack,
    mood_pack,
    pose_label,
    pose_pack,
)
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
        t_start = time.perf_counter()
        settings = get_settings()
        threshold = settings.dog_detection_threshold
        h, w = frame_bgr.shape[:2]
        now = time.monotonic()

        results = self.model.predict(
            frame_bgr,
            verbose=False,
            device=self.device,
            imgsz=self.imgsz,
            conf=threshold,
            iou=0.5,
            classes=[COCO_DOG],
        )
        result = results[0]

        dogs: list[tuple[int, float]] = []
        if result.boxes is not None and len(result.boxes):
            confs = result.boxes.conf.cpu().numpy()
            for i, c in enumerate(confs):
                if float(c) >= threshold:
                    dogs.append((i, float(c)))

        if not dogs:
            return self._empty(session, now, t_start)

        session.missed = 0

        dogs.sort(key=lambda row: row[1], reverse=True)
        best, conf = dogs[0]
        box = result.boxes.xyxyn[best].cpu().numpy().tolist()
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
            keypoints = smooth_keypoints(session.prev_keypoints, keypoints, alpha=0.38)
            session.prev_keypoints = keypoints

        cx = (box[0] + box[2]) / 2
        cy = (box[1] + box[3]) / 2
        session.last_centroid = (cx, cy)
        session.last_ts = now
        session.frame_times.append(now)
        session.frame_times = session.frame_times[-24:]
        session.centroid_trace.append((now, cx, cy))
        session.centroid_trace = [row for row in session.centroid_trace if now - row[0] <= 1.2]
        speed = 0.0
        if len(session.centroid_trace) >= 2:
            t0, x0, y0 = session.centroid_trace[0]
            dt = max(now - t0, 1e-3)
            disp = float(np.hypot(cx - x0, cy - y0))
            speed = 0.0 if disp < 0.035 else disp / dt
        session.speeds.append(speed)
        session.speeds = session.speeds[-16:]
        bbox_speed = float(np.median(session.speeds))
        kp_disp = _keypoint_displacement(session, keypoints, settings.keypoint_conf_threshold)
        session.keypoint_speeds.append(kp_disp)
        session.keypoint_speeds = session.keypoint_speeds[-16:]
        kp_speed = float(np.median(session.keypoint_speeds)) * 8.0
        smooth_speed = max(bbox_speed, kp_speed)

        border = 0.03
        truncated = box[0] < border or box[1] < border or box[2] > 1 - border or box[3] > 1 - border

        raw = interpret_observable(keypoints, box, pose_quality, smooth_speed, truncated)
        behaviour_hint, _ = infer_possible_behaviour(raw["pose"], raw["action"])
        mood_hint, _ = infer_mood(raw["pose"], raw["action"], behaviour_hint)
        session.smoother.push({**raw, "mood_hint": mood_hint, "behaviour_hint": behaviour_hint})

        pose_ids = {
            "head": session.smoother.pose_field("head")[0],
            "ears": session.smoother.pose_field("ears")[0],
            "body": session.smoother.pose_field("body")[0],
            "tail": session.smoother.pose_field("tail")[0],
            "movement": session.smoother.pose_field("movement")[0],
        }
        action_id, action_ratio = session.smoother.action()
        behaviour_id, behaviour_cues = infer_possible_behaviour(pose_ids, action_id)
        mood_hint, mood_cues = infer_mood(pose_ids, action_id, behaviour_id)
        mood_id, mood_conf = session.smoother.lock_mood(mood_hint)
        if mood_id not in (INSUFFICIENT, ANALYSING):
            mood_conf = min(0.78, max(float(mood_conf), 0.42))
        else:
            mood_conf = 0.0

        visible_kps = sum(
            1 for k in keypoints if k["visible"] and k["confidence"] >= settings.keypoint_conf_threshold
        )
        if truncated and visible_kps < 8:
            state = "insufficient"
            message_key = "insufficient"
        elif action_id == ANALYSING or len(session.smoother) < 5:
            state = "analysing" if conf >= threshold else "detected"
            message_key = "analysing"
        elif action_id == INSUFFICIENT:
            state = "insufficient"
            message_key = "insufficient"
        elif visible_kps >= 8 and pose_quality >= settings.pose_quality_threshold:
            state = "behaviour" if action_id not in (ANALYSING, INSUFFICIENT) else "pose"
            message_key = "behaviour" if state == "behaviour" else "pose"
        else:
            state = "detected"
            message_key = "detected"

        if action_id in (ANALYSING, INSUFFICIENT):
            mood_id = INSUFFICIENT
            mood_conf = 0.0
            behaviour_id = INSUFFICIENT

        pet_name = (profile or {}).get("name") or "Mochi"
        why, observe = build_why(
            pet_name, pose_ids, action_id, mood_id, mood_cues or behaviour_cues or raw["cues"], profile
        )

        explained = (action_id, mood_id, behaviour_id)
        if session.last_explained != explained and action_id not in (ANALYSING, INSUFFICIENT):
            session.explanation_revision += 1
            session.last_explained = explained

        self._timeline(session, action_id, settings.timeline_min_seconds)
        fps = _fps(session)
        debug = session.smoother.debug_counts()

        title, body = STATE_MESSAGES.get(message_key, STATE_MESSAGES["idle"])
        latency_ms = (time.perf_counter() - t_start) * 1000
        return {
            "t": round(session.elapsed(), 3),
            "state": state if state != "analysing" else "pose",
            "message": title,
            "detail": body,
            "liveStatus": _live_status(state, True),
            "detection": {
                "present": True,
                "label": "狗狗",
                "confidence": round(conf, 4),
                "bbox": [round(v, 4) for v in box],
                "count": len(dogs),
            },
            "keypoints": keypoints,
            "skeleton": SKELETON_INDEX,
            "pose": pose_pack(pose_ids),
            "action": action_pack(action_id, action_ratio if action_id not in (ANALYSING, INSUFFICIENT) else 0.0),
            "behaviour": behaviour_pack(
                behaviour_id if action_id not in (ANALYSING, INSUFFICIENT) else INSUFFICIENT,
                0.55 if behaviour_id not in (ANALYSING, INSUFFICIENT) else 0.0,
            ),
            "mood": mood_pack(mood_id, mood_conf),
            "evidence": _build_evidence(True, pose_ids, visible_kps),
            "cues": raw["cues"],
            "why": why,
            "observeNext": observe,
            "disclaimer": "以上為 AI 根據可觀察行為作出的推測，並非寵物情緒或健康狀況的診斷。",
            "statusFlags": _flags(state),
            "timeline": session.timeline[-16:],
            "model": self.model_name,
            "device": self.device,
            "latencyMs": round(latency_ms, 1),
            "poseQuality": round(pose_quality, 3),
            "explanationRevision": session.explanation_revision,
            "thresholds": {
                "dog": threshold,
                "keypoint": settings.keypoint_conf_threshold,
            },
            "debug": {
                "model": self.model_name,
                "device": self.device,
                "fps": round(fps, 1),
                "inferenceMs": round(latency_ms, 1),
                "dogConfidence": round(conf, 4),
                "poseConfidence": round(pose_quality, 3),
                "dogCount": len(dogs),
                "visibleKeypoints": visible_kps,
                "currentBehaviour": action_id,
                "possibleBehaviour": behaviour_id,
                "possibleMood": mood_id,
                "behaviourStability": round(float(action_ratio), 3),
                "stableFrames": int(debug["stableFrames"]),
                "framesUsed": int(debug["framesUsed"]),
                "window": int(debug["window"]),
            },
        }

    def _empty(self, session: SessionState, now: float, t_start: float) -> dict:
        session.last_ts = now
        session.missed += 1
        session.frame_times.append(now)
        session.frame_times = session.frame_times[-24:]
        if session.missed >= 3:
            from .smoothing import TemporalSmoother

            session.smoother = TemporalSmoother()
            session.prev_keypoints = None
            session.prev_move_pts = None
            session.speeds = []
            session.keypoint_speeds = []
            session.centroid_trace = []
        pose_ids = {
            "head": INSUFFICIENT,
            "ears": INSUFFICIENT,
            "body": INSUFFICIENT,
            "tail": INSUFFICIENT,
            "movement": INSUFFICIENT,
        }
        title, body = STATE_MESSAGES["no_dog"]
        settings = get_settings()
        latency_ms = (time.perf_counter() - t_start) * 1000
        return {
            "t": round(session.elapsed(), 3),
            "state": "no_dog",
            "message": title,
            "detail": body,
            "liveStatus": "waiting",
            "detection": {"present": False, "label": "狗狗", "confidence": 0.0, "bbox": None, "count": 0},
            "keypoints": empty_keypoints(),
            "skeleton": SKELETON_INDEX,
            "pose": pose_pack(pose_ids),
            "action": action_pack(INSUFFICIENT, 0.0),
            "behaviour": behaviour_pack(INSUFFICIENT, 0.0),
            "mood": mood_pack(INSUFFICIENT, 0.0),
            "evidence": _build_evidence(False, pose_ids, 0),
            "cues": [],
            "why": "畫面中未偵測到狗狗，因此沒有可觀察的姿勢線索。",
            "observeNext": "請將狗狗移入鏡頭範圍。",
            "disclaimer": "以上為 AI 根據可觀察行為作出的推測，並非寵物情緒或健康狀況的診斷。",
            "statusFlags": ["等待偵測"],
            "timeline": session.timeline[-16:],
            "model": self.model_name,
            "device": self.device,
            "latencyMs": round(latency_ms, 1),
            "poseQuality": 0.0,
            "explanationRevision": session.explanation_revision,
            "thresholds": {
                "dog": settings.dog_detection_threshold,
                "keypoint": settings.keypoint_conf_threshold,
            },
            "debug": {
                "model": self.model_name,
                "device": self.device,
                "fps": round(_fps(session), 1),
                "inferenceMs": round(latency_ms, 1),
                "dogConfidence": 0.0,
                "poseConfidence": 0.0,
                "dogCount": 0,
                "visibleKeypoints": 0,
                "currentBehaviour": INSUFFICIENT,
                "possibleBehaviour": INSUFFICIENT,
                "possibleMood": INSUFFICIENT,
                "behaviourStability": 0.0,
                "stableFrames": 0,
                "framesUsed": 0,
                "window": settings.temporal_window,
            },
        }

    def _timeline(self, session: SessionState, action: str, min_seconds: float) -> None:
        """Record only stable action *changes*. Never cycle mood vs pose."""
        elapsed = session.elapsed()
        if not session.dog_announced:
            session.dog_announced = True
            session.last_timeline_at = elapsed
            session.timeline.append(
                {
                    "t": round(elapsed, 2),
                    "kind": "detection",
                    "id": "dog",
                    "label": "偵測到狗狗",
                    "icon": "🐕",
                }
            )
        if action in (INSUFFICIENT, ANALYSING):
            return
        if session.last_timeline_action == action:
            return
        if session.last_timeline_action and (elapsed - session.last_timeline_at) < min_seconds:
            return
        session.last_timeline_action = action
        session.last_timeline_at = elapsed
        session.timeline.append(
            {
                "t": round(elapsed, 2),
                "kind": "action",
                "id": action,
                "label": ACTION_LABELS.get(action, action),
                "icon": ACTION_ICONS.get(action, "•"),
            }
        )


def _keypoint_displacement(session: SessionState, keypoints: list[dict], min_conf: float) -> float:
    curr = {
        k["name"]: (float(k["x"]), float(k["y"]))
        for k in keypoints
        if k.get("visible") and float(k.get("confidence") or 0) >= min_conf
    }
    prev = session.prev_move_pts
    session.prev_move_pts = curr
    if not prev or not curr:
        return 0.0
    ds = []
    for name, (x, y) in curr.items():
        if name in prev:
            px, py = prev[name]
            ds.append(float(np.hypot(x - px, y - py)))
    if len(ds) < 3:
        return 0.0
    return float(np.median(ds))


def _fps(session: SessionState) -> float:
    times = session.frame_times
    if len(times) < 2:
        return 0.0
    span = times[-1] - times[0]
    if span <= 1e-3:
        return 0.0
    return (len(times) - 1) / span


def _build_evidence(present: bool, pose_ids: dict[str, str], visible_kps: int) -> list[dict]:
    items: list[dict] = []
    if present:
        items.append({"ok": True, "text": "狗狗"})
    else:
        items.append({"ok": False, "text": "未偵測到狗狗"})
        return items

    body = pose_ids.get("body", INSUFFICIENT)
    if body not in (INSUFFICIENT, ANALYSING, NOT_VISIBLE):
        items.append({"ok": True, "text": f"{pose_label(body)}姿勢"})
    else:
        items.append({"ok": False, "text": "身體姿勢資料不足"})

    head = pose_ids.get("head", NOT_VISIBLE)
    if head not in (INSUFFICIENT, ANALYSING, NOT_VISIBLE):
        items.append({"ok": True, "text": f"頭部{pose_label(head)}"})
    else:
        items.append({"ok": False, "text": "頭部方向不可見"})

    movement = pose_ids.get("movement", INSUFFICIENT)
    if movement not in (INSUFFICIENT, ANALYSING, NOT_VISIBLE):
        items.append({"ok": True, "text": f"身體移動幅度{pose_label(movement)}"})
    else:
        items.append({"ok": False, "text": "活動程度資料不足"})

    ears = pose_ids.get("ears", NOT_VISIBLE)
    if ears not in (INSUFFICIENT, ANALYSING, NOT_VISIBLE):
        items.append({"ok": True, "text": f"耳朵位置可見（{pose_label(ears)}）"})
    else:
        items.append({"ok": False, "text": "耳朵位置不可見"})

    tail = pose_ids.get("tail", NOT_VISIBLE)
    if tail not in (INSUFFICIENT, ANALYSING, NOT_VISIBLE):
        items.append({"ok": True, "text": f"尾巴{pose_label(tail)}"})
    else:
        items.append({"ok": False, "text": "尾巴：資料不足"})

    if visible_kps < 6:
        items.append({"ok": False, "text": "可見關鍵點不足"})
    return items


def _live_status(state: str, present: bool) -> str:
    if not present or state == "no_dog":
        return "waiting"
    if state in ("analysing", "detected"):
        return "analysing"
    if state in ("pose", "behaviour"):
        return "live"
    return "analysing"


def _flags(state: str) -> list[str]:
    if state == "no_dog":
        return ["等待偵測"]
    flags = ["已偵測狗狗"]
    if state in ("pose", "behaviour"):
        flags.append("姿勢追蹤")
    if state == "behaviour":
        flags.append("行為分析")
    else:
        flags.append("分析中")
    return flags
