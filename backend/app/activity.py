"""Temporal activity engine: posture ≠ activity.

Samples ~every 0.5s. Global (bbox) vs local (keypoint) movement, rolling window,
hysteresis state machine. Lying + head motion must not become 休息.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from .config import get_settings
from .i18n import ANALYSING, INSUFFICIENT, NOT_VISIBLE, pose_label
from .keypoints import NAME_TO_INDEX

WEAK = {INSUFFICIENT, ANALYSING, NOT_VISIBLE, None, ""}

HEAD_NAMES = (
    "nose",
    "chin",
    "throat",
    "left_ear_tip",
    "right_ear_tip",
    "left_ear_base",
    "right_ear_base",
    "left_eye",
    "right_eye",
)
FRONT_NAMES = (
    "withers",
    "front_left_paw",
    "front_right_paw",
    "front_left_knee",
    "front_right_knee",
    "front_left_elbow",
    "front_right_elbow",
)
REAR_NAMES = (
    "tail_start",
    "rear_left_paw",
    "rear_right_paw",
    "rear_left_knee",
    "rear_right_knee",
    "rear_left_elbow",
    "rear_right_elbow",
    "tail_end",
)


def zone_for_bbox(bbox: list[float] | None, zones: list[dict] | None) -> dict | None:
    if not bbox or not zones:
        return None
    cx = (bbox[0] + bbox[2]) / 2
    cy = (bbox[1] + bbox[3]) / 2
    for zone in zones:
        rect = zone.get("rect") or []
        if len(rect) != 4:
            continue
        x1, y1, x2, y2 = rect
        if x1 <= cx <= x2 and y1 <= cy <= y2:
            return zone
    return None


def _kp_xy(keypoints: list[dict], name: str, min_conf: float) -> tuple[float, float] | None:
    i = NAME_TO_INDEX.get(name)
    if i is None or i >= len(keypoints):
        return None
    k = keypoints[i]
    if not k.get("visible"):
        return None
    if float(k.get("confidence") or 0) < min_conf:
        return None
    return float(k["x"]), float(k["y"])


def _bbox_geom(bbox: list[float]) -> tuple[float, float, float]:
    x1, y1, x2, y2 = bbox
    cx = (x1 + x2) / 2
    cy = (y1 + y2) / 2
    diag = float(np.hypot(x2 - x1, y2 - y1)) or 1e-6
    return cx, cy, diag


def _group_disp(
    prev: list[dict] | None,
    curr: list[dict],
    names: tuple[str, ...],
    diag: float,
    min_conf: float,
) -> float:
    if not prev:
        return 0.0
    ds: list[float] = []
    for name in names:
        a = _kp_xy(prev, name, min_conf)
        b = _kp_xy(curr, name, min_conf)
        if a is None or b is None:
            continue
        ds.append(float(np.hypot(b[0] - a[0], b[1] - a[1])) / diag)
    if len(ds) < 2:
        return float(ds[0]) if ds else 0.0
    return float(np.median(ds))


def _orient(keypoints: list[dict], min_conf: float) -> float | None:
    w = _kp_xy(keypoints, "withers", min_conf)
    t = _kp_xy(keypoints, "tail_start", min_conf)
    if w is None or t is None:
        return None
    return float(np.arctan2(w[1] - t[1], w[0] - t[0]))


def _norm(value: float, typical_high: float) -> float:
    if typical_high <= 1e-9:
        return 0.0
    return float(np.clip(value / typical_high, 0.0, 1.0))


PLAY_OBJECT_IDS = {"sports_ball"}
FOOD_OBJECT_IDS = {"bowl", "cup", "bottle"}


def objects_near_bbox(bbox: list[float] | None, objects: list[dict], max_dist: float = 0.32) -> list[dict]:
    if not bbox or not objects:
        return []
    cx, cy, _ = _bbox_geom(bbox)
    near: list[dict] = []
    for obj in objects:
        box = obj.get("bbox") or []
        if len(box) < 4:
            continue
        ox = (float(box[0]) + float(box[2])) / 2
        oy = (float(box[1]) + float(box[3])) / 2
        if float(np.hypot(cx - ox, cy - oy)) <= max_dist:
            near.append(obj)
    return near


def _band(score: float, low: float, mid: float) -> str:
    if score < low:
        return "low"
    if score < mid:
        return "medium"
    return "high"



@dataclass
class MovementSample:
    t: float
    global_move: float
    head: float
    front: float
    rear: float
    orient: float
    score: float
    center: tuple[float, float]
    shape: float = 0.0
    kp_count: int = 0


@dataclass
class ActivityEngine:
    """Call observe() every analysed frame. Internally samples ~0.5s."""

    samples: deque[MovementSample] = field(default_factory=lambda: deque(maxlen=12))
    last_sample_at: float = 0.0
    prev_bbox: list[float] | None = None
    prev_kps: list[dict] | None = None
    prev_center: tuple[float, float] | None = None
    prev_area: float = 0.0
    state: str = ANALYSING
    state_since: float = 0.0
    candidate: str = ANALYSING
    candidate_since: float = 0.0
    last_result: dict[str, Any] | None = None
    last_breakdown: dict[str, Any] = field(default_factory=dict)
    last_present_at: float = 0.0
    recent_objects: list[tuple[float, list[dict]]] = field(default_factory=list)

    def reset(self) -> None:
        self.samples.clear()
        self.last_sample_at = 0.0
        self.prev_bbox = None
        self.prev_kps = None
        self.prev_center = None
        self.prev_area = 0.0
        self.state = ANALYSING
        self.state_since = 0.0
        self.candidate = ANALYSING
        self.candidate_since = 0.0
        self.last_result = None
        self.last_breakdown = {}
        self.last_present_at = 0.0
        self.recent_objects = []

    def observe(
        self,
        *,
        now: float,
        present: bool,
        bbox: list[float] | None,
        keypoints: list[dict],
        posture: str,
        action: str,
        objects: list[dict],
        zone: dict | None,
    ) -> dict[str, Any]:
        settings = get_settings()
        if not present or not bbox:
            if self.last_present_at and (now - self.last_present_at) < 2.2 and self.last_result:
                frozen = dict(self.last_result)
                ev = list(self.last_result.get("evidence") or [])
                if not any("偵測短暫中斷" in str(x) for x in ev):
                    ev.append("△ 偵測短暫中斷，沿用上一狀態")
                frozen["evidence"] = ev
                return frozen
            self.reset()
            payload = activity_payload(INSUFFICIENT, 0.0, ["未偵測到狗狗"])
            payload["movement"] = self._debug(now, INSUFFICIENT, posture, 0)
            return payload

        want = int(settings.activity_window_samples)
        if self.samples.maxlen != want:
            self.samples = deque(self.samples, maxlen=want)

        interval = settings.activity_sample_interval
        due = self.last_sample_at == 0.0 or (now - self.last_sample_at) >= interval
        if due:
            self._sample(now, bbox, keypoints, objects, settings)
            merged = self._recent_object_list(now)
            self._step_state(now, posture, action, merged, zone, bbox, settings)
        else:
            self._remember_objects(now, objects)
            if self.last_result and self.last_result.get("movement"):
                self.last_result["movement"]["stateDuration"] = (
                    round(max(0.0, now - self.state_since), 2) if self.state_since else 0.0
                )

        if self.last_result is None:
            payload = activity_payload(ANALYSING, 0.15, ["正在累積活動資料"])
            payload["movement"] = self._debug(now, ANALYSING, posture, 0)
            return payload
        return self.last_result

    def _remember_objects(self, now: float, objects: list[dict]) -> None:
        if objects:
            self.recent_objects.append((now, list(objects)))
        self.recent_objects = [(t, rows) for t, rows in self.recent_objects if now - t <= 2.5]

    def _recent_object_list(self, now: float) -> list[dict]:
        merged: list[dict] = []
        seen: set[str] = set()
        for t, rows in self.recent_objects:
            if now - t > 2.5:
                continue
            for obj in rows:
                key = str(obj.get("id"))
                if key in seen:
                    continue
                seen.add(key)
                merged.append(obj)
        return merged

    def _sample(self, now: float, bbox: list[float], keypoints: list[dict], objects: list[dict], settings) -> None:
        min_conf = settings.activity_keypoint_conf
        cx, cy, diag = _bbox_geom(bbox)
        area = max(1e-6, abs(bbox[2] - bbox[0]) * abs(bbox[3] - bbox[1]))
        prev_center = _bbox_geom(self.prev_bbox)[:2] if self.prev_bbox is not None else None
        raw_global = 0.0
        if prev_center is not None:
            raw_global = float(np.hypot(cx - prev_center[0], cy - prev_center[1])) / diag
        raw_head = _group_disp(self.prev_kps, keypoints, HEAD_NAMES, diag, min_conf)
        raw_front = _group_disp(self.prev_kps, keypoints, FRONT_NAMES, diag, min_conf)
        raw_rear = _group_disp(self.prev_kps, keypoints, REAR_NAMES, diag, min_conf)
        orient = 0.0
        if self.prev_kps is not None:
            a = _orient(self.prev_kps, min_conf)
            b = _orient(keypoints, min_conf)
            if a is not None and b is not None:
                delta = abs(((b - a + np.pi) % (2 * np.pi)) - np.pi)
                orient = float(min(1.0, delta / (np.pi / 6)))

        shape = 0.0
        if self.prev_area > 0:
            shape = _norm(abs(area - self.prev_area) / self.prev_area, 0.12)

        global_move = _norm(raw_global, settings.movement_global_ref)
        head = _norm(raw_head, settings.movement_head_ref)
        front = _norm(raw_front, settings.movement_limb_ref)
        rear = _norm(raw_rear, settings.movement_limb_ref)
        w_g = settings.movement_weight_global
        w_h = settings.movement_weight_head
        w_f = settings.movement_weight_front
        w_r = settings.movement_weight_rear
        w_o = settings.movement_weight_orient
        raw = w_g * global_move + w_h * head + w_f * front + w_r * rear + w_o * orient + 0.15 * shape
        score = float(np.clip(raw * settings.movement_score_gain, 0.0, 1.0))
        kp_count = sum(
            1 for k in keypoints if k.get("visible") and float(k.get("confidence") or 0) >= min_conf
        )
        self.samples.append(
            MovementSample(now, global_move, head, front, rear, orient, score, (cx, cy), shape, kp_count)
        )
        self.prev_center = prev_center
        self.prev_bbox = list(bbox)
        self.prev_area = area
        self.prev_kps = [dict(k) for k in keypoints]
        self.last_sample_at = now
        self.last_present_at = now
        self._remember_objects(now, objects)
        if self.state_since == 0.0:
            self.state_since = now
            self.candidate_since = now

    def _window_stats(self) -> dict[str, float]:
        if not self.samples:
            return {
                "n": 0, "score": 0.0, "global": 0.0, "head": 0.0, "front": 0.0,
                "rear": 0.0, "orient": 0.0, "shape": 0.0, "kp_count": 0.0, "local": 0.0,
            }
        local_vals = [max(s.head, s.front, s.rear, s.shape) for s in self.samples]
        return {
            "n": float(len(self.samples)),
            "score": float(np.mean([s.score for s in self.samples])),
            "global": float(np.mean([s.global_move for s in self.samples])),
            "head": float(np.mean([s.head for s in self.samples])),
            "front": float(np.mean([s.front for s in self.samples])),
            "rear": float(np.mean([s.rear for s in self.samples])),
            "orient": float(np.mean([s.orient for s in self.samples])),
            "shape": float(np.mean([s.shape for s in self.samples])),
            "kp_count": float(np.mean([s.kp_count for s in self.samples])),
            "local": float(np.mean(local_vals)),
        }

    def _propose(
        self,
        stats: dict[str, float],
        posture: str,
        action: str,
        objects: list[dict],
        zone: dict | None,
        settings,
        bbox: list[float] | None = None,
    ) -> tuple[str, list[str], float]:
        low = settings.movement_low_threshold
        mid = settings.movement_medium_threshold
        score = stats["score"]
        g, h = stats["global"], stats["head"]
        front, rear = stats.get("front", 0.0), stats.get("rear", 0.0)
        shape = stats.get("shape", 0.0)
        local = max(stats.get("local", 0.0), h, front, rear, shape)
        kps_ok = stats.get("kp_count", 0.0) >= 2
        n = int(stats["n"])
        evidence: list[str] = []
        zone_type = (zone or {}).get("type") or ""
        zone_name = (zone or {}).get("name") or ""
        labels = {str(o.get("id")) for o in objects}
        near = objects_near_bbox(bbox, objects) if bbox else [o for o in objects if o.get("id")]
        if not near:
            near = list(objects)
        near_ids = {str(o.get("id")) for o in near}
        intensity = max(score, local, g)

        if n < 3:
            return ANALYSING, ["正在累積活動資料"], 0.2

        if posture and posture not in WEAK:
            evidence.append(f"姿勢：{pose_label(posture)}")
        if zone_name:
            evidence.append(f"位置：{zone_name}")
        evidence.append(f"整體移動：{_zh_band(_band(g, low, mid))}")
        evidence.append(f"局部移動：{_zh_band(_band(local, low, mid))}")
        if h >= low:
            evidence.append("頭部有明顯移動")
        if g >= low:
            evidence.append("狗狗位置持續變化")
        if front >= low or rear >= low:
            evidence.append("四肢活動")
        if shape >= low:
            evidence.append("身體輪廓／框大小持續變化")
        if not kps_ok:
            evidence.append("△ 姿勢關鍵點不足，局部動作以框變化估算")

        if action == "play_bow" or (zone_type == "play" and intensity >= low):
            evidence.append("玩耍鞠躬" if action == "play_bow" else "在玩耍區活動")
            return "playing", evidence, min(0.82, 0.5 + intensity)
        if near_ids & PLAY_OBJECT_IDS and (local >= low or g >= low or intensity >= mid):
            evidence.append("與球／玩具位置接近")
            return "playing", evidence, min(0.84, 0.48 + intensity)
        if zone_type == "food" and h >= low and g < mid:
            evidence.extend(["頭部重複移動", "處於飲食區"])
            return "eating", evidence, min(0.76, 0.45 + h)
        if near_ids & FOOD_OBJECT_IDS and ((h >= low) or (g < mid and local >= low)):
            evidence.extend(["頭部或局部重複移動", "與碗或容器位置接近"])
            return "eating", evidence, min(0.74, 0.45 + max(h, local))
        if zone_type == "water" and h >= low and g < mid:
            evidence.append("處於飲水區")
            return "drinking", evidence, min(0.7, 0.42 + h)
        if zone_type == "door" and g < mid and local < mid:
            evidence.append("處於門口區且整體位移不高")
            return "door_waiting", evidence, 0.62

        # Position change is walking/exploring — never inferred from standing posture alone.
        if g >= mid:
            evidence.append("身體位置在連續畫面中有明顯位移")
            if not (near_ids & PLAY_OBJECT_IDS):
                evidence.append("△ 未能確認是否與玩具互動")
            return "exploring", evidence, min(0.86, 0.5 + g)
        if local >= low or g >= low or intensity >= mid:
            evidence.append("局部活動偏高（即使位置未大幅改變）")
            if not (near_ids & PLAY_OBJECT_IDS):
                evidence.append("△ 未能確認物件")
                evidence.append("可能與玩具互動")
            if h >= low and g < low and not (near_ids & FOOD_OBJECT_IDS):
                evidence.append("△ 未能直接確認進食動作")
            return "active", evidence, min(0.8, 0.48 + intensity)
        if posture == "standing" and g < low and local < low:
            evidence.append("站立而整體與局部移動均偏低")
            return "waiting", evidence, 0.58
        if g < low and local < low:
            evidence.append("整體與局部移動均偏低")
            return "resting", evidence, min(0.8, 0.5 + (low - intensity))
        return ANALYSING, evidence, 0.3

    def _step_state(
        self,
        now: float,
        posture: str,
        action: str,
        objects: list[dict],
        zone: dict | None,
        bbox: list[float] | None,
        settings,
    ) -> None:
        stats = self._window_stats()
        proposed, evidence, conf = self._propose(stats, posture, action, objects, zone, settings, bbox)
        if self.candidate != proposed:
            self.candidate = proposed
            self.candidate_since = now
        held = now - self.candidate_since
        enter = settings.active_enter_seconds if proposed not in ("resting", "waiting") else settings.resting_enter_seconds
        if proposed in (ANALYSING, INSUFFICIENT):
            enter = 0.6
        if self.state == "resting" and proposed not in ("resting", "waiting", ANALYSING):
            enter = min(enter, settings.resting_leave_seconds)
        if self.state == ANALYSING:
            enter = min(enter, 1.0)

        if proposed != self.state and held >= enter:
            self.state = proposed
            self.state_since = now
        elif proposed == self.state:
            self.state = proposed

        duration = now - self.state_since if self.state_since else 0.0
        evidence = [
            line
            for line in evidence
            if not line.startswith("動作持續超過") and not line.startswith("活動持續")
        ]
        if self.state not in (ANALYSING, INSUFFICIENT) and duration >= 3:
            evidence = [f"活動持續 {duration:.1f} 秒", *evidence]
        conf = float(np.clip(conf, 0.0, 0.82))
        if stats["n"] < 3:
            conf = min(conf, 0.28)
        result = activity_payload(self.state, conf, evidence[:8])
        result["movement"] = self._debug(now, proposed, posture, stats["n"])
        self.last_result = result
        self.last_breakdown = result["movement"]

    def _debug(self, now: float, candidate: str, posture: str, n: float) -> dict[str, Any]:
        last = self.samples[-1] if self.samples else None
        stats = self._window_stats()
        settings = get_settings()
        score = max(stats["score"], stats.get("local", 0.0), stats["global"])
        center = last.center if last else (0.0, 0.0)
        prev = self.prev_center
        change = 0.0
        if prev and last:
            change = float(np.hypot(center[0] - prev[0], center[1] - prev[1]))
        return {
            "posture": pose_label(posture) if posture else "資料不足",
            "postureId": posture or INSUFFICIENT,
            "score": round(score, 3),
            "band": _band(score, settings.movement_low_threshold, settings.movement_medium_threshold),
            "global": round(stats["global"], 3),
            "globalBand": _band(stats["global"], settings.movement_low_threshold, settings.movement_medium_threshold),
            "head": round(stats["head"], 3),
            "headBand": _band(stats["head"], settings.movement_low_threshold, settings.movement_medium_threshold),
            "front": round(stats["front"], 3),
            "frontBand": _band(stats["front"], settings.movement_low_threshold, settings.movement_medium_threshold),
            "rear": round(stats["rear"], 3),
            "rearBand": _band(stats["rear"], settings.movement_low_threshold, settings.movement_medium_threshold),
            "bodyBand": _band(
                (stats["front"] + stats["rear"]) / 2,
                settings.movement_low_threshold,
                settings.movement_medium_threshold,
            ),
            "orientation": round(stats["orient"], 3),
            "center": [round(center[0], 3), round(center[1], 3)],
            "prevCenter": [round(prev[0], 3), round(prev[1], 3)] if prev else None,
            "positionChange": round(change, 3),
            "candidate": candidate,
            "confirmed": self.state,
            "stateDuration": round(max(0.0, now - self.state_since), 2) if self.state_since else 0.0,
            "samples": int(n),
        }


def _zh_band(band: str) -> str:
    return {"low": "低", "medium": "中", "high": "高"}.get(band, band)


def classify_activity(
    *,
    present: bool,
    action: str,
    pose: dict[str, str],
    objects: list[dict],
    zone: dict | None,
    movement_score: float | None = None,
    head_move: float | None = None,
    global_move: float | None = None,
    bbox: list[float] | None = None,
) -> tuple[str, list[str], float]:
    """Stateless helper for unit tests. Live path uses ActivityEngine."""
    if not present:
        return INSUFFICIENT, ["未偵測到狗狗"], 0.0
    settings = get_settings()
    mid = settings.movement_medium_threshold
    score = movement_score
    if score is None:
        # Legacy callers pass pose.movement bands — interpret without assuming rest from lying.
        band = pose.get("movement", INSUFFICIENT)
        score = {"low": 0.06, "medium": 0.24, "high": 0.5}.get(band, 0.0)
    head = head_move if head_move is not None else (0.4 if score >= mid else score * 0.5)
    glob = global_move if global_move is not None else (
        score if action == "walking" or pose.get("body") == "standing" else score * 0.4
    )
    engine = ActivityEngine()
    stats = {
        "n": 6,
        "score": score,
        "global": glob,
        "head": head,
        "front": score * 0.5,
        "rear": score * 0.4,
        "orient": 0.0,
        "shape": 0.0,
        "kp_count": 6.0,
        "local": max(head, score * 0.5, score * 0.4),
    }
    return engine._propose(stats, pose.get("body") or action, action, objects, zone, settings, bbox)


def activity_payload(code: str, confidence: float, evidence: list[str] | None = None) -> dict[str, Any]:
    from .i18n import activity_pack as pack

    out = pack(code, confidence)
    out["evidence"] = evidence or []
    return out
