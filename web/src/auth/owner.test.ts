import { describe, expect, it } from "vitest";
import { localOwner, ownerKey, signedInOwner } from "./owner";

describe("ownerKey", () => {
  it("treats email case and padding as the same account", () => {
    expect(ownerKey("Paul.moja1@Gmail.com ")).toBe("paul.moja1@gmail.com");
    expect(ownerKey(null)).toBe("");
  });
});

describe("signedInOwner", () => {
  it("prefers the signed-in email and falls back to the cache stamp", () => {
    localStorage.setItem("fintrack_email", "You@x.com");
    localStorage.setItem("fintrack_local_owner", "you@x.com");
    expect(signedInOwner()).toBe("you@x.com");
    expect(localOwner()).toBe("you@x.com");
  });
});
