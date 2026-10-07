import { db } from "./index";
import type { LocalProfile } from "./types";

/** The single row id for the cached identity. */
export const PROFILE_KEY = "me";

/** Persist the account identity for offline display. Never secrets. */
export async function saveProfileCache(input: Omit<LocalProfile, "key" | "cached_at">): Promise<void> {
  const entry: LocalProfile = {
    ...input,
    key: PROFILE_KEY,
    cached_at: new Date().toISOString(),
  };
  await db.profile.put(entry);
}

/** Last-known identity, or null when never fetched (or after sign-out wipe). */
export async function readProfileCache(): Promise<LocalProfile | null> {
  return (await db.profile.get(PROFILE_KEY)) ?? null;
}
