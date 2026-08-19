import { useEffect, useRef, useState } from "react";
import { liveActivity, SessionTracker, clipToWindow, totalsFor } from "../lib/activity";
import { ruleSummary, maybeLlmSummary } from "../lib/summary";
import { loadEvents, saveEvents, loadSummaries, saveSummaries } from "../lib/storage";
import type { ActivityEvent, ActivitySummary, AnalysisResult, HomeZone, PetProfile } from "../types";

const WINDOW_MS = 10 * 60 * 1000;

export function useActivityLog(
  analysis: AnalysisResult | null,
  streaming: boolean,
  profile: PetProfile,
  zones: HomeZone[],
  minSeconds: number,
  storyMode: boolean,
  source: "live" | "demo" = "live",
) {
  const [events, setEvents] = useState<ActivityEvent[]>(loadEvents);
  const [summaries, setSummaries] = useState<ActivitySummary[]>(loadSummaries);
  const [openEvent, setOpenEvent] = useState<ActivityEvent | null>(null);
  const tracker = useRef<SessionTracker | null>(null);
  const lastSummaryAt = useRef(0);

  useEffect(() => {
    tracker.current = new SessionTracker(profile.id, minSeconds, source);
  }, [profile.id, minSeconds, source]);

  useEffect(() => {
    saveEvents(events);
  }, [events]);

  useEffect(() => {
    if (!streaming || storyMode || !analysis) return;
    const now = Date.now();
    const live = liveActivity(analysis, zones);
    const closed = tracker.current?.ingest(now, live);
    const current = tracker.current?.current();
    setEvents((prev) => {
      const withoutOpen = prev.filter((e) => e.id !== current?.id && e.id !== closed?.id);
      const next = [...withoutOpen];
      if (closed && closed.endTime - closed.startTime >= minSeconds * 1000 * 0.5) next.push(closed);
      if (current) next.push(current);
      return next.sort((a, b) => a.startTime - b.startTime).slice(-200);
    });
    setOpenEvent(current ?? null);
  }, [analysis, streaming, storyMode, zones, minSeconds]);

  useEffect(() => {
    const now = Date.now();
    if (now - lastSummaryAt.current < 20_000) return;
    const start = now - WINDOW_MS;
    const windowed = clipToWindow(events, start, now);
    if (!windowed.length) return;
    lastSummaryAt.current = now;
    const base = ruleSummary(windowed, profile, start, now);
    setSummaries((prev) => {
      const next = [...prev.filter((s) => s.startTime !== base.startTime), base].slice(-40);
      saveSummaries(next);
      return next;
    });
    void maybeLlmSummary(base, windowed, profile).then((enriched) => {
      if (enriched.source !== "llm" && enriched.summary === base.summary) return;
      setSummaries((prev) => {
        const next = prev.map((s) => (s.startTime === base.startTime ? enriched : s));
        saveSummaries(next);
        return next;
      });
    });
  }, [events, profile]);

  const replaceWithDemo = (demo: ActivityEvent[]) => {
    tracker.current = new SessionTracker(profile.id, minSeconds, "demo");
    setEvents(demo);
    saveEvents(demo);
    const now = Date.now();
    const start = now - WINDOW_MS;
    const summary = ruleSummary(demo, profile, start, now);
    setSummaries([summary]);
    saveSummaries([summary]);
  };

  const now = Date.now();
  const recent = clipToWindow(events, now - WINDOW_MS, now);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const today = clipToWindow(events, todayStart.getTime(), now);

  return {
    events,
    recent,
    today,
    todayTotals: totalsFor(today),
    recentTotals: totalsFor(recent),
    openEvent,
    summaries,
    latestSummary: summaries.at(-1) ?? null,
    replaceWithDemo,
    startFresh: () => {
      tracker.current = new SessionTracker(profile.id, minSeconds, source);
      setEvents([]);
      setSummaries([]);
      setOpenEvent(null);
      lastSummaryAt.current = 0;
      saveEvents([]);
      saveSummaries([]);
    },
    clear: () => {
      setEvents([]);
      setSummaries([]);
      saveEvents([]);
      saveSummaries([]);
      tracker.current = new SessionTracker(profile.id, minSeconds, "live");
    },
  };
}
