"""Template explanations, with an optional OpenAI layer that must never break the demo."""

from __future__ import annotations

import logging
from typing import Any

from .config import get_settings

logger = logging.getLogger(__name__)


def template_explanation(analysis: dict[str, Any], profile: dict[str, Any] | None = None) -> dict[str, str]:
    name = (profile or {}).get("name") or "your dog"
    personality = (profile or {}).get("personality") or ""
    why = analysis.get("why") or ""
    observe = analysis.get("observeNext") or ""
    extra = ""
    if personality:
        extra = (
            f" {name}'s listed personality ({personality}) is background context only "
            "and was not used as proof of an emotional state."
        )
    return {
        "whyPetTalkThinksThis": why + extra,
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
        "You are writing a cautious computer-vision product explanation. "
        "Never claim you know the dog's true emotions or medical state. "
        "Use phrases like 'may be consistent with', 'possible mood', and 'based on observed cues'. "
        "Write two short paragraphs.\n"
        "1) Why PetTalk thinks this (based only on the signals).\n"
        "2) What the viewer can observe next.\n"
        f"Dog name: {name}. Profile: {profile}.\n"
        f"Pose: {pose}. Action: {action}. Possible mood: {mood}. Cues: {cues}."
    )

    try:
        import httpx

        payload = {
            "model": settings.openai_model,
            "messages": [
                {
                    "role": "system",
                    "content": "You explain pet posture observations carefully. No diagnosis. No mind-reading.",
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
    except Exception as exc:  # noqa: BLE001 — optional path must never crash the demo
        logger.info("LLM explanation skipped: %s", exc)
        return None
