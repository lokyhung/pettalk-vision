import { formatClock } from "../lib/api";
import { copy } from "../lib/i18n";
import type { TimelineEvent } from "../types";

export function BehaviourTimeline({ events, elapsed }: { events: TimelineEvent[]; elapsed: number }) {
  return (
    <section className="glass shrink-0 rounded-2xl p-3.5">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[11px] tracking-[0.16em] text-mute">{copy.timeline}</p>
        <span className="font-mono text-[11px] text-cyan-300">{formatClock(elapsed)}</span>
      </div>
      <div className="relative">
        <div className="absolute left-0 right-0 top-[18px] h-px bg-gradient-to-r from-cyan-400/0 via-cyan-400/40 to-lime-400/0" />
        <div className="flex gap-3 overflow-x-auto pb-1">
          {events.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/10 px-4 py-3 text-sm text-mute">
              {copy.timelineEmpty}
            </div>
          )}
          {events.map((event, i) => (
            <article
              key={`${event.t}-${event.label}-${i}`}
              className="fade-up min-w-[148px] rounded-xl border border-white/10 bg-white/5 px-3 py-2"
            >
              <p className="font-mono text-[10px] text-cyan-300">{formatClock(event.t)}</p>
              <p className="mt-1 text-sm">
                <span className="mr-1">{event.icon}</span>
                {event.label}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
