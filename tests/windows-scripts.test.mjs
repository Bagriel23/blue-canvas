import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

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
  assert.match(unix, /tar[\s\S]*--null[\s\S]*--list/);
  assert.match(unix, /STAGING_DIR|staging/i);
  assert.match(unix, /\.\.|absolute|symlink|hardlink|FIFO/i);
  assert.match(unix, /SWAP_BACKUP[\s\S]*mv -T/);
  assert.match(unix, /--no-same-owner/);
  assert.ok(
    unix.indexOf("validate_asset_archive") < unix.indexOf("EXISTING_TABLES"),
  );
  assert.match(windows, /--null[\s\S]*--list/);
  assert.match(windows, /staging/i);
  assert.match(windows, /\.\.|symlink|hardlink|FIFO/i);
  assert.match(windows, /System\.IO\.Directory\]::Move/);
  assert.ok(
    windows.indexOf("Assert-SafeTarArchive $assetsFile") <
      windows.indexOf("$tableCount"),
  );
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

test("restore rejects malicious tar listings before database or asset cleanup", async () => {
  const parent = await mkdtemp(join(tmpdir(), "blue-canvas-restore-archive-"));
  const assetRoot = join(parent, "assets");
  const payload = join(parent, "payload");
  const fakeBin = join(parent, "bin");
  const backup = join(parent, "backup");
  const outsideSentinel = join(parent, "outside-sentinel");
  await mkdir(assetRoot, { mode: 0o700 });
  await chmod(assetRoot, 0o700);
  await writeFile(
    join(assetRoot, ".blue-canvas-assets-root"),
    "blue-canvas-assets-v1\n",
  );
  await writeFile(join(assetRoot, "old.txt"), "must-survive");
  await writeFile(outsideSentinel, "outside-must-survive");
  await mkdir(payload);
  await writeFile(join(payload, "safe.txt"), "archive-content");
  await mkdir(fakeBin);
  await mkdir(backup);
  const archive = join(backup, "assets.tar.gz");
  await execFileAsync("tar", [
    "--transform=s|safe.txt|../../outside-sentinel|",
    "-czf",
    archive,
    "-C",
    payload,
    "safe.txt",
  ]);
  const database = join(backup, "database.sql.gz");
  await writeFile(database, gzipSync("-- malicious test dump\n"));
  const checksum = (file) => createHash("sha256").update(file).digest("hex");
  await writeFile(
    join(backup, "SHA256SUMS"),
    `${checksum(await readFile(database))}  database.sql.gz\n${checksum(await readFile(archive))}  assets.tar.gz\n`,
  );
  const mysqlLog = join(parent, "mysql-invoked");
  const fakeMysql = join(fakeBin, "mysql");
  await writeFile(
    fakeMysql,
    `#!/bin/sh\nprintf invoked > "$MYSQL_LOG"\nexit 0\n`,
  );
  await chmod(fakeMysql, 0o700);

  await assert.rejects(
    execFileAsync(
      "bash",
      [new URL("scripts/restore.sh", root).pathname, backup],
      {
        env: {
          ...process.env,
          PATH: `${fakeBin}:${process.env.PATH}`,
          MYSQL_LOG: mysqlLog,
          ASSET_STORAGE_ROOT: assetRoot,
          DATABASE_HOST: "127.0.0.1",
          DATABASE_PORT: "3306",
          DATABASE_NAME: "blue_canvas",
          DATABASE_USER: "blue_canvas",
          DATABASE_PASSWORD: "not-used",
        },
      },
    ),
    /unsafe|archive|path|traversal/i,
  );
  await assert.rejects(readFile(mysqlLog));
  assert.equal(await readFile(outsideSentinel, "utf8"), "outside-must-survive");
  assert.equal(
    await readFile(join(assetRoot, "old.txt"), "utf8"),
    "must-survive",
  );
});

test("restore rejects symlink archive entries before database or asset cleanup", async () => {
  const parent = await mkdtemp(join(tmpdir(), "blue-canvas-restore-link-"));
  const assetRoot = join(parent, "assets");
  const payload = join(parent, "payload");
  const fakeBin = join(parent, "bin");
  const backup = join(parent, "backup");
  const outsideSentinel = join(parent, "outside-sentinel");
  await mkdir(assetRoot, { mode: 0o700 });
  await chmod(assetRoot, 0o700);
  await writeFile(
    join(assetRoot, ".blue-canvas-assets-root"),
    "blue-canvas-assets-v1\n",
  );
  await writeFile(join(assetRoot, "old.txt"), "must-survive");
  await writeFile(outsideSentinel, "outside-must-survive");
  await mkdir(payload);
  await writeFile(join(payload, "safe.txt"), "archive-content");
  await symlink(outsideSentinel, join(payload, "linked.txt"));
  await mkdir(fakeBin);
  await mkdir(backup);
  const archive = join(backup, "assets.tar.gz");
  await execFileAsync("tar", ["-czf", archive, "-C", payload, "."]);
  const database = join(backup, "database.sql.gz");
  await writeFile(database, gzipSync("-- malicious test dump\n"));
  const checksum = (file) => createHash("sha256").update(file).digest("hex");
  await writeFile(
    join(backup, "SHA256SUMS"),
    `${checksum(await readFile(database))}  database.sql.gz\n${checksum(await readFile(archive))}  assets.tar.gz\n`,
  );
  const mysqlLog = join(parent, "mysql-invoked");
  const fakeMysql = join(fakeBin, "mysql");
  await writeFile(
    fakeMysql,
    `#!/bin/sh\nprintf invoked > "$MYSQL_LOG"\nexit 0\n`,
  );
  await chmod(fakeMysql, 0o700);

  await assert.rejects(
    execFileAsync(
      "bash",
      [new URL("scripts/restore.sh", root).pathname, backup],
      {
        env: {
          ...process.env,
          PATH: `${fakeBin}:${process.env.PATH}`,
          MYSQL_LOG: mysqlLog,
          ASSET_STORAGE_ROOT: assetRoot,
          DATABASE_HOST: "127.0.0.1",
          DATABASE_PORT: "3306",
          DATABASE_NAME: "blue_canvas",
          DATABASE_USER: "blue_canvas",
          DATABASE_PASSWORD: "not-used",
        },
      },
    ),
    /unsafe|archive|path|symlink/i,
  );
  await assert.rejects(readFile(mysqlLog));
  assert.equal(await readFile(outsideSentinel, "utf8"), "outside-must-survive");
  assert.equal(
    await readFile(join(assetRoot, "old.txt"), "utf8"),
    "must-survive",
  );
});
