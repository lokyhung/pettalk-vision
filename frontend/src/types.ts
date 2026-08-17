export const INSUFFICIENT = "Insufficient visual evidence";

export type DashboardState =
  | "idle"
  | "no_dog"
  | "detected"
  | "pose"
  | "behaviour"
  | "insufficient";

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
}

export interface PoseInfo {
  head: string;
  ears: string;
  body: string;
  tail: string;
  movement: string;
}

export interface LabelledScore {
  label: string;
  confidence: number;
  icon: string;
}

export interface TimelineEvent {
  t: number;
  kind: string;
  label: string;
  icon: string;
}

export interface AnalysisResult {
  t: number;
  state: DashboardState;
  message: string;
  detection: Detection;
  keypoints: Keypoint[];
  skeleton: [number, number][];
  pose: PoseInfo;
  action: LabelledScore;
  mood: LabelledScore;
  cues: string[];
  why: string;
  observeNext: string;
  statusFlags: string[];
  timeline: TimelineEvent[];
  model: string;
  device: string;
  latencyMs: number;
  poseQuality: number;
}

export interface PetProfile {
  name: string;
  species: string;
  age: string;
  personality: string;
}

export const DEFAULT_PROFILE: PetProfile = {
  name: "Mochi",
  species: "Dog",
  age: "5 years",
  personality: "Shy / Playful",
};

export type InputMode = "camera" | "demo";
