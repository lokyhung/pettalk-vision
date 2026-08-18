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
}

export interface PetProfile {
  name: string;
  species: string;
  breed: string;
  age: string;
  personality: string;
  traits: string[];
  likes: string;
}

export const DEFAULT_PROFILE: PetProfile = {
  name: "Mochi",
  species: "狗狗",
  breed: "",
  age: "5 歲",
  personality: "害羞、安靜",
  traits: ["害羞", "安靜"],
  likes: "玩球、食零食、坐窗邊",
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
