"""IoU tracking helpers — identity across frames, raw YOLO confidence unchanged."""

from app.detector import _iou, _select_tracked_dog
import numpy as np


def test_iou_overlap():
    a = [0.1, 0.1, 0.5, 0.5]
    b = [0.3, 0.3, 0.7, 0.7]
    assert 0.1 < _iou(a, b) < 0.5
    assert _iou(a, a) == 1.0
    assert _iou(a, [0.9, 0.9, 1.0, 1.0]) == 0.0


def test_tracker_prefers_overlapping_box_not_higher_conf_stranger():
    xyxyn = np.array(
        [
            [0.10, 0.20, 0.40, 0.70],
            [0.60, 0.20, 0.90, 0.70],
        ],
        dtype=float,
    )
    prev = [0.12, 0.22, 0.38, 0.68]
    dogs = [(0, 0.72), (1, 0.94)]
    idx, conf, iou = _select_tracked_dog(dogs, xyxyn, prev, 0.15)
    assert idx == 0
    assert conf == 0.72
    assert iou > 0.5
