"""Observable pose/action from keypoints, then a cautious possible-mood layer.

Mood is never treated as ground truth. Missing keypoints must not invent cues.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from .config import get_settings
from .i18n import ANALYSING, INSUFFICIENT, NOT_VISIBLE
from .keypoints import NAME_TO_INDEX


def _min_conf() -> float:
    return get_settings().keypoint_conf_threshold


def _kp(keypoints: list[dict], name: str) -> dict | None:
    i = NAME_TO_INDEX.get(name)
    if i is None:
        return None
    k = keypoints[i]
    if not k.get("visible"):
        return None
    if k.get("confidence", 0) < _min_conf():
        return None
    return k


def _xy(keypoints: list[dict], name: str) -> np.ndarray | None:
    k = _kp(keypoints, name)
    if not k:
        return None
    return np.array([k["x"], k["y"]], dtype=np.float32)


def _visible_count(keypoints: list[dict], names: list[str]) -> int:
    return sum(1 for name in names if _xy(keypoints, name) is not None)


def _angle_deg(a: np.ndarray, b: np.ndarray) -> float:
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na < 1e-6 or nb < 1e-6:
        return 0.0
    cos = float(np.clip(np.dot(a, b) / (na * nb), -1.0, 1.0))
    return float(np.degrees(np.arccos(cos)))


def interpret_observable(
    keypoints: list[dict],
    bbox: list[float] | None,
    pose_quality: float,
    speed: float,
    truncated: bool,
) -> dict[str, Any]:
    """Per-frame observable signals only. No mood."""
    settings = get_settings()
    cues: list[str] = []

    if speed > settings.movement_high:
        movement = "high"
    elif speed > settings.movement_low:
        movement = "medium"
    else:
        movement = "low"

    body, body_conf, body_cues = _body(keypoints, bbox, pose_quality, truncated)
    cues.extend(body_cues)
    head, head_cues = _head(keypoints)
    cues.extend(head_cues)
    ears, ear_cues = _ears(keypoints)
    cues.extend(ear_cues)
    tail, tail_cues = _tail(keypoints)
    cues.extend(tail_cues)

    action = INSUFFICIENT
    action_conf = 0.0

    if truncated and bbox:
        x1, y1, x2, y2 = bbox
        bh = y2 - y1
        if bh < 0.22 or x1 < 0.01 or x2 > 0.99:
            return {
                "pose": {
                    "head": head,
                    "ears": ears,
                    "body": INSUFFICIENT,
                    "tail": tail,
                    "movement": movement,
                },
                "action": INSUFFICIENT,
                "actionConfidence": 0.15,
                "cues": ["狗狗未完整出現在畫面中"],
                "reason": "truncated",
            }

    if pose_quality < settings.pose_quality_threshold:
        action = ANALYSING if body == INSUFFICIENT else body
        action_conf = 0.2
    elif movement in ("medium", "high") and body in ("standing", INSUFFICIENT) and speed > settings.movement_high * 0.7:
        if body == "standing" or (body == INSUFFICIENT and movement == "high"):
            action = "walking"
            action_conf = min(0.86, 0.48 + speed * 2.2)
            cues.append("身體位置在連續畫面中有明顯位移")
    elif body == "play_bow":
        action = "play_bow"
        action_conf = body_conf
    elif body in ("lying", "sitting", "standing"):
        action = body
        action_conf = body_conf
    else:
        action = ANALYSING
        action_conf = 0.25

    return {
        "pose": {
            "head": head,
            "ears": ears,
            "body": body,
            "tail": tail,
            "movement": movement,
        },
        "action": action,
        "actionConfidence": round(float(action_conf), 3),
        "cues": cues[:8],
        "reason": "ok",
    }


def infer_possible_behaviour(pose: dict[str, str], action: str) -> tuple[str, list[str]]:
    """Secondary interpretation: possible behaviour from smoothed observables."""
    body = pose.get("body", INSUFFICIENT)
    head = pose.get("head", NOT_VISIBLE)
    ears = pose.get("ears", NOT_VISIBLE)
    tail = pose.get("tail", NOT_VISIBLE)
    movement = pose.get("movement", "low")

    if action in (INSUFFICIENT, ANALYSING) and body in (INSUFFICIENT, ANALYSING):
        return INSUFFICIENT, []

    if action == "play_bow" or (movement == "high" and tail == "raised"):
        return "playful", ["活動偏高或出現玩耍鞠躬"]
    if action == "walking" or (movement == "high" and body == "standing"):
        return "moving", ["身體位置在連續畫面中有明顯位移"]
    if (
        body in ("standing", "sitting")
        and head == "forward"
        and ears == "forward"
        and movement in ("low", "medium")
    ):
        return "attentive", ["頭部向前", "耳朵向前", "活動程度不高"]
    return INSUFFICIENT, []


def infer_mood(pose: dict[str, str], action: str, possible_behaviour: str = INSUFFICIENT) -> tuple[str, list[str]]:
    """Possible state from *smoothed* observables. Never a diagnosis."""
    body = pose.get("body", INSUFFICIENT)
    head = pose.get("head", NOT_VISIBLE)
    ears = pose.get("ears", NOT_VISIBLE)
    tail = pose.get("tail", NOT_VISIBLE)
    movement = pose.get("movement", "low")
    cues: list[str] = []

    if action in (INSUFFICIENT, ANALYSING) and body in (INSUFFICIENT, ANALYSING):
        return INSUFFICIENT, []

    if possible_behaviour == "playful" or action == "play_bow":
        cues = ["前身較低或活動較大"]
        if tail == "raised":
            cues.append("尾巴向上")
        return "playful", cues

    if body == "lying" and movement == "low":
        cues = ["身體接近水平／躺下", "活動程度低"]
        return "relaxed", cues

    if ears == "back" and tail == "lowered" and body in ("sitting", "lying"):
        cues = ["耳朵向後", "尾巴向下"]
        return "stress_fear", cues

    if body == "standing" and movement == "low" and tail == "raised" and ears == "back" and head == "forward":
        cues = ["站立而活動偏低", "耳朵向後", "尾巴向上"]
        return "defensive", cues

    if possible_behaviour == "attentive" and ears == "forward" and head == "forward":
        cues = ["頭部向前", "耳朵向前", "活動程度不高"]
        return "alert_curious", cues

    return INSUFFICIENT, cues


def build_why(
    name: str,
    pose: dict[str, str],
    action: str,
    mood: str,
    cues: list[str],
    profile: dict | None = None,
) -> tuple[str, str]:
    body = pose.get("body", INSUFFICIENT)
    head = pose.get("head", NOT_VISIBLE)
    ears = pose.get("ears", NOT_VISIBLE)
    tail = pose.get("tail", NOT_VISIBLE)
    movement = pose.get("movement", "low")

    if action in (INSUFFICIENT,) or (body == INSUFFICIENT and action == ANALYSING):
        why = f"目前未能清楚看見{name}的完整身體，資料不足，因此不會強行判斷可能狀態。"
        nxt = f"請讓{name}完整進入畫面，尤其是腳部與尾巴。"
        return _with_profile(why, nxt, name, pose, profile)

    if action == ANALYSING:
        why = f"已偵測到{name}，但仍在等候連續畫面中的穩定姿勢線索。"
        nxt = "可保持鏡頭穩定，讓身體多停留在畫面中央。"
        return _with_profile(why, nxt, name, pose, profile)

    bits = []
    if body not in (INSUFFICIENT, NOT_VISIBLE):
        bits.append(f"身體姿勢為{_zh_pose(body)}")
    if head not in (INSUFFICIENT, NOT_VISIBLE):
        bits.append(f"頭部{_zh_pose(head)}")
    if ears not in (INSUFFICIENT, NOT_VISIBLE):
        bits.append(f"耳朵{_zh_pose(ears)}")
    if tail not in (INSUFFICIENT, NOT_VISIBLE):
        bits.append(f"尾巴{_zh_pose(tail)}")
    bits.append(f"活動程度{_zh_pose(movement)}")
    observed = "，".join(bits)

    if mood == INSUFFICIENT:
        why = f"偵測到{observed}。這些是可觀察線索，但尚未足夠支持一個可能狀態，因此顯示資料不足。"
        nxt = f"可以繼續觀察{name}接下來數秒的姿勢會否保持一致。"
        return _with_profile(why, nxt, name, pose, profile)

    mood_phrase = {
        "alert_curious": "注意或好奇",
        "relaxed": "較為放鬆",
        "playful": "活潑／玩耍",
        "stress_fear": "緊張或想拉開距離",
        "defensive": "防備",
    }.get(mood, "某種行為狀態")

    why = (
        f"{name}目前{observed}。這些可觀察線索可能與{mood_phrase}狀態一致，"
        f"值得留意，但並不能確定{name}的真實情緒。"
    )
    nxt = _observe_next(name, mood)
    return _with_profile(why, nxt, name, pose, profile)


def _profile_traits(profile: dict | None) -> list[str]:
    if not profile:
        return []
    traits = profile.get("traits") or []
    if isinstance(traits, str):
        traits = [part.strip() for part in traits.replace("，", ",").split(",") if part.strip()]
    personality = str(profile.get("personality") or "")
    extra = [part.strip() for part in personality.replace("，", ",").split(",") if part.strip()]
    merged: list[str] = []
    for item in [*traits, *extra]:
        if item and item not in merged:
            merged.append(item)
    return merged


def _with_profile(
    why: str,
    nxt: str,
    name: str,
    pose: dict[str, str],
    profile: dict | None,
) -> tuple[str, str]:
    if not profile:
        return why, nxt
    traits = _profile_traits(profile)
    movement = pose.get("movement", INSUFFICIENT)
    shy = any(tag in traits for tag in ("害羞", "安靜", "慢熱"))
    lively = "活潑" in traits
    extras: list[str] = []
    if shy and movement == "high":
        extras.append(
            f"由於{name}平時較安靜／害羞，而目前偵測到較高活動量，這次行為與平日習慣有所不同，值得主人留意。"
        )
    elif lively and movement == "low" and pose.get("body") in ("lying", "sitting"):
        extras.append(
            f"{name}的寵物資料標明較為活潑，而目前活動程度偏低；這只是背景參考，並不能覆蓋畫面中的偵測結果。"
        )
    likes = str(profile.get("likes") or "").strip()
    if likes:
        extras.append(f"喜好紀錄（{likes}）只作背景，不會改變姿勢判斷。")
    if traits:
        extras.append(f"寵物資料（{'、'.join(traits)}）只作說明背景，並不會覆蓋電腦視覺偵測結果。")
    if extras:
        why = why + " " + " ".join(extras)
    return why, nxt


def _observe_next(name: str, mood: str) -> str:
    if mood == "alert_curious":
        return f"可以觀察{name}接下來是否持續望向同一方向，以及行為會否出現變化。"
    if mood == "playful":
        return f"可以留意{name}會否重複鞠躬、彈跳或靠近邀請玩耍。"
    if mood == "relaxed":
        return f"可以觀察{name}會否繼續躺下，身體是否保持鬆弛。"
    if mood == "stress_fear":
        return f"建議給予{name}空間，並留意有沒有更多想拉開距離的訊號。"
    if mood == "defensive":
        return f"避免逼近{name}，觀察繃緊姿勢會否逐漸放鬆。"
    return f"可以觀察{name}接下來數秒的姿勢變化。"


def _zh_pose(code: str) -> str:
    from .i18n import pose_label

    return pose_label(code)


def _body(
    keypoints: list[dict],
    bbox: list[float] | None,
    pose_quality: float,
    truncated: bool,
) -> tuple[str, float, list[str]]:
    if not bbox:
        return INSUFFICIENT, 0.0, []
    x1, y1, x2, y2 = bbox
    bw, bh = max(x2 - x1, 1e-6), max(y2 - y1, 1e-6)
    aspect = bw / bh
    cues: list[str] = []

    fl_paw = _xy(keypoints, "front_left_paw")
    fr_paw = _xy(keypoints, "front_right_paw")
    rl_paw = _xy(keypoints, "rear_left_paw")
    rr_paw = _xy(keypoints, "rear_right_paw")
    rl_el = _xy(keypoints, "rear_left_elbow")
    rr_el = _xy(keypoints, "rear_right_elbow")
    fl_el = _xy(keypoints, "front_left_elbow")
    fr_el = _xy(keypoints, "front_right_elbow")
    withers = _xy(keypoints, "withers")

    paws = [p for p in (fl_paw, fr_paw, rl_paw, rr_paw) if p is not None]
    hips = [p for p in (rl_el, rr_el) if p is not None]
    shoulders = [p for p in (fl_el, fr_el, withers) if p is not None]

    paw_ok = len(paws) >= 2
    if not paw_ok or pose_quality < get_settings().pose_quality_threshold:
        if truncated:
            return INSUFFICIENT, 0.12, ["身體被畫面裁切，姿勢無法可靠判斷"]
        return INSUFFICIENT, 0.18, ["可見腳部關鍵點不足，不會強行判斷站立或坐下"]

    mean_paw_y = float(np.mean([p[1] for p in paws]))
    mean_hip_y = float(np.mean([p[1] for p in hips])) if hips else (y1 + bh * 0.58)
    mean_shoulder_y = float(np.mean([p[1] for p in shoulders])) if shoulders else (y1 + bh * 0.38)
    paw_hip = mean_paw_y - mean_hip_y
    front_rear_drop = mean_shoulder_y - (float(np.mean([p[1] for p in hips])) if hips else mean_hip_y)
    paws_low = mean_paw_y > (y1 + bh * 0.68)
    front_paws = [p for p in (fl_paw, fr_paw) if p is not None]
    rear_paws = [p for p in (rl_paw, rr_paw) if p is not None]

    paw_spread = 0.0
    if front_paws and rear_paws:
        fy = float(np.mean([p[1] for p in front_paws]))
        ry = float(np.mean([p[1] for p in rear_paws]))
        paw_spread = ry - fy

    lying = sitting = standing = bow = 0.0
    if aspect > 1.45 and bh < 0.42:
        lying += 0.55
    if bh < 0.28:
        lying += 0.28
    if paws and abs(mean_paw_y - (y1 + y2) / 2) < 0.1:
        lying += 0.15
    if aspect > 1.6 and not paws_low:
        lying += 0.2

    if paw_spread > 0.08 and aspect < 1.25 and bh > 0.32:
        sitting += 0.55
    if paw_hip < 0.08 and aspect < 1.55 and bh > 0.28 and paws_low:
        sitting += 0.38
    if hips and paw_hip < 0.07 and bh > 0.32:
        sitting += 0.28

    if abs(paw_spread) < 0.06 and bh > 0.38 and paws_low and paw_hip > 0.10:
        standing += 0.48
    if paw_hip > 0.12 and bh > 0.34 and paws_low and paw_spread < 0.1:
        standing += 0.42
    if aspect < 1.35 and bh > 0.42 and paw_hip > 0.1:
        standing += 0.18

    if front_rear_drop > 0.07 and bh > 0.28 and aspect > 1.05:
        bow += 0.55
    if hips and shoulders and mean_shoulder_y - mean_hip_y > 0.08:
        bow += 0.2

    scores = {"lying": lying, "sitting": sitting, "standing": standing, "play_bow": bow}
    body = max(scores, key=scores.get)
    best = scores[body]
    second = sorted(scores.values(), reverse=True)[1]
    if best < 0.32:
        return INSUFFICIENT, 0.22, ["姿勢線索不夠清楚"]
    if best - second < 0.10:
        return INSUFFICIENT, 0.24, ["站立與坐下等線索接近，不會強行判斷"]
    cues.append(f"可見身體輪廓較接近{_zh_pose(body)}")
    return body, float(min(0.9, 0.38 + best)), cues


def _head(keypoints: list[dict]) -> tuple[str, list[str]]:
    nose = _xy(keypoints, "nose")
    withers = _xy(keypoints, "withers")
    throat = _xy(keypoints, "throat")
    tail_start = _xy(keypoints, "tail_start")
    if nose is None or (throat is None and withers is None):
        return NOT_VISIBLE, []

    head_anchor = throat if throat is not None else withers
    rear = tail_start if tail_start is not None else withers
    cues: list[str] = []
    if rear is not None and head_anchor is not None:
        head_vec = nose - head_anchor
        body_vec = head_anchor - rear
        ang = _angle_deg(head_vec, body_vec)
        dx = float(nose[0] - head_anchor[0])
        dy = float(nose[1] - head_anchor[1])
        if dy > 0.045 and abs(dy) > abs(dx):
            cues.append("鼻部位於頸部下方")
            return "down", cues
        if abs(dx) > 0.05 and ang >= 28:
            side = "left" if dx < 0 else "right"
            cues.append("頭部相對身體軸線偏側")
            return side, cues
        if ang < 28:
            cues.append("頭部與身體方向大致一致")
            return "forward", cues
    if withers is not None:
        dx = float(nose[0] - withers[0])
        dy = float(nose[1] - withers[1])
        if dy > 0.05:
            return "down", ["頭部相對肩隆偏低"]
        if dx < -0.06:
            return "left", ["鼻部位於身體左側"]
        if dx > 0.06:
            return "right", ["鼻部位於身體右側"]
        return "forward", ["頭部大致朝前"]
    return NOT_VISIBLE, []


def _ears(keypoints: list[dict]) -> tuple[str, list[str]]:
    names = ["left_ear_tip", "right_ear_tip", "left_ear_base", "right_ear_base"]
    if _visible_count(keypoints, names) < 3:
        return NOT_VISIBLE, []
    nose = _xy(keypoints, "nose")
    tail_start = _xy(keypoints, "tail_start")
    if nose is None or tail_start is None:
        return NOT_VISIBLE, []
    tips = [p for p in (_xy(keypoints, "left_ear_tip"), _xy(keypoints, "right_ear_tip")) if p is not None]
    bases = [p for p in (_xy(keypoints, "left_ear_base"), _xy(keypoints, "right_ear_base")) if p is not None]
    if not tips or not bases:
        return NOT_VISIBLE, []
    tip_to_nose = float(np.mean([np.linalg.norm(t - nose) for t in tips]))
    base_to_nose = float(np.mean([np.linalg.norm(b - nose) for b in bases]))
    tip_to_tail = float(np.mean([np.linalg.norm(t - tail_start) for t in tips]))
    base_to_tail = float(np.mean([np.linalg.norm(b - tail_start) for b in bases]))
    forward_score = (base_to_nose - tip_to_nose)
    back_score = (base_to_tail - tip_to_tail)
    if forward_score > 0.012 and forward_score >= back_score:
        return "forward", ["耳尖較接近口鼻"]
    if back_score > 0.015:
        return "back", ["耳尖較接近身體後方"]
    return "neutral", ["耳朵位置介乎向前與向後之間"]


def _tail(keypoints: list[dict]) -> tuple[str, list[str]]:
    start = _xy(keypoints, "tail_start")
    end = _xy(keypoints, "tail_end")
    if start is None or end is None:
        return NOT_VISIBLE, []
    length = float(np.linalg.norm(end - start))
    if length < 0.03:
        return NOT_VISIBLE, []
    dy = float(end[1] - start[1])
    if dy < -0.02:
        return "raised", ["尾尖高於尾根"]
    if dy > 0.02:
        return "lowered", ["尾尖低於尾根"]
    return "neutral", ["尾巴大致水平"]
