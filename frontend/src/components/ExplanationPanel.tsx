import { useEffect, useState } from "react";
import type { AnalysisResult, PetProfile } from "../types";
import { fetchExplanation } from "../lib/api";
import { copy } from "../lib/i18n";

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
    if (!analysis.explanationRevision) return;
    const snapshot = analysis;
    let cancel = false;
    const handle = window.setTimeout(() => {
      fetchExplanation(snapshot, profile).then((res) => {
        if (!cancel && res) setLlm(res);
      });
    }, 1600);
    return () => {
      cancel = true;
      window.clearTimeout(handle);
    };
  }, [analysis?.explanationRevision, profile]);

  const why = llm?.whyPetTalkThinksThis || analysis?.why || "尚無說明。";
  const next = llm?.whatYouCanObserveNext || analysis?.observeNext || "";

  return (
    <div className="glass rounded-2xl p-3.5">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <p className="text-[11px] tracking-[0.16em] text-mute">{copy.explanation}</p>
        <span className="text-[11px] text-cyan-300/80">{open ? copy.hide : copy.show}</span>
      </button>
      {open && (
        <div className="fade-up mt-3 space-y-3">
          <div>
            <p className="text-[11px] text-cyan-200/80">{copy.why}</p>
            <p className="mt-1 text-sm leading-relaxed text-ink/90">{why}</p>
          </div>
          <div>
            <p className="text-[11px] text-cyan-200/80">{copy.observe}</p>
            <p className="mt-1 text-sm leading-relaxed text-ink/90">{next}</p>
          </div>
          <p className="text-[10px] text-mute">{llm?.source === "llm" ? copy.sourceLlm : copy.sourceRules}</p>
        </div>
      )}
    </div>
  );
}
