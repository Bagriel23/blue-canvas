import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ApiError } from "./core.js";
import { LocalAssetStorage } from "./storage.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

const directories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "blue-canvas-storage-"));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("local asset storage", () => {
  it("uses content hashes and never caller-supplied paths", async () => {
    const root = await temporaryDirectory();
    const storage = await LocalAssetStorage.create(root);

    const stored = await storage.put({
      bytes: PNG,
      mediaType: "image/png",
      originalName: "../../escape.png",
    });

    expect(stored.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.storageKey).toBe(
      `${stored.sha256.slice(0, 2)}/${stored.sha256}`,
    );
    await expect(readFile(join(root, stored.storageKey))).resolves.toEqual(PNG);
    await expect(readFile(join(root, "..", "escape.png"))).rejects.toThrow();
  });

  it("deduplicates equal content and leaves no temporary files", async () => {
    const root = await temporaryDirectory();
    const storage = await LocalAssetStorage.create(root);
    const input = {
      bytes: PNG,
      mediaType: "image/png",
      originalName: "pixel.png",
    } as const;

    const first = await storage.put(input);
    const second = await storage.put(input);

    expect(second.storageKey).toBe(first.storageKey);
    expect(await readdir(join(root, first.sha256.slice(0, 2)))).toEqual([
      first.sha256,
    ]);
  });

  it("rejects oversized and mislabeled assets", async () => {
    const root = await temporaryDirectory();
    const storage = await LocalAssetStorage.create(root, 8);

    await expect(
      storage.put({
        bytes: PNG,
        mediaType: "image/png",
        originalName: "pixel.png",
      }),
    ).rejects.toMatchObject({
      code: "asset_too_large",
    } satisfies Partial<ApiError>);

    const normalStorage = await LocalAssetStorage.create(root);
    await expect(
      normalStorage.put({
        bytes: Buffer.from("not a png"),
        mediaType: "image/png",
        originalName: "pixel.png",
      }),
    ).rejects.toMatchObject({
      code: "invalid_asset",
    } satisfies Partial<ApiError>);
  });

  it("refuses a storage root that is a symbolic link", async () => {
    const parent = await temporaryDirectory();
    const realRoot = join(parent, "real");
    const linkedRoot = join(parent, "linked");
    await writeFile(realRoot, "not a directory");
    await symlink(realRoot, linkedRoot);

    await expect(LocalAssetStorage.create(linkedRoot)).rejects.toMatchObject({
      code: "unsafe_storage_root",
    } satisfies Partial<ApiError>);
  });

  it("detects a storage root replaced after initialization", async () => {
    const parent = await temporaryDirectory();
    const root = join(parent, "root");
    const movedRoot = join(parent, "moved-root");
    const attackerRoot = join(parent, "attacker");
    await mkdir(root);
    await mkdir(attackerRoot);
    const storage = await LocalAssetStorage.create(root);
    await rename(root, movedRoot);
    await symlink(attackerRoot, root);

    await expect(
      storage.put({
        bytes: PNG,
        mediaType: "image/png",
        originalName: "pixel.png",
      }),
    ).rejects.toMatchObject({
      code: "unsafe_storage_root",
    } satisfies Partial<ApiError>);
  });
});
