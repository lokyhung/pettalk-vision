import { INSUFFICIENT, type AnalysisResult, type DashboardState } from "../types";
import { pct } from "../lib/api";

function Meter({ value }: { value: number }) {
  const width = Math.max(0, Math.min(100, value * 100));
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
      <div className="h-full rounded-full bg-cyan-400" style={{ width: `${width}%` }} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const weak = value === INSUFFICIENT;
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-[11px] uppercase tracking-[0.16em] text-mute">{label}</span>
      <span className={`text-right text-sm ${weak ? "text-mute/80" : "text-ink"}`}>{value}</span>
    </div>
  );
}

function stateCopy(state: DashboardState | undefined, analysis: AnalysisResult | null) {
  switch (state) {
    case "no_dog":
      return { title: "No dog detected", body: "Move a dog into the camera view." };
    case "detected":
      return { title: "Dog detected", body: "Collecting pose evidence from the silhouette." };
    case "pose":
      return { title: "Pose tracking active", body: "Skeleton is locked to the detected dog." };
    case "behaviour":
      return { title: "Possible behaviour", body: "Interpretation is based on observed cues only." };
    case "insufficient":
      return { title: "Insufficient visual evidence", body: "Try a clearer view of the dog's body." };
    default:
      return { title: analysis?.message || "Waiting", body: "Start the camera or demo video." };
  }
}

export function AnalysisPanel({ analysis }: { analysis: AnalysisResult | null }) {
  const det = analysis?.detection;
  const pose = analysis?.pose;
  const copy = stateCopy(analysis?.state, analysis);
  const actionInsufficient = !analysis || analysis.action.label === INSUFFICIENT;
  const moodInsufficient = !analysis || analysis.mood.label === INSUFFICIENT;

  return (
    <aside className="flex w-full shrink-0 flex-col gap-3 lg:w-[340px]">
      <div className="glass rounded-2xl p-4">
        <p className="font-mono text-[10px] tracking-[0.22em] text-cyan-300/80">SYSTEM STATE</p>
        <h3 className="mt-1 text-lg font-semibold">{copy.title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-mute">{copy.body}</p>
      </div>

      <div className="glass rounded-2xl p-4">
        <p className="font-mono text-[10px] tracking-[0.22em] text-mute">DETECTION</p>
        <div className="mt-2 flex items-end justify-between">
          <span className="text-xl font-semibold">{det?.present ? "Dog" : "—"}</span>
          <span className="font-mono text-sm text-cyan-300">
            {det?.present ? pct(det.confidence) : "0.0%"} confidence
          </span>
        </div>
        <div className="mt-3">
          <Meter value={det?.confidence ?? 0} />
        </div>
      </div>

      <div className="glass rounded-2xl p-4">
        <p className="font-mono text-[10px] tracking-[0.22em] text-mute">BODY / POSE</p>
        <div className="mt-2 divide-y divide-white/5">
          <Row label="Head" value={pose?.head ?? INSUFFICIENT} />
          <Row label="Ears" value={pose?.ears ?? INSUFFICIENT} />
          <Row label="Body" value={pose?.body ?? INSUFFICIENT} />
          <Row label="Tail" value={pose?.tail ?? INSUFFICIENT} />
          <Row label="Movement" value={pose?.movement ?? "Low"} />
        </div>
      </div>

      <div className="glass rounded-2xl p-4">
        <p className="font-mono text-[10px] tracking-[0.22em] text-mute">ACTION</p>
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-lg font-semibold">
            {analysis?.action.icon} {actionInsufficient ? INSUFFICIENT : analysis?.action.label}
          </p>
        </div>
        <p className="mt-2 font-mono text-xs text-cyan-300">
          Confidence: {actionInsufficient ? "—" : pct(analysis!.action.confidence)}
        </p>
        <div className="mt-2">
          <Meter value={actionInsufficient ? 0 : analysis!.action.confidence} />
        </div>
      </div>

      <div className="glass rounded-2xl p-4">
        <p className="font-mono text-[10px] tracking-[0.22em] text-mute">POSSIBLE MOOD</p>
        <p className="mt-2 text-lg font-semibold">
          {analysis?.mood.icon} {moodInsufficient ? INSUFFICIENT : analysis?.mood.label}
        </p>
        <p className="mt-2 font-mono text-xs text-cyan-300">
          Confidence: {moodInsufficient ? "—" : pct(analysis!.mood.confidence)}
        </p>
        <div className="mt-2">
          <Meter value={moodInsufficient ? 0 : analysis!.mood.confidence} />
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-mute">
          A possible interpretation of visible cues — not the dog&apos;s actual emotional state.
        </p>
      </div>

      <div className="glass rounded-2xl p-4">
        <p className="font-mono text-[10px] tracking-[0.22em] text-mute">WHY?</p>
        <p className="mt-2 text-sm leading-relaxed text-ink/90">
          {analysis?.why || "Waiting for visual evidence from the live stream."}
        </p>
      </div>
    </aside>
  );
}
