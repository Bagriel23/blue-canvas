export interface ZipEntry {
  path: string;
  bytes: Uint8Array;
}

interface NormalizedEntry extends ZipEntry {
  pathBytes: Uint8Array;
  crc: number;
  offset: number;
}

const encoder = new TextEncoder();

function normalizePath(path: string): string {
  const normalized = path.replaceAll("\\\\", "/");
  if (
    normalized.length === 0 ||
    normalized.startsWith("/") ||
    normalized
      .split("/")
      .some((part) => part.length === 0 || part === "." || part === "..")
  ) {
    throw new Error(`unsafe archive path: ${path}`);
  }
  return normalized;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeU16(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
}

function writeU32(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(
    parts.reduce((total, part) => total + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

/** Creates a store-only ZIP with fixed timestamps and stable entry ordering. */
export async function createDeterministicZip(
  entries: readonly ZipEntry[],
): Promise<Uint8Array> {
  const normalized = entries.map((entry) => {
    const path = normalizePath(entry.path);
    return {
      path,
      bytes: Uint8Array.from(entry.bytes),
      pathBytes: encoder.encode(path),
      crc: crc32(entry.bytes),
      offset: 0,
    } satisfies NormalizedEntry;
  });
  normalized.sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index]?.path === normalized[index - 1]?.path) {
      throw new Error(`duplicate archive path: ${normalized[index]?.path}`);
    }
  }

  const localParts: Uint8Array[] = [];
  let offset = 0;
  for (const entry of normalized) {
    entry.offset = offset;
    const header = new Uint8Array(30 + entry.pathBytes.length);
    writeU32(header, 0, 0x04034b50);
    writeU16(header, 4, 20);
    writeU16(header, 6, 0x800);
    writeU16(header, 8, 0);
    writeU16(header, 10, 0);
    writeU16(header, 12, 0);
    writeU32(header, 14, entry.crc);
    writeU32(header, 18, entry.bytes.length);
    writeU32(header, 22, entry.bytes.length);
    writeU16(header, 26, entry.pathBytes.length);
    header.set(entry.pathBytes, 30);
    localParts.push(header, entry.bytes);
    offset += header.length + entry.bytes.length;
  }

  const centralParts: Uint8Array[] = [];
  for (const entry of normalized) {
    const header = new Uint8Array(46 + entry.pathBytes.length);
    writeU32(header, 0, 0x02014b50);
    writeU16(header, 4, 20);
    writeU16(header, 6, 20);
    writeU16(header, 8, 0x800);
    writeU16(header, 10, 0);
    writeU16(header, 12, 0);
    writeU16(header, 14, 0);
    writeU32(header, 16, entry.crc);
    writeU32(header, 20, entry.bytes.length);
    writeU32(header, 24, entry.bytes.length);
    writeU16(header, 28, entry.pathBytes.length);
    writeU16(header, 30, 0);
    writeU16(header, 32, 0);
    writeU16(header, 34, 0);
    writeU16(header, 36, 0);
    writeU32(header, 38, 0);
    writeU32(header, 42, entry.offset);
    header.set(entry.pathBytes, 46);
    centralParts.push(header);
  }
  const central = concat(centralParts);
  const end = new Uint8Array(22);
  writeU32(end, 0, 0x06054b50);
  writeU16(end, 8, normalized.length);
  writeU16(end, 10, normalized.length);
  writeU32(end, 12, central.length);
  writeU32(end, 16, offset);
  return concat([...localParts, central, end]);
}
