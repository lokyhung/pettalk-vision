from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(ROOT_DIR / ".env", BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    host: str = "127.0.0.1"
    port: int = 8000
    analysis_imgsz: int = 480
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    custom_pose_model: str = ""

    # Single source of truth for detection / pose / smoothing.
    dog_detection_threshold: float = 0.55
    keypoint_conf_threshold: float = 0.42
    pose_quality_threshold: float = 0.40
    temporal_window: int = 14
    action_switch_frames: int = 6
    walking_switch_frames: int = 8
    mood_switch_frames: int = 6
    timeline_min_seconds: float = 1.4
    movement_low: float = 0.045
    movement_high: float = 0.12


@lru_cache
def get_settings() -> Settings:
    return Settings()
