const SEMVER_PATTERN =
  /^(?<major>0|[1-9]\d{0,4})\.(?<minor>0|[1-9]\d{0,4})\.(?<patch>0|[1-9]\d{0,4})$/u;

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

export function parseSemver(input: string): SemVer {
  const match = SEMVER_PATTERN.exec(input);
  if (!match?.groups) {
    throw new Error(`Invalid semver ${JSON.stringify(input)}`);
  }
  return {
    major: Number(match.groups["major"]),
    minor: Number(match.groups["minor"]),
    patch: Number(match.groups["patch"]),
  };
}

export function isValidSemver(input: string): boolean {
  return SEMVER_PATTERN.test(input);
}

export function compareSemver(a: SemVer, b: SemVer): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

export function serializeSemver(version: SemVer): string {
  return `${version.major}.${version.minor}.${version.patch}`;
}

export function bumpPatch(version: string): string {
  const parsed = parseSemver(version);
  return serializeSemver({ ...parsed, patch: parsed.patch + 1 });
}

export interface CompatibilityCheck {
  compatible: boolean;
  reason?: string;
}

export function isCompatible(
  required: string,
  provided: string,
): CompatibilityCheck {
  const need = parseSemver(required);
  const have = parseSemver(provided);
  if (need.major !== have.major) {
    return {
      compatible: false,
      reason: `Major version mismatch: needs ${need.major}, provided ${have.major}`,
    };
  }
  if (compareSemver(have, need) < 0) {
    return {
      compatible: false,
      reason: `Provided version ${serializeSemver(have)} is older than required ${serializeSemver(need)}`,
    };
  }
  return { compatible: true };
}
