import { describe, expect, it } from "vitest";

import {
  ArgonPasswordHasher,
  canProjectRole,
  issueSecret,
  sha256,
} from "./security.js";

describe("security primitives", () => {
  it("returns a random secret while retaining only its SHA-256 digest", () => {
    const first = issueSecret();
    const second = issueSecret();

    expect(first.raw).not.toBe(second.raw);
    expect(first.raw.length).toBeGreaterThanOrEqual(43);
    expect(first.hash).toBe(sha256(first.raw));
    expect(first.hash).not.toContain(first.raw);
  });

  it("hashes and verifies passwords with Argon2id", async () => {
    const hasher = new ArgonPasswordHasher();
    const hash = await hasher.hash("a sufficiently long password");

    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(
      hasher.verify(hash, "a sufficiently long password"),
    ).resolves.toBe(true);
    await expect(hasher.verify(hash, "incorrect password")).resolves.toBe(
      false,
    );
  });

  it("denies project actions that are not explicitly granted", () => {
    expect(canProjectRole("viewer", "project:read")).toBe(true);
    expect(canProjectRole("viewer", "project:update")).toBe(false);
    expect(canProjectRole("owner", "unknown-action")).toBe(false);
  });
});
