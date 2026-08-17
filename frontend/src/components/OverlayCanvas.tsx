import { useEffect, useRef } from "react";
import type { AnalysisResult, Keypoint } from "../types";

const LABEL_ALLOW = new Set([
  "nose",
  "tail_end",
  "front_left_paw",
  "front_right_paw",
  "rear_left_paw",
  "rear_right_paw",
  "withers",
]);

export function OverlayCanvas({
  video,
  analysis,
  keypoints,
  showLabels,
}: {
  video: HTMLVideoElement | null;
  analysis: AnalysisResult | null;
  keypoints: Keypoint[];
  showLabels: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !video) return;

    let raf = 0;
    const draw = () => {
      const w = video.clientWidth;
      const h = video.clientHeight;
      if (w === 0 || h === 0) {
        raf = requestAnimationFrame(draw);
        return;
      }
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const vw = video.videoWidth || w;
      const vh = video.videoHeight || h;
      const scale = Math.min(w / vw, h / vh);
      const rw = vw * scale;
      const rh = vh * scale;
      const ox = (w - rw) / 2;
      const oy = (h - rh) / 2;
      const px = (nx: number) => ox + nx * rw;
      const py = (ny: number) => oy + ny * rh;

      const det = analysis?.detection;
      if (det?.present && det.bbox) {
        const [x1, y1, x2, y2] = det.bbox;
        drawBox(ctx, px(x1), py(y1), (x2 - x1) * rw, (y2 - y1) * rh, det.confidence);
      }

      const kps = keypoints.length ? keypoints : analysis?.keypoints || [];
      const skeleton = analysis?.skeleton || [];
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(163, 230, 53, 0.85)";
      ctx.lineCap = "round";
      for (const [ia, ib] of skeleton) {
        const a = kps[ia];
        const b = kps[ib];
        if (!a?.visible || !b?.visible) continue;
        if (a.confidence < 0.3 || b.confidence < 0.3) continue;
        ctx.beginPath();
        ctx.moveTo(px(a.x), py(a.y));
        ctx.lineTo(px(b.x), py(b.y));
        ctx.stroke();
      }

      for (const kp of kps) {
        if (!kp.visible || kp.confidence < 0.28) continue;
        const x = px(kp.x);
        const y = py(kp.y);
        const r = 3.2 + kp.confidence * 1.8;
        ctx.beginPath();
        ctx.fillStyle = "rgba(34, 211, 238, 0.95)";
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.strokeStyle = "rgba(232, 238, 247, 0.55)";
        ctx.lineWidth = 1;
        ctx.arc(x, y, r + 2.2, 0, Math.PI * 2);
        ctx.stroke();

        if (showLabels && LABEL_ALLOW.has(kp.name)) {
          ctx.font = "10px IBM Plex Mono, monospace";
          ctx.fillStyle = "rgba(232, 238, 247, 0.8)";
          ctx.fillText(kp.name.replaceAll("_", " "), x + 7, y - 7);
        }
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [video, analysis, keypoints, showLabels]);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />;
}

function drawBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  confidence: number,
) {
  ctx.save();
  ctx.strokeStyle = "rgba(34, 211, 238, 0.28)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);

  const tick = Math.min(18, w * 0.18, h * 0.18);
  ctx.strokeStyle = "#22d3ee";
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(x, y + tick);
  ctx.lineTo(x, y);
  ctx.lineTo(x + tick, y);
  ctx.moveTo(x + w - tick, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + tick);
  ctx.moveTo(x + w, y + h - tick);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w - tick, y + h);
  ctx.moveTo(x + tick, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + h - tick);
  ctx.stroke();

  const label = `DOG  ${(confidence * 100).toFixed(1)}%`;
  ctx.font = "600 11px IBM Plex Mono, monospace";
  const padX = 8;
  const tw = ctx.measureText(label).width;
  const lx = x;
  const ly = Math.max(18, y - 8);
  ctx.fillStyle = "rgba(5, 7, 10, 0.82)";
  ctx.fillRect(lx, ly - 14, tw + padX * 2, 18);
  ctx.fillStyle = "#22d3ee";
  ctx.fillText(label, lx + padX, ly);
  ctx.restore();
}
