import { DEFAULT_PROFILE, type PetProfile } from "../types";

const KEY = "pettalk.profile";

export function loadProfile(): PetProfile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_PROFILE };
    return { ...DEFAULT_PROFILE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export function saveProfile(profile: PetProfile) {
  localStorage.setItem(KEY, JSON.stringify(profile));
}
