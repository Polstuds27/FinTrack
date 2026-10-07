/**
 * Recovery-code handling shared by the sign-in challenge and the settings UI.
 *
 * Codes display as `XXXXX-XXXXX` but match without separators and
 * case-insensitively, so `k7qm-2x4p`, `K7QM2X4P` and ` k7qm 2x4p ` are the
 * same code. Anything outside the code alphabet is dropped.
 */
const ALPHABET = new Set("ABCDEFGHJKMNPQRSTUVWXYZ23456789".split(""));

export const RECOVERY_CODE_LENGTH = 10;

export function normalizeRecoveryCode(value: string): string {
  const out: string[] = [];
  for (const ch of value.toUpperCase()) {
    if (ALPHABET.has(ch)) out.push(ch);
  }
  return out.join("");
}

export function isRecoveryCode(value: string): boolean {
  return normalizeRecoveryCode(value).length === RECOVERY_CODE_LENGTH;
}
