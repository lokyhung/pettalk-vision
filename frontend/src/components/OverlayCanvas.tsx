import { useEffect, useRef } from "react";
import type { AnalysisResult, HomeZone, Keypoint } from "../types";
import { copy, keypointZh } from "../lib/i18n";

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
  zones = [],
}: {
  video: HTMLVideoElement | null;
  analysis: AnalysisResult | null;
  keypoints: Keypoint[];
  showLabels: boolean;
  zones?: HomeZone[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<[number, number, number, number] | null>(null);

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
      if (zones.length) {
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 1.2;
        for (const zone of zones) {
          const [zx1, zy1, zx2, zy2] = zone.rect;
          ctx.strokeStyle = "rgba(251, 191, 36, 0.55)";
          ctx.strokeRect(px(zx1), py(zy1), (zx2 - zx1) * rw, (zy2 - zy1) * rh);
          ctx.setLineDash([]);
          ctx.fillStyle = "rgba(251, 191, 36, 0.85)";
          ctx.font = "10px Noto Sans TC, sans-serif";
          ctx.fillText(zone.name, px(zx1) + 6, py(zy1) + 14);
          ctx.setLineDash([6, 4]);
        }
        ctx.setLineDash([]);
      }

      for (const obj of analysis?.objects ?? []) {
        const [ox1, oy1, ox2, oy2] = obj.bbox;
        ctx.strokeStyle = "rgba(163, 230, 53, 0.45)";
        ctx.lineWidth = 1;
        ctx.strokeRect(px(ox1), py(oy1), (ox2 - ox1) * rw, (oy2 - oy1) * rh);
        ctx.fillStyle = "rgba(163, 230, 53, 0.9)";
        ctx.font = "10px Noto Sans TC, sans-serif";
        ctx.fillText(obj.label, px(ox1) + 4, py(oy1) - 6);
      }

      if (det?.present && det.bbox) {
        const target = det.bbox;
        const prev = boxRef.current;
        const blended: [number, number, number, number] = prev
          ? [
              prev[0] + (target[0] - prev[0]) * 0.22,
              prev[1] + (target[1] - prev[1]) * 0.22,
              prev[2] + (target[2] - prev[2]) * 0.22,
              prev[3] + (target[3] - prev[3]) * 0.22,
            ]
          : target;
        boxRef.current = blended;
        const [x1, y1, x2, y2] = blended;
        drawBox(ctx, px(x1), py(y1), (x2 - x1) * rw, (y2 - y1) * rh, det.confidence);
      } else {
        boxRef.current = null;
      }

      const kps = keypoints.length ? keypoints : analysis?.keypoints || [];
      const skeleton = analysis?.skeleton || [];
      const kpMin = analysis?.thresholds?.keypoint ?? 0.42;
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = "rgba(163, 230, 53, 0.55)";
      ctx.lineCap = "round";
      for (const [ia, ib] of skeleton) {
        const a = kps[ia];
        const b = kps[ib];
        if (!a?.visible || !b?.visible) continue;
        if (a.confidence < kpMin || b.confidence < kpMin) continue;
        ctx.beginPath();
        ctx.moveTo(px(a.x), py(a.y));
        ctx.lineTo(px(b.x), py(b.y));
        ctx.stroke();
      }

      for (const kp of kps) {
        if (!kp.visible || kp.confidence < kpMin) continue;
        const x = px(kp.x);
        const y = py(kp.y);
        const r = 2.6 + kp.confidence * 1.4;
        ctx.beginPath();
        ctx.fillStyle = "rgba(34, 211, 238, 0.78)";
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();

        if (showLabels && LABEL_ALLOW.has(kp.name)) {
          ctx.font = "10px IBM Plex Mono, PingFang HK, sans-serif";
          ctx.fillStyle = "rgba(232, 238, 247, 0.75)";
          ctx.fillText(keypointZh[kp.name] || kp.name, x + 7, y - 7);
        }
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [video, analysis, keypoints, showLabels, zones]);

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

  const label = `${copy.overlayDog}  ${(confidence * 100).toFixed(1)}%`;
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
