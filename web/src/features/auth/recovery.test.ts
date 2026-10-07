import { describe, expect, it } from "vitest";
import { isRecoveryCode, normalizeRecoveryCode } from "./recovery";

describe("normalizeRecoveryCode", () => {
  it("accepts every reasonable typing of the same code", () => {
    expect(normalizeRecoveryCode("K7QM2-2X4P9")).toBe("K7QM22X4P9");
    expect(normalizeRecoveryCode("k7qm2-2x4p9")).toBe("K7QM22X4P9");
    expect(normalizeRecoveryCode(" k7qm2 2x4p9 ")).toBe("K7QM22X4P9");
  });

  it("recognises a complete code and rejects fragments", () => {
    expect(isRecoveryCode("K7QM2-2X4P9")).toBe(true);
    expect(isRecoveryCode("123456")).toBe(false);
    expect(isRecoveryCode("K7QM2")).toBe(false);
    expect(isRecoveryCode("")).toBe(false);
  });
});
