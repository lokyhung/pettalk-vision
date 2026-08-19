import type { ActivityEvent, ActivityId, AnalysisResult, HomeZone, TimelineEvent } from "../types";

export function zoneAt(bbox: number[] | null | undefined, zones: HomeZone[]): HomeZone | null {
  if (!bbox || bbox.length < 4) return null;
  const cx = (bbox[0] + bbox[2]) / 2;
  const cy = (bbox[1] + bbox[3]) / 2;
  return zones.find((z) => cx >= z.rect[0] && cx <= z.rect[2] && cy >= z.rect[1] && cy <= z.rect[3]) ?? null;
}

export function liveActivity(analysis: AnalysisResult | null, zones: HomeZone[]): {
  id: ActivityId;
  evidence: string[];
  confidence: number;
  location?: string;
  objects: string[];
} {
  if (!analysis?.detection.present) {
    return { id: "insufficient", evidence: ["未偵測到狗狗"], confidence: 0, objects: [] };
  }
  const fromApi = analysis.activity?.id as ActivityId | undefined;
  const evidence = analysis.activity?.evidence ?? analysis.cues ?? [];
  const objects = (analysis.objects ?? []).map((o) => o.label);
  const zone = zoneAt(analysis.detection.bbox, zones);
  if (fromApi) {
    return {
      id: fromApi,
      evidence: evidence.length ? evidence : fromApi === "analysing" ? ["正在累積活動資料"] : evidence,
      confidence: analysis.activity?.confidence ?? 0,
      location: analysis.location?.name || zone?.name,
      objects,
    };
  }
  return { id: "analysing", evidence: ["正在累積活動資料"], confidence: 0.2, location: zone?.name, objects };
}

export class SessionTracker {
  private pending: { id: ActivityId; since: number } | null = null;
  private open: ActivityEvent | null = null;

  constructor(
    private petId: string,
    private minSeconds: number,
    private source: "live" | "demo" = "live",
  ) {}

  ingest(
    now: number,
    live: { id: ActivityId; evidence: string[]; confidence: number; location?: string; objects: string[] },
  ): ActivityEvent | null {
    if (live.id === "analysing" || live.id === "insufficient") {
      return this.flush(now);
    }
    if (!this.pending || this.pending.id !== live.id) {
      this.pending = { id: live.id, since: now };
    }
    const held = now - this.pending.since;
    if (held < this.minSeconds * 1000) {
      return null;
    }
    if (this.open && this.open.activity === live.id) {
      this.open.endTime = now;
      this.open.confidence = Math.max(this.open.confidence, live.confidence);
      this.open.evidence = unique(
        [...(this.open.evidence || []).filter((line) => !line.startsWith("活動持續") && !line.startsWith("動作持續超過")), ...live.evidence].filter(Boolean),
      );
      this.open.detectedObjects = unique([...(this.open.detectedObjects || []), ...live.objects]);
      if (live.location) this.open.location = live.location;
      return this.open;
    }
    const closed = this.flush(now);
    this.open = {
      id: `evt-${now}-${live.id}`,
      petId: this.petId,
      startTime: now - this.minSeconds * 1000,
      endTime: now,
      activity: live.id,
      confidence: live.confidence,
      evidence: live.evidence.slice(0, 8),
      location: live.location,
      detectedObjects: live.objects,
      source: this.source,
    };
    return closed;
  }

  flush(now: number): ActivityEvent | null {
    if (!this.open) return null;
    this.open.endTime = now;
    const done = this.open;
    this.open = null;
    this.pending = null;
    return done;
  }

  current(): ActivityEvent | null {
    return this.open;
  }
}

function unique(items: string[]) {
  return [...new Set(items.filter(Boolean))].slice(0, 8);
}

export function clipToWindow(events: ActivityEvent[], start: number, end: number): ActivityEvent[] {
  return events
    .filter((e) => e.endTime > start && e.startTime < end)
    .map((e) => ({
      ...e,
      startTime: Math.max(e.startTime, start),
      endTime: Math.min(e.endTime, end),
    }))
    .filter((e) => e.endTime - e.startTime >= 1);
}

export function totalsFor(events: ActivityEvent[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const e of events) {
    const dur = Math.max(0, e.endTime - e.startTime);
    totals[e.activity] = (totals[e.activity] || 0) + dur;
  }
  return totals;
}

export function formatDuration(ms: number): string {
  const seconds = ms >= 1000 ? ms / 1000 : ms;
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} 秒`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s ? `${m} 分 ${s} 秒` : `${m} 分鐘`;
}

export function clock(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function movementBandZh(band?: string | null): string {
  if (band === "low") return "低";
  if (band === "medium") return "中";
  if (band === "high") return "高";
  return "—";
}

export function groupTimeline(events: TimelineEvent[]): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  for (const event of events) {
    const last = out[out.length - 1];
    if (last && last.label === event.label && (last.id || "") === (event.id || "")) continue;
    out.push(event);
  }
  return out;
}
