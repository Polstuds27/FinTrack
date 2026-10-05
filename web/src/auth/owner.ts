/**
 * Which account owns the local cache.
 *
 * IndexedDB is one shared store per browser profile and its rows carry no user
 * id, so attribution lives in a stamp written beside it. Keeping the rule in a
 * single module means the auth layer (wipe on mismatch) and the sync outbox
 * (never send another account's queue) agree on one definition of "mine".
 */

/** localStorage key holding the signed-in email. */
export const EMAIL_KEY = "fintrack_email";

/** localStorage key holding the cache's owner stamp. */
export const LOCAL_OWNER_KEY = "fintrack_local_owner";

/**
 * Canonical owner id: trimmed and lowercased, the way the server treats an
 * email — otherwise `You@x.com` and `you@x.com` compare as two accounts and
 * wipe each other's cache on every sign-in.
 */
export function ownerKey(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/** The account the cache is stamped for, or null when the stamp is missing. */
export function localOwner(): string | null {
  const stamp = localStorage.getItem(LOCAL_OWNER_KEY);
  return stamp ? ownerKey(stamp) : null;
}

/**
 * Owner a change made right now belongs to. The signed-in email wins; the cache
 * stamp is the fallback so a mutation queued in the moment between the two
 * writes is never attributed to nobody.
 */
export function signedInOwner(): string | null {
  const email = localStorage.getItem(EMAIL_KEY);
  return email ? ownerKey(email) : localOwner();
}
