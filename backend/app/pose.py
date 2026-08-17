"""Anatomical dog keypoints reconstructed from a YOLO instance mask.

No public pretrained 24-keypoint dog-pose checkpoint is distributed by
Ultralytics (Dog-Pose weights require custom training). This module derives
Stanford Extra / Dog-Pose keypoints from the detected silhouette so the
skeleton still tracks the real dog each frame.
"""

from __future__ import annotations

from typing import Any

import cv2
import numpy as np

from .keypoints import KEYPOINT_NAMES, empty_keypoints


def _clip01(v: float) -> float:
    return float(np.clip(v, 0.0, 1.0))


def _point(name: str, x: float, y: float, conf: float, w: int, h: int) -> dict[str, Any]:
    visible = conf >= 0.28 and 0.0 <= x <= 1.0 and 0.0 <= y <= 1.0
    if x * w < 1 or y * h < 1 or x * w > w - 2 or y * h > h - 2:
        conf *= 0.75
    return {
        "name": name,
        "x": _clip01(x),
        "y": _clip01(y),
        "confidence": round(float(np.clip(conf, 0.0, 1.0)), 3),
        "visible": bool(visible),
    }


def _width_at(centered: np.ndarray, proj: np.ndarray, perp: np.ndarray, t: float, window: float) -> float:
    sel = np.abs(proj - t) < window
    if int(sel.sum()) < 8:
        return 0.0
    p = centered[sel] @ perp
    return float(p.max() - p.min())


def _area_at(proj: np.ndarray, t: float, window: float) -> int:
    sel = np.abs(proj - t) < window
    return int(sel.sum())


def _cluster_lowest(points: np.ndarray, k: int = 2) -> list[np.ndarray]:
    if len(points) < 6:
        return []
    order = np.argsort(points[:, 1])[::-1]
    lowest = points[order[: max(12, len(points) // 8)]]
    xs = lowest[:, 0]
    if xs.max() - xs.min() < 6:
        return [lowest.mean(axis=0)]
    mid = np.median(xs)
    left = lowest[xs <= mid]
    right = lowest[xs > mid]
    clusters = []
    if len(left) >= 3:
        clusters.append(left.mean(axis=0))
    if len(right) >= 3:
        clusters.append(right.mean(axis=0))
    clusters.sort(key=lambda p: p[0])
    return clusters[:k]


def _head_peaks(head_pts: np.ndarray, up: np.ndarray, mean: np.ndarray) -> list[np.ndarray]:
    if len(head_pts) < 10:
        return []
    scores = head_pts @ up
    top_n = max(8, len(head_pts) // 6)
    top = head_pts[np.argsort(scores)[-top_n:]]
    # Split along the axis perpendicular to "up" in the image plane (approx x).
    xs = top[:, 0]
    if xs.max() - xs.min() < 4:
        return [top.mean(axis=0)]
    mid = np.median(xs)
    left = top[xs <= mid]
    right = top[xs > mid]
    peaks = []
    if len(left) >= 3:
        peaks.append(left[np.argmax(left @ up)])
    if len(right) >= 3:
        peaks.append(right[np.argmax(right @ up)])
    return peaks


def estimate_keypoints(
    mask: np.ndarray,
    bbox_xyxy: np.ndarray,
    frame_w: int,
    frame_h: int,
    prev_head_sign: float | None = None,
) -> tuple[list[dict[str, Any]], float | None, float]:
    """Return (keypoints, head_sign, pose_quality). Coordinates are normalized 0-1."""
    ys, xs = np.where(mask > 0)
    if len(xs) < 80:
        return empty_keypoints(), prev_head_sign, 0.0

    points = np.column_stack([xs.astype(np.float32), ys.astype(np.float32)])
    mean = points.mean(axis=0)
    centered = points - mean
    cov = np.cov(centered.T)
    eigvals, eigvecs = np.linalg.eigh(cov)
    axis = eigvecs[:, 1]
    perp = eigvecs[:, 0]
    proj = centered @ axis
    t_min, t_max = float(proj.min()), float(proj.max())
    span = max(t_max - t_min, 1.0)
    window = span * 0.08

    w_head_cand_low = _width_at(centered, proj, perp, t_min + span * 0.08, window)
    w_head_cand_high = _width_at(centered, proj, perp, t_max - span * 0.08, window)
    a_low = _area_at(proj, t_min + span * 0.1, span * 0.18)
    a_high = _area_at(proj, t_max - span * 0.1, span * 0.18)

    # Tail is usually the thinner, lower-area end.
    thin_is_low = (w_head_cand_low + 1e-3) / (a_low + 1) < (w_head_cand_high + 1e-3) / (a_high + 1)
    head_sign = 1.0 if thin_is_low else -1.0  # positive axis points toward head if high end is head

    if thin_is_low:
        head_t, tail_t = t_max, t_min
        head_sign = 1.0
    else:
        head_t, tail_t = t_min, t_max
        head_sign = -1.0

    if prev_head_sign is not None and prev_head_sign * head_sign < 0:
        # Avoid flipping every frame on ambiguous silhouettes.
        if abs(w_head_cand_low - w_head_cand_high) < max(w_head_cand_low, w_head_cand_high) * 0.25:
            head_sign = prev_head_sign
            if head_sign > 0:
                head_t, tail_t = t_max, t_min
            else:
                head_t, tail_t = t_min, t_max

    def at_t(t: float) -> np.ndarray:
        sel = np.abs(proj - t) < window
        if int(sel.sum()) < 5:
            sel = np.abs(proj - t) < window * 2.2
        if int(sel.sum()) < 3:
            return mean + axis * t
        return points[sel].mean(axis=0)

    nose_pt = at_t(head_t)
    tail_end_pt = at_t(tail_t)
    withers_pt = at_t(tail_t + 0.72 * (head_t - tail_t))
    throat_pt = at_t(tail_t + 0.86 * (head_t - tail_t))
    chin_pt = at_t(tail_t + 0.93 * (head_t - tail_t))
    tail_start_pt = at_t(tail_t + 0.16 * (head_t - tail_t))

    # Gravity / image-up for "above" features.
    up = np.array([0.0, -1.0], dtype=np.float32)

    head_sel = proj > (min(head_t, tail_t) + 0.72 * abs(head_t - tail_t)) if head_t > tail_t else proj < (
        max(head_t, tail_t) - 0.72 * abs(head_t - tail_t)
    )
    head_pts = points[head_sel]
    ear_peaks = _head_peaks(head_pts, up, mean)

    x1, y1, x2, y2 = bbox_xyxy.tolist()
    bw, bh = max(x2 - x1, 1.0), max(y2 - y1, 1.0)

    # Paws: lowest pixels in front vs rear halves along the body axis.
    front_sel = (proj - tail_t) / (head_t - tail_t + 1e-6) > 0.45
    rear_sel = ~front_sel
    front_low = _cluster_lowest(points[front_sel]) if front_sel.any() else []
    rear_low = _cluster_lowest(points[rear_sel]) if rear_sel.any() else []

    def pair(clusters: list[np.ndarray], fallback_t: float) -> tuple[np.ndarray, np.ndarray, float]:
        conf = 0.55
        if len(clusters) >= 2:
            left, right = clusters[0], clusters[1]
            conf = 0.72
        elif len(clusters) == 1:
            c = clusters[0]
            offset = perp * max(bw * 0.08, 6.0)
            # perp may point either way; keep left/right by x.
            a, b = c - offset, c + offset
            left, right = (a, b) if a[0] <= b[0] else (b, a)
            conf = 0.42
        else:
            c = at_t(fallback_t)
            offset = np.array([max(bw * 0.1, 8.0), 0.0])
            left, right = c - offset, c + offset
            conf = 0.3
        return left, right, conf

    fl_paw, fr_paw, front_paw_c = pair(front_low, tail_t + 0.78 * (head_t - tail_t))
    rl_paw, rr_paw, rear_paw_c = pair(rear_low, tail_t + 0.22 * (head_t - tail_t))

    def lerp(a: np.ndarray, b: np.ndarray, t: float) -> np.ndarray:
        return a * (1 - t) + b * t

    fl_elbow = lerp(withers_pt, fl_paw, 0.38)
    fl_knee = lerp(withers_pt, fl_paw, 0.68)
    fr_elbow = lerp(withers_pt, fr_paw, 0.38)
    fr_knee = lerp(withers_pt, fr_paw, 0.68)
    rl_elbow = lerp(tail_start_pt, rl_paw, 0.32)
    rl_knee = lerp(tail_start_pt, rl_paw, 0.66)
    rr_elbow = lerp(tail_start_pt, rr_paw, 0.32)
    rr_knee = lerp(tail_start_pt, rr_paw, 0.66)

    # Ears / eyes from head peaks when available.
    if len(ear_peaks) >= 2:
        left_ear, right_ear = (ear_peaks[0], ear_peaks[1]) if ear_peaks[0][0] <= ear_peaks[1][0] else (
            ear_peaks[1],
            ear_peaks[0],
        )
        ear_conf = 0.58
    elif len(ear_peaks) == 1:
        peak = ear_peaks[0]
        offset = np.array([max(bw * 0.07, 5.0), 0.0])
        left_ear, right_ear = peak - offset, peak + offset
        ear_conf = 0.34
    else:
        offset = perp * max(bw * 0.07, 5.0)
        left_ear = throat_pt + up * max(bh * 0.12, 8.0) - offset
        right_ear = throat_pt + up * max(bh * 0.12, 8.0) + offset
        if left_ear[0] > right_ear[0]:
            left_ear, right_ear = right_ear, left_ear
        ear_conf = 0.22

    left_ear_base = lerp(np.array(left_ear), throat_pt, 0.45)
    right_ear_base = lerp(np.array(right_ear), throat_pt, 0.45)
    left_eye = lerp(np.array(left_ear_base), nose_pt, 0.55)
    right_eye = lerp(np.array(right_ear_base), nose_pt, 0.55)

    # Border truncation lowers confidence for paws / tail.
    border = 4
    touches = bool(
        xs.min() <= border or ys.min() <= border or xs.max() >= frame_w - border or ys.max() >= frame_h - border
    )
    trunc = 0.7 if touches else 1.0
    area_ratio = float(len(xs)) / float(frame_w * frame_h)
    quality = float(np.clip(0.35 + area_ratio * 12.0, 0.35, 0.92)) * trunc

    def nxy(p: np.ndarray) -> tuple[float, float]:
        return float(p[0] / frame_w), float(p[1] / frame_h)

    coords: dict[str, tuple[np.ndarray, float]] = {
        "front_left_paw": (fl_paw, front_paw_c * trunc),
        "front_left_knee": (fl_knee, front_paw_c * 0.9 * trunc),
        "front_left_elbow": (fl_elbow, 0.6 * trunc),
        "rear_left_paw": (rl_paw, rear_paw_c * trunc),
        "rear_left_knee": (rl_knee, rear_paw_c * 0.9 * trunc),
        "rear_left_elbow": (rl_elbow, 0.6 * trunc),
        "front_right_paw": (fr_paw, front_paw_c * trunc),
        "front_right_knee": (fr_knee, front_paw_c * 0.9 * trunc),
        "front_right_elbow": (fr_elbow, 0.6 * trunc),
        "rear_right_paw": (rr_paw, rear_paw_c * trunc),
        "rear_right_knee": (rr_knee, rear_paw_c * 0.9 * trunc),
        "rear_right_elbow": (rr_elbow, 0.6 * trunc),
        "tail_start": (tail_start_pt, 0.62 * trunc),
        "tail_end": (tail_end_pt, 0.5 * trunc),
        "left_ear_base": (left_ear_base, ear_conf),
        "right_ear_base": (right_ear_base, ear_conf),
        "nose": (nose_pt, 0.7),
        "chin": (chin_pt, 0.55),
        "left_ear_tip": (np.array(left_ear), ear_conf),
        "right_ear_tip": (np.array(right_ear), ear_conf),
        "left_eye": (left_eye, ear_conf * 0.85),
        "right_eye": (right_eye, ear_conf * 0.85),
        "withers": (withers_pt, 0.68),
        "throat": (throat_pt, 0.64),
    }

    kps = empty_keypoints()
    for i, name in enumerate(KEYPOINT_NAMES):
        pt, conf = coords[name]
        x, y = nxy(pt)
        kps[i] = _point(name, x, y, conf * quality, frame_w, frame_h)

    return kps, head_sign, quality


def smooth_keypoints(prev: list[dict] | None, current: list[dict], alpha: float = 0.45) -> list[dict]:
    if not prev:
        return current
    out = []
    for p, c in zip(prev, current):
        if not c["visible"] and p["visible"]:
            out.append({**p, "confidence": p["confidence"] * 0.85})
            continue
        if not c["visible"]:
            out.append(c)
            continue
        if not p["visible"]:
            out.append(c)
            continue
        out.append(
            {
                "name": c["name"],
                "x": p["x"] * (1 - alpha) + c["x"] * alpha,
                "y": p["y"] * (1 - alpha) + c["y"] * alpha,
                "confidence": p["confidence"] * (1 - alpha) + c["confidence"] * alpha,
                "visible": True,
            }
        )
    return out
