"""Canonical 24-point dog skeleton used by Ultralytics Dog-Pose / Stanford Extra."""

from __future__ import annotations

KEYPOINT_NAMES: list[str] = [
    "front_left_paw",
    "front_left_knee",
    "front_left_elbow",
    "rear_left_paw",
    "rear_left_knee",
    "rear_left_elbow",
    "front_right_paw",
    "front_right_knee",
    "front_right_elbow",
    "rear_right_paw",
    "rear_right_knee",
    "rear_right_elbow",
    "tail_start",
    "tail_end",
    "left_ear_base",
    "right_ear_base",
    "nose",
    "chin",
    "left_ear_tip",
    "right_ear_tip",
    "left_eye",
    "right_eye",
    "withers",
    "throat",
]

NAME_TO_INDEX = {name: i for i, name in enumerate(KEYPOINT_NAMES)}

SKELETON: list[tuple[str, str]] = [
    ("front_left_paw", "front_left_knee"),
    ("front_left_knee", "front_left_elbow"),
    ("front_left_elbow", "withers"),
    ("front_right_paw", "front_right_knee"),
    ("front_right_knee", "front_right_elbow"),
    ("front_right_elbow", "withers"),
    ("rear_left_paw", "rear_left_knee"),
    ("rear_left_knee", "rear_left_elbow"),
    ("rear_left_elbow", "tail_start"),
    ("rear_right_paw", "rear_right_knee"),
    ("rear_right_knee", "rear_right_elbow"),
    ("rear_right_elbow", "tail_start"),
    ("tail_start", "tail_end"),
    ("withers", "tail_start"),
    ("withers", "throat"),
    ("throat", "chin"),
    ("chin", "nose"),
    ("throat", "nose"),
    ("nose", "left_eye"),
    ("nose", "right_eye"),
    ("left_eye", "left_ear_base"),
    ("right_eye", "right_ear_base"),
    ("left_ear_base", "left_ear_tip"),
    ("right_ear_base", "right_ear_tip"),
]

SKELETON_INDEX = [
    (NAME_TO_INDEX[a], NAME_TO_INDEX[b]) for a, b in SKELETON
]


def empty_keypoints() -> list[dict]:
    return [
        {
            "name": name,
            "x": 0.0,
            "y": 0.0,
            "confidence": 0.0,
            "visible": False,
        }
        for name in KEYPOINT_NAMES
    ]
