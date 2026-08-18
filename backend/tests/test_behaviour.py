from app.behaviour import build_why, infer_mood, infer_possible_behaviour, interpret_observable
from app.detector import DogAnalyzer
from app.i18n import INSUFFICIENT, NOT_VISIBLE
from app.keypoints import empty_keypoints, NAME_TO_INDEX
from app.session import SessionState
from app.smoothing import TemporalSmoother


def _set(kps, name, x, y, conf=0.8):
    i = NAME_TO_INDEX[name]
    kps[i] = {"name": name, "x": x, "y": y, "confidence": conf, "visible": True}


def _standing_kps():
    kps = empty_keypoints()
    _set(kps, "nose", 0.72, 0.32)
    _set(kps, "chin", 0.70, 0.38)
    _set(kps, "throat", 0.64, 0.40)
    _set(kps, "withers", 0.50, 0.36)
    _set(kps, "tail_start", 0.32, 0.40)
    _set(kps, "tail_end", 0.26, 0.28)
    _set(kps, "left_ear_tip", 0.74, 0.22)
    _set(kps, "right_ear_tip", 0.78, 0.22)
    _set(kps, "left_ear_base", 0.70, 0.28)
    _set(kps, "right_ear_base", 0.74, 0.28)
    _set(kps, "front_left_paw", 0.62, 0.82)
    _set(kps, "front_right_paw", 0.70, 0.82)
    _set(kps, "rear_left_paw", 0.34, 0.82)
    _set(kps, "rear_right_paw", 0.40, 0.82)
    _set(kps, "front_left_elbow", 0.60, 0.52)
    _set(kps, "front_right_elbow", 0.68, 0.52)
    _set(kps, "rear_left_elbow", 0.34, 0.52)
    _set(kps, "rear_right_elbow", 0.40, 0.52)
    return kps


def _sitting_kps():
    kps = empty_keypoints()
    _set(kps, "nose", 0.55, 0.32)
    _set(kps, "chin", 0.55, 0.38)
    _set(kps, "throat", 0.55, 0.42)
    _set(kps, "withers", 0.50, 0.48)
    _set(kps, "tail_start", 0.48, 0.62)
    _set(kps, "tail_end", 0.48, 0.78)
    _set(kps, "front_left_paw", 0.46, 0.72)
    _set(kps, "front_right_paw", 0.62, 0.72)
    _set(kps, "rear_left_paw", 0.48, 0.86)
    _set(kps, "rear_right_paw", 0.58, 0.86)
    _set(kps, "front_left_elbow", 0.46, 0.58)
    _set(kps, "front_right_elbow", 0.62, 0.58)
    _set(kps, "rear_left_elbow", 0.48, 0.78)
    _set(kps, "rear_right_elbow", 0.58, 0.78)
    return kps


def _lying_kps():
    kps = empty_keypoints()
    _set(kps, "nose", 0.78, 0.52)
    _set(kps, "chin", 0.74, 0.54)
    _set(kps, "throat", 0.70, 0.54)
    _set(kps, "withers", 0.55, 0.52)
    _set(kps, "tail_start", 0.32, 0.54)
    _set(kps, "tail_end", 0.22, 0.56)
    _set(kps, "front_left_paw", 0.68, 0.58)
    _set(kps, "front_right_paw", 0.72, 0.60)
    _set(kps, "rear_left_paw", 0.34, 0.60)
    _set(kps, "rear_right_paw", 0.38, 0.58)
    _set(kps, "front_left_elbow", 0.66, 0.54)
    _set(kps, "front_right_elbow", 0.70, 0.54)
    _set(kps, "rear_left_elbow", 0.34, 0.54)
    _set(kps, "rear_right_elbow", 0.38, 0.54)
    return kps


def test_standing_is_not_sitting():
    out = interpret_observable(_standing_kps(), [0.22, 0.18, 0.82, 0.88], 0.8, 0.01, False)
    assert out["pose"]["body"] == "standing"
    assert out["action"] == "standing"


def test_sitting_geometry():
    out = interpret_observable(_sitting_kps(), [0.32, 0.18, 0.72, 0.90], 0.8, 0.01, False)
    assert out["pose"]["body"] == "sitting"
    assert out["action"] == "sitting"


def test_lying_geometry():
    out = interpret_observable(_lying_kps(), [0.18, 0.42, 0.86, 0.66], 0.8, 0.01, False)
    assert out["pose"]["body"] == "lying"
    assert out["action"] == "lying"


def test_walking_needs_real_movement():
    still = interpret_observable(_standing_kps(), [0.22, 0.18, 0.82, 0.88], 0.8, 0.01, False)
    moving = interpret_observable(_standing_kps(), [0.22, 0.18, 0.82, 0.88], 0.8, 0.20, False)
    assert still["action"] == "standing"
    assert moving["action"] == "walking"
    assert moving["pose"]["movement"] == "high"


def test_sitting_without_ear_cues_is_not_always_curious():
    out = interpret_observable(_sitting_kps(), [0.32, 0.18, 0.72, 0.90], 0.8, 0.01, False)
    assert out["pose"]["ears"] == NOT_VISIBLE
    behaviour, _ = infer_possible_behaviour(out["pose"], out["action"])
    mood, _ = infer_mood(out["pose"], out["action"], behaviour)
    assert behaviour == INSUFFICIENT
    assert mood == INSUFFICIENT


def test_lying_low_movement_can_be_relaxed():
    out = interpret_observable(_lying_kps(), [0.18, 0.42, 0.86, 0.66], 0.8, 0.01, False)
    behaviour, _ = infer_possible_behaviour(out["pose"], out["action"])
    mood, _ = infer_mood(out["pose"], out["action"], behaviour)
    assert mood == "relaxed"
    assert mood != "alert_curious"


def test_alert_curious_requires_forward_ears():
    pose = {
        "head": "forward",
        "ears": "forward",
        "body": "standing",
        "tail": NOT_VISIBLE,
        "movement": "low",
    }
    behaviour, _ = infer_possible_behaviour(pose, "standing")
    mood, _ = infer_mood(pose, "standing", behaviour)
    assert behaviour == "attentive"
    assert mood == "alert_curious"

    pose["ears"] = NOT_VISIBLE
    behaviour, _ = infer_possible_behaviour(pose, "standing")
    mood, _ = infer_mood(pose, "standing", behaviour)
    assert mood == INSUFFICIENT


def test_insufficient_when_quality_low():
    kps = empty_keypoints()
    out = interpret_observable(kps, [0.2, 0.2, 0.4, 0.4], pose_quality=0.1, speed=0.0, truncated=True)
    assert out["action"] in {INSUFFICIENT, "analysing"}
    assert out["pose"]["body"] == INSUFFICIENT


def test_tail_not_visible_without_keypoints():
    kps = empty_keypoints()
    _set(kps, "nose", 0.55, 0.32)
    _set(kps, "withers", 0.50, 0.40)
    out = interpret_observable(kps, [0.3, 0.2, 0.7, 0.8], pose_quality=0.5, speed=0.0, truncated=False)
    assert out["pose"]["tail"] == NOT_VISIBLE
    assert out["pose"]["ears"] == NOT_VISIBLE


def test_still_dog_is_low_movement():
    out = interpret_observable(_standing_kps(), [0.22, 0.18, 0.82, 0.88], 0.8, 0.02, False)
    assert out["pose"]["movement"] == "low"


def test_smoother_does_not_flip_on_one_frame():
    s = TemporalSmoother()
    standing = {
        "pose": {"head": "forward", "ears": "forward", "body": "standing", "tail": "raised", "movement": "low"},
        "action": "standing",
        "mood_hint": "alert_curious",
    }
    sitting = {**standing, "action": "sitting", "pose": {**standing["pose"], "body": "sitting"}}
    for _ in range(8):
        s.push(standing)
        action, _ = s.action()
    assert action == "standing"
    s.push(sitting)
    action, _ = s.action()
    assert action == "standing"


def test_timeline_does_not_cycle_sitting_and_mood():
    analyzer = object.__new__(DogAnalyzer)
    session = SessionState()
    for _ in range(20):
        analyzer._timeline(session, "sitting", min_seconds=0.0)
    labels = [event["label"] for event in session.timeline]
    assert labels.count("坐下") == 1
    assert "好奇／警覺" not in labels
    assert labels[0] == "偵測到狗狗"


def test_profile_is_context_not_override():
    pose = {"head": "forward", "ears": NOT_VISIBLE, "body": "sitting", "tail": NOT_VISIBLE, "movement": "high"}
    why, _ = build_why(
        "Mochi",
        pose,
        "sitting",
        INSUFFICIENT,
        [],
        {"name": "Mochi", "traits": ["害羞", "安靜"], "likes": "坐窗邊"},
    )
    assert "資料不足" in why
    assert "害羞" in why or "安靜" in why
    assert "與平日習慣有所不同" in why
    assert "坐下" in why or "身體姿勢" in why
