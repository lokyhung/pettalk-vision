from __future__ import annotations

from dataclasses import dataclass, field
import time

from .activity import ActivityEngine
from .smoothing import TemporalSmoother


@dataclass
class SessionState:
    started_at: float = field(default_factory=time.monotonic)
    last_centroid: tuple[float, float] | None = None
    last_bbox: list[float] | None = None
    last_ts: float | None = None
    speeds: list[float] = field(default_factory=list)
    centroid_trace: list[tuple[float, float, float]] = field(default_factory=list)
    prev_keypoints: list[dict] | None = None
    head_sign: float | None = None
    smoother: TemporalSmoother = field(default_factory=TemporalSmoother)
    activity_engine: ActivityEngine = field(default_factory=ActivityEngine)
    timeline: list[dict] = field(default_factory=list)
    last_timeline_action: str | None = None
    last_timeline_activity: str | None = None
    last_timeline_mood: str | None = None
    last_timeline_behaviour: str | None = None
    last_timeline_at: float = 0.0
    dog_announced: bool = False
    explanation_revision: int = 0
    last_explained: tuple[str, str, str] | None = None
    prev_move_pts: dict[str, tuple[float, float]] | None = None
    keypoint_speeds: list[float] = field(default_factory=list)
    frame_times: list[float] = field(default_factory=list)
    missed: int = 0
    track_id: int = 0
    track_hits: int = 0

    def elapsed(self) -> float:
        return time.monotonic() - self.started_at

    def reset(self) -> None:
        self.started_at = time.monotonic()
        self.last_centroid = None
        self.last_bbox = None
        self.last_ts = None
        self.speeds = []
        self.centroid_trace = []
        self.prev_keypoints = None
        self.head_sign = None
        self.smoother = TemporalSmoother()
        self.activity_engine = ActivityEngine()
        self.timeline = []
        self.last_timeline_action = None
        self.last_timeline_activity = None
        self.last_timeline_mood = None
        self.last_timeline_behaviour = None
        self.last_timeline_at = 0.0
        self.dog_announced = False
        self.explanation_revision = 0
        self.last_explained = None
        self.prev_move_pts = None
        self.keypoint_speeds = []
        self.frame_times = []
        self.missed = 0
        self.track_id += 1
        self.track_hits = 0
