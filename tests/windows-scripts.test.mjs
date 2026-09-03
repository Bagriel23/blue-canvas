import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const root = new URL("../", import.meta.url);
const execFileAsync = promisify(execFile);

test("Windows start builds every runnable workspace before starting processes", async () => {
  const source = await readFile(
    new URL("scripts/windows/start.ps1", root),
    "utf8",
  );
  assert.match(source, /npm run build/);
  assert.match(source, /@blue-canvas\/mcp-server/);
  assert.match(source, /@blue-canvas\/web/);
  assert.match(source, /\.pid\.web/);
});

test("restore scripts validate the asset target before recursive deletion", async () => {
  const unix = await readFile(new URL("scripts/restore.sh", root), "utf8");
  const windows = await readFile(
    new URL("scripts/windows/restore.ps1", root),
    "utf8",
  );
  assert.match(unix, /realpath|lstat/);
  assert.match(unix, /ASSET_STORAGE_ROOT/);
  assert.match(windows, /ASSET_STORAGE_ROOT/);
  assert.match(windows, /Resolve-Path|Get-Item/);
  assert.match(windows, /IsPathRooted/);
  assert.match(windows, /Get-Acl/);
  assert.match(windows, /ReparsePoint/);
  assert.match(windows, /UserProfile/);
  assert.match(windows, /FileIndex|GetFileIdentity|identity/u);
  assert.match(windows, /Assert-AssetRootIdentity/);
  assert.match(windows, /Assert-NoReparseTree/);
});

test("restore rejects root, relative, and symlink asset targets before touching the database", async () => {
  const script = new URL("scripts/restore.sh", root);
  const run = async (assetRoot) => {
    try {
      await execFileAsync(
        "bash",
        [script.pathname, "/definitely-missing-backup"],
        {
          env: {
            ...process.env,
            ASSET_STORAGE_ROOT: assetRoot,
            DATABASE_HOST: "127.0.0.1",
            DATABASE_NAME: "blue_canvas",
            DATABASE_USER: "blue_canvas",
            DATABASE_PASSWORD: "not-used",
          },
        },
      );
      assert.fail("restore unexpectedly accepted unsafe target");
    } catch (error) {
      assert.notEqual(error.code, 0);
      assert.equal(error.code, 2);
    }
  };
  await run("/");
  await run("relative-assets");
  const parent = await mkdtemp(join(tmpdir(), "blue-canvas-restore-"));
  const real = join(parent, "real");
  const linked = join(parent, "linked");
  const { mkdir, chmod } = await import("node:fs/promises");
  await mkdir(real, { mode: 0o700 });
  await chmod(real, 0o700);
  await symlink(real, linked);
  await run(linked);
});
