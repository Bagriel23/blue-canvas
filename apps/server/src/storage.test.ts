import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import sharp from "sharp";

import { ApiError } from "./core.js";
import { LocalAssetStorage } from "./storage.js";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

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

  it("keeps staged content private until commit and removes it on abort", async () => {
    const root = await temporaryDirectory();
    const storage = await LocalAssetStorage.create(root);
    const input = {
      bytes: PNG,
      mediaType: "image/png",
      originalName: "pixel.png",
    } as const;

    const aborted = await storage.stage(input);
    await expect(storage.read(aborted.asset.storageKey)).rejects.toMatchObject({
      code: "asset_not_found",
    } satisfies Partial<ApiError>);
    await aborted.abort();
    expect(await readdir(root, { recursive: true })).toEqual([]);

    const committed = await storage.stage(input);
    await committed.commit();
    await expect(storage.read(committed.asset.storageKey)).resolves.toEqual(
      PNG,
    );
  });

  it("reads stored bytes and reports a deleted asset as missing", async () => {
    const root = await temporaryDirectory();
    const storage = await LocalAssetStorage.create(root);
    const stored = await storage.put({
      bytes: PNG,
      mediaType: "image/png",
      originalName: "pixel.png",
    });

    await expect(storage.read(stored.storageKey)).resolves.toEqual(PNG);
    await storage.delete(stored.storageKey);
    await expect(storage.read(stored.storageKey)).rejects.toMatchObject({
      code: "asset_not_found",
      statusCode: 404,
    } satisfies Partial<ApiError>);
    await expect(storage.delete(stored.storageKey)).rejects.toMatchObject({
      code: "asset_not_found",
      statusCode: 404,
    } satisfies Partial<ApiError>);
  });

  it.each([
    "",
    "../../etc/passwd",
    "/etc/passwd",
    `aa/${"a".repeat(64)}/extra`,
    `AA/${"a".repeat(64)}`,
    `ab/${"c".repeat(64)}`,
  ])(
    "rejects the untrusted storage key %j for reads and deletes",
    async (key) => {
      const root = await temporaryDirectory();
      const storage = await LocalAssetStorage.create(root);

      await expect(storage.read(key)).rejects.toMatchObject({
        code: "invalid_asset_key",
      } satisfies Partial<ApiError>);
      await expect(storage.delete(key)).rejects.toMatchObject({
        code: "invalid_asset_key",
      } satisfies Partial<ApiError>);
    },
  );

  it("rejects symbolic-link asset entries for reads and deletes", async () => {
    const parent = await temporaryDirectory();
    const root = join(parent, "root");
    const outside = join(parent, "outside.png");
    const storage = await LocalAssetStorage.create(root);
    const stored = await storage.put({
      bytes: PNG,
      mediaType: "image/png",
      originalName: "pixel.png",
    });
    const storedPath = join(root, stored.storageKey);
    await writeFile(outside, PNG);
    await rm(storedPath);
    await symlink(outside, storedPath);

    await expect(storage.read(stored.storageKey)).rejects.toMatchObject({
      code: "unsafe_storage_root",
    } satisfies Partial<ApiError>);
    await expect(storage.delete(stored.storageKey)).rejects.toMatchObject({
      code: "unsafe_storage_root",
    } satisfies Partial<ApiError>);
    await expect(readFile(outside)).resolves.toEqual(PNG);
  });

  it("rejects symbolic-link hash directories for reads and deletes", async () => {
    const parent = await temporaryDirectory();
    const root = join(parent, "root");
    const outside = join(parent, "outside");
    const storage = await LocalAssetStorage.create(root);
    const digest = "a".repeat(64);
    const storageKey = `aa/${digest}`;
    await mkdir(outside);
    await symlink(outside, join(root, "aa"));

    await expect(storage.read(storageKey)).rejects.toMatchObject({
      code: "unsafe_storage_root",
    } satisfies Partial<ApiError>);
    await expect(storage.delete(storageKey)).rejects.toMatchObject({
      code: "unsafe_storage_root",
    } satisfies Partial<ApiError>);
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

  it("rejects a corrupt image even when its magic prefix is valid", async () => {
    const root = await temporaryDirectory();
    const storage = await LocalAssetStorage.create(root);

    await expect(
      storage.put({
        bytes: PNG.subarray(0, 16),
        mediaType: "image/png",
        originalName: "truncated.png",
      }),
    ).rejects.toMatchObject({
      code: "invalid_asset",
    } satisfies Partial<ApiError>);
  });

  it("rejects raster dimensions and decoded pixel counts above the bounds", async () => {
    const root = await temporaryDirectory();
    const storage = await LocalAssetStorage.create(root);
    const tooWide = await sharp({
      create: { width: 8193, height: 1, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();
    const tooManyPixels = await sharp({
      create: { width: 5000, height: 4000, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();

    for (const bytes of [tooWide, tooManyPixels]) {
      await expect(
        storage.put({
          bytes,
          mediaType: "image/png",
          originalName: "bounded.png",
        }),
      ).rejects.toMatchObject({
        code: "asset_dimensions",
      } satisfies Partial<ApiError>);
    }
  });

  it("rejects animated images beyond the frame policy", async () => {
    const root = await temporaryDirectory();
    const storage = await LocalAssetStorage.create(root);
    const animatedGif = Buffer.from(
      "R0lGODlhAQABAPAAAP8AAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQAAAAAACwAAAAAAQABAAACAkQBACH5BAAAAAAALAAAAAABAAEAgAAA/wAAAAICRAEAOw==",
      "base64",
    );

    await expect(
      storage.put({
        bytes: animatedGif,
        mediaType: "image/gif",
        originalName: "animated.gif",
      }),
    ).rejects.toMatchObject({
      code: "asset_frames",
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
    const validKey = `${"a".repeat(2)}/${"a".repeat(64)}`;
    await expect(storage.read(validKey)).rejects.toMatchObject({
      code: "unsafe_storage_root",
    } satisfies Partial<ApiError>);
    await expect(storage.delete(validKey)).rejects.toMatchObject({
      code: "unsafe_storage_root",
    } satisfies Partial<ApiError>);
  });
});
