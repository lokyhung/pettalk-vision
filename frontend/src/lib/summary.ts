import type { ActivityEvent, ActivityId, ActivitySummary, PetProfile } from "../types";
import { ACTIVITY_META } from "../types";
import { formatDuration, totalsFor } from "./activity";
import { apiBase } from "./api";

export function ruleSummary(
  events: ActivityEvent[],
  profile: PetProfile,
  start: number,
  end: number,
): ActivitySummary {
  const totals = totalsFor(events);
  const name = profile.name || "豆豆";
  const ranked = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) {
    return {
      petId: profile.id,
      startTime: start,
      endTime: end,
      totals,
      summary: `累積足夠資料後，PetTalk 會提供${name}的活動摘要。`,
      notice: "正在建立活動紀錄。",
      source: "rules",
    };
  }
  const [mainId, mainSec] = ranked[0];
  const mainLabel = ACTIVITY_META[mainId as keyof typeof ACTIVITY_META]?.label || mainId;
  const sequence = consecutiveActivities(events);
  const sequential = sequence.length >= 2 ? sequentialNarrative(name, sequence) : "";
  const total = ranked.reduce((sum, [, v]) => sum + v, 0);
  const moving =
    (totals.exploring || 0) + (totals.active || 0) + (totals.playing || 0) + (totals.following || 0);
  const rest = (totals.resting || 0) + (totals.waiting || 0);
  let summary = sequential || `${name}過去 10 分鐘主要在${mainLabel}（約 ${formatDuration(mainSec)}）。`;
  const demo = events.some((e) => e.source === "demo");
  if (demo) {
    summary =
      sequential ||
      `${name}今日示範片段中主要在${mainLabel}（約 ${formatDuration(mainSec)}）。此摘要由短片活動事件推導，並非實際 10 分鐘鏡頭。`;
  } else if (!sequential && total > 0 && moving >= total * 0.22 && rest >= total * 0.22) {
    summary = `${name}過去 10 分鐘活動量中等，期間曾約 ${formatDuration(moving)} 持續活動及改變位置，其餘時間主要休息。`;
  } else if (total > 0 && moving >= total * 0.45) {
    summary = `${name}過去 10 分鐘活動量偏高，期間主要在走動、探索或活動中（約 ${formatDuration(moving)}）。`;
  }
  const others = ranked.slice(1).filter(([, s]) => s >= 15_000);
  if (others.length && !demo && !summary.includes("活動量中等")) {
    summary +=
      "期間曾" +
      others
        .map(([id, s]) => `${ACTIVITY_META[id as keyof typeof ACTIVITY_META]?.label || id}約 ${formatDuration(s)}`)
        .join("，") +
      "。";
  }
  let notice = "";
  const door = totals.door_waiting || 0;
  if (door >= 15_000) {
    notice = `${name}曾在門口停留約 ${formatDuration(door)}。如果這種行為近期經常出現，可以留意牠是否在等待主人回家。`;
  }
  const lively = profile.traits.includes("活潑");
  const active = moving;
  if (lively && mainId === "resting" && active < 60_000) {
    notice = [notice, `${name}的資料標明較為活潑，而這段時間活動量偏低，只作背景參考，並不能證明身體不適。`]
      .filter(Boolean)
      .join(" ");
  }
  if (profile.habits && mainId === "resting") {
    notice = [notice, `習慣紀錄（${profile.habits}）只作說明背景。`].filter(Boolean).join(" ");
  }
  if (!notice) notice = "這段時間未見到特別需要主人即時留意的情況。";
  return {
    petId: profile.id,
    startTime: start,
    endTime: end,
    totals,
    summary: demo ? `【示範資料】${summary}` : summary,
    notice: demo ? `【示範資料】${notice}` : notice,
    source: demo ? "demo" : "rules",
  };
}

function consecutiveActivities(events: ActivityEvent[]): ActivityId[] {
  const ordered = [...events].sort((a, b) => a.startTime - b.startTime);
  const ids: ActivityId[] = [];
  for (const event of ordered) {
    if (event.activity === "analysing" || event.activity === "insufficient") continue;
    if (ids[ids.length - 1] !== event.activity) ids.push(event.activity);
  }
  return ids;
}

function activityVerb(id: ActivityId): string {
  if (id === "resting") return "休息";
  if (id === "exploring" || id === "following") return "走動";
  if (id === "playing") return "玩耍";
  if (id === "eating") return "進食";
  if (id === "waiting" || id === "door_waiting") return "停留";
  if (id === "drinking") return "飲水";
  if (id === "active") return "活動";
  return ACTIVITY_META[id]?.label || id;
}

function sequentialNarrative(name: string, sequence: ActivityId[]): string {
  const verbs = sequence.map(activityVerb);
  if (verbs.length === 2) {
    return `${name}先${verbs[0]}了一段時間，之後開始${verbs[1]}。`;
  }
  const first = verbs[0];
  const last = verbs[verbs.length - 1];
  const mid = uniqueKeep(verbs.slice(1, -1));
  const midText = mid.join("及");
  if (last === first && mid.length) {
    return `${name}先${first}了一段時間，之後開始${midText}，最後再次回到${last}狀態。`;
  }
  if (mid.length) {
    return `${name}先${first}了一段時間，之後${midText}，最後${last}。`;
  }
  return `${name}先${first}了一段時間，之後開始${last}。`;
}

function uniqueKeep(items: string[]): string[] {
  const out: string[] = [];
  for (const item of items) {
    if (!out.includes(item)) out.push(item);
  }
  return out;
}

export async function maybeLlmSummary(
  summary: ActivitySummary,
  events: ActivityEvent[],
  profile: PetProfile,
): Promise<ActivitySummary> {
  try {
    const res = await fetch(`${apiBase() || "/api"}/summarize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        totals: summary.totals,
        events: events.map((e) => ({
          activity: e.activity,
          duration: Math.round(e.endTime - e.startTime),
          location: e.location,
          evidence: e.evidence,
        })),
        periodStart: summary.startTime,
        periodEnd: summary.endTime,
        profile,
      }),
    });
    if (!res.ok) return summary;
    const data = (await res.json()) as { summary?: string; notice?: string; source?: string };
    if (!data.summary) return summary;
    const demo = summary.source === "demo";
    const text = data.summary.startsWith("【") ? data.summary : demo ? `【示範資料】${data.summary}` : data.summary;
    return {
      ...summary,
      summary: text,
      notice: data.notice || summary.notice,
      source: demo ? "demo" : data.source === "llm" ? "llm" : summary.source,
    };
  } catch {
    return summary;
  }
}
