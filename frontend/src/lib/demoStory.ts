import type { ActivityEvent } from "../types";

/** Clearly labelled founder-demo story. Not real computer vision. */
export function buildDemoStory(petId: string, now = Date.now()): ActivityEvent[] {
  const start = now - 10 * 60 * 1000;
  const blocks: Array<[number, number, ActivityEvent["activity"], string[], string]> = [
    [0, 120, "resting", ["低活動", "躺下姿勢"], "沙發區"],
    [120, 180, "exploring", ["身體位置有明顯位移"], "客廳"],
    [180, 240, "playing", ["玩耍區活動", "重複移動"], "客廳"],
    [240, 300, "exploring", ["在客廳走動"], "客廳"],
    [300, 360, "door_waiting", ["處於門口區", "活動程度低"], "門口"],
    [360, 600, "resting", ["回到沙發", "活動程度低"], "沙發區"],
  ];
  return blocks.map(([a, b, activity, evidence, location], i) => ({
    id: `demo-${start}-${i}`,
    petId,
    startTime: start + a * 1000,
    endTime: start + b * 1000,
    activity,
    confidence: 0.72,
    evidence,
    location,
    detectedObjects: activity === "playing" ? ["示範：玩具（標記）"] : [],
    source: "demo",
  }));
}
