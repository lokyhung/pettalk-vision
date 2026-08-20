import { copy } from "../lib/i18n";
import { pct } from "../lib/api";
import { movementBandZh } from "../lib/activity";
import { ACTIVITY_META, type ActivityEvent, type ActivityId, type ActivitySummary, type AnalysisResult, type PetProfile } from "../types";
import { cvAgreesWithDemo, demoActivityAt, type DemoVideo } from "../lib/demos";
import { TotalsRow } from "./HomeBits";

function Meter({ value }: { value: number }) {
  const width = Math.max(0, Math.min(100, value * 100));
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
      <div className="h-full rounded-full bg-cyan-400" style={{ width: `${width}%` }} />
    </div>
  );
}

function MovementSlider({ score }: { score: number }) {
  const pctScore = Math.max(0, Math.min(1, score));
  return (
    <div>
      <div className="relative h-1.5 rounded-full bg-white/10">
        <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400" style={{ left: `${pctScore * 100}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-mute">
        <span>低</span>
        <span>高</span>
      </div>
    </div>
  );
}

export function LiveInsight({
  analysis,
  profile,
  live,
  streaming,
  demo,
  videoTime = 0,
  summary = null,
  events = [],
  hostedPresentation = false,
}: {
  analysis: AnalysisResult | null;
  profile: PetProfile;
  live: { id: ActivityId; evidence: string[]; confidence: number };
  streaming: boolean;
  demo: DemoVideo | null;
  videoTime?: number;
  summary?: ActivitySummary | null;
  events?: ActivityEvent[];
  hostedPresentation?: boolean;
}) {
  const det = analysis?.detection;
  const pose = analysis?.pose;
  const movementScore = analysis?.movement?.score ?? 0;
  const movementBand = movementBandZh(analysis?.movement?.band || pose?.movement.id);
  const poseConf = analysis?.poseQuality ?? 0;
  const poseEnough = poseConf >= 0.28;
  const activityConf = analysis?.activity?.confidence ?? live.confidence;
  const cvMeta = ACTIVITY_META[live.id] ?? { icon: "◌", label: live.id };
  const segment = demo ? demoActivityAt(demo, videoTime) : null;
  const headline = segment
    ? segment.activity === "detected"
      ? { icon: segment.icon, label: segment.label }
      : ACTIVITY_META[segment.activity] ?? { icon: segment.icon, label: segment.label }
    : cvMeta;
  const agrees = demo && !hostedPresentation ? cvAgreesWithDemo(segment?.activity ?? demo.expectedActivity, live.id, Boolean(det?.present)) : null;
  const evidence = demo
    ? hostedPresentation
      ? ["示範時間軸標籤", segment?.label ?? demo.title, "框線為示範用途（公開網頁未連接 YOLO 後端）"]
      : [
          "示範片段＋動作分析",
          agrees ? "✓ 動作分析一致" : "△ 動作分析與示範標籤不一致",
          ...live.evidence.slice(0, 5),
        ]
    : live.evidence;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="glass rounded-2xl p-3.5">
        <p className="text-[11px] tracking-[0.16em] text-mute">{copy.detection}</p>
        {det?.present ? (
          <>
            <p className="mt-1 text-lg font-semibold">🐕 {copy.detectedPet} {profile.name}</p>
            <p className="text-[12px] text-mute">{copy.dog}：{profile.name}</p>
          </>
        ) : (
          <p className="mt-1 text-lg font-semibold">未偵測到狗狗</p>
        )}
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <ConfCell label={copy.dogDetectConf} value={det?.present ? pct(det.confidence) : "—"} />
          <ConfCell label={copy.poseDetectConf} value={det?.present ? (poseEnough ? "資料足夠" : "資料不足") : "—"} />
          <ConfCell label={copy.activityJudgeConf} value={streaming && det?.present ? pct(activityConf) : "—"} />
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-mute hidden lg:block">{copy.confHint}</p>
      </div>

      <div className="glass rounded-2xl p-3.5">
        <p className="text-[11px] tracking-[0.16em] text-mute">{copy.current}</p>
        <p className="mt-1 text-lg font-semibold">
          {streaming ? `${headline.icon} ${headline.label}` : copy.waiting}
        </p>
        {demo && streaming && (
          <p className="mt-1 text-[11px] text-amber-200">
            {hostedPresentation ? "公開示範：活動標籤來自時間軸註解" : copy.demoAnalysis}
          </p>
        )}
        <p className="mt-1 font-mono text-xs text-cyan-300">
          {copy.activityJudgeConf} {streaming ? pct(activityConf) : "—"}
        </p>
        <p className="mt-1 text-[11px] text-mute">
          {copy.movement} {streaming ? movementBand : "—"}
        </p>
        {typeof analysis?.movement?.stateDuration === "number" && analysis.movement.stateDuration >= 1 && (
          <p className="mt-1 text-[11px] text-mute">已持續 {analysis.movement.stateDuration.toFixed(1)} 秒</p>
        )}
        {demo && (
          <p className="mt-1 text-[11px] text-mute">
            {copy.analysisMethod}：{copy.demoModeShort}
          </p>
        )}
        <div className="mt-2">
          <Meter value={activityConf} />
        </div>
      </div>

      <div className="glass rounded-2xl p-3.5">
        <p className="text-[11px] tracking-[0.16em] text-mute">{copy.evidenceTitle}</p>
        <ul className="mt-2 space-y-1 text-sm">
          {(evidence.length ? evidence.slice(0, 8) : ["資料不足"]).map((line) => (
            <li key={line} className="text-ink">
              {line.startsWith("△") || line.startsWith("✓") ? line : `✓ ${line.replace(/^✓\s*/, "")}`}
            </li>
          ))}
        </ul>
      </div>

      <div className="glass hidden rounded-2xl p-3.5 lg:block">
        <p className="text-[11px] tracking-[0.16em] text-mute">{copy.body}</p>
        <p className="mt-1 text-base font-semibold">{pose?.body.label ?? copy.insufficient}</p>
        <p className="mt-3 text-[11px] tracking-[0.16em] text-mute">{copy.movement}</p>
        <p className="mt-1 text-base font-semibold">{streaming ? movementBand : "—"}</p>
        {streaming && <div className="mt-2"><MovementSlider score={movementScore} /></div>}
        <p className="mt-1 font-mono text-[10px] text-mute">
          Movement Score {movementScore.toFixed(2)} · 整體 {(analysis?.movement?.global ?? 0).toFixed(2)} · 頭部 {(analysis?.movement?.head ?? 0).toFixed(2)}
        </p>
      </div>

      {demo && !hostedPresentation && (
        <div className="glass hidden rounded-2xl p-3.5 lg:block">
          <p className="text-[11px] tracking-[0.16em] text-amber-200/90">{copy.cvEngine}</p>
          <p className="mt-1 text-sm">
            {cvMeta.icon} {cvMeta.label}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-mute">{demo.hint}</p>
        </div>
      )}

      {demo && summary && new Set(events.map((event) => event.activity)).size >= 2 && (
        <div className="glass rounded-2xl p-3.5">
          <p className="text-[11px] tracking-[0.16em] text-mute">{copy.explanation}</p>
          <p className="mt-2 text-sm leading-relaxed">{summary.summary}</p>
          <p className="mt-3 text-[11px] tracking-[0.16em] text-mute">{copy.today}</p>
          <div className="mt-2">
            <TotalsRow events={events} />
          </div>
        </div>
      )}
    </div>
  );
}

function ConfCell({ label, value }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-1.5 py-2">
      <p className="text-[10px] leading-tight text-mute">{label}</p>
      <p className="mt-1 font-mono text-xs text-cyan-300">{value}</p>
    </div>
  );
}
