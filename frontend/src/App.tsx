import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VideoStage } from "./components/VideoStage";
import { PetProfileCard } from "./components/PetProfileCard";
import { AnalysisPanel } from "./components/AnalysisPanel";
import { EventDetail, EventList, NavBar, TotalsRow } from "./components/HomeBits";
import { LiveInsight } from "./components/LiveInsight";
import { BehaviourTimeline } from "./components/BehaviourTimeline";
import { HomeScreen } from "./screens/HomeScreen";
import { useAnalysisStream } from "./hooks/useAnalysisStream";
import { useCamera } from "./hooks/useCamera";
import { useActivityLog } from "./hooks/useActivityLog";
import { saveProfile, loadProfile } from "./lib/profile";
import { loadSettings, saveSettings, loadZones, saveZones } from "./lib/storage";
import { buildDemoStory } from "./lib/demoStory";
import { liveActivity, groupTimeline, totalsFor } from "./lib/activity";
import { DEMO_VIDEOS, DEFAULT_DEMO_ID, demoActivityAt, demoById, demoPlaybackEvents, demoTimelineEvents } from "./lib/demos";
import { ruleSummary } from "./lib/summary";
import { copy } from "./lib/i18n";
import { ACTIVITY_META, ZONE_PRESETS, type ActivityEvent, type HomeZone, type InputMode, type PetProfile, type TabId, type ZoneType } from "./types";

export default function App() {
  const [tab, setTab] = useState<TabId>("home");
  const [mode, setMode] = useState<InputMode>("camera");
  const [active, setActive] = useState(false);
  const [profile, setProfile] = useState<PetProfile>(loadProfile);
  const [settings, setSettings] = useState(loadSettings);
  const [zones, setZones] = useState<HomeZone[]>(loadZones);
  const [demoId, setDemoId] = useState(DEFAULT_DEMO_ID);
  const [resetToken, setResetToken] = useState(0);
  const [videoTime, setVideoTime] = useState(0);
  const [missingDemos, setMissingDemos] = useState<Record<string, boolean>>({});
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [selected, setSelected] = useState<ActivityEvent | null>(null);
  const { stream, error, starting, facing, start, stop, switchCamera } = useCamera();
  const streaming = active && (mode === "demo" || Boolean(stream));
  const { analysis, displayKeypoints, backendError } = useAnalysisStream(
    video,
    streaming,
    profile,
    zones,
    resetToken,
  );
  const log = useActivityLog(
    analysis,
    streaming && !settings.storyMode,
    profile,
    zones,
    settings.minActivitySeconds,
    settings.storyMode,
    mode === "demo" ? "demo" : "live",
  );
  const demoOriginRef = useRef(Date.now());
  const demo = demoById(demoId);

  useEffect(() => {
    saveProfile(profile);
  }, [profile]);
  useEffect(() => {
    saveSettings(settings);
    localStorage.setItem("pettalk.debug", settings.debugMode ? "1" : "0");
  }, [settings]);
  useEffect(() => {
    saveZones(zones);
  }, [zones]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      DEMO_VIDEOS.map(async (item) => {
        try {
          const res = await fetch(item.src, { method: "GET", headers: { Range: "bytes=0-8" } });
          const type = res.headers.get("content-type") || "";
          const ok = res.ok && /video|octet-stream|mp4/i.test(type);
          return [item.id, !ok] as const;
        } catch {
          return [item.id, true] as const;
        }
      }),
    ).then((rows) => {
      if (cancelled) return;
      const next = Object.fromEntries(rows);
      setMissingDemos(next);
      if (next[demoId]) {
        const fallback = DEMO_VIDEOS.find((item) => !next[item.id]);
        if (fallback) setDemoId(fallback.id);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const resetAnalysisSession = useCallback(() => {
    setResetToken((n) => n + 1);
    setVideoTime(0);
    demoOriginRef.current = Date.now();
    log.startFresh();
  }, [log]);
  const handleVideoTime = useCallback((t: number, looped: boolean) => {
    setVideoTime(t);
    if (looped) resetAnalysisSession();
  }, [resetAnalysisSession]);
  const startCamera = useCallback(async () => {
    setMode("camera");
    const media = await start("environment");
    setActive(Boolean(media));
    setTab("camera");
    resetAnalysisSession();
  }, [start, resetAnalysisSession]);
  const flipCamera = useCallback(async () => {
    await switchCamera();
    resetAnalysisSession();
  }, [switchCamera, resetAnalysisSession]);
  const stopCamera = useCallback(() => {
    stop();
    setActive(false);
  }, [stop]);
  const startDemo = useCallback(
    (id?: string) => {
      stop();
      if (id) setDemoId(id);
      setMode("demo");
      setActive(true);
      setTab("camera");
      resetAnalysisSession();
    },
    [stop, resetAnalysisSession],
  );

  useEffect(() => {
    if (mode === "camera" && error && !stream) setActive(false);
  }, [error, stream, mode]);

  const live = liveActivity(analysis, zones);
  const meta = ACTIVITY_META[live.id] ?? { icon: "◌", label: live.id };
  const demoSeg = mode === "demo" ? demoActivityAt(demo, videoTime) : null;
  const overlayActivity =
    demoSeg && demoSeg.activity !== "detected"
      ? ACTIVITY_META[demoSeg.activity]
      : demoSeg
        ? { icon: demoSeg.icon, label: demoSeg.label }
        : meta;
  const liveLabel = streaming ? `${overlayActivity.icon} ${overlayActivity.label}` : undefined;
  const timelineEvents =
    mode === "demo"
      ? demoTimelineEvents(demo, videoTime)
      : groupTimeline(analysis?.timeline ?? []);
  const demoEvents = useMemo(
    () => (mode === "demo" ? demoPlaybackEvents(demo, videoTime, profile.id, demoOriginRef.current) : []),
    [mode, demo, videoTime, profile.id],
  );
  const demoSummary = useMemo(() => {
    if (!demoEvents.length) return null;
    return ruleSummary(demoEvents, profile, demoOriginRef.current, demoOriginRef.current + Math.max(1, videoTime) * 1000);
  }, [demoEvents, profile, videoTime]);
  const homeRecent = demoEvents.length ? demoEvents : log.recent;
  const homeSummary = demoSummary ?? log.latestSummary;
  const homeTotals = demoEvents.length ? totalsFor(demoEvents) : log.todayTotals;

  const addZone = (type: ZoneType) => {
    const preset = ZONE_PRESETS.find((z) => z.type === type)!;
    const n = zones.length;
    const x = 0.08 + (n % 3) * 0.28;
    setZones((prev) => [
      ...prev,
      { id: `zone-${Date.now()}`, name: preset.name, type, rect: [x, 0.55, Math.min(0.95, x + 0.24), 0.92] },
    ]);
  };

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
              <p className="hidden text-[12px] text-mute sm:block">{copy.tagline}</p>
            </div>
          </div>
          <NavBar tab={tab} onChange={setTab} />
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          {tab === "home" && (
            <HomeScreen
              profile={profile}
              analysis={analysis}
              streaming={streaming}
              recent={homeRecent}
              summary={homeSummary}
              todayTotals={homeTotals}
              onOpenCamera={() => setTab("camera")}
              onOpenActivity={() => setTab("activity")}
              onSelect={(event) => {
                setSelected(event);
                setTab("activity");
              }}
            />
          )}

          {tab === "camera" && (
            <div className="flex flex-col gap-3 lg:grid lg:min-h-[70vh] lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className="flex min-h-0 flex-col gap-2.5">
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
                  onSwitchDemo={() => startDemo()}
                  starting={starting}
                  zones={zones}
                  liveActivityLabel={liveLabel}
                  demo={demo}
                  missingDemos={missingDemos}
                  onSelectDemo={(id) => startDemo(id)}
                  petName={profile.name}
                  onVideoTime={handleVideoTime}
                  facing={facing}
                  onSwitchCamera={mode === "camera" ? flipCamera : undefined}
                />
                {streaming && (
                  <div className="hidden lg:block">
                    <BehaviourTimeline events={timelineEvents} elapsed={mode === "demo" ? videoTime : analysis?.t ?? 0} />
                  </div>
                )}
              </div>
              <div className="flex min-h-0 flex-col gap-2.5 overflow-y-auto pb-4">
                <div className="flex gap-1 rounded-full border border-white/10 bg-white/5 p-1">
                  <button
                    type="button"
                    onClick={() => startDemo()}
                    className={`flex-1 rounded-full px-3 py-1.5 text-sm ${mode === "demo" ? "bg-cyan-400 text-black" : "text-mute"}`}
                  >
                    🎬 {copy.demoModeShort}
                  </button>
                  <button
                    type="button"
                    onClick={startCamera}
                    className={`flex-1 rounded-full px-3 py-1.5 text-sm ${mode === "camera" && active ? "bg-cyan-400 text-black" : "text-mute"}`}
                  >
                    🔴 {copy.liveCamera}
                  </button>
                </div>
                {active && (
                  <button type="button" onClick={stopCamera} className="self-start rounded-full px-3 py-1.5 text-sm text-mute">
                    {copy.stopCamera}
                  </button>
                )}
                <LiveInsight
                  analysis={analysis}
                  profile={profile}
                  live={live}
                  streaming={streaming}
                  demo={mode === "demo" ? demo : null}
                  videoTime={videoTime}
                  summary={demoSummary}
                  events={demoEvents}
                />
                {streaming && (
                  <div className="lg:hidden">
                    <BehaviourTimeline events={timelineEvents} elapsed={mode === "demo" ? videoTime : analysis?.t ?? 0} />
                  </div>
                )}
                {settings.debugMode && <AnalysisPanel analysis={analysis} debugMode />}
              </div>
            </div>
          )}

          {tab === "activity" && (
            <div className="mx-auto grid w-full max-w-4xl gap-3 lg:grid-cols-[1fr_320px]">
              <div className="glass rounded-2xl p-4">
                <p className="text-[11px] tracking-[0.16em] text-mute">{copy.today}</p>
                <div className="mt-3">
                  <TotalsRow events={homeRecent.length ? homeRecent : log.today} />
                </div>
                <p className="mt-4 text-[11px] tracking-[0.16em] text-mute">{copy.timeline}</p>
                <div className="mt-3">
                  <EventList events={homeRecent.length ? homeRecent : log.today} onSelect={setSelected} />
                </div>
              </div>
              {selected && <EventDetail event={selected} onClose={() => setSelected(null)} />}
            </div>
          )}

          {tab === "profile" && (
            <div className="mx-auto w-full max-w-xl">
              <PetProfileCard profile={profile} onChange={setProfile} />
            </div>
          )}

          {tab === "settings" && (
            <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
              <div className="glass rounded-2xl p-4">
                <p className="text-[11px] tracking-[0.16em] text-mute">{copy.navSettings}</p>
                <label className="mt-3 flex items-center justify-between text-sm">
                  <span>{copy.debugMode}</span>
                  <input
                    type="checkbox"
                    checked={settings.debugMode}
                    onChange={(e) => setSettings({ ...settings, debugMode: e.target.checked })}
                    className="accent-cyan-400"
                  />
                </label>
                <label className="mt-3 block text-sm">
                  {copy.minHold}
                  <input
                    type="range"
                    min={3}
                    max={8}
                    value={settings.minActivitySeconds}
                    onChange={(e) => setSettings({ ...settings, minActivitySeconds: Number(e.target.value) })}
                    className="mt-2 w-full"
                  />
                  <span className="font-mono text-xs text-cyan-300">{settings.minActivitySeconds} 秒</span>
                </label>
              </div>
              <div className="glass rounded-2xl p-4">
                <p className="text-[11px] tracking-[0.16em] text-mute">{copy.zones}</p>
                <p className="mt-2 text-[11px] text-mute">在畫面中標記區域後，門口停留／進食才可判斷。玩具偵測尚未支援。</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {ZONE_PRESETS.map((z) => (
                    <button
                      key={z.type}
                      type="button"
                      onClick={() => addZone(z.type)}
                      className="rounded-full border border-white/10 px-2.5 py-1 text-[11px]"
                    >
                      {copy.addZone} {z.name}
                    </button>
                  ))}
                </div>
                <ul className="mt-3 space-y-1 text-sm">
                  {zones.map((z) => (
                    <li key={z.id} className="flex justify-between">
                      <span>{z.name}</span>
                      <button type="button" className="text-[11px] text-amber-200" onClick={() => setZones(zones.filter((x) => x.id !== z.id))}>
                        移除
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="glass rounded-2xl p-4">
                <p className="text-[11px] tracking-[0.16em] text-mute">{copy.storyData}</p>
                <p className="mt-2 text-[11px] text-mute">{copy.storyHint}</p>
                <button
                  type="button"
                  className="mt-3 rounded-full bg-amber-300 px-4 py-1.5 text-sm text-black"
                  onClick={() => {
                    setSettings({ ...settings, storyMode: true });
                    log.replaceWithDemo(buildDemoStory(profile.id));
                    setTab("home");
                  }}
                >
                  {copy.loadStory}
                </button>
                <button
                  type="button"
                  className="ml-2 rounded-full border border-white/15 px-4 py-1.5 text-sm"
                  onClick={() => {
                    setSettings({ ...settings, storyMode: false });
                    log.clear();
                  }}
                >
                  {copy.clearHistory}
                </button>
              </div>
            </div>
          )}
        </main>
        <footer className="shrink-0 pb-1 text-center text-[11px] text-mute">{copy.footer}</footer>
      </div>
    </div>
  );
}
