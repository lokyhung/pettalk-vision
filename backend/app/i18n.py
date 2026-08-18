"""Traditional Chinese (Hong Kong) display labels for API payloads."""

from __future__ import annotations

INSUFFICIENT = "insufficient"
NOT_VISIBLE = "not_visible"
ANALYSING = "analysing"

POSE_LABELS = {
    "standing": "站立",
    "sitting": "坐下",
    "lying": "躺下",
    "play_bow": "玩耍鞠躬",
    "forward": "向前",
    "left": "向左",
    "right": "向右",
    "down": "向下",
    "back": "向後",
    "neutral": "自然",
    "raised": "向上",
    "lowered": "向下",
    "low": "低",
    "medium": "中",
    "high": "高",
    INSUFFICIENT: "資料不足",
    NOT_VISIBLE: "不可見",
    ANALYSING: "分析中",
}

ACTION_LABELS = {
    "standing": "站立",
    "sitting": "坐下",
    "lying": "躺下",
    "walking": "移動",
    "play_bow": "玩耍鞠躬",
    ANALYSING: "分析中",
    INSUFFICIENT: "資料不足",
}

ACTION_ICONS = {
    "standing": "🧍",
    "sitting": "🐕",
    "lying": "😌",
    "walking": "🚶",
    "play_bow": "🎾",
    ANALYSING: "◌",
    INSUFFICIENT: "◌",
}

MOOD_LABELS = {
    "alert_curious": "好奇／警覺",
    "relaxed": "放鬆",
    "playful": "活潑／玩耍",
    "stress_fear": "可能緊張／害怕",
    "defensive": "可能防備",
    INSUFFICIENT: "資料不足",
    ANALYSING: "分析中",
}

MOOD_ICONS = {
    "alert_curious": "😊",
    "relaxed": "😌",
    "playful": "🎾",
    "stress_fear": "😟",
    "defensive": "🛡️",
    INSUFFICIENT: "◌",
    ANALYSING: "◌",
}

BEHAVIOUR_LABELS = {
    "attentive": "注意／觀察",
    "playful": "活躍／玩耍",
    "moving": "移動",
    ANALYSING: "分析中",
    INSUFFICIENT: "資料不足",
}

BEHAVIOUR_ICONS = {
    "attentive": "👀",
    "playful": "🎾",
    "moving": "🚶",
    ANALYSING: "◌",
    INSUFFICIENT: "◌",
}

STATE_MESSAGES = {
    "no_dog": ("未偵測到狗狗", "請將狗狗移入畫面。"),
    "detected": ("偵測到狗狗", "正在收集身體姿勢線索。"),
    "pose": ("姿勢追蹤中", "骨架已對準偵測到的狗狗。"),
    "behaviour": ("可能行為", "以下解讀只根據可觀察線索，並非情緒診斷。"),
    "insufficient": ("資料不足", "請讓寵物完整進入畫面，並保持較清楚的側面或全身角度。"),
    "analysing": ("分析中", "需要連續數幀穩定線索才會作出判斷。"),
    "idle": ("等待偵測", "請啟動鏡頭或使用示範影片。"),
}


def pose_label(code: str) -> str:
    return POSE_LABELS.get(code, POSE_LABELS[INSUFFICIENT])


def action_pack(code: str, confidence: float) -> dict:
    return {
        "id": code,
        "label": ACTION_LABELS.get(code, ACTION_LABELS[INSUFFICIENT]),
        "confidence": round(float(confidence), 3),
        "icon": ACTION_ICONS.get(code, "◌"),
    }


def behaviour_pack(code: str, confidence: float) -> dict:
    return {
        "id": code,
        "label": BEHAVIOUR_LABELS.get(code, BEHAVIOUR_LABELS[INSUFFICIENT]),
        "confidence": round(float(confidence), 3),
        "icon": BEHAVIOUR_ICONS.get(code, "◌"),
    }


def mood_pack(code: str, confidence: float) -> dict:
    return {
        "id": code,
        "label": MOOD_LABELS.get(code, MOOD_LABELS[INSUFFICIENT]),
        "confidence": round(float(confidence), 3),
        "icon": MOOD_ICONS.get(code, "◌"),
    }


def pose_pack(pose: dict[str, str]) -> dict[str, dict[str, str]]:
    out = {}
    for key, code in pose.items():
        out[key] = {"id": code, "label": pose_label(code)}
    return out
