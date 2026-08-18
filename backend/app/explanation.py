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
