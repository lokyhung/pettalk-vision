import { ACTIVITY_META, type ActivityEvent, type ActivityId, type TimelineEvent } from "../types";

export type DemoActivityCode = ActivityId | "detected";

export interface DemoExpectedSegment {
  start: number;
  end: number;
  activity: DemoActivityCode;
  label: string;
  icon: string;
}

export interface DemoVideo {
  id: string;
  title: string;
  icon: string;
  src: string;
  duration: number;
  expectedActivity: ActivityId;
  expectedMovement: "low" | "medium" | "high";
  hint: string;
  expectedActivities: DemoExpectedSegment[];
}

/**
 * Demo annotation layer only. Independent of the real CV activity engine.
 * Timestamps follow the actual files in frontend/public/videos/.
 */
export const DEMO_SCENARIOS: DemoVideo[] = [
  {
    id: "playing",
    title: "狗狗玩耍",
    icon: "🎾",
    src: "/videos/dog-playing.mp4",
    duration: 8.59,
    expectedActivity: "playing",
    expectedMovement: "high",
    hint: "示範標籤：玩耍。真實 CV 未必偵測到玩具；若只有局部活動，引擎應輸出活動中而非休息。",
    expectedActivities: [
      { start: 0, end: 1.4, activity: "detected", label: "偵測到狗狗", icon: "🐕" },
      { start: 1.4, end: 5.0, activity: "playing", label: "開始玩耍", icon: "🎾" },
      { start: 5.0, end: 8.59, activity: "playing", label: "持續與玩具互動", icon: "🎾" },
    ],
  },
  {
    id: "walking",
    title: "狗狗走動",
    icon: "🚶",
    src: "/videos/dog-walking.mp4",
    duration: 5.12,
    expectedActivity: "exploring",
    expectedMovement: "high",
    hint: "示範標籤：走動。真實 CV 應看到整體位移。",
    expectedActivities: [
      { start: 0, end: 0.9, activity: "detected", label: "偵測到狗狗", icon: "🐕" },
      { start: 0.9, end: 5.12, activity: "exploring", label: "走動", icon: "🚶" },
    ],
  },
  {
    id: "resting",
    title: "狗狗休息",
    icon: "💤",
    src: "/videos/dog-resting.mp4",
    duration: 10,
    expectedActivity: "resting",
    expectedMovement: "low",
    hint: "示範標籤：休息。整體與局部移動都應偏低。",
    expectedActivities: [{ start: 0, end: 10, activity: "resting", label: "休息", icon: "💤" }],
  },
  {
    id: "eating",
    title: "狗狗進食",
    icon: "🦴",
    src: "/videos/dog-eating.mp4",
    duration: 8.3,
    expectedActivity: "eating",
    expectedMovement: "medium",
    hint: "示範標籤：進食。真實 CV 若未能確認碗／食物，應輸出可能進食或活動中，而不是靜止等待。",
    expectedActivities: [
      { start: 0, end: 1.3, activity: "detected", label: "偵測到狗狗", icon: "🐕" },
      { start: 1.3, end: 6.4, activity: "eating", label: "進食", icon: "🦴" },
      { start: 6.4, end: 8.3, activity: "eating", label: "進食減慢", icon: "🦴" },
    ],
  },
  {
    id: "mixed",
    title: "混合活動",
    icon: "🎬",
    src: "/videos/dog-mixed.mp4",
    duration: 30.84,
    expectedActivity: "active",
    expectedMovement: "medium",
    hint: "同一支片內有休息、走動、玩耍再回到休息。示範標籤會隨時間切換；真實 CV 仍獨立運行。",
    expectedActivities: [
      { start: 0, end: 6.0, activity: "resting", label: "休息", icon: "💤" },
      { start: 6.0, end: 11.12, activity: "exploring", label: "開始走動", icon: "🚶" },
      { start: 11.12, end: 19.71, activity: "playing", label: "開始玩耍", icon: "🎾" },
      { start: 19.71, end: 24.83, activity: "exploring", label: "再次走動", icon: "🚶" },
      { start: 24.83, end: 30.84, activity: "resting", label: "回到休息", icon: "💤" },
    ],
  },
];

export const DEMO_VIDEOS = DEMO_SCENARIOS;
export const DEFAULT_DEMO_ID = "playing";

export function demoById(id: string | null | undefined): DemoVideo {
  return DEMO_SCENARIOS.find((item) => item.id === id) ?? DEMO_SCENARIOS[0];
}

export function demoActivityAt(demo: DemoVideo, t: number): DemoExpectedSegment {
  const time = Number.isFinite(t) ? Math.max(0, t) : 0;
  const hit = demo.expectedActivities.find((seg) => time >= seg.start && time < seg.end);
  return hit ?? demo.expectedActivities[demo.expectedActivities.length - 1];
}

export function demoTimelineEvents(demo: DemoVideo, t: number): TimelineEvent[] {
  return demo.expectedActivities
    .filter((seg) => t + 0.05 >= seg.start)
    .map((seg) => ({
      t: seg.start,
      kind: "demo",
      id: seg.activity,
      label: seg.label,
      icon: seg.icon,
    }));
}

export function demoPlaybackEvents(
  demo: DemoVideo,
  t: number,
  petId: string,
  originMs: number,
): ActivityEvent[] {
  const time = Math.max(0, t);
  return demo.expectedActivities
    .filter((seg) => time + 0.05 >= seg.start && seg.activity !== "detected")
    .map((seg) => {
      const end = Math.min(time, seg.end);
      return {
        id: `demo-${demo.id}-${seg.start}`,
        petId,
        startTime: originMs + seg.start * 1000,
        endTime: originMs + Math.max(seg.start + 0.4, end) * 1000,
        activity: seg.activity as ActivityId,
        confidence: 0.72,
        evidence: ["示範時間軸片段", seg.label],
        detectedObjects: [],
        source: "demo" as const,
      };
    });
}

export function cvAgreesWithDemo(expected: DemoActivityCode, cv: ActivityId, present: boolean): boolean {
  if (expected === "detected") return present;
  if (!present) return false;
  if (expected === "playing") return cv === "playing" || cv === "active";
  if (expected === "eating") return cv === "eating" || cv === "active";
  if (expected === "exploring") return cv === "exploring" || cv === "active";
  if (expected === "resting") return cv === "resting";
  return cv === expected;
}
