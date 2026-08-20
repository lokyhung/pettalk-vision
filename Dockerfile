# Fallback when Railway Root Directory is the repo root (not `backend/`).
# Prefer setting Root Directory = backend and using backend/Dockerfile.
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000 \
    HOST=0.0.0.0 \
    YOLO_CONFIG_DIR=/app/Ultralytics \
    MPLCONFIGDIR=/app/Ultralytics/mpl \
    TORCH_HOME=/app/.cache/torch \
    ULTRALYTICS_HOME=/app/Ultralytics

WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libgl1 \
      libglib2.0-0 \
      libgomp1 \
      curl \
 && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --upgrade pip \
 && pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu \
 && pip install -r requirements.txt

COPY backend/scripts/prefetch_model.py ./scripts/prefetch_model.py
RUN mkdir -p models Ultralytics/mpl .cache/torch \
 && python scripts/prefetch_model.py \
 && ls -lh models/

COPY backend/app ./app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-8000}/health" || exit 1

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
