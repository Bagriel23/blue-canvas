import { randomBytes } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import { extname, join } from "node:path";

import { ApiError } from "./core.js";
import { sha256 } from "./security.js";

export const MAX_ASSET_BYTES = 25 * 1024 * 1024;

export interface AssetStorageInput {
  bytes: Uint8Array;
  originalName: string;
  mediaType: string;
}

export interface StoredAsset {
  sha256: string;
  size: number;
  storageKey: string;
}

export interface AssetStorage {
  put(input: AssetStorageInput): Promise<StoredAsset>;
  read(storageKey: string): Promise<Uint8Array>;
  delete(storageKey: string): Promise<void>;
}

const MEDIA_EXTENSIONS: Readonly<Record<string, ReadonlySet<string>>> = {
  "image/gif": new Set([".gif"]),
  "image/jpeg": new Set([".jpeg", ".jpg"]),
  "image/png": new Set([".png"]),
  "image/webp": new Set([".webp"]),
};

function hasSignature(bytes: Uint8Array, mediaType: string): boolean {
  const startsWith = (signature: readonly number[]): boolean =>
    signature.every((byte, index) => bytes[index] === byte);

  switch (mediaType) {
    case "image/png":
      return startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/jpeg":
      return startsWith([0xff, 0xd8, 0xff]);
    case "image/gif": {
      const header = Buffer.from(bytes.subarray(0, 6)).toString("ascii");
      return header === "GIF87a" || header === "GIF89a";
    }
    case "image/webp":
      return (
        Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" &&
        Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP"
      );
    default:
      return false;
  }
}

async function safeStat(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export class LocalAssetStorage implements AssetStorage {
  static async create(
    configuredRoot: string,
    maxBytes = MAX_ASSET_BYTES,
  ): Promise<LocalAssetStorage> {
    const existing = await safeStat(configuredRoot);
    if (existing?.isSymbolicLink() || (existing && !existing.isDirectory())) {
      throw new ApiError(
        "unsafe_storage_root",
        "Asset storage root must be a real directory",
        500,
      );
    }
    await mkdir(configuredRoot, { recursive: true, mode: 0o700 });
    const root = await realpath(configuredRoot);
    const rootStat = await lstat(root);
    return new LocalAssetStorage(root, maxBytes, {
      device: rootStat.dev,
      inode: rootStat.ino,
    });
  }

  private constructor(
    private readonly root: string,
    private readonly maxBytes: number,
    private readonly rootIdentity: { device: number; inode: number },
  ) {}

  async put(input: AssetStorageInput): Promise<StoredAsset> {
    await this.assertRoot();
    this.validateInput(input);
    const digest = sha256(input.bytes);
    const prefix = digest.slice(0, 2);
    const storageKey = `${prefix}/${digest}`;
    const directory = join(this.root, prefix);
    const destination = join(directory, digest);

    await mkdir(directory, { recursive: true, mode: 0o700 });
    const directoryStat = await lstat(directory);
    if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
      throw new ApiError("unsafe_storage_root", "Unsafe asset directory", 500);
    }

    const destinationStat = await safeStat(destination);
    if (destinationStat) {
      if (destinationStat.isSymbolicLink() || !destinationStat.isFile()) {
        throw new ApiError("unsafe_storage_root", "Unsafe asset entry", 500);
      }
      return { sha256: digest, size: input.bytes.byteLength, storageKey };
    }

    const temporary = join(
      directory,
      `.${digest}.${randomBytes(12).toString("hex")}.tmp`,
    );
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(input.bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }

    try {
      await rename(temporary, destination);
    } finally {
      await rm(temporary, { force: true });
    }
    return { sha256: digest, size: input.bytes.byteLength, storageKey };
  }

  async read(storageKey: string): Promise<Uint8Array> {
    const path = await this.resolveStorageKey(storageKey);
    return readFile(path);
  }

  async delete(storageKey: string): Promise<void> {
    const path = await this.resolveStorageKey(storageKey);
    await rm(path, { force: true });
  }

  private validateInput(input: AssetStorageInput): void {
    if (input.bytes.byteLength > this.maxBytes) {
      throw new ApiError(
        "asset_too_large",
        `Asset exceeds the ${this.maxBytes} byte limit`,
        413,
      );
    }
    const extensions = MEDIA_EXTENSIONS[input.mediaType];
    const extension = extname(input.originalName).toLowerCase();
    if (
      !extensions?.has(extension) ||
      !hasSignature(input.bytes, input.mediaType)
    ) {
      throw new ApiError(
        "invalid_asset",
        "Asset name, media type, and content do not agree",
        400,
      );
    }
  }

  private async resolveStorageKey(storageKey: string): Promise<string> {
    await this.assertRoot();
    if (!/^[a-f0-9]{2}\/[a-f0-9]{64}$/.test(storageKey)) {
      throw new ApiError("invalid_asset_key", "Invalid asset key", 400);
    }
    const [prefix, digest] = storageKey.split("/") as [string, string];
    if (digest.slice(0, 2) !== prefix) {
      throw new ApiError("invalid_asset_key", "Invalid asset key", 400);
    }
    const directory = join(this.root, prefix);
    const path = join(directory, digest);
    const directoryStat = await safeStat(directory);
    if (!directoryStat) {
      throw new ApiError("asset_not_found", "Asset not found", 404);
    }
    if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
      throw new ApiError("unsafe_storage_root", "Unsafe asset entry", 500);
    }
    const fileStat = await safeStat(path);
    if (!fileStat) {
      throw new ApiError("asset_not_found", "Asset not found", 404);
    }
    if (fileStat.isSymbolicLink() || !fileStat.isFile()) {
      throw new ApiError("unsafe_storage_root", "Unsafe asset entry", 500);
    }
    return path;
  }

  private async assertRoot(): Promise<void> {
    const rootStat = await safeStat(this.root);
    if (
      !rootStat ||
      rootStat.isSymbolicLink() ||
      !rootStat.isDirectory() ||
      rootStat.dev !== this.rootIdentity.device ||
      rootStat.ino !== this.rootIdentity.inode
    ) {
      throw new ApiError("unsafe_storage_root", "Unsafe asset root", 500);
    }
  }
}
