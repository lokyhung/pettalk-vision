# PetTalk Vision backend — Railway / production image
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

# OpenCV headless runtime deps
RUN apt-get update && apt-get install -y --no-install-recommends \
      libgl1 \
      libglib2.0-0 \
      libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# CPU PyTorch first (Railway has no MPS/CUDA), then app deps
COPY requirements.txt .
RUN pip install --upgrade pip \
 && pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu \
 && pip install -r requirements.txt

# Prefetch YOLO nano-seg weights into models/ (not committed to git)
RUN mkdir -p models Ultralytics/mpl .cache/torch \
 && python - <<'PY'
from pathlib import Path
from ultralytics import YOLO

models = Path("models")
models.mkdir(exist_ok=True)
target = models / "yolo11n-seg.pt"
YOLO("yolo11n-seg.pt")  # downloads if missing
candidates = [
    Path("yolo11n-seg.pt"),
    target,
    *Path(".").rglob("yolo11n-seg.pt"),
    *Path("/root").rglob("yolo11n-seg.pt"),
]
for src in candidates:
    if src.is_file() and src.resolve() != target.resolve():
        target.write_bytes(src.read_bytes())
        break
if not target.is_file():
    raise SystemExit("yolo11n-seg.pt was not downloaded into models/")
print("model ready:", target, "bytes=", target.stat().st_size)
PY
 && ls -lh models/

COPY app ./app

EXPOSE 8000

# Railway injects PORT; fall back to 8000 for local docker runs
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
