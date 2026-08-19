import { useCallback, useEffect, useRef, useState } from "react";
import type { AnalysisResult, InputMode, Keypoint } from "../types";
import { OverlayCanvas } from "./OverlayCanvas";
import { copy } from "../lib/i18n";
import { DEMO_VIDEOS, type DemoVideo } from "../lib/demos";
import type { CameraFacing } from "../hooks/useCamera";

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
  zones = [],
  liveActivityLabel,
  demo,
  missingDemos,
  onSelectDemo,
  petName,
  onVideoTime,
  facing = "environment",
  onSwitchCamera,
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
  zones?: import("../types").HomeZone[];
  liveActivityLabel?: string;
  demo: DemoVideo;
  missingDemos: Record<string, boolean>;
  onSelectDemo: (id: string) => void;
  petName?: string;
  onVideoTime?: (t: number, looped: boolean) => void;
  facing?: CameraFacing;
  onSwitchCamera?: () => void;
}) {
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [showLabels, setShowLabels] = useState(false);
  const [needsPlay, setNeedsPlay] = useState(false);
  const missing = Boolean(missingDemos[demo.id]);
  const lastTimeRef = useRef(0);

  const bindVideo = useCallback(
    (el: HTMLVideoElement | null) => {
      videoRef.current = el;
      setVideoEl(el);
      onVideo(el);
    },
    [onVideo],
  );

  const playSrc = useCallback((src: string) => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = null;
    if (!videoSrcMatches(video, src)) {
      video.src = src;
    }
    void video.play().then(() => setNeedsPlay(false)).catch(() => setNeedsPlay(true));
  }, []);

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
    if (missing) {
      video.removeAttribute("src");
      video.load();
      return;
    }
    if (!videoSrcMatches(video, demo.src)) {
      video.src = demo.src;
    }
    if (video.paused) {
      video.play().then(() => setNeedsPlay(false)).catch(() => setNeedsPlay(true));
    }
  }, [mode, active, videoEl, demo.src, missing]);

  useEffect(() => {
    lastTimeRef.current = 0;
  }, [demo.src, mode]);

  useEffect(() => {
    const video = videoEl;
    if (!video || !onVideoTime) return;
    const emit = () => {
      const t = video.currentTime || 0;
      const looped = mode === "demo" && lastTimeRef.current > 1.4 && t < 0.4;
      lastTimeRef.current = t;
      onVideoTime(t, looped);
    };
    video.addEventListener("timeupdate", emit);
    video.addEventListener("seeked", emit);
    return () => {
      video.removeEventListener("timeupdate", emit);
      video.removeEventListener("seeked", emit);
    };
  }, [videoEl, mode, onVideoTime]);

  const live = active && (mode === "demo" || Boolean(stream));
  const detected = Boolean(analysis?.detection.present);
  const cameraStatus = starting
    ? { dot: "bg-amber-300", text: `📷 ${copy.cameraStarting}`, border: "border-amber-300/30 text-amber-200" }
    : !stream
      ? { dot: "bg-white/50", text: `⚪ ${copy.waiting}`, border: "border-white/15 text-mute" }
      : detected
        ? { dot: "bg-lime-400", text: `🔴 ${copy.liveAnalysis}`, border: "border-lime-400/30 text-lime-200" }
        : analysis
          ? { dot: "bg-amber-300", text: `🟡 ${copy.analysing}`, border: "border-amber-300/30 text-amber-200" }
          : { dot: "bg-cyan-400", text: `📷 ${copy.cameraReady}`, border: "border-cyan-400/30 text-cyan-200" };

  return (
    <section className="glass relative flex h-[48dvh] min-h-[280px] flex-col overflow-hidden rounded-2xl lg:h-auto lg:min-h-[360px] lg:flex-1">
      <div className="relative min-h-0 flex-1 bg-black/40">
        <video
          ref={bindVideo}
          className="absolute inset-0 h-full w-full object-contain"
          playsInline
          muted
          autoPlay
          loop={mode === "demo"}
        />
        <div className="scanlines absolute inset-0" />
        <OverlayCanvas key={mode === "demo" ? demo.src : "camera"} video={videoEl} analysis={analysis} keypoints={keypoints} showLabels={showLabels} zones={zones} />

        {!live && !starting && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[#05070a]/70 p-6 text-center">
            <p className="text-[11px] tracking-[0.2em] text-cyan-300/80">{copy.pipelineIdle}</p>
            <h2 className="max-w-md text-xl font-semibold tracking-tight lg:text-2xl">{copy.idleTitle}</h2>
            <p className="max-w-sm text-sm text-[var(--color-mute)]">{cameraError ? copy.cameraNeed : copy.idleBody}</p>
            <div className="mt-2 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={onStartCamera}
                disabled={starting}
                className="rounded-full bg-cyan-400 px-5 py-2 text-sm font-semibold text-black hover:bg-cyan-300 disabled:opacity-60"
              >
                {copy.openCamera}
              </button>
              <button
                type="button"
                onClick={() => {
                  onSwitchDemo();
                  if (!missing) playSrc(demo.src);
                }}
                className="rounded-full border border-white/15 px-5 py-2 text-sm text-ink hover:border-cyan-400/40"
              >
                {copy.tryDemo}
              </button>
            </div>
            {cameraError && (
              <p className="max-w-md text-xs text-amber-300">
                {copy.cameraFailed}：{cameraError}
              </p>
            )}
          </div>
        )}

        {starting && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/55 text-sm text-ink">
            📷 {copy.cameraStarting}
          </div>
        )}

        {missing && mode === "demo" && live && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 p-8 text-center">
            <p className="max-w-md text-sm text-amber-200">{copy.demoMissing}</p>
          </div>
        )}

        {needsPlay && mode === "demo" && live && !missing && (
          <button
            type="button"
            className="absolute inset-0 z-10 flex items-center justify-center bg-black/55 text-sm text-ink"
            onClick={() => playSrc(demo.src)}
          >
            點擊畫面開始播放示範影片
          </button>
        )}

        <div className="pointer-events-none absolute left-3 top-3 flex max-w-[78%] flex-wrap items-center gap-1.5">
          {mode === "demo" && live && (
            <span className="rounded-full border border-amber-300/30 bg-black/55 px-2.5 py-1 text-[11px] text-amber-200">
              🎬 {copy.demoModeShort}
            </span>
          )}
          {mode === "camera" && live && (
            <span className={`flex items-center gap-2 rounded-full border bg-black/55 px-2.5 py-1 text-[11px] ${cameraStatus.border}`}>
              <span className={`live-dot h-1.5 w-1.5 rounded-full ${cameraStatus.dot}`} />
              {cameraStatus.text}
            </span>
          )}
          {petName && live && (
            <span className="rounded-full border border-white/10 bg-black/55 px-2.5 py-1 text-[11px] text-ink">
              {copy.dog}：{petName}
            </span>
          )}
          {live && detected && (
            <span className="rounded-full border border-white/10 bg-black/55 px-2.5 py-1 text-[11px] text-ink">
              🐕 {copy.detectedPet} {petName || ""}
            </span>
          )}
        </div>

        {live && liveActivityLabel && (
          <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2">
            <div className="rounded-xl border border-white/10 bg-black/55 px-3 py-2">
              <p className="text-sm font-semibold text-ink">{liveActivityLabel}</p>
              {mode === "camera" && analysis?.movement?.band && (
                <p className="text-[11px] text-mute">
                  {copy.movement}：{analysis.movement.band === "high" ? "高" : analysis.movement.band === "medium" ? "中" : "低"}
                </p>
              )}
            </div>
            <label className="pointer-events-auto hidden cursor-pointer items-center gap-2 text-[11px] text-mute lg:flex">
              <input
                type="checkbox"
                checked={showLabels}
                onChange={(e) => setShowLabels(e.target.checked)}
                className="accent-cyan-400"
              />
              {copy.keypointLabels}
            </label>
          </div>
        )}
      </div>

      {mode === "camera" && live && onSwitchCamera && (
        <div className="flex items-center justify-between border-t border-white/10 px-3 py-2">
          <p className="text-[11px] text-mute">{facing === "user" ? copy.frontCamera : copy.rearCamera}</p>
          <button
            type="button"
            onClick={onSwitchCamera}
            className="rounded-full border border-white/15 px-3 py-1 text-[12px] text-ink"
          >
            🔄 {copy.switchCamera}
          </button>
        </div>
      )}

      {mode === "demo" && (
        <div className="border-t border-white/10 px-3 py-2">
          <p className="mb-2 text-[11px] tracking-[0.16em] text-mute">{copy.demoVideo}</p>
          <div className="flex flex-wrap gap-1.5">
            {DEMO_VIDEOS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectDemo(item.id);
                  if (!missingDemos[item.id]) playSrc(item.src);
                }}
                className={`rounded-full px-3 py-1 text-[12px] ${
                  demo.id === item.id ? "bg-cyan-400 text-black" : "border border-white/15 text-ink"
                }`}
              >
                {item.icon} {item.title}
                {missingDemos[item.id] ? " · 未加入" : ""}
              </button>
            ))}
          </div>
        </div>
      )}

      {backendError && live && (
        <div className="border-t border-amber-400/20 bg-amber-400/10 px-4 py-2 text-xs text-amber-200">
          {backendError}
        </div>
      )}
    </section>
  );
}

function videoSrcMatches(video: HTMLVideoElement, src: string) {
  const current = video.currentSrc || video.src || video.getAttribute("src") || "";
  return current === src || current.endsWith(src);
}
