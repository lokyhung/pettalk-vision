import { DEFAULT_PROFILE, PERSONALITY_TAGS, type PetProfile } from "../types";

const KEY = "pettalk.profile.zh-HK";

function normalize(raw: Partial<PetProfile> | null): PetProfile {
  const merged = { ...DEFAULT_PROFILE, ...(raw || {}) };
  const traits = Array.isArray(merged.traits)
    ? merged.traits.filter((tag) => (PERSONALITY_TAGS as readonly string[]).includes(tag))
    : [];
  const personality = traits.length ? traits.join("、") : merged.personality || "";
  return {
    name: merged.name || DEFAULT_PROFILE.name,
    species: merged.species || "狗狗",
    breed: merged.breed || "",
    age: merged.age || "",
    personality,
    traits,
    likes: merged.likes || "",
  };
}

export function loadProfile(): PetProfile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_PROFILE, traits: [...DEFAULT_PROFILE.traits] };
    return normalize(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PROFILE, traits: [...DEFAULT_PROFILE.traits] };
  }
}

export function saveProfile(profile: PetProfile) {
  localStorage.setItem(KEY, JSON.stringify(normalize(profile)));
}
