/**
 * Removing metadata without touching the picture.
 *
 * This is byte surgery on the container, not a re-encode. Both JPEG and PNG
 * keep their metadata in discrete blocks alongside the compressed image data,
 * so the metadata can be cut out and the image data copied across untouched.
 *
 * That distinction matters more than it sounds. The obvious way to strip a
 * JPEG in a browser is to draw it to a canvas and export it again, and that
 * throws away the original compression and replaces it with a second
 * generation of loss - so the "clean copy" is visibly worse than the file it
 * came from, for no reason connected to privacy. **This is lossless. The
 * pixels in the output are bit-for-bit the pixels in the input.**
 *
 * Pure functions over byte arrays, so all of it is testable without a browser.
 */

export interface StripResult {
  bytes: Uint8Array;
  /** Human names of what was removed, for showing the person what happened. */
  removed: string[];
  bytesSaved: number;
}

const ascii = (b: Uint8Array, at: number, s: string): boolean => {
  for (let i = 0; i < s.length; i += 1) if (b[at + i] !== s.charCodeAt(i)) return false;
  return true;
};

// ------------------------------------------------------------------- JPEG

/**
 * Segments removed, and the reasoning for each.
 *
 * APP1 carries Exif and XMP - the camera, the timestamps, the serial number
 * and the GPS. APP13 is the Photoshop block, which carries IPTC captions and
 * author fields. COM is a free-text comment. All three are metadata and none
 * of them affects how the image renders.
 */
const JPEG_STRIP: Record<number, string> = {
  0xe1: "Exif and XMP (camera, timestamps, GPS)",
  0xed: "Photoshop / IPTC block (author, caption)",
  0xfe: "Embedded comment",
};

/**
 * Kept deliberately, and this is the half that is easy to get wrong.
 *
 * APP0 is JFIF, which carries the print density - not personal, and removing
 * it changes what size the file claims to print at. APP2 is the ICC colour
 * profile: strip that and the picture genuinely changes colour on a
 * wide-gamut screen, which is a visible defect introduced by a privacy tool.
 */
const JPEG_KEEP = new Set([0xe0, 0xe2]);

const stripJpeg = (bytes: Uint8Array): StripResult => {
  const out: number[] = [0xff, 0xd8];
  const removed: string[] = [];
  let p = 2;

  while (p + 4 <= bytes.length) {
    if (bytes[p] !== 0xff) {
      p += 1;
      continue;
    }
    const marker = bytes[p + 1]!;

    // Standalone markers carry no length word.
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9) || marker === 0x01) {
      out.push(0xff, marker);
      p += 2;
      continue;
    }

    const len = (bytes[p + 2]! << 8) | bytes[p + 3]!;
    if (len < 2) break;
    const end = p + 2 + len;

    // Start of scan: everything after this is entropy-coded image data and
    // must be copied verbatim to the end of the file. There is no metadata
    // past here, and trying to parse it as segments would corrupt the image.
    if (marker === 0xda) {
      for (let i = p; i < bytes.length; i += 1) out.push(bytes[i]!);
      p = bytes.length;
      break;
    }

    const label = JPEG_STRIP[marker];
    if (label !== undefined && !JPEG_KEEP.has(marker)) {
      if (!removed.includes(label)) removed.push(label);
    } else {
      for (let i = p; i < Math.min(end, bytes.length); i += 1) out.push(bytes[i]!);
    }
    p = end;
  }

  return { bytes: new Uint8Array(out), removed, bytesSaved: bytes.length - out.length };
};

// -------------------------------------------------------------------- PNG

/**
 * PNG chunks removed. Everything else - including iCCP, the colour profile -
 * is copied straight across.
 */
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
  const out: number[] = [];
  const removed: string[] = [];
  for (let i = 0; i < 8; i += 1) out.push(bytes[i]!);

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
      for (let i = p; i < Math.min(p + total, bytes.length); i += 1) out.push(bytes[i]!);
    }

    p += total;
    if (name === "IEND") break;
  }

  return { bytes: new Uint8Array(out), removed, bytesSaved: bytes.length - out.length };
};

// ------------------------------------------------------------------ public

export type StripSupport = "lossless" | "unsupported";

export const stripSupportFor = (bytes: Uint8Array): StripSupport => {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "lossless";
  if (bytes.length > 8 && ascii(bytes, 0, "\x89PNG")) return "lossless";
  return "unsupported";
};

/**
 * Strip metadata, losslessly, or return null for a format not handled.
 *
 * Null rather than a re-encoded fallback on purpose. A GIF or a WebP could be
 * pushed through a canvas and come back "clean", but it would be a different
 * picture - re-compressed, and for GIF re-quantised to a new palette. Handing
 * somebody a visibly degraded file and calling it their photo with the
 * metadata removed is worse than saying it is not supported.
 */
export const stripMetadata = (bytes: Uint8Array): StripResult | null => {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return stripJpeg(bytes);
  }
  if (bytes.length > 8 && ascii(bytes, 0, "\x89PNG")) return stripPng(bytes);
  return null;
};
