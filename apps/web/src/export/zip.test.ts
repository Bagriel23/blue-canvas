import { describe, expect, it } from "vitest";

import { createDeterministicZip } from "./zip.js";

describe("createDeterministicZip", () => {
  it("produces the same archive for the same sorted files", async () => {
    const first = await createDeterministicZip([
      { path: "styles.css", bytes: new TextEncoder().encode("body{}") },
      { path: "index.html", bytes: new TextEncoder().encode("<main />") },
    ]);
    const second = await createDeterministicZip([
      { path: "index.html", bytes: new TextEncoder().encode("<main />") },
      { path: "styles.css", bytes: new TextEncoder().encode("body{}") },
    ]);

    expect(Array.from(first)).toEqual(Array.from(second));
    expect(Array.from(first.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });

  it("rejects unsafe archive paths and duplicate entries", async () => {
    await expect(
      createDeterministicZip([
        { path: "../index.html", bytes: new Uint8Array() },
      ]),
    ).rejects.toThrow("unsafe archive path");
    await expect(
      createDeterministicZip([
        { path: "index.html", bytes: new Uint8Array() },
        { path: "index.html", bytes: new Uint8Array() },
      ]),
    ).rejects.toThrow("duplicate archive path");
  });
});
