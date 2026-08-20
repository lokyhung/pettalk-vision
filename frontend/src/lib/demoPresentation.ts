import { demoActivityAt, type DemoVideo } from "./demos";
import {
  ACTIVITY_META,
  type ActivityId,
  type AnalysisResult,
  type Keypoint,
} from "../types";

/** Skeleton indices aligned with backend/app/keypoints.py */
const SKELETON: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 22],
  [6, 7],
  [7, 8],
  [8, 22],
  [3, 4],
  [4, 5],
  [5, 12],
  [9, 10],
  [10, 11],
  [11, 12],
  [12, 13],
  [22, 12],
  [22, 23],
  [23, 17],
  [17, 16],
  [23, 16],
  [16, 20],
  [16, 21],
  [20, 14],
  [21, 15],
];

const KP_NAMES = [
  "front_left_paw",
  "front_left_knee",
  "front_left_elbow",
  "rear_left_paw",
  "rear_left_knee",
  "rear_left_elbow",
  "front_right_paw",
  "front_right_knee",
  "front_right_elbow",
  "rear_right_paw",
  "rear_right_knee",
  "rear_right_elbow",
  "tail_start",
  "tail_end",
  "left_ear_base",
  "right_ear_base",
  "nose",
  "chin",
  "left_ear_tip",
  "right_ear_tip",
  "left_eye",
  "right_eye",
  "withers",
  "throat",
] as const;

/** Illustrative overlay for hosted demo when the Python CV backend is unavailable. */
export function buildDemoPresentationAnalysis(demo: DemoVideo, videoTime: number): AnalysisResult {
  const segment = demoActivityAt(demo, videoTime);
  const activityId: ActivityId =
    segment.activity === "detected" ? "analysing" : (segment.activity as ActivityId);
  const activityMeta = ACTIVITY_META[activityId] ?? { icon: "◌", label: activityId };
  const movementScore =
    demo.expectedMovement === "high" ? 0.52 : demo.expectedMovement === "medium" ? 0.34 : 0.14;
  const bbox = demoBBox(segment.activity, videoTime);
  const keypoints = demoKeypoints(bbox, segment.activity, videoTime);

  return {
    t: videoTime,
    state: activityId === "analysing" ? "detected" : "behaviour",
    message: "示範模式",
    detail: "公開網頁未連接本機 YOLO 後端；框線與骨架為示範用途，活動標籤來自時間軸註解。",
    liveStatus: "live",
    detection: {
      present: true,
      label: "dog",
      confidence: 0.72,
      bbox,
      count: 1,
    },
    keypoints,
    skeleton: SKELETON,
    pose: {
      head: { id: "visible", label: "可見" },
      ears: { id: "visible", label: "可見" },
      body: {
        id: segment.activity === "resting" ? "lying" : "standing",
        label: segment.activity === "resting" ? "躺臥" : "站立",
      },
      tail: { id: "visible", label: "可見" },
      movement: {
        id: demo.expectedMovement,
        label: demo.expectedMovement === "high" ? "高" : demo.expectedMovement === "medium" ? "中" : "低",
      },
    },
    action: { label: activityMeta.label, confidence: 0.72, icon: activityMeta.icon },
    mood: { label: "—", confidence: 0, icon: "◌" },
    cues: [segment.label, "示範時間軸標籤"],
    why: "",
    observeNext: "",
    statusFlags: ["demo-presentation"],
    timeline: [],
    model: "demo-annotation",
    device: "hosted",
    latencyMs: 0,
    poseQuality: 0.62,
    thresholds: { dog: 0.55, keypoint: 0.42 },
    activity: {
      id: activityId,
      label: activityMeta.label,
      confidence: 0.72,
      icon: activityMeta.icon,
      evidence: [segment.label, "示範標籤（非即時 CV）"],
    },
    movement: {
      posture: segment.activity === "resting" ? "lying" : "standing",
      score: movementScore,
      band: demo.expectedMovement,
      global: movementScore * 0.7,
      head: movementScore * 0.35,
      front: movementScore * 0.5,
      rear: movementScore * 0.45,
      orientation: 0,
      center: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2],
      prevCenter: null,
      positionChange: movementScore * 0.08,
      candidate: activityId,
      confirmed: activityId,
      stateDuration: Math.max(0.5, videoTime - segment.start),
      samples: 8,
    },
  };
}

function demoBBox(activity: string, t: number): [number, number, number, number] {
  const sway = Math.sin(t * 1.6) * 0.012;
  if (activity === "resting") {
    return [0.24 + sway, 0.52, 0.76 + sway, 0.9];
  }
  if (activity === "exploring") {
    return [0.22 + sway * 2, 0.4 + Math.sin(t * 2.2) * 0.02, 0.74 + sway * 2, 0.88];
  }
  if (activity === "playing") {
    return [0.26 + sway, 0.36, 0.78 + sway, 0.86];
  }
  if (activity === "eating") {
    return [0.3 + sway, 0.44, 0.72 + sway, 0.84];
  }
  return [0.28 + sway, 0.42, 0.74 + sway, 0.88];
}

function demoKeypoints(
  bbox: [number, number, number, number],
  activity: string,
  t: number,
): Keypoint[] {
  const [x1, y1, x2, y2] = bbox;
  const w = x2 - x1;
  const h = y2 - y1;
  const pt = (fx: number, fy: number, name: string): Keypoint => ({
    name,
    x: x1 + fx * w,
    y: y1 + fy * h,
    confidence: 0.74,
    visible: true,
  });

  const bob = activity === "playing" ? Math.sin(t * 5) * 0.02 : 0;
  const lean = activity === "resting" ? 0.08 : 0;

  const positions: Record<string, [number, number]> = {
    nose: [0.52, 0.08 + bob],
    chin: [0.52, 0.16 + bob],
    left_eye: [0.44, 0.1 + bob],
    right_eye: [0.6, 0.1 + bob],
    left_ear_base: [0.4, 0.06 + bob],
    right_ear_base: [0.64, 0.06 + bob],
    left_ear_tip: [0.36, 0.02 + bob],
    right_ear_tip: [0.68, 0.02 + bob],
    throat: [0.52, 0.22 + bob],
    withers: [0.52, 0.3 + bob + lean],
    front_left_elbow: [0.28, 0.34 + bob],
    front_right_elbow: [0.76, 0.34 + bob],
    front_left_knee: [0.26, 0.52 + bob],
    front_right_knee: [0.78, 0.52 + bob],
    front_left_paw: [0.24, 0.68 + bob],
    front_right_paw: [0.8, 0.68 + bob],
    rear_left_elbow: [0.34, 0.42 + lean],
    rear_right_elbow: [0.7, 0.42 + lean],
    rear_left_knee: [0.32, 0.58 + lean],
    rear_right_knee: [0.72, 0.58 + lean],
    rear_left_paw: [0.3, 0.78 + lean],
    rear_right_paw: [0.74, 0.78 + lean],
    tail_start: [0.52, 0.46 + lean],
    tail_end: [0.58, 0.62 + lean],
  };

  return KP_NAMES.map((name) => {
    const pos = positions[name];
    return pos ? pt(pos[0], pos[1], name) : pt(0.5, 0.5, name);
  });
}
