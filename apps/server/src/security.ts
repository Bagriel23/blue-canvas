import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { hash, verify } from "@node-rs/argon2";
import type { ProjectRole } from "@blue-canvas/contracts";

export type ProjectAction =
  | "project:read"
  | "project:update"
  | "project:archive"
  | "members:manage"
  | "assets:write";

const PROJECT_ROLE_ACTIONS: Readonly<
  Record<ProjectRole, ReadonlySet<ProjectAction>>
> = {
  owner: new Set([
    "project:read",
    "project:update",
    "project:archive",
    "members:manage",
    "assets:write",
  ]),
  editor: new Set(["project:read", "project:update", "assets:write"]),
  commenter: new Set(["project:read"]),
  viewer: new Set(["project:read"]),
};

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}

export class ArgonPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    return hash(password, {
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
      outputLen: 32,
    });
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    return verify(passwordHash, password);
  }
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function issueSecret(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: sha256(raw) };
}

export function hashesEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function canProjectRole(
  role: ProjectRole,
  action: string,
): action is ProjectAction {
  return PROJECT_ROLE_ACTIONS[role].has(action as ProjectAction);
}
