export const INSUFFICIENT_ID = "insufficient";
export const NOT_VISIBLE_ID = "not_visible";
export const ANALYSING_ID = "analysing";

export type DashboardState =
  | "idle"
  | "no_dog"
  | "detected"
  | "pose"
  | "behaviour"
  | "insufficient"
  | "analysing";

export interface Keypoint {
  name: string;
  x: number;
  y: number;
  confidence: number;
  visible: boolean;
}

export interface Detection {
  present: boolean;
  label: string;
  confidence: number;
  bbox: [number, number, number, number] | null;
  count?: number;
  trackId?: number;
  trackHits?: number;
  iou?: number;
}

export interface PoseField {
  id: string;
  label: string;
}

export interface PoseInfo {
  head: PoseField;
  ears: PoseField;
  body: PoseField;
  tail: PoseField;
  movement: PoseField;
}

export interface LabelledScore {
  id?: string;
  label: string;
  confidence: number;
  icon: string;
}

export interface TimelineEvent {
  t: number;
  kind: string;
  id?: string;
  label: string;
  icon: string;
}

export interface MovementDebug {
  posture: string;
  postureId?: string;
  score: number;
  band: "low" | "medium" | "high" | string;
  global: number;
  globalBand?: string;
  head: number;
  headBand?: string;
  front: number;
  frontBand?: string;
  rear: number;
  rearBand?: string;
  bodyBand?: string;
  orientation: number;
  center: [number, number];
  prevCenter: [number, number] | null;
  positionChange: number;
  candidate: string;
  confirmed: string;
  stateDuration: number;
  samples: number;
}

export interface DebugInfo {
  model: string;
  device: string;
  fps: number;
  inferenceMs: number;
  dogConfidence: number;
  poseConfidence: number;
  dogCount: number;
  visibleKeypoints: number;
    currentBehaviour: string;
    possibleBehaviour: string;
    possibleMood: string;
    currentActivity?: string;
  behaviourStability: number;
  stableFrames: number;
  framesUsed: number;
  window: number;
}

export interface EvidenceItem {
  ok: boolean;
  text: string;
}

export interface AnalysisResult {
  t: number;
  state: DashboardState;
  message: string;
  detail?: string;
  liveStatus?: "live" | "analysing" | "waiting";
  detection: Detection;
  keypoints: Keypoint[];
  skeleton: [number, number][];
  pose: PoseInfo;
  action: LabelledScore;
  behaviour?: LabelledScore;
  mood: LabelledScore;
  evidence?: EvidenceItem[];
  cues: string[];
  why: string;
  observeNext: string;
  disclaimer?: string;
  statusFlags: string[];
  timeline: TimelineEvent[];
  model: string;
  device: string;
  latencyMs: number;
  poseQuality: number;
  explanationRevision?: number;
  thresholds?: { dog: number; keypoint: number };
  debug?: DebugInfo;
  activity?: LabelledScore & { evidence?: string[] };
  movement?: MovementDebug;
  objects?: DetectedObject[];
  location?: { id?: string; name?: string; type?: string } | null;
}

export interface DetectedObject {
  id: string;
  label: string;
  confidence: number;
  bbox: [number, number, number, number];
}

export type ActivityId =
  | "resting"
  | "exploring"
  | "playing"
  | "active"
  | "eating"
  | "drinking"
  | "door_waiting"
  | "following"
  | "waiting"
  | "analysing"
  | "insufficient";

export type ZoneType = "living" | "door" | "sofa" | "sleep" | "food" | "water" | "play";

export interface HomeZone {
  id: string;
  name: string;
  type: ZoneType;
  rect: [number, number, number, number];
}

export interface ActivityEvent {
  id: string;
  petId: string;
  startTime: number;
  endTime: number;
  activity: ActivityId;
  confidence: number;
  evidence: string[];
  location?: string;
  detectedObjects: string[];
  source: "live" | "demo";
}

export interface ActivitySummary {
  petId: string;
  startTime: number;
  endTime: number;
  totals: Record<string, number>;
  summary: string;
  notice: string;
  source: "rules" | "llm" | "demo";
}

export interface AppSettings {
  minActivitySeconds: number;
  debugMode: boolean;
  storyMode: boolean;
}

export type TabId = "home" | "camera" | "activity" | "profile" | "settings";

export const ACTIVITY_META: Record<
  ActivityId,
  { label: string; icon: string }
> = {
  resting: { label: "休息", icon: "🛋️" },
  exploring: { label: "走動／探索", icon: "🐕" },
  playing: { label: "玩耍", icon: "🎾" },
  active: { label: "活動中", icon: "🏃" },
  eating: { label: "可能進食", icon: "🍽️" },
  drinking: { label: "可能飲水", icon: "💧" },
  door_waiting: { label: "門口停留", icon: "🚪" },
  following: { label: "可能正在跟隨", icon: "👣" },
  waiting: { label: "靜止／等待", icon: "🧍" },
  analysing: { label: "分析中", icon: "◌" },
  insufficient: { label: "資料不足", icon: "◌" },
};

export const ZONE_PRESETS: { type: ZoneType; name: string }[] = [
  { type: "living", name: "客廳" },
  { type: "door", name: "門口" },
  { type: "sofa", name: "沙發區" },
  { type: "sleep", name: "睡覺區" },
  { type: "food", name: "飲食區" },
  { type: "water", name: "飲水區" },
  { type: "play", name: "玩耍區" },
];

export interface PetProfile {
  id: string;
  name: string;
  species: string;
  breed: string;
  age: string;
  gender: string;
  activityLevel: string;
  personality: string;
  traits: string[];
  likes: string;
  habits: string;
}

export const DEFAULT_PROFILE: PetProfile = {
  id: "pet-default",
  name: "豆豆",
  species: "狗狗",
  breed: "",
  age: "5 歲",
  gender: "未設定",
  activityLevel: "中",
  personality: "害羞、安靜",
  traits: ["害羞", "安靜"],
  likes: "玩球、食零食、坐窗邊",
  habits: "下午通常會休息",
};

export const PERSONALITY_TAGS = ["害羞", "活潑", "安靜", "好奇", "親人", "慢熱"] as const;

export type InputMode = "camera" | "demo";

export function isWeakLabel(field?: PoseField | LabelledScore | null) {
  const id = field && "id" in field ? field.id : undefined;
  const label = field?.label ?? "";
  return (
    id === INSUFFICIENT_ID ||
    id === NOT_VISIBLE_ID ||
    id === ANALYSING_ID ||
    label === "資料不足" ||
    label === "未能看見" ||
    label === "不可見" ||
    label === "分析中"
  );
}
