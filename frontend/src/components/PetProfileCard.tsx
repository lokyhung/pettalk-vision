import type { PetProfile } from "../types";

export function PetProfileCard({
  profile,
  onChange,
}: {
  profile: PetProfile;
  onChange: (next: PetProfile) => void;
}) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="font-mono text-[10px] tracking-[0.22em] text-mute">PET PROFILE</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Field
          label="Name"
          value={profile.name}
          onChange={(name) => onChange({ ...profile, name })}
        />
        <Field
          label="Species"
          value={profile.species}
          onChange={(species) => onChange({ ...profile, species })}
        />
        <Field
          label="Age"
          value={profile.age}
          onChange={(age) => onChange({ ...profile, age })}
        />
        <Field
          label="Personality"
          value={profile.personality}
          onChange={(personality) => onChange({ ...profile, personality })}
        />
      </div>
      <p className="mt-3 text-[11px] text-mute">Stored locally. Used as context for explanations only.</p>
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
      <span className="font-mono text-[10px] text-mute">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm outline-none focus:border-cyan-400/40"
      />
    </label>
  );
}
