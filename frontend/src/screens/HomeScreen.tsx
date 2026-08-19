import { copy } from "../lib/i18n";
import { ACTIVITY_META, type ActivityEvent, type ActivitySummary, type AnalysisResult, type PetProfile } from "../types";
import { liveActivity, movementBandZh } from "../lib/activity";
import { EventList, TotalsRow } from "../components/HomeBits";

export function HomeScreen({
  profile,
  analysis,
  streaming,
  recent,
  summary,
  todayTotals,
  onOpenCamera,
  onOpenActivity,
  onSelect,
}: {
  profile: PetProfile;
  analysis: AnalysisResult | null;
  streaming: boolean;
  recent: ActivityEvent[];
  summary: ActivitySummary | null;
  todayTotals: Record<string, number>;
  onOpenCamera: () => void;
  onOpenActivity: () => void;
  onSelect: (event: ActivityEvent) => void;
}) {
  const live = liveActivity(analysis, []);
  const meta = ACTIVITY_META[live.id] ?? { icon: "◌", label: live.id };
  const movement =
    analysis?.movement?.band
      ? movementBandZh(analysis.movement.band)
      : (analysis?.pose.movement.label ?? copy.insufficient);
  const todaySec = Object.values(todayTotals).reduce((a, b) => a + b, 0);
  const rest = todayTotals.resting || 0;
  const play = todayTotals.playing || 0;
  const move = (todayTotals.exploring || 0) + (todayTotals.active || 0);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 pb-6">
      <div className="glass rounded-2xl p-4">
        <p className="text-[11px] tracking-[0.16em] text-cyan-300/80">
          {streaming ? `🟢 ${copy.cameraOn}` : `⚪ ${copy.cameraOff}`}
        </p>
        <div className="mt-3 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-semibold">{profile.name}</h2>
            <p className="text-sm text-mute">
              {profile.species}
              {profile.breed ? ` · ${profile.breed}` : ""}
            </p>
          </div>
          <button type="button" onClick={onOpenCamera} className="text-[12px] text-cyan-300">
            {copy.navCamera}
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <p className="text-[11px] text-mute">{copy.current}</p>
            <p className="mt-1 text-lg font-semibold">
              {streaming ? `${meta.icon} ${meta.label}` : copy.waiting}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-mute">{copy.movement}</p>
            <p className="mt-1 text-lg font-semibold">{streaming ? movement : "—"}</p>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-mute">
          {copy.lastUpdate}：{streaming ? copy.justNow : "尚未開始"}
        </p>
      </div>

      <div className="glass rounded-2xl p-4">
        <p className="text-[11px] tracking-[0.16em] text-mute">
          {copy.lastTen}
          {summary?.source === "demo" ? ` · ${copy.simulatedTen}` : ""}
        </p>
        <div className="mt-3">
          <TotalsRow events={recent} />
        </div>
      </div>

      <div className="glass rounded-2xl p-4">
        <p className="text-[11px] tracking-[0.16em] text-mute">{copy.explanation}</p>
        <p className="mt-2 text-sm leading-relaxed">
          {summary?.summary || `累積足夠資料後，PetTalk 會提供${profile.name}的活動摘要。`}
        </p>
        {summary?.source === "demo" && <p className="mt-2 text-[11px] text-amber-200">{copy.storyData}</p>}
      </div>

      <div className="glass rounded-2xl p-4">
        <p className="text-[11px] tracking-[0.16em] text-mute">{copy.noticeTitle}</p>
        <p className="mt-2 text-sm leading-relaxed text-ink/90">
          {summary?.notice || "尚未有需要留意的觀察。"}
        </p>
      </div>

      <div className="glass rounded-2xl p-4">
        <p className="text-[11px] tracking-[0.16em] text-mute">{copy.today}</p>
        {todaySec < 8 ? (
          <p className="mt-2 text-sm text-mute">正在建立{profile.name}的日常習慣</p>
        ) : (
          <div className="mt-3 space-y-2 text-sm">
            <Bar label="🛋️ 休息" value={rest / todaySec} />
            <Bar label="🐕 活動" value={move / todaySec} />
            <Bar label="🎾 玩耍" value={play / todaySec} />
          </div>
        )}
      </div>

      <div className="glass rounded-2xl p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] tracking-[0.16em] text-mute">{copy.timeline}</p>
          <button type="button" onClick={onOpenActivity} className="text-[12px] text-cyan-300">
            {copy.viewAll}
          </button>
        </div>
        <EventList events={recent.slice(-6)} onSelect={onSelect} />
      </div>
    </div>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-mono text-cyan-300">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-cyan-400" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
