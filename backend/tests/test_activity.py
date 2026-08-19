from app.activity import ActivityEngine, classify_activity
from app.i18n import ANALYSING, INSUFFICIENT
from app.keypoints import empty_keypoints, NAME_TO_INDEX


def _kps(shift_head: float = 0.0, shift_body: float = 0.0) -> list[dict]:
    keypoints = empty_keypoints()
    layout = {
        "nose": (0.52, 0.38),
        "chin": (0.52, 0.42),
        "throat": (0.50, 0.46),
        "left_eye": (0.49, 0.36),
        "right_eye": (0.55, 0.36),
        "left_ear_tip": (0.46, 0.30),
        "right_ear_tip": (0.58, 0.30),
        "left_ear_base": (0.48, 0.34),
        "right_ear_base": (0.56, 0.34),
        "withers": (0.48, 0.50),
        "front_left_paw": (0.42, 0.70),
        "front_right_paw": (0.54, 0.70),
        "front_left_knee": (0.43, 0.62),
        "front_right_knee": (0.53, 0.62),
        "front_left_elbow": (0.44, 0.56),
        "front_right_elbow": (0.52, 0.56),
        "tail_start": (0.38, 0.58),
        "tail_end": (0.32, 0.62),
        "rear_left_paw": (0.34, 0.74),
        "rear_right_paw": (0.42, 0.74),
        "rear_left_knee": (0.35, 0.66),
        "rear_right_knee": (0.41, 0.66),
        "rear_left_elbow": (0.36, 0.60),
        "rear_right_elbow": (0.40, 0.60),
    }
    for name, (x, y) in layout.items():
        i = NAME_TO_INDEX[name]
        dx = shift_head if name in {
            "nose", "chin", "throat", "left_eye", "right_eye",
            "left_ear_tip", "right_ear_tip", "left_ear_base", "right_ear_base",
        } else shift_body
        keypoints[i] = {
            "name": name,
            "x": x + dx,
            "y": y,
            "confidence": 0.9,
            "visible": True,
        }
    return keypoints


def _run(engine: ActivityEngine, steps: list[dict], start: float = 10.0) -> dict:
    result = {}
    now = start
    for step in steps:
        result = engine.observe(
            now=now,
            present=step.get("present", True),
            bbox=step.get("bbox", [0.25, 0.30, 0.75, 0.85]),
            keypoints=step.get("keypoints", _kps()),
            posture=step.get("posture", "lying"),
            action=step.get("action", "lying"),
            objects=step.get("objects", []),
            zone=step.get("zone"),
        )
        now += step.get("dt", 0.5)
    return result


def test_lying_low_movement_is_resting():
    code, evidence, conf = classify_activity(
        present=True,
        action="lying",
        pose={"head": "forward", "movement": "low", "body": "lying"},
        objects=[],
        zone=None,
    )
    assert code == "resting"
    assert conf > 0.5


def test_walking_is_exploring_not_playing():
    code, _, _ = classify_activity(
        present=True,
        action="walking",
        pose={"head": "forward", "movement": "high", "body": "standing"},
        objects=[],
        zone=None,
    )
    assert code == "exploring"


def test_high_movement_without_walk_is_active_not_playing():
    code, _, _ = classify_activity(
        present=True,
        action="sitting",
        pose={"head": "forward", "movement": "high", "body": "sitting"},
        objects=[],
        zone=None,
    )
    assert code == "active"
    assert code != "playing"


def test_play_bow_is_playing():
    code, _, _ = classify_activity(
        present=True,
        action="play_bow",
        pose={"head": "forward", "movement": "medium", "body": "play_bow"},
        objects=[],
        zone=None,
    )
    assert code == "playing"


def test_door_zone_is_waiting():
    code, _, _ = classify_activity(
        present=True,
        action="sitting",
        pose={"head": "forward", "movement": "low", "body": "sitting"},
        objects=[],
        zone={"type": "door", "name": "門口"},
    )
    assert code == "door_waiting"


def test_person_and_walking_is_exploring_not_following():
    code, _, _ = classify_activity(
        present=True,
        action="walking",
        pose={"head": "forward", "movement": "high", "body": "standing"},
        objects=[{"id": "person", "label": "人"}],
        zone=None,
    )
    assert code == "exploring"
    assert code != "following"


def test_no_dog_is_insufficient():
    code, _, conf = classify_activity(
        present=False,
        action=ANALYSING,
        pose={},
        objects=[],
        zone=None,
    )
    assert code == INSUFFICIENT
    assert conf == 0.0


def test_lying_with_head_motion_is_active_not_resting():
    engine = ActivityEngine()
    still = [{"keypoints": _kps(), "posture": "lying", "action": "lying"} for _ in range(4)]
    chewing = [
        {"keypoints": _kps(shift_head=0.04 * ((i % 2) * 2 - 1)), "posture": "lying", "action": "lying"}
        for i in range(10)
    ]
    result = _run(engine, still + chewing)
    assert result["id"] == "active"
    assert result["id"] != "resting"
    assert result["movement"]["headBand"] in {"medium", "high"}


def test_still_lying_becomes_resting():
    engine = ActivityEngine()
    steps = [{"keypoints": _kps(), "posture": "lying", "action": "lying"} for _ in range(14)]
    result = _run(engine, steps)
    assert result["id"] == "resting"


def test_walking_bbox_becomes_exploring():
    engine = ActivityEngine()
    steps = []
    for i in range(12):
        x = 0.10 + i * 0.05
        steps.append(
            {
                "bbox": [x, 0.30, x + 0.40, 0.85],
                "keypoints": _kps(shift_body=i * 0.05),
                "posture": "standing",
                "action": "walking",
            }
        )
    result = _run(engine, steps)
    assert result["id"] in {"exploring", "active"}
    assert result["id"] != "resting"


def test_food_zone_and_repeated_head_motion_can_be_eating():
    engine = ActivityEngine()
    zone = {"type": "food", "name": "飲食區"}
    steps = [
        {
            "keypoints": _kps(shift_head=0.04 * ((i % 2) * 2 - 1)),
            "posture": "lying",
            "action": "lying",
            "zone": zone,
        }
        for i in range(12)
    ]
    result = _run(engine, steps)
    assert result["id"] in {"eating", "active"}
    assert result["id"] != "resting"


def test_standing_still_is_waiting_not_exploring():
    code, _, _ = classify_activity(
        present=True,
        action="standing",
        pose={"head": "forward", "movement": "low", "body": "standing"},
        objects=[],
        zone=None,
    )
    assert code == "waiting"


def test_ball_nearby_with_movement_is_playing():
    code, evidence, _ = classify_activity(
        present=True,
        action="sitting",
        pose={"head": "forward", "movement": "high", "body": "sitting"},
        objects=[{"id": "sports_ball", "label": "球", "bbox": [0.40, 0.40, 0.62, 0.62]}],
        zone=None,
        bbox=[0.25, 0.30, 0.75, 0.85],
    )
    assert code == "playing"
    assert any("球" in line or "玩具" in line for line in evidence)


def test_bowl_nearby_with_head_motion_can_be_eating():
    code, evidence, _ = classify_activity(
        present=True,
        action="lying",
        pose={"head": "down", "movement": "low", "body": "lying"},
        objects=[{"id": "bowl", "label": "碗", "bbox": [0.48, 0.55, 0.70, 0.80]}],
        zone=None,
        bbox=[0.25, 0.30, 0.75, 0.85],
        head_move=0.4,
        global_move=0.05,
        movement_score=0.18,
    )
    assert code == "eating"
    assert any("碗" in line or "容器" in line for line in evidence)


def test_low_global_with_local_motion_is_not_resting():
    code, evidence, _ = classify_activity(
        present=True,
        action="lying",
        pose={"head": "forward", "movement": "low", "body": "lying"},
        objects=[],
        zone=None,
        movement_score=0.08,
        head_move=0.45,
        global_move=0.05,
    )
    assert code != "resting"
    assert code in {"active", "eating"}


def test_standing_low_global_with_head_motion_is_not_waiting():
    code, _, _ = classify_activity(
        present=True,
        action="standing",
        pose={"head": "down", "movement": "low", "body": "standing"},
        objects=[{"id": "cup", "label": "杯", "bbox": [0.4, 0.5, 0.7, 0.8]}],
        zone=None,
        bbox=[0.25, 0.30, 0.75, 0.85],
        movement_score=0.12,
        head_move=0.5,
        global_move=0.08,
    )
    assert code == "eating"


def test_engine_leaves_resting_when_movement_stays_high():
    engine = ActivityEngine()
    rest = [{"keypoints": _kps(), "posture": "lying", "action": "lying"} for _ in range(12)]
    _run(engine, rest)
    moving = []
    for i in range(10):
        x = 0.20 + i * 0.04
        moving.append(
            {
                "bbox": [x, 0.30, x + 0.45, 0.85],
                "keypoints": _kps(shift_body=i * 0.04),
                "posture": "lying",
                "action": "lying",
            }
        )
    result = _run(engine, moving, start=20.0)
    assert result["id"] != "resting"
    assert result["id"] in {"active", "exploring"}


def test_bbox_motion_without_keypoints_is_not_resting():
    engine = ActivityEngine()
    empty = empty_keypoints()
    steps = []
    for i in range(12):
        x = 0.10 + i * 0.04
        steps.append(
            {
                "bbox": [x, 0.30, x + 0.45, 0.85],
                "keypoints": empty,
                "posture": "lying",
                "action": "lying",
            }
        )
    result = _run(engine, steps)
    assert result["id"] != "resting"
