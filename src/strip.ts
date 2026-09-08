export interface StripResult {

  bytes: Uint8Array<ArrayBuffer>;

  removed: string[];
  bytesSaved: number;
}

const ascii = (b: Uint8Array, at: number, s: string): boolean => {
  for (let i = 0; i < s.length; i += 1) if (b[at + i] !== s.charCodeAt(i)) return false;
  return true;
};

export const JPEG_STRIP: Record<number, string> = {
  0xe1: "Exif and XMP (camera, timestamps, GPS)",
  0xed: "Photoshop / IPTC block (author, caption)",
  0xfe: "Embedded comment",
};

export const JPEG_KEEP = new Set([0xe0, 0xe2]);

type Keep = Array<[number, number]>;

const assemble = (bytes: Uint8Array, keep: Keep): Uint8Array<ArrayBuffer> => {
  let total = 0;
  for (const [s, e] of keep) total += e - s;
  const out = new Uint8Array(total);
  let at = 0;
  for (const [s, e] of keep) {
    out.set(bytes.subarray(s, e), at);
    at += e - s;
  }
  return out;
};

const stripJpeg = (bytes: Uint8Array): StripResult => {
  const keep: Keep = [[0, 2]];
  const removed: string[] = [];
  let p = 2;

  while (p + 4 <= bytes.length) {
    if (bytes[p] !== 0xff) {
      p += 1;
      continue;
    }
    const marker = bytes[p + 1]!;

    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9) || marker === 0x01) {
      keep.push([p, p + 2]);
      p += 2;
      continue;
    }

    const len = (bytes[p + 2]! << 8) | bytes[p + 3]!;
    if (len < 2) break;
    const end = p + 2 + len;

    if (marker === 0xda) {
      keep.push([p, bytes.length]);
      p = bytes.length;
      break;
    }

    const label = JPEG_STRIP[marker];
    if (label !== undefined) {
      if (!removed.includes(label)) removed.push(label);
    } else {
      keep.push([p, Math.min(end, bytes.length)]);
    }
    p = end;
  }

  const out = assemble(bytes, keep);
  return { bytes: out, removed, bytesSaved: bytes.length - out.length };
};

const PNG_STRIP: Record<string, string> = {
  tEXt: "Text comments",
  zTXt: "Compressed text comments",
  iTXt: "International text comments (often XMP)",
  eXIf: "Exif (camera, timestamps, GPS)",
  tIME: "Last-modified timestamp",
};

const be32 = (b: Uint8Array, i: number): number =>
  ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0;

const stripPng = (bytes: Uint8Array): StripResult => {
  const keep: Keep = [[0, 8]];
  const removed: string[] = [];

  let p = 8;
  while (p + 8 <= bytes.length) {
    const len = be32(bytes, p);
    const total = 12 + len;
    let name = "";
    for (let i = 0; i < 4; i += 1) name += String.fromCharCode(bytes[p + 4 + i]!);

    const label = PNG_STRIP[name];
    if (label !== undefined) {
      if (!removed.includes(label)) removed.push(label);
    } else {
      keep.push([p, Math.min(p + total, bytes.length)]);
    }

    p += total;
    if (name === "IEND") break;
  }

  const out = assemble(bytes, keep);
  return { bytes: out, removed, bytesSaved: bytes.length - out.length };
};

export type StripSupport = "lossless" | "unsupported";

export const stripSupportFor = (bytes: Uint8Array): StripSupport => {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "lossless";
  if (bytes.length > 8 && ascii(bytes, 0, "\x89PNG")) return "lossless";
  return "unsupported";
};

export const stripMetadata = (bytes: Uint8Array): StripResult | null => {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return stripJpeg(bytes);
  }
  if (bytes.length > 8 && ascii(bytes, 0, "\x89PNG")) return stripPng(bytes);
  return null;
};
