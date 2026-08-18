import { useState } from "react";
import { PERSONALITY_TAGS, type PetProfile } from "../types";
import { copy } from "../lib/i18n";

export function PetProfileCard({
  profile,
  onChange,
}: {
  profile: PetProfile;
  onChange: (next: PetProfile) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile);

  const open = () => {
    setDraft({ ...profile, traits: [...profile.traits] });
    setEditing(true);
  };

  const save = () => {
    const traits = draft.traits;
    onChange({
      ...draft,
      traits,
      personality: traits.join("、"),
      species: draft.species === "貓咪" ? "貓咪" : "狗狗",
    });
    setEditing(false);
  };

  const toggleTrait = (tag: string) => {
    setDraft((prev) => {
      const has = prev.traits.includes(tag);
      const traits = has ? prev.traits.filter((t) => t !== tag) : [...prev.traits, tag];
      return { ...prev, traits, personality: traits.join("、") };
    });
  };

  return (
    <div className="glass rounded-2xl p-3.5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] tracking-[0.16em] text-mute">{copy.profile}</p>
        <button
          type="button"
          onClick={editing ? () => setEditing(false) : open}
          className="rounded-full border border-white/10 px-3 py-1 text-[11px] text-cyan-200 hover:border-cyan-400/40"
        >
          {editing ? copy.cancelEdit : copy.editProfile}
        </button>
      </div>

      {!editing ? (
        <div className="mt-3 space-y-1.5 text-sm">
          <Row label={copy.name} value={profile.name} />
          <Row label={copy.species} value={profile.species} />
          <Row label={copy.breed} value={profile.breed || copy.noValue} />
          <Row label={copy.age} value={profile.age} />
          <Row label={copy.personality} value={profile.traits.join("、") || copy.noValue} />
          <Row label={copy.likes} value={profile.likes || copy.noValue} />
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Field label={copy.name} value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
          <label className="block">
            <span className="text-[11px] text-mute">{copy.species}</span>
          <div className="mt-1 flex gap-1.5">
            {(["狗狗", "貓咪"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => setDraft({ ...draft, species: kind })}
                className={`rounded-full px-3 py-1 text-[11px] ${
                  draft.species === kind ? "bg-cyan-400 text-black" : "border border-white/10 text-mute"
                }`}
              >
                {kind}
              </button>
            ))}
          </div>
          </label>
          <Field label={copy.breed} value={draft.breed} onChange={(breed) => setDraft({ ...draft, breed })} />
          <Field label={copy.age} value={draft.age} onChange={(age) => setDraft({ ...draft, age })} />
          <label className="col-span-2 block">
            <span className="text-[11px] text-mute">{copy.personality}</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {PERSONALITY_TAGS.map((tag) => {
                const on = draft.traits.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTrait(tag)}
                    className={`rounded-full px-2.5 py-1 text-[11px] ${
                      on ? "bg-cyan-400 text-black" : "border border-white/10 text-mute"
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </label>
          <label className="col-span-2 block">
            <span className="text-[11px] text-mute">{copy.likes}</span>
            <textarea
              value={draft.likes}
              onChange={(e) => setDraft({ ...draft, likes: e.target.value })}
              rows={2}
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm outline-none focus:border-cyan-400/40"
            />
          </label>
          <button
            type="button"
            onClick={save}
            className="col-span-2 mt-1 rounded-lg bg-cyan-400 py-1.5 text-sm font-medium text-black"
          >
            {copy.saveProfile}
          </button>
        </div>
      )}
      <p className="mt-3 text-[11px] text-mute">{copy.profileHint}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[11px] text-mute">{label}</span>
      <span className="text-right text-sm">{value}</span>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] text-mute">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm outline-none focus:border-cyan-400/40"
      />
    </label>
  );
}
