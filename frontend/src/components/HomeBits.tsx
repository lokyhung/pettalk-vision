import { copy } from "../lib/i18n";
import { ACTIVITY_META, type ActivityEvent, type ActivityId, type TabId } from "../types";
import { formatDuration, totalsFor } from "../lib/activity";
import { pct } from "../lib/api";

export function TotalsRow({ events }: { events: ActivityEvent[] }) {
  const totals = totalsFor(events);
  const order: ActivityId[] = [
    "resting",
    "waiting",
    "exploring",
    "playing",
    "active",
    "door_waiting",
    "eating",
    "drinking",
    "following",
  ];
  const rows = order.filter((id) => (totals[id] || 0) >= 1);
  if (!rows.length) {
    return <p className="text-sm text-mute">{copy.timelineEmpty}</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      {rows.map((id) => (
        <div key={id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          <p className="text-sm">
            {ACTIVITY_META[id].icon} {ACTIVITY_META[id].label}
          </p>
          <p className="mt-0.5 font-mono text-xs text-cyan-300">{formatDuration(totals[id])}</p>
        </div>
      ))}
    </div>
  );
}

export function EventList({
  events,
  onSelect,
}: {
  events: ActivityEvent[];
  onSelect?: (event: ActivityEvent) => void;
}) {
  if (!events.length) {
    return <p className="text-sm text-mute">{copy.timelineEmpty}</p>;
  }
  const ordered = [...events].sort((a, b) => b.startTime - a.startTime);
  return (
    <div className="space-y-2">
      {ordered.map((event) => {
        const meta = ACTIVITY_META[event.activity] ?? { icon: "◌", label: event.activity };
        return (
          <button
            key={event.id}
            type="button"
            onClick={() => onSelect?.(event)}
            className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left hover:border-cyan-400/30"
          >
            <div>
              <p className="text-sm">
                {meta.icon} {meta.label}
                {event.source === "demo" && (
                  <span className="ml-2 text-[10px] text-amber-200">{copy.storyData}</span>
                )}
              </p>
              <p className="text-[11px] text-mute">
                {new Date(event.startTime).toLocaleTimeString("zh-HK", { hour: "2-digit", minute: "2-digit" })} ·{" "}
                {formatDuration(event.endTime - event.startTime)}
                {event.location ? ` · ${event.location}` : ""}
              </p>
            </div>
            <span className="font-mono text-[11px] text-mute">
              {event.source === "demo" ? copy.storyData : `${Math.round(event.confidence * 100)}%`}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function EventDetail({ event, onClose }: { event: ActivityEvent; onClose: () => void }) {
  const meta = ACTIVITY_META[event.activity] ?? { icon: "◌", label: event.activity };
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] tracking-[0.16em] text-mute">活動詳情</p>
          <h3 className="mt-1 text-lg font-semibold">
            {meta.icon} {meta.label}
          </h3>
        </div>
        <button type="button" onClick={onClose} className="text-[11px] text-cyan-300">
          {copy.hide}
        </button>
      </div>
      {event.source === "demo" && <p className="mt-2 text-[11px] text-amber-200">{copy.storyData}</p>}
      <p className="mt-3 text-sm text-mute">
        {new Date(event.startTime).toLocaleTimeString("zh-HK", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}{" "}
        – {new Date(event.endTime).toLocaleTimeString("zh-HK", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      </p>
      <p className="mt-1 text-sm">持續：{formatDuration(event.endTime - event.startTime)}</p>
      <p className="mt-3 text-[11px] text-mute">{copy.activityConf}</p>
      <p className="font-mono text-sm text-cyan-300">{pct(event.confidence)}</p>
      <p className="mt-3 text-[11px] text-mute">{copy.evidenceTitle}</p>
      <ul className="mt-1 space-y-1 text-sm">
        {(event.evidence.length ? event.evidence : ["資料不足"]).map((line) => (
          <li key={line}>✓ {line}</li>
        ))}
      </ul>
      {event.detectedObjects.length > 0 && (
        <p className="mt-3 text-sm text-mute">物件：{event.detectedObjects.join("、")}</p>
      )}
      <p className="mt-3 text-sm">
        AI 判斷：可能{meta.label}
      </p>
    </div>
  );
}

export function NavBar({ tab, onChange }: { tab: TabId; onChange: (tab: TabId) => void }) {
  const items: { id: TabId; label: string }[] = [
    { id: "home", label: `🏠 ${copy.navHome}` },
    { id: "camera", label: `📹 ${copy.navCamera}` },
    { id: "activity", label: `📊 ${copy.navActivity}` },
    { id: "profile", label: `🐶 ${copy.navProfile}` },
    { id: "settings", label: `⚙️ ${copy.navSettings}` },
  ];
  return (
    <nav className="flex shrink-0 gap-1 overflow-x-auto rounded-full border border-white/10 bg-white/5 p-1">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${
            tab === item.id ? "bg-cyan-400 text-black" : "text-mute hover:text-ink"
          }`}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
