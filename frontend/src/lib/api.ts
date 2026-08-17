import type { AnalysisResult, Keypoint, PetProfile } from "../types";

export function apiBase(): string {
  return import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "";
}

export function wsUrl(): string {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  if (import.meta.env.DEV) return `${proto}//${location.host}/ws/analyze`;
  const base = apiBase();
  if (base) {
    const u = new URL(base);
    const wsProto = u.protocol === "https:" ? "wss:" : "ws:";
    return `${wsProto}//${u.host}/ws/analyze`;
  }
  return `${proto}//${location.host}/ws/analyze`;
}

export async function fetchHealth() {
  const res = await fetch(`${apiBase() || "/api"}/health`);
  if (!res.ok) throw new Error("Backend unavailable");
  return res.json();
}

export async function fetchExplanation(analysis: AnalysisResult, profile: PetProfile) {
  try {
    const res = await fetch(`${apiBase() || "/api"}/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analysis, profile }),
    });
    if (!res.ok) return null;
    return (await res.json()) as {
      whyPetTalkThinksThis: string;
      whatYouCanObserveNext: string;
      source: string;
    };
  } catch {
    return null;
  }
}

export function lerpKeypoints(from: Keypoint[], to: Keypoint[], t: number): Keypoint[] {
  if (!from.length) return to;
  const amt = Math.max(0, Math.min(1, t));
  return to.map((kp, i) => {
    const prev = from[i];
    if (!prev) return kp;
    return {
      ...kp,
      x: prev.x + (kp.x - prev.x) * amt,
      y: prev.y + (kp.y - prev.y) * amt,
      confidence: prev.confidence + (kp.confidence - prev.confidence) * amt,
      visible: kp.visible || prev.visible,
    };
  });
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}
