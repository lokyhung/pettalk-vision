"""Rule-based observable pose / action / possible-mood interpretation.

These labels are hypotheses from visual cues, not the dog's actual emotional state.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from .keypoints import NAME_TO_INDEX

INSUFFICIENT = "Insufficient visual evidence"


def _kp(keypoints: list[dict], name: str) -> dict | None:
    i = NAME_TO_INDEX.get(name)
    if i is None:
        return None
    k = keypoints[i]
    return k if k.get("visible") and k.get("confidence", 0) >= 0.3 else k if k.get("visible") else None


def _xy(keypoints: list[dict], name: str) -> np.ndarray | None:
    k = _kp(keypoints, name)
    if not k or k["confidence"] < 0.28:
        return None
    return np.array([k["x"], k["y"]], dtype=np.float32)


def _visible_count(keypoints: list[dict], names: list[str], min_conf: float = 0.3) -> int:
    n = 0
    for name in names:
        k = _kp(keypoints, name)
        if k and k["confidence"] >= min_conf:
            n += 1
    return n


def _angle_deg(a: np.ndarray, b: np.ndarray) -> float:
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na < 1e-6 or nb < 1e-6:
        return 0.0
    cos = float(np.clip(np.dot(a, b) / (na * nb), -1.0, 1.0))
    return float(np.degrees(np.arccos(cos)))


def _hysteresis(session, key: str, label: str, needed: int = 3) -> str:
    pending = f"pending_{key}"
    count = f"pending_{key}_count"
    stable = f"stable_{key}"
    if getattr(session, pending) == label:
        setattr(session, count, getattr(session, count) + 1)
    else:
        setattr(session, pending, label)
        setattr(session, count, 1)
    if getattr(session, count) >= needed or getattr(session, stable) is None:
        setattr(session, stable, label)
    return getattr(session, stable) or label


def interpret(
    keypoints: list[dict],
    bbox: list[float] | None,
    pose_quality: float,
    speed: float,
    truncated: bool,
    pet_name: str = "Mochi",
) -> dict[str, Any]:
    body = INSUFFICIENT
    head = INSUFFICIENT
    ears = INSUFFICIENT
    tail = INSUFFICIENT
    movement = "Low"
    body_conf = 0.0
    cues: list[str] = []

    if speed > 0.09:
        movement = "High"
    elif speed > 0.035:
        movement = "Medium"
    else:
        movement = "Low"

    x1 = y1 = x2 = y2 = 0.0
    bw = bh = 0.0
    if bbox:
        x1, y1, x2, y2 = bbox
        bw, bh = max(x2 - x1, 1e-6), max(y2 - y1, 1e-6)
        aspect = bw / bh
    else:
        aspect = 1.0

    nose = _xy(keypoints, "nose")
    throat = _xy(keypoints, "throat")
    withers = _xy(keypoints, "withers")
    tail_start = _xy(keypoints, "tail_start")
    tail_end = _xy(keypoints, "tail_end")
    chin = _xy(keypoints, "chin")

    fl_paw = _xy(keypoints, "front_left_paw")
    fr_paw = _xy(keypoints, "front_right_paw")
    rl_paw = _xy(keypoints, "rear_left_paw")
    rr_paw = _xy(keypoints, "rear_right_paw")
    fl_el = _xy(keypoints, "front_left_elbow")
    fr_el = _xy(keypoints, "front_right_elbow")
    rl_el = _xy(keypoints, "rear_left_elbow")
    rr_el = _xy(keypoints, "rear_right_elbow")

    paws = [p for p in (fl_paw, fr_paw, rl_paw, rr_paw) if p is not None]
    hips = [p for p in (rl_el, rr_el) if p is not None]
    shoulders = [p for p in (fl_el, fr_el, withers) if p is not None]

    full_body = pose_quality >= 0.42 and not (truncated and bh < 0.18)
    if full_body and bbox:
        mean_paw_y = float(np.mean([p[1] for p in paws])) if paws else y2
        mean_hip_y = float(np.mean([p[1] for p in hips])) if hips else (y1 + bh * 0.55)
        mean_shoulder_y = float(np.mean([p[1] for p in shoulders])) if shoulders else (y1 + bh * 0.4)
        vertical_span = bh
        paw_hip = mean_paw_y - mean_hip_y
        front_rear_drop = mean_shoulder_y - (float(np.mean([p[1] for p in hips])) if hips else mean_hip_y)

        lying_score = 0.0
        sitting_score = 0.0
        standing_score = 0.0
        bow_score = 0.0

        if aspect > 1.45 and vertical_span < 0.42:
            lying_score += 0.45
        if paws and abs(mean_paw_y - (y1 + y2) / 2) < 0.12:
            lying_score += 0.25
        if vertical_span < 0.28:
            lying_score += 0.2

        if paw_hip < 0.08 and aspect < 1.55 and vertical_span > 0.28:
            sitting_score += 0.4
        if hips and paws and (mean_paw_y - mean_hip_y) < 0.07 and vertical_span > 0.32:
            sitting_score += 0.25

        if paw_hip > 0.1 and vertical_span > 0.34:
            standing_score += 0.45
        if aspect < 1.35 and vertical_span > 0.38:
            standing_score += 0.2

        if front_rear_drop > 0.07 and vertical_span > 0.28 and aspect > 1.05:
            bow_score += 0.5
        if hips and shoulders and mean_shoulder_y - mean_hip_y > 0.08:
            bow_score += 0.25

        scores = {
            "Lying down": lying_score,
            "Sitting": sitting_score,
            "Standing": standing_score,
            "Play bow": bow_score,
        }
        body = max(scores, key=scores.get)
        body_conf = float(min(0.9, 0.35 + max(scores.values())))
        if max(scores.values()) < 0.35:
            body = INSUFFICIENT
            body_conf = 0.2
        else:
            cues.append(f"Body silhouette is consistent with {body.lower()}")
    elif bbox:
        body = INSUFFICIENT
        body_conf = 0.15

    # Head orientation from nose vs body axis.
    if nose is not None and (throat is not None or withers is not None) and (tail_start is not None or withers is not None):
        head_anchor = throat if throat is not None else withers
        body_anchor = withers if withers is not None else tail_start
        rear = tail_start if tail_start is not None else body_anchor
        head_vec = nose - head_anchor
        body_vec = head_anchor - rear
        ang = _angle_deg(head_vec, body_vec)
        if ang < 28:
            head = "Forward"
            cues.append("Head and body axes are roughly aligned")
        else:
            head = "Turned"
            cues.append("Head axis diverges from the body axis")
    elif nose is not None and withers is not None:
        head = "Forward" if abs(nose[0] - withers[0]) < 0.08 else "Turned"

    # Ears: tip vs base relative to nose (forward) or tail (back).
    le_tip = _xy(keypoints, "left_ear_tip")
    re_tip = _xy(keypoints, "right_ear_tip")
    le_base = _xy(keypoints, "left_ear_base")
    re_base = _xy(keypoints, "right_ear_base")
    ear_conf_ok = _visible_count(keypoints, ["left_ear_tip", "right_ear_tip", "left_ear_base", "right_ear_base"], 0.4)
    if ear_conf_ok >= 3 and nose is not None and tail_start is not None:
        tips = [p for p in (le_tip, re_tip) if p is not None]
        bases = [p for p in (le_base, re_base) if p is not None]
        if tips and bases:
            tip_to_nose = float(np.mean([np.linalg.norm(t - nose) for t in tips]))
            base_to_nose = float(np.mean([np.linalg.norm(b - nose) for b in bases]))
            tip_to_tail = float(np.mean([np.linalg.norm(t - tail_start) for t in tips]))
            base_to_tail = float(np.mean([np.linalg.norm(b - tail_start) for b in bases]))
            forward_score = (base_to_nose - tip_to_nose) + 0.15
            back_score = (base_to_tail - tip_to_tail)
            if forward_score > 0.01 and forward_score >= back_score:
                ears = "Forward"
                cues.append("Ear tips sit closer to the muzzle than the ear bases")
            elif back_score > 0.015:
                ears = "Backward"
                cues.append("Ear tips sit closer to the rear than the ear bases")
            else:
                ears = INSUFFICIENT
    else:
        ears = INSUFFICIENT

    if tail_start is not None and tail_end is not None:
        dy = tail_end[1] - tail_start[1]  # image y grows downward
        dx = abs(tail_end[0] - tail_start[0])
        length = float(np.linalg.norm(tail_end - tail_start))
        if length < 0.03:
            tail = INSUFFICIENT
        elif dy < -0.02:
            tail = "Raised"
            cues.append("Tail tip is above the tail root in the image")
        elif dy > 0.025 and (rl_paw is not None and np.linalg.norm(tail_end - rl_paw) < 0.08):
            tail = "Lowered"
            cues.append("Tail tip hangs near the hind legs")
        elif dy > 0.02:
            tail = "Lowered"
            cues.append("Tail tip is below the tail root")
        elif dx > 0.04:
            tail = "Raised" if dy <= 0 else "Lowered"
        else:
            tail = INSUFFICIENT
    else:
        tail = INSUFFICIENT

    # Primary observable action.
    action_label = INSUFFICIENT
    action_icon = "◌"
    action_conf = 0.2

    if movement in ("Medium", "High") and body in ("Standing", INSUFFICIENT) and speed > 0.04:
        action_label = "Walking / moving"
        action_icon = "🐾"
        action_conf = min(0.88, 0.5 + speed * 3)
        cues.append("Bounding box centroid is displacing across frames")
    elif body == "Play bow":
        action_label = "Play bow / playful posture"
        action_icon = "🎾"
        action_conf = body_conf
    elif body == "Lying down":
        action_label = "Lying down"
        action_icon = "🛏️"
        action_conf = body_conf
    elif body == "Sitting":
        action_label = "Sitting"
        action_icon = "🐕"
        action_conf = body_conf
    elif body == "Standing" and head == "Forward" and movement == "Low":
        action_label = "Attentive"
        action_icon = "👀"
        action_conf = 0.62 + (0.12 if ears == "Forward" else 0.0)
        cues.append("Upright stance with a forward-facing head and low movement")
    elif body == "Standing":
        action_label = "Standing"
        action_icon = "🐕"
        action_conf = body_conf
    elif head == "Turned" and movement == "Low":
        action_label = "Head turned"
        action_icon = "👀"
        action_conf = 0.5

    if pose_quality < 0.38:
        action_label = INSUFFICIENT
        action_icon = "◌"
        action_conf = 0.2

    # Possible mood — always hedged.
    mood_label = INSUFFICIENT
    mood_icon = "◌"
    mood_conf = 0.2
    mood_cues: list[str] = []

    if action_label == "Play bow / playful posture" or (movement == "High" and tail == "Raised"):
        mood_label = "Playful"
        mood_icon = "🎾"
        mood_conf = 0.58 if action_label.startswith("Play") else 0.48
        mood_cues = [c for c in cues if "bow" in c.lower() or "tail" in c.lower() or "displac" in c.lower()]
        if not mood_cues:
            mood_cues = ["Active movement combined with a raised tail may be consistent with play"]
    elif (
        body in ("Standing", "Sitting")
        and head == "Forward"
        and movement == "Low"
        and ears in ("Forward", INSUFFICIENT)
    ):
        mood_label = "Curious / Alert"
        mood_icon = "😊"
        mood_conf = 0.55 if ears == "Forward" else 0.46
        mood_cues = ["Forward-facing head", "Upright / standing posture", "Low movement"]
        if ears == "Forward":
            mood_cues.append("Ears oriented forward")
    elif body == "Lying down" and movement == "Low":
        mood_label = "Relaxed"
        mood_icon = "😌"
        mood_conf = 0.52
        mood_cues = ["Recumbent body posture", "Low movement"]
    elif ears == "Backward" and tail == "Lowered" and (body in ("Sitting", "Lying down") or (bbox and bh < 0.35)):
        mood_label = "Possible Stress / Fear"
        mood_icon = "😟"
        mood_conf = 0.44
        mood_cues = ["Ears oriented backward", "Tail lowered"]
        if body != INSUFFICIENT:
            mood_cues.append(f"{body} posture")
    elif body == "Standing" and movement == "Low" and tail == "Raised" and head == "Forward" and ears == "Backward":
        mood_label = "Possible Defensive Behaviour"
        mood_icon = "🛡️"
        mood_conf = 0.4
        mood_cues = ["Upright stance", "Low movement (possible stiffness)", "Ears backward"]
    else:
        mood_label = INSUFFICIENT
        mood_icon = "◌"
        mood_conf = 0.2

    why = _why(pet_name, action_label, mood_label, head, ears, body, tail, movement, mood_cues or cues)
    observe = _observe_next(pet_name, mood_label, action_label)

    return {
        "pose": {
            "head": head,
            "ears": ears,
            "body": body,
            "tail": tail,
            "movement": movement,
        },
        "action": {
            "label": action_label,
            "confidence": round(float(action_conf), 3),
            "icon": action_icon,
        },
        "mood": {
            "label": mood_label,
            "confidence": round(float(mood_conf), 3),
            "icon": mood_icon,
        },
        "cues": (mood_cues or cues)[:6],
        "why": why,
        "observeNext": observe,
        "bodyConfidence": round(float(body_conf), 3),
    }


def _why(
    name: str,
    action: str,
    mood: str,
    head: str,
    ears: str,
    body: str,
    tail: str,
    movement: str,
    cues: list[str],
) -> str:
    if action == INSUFFICIENT and mood == INSUFFICIENT:
        return (
            f"There is not enough of {name}'s body in view to support a stable reading. "
            "Try a clearer, full-body angle with more light."
        )
    bits = []
    if body != INSUFFICIENT:
        bits.append(f"an observable {body.lower()} posture")
    if head != INSUFFICIENT:
        bits.append(f"a {head.lower()} head orientation")
    if ears != INSUFFICIENT:
        bits.append(f"ears {ears.lower()}")
    if tail != INSUFFICIENT:
        bits.append(f"a {tail.lower()} tail")
    bits.append(f"{movement.lower()} movement")
    observed = ", ".join(bits)
    if mood == INSUFFICIENT:
        return (
            f"PetTalk detected {observed}. These are visual cues only; "
            "there is not enough consistent evidence to suggest a possible mood."
        )
    return (
        f"PetTalk detected {observed}. Taken together, these cues may be consistent with a "
        f"{mood.lower()} state. This is a possible interpretation based on observed posture, "
        f"not a reading of {name}'s actual emotions."
    )


def _observe_next(name: str, mood: str, action: str) -> str:
    if mood == "Curious / Alert":
        return f"Check whether {name} continues focusing on the same object or stimulus."
    if mood == "Playful":
        return f"See whether {name} repeats a bow, play-face, or bouncy approach."
    if mood == "Relaxed":
        return f"Notice if {name} stays recumbent and whether muscle tension remains low."
    if mood.startswith("Possible Stress"):
        return f"Give {name} space and watch for further distance-increasing signals."
    if mood.startswith("Possible Defensive"):
        return f"Avoid crowding {name} and watch whether the stiff posture releases."
    if action == INSUFFICIENT:
        return f"Move so more of {name}'s body is visible, especially the legs and tail."
    return f"Watch how {name}'s posture changes over the next few seconds."
