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

    # Local default stays loopback. Production/Docker CMD binds 0.0.0.0 explicitly.
    # Railway sets PORT; pydantic maps env PORT → port.
    host: str = "127.0.0.1"
    port: int = 8000
    analysis_imgsz: int = 640
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    custom_pose_model: str = ""
    # Comma-separated origins, or "*" for prototype. Example:
    # CORS_ORIGINS=https://pettalk.vercel.app,http://127.0.0.1:5173
    cors_origins: str = "*"

    # Single source of truth for detection / pose / smoothing.
    dog_detection_threshold: float = 0.55
    dog_predict_conf: float = 0.35
    track_iou_min: float = 0.15
    keypoint_conf_threshold: float = 0.42
    pose_quality_threshold: float = 0.40
    temporal_window: int = 14
    action_switch_frames: int = 6
    walking_switch_frames: int = 8
    mood_switch_frames: int = 6
    timeline_min_seconds: float = 1.4
    activity_min_seconds: float = 4.0
    movement_low: float = 0.045
    movement_high: float = 0.12

    # Temporal activity engine (posture ≠ activity).
    activity_sample_interval: float = 0.5
    activity_window_samples: int = 8
    activity_keypoint_conf: float = 0.50
    movement_weight_global: float = 0.40
    movement_weight_head: float = 0.20
    movement_weight_front: float = 0.15
    movement_weight_rear: float = 0.15
    movement_weight_orient: float = 0.10
    movement_score_gain: float = 1.0
    movement_global_ref: float = 0.12
    movement_head_ref: float = 0.05
    movement_limb_ref: float = 0.06
    movement_low_threshold: float = 0.15
    movement_medium_threshold: float = 0.35
    resting_enter_seconds: float = 3.0
    resting_leave_seconds: float = 1.0
    active_enter_seconds: float = 1.5


@lru_cache
def get_settings() -> Settings:
    return Settings()
