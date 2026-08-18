"""Temporal majority voting so one noisy frame cannot flip the dashboard."""

from __future__ import annotations

from collections import Counter, deque
from typing import Any

from .config import get_settings
from .i18n import ANALYSING, INSUFFICIENT, NOT_VISIBLE


def _majority(values: list[str], *, min_ratio: float, min_count: int, default: str) -> tuple[str, float]:
    usable = [v for v in values if v]
    if len(usable) < min_count:
        return default, 0.0
    label, count = Counter(usable).most_common(1)[0]
    ratio = count / len(usable)
    if ratio < min_ratio:
        return default, round(ratio, 3)
    return label, round(ratio, 3)


class TemporalSmoother:
    def __init__(self) -> None:
        settings = get_settings()
        self.window = settings.temporal_window
        self.action_frames = settings.action_switch_frames
        self.walking_frames = settings.walking_switch_frames
        self.mood_frames = settings.mood_switch_frames
        self._raw: deque[dict[str, Any]] = deque(maxlen=self.window)
        self.stable_action: str = ANALYSING
        self.stable_mood: str = INSUFFICIENT
        self._pending_action: str | None = None
        self._pending_action_n = 0
        self._pending_mood: str | None = None
        self._pending_mood_n = 0

    def push(self, observation: dict[str, Any]) -> None:
        self._raw.append(observation)

    def __len__(self) -> int:
        return len(self._raw)

    def pose_field(self, key: str) -> tuple[str, float]:
        values = [row["pose"][key] for row in self._raw]
        default = NOT_VISIBLE if key in {"head", "ears", "tail"} else INSUFFICIENT
        if key == "movement":
            default = INSUFFICIENT
        min_count = 4 if len(self._raw) >= 4 else max(1, len(self._raw))
        return _majority(values, min_ratio=0.5, min_count=min_count, default=default)

    def action(self) -> tuple[str, float]:
        values = [row["action"] for row in self._raw]
        min_count = min(self.action_frames, max(3, len(self._raw)))
        voted, ratio = _majority(values, min_ratio=0.5, min_count=min_count, default=ANALYSING)
        if voted == "walking":
            voted, ratio = _majority(
                values, min_ratio=0.62, min_count=min(self.walking_frames, len(self._raw)), default=ANALYSING
            )
        needed = self.walking_frames if voted == "walking" else self.action_frames
        if self._pending_action == voted:
            self._pending_action_n += 1
        else:
            self._pending_action = voted
            self._pending_action_n = 1
        if self._pending_action_n >= needed:
            self.stable_action = voted
        return self.stable_action, ratio

    def lock_mood(self, candidate: str) -> tuple[str, float]:
        values = [row.get("mood_hint", INSUFFICIENT) for row in self._raw]
        voted, ratio = _majority(
            values,
            min_ratio=0.5,
            min_count=min(self.mood_frames, max(3, len(self._raw))),
            default=INSUFFICIENT,
        )
        if candidate != INSUFFICIENT:
            voted = candidate if voted in (INSUFFICIENT, candidate) else voted
        if self._pending_mood == voted:
            self._pending_mood_n += 1
        else:
            self._pending_mood = voted
            self._pending_mood_n = 1
        if self._pending_mood_n >= self.mood_frames:
            self.stable_mood = voted
        return self.stable_mood, ratio

    def debug_counts(self) -> dict[str, int | float | str]:
        matching = sum(1 for row in self._raw if row.get("action") == self.stable_action)
        return {
            "window": self.window,
            "framesUsed": len(self._raw),
            "stableFrames": matching,
            "stableAction": self.stable_action,
            "actionPending": self._pending_action_n,
        }
