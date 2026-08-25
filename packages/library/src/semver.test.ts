import { describe, expect, it } from "vitest";

import {
  bumpPatch,
  compareSemver,
  isCompatible,
  isValidSemver,
  parseSemver,
  serializeSemver,
} from "./semver.js";

describe("semver helpers", () => {
  it("parses and serializes symmetric numbers", () => {
    const parsed = parseSemver("1.2.3");
    expect(parsed).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(serializeSemver(parsed)).toBe("1.2.3");
  });

  it("rejects invalid versions", () => {
    expect(isValidSemver("v1.0.0")).toBe(false);
    expect(isValidSemver("1.0")).toBe(false);
    expect(isValidSemver("1.0.0-beta")).toBe(false);
    expect(() => parseSemver("1")).toThrow(/Invalid semver/);
  });

  it("compares in numeric precedence", () => {
    expect(
      compareSemver(parseSemver("1.2.10"), parseSemver("1.2.9")),
    ).toBeGreaterThan(0);
    expect(
      compareSemver(parseSemver("2.0.0"), parseSemver("1.99.99")),
    ).toBeGreaterThan(0);
    expect(compareSemver(parseSemver("1.0.0"), parseSemver("1.0.0"))).toBe(0);
  });

  it("bumps only the patch", () => {
    expect(bumpPatch("1.2.3")).toBe("1.2.4");
  });

  it("reports compatibility across majors and older provisions", () => {
    expect(isCompatible("1.2.0", "1.5.0")).toEqual({ compatible: true });
    const majorMismatch = isCompatible("1.2.0", "2.0.0");
    expect(majorMismatch.compatible).toBe(false);
    expect(majorMismatch.reason).toMatch(/Major version mismatch/);
    const olderProvided = isCompatible("1.2.0", "1.1.0");
    expect(olderProvided.compatible).toBe(false);
    expect(olderProvided.reason).toMatch(/older than required/);
  });
});
