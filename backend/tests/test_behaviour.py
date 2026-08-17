from app.behaviour import interpret
from app.keypoints import empty_keypoints, NAME_TO_INDEX


def _set(kps, name, x, y, conf=0.8):
    i = NAME_TO_INDEX[name]
    kps[i] = {"name": name, "x": x, "y": y, "confidence": conf, "visible": True}


def test_standing_alert_possible_mood():
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

    out = interpret(kps, [0.22, 0.18, 0.82, 0.88], pose_quality=0.8, speed=0.01, truncated=False)
    assert out["pose"]["body"] in {"Standing", "Play bow"}
    assert out["action"]["label"] != "Insufficient visual evidence"
    assert "possible" in out["why"].lower() or "may be" in out["why"].lower()


def test_insufficient_when_quality_low():
    kps = empty_keypoints()
    out = interpret(kps, [0.2, 0.2, 0.4, 0.4], pose_quality=0.1, speed=0.0, truncated=True)
    assert out["action"]["label"] == "Insufficient visual evidence"


def test_sitting_forward_possible_alert():
    kps = empty_keypoints()
    _set(kps, "nose", 0.55, 0.32)
    _set(kps, "chin", 0.55, 0.38)
    _set(kps, "throat", 0.55, 0.42)
    _set(kps, "withers", 0.50, 0.48)
    _set(kps, "tail_start", 0.48, 0.62)
    _set(kps, "tail_end", 0.48, 0.78)
    _set(kps, "left_ear_tip", 0.48, 0.22)
    _set(kps, "right_ear_tip", 0.62, 0.22)
    _set(kps, "left_ear_base", 0.50, 0.28)
    _set(kps, "right_ear_base", 0.60, 0.28)
    _set(kps, "front_left_paw", 0.46, 0.78)
    _set(kps, "front_right_paw", 0.62, 0.78)
    _set(kps, "rear_left_paw", 0.48, 0.80)
    _set(kps, "rear_right_paw", 0.58, 0.80)
    _set(kps, "front_left_elbow", 0.46, 0.58)
    _set(kps, "front_right_elbow", 0.62, 0.58)
    _set(kps, "rear_left_elbow", 0.48, 0.72)
    _set(kps, "rear_right_elbow", 0.58, 0.72)
    out = interpret(kps, [0.3, 0.18, 0.75, 0.88], pose_quality=0.8, speed=0.01, truncated=False)
    assert out["pose"]["body"] in {"Sitting", "Standing"}
    assert "may be" in out["why"].lower() or "possible" in out["why"].lower()
