import { isWeakLabel, ACTIVITY_META, type AnalysisResult, type DashboardState } from "../types";
import { pct } from "../lib/api";
import { copy } from "../lib/i18n";
import { movementBandZh } from "../lib/activity";

function Meter({ value }: { value: number }) {
  const width = Math.max(0, Math.min(100, value * 100));
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
      <div className="h-full rounded-full bg-cyan-400" style={{ width: `${width}%` }} />
    </div>
  );
}

function Row({ label, value, weak }: { label: string; value: string; weak?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-[11px] text-mute">{label}</span>
      <span className={`text-right text-sm ${weak ? "text-mute/80" : "text-ink"}`}>{value}</span>
    </div>
  );
}

function stateCopy(state: DashboardState | undefined, analysis: AnalysisResult | null) {
  if (analysis?.message) {
    return { title: analysis.message, body: analysis.detail || "" };
  }
  switch (state) {
    case "no_dog":
      return { title: "未偵測到狗狗", body: "請將狗狗移入畫面。" };
    case "detected":
      return { title: "偵測到狗狗", body: "正在收集身體姿勢線索。" };
    case "pose":
      return { title: "姿勢追蹤中", body: "骨架已對準偵測到的狗狗。" };
    case "behaviour":
      return { title: "可能行為", body: "解讀只根據可觀察線索。" };
    case "insufficient":
      return { title: "資料不足", body: "請讓寵物完整進入畫面。" };
    case "analysing":
      return { title: "分析中", body: "需要連續數幀穩定線索才會作出判斷。" };
    default:
      return { title: "等待偵測", body: "請啟動鏡頭或使用示範影片。" };
  }
}

export function AnalysisPanel({
  analysis,
  debugMode,
}: {
  analysis: AnalysisResult | null;
  debugMode: boolean;
}) {
  const det = analysis?.detection;
  const pose = analysis?.pose;
  const copyState = stateCopy(analysis?.state, analysis);
  const actionWeak = !analysis || isWeakLabel(analysis.action);
  const behaviourWeak = !analysis || isWeakLabel(analysis.behaviour ?? analysis.action);
  const moodWeak = !analysis || isWeakLabel(analysis.mood);
  const evidence = analysis?.evidence;
  const debug = analysis?.debug;
  const mv = analysis?.movement;
  const activityLabel = (id?: string) =>
    (id && ACTIVITY_META[id as keyof typeof ACTIVITY_META]?.label) || id || "—";

  return (
    <div className="flex flex-col gap-2.5">
      <div className="glass rounded-2xl p-3.5">
        <p className="text-[11px] tracking-[0.16em] text-cyan-300/80">系統狀態</p>
        <h3 className="mt-1 text-base font-semibold">{copyState.title}</h3>
        <p className="mt-0.5 text-xs leading-relaxed text-mute">{copyState.body}</p>
      </div>

      <div className="glass rounded-2xl p-3.5">
        <p className="text-[11px] tracking-[0.16em] text-mute">{copy.detection}</p>
        <div className="mt-1.5 flex items-end justify-between">
          <span className="text-lg font-semibold">{det?.present ? `🐕 ${copy.dog}` : "未偵測到狗狗"}</span>
          <span className="font-mono text-sm text-cyan-300" title={copy.poseConfidenceTip}>
            {det?.present ? pct(det.confidence) : "—"} {copy.confidence}
          </span>
        </div>
        <div className="mt-2">
          <Meter value={det?.confidence ?? 0} />
        </div>
        {typeof det?.count === "number" && det.count > 1 && (
          <p className="mt-2 text-[11px] text-mute">畫面中偵測到 {det.count} 隻狗狗，目前分析可信度最高的一隻。</p>
        )}
      </div>

      <div className="glass rounded-2xl p-3.5">
        <p className="text-[11px] tracking-[0.16em] text-lime-300/80">{copy.saw}</p>
        <ul className="mt-2 space-y-1.5 text-sm">
          {(evidence && evidence.length > 0
            ? evidence
            : [{ ok: false, text: "尚無偵測結果" }]
          ).map((item) => (
            <li key={item.text} className="flex items-start gap-2">
              <span className={item.ok ? "text-lime-300" : "text-mute"}>{item.ok ? "✓" : "○"}</span>
              <span className={item.ok ? "text-ink" : "text-mute"}>{item.text}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 divide-y divide-white/5 border-t border-white/5 pt-2">
          <Row label={copy.body} value={pose?.body.label ?? copy.insufficient} weak={isWeakLabel(pose?.body)} />
          <Row label={copy.head} value={pose?.head.label ?? copy.notVisible} weak={isWeakLabel(pose?.head)} />
          <Row label={copy.ears} value={pose?.ears.label ?? copy.notVisible} weak={isWeakLabel(pose?.ears)} />
          <Row label={copy.tail} value={pose?.tail.label ?? copy.notVisible} weak={isWeakLabel(pose?.tail)} />
          <Row
            label={copy.movement}
            value={pose?.movement.label ?? copy.insufficient}
            weak={isWeakLabel(pose?.movement)}
          />
        </div>
      </div>

      <div className="glass rounded-2xl p-3.5">
        <p className="text-[11px] tracking-[0.16em] text-cyan-300/80">{copy.inferred}</p>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <div>
            <p className="text-[11px] text-mute">{copy.action}</p>
            <p className="mt-1 text-base font-semibold">
              {behaviourWeak ? copy.insufficient : (analysis?.behaviour ?? analysis?.action)?.label}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-mute">{copy.mood}</p>
            <p className="mt-1 text-base font-semibold">{moodWeak ? copy.insufficient : analysis?.mood.label}</p>
          </div>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-mute">
          可能行為與可能狀態是根據可觀察線索作出的推測，並不是情緒診斷。
        </p>
      </div>

      <div className="glass rounded-2xl p-3.5">
        <p className="text-[11px] tracking-[0.16em] text-mute">偵測結果 · {copy.body}</p>
        <p className="mt-1.5 text-lg font-semibold">
          {analysis?.action.icon} {actionWeak ? copy.insufficient : analysis?.action.label}
        </p>
        <p className="mt-1 font-mono text-xs text-cyan-300" title={copy.poseConfidenceTip}>
          {copy.confidence}：{actionWeak ? "—" : pct(analysis!.action.confidence)}
        </p>
        <div className="mt-2">
          <Meter value={actionWeak ? 0 : analysis!.action.confidence} />
        </div>
      </div>

      <div className="glass rounded-2xl p-3.5">
        <p className="text-[11px] tracking-[0.16em] text-mute">{copy.why}</p>
        <p className="mt-1.5 text-sm leading-relaxed text-ink/90">
          {analysis?.why || "正在等候畫面中的可觀察線索。"}
        </p>
      </div>

      {debugMode && (
        <div className="glass rounded-2xl p-3.5 font-mono text-[11px]">
          <p className="tracking-[0.16em] text-amber-200/90">{copy.debugMode}</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-mute">
            <dt>目前姿勢</dt>
            <dd className="text-ink">{mv?.posture || pose?.body.label || "—"}</dd>
            <dt>整體移動</dt>
            <dd className="text-ink">{movementBandZh(mv?.globalBand)} ({mv?.global ?? "—"})</dd>
            <dt>頭部移動</dt>
            <dd className="text-ink">{movementBandZh(mv?.headBand)} ({mv?.head ?? "—"})</dd>
            <dt>身體移動</dt>
            <dd className="text-ink">{movementBandZh(mv?.bodyBand)}</dd>
            <dt>移動分數</dt>
            <dd className="text-ink">{mv?.score ?? "—"}</dd>
            <dt>上一位置</dt>
            <dd className="text-ink">{mv?.prevCenter ? `(${mv.prevCenter[0]}, ${mv.prevCenter[1]})` : "—"}</dd>
            <dt>目前位置</dt>
            <dd className="text-ink">{mv?.center ? `(${mv.center[0]}, ${mv.center[1]})` : "—"}</dd>
            <dt>位置變化</dt>
            <dd className="text-ink">{mv?.positionChange ?? "—"}</dd>
            <dt>候選狀態</dt>
            <dd className="text-ink">{activityLabel(mv?.candidate)}</dd>
            <dt>確認狀態</dt>
            <dd className="text-ink">{activityLabel(mv?.confirmed)}</dd>
            <dt>狀態持續</dt>
            <dd className="text-ink">{mv ? `${mv.stateDuration} 秒` : "—"}</dd>
            <dt>樣本數</dt>
            <dd className="text-ink">{mv?.samples ?? "—"}</dd>
            <dt>MODEL</dt>
            <dd className="text-ink">{debug?.model || analysis?.model || "—"}</dd>
            <dt>DEVICE</dt>
            <dd className="text-ink">{debug?.device || analysis?.device || "—"}</dd>
            <dt>FPS</dt>
            <dd className="text-ink">{debug?.fps ?? "—"}</dd>
            <dt>INFERENCE</dt>
            <dd className="text-ink">{debug?.inferenceMs ?? analysis?.latencyMs ?? "—"} ms</dd>
            <dt>DOG CONF</dt>
            <dd className="text-ink">{debug ? debug.dogConfidence.toFixed(3) : "—"}</dd>
            <dt>POSE CONF</dt>
            <dd className="text-ink">{debug ? debug.poseConfidence.toFixed(3) : "—"}</dd>
            <dt>KEYPOINTS</dt>
            <dd className="text-ink">{debug?.visibleKeypoints ?? "—"}</dd>
          </dl>
        </div>
      )}

      <div className="glass rounded-2xl p-3.5">
        <p className="text-[11px] tracking-[0.16em] text-mute">{copy.notice}</p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-mute">
          {analysis?.disclaimer || "以上為 AI 根據可觀察行為作出的推測，並非寵物情緒或健康狀況的診斷。"}
        </p>
      </div>
    </div>
  );
}
