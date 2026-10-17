import { useSyncExternalStore } from "react";
import { z } from "zod";
import { NAME_MAX_LENGTH, racerNameSchema } from "@/game/protocol/messages";
import { RACER_COLORS } from "@/game/racer/colors";
import type { PlayerProfile } from "../race/session/types";

const STORAGE_KEY = "keydasher.profile";

/** Stored drafts may hold a half-typed name; it is only validated when racing. */
const storedProfileSchema = z.object({
  name: z.string().max(NAME_MAX_LENGTH),
  color: z.enum(RACER_COLORS),
});

const FIRST = ["Zippy", "Turbo", "Captain", "Sneaky", "Bouncy", "Mega", "Lil", "Rocket", "Fizzy"];
const SECOND = ["Bean", "Noodle", "Waffle", "Sprout", "Pickle", "Taco", "Mango", "Biscuit", "Comet"];

export function randomRacerName(): string {
  const first = FIRST[Math.floor(Math.random() * FIRST.length)] ?? "Zippy";
  const second = SECOND[Math.floor(Math.random() * SECOND.length)] ?? "Bean";
  return `${first} ${second}`.slice(0, NAME_MAX_LENGTH);
}

function randomProfile(): PlayerProfile {
  const color = RACER_COLORS[Math.floor(Math.random() * RACER_COLORS.length)] ?? "pink";
  return { name: randomRacerName(), color };
}

const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedProfile: PlayerProfile | null = null;

/** Name and color are a per-browser convenience; storage may be unavailable, so never rely on it. */
function readStoredProfile(): PlayerProfile | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return cachedProfile;
  }
  if (raw === cachedRaw) return cachedProfile;
  cachedRaw = raw;
  try {
    const parsed = storedProfileSchema.safeParse(raw ? JSON.parse(raw) : null);
    cachedProfile = parsed.success ? parsed.data : null;
  } catch {
    cachedProfile = null;
  }
  return cachedProfile;
}

export function saveProfile(profile: PlayerProfile): void {
  cachedProfile = profile;
  try {
    cachedRaw = JSON.stringify(profile);
    window.localStorage.setItem(STORAGE_KEY, cachedRaw);
  } catch {
    // Blocked storage just means the profile lasts until the tab closes.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** The saved profile, or null during server rendering and before one exists. */
export function useStoredProfile(): PlayerProfile | null {
  return useSyncExternalStore(subscribe, readStoredProfile, () => null);
}

/** A profile that is safe to race with, creating and saving a fun one if needed. */
export function ensureRaceableProfile(): PlayerProfile {
  const stored = readStoredProfile();
  const name = stored ? racerNameSchema.safeParse(stored.name) : null;
  if (stored && name?.success) return { name: name.data, color: stored.color };
  const fresh = { ...randomProfile(), color: stored?.color ?? randomProfile().color };
  saveProfile(fresh);
  return fresh;
}

export function isRaceableName(name: string): boolean {
  return racerNameSchema.safeParse(name).success;
}
