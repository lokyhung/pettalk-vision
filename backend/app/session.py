from __future__ import annotations

from dataclasses import dataclass, field
import time

from .smoothing import TemporalSmoother


@dataclass
class SessionState:
    started_at: float = field(default_factory=time.monotonic)
    last_centroid: tuple[float, float] | None = None
    last_ts: float | None = None
    speeds: list[float] = field(default_factory=list)
    centroid_trace: list[tuple[float, float, float]] = field(default_factory=list)
    prev_keypoints: list[dict] | None = None
    head_sign: float | None = None
    smoother: TemporalSmoother = field(default_factory=TemporalSmoother)
    timeline: list[dict] = field(default_factory=list)
    last_timeline_action: str | None = None
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

    def elapsed(self) -> float:
        return time.monotonic() - self.started_at
