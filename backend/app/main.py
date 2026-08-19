from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Any

import cv2
import numpy as np
from fastapi import FastAPI, File, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .config import get_settings
from .detector import DogAnalyzer
from .explanation import maybe_llm_explanation, maybe_llm_summary, rule_summary, template_explanation
from .session import SessionState

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("pettalk")

analyzer: DogAnalyzer | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global analyzer
    logger.info("Starting PetTalk Vision backend")
    analyzer = DogAnalyzer()
    yield
    analyzer = None


app = FastAPI(
    title="PetTalk Vision",
    description="Real-time canine detection, pose, and cautious behaviour interpretation.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Profile(BaseModel):
    name: str = "Mochi"
    species: str = "狗狗"
    breed: str = ""
    age: str = "5 歲"
    personality: str = ""
    traits: list[str] = Field(default_factory=list)
    likes: str = ""
    habits: str = ""
    zones: list[dict[str, Any]] = Field(default_factory=list)


class ExplainRequest(BaseModel):
    analysis: dict[str, Any]
    profile: Profile = Field(default_factory=Profile)


class SummaryRequest(BaseModel):
    totals: dict[str, float] = Field(default_factory=dict)
    events: list[dict[str, Any]] = Field(default_factory=list)
    periodStart: float | None = None
    periodEnd: float | None = None
    profile: Profile = Field(default_factory=Profile)


def _require_analyzer() -> DogAnalyzer:
    if analyzer is None:
        raise RuntimeError("Analyzer is not ready yet")
    return analyzer


def _decode_image(data: bytes) -> np.ndarray | None:
    arr = np.frombuffer(data, dtype=np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    return frame


@app.get("/health")
def health() -> dict[str, Any]:
    settings = get_settings()
    ready = analyzer is not None
    return {
        "ok": ready,
        "service": "pettalk-vision",
        "device": getattr(analyzer, "device", None),
        "model": getattr(analyzer, "model_name", None),
        "llmConfigured": bool(settings.openai_api_key.strip()),
        "disclaimer": "此為產品示範，並非獸醫診斷。可能狀態只是根據可觀察線索作出的推測。",
    }


@app.post("/analyze")
async def analyze_frame(file: UploadFile = File(...), name: str = "Mochi") -> dict[str, Any]:
    data = await file.read()
    frame = _decode_image(data)
    if frame is None:
        return {"error": "Could not decode image"}
    engine = _require_analyzer()
    session = SessionState()
    profile = {"name": name, "species": "Dog"}
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, engine.analyze, frame, session, profile)


@app.post("/summarize")
async def summarize(req: SummaryRequest) -> dict[str, str]:
    profile = req.profile.model_dump()
    payload = {
        "totals": req.totals,
        "events": req.events,
        "periodStart": req.periodStart,
        "periodEnd": req.periodEnd,
    }
    llm = await maybe_llm_summary(payload, profile)
    if llm:
        return llm
    return rule_summary(payload, profile)


@app.post("/explain")
async def explain(req: ExplainRequest) -> dict[str, str]:
    profile = req.profile.model_dump()
    llm = await maybe_llm_explanation(req.analysis, profile)
    if llm:
        return llm
    return template_explanation(req.analysis, profile)


@app.websocket("/ws/analyze")
async def ws_analyze(ws: WebSocket) -> None:
    await ws.accept()
    engine = _require_analyzer()
    session = SessionState()
    profile: dict[str, Any] = {
        "name": "Mochi",
        "species": "狗狗",
        "breed": "",
        "age": "5 歲",
        "personality": "",
        "traits": ["害羞", "安靜"],
        "likes": "",
    }
    loop = asyncio.get_running_loop()
    busy = False

    try:
        while True:
            message = await ws.receive()
            if message.get("type") == "websocket.disconnect":
                break

            if message.get("text"):
                import json

                try:
                    payload = json.loads(message["text"])
                except json.JSONDecodeError:
                    continue
                if payload.get("type") == "profile" and isinstance(payload.get("profile"), dict):
                    profile.update(payload["profile"])
                if payload.get("type") == "zones" and isinstance(payload.get("zones"), list):
                    profile["zones"] = payload["zones"]
                if payload.get("type") == "reset":
                    session.reset()
                continue

            data = message.get("bytes")
            if not data:
                continue
            if busy:
                continue
            busy = True
            try:
                frame = _decode_image(data)
                if frame is None:
                    continue
                result = await loop.run_in_executor(None, engine.analyze, frame, session, profile)
                await ws.send_json(result)
            except Exception:
                logger.exception("Frame analysis failed")
            finally:
                busy = False
    except WebSocketDisconnect:
        logger.info("Client disconnected")
    except Exception:
        logger.exception("WebSocket error")
        try:
            await ws.close()
        except Exception:
            pass


if __name__ == "__main__":
    import uvicorn

    settings = get_settings()
    uvicorn.run("app.main:app", host=settings.host, port=settings.port, reload=True)
