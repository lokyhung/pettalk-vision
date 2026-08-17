from __future__ import annotations

from dataclasses import dataclass, field
import time


@dataclass
class SessionState:
    started_at: float = field(default_factory=time.monotonic)
    last_centroid: tuple[float, float] | None = None
    last_ts: float | None = None
    speeds: list[float] = field(default_factory=list)
    prev_keypoints: list[dict] | None = None
    head_sign: float | None = None
    pending_action: str | None = None
    pending_action_count: int = 0
    stable_action: str | None = None
    pending_mood: str | None = None
    pending_mood_count: int = 0
    stable_mood: str | None = None
    timeline: list[dict] = field(default_factory=list)
    dog_announced: bool = False

    def elapsed(self) -> float:
        return time.monotonic() - self.started_at
