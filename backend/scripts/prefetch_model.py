"""Download YOLO weights into models/ for Docker/Railway images."""

from __future__ import annotations

from pathlib import Path


def main() -> None:
    from ultralytics import YOLO

    models = Path("models")
    models.mkdir(parents=True, exist_ok=True)
    target = models / "yolo11n-seg.pt"
    YOLO("yolo11n-seg.pt")
    candidates = [Path("yolo11n-seg.pt"), target, *Path(".").rglob("yolo11n-seg.pt")]
    for src in candidates:
        if src.is_file() and src.resolve() != target.resolve():
            target.write_bytes(src.read_bytes())
            break
        if src.is_file() and src.resolve() == target.resolve():
            break
    if not target.is_file():
        raise SystemExit("yolo11n-seg.pt was not downloaded into models/")
    print(f"model ready: {target} bytes={target.stat().st_size}")


if __name__ == "__main__":
    main()
