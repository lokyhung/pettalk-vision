import { useEffect, useState } from "react";
import type { AnalysisResult, InputMode, Keypoint } from "../types";
import { OverlayCanvas } from "./OverlayCanvas";
import { copy } from "../lib/i18n";

const DEMO_SRC = "/assets/demo-dog.mp4";

export function VideoStage({
  onVideo,
  mode,
  stream,
  active,
  analysis,
  keypoints,
  cameraError,
  backendError,
  onStartCamera,
  onSwitchDemo,
  starting,
}: {
  onVideo: (el: HTMLVideoElement | null) => void;
  mode: InputMode;
  stream: MediaStream | null;
  active: boolean;
  analysis: AnalysisResult | null;
  keypoints: Keypoint[];
  cameraError: string | null;
  backendError: string | null;
  onStartCamera: () => void;
  onSwitchDemo: () => void;
  starting: boolean;
}) {
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [demoMissing, setDemoMissing] = useState(false);
  const [showLabels, setShowLabels] = useState(false);

  const bindVideo = (el: HTMLVideoElement | null) => {
    setVideoEl(el);
    onVideo(el);
  };

  useEffect(() => {
    const video = videoEl;
    if (!video) return;
    if (mode === "camera" && stream) {
      video.srcObject = stream;
      video.play().catch(() => undefined);
    } else if (mode === "camera") {
      video.srcObject = null;
    }
  }, [mode, stream, videoEl]);

  useEffect(() => {
    const video = videoEl;
    if (!video || mode !== "demo") return;
    video.srcObject = null;
    video.src = DEMO_SRC;
    video.load();
    video.play().catch(() => undefined);
  }, [mode, active, videoEl]);

  const live = active && (mode === "demo" || Boolean(stream));
  const status = !live ? "waiting" : analysis?.liveStatus || "analysing";
  const statusView =
    status === "live"
      ? { dot: "bg-lime-400", text: `🟢 ${copy.liveAnalysis}`, border: "border-lime-400/30 text-lime-200" }
      : status === "analysing"
        ? { dot: "bg-amber-300", text: `🟡 ${copy.analysing}`, border: "border-amber-300/30 text-amber-200" }
        : { dot: "bg-white/50", text: `⚪ ${copy.waiting}`, border: "border-white/15 text-mute" };

  return (
    <section className="glass relative flex min-h-[360px] flex-1 flex-col overflow-hidden rounded-2xl lg:min-h-0">
      <div className="relative flex-1 bg-black/40">
        <video
          ref={bindVideo}
          className="absolute inset-0 h-full w-full object-contain"
          playsInline
          muted
          autoPlay
          loop={mode === "demo"}
          onError={() => {
            if (mode === "demo") setDemoMissing(true);
          }}
        />
        <div className="scanlines absolute inset-0" />
        <OverlayCanvas video={videoEl} analysis={analysis} keypoints={keypoints} showLabels={showLabels} />

        {!live && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[#05070a]/70 p-8 text-center">
            <p className="text-[11px] tracking-[0.2em] text-cyan-300/80">{copy.pipelineIdle}</p>
            <h2 className="max-w-md text-2xl font-semibold tracking-tight">{copy.idleTitle}</h2>
            <p className="max-w-sm text-sm text-[var(--color-mute)]">{copy.idleBody}</p>
            <div className="mt-2 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={onStartCamera}
                disabled={starting}
                className="rounded-full bg-cyan-400 px-5 py-2 text-sm font-semibold text-black hover:bg-cyan-300 disabled:opacity-60"
              >
                {starting ? copy.requestingCamera : copy.startCamera}
              </button>
              <button
                type="button"
                onClick={onSwitchDemo}
                className="rounded-full border border-white/15 px-5 py-2 text-sm text-ink hover:border-cyan-400/40"
              >
                {copy.tryDemo}
              </button>
            </div>
            {cameraError && (
              <p className="max-w-md text-xs text-amber-300">
                {copy.cameraFailed}：{cameraError}。{copy.switchDemoHint}
              </p>
            )}
          </div>
        )}

        {demoMissing && mode === "demo" && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 p-8 text-center">
            <p className="max-w-md text-sm text-amber-200">{copy.demoMissing}</p>
          </div>
        )}

        <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2">
          <span
            className={`flex items-center gap-2 rounded-full border bg-black/55 px-3 py-1 text-[11px] ${statusView.border}`}
          >
            <span className={`live-dot h-1.5 w-1.5 rounded-full ${statusView.dot}`} />
            {statusView.text}
          </span>
          {analysis?.device && (
            <span className="rounded-full border border-white/10 bg-black/50 px-2.5 py-1 font-mono text-[10px] text-mute">
              {analysis.device.toUpperCase()} · {Math.round(analysis.latencyMs)}ms
            </span>
          )}
        </div>

        <div className="pointer-events-none absolute right-4 top-4 flex flex-col items-end gap-1">
          {(analysis?.statusFlags ?? []).map((flag) => (
            <span
              key={flag}
              className="rounded border border-cyan-400/20 bg-black/55 px-2 py-0.5 text-[10px] tracking-[0.12em] text-cyan-200/90"
            >
              {flag}
            </span>
          ))}
        </div>

        <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
          <p className="max-w-md text-[11px] leading-relaxed text-white/55">{copy.prototypeNote}</p>
          <label className="pointer-events-auto flex cursor-pointer items-center gap-2 text-[11px] text-mute">
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(e) => setShowLabels(e.target.checked)}
              className="accent-cyan-400"
            />
            {copy.keypointLabels}
          </label>
        </div>
      </div>

      {backendError && live && (
        <div className="border-t border-amber-400/20 bg-amber-400/10 px-4 py-2 text-xs text-amber-200">
          {backendError}
        </div>
      )}
    </section>
  );
}
