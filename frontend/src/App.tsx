import { useCallback, useEffect, useState } from "react";
import { AnalysisPanel } from "./components/AnalysisPanel";
import { BehaviourTimeline } from "./components/BehaviourTimeline";
import { ExplanationPanel } from "./components/ExplanationPanel";
import { PetProfileCard } from "./components/PetProfileCard";
import { VideoStage } from "./components/VideoStage";
import { useAnalysisStream } from "./hooks/useAnalysisStream";
import { useCamera } from "./hooks/useCamera";
import { saveProfile, loadProfile } from "./lib/profile";
import { copy } from "./lib/i18n";
import type { InputMode, PetProfile } from "./types";

export default function App() {
  const [mode, setMode] = useState<InputMode>("camera");
  const [active, setActive] = useState(false);
  const [profile, setProfile] = useState<PetProfile>(loadProfile);
  const [debugMode, setDebugMode] = useState(() => localStorage.getItem("pettalk.debug") === "1");
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const { stream, error, starting, start, stop } = useCamera();
  const streaming = active && (mode === "demo" || Boolean(stream));
  const { analysis, displayKeypoints, backendError } = useAnalysisStream(video, streaming, profile);

  useEffect(() => {
    saveProfile(profile);
  }, [profile]);

  useEffect(() => {
    localStorage.setItem("pettalk.debug", debugMode ? "1" : "0");
  }, [debugMode]);

  const startCamera = useCallback(async () => {
    setMode("camera");
    const media = await start();
    setActive(Boolean(media));
  }, [start]);

  const stopCamera = useCallback(() => {
    stop();
    setActive(false);
  }, [stop]);

  const startDemo = useCallback(() => {
    stop();
    setMode("demo");
    setActive(true);
  }, [stop]);

  useEffect(() => {
    if (mode === "camera" && error && !stream) {
      setActive(false);
    }
  }, [error, stream, mode]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col gap-3 px-4 py-3 lg:px-5">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-400/10">
              <svg width="20" height="20" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                <circle cx="16" cy="16" r="7" stroke="#22D3EE" strokeWidth="1.6" />
                <circle cx="16" cy="16" r="2.2" fill="#A3E635" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">{copy.product}</h1>
              <p className="text-[12px] text-mute">{copy.subtitle}</p>
              <p className="font-mono text-[10px] tracking-[0.12em] text-mute/80">{copy.tagline}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 p-1">
            <button
              type="button"
              onClick={startCamera}
              className={`rounded-full px-4 py-1.5 text-sm ${
                mode === "camera" && active ? "bg-cyan-400 text-black" : "text-mute hover:text-ink"
              }`}
            >
              {copy.cameraMode}
            </button>
            <button
              type="button"
              onClick={startDemo}
              className={`rounded-full px-4 py-1.5 text-sm ${
                mode === "demo" && active ? "bg-cyan-400 text-black" : "text-mute hover:text-ink"
              }`}
            >
              {copy.demoMode}
            </button>
            {mode === "camera" && active && (
              <button
                type="button"
                onClick={stopCamera}
                className="rounded-full px-3 py-1.5 text-sm text-mute hover:text-ink"
              >
                {copy.stopCamera}
              </button>
            )}
            <button
              type="button"
              onClick={() => setDebugMode((v) => !v)}
              className={`rounded-full px-3 py-1.5 text-sm ${
                debugMode ? "bg-amber-300 text-black" : "text-mute hover:text-ink"
              }`}
            >
              {copy.debugMode}
            </button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
          <VideoStage
            onVideo={setVideo}
            mode={mode}
            stream={stream}
            active={active}
            analysis={analysis}
            keypoints={displayKeypoints}
            cameraError={error}
            backendError={backendError}
            onStartCamera={startCamera}
            onSwitchDemo={startDemo}
            starting={starting}
          />
          <div className="flex min-h-0 flex-col gap-2.5 overflow-y-auto pr-0.5">
            <AnalysisPanel analysis={analysis} debugMode={debugMode} />
            <ExplanationPanel analysis={analysis} profile={profile} />
            <PetProfileCard profile={profile} onChange={setProfile} />
          </div>
        </div>

        <BehaviourTimeline events={analysis?.timeline ?? []} elapsed={analysis?.t ?? 0} />

        <footer className="shrink-0 pb-1 text-center text-[11px] text-mute">{copy.footer}</footer>
      </div>
    </div>
  );
}
