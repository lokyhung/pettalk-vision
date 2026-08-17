import { useEffect, useState } from "react";
import type { AnalysisResult, PetProfile } from "../types";
import { fetchExplanation } from "../lib/api";

export function ExplanationPanel({
  analysis,
  profile,
}: {
  analysis: AnalysisResult | null;
  profile: PetProfile;
}) {
  const [open, setOpen] = useState(true);
  const [llm, setLlm] = useState<{
    whyPetTalkThinksThis: string;
    whatYouCanObserveNext: string;
    source: string;
  } | null>(null);

  useEffect(() => {
    if (!analysis?.detection.present) return;
    const snapshot = analysis;
    let cancel = false;
    const handle = window.setTimeout(() => {
      fetchExplanation(snapshot, profile).then((res) => {
        if (!cancel && res) setLlm(res);
      });
    }, 600);
    return () => {
      cancel = true;
      window.clearTimeout(handle);
    };
  }, [analysis?.action.label, analysis?.mood.label, profile.name]);

  const why = llm?.whyPetTalkThinksThis || analysis?.why || "No explanation yet.";
  const next = llm?.whatYouCanObserveNext || analysis?.observeNext || "";

  return (
    <div className="glass rounded-2xl p-4">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <p className="font-mono text-[10px] tracking-[0.22em] text-mute">AI EXPLANATION</p>
        <span className="font-mono text-[10px] text-cyan-300/80">{open ? "HIDE" : "SHOW"}</span>
      </button>
      {open && (
        <div className="fade-up mt-3 space-y-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-cyan-200/80">Why PetTalk thinks this</p>
            <p className="mt-1 text-sm leading-relaxed text-ink/90">{why}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-cyan-200/80">What you can observe next</p>
            <p className="mt-1 text-sm leading-relaxed text-ink/90">{next}</p>
          </div>
          <p className="font-mono text-[10px] text-mute">
            Source: {llm?.source === "llm" ? "optional language model + visual cues" : "rule layer on visual cues"}
          </p>
        </div>
      )}
    </div>
  );
}
