"""Template explanations in Traditional Chinese, plus an optional LLM that must never break the demo."""

from __future__ import annotations

import logging
from typing import Any

from .config import get_settings

logger = logging.getLogger(__name__)


def template_explanation(analysis: dict[str, Any], profile: dict[str, Any] | None = None) -> dict[str, str]:
    why = analysis.get("why") or ""
    observe = analysis.get("observeNext") or ""
    return {
        "whyPetTalkThinksThis": why.strip(),
        "whatYouCanObserveNext": observe,
        "source": "rules",
    }


async def maybe_llm_summary(
    payload: dict[str, Any],
    profile: dict[str, Any] | None = None,
) -> dict[str, str] | None:
    settings = get_settings()
    key = (settings.openai_api_key or "").strip()
    if not key:
        return None
    name = (profile or {}).get("name") or "豆豆"
    prompt = (
        "你正在為香港寵物主人撰寫家居鏡頭 10 分鐘摘要，必須使用香港繁體中文。"
        "只可使用提供的活動事件，不可發明未出現的活動。"
        "不可診斷健康或讀心。用「可能」「值得留意」。"
        "第一段：過去 10 分鐘摘要。第二段：值得留意（若沒有則寫沒有特別需要留意的地方）。\n"
        f"寵物資料：{profile}\n"
        f"結構化活動：{payload}"
    )
    try:
        import httpx

        async with httpx.AsyncClient(timeout=8.0) as client:
            res = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {key}"},
                json={
                    "model": settings.openai_model,
                    "messages": [
                        {
                            "role": "system",
                            "content": "你根據結構化活動事件寫謹慎的寵物家居摘要。不可發明事件。",
                        },
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.3,
                    "max_tokens": 280,
                },
            )
            res.raise_for_status()
            text = res.json()["choices"][0]["message"]["content"].strip()
        parts = [p.strip() for p in text.split("\n") if p.strip()]
        return {
            "summary": parts[0] if parts else "",
            "notice": parts[1] if len(parts) > 1 else "",
            "source": "llm",
        }
    except Exception as exc:  # noqa: BLE001
        logger.info("LLM summary skipped: %s", exc)
        return None


def _as_seconds(value: float) -> float:
    return value / 1000.0 if value >= 10_000 else value


def rule_summary(payload: dict[str, Any], profile: dict[str, Any] | None = None) -> dict[str, str]:
    name = (profile or {}).get("name") or "豆豆"
    totals: dict[str, float] = payload.get("totals") or {}
    labels = {
        "resting": "休息",
        "exploring": "走動／探索",
        "playing": "玩耍",
        "active": "活動中",
        "eating": "可能進食",
        "drinking": "可能飲水",
        "door_waiting": "門口停留",
        "following": "可能正在跟隨",
        "waiting": "靜止／等待",
    }
    if not totals:
        return {
            "summary": f"累積足夠資料後，PetTalk 會提供{name}的活動摘要。",
            "notice": "正在建立活動紀錄。",
            "source": "rules",
        }
    ranked = sorted(totals.items(), key=lambda kv: kv[1], reverse=True)
    secs = {k: _as_seconds(v) for k, v in totals.items()}
    total = sum(secs.values())
    moving = secs.get("exploring", 0) + secs.get("active", 0) + secs.get("playing", 0) + secs.get("following", 0)
    rest = secs.get("resting", 0) + secs.get("waiting", 0)
    main_id, _ = ranked[0]
    if total > 0 and moving >= total * 0.22 and rest >= total * 0.22:
        summary = f"{name}過去 10 分鐘活動量中等，期間曾約 {max(1, round(moving / 60))} 分鐘持續活動及改變位置，其餘時間主要休息。"
    elif total > 0 and moving >= total * 0.45:
        summary = f"{name}過去 10 分鐘活動量偏高，期間主要在走動、探索或活動中。"
    else:
        summary = f"{name}過去 10 分鐘主要在{labels.get(main_id, main_id)}。"
        bits = [f"{labels.get(k, k)}約 {max(1, round(v / 60))} 分鐘" for k, v in secs.items() if v >= 20]
        if len(bits) > 1:
            summary += "期間曾" + "，".join(bits[1:]) + "。"
    notice = ""
    door = secs.get("door_waiting") or 0
    if door >= 20:
        notice = f"{name}曾在門口停留約 {int(door)} 秒。如果這種行為近期經常出現，可以留意牠是否在等待主人回家。"
    traits = profile.get("traits") if profile else []
    lively = isinstance(traits, list) and "活潑" in traits
    if lively and main_id == "resting" and moving < 60:
        extra = f"{name}的資料標明較為活潑，而這段時間活動量偏低，只作背景參考，並不能證明身體不適。"
        notice = (notice + " " + extra).strip()
    if not notice:
        notice = "這段時間未見到特別需要主人即時留意的情況。"
    return {"summary": summary, "notice": notice, "source": "rules"}


async def maybe_llm_explanation(
    analysis: dict[str, Any],
    profile: dict[str, Any] | None = None,
) -> dict[str, str] | None:
    settings = get_settings()
    key = (settings.openai_api_key or "").strip()
    if not key:
        return None

    name = (profile or {}).get("name") or "Mochi"
    pose = analysis.get("pose") or {}
    action = analysis.get("action") or {}
    mood = analysis.get("mood") or {}
    cues = analysis.get("cues") or []

    prompt = (
        "你正在為香港用戶撰寫謹慎的寵物電腦視覺說明，必須使用香港繁體中文。"
        "不可聲稱知道狗狗的真實情緒或健康狀況。"
        "請使用「可能表示」「可能與……一致」「值得留意」等措辭。"
        "寵物資料只可作為背景，不可覆蓋或改寫電腦視覺偵測結果。"
        "若活動量與性格紀錄明顯不同，可以提醒主人留意，但仍須寫成推測。\n"
        "請寫兩段短文：\n"
        "1) 分析原因（只根據可觀察訊號）\n"
        "2) 建議留意\n"
        f"名字：{name}。資料：{profile}。\n"
        f"姿勢：{pose}。動作：{action}。可能狀態：{mood}。線索：{cues}。"
    )

    try:
        import httpx

        payload = {
            "model": settings.openai_model,
            "messages": [
                {
                    "role": "system",
                    "content": "你用香港繁體中文解釋寵物姿勢觀察。不可診斷，不可讀心。",
                },
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.4,
            "max_tokens": 220,
        }
        async with httpx.AsyncClient(timeout=8.0) as client:
            res = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {key}"},
                json=payload,
            )
            res.raise_for_status()
            text = res.json()["choices"][0]["message"]["content"].strip()
        parts = [p.strip() for p in text.split("\n") if p.strip()]
        why = parts[0] if parts else analysis.get("why", "")
        nxt = parts[1] if len(parts) > 1 else analysis.get("observeNext", "")
        return {
            "whyPetTalkThinksThis": why,
            "whatYouCanObserveNext": nxt,
            "source": "llm",
        }
    except Exception as exc:  # noqa: BLE001
        logger.info("LLM explanation skipped: %s", exc)
        return None
