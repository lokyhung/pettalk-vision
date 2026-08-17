import { useCallback, useEffect, useState } from "react";
import { AnalysisPanel } from "./components/AnalysisPanel";
import { BehaviourTimeline } from "./components/BehaviourTimeline";
import { ExplanationPanel } from "./components/ExplanationPanel";
import { PetProfileCard } from "./components/PetProfileCard";
import { VideoStage } from "./components/VideoStage";
import { useAnalysisStream } from "./hooks/useAnalysisStream";
import { useCamera } from "./hooks/useCamera";
import { saveProfile, loadProfile } from "./lib/profile";
import type { InputMode, PetProfile } from "./types";

export default function App() {
  const [mode, setMode] = useState<InputMode>("camera");
  const [active, setActive] = useState(false);
  const [profile, setProfile] = useState<PetProfile>(loadProfile);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const { stream, error, starting, start, stop } = useCamera();
  const streaming = active && (mode === "demo" || Boolean(stream));
  const { analysis, displayKeypoints, backendError } = useAnalysisStream(video, streaming, profile);

  useEffect(() => {
    saveProfile(profile);
  }, [profile]);

  const startCamera = useCallback(async () => {
    setMode("camera");
    const media = await start();
    if (media) {
      setActive(true);
    } else {
      setActive(false);
    }
  }, [start]);

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
    <div className="mx-auto flex min-h-full max-w-[1440px] flex-col gap-4 px-4 py-4 lg:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-400/10">
            <svg width="20" height="20" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <circle cx="16" cy="16" r="7" stroke="#22D3EE" strokeWidth="1.6" />
              <circle cx="16" cy="16" r="2.2" fill="#A3E635" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">PetTalk Vision</h1>
            <p className="font-mono text-[10px] tracking-[0.18em] text-mute">CANINE BEHAVIOUR ANALYSIS PROTOTYPE</p>
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
            Camera Mode
          </button>
          <button
            type="button"
            onClick={startDemo}
            className={`rounded-full px-4 py-1.5 text-sm ${
              mode === "demo" && active ? "bg-cyan-400 text-black" : "text-mute hover:text-ink"
            }`}
          >
            Demo Video Mode
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
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
        <div className="flex w-full shrink-0 flex-col gap-3 lg:w-[340px]">
          <AnalysisPanel analysis={analysis} />
          <ExplanationPanel analysis={analysis} profile={profile} />
          <PetProfileCard profile={profile} onChange={setProfile} />
        </div>
      </div>

      <BehaviourTimeline events={analysis?.timeline ?? []} elapsed={analysis?.t ?? 0} />

      <footer className="pb-2 text-center text-[11px] text-mute">
        PetTalk Vision is a RightPick-style product demo. It does not read a dog&apos;s mind and is not a medical or
        veterinary diagnostic tool.
      </footer>
    </div>
  );
}
