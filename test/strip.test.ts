import { describe, expect, it } from "vitest";
import { parseExif } from "@nasdigitaluk/withnate-tool-core";
import { stripMetadata, stripSupportFor } from "../src/strip.js";

const a = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));
const be16 = (n: number): number[] => [(n >> 8) & 0xff, n & 0xff];
const be32 = (n: number): number[] => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];

/** Entropy-coded data. Distinctive so the test can prove it survived intact. */
const SCAN = [0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc];

interface JpegOpts {
  jfif?: boolean;
  exif?: boolean;
  icc?: boolean;
  comment?: boolean;
  iptc?: boolean;
}

/** A JPEG with a realistic segment list: metadata, tables, a frame and a scan. */
const jpeg = (o: JpegOpts = {}): Uint8Array => {
  const b: number[] = [0xff, 0xd8];
  if (o.jfif) b.push(0xff, 0xe0, ...be16(16), ...a("JFIF"), 0, 1, 2, 1, ...be16(300), ...be16(300), 0, 0);
  if (o.exif) {
    // A minimal but real TIFF block: little-endian, magic 42, one IFD entry.
    const tiff = [
      0x49, 0x49, 42, 0, 8, 0, 0, 0,
      1, 0, 0x0f, 0x01, 2, 0, 3, 0, 0, 0, 0x1a, 0, 0, 0, 0, 0, 0, 0,
      ...a("FC"), 0,
    ];
    const payload = [...a("Exif"), 0, 0, ...tiff];
    b.push(0xff, 0xe1, ...be16(payload.length + 2), ...payload);
  }
  if (o.icc) b.push(0xff, 0xe2, ...be16(14), ...a("ICC_PROFILE"), 0, 1);
  if (o.iptc) b.push(0xff, 0xed, ...be16(10), ...a("Photosho"));
  if (o.comment) b.push(0xff, 0xfe, ...be16(10), ...a("a comment"[0]!.repeat(8)));
  b.push(0xff, 0xdb, ...be16(5), 0, 1, 2); // quantisation table
  b.push(0xff, 0xc0, ...be16(17), 8, ...be16(48), ...be16(64), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1);
  b.push(0xff, 0xc4, ...be16(6), 0, 1, 2, 3); // Huffman table
  b.push(0xff, 0xda, ...be16(8), 1, 1, 0, 0, 0x3f, 0);
  b.push(...SCAN, 0xff, 0xd9);
  return new Uint8Array(b);
};

const IDAT = [0x78, 0x9c, 0x01, 0x02, 0x03, 0x04, 0x05];

const png = (o: { text?: boolean; exif?: boolean; icc?: boolean; time?: boolean } = {}): Uint8Array => {
  const b: number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  b.push(...be32(13), ...a("IHDR"), ...be32(64), ...be32(48), 8, 6, 0, 0, 0, 0, 0, 0, 0);
  if (o.icc) b.push(...be32(6), ...a("iCCP"), ...a("sRGB"), 0, 0, 0, 0, 0, 0);
  // "Author" + NUL + "Nat" is 10 data bytes. Declaring 11 walks the reader
  // one byte past every following chunk, which is what this caught.
  if (o.text) b.push(...be32(10), ...a("tEXt"), ...a("Author"), 0, ...a("Nat"), 0, 0, 0, 0);
  if (o.exif) b.push(...be32(8), ...a("eXIf"), 0x49, 0x49, 42, 0, 8, 0, 0, 0, 0, 0, 0, 0);
  if (o.time) b.push(...be32(7), ...a("tIME"), 7, 0xe8, 3, 17, 14, 22, 8, 0, 0, 0, 0);
  b.push(...be32(IDAT.length), ...a("IDAT"), ...IDAT, 0, 0, 0, 0);
  b.push(...be32(0), ...a("IEND"), 0, 0, 0, 0);
  return new Uint8Array(b);
};

const tailFrom = (bytes: Uint8Array, marker: number[]): Uint8Array => {
  for (let i = 0; i <= bytes.length - marker.length; i += 1) {
    if (marker.every((m, k) => bytes[i + k] === m)) return bytes.subarray(i);
  }
  return new Uint8Array(0);
};

describe("stripping a JPEG", () => {
  it("removes Exif and says so", () => {
    const r = stripMetadata(jpeg({ exif: true }))!;
    expect(r.removed).toContain("Exif and XMP (camera, timestamps, GPS)");
    expect(parseExif(r.bytes)).toBeNull();
  });

  it("leaves the compressed image data bit-for-bit identical", () => {
    // The claim the whole module rests on. Drawing to a canvas and exporting
    // again would be far simpler and would replace the original compression
    // with a second generation of loss - a visibly worse "clean copy", for no
    // reason connected to privacy.
    const original = jpeg({ jfif: true, exif: true, icc: true, comment: true });
    const stripped = stripMetadata(original)!;
    const before = tailFrom(original, [0xff, 0xda]);
    const after = tailFrom(stripped.bytes, [0xff, 0xda]);
    expect(after.length).toBe(before.length);
    expect([...after]).toEqual([...before]);
  });

  it("keeps the ICC colour profile", () => {
    // Stripping this changes how the picture renders on a wide-gamut screen -
    // a visible defect introduced by a privacy tool.
    const r = stripMetadata(jpeg({ exif: true, icc: true }))!;
    const s = [...r.bytes].map((c) => String.fromCharCode(c)).join("");
    expect(s).toContain("ICC_PROFILE");
  });

  it("keeps JFIF, which carries the print density and identifies nobody", () => {
    const r = stripMetadata(jpeg({ jfif: true, exif: true }))!;
    const s = [...r.bytes].map((c) => String.fromCharCode(c)).join("");
    expect(s).toContain("JFIF");
  });

  it("keeps the quantisation and Huffman tables, without which it will not decode", () => {
    const r = stripMetadata(jpeg({ exif: true }))!;
    const has = (m: number): boolean =>
      [...r.bytes].some((_, i) => r.bytes[i] === 0xff && r.bytes[i + 1] === m);
    expect(has(0xdb)).toBe(true);
    expect(has(0xc4)).toBe(true);
    expect(has(0xc0)).toBe(true);
  });

  it("removes the comment and the Photoshop block too", () => {
    const r = stripMetadata(jpeg({ comment: true, iptc: true }))!;
    expect(r.removed).toContain("Embedded comment");
    expect(r.removed).toContain("Photoshop / IPTC block (author, caption)");
  });

  it("gets smaller, and reports by how much", () => {
    const original = jpeg({ exif: true, comment: true });
    const r = stripMetadata(original)!;
    expect(r.bytesSaved).toBeGreaterThan(0);
    expect(r.bytes.length + r.bytesSaved).toBe(original.length);
  });

  it("is idempotent - stripping a clean file changes nothing", () => {
    const once = stripMetadata(jpeg({ jfif: true, exif: true }))!;
    const twice = stripMetadata(once.bytes)!;
    expect([...twice.bytes]).toEqual([...once.bytes]);
    expect(twice.removed).toEqual([]);
    expect(twice.bytesSaved).toBe(0);
  });
});

describe("stripping a PNG", () => {
  it("removes text, Exif and the timestamp", () => {
    const r = stripMetadata(png({ text: true, exif: true, time: true }))!;
    expect(r.removed).toEqual(
      expect.arrayContaining(["Text comments", "Exif (camera, timestamps, GPS)", "Last-modified timestamp"]),
    );
  });

  it("leaves the image data bit-for-bit identical", () => {
    const stripped = stripMetadata(png({ text: true, exif: true, icc: true }))!;
    const idat = tailFrom(stripped.bytes, [...a("IDAT")]);
    expect([...idat.subarray(4, 4 + IDAT.length)]).toEqual(IDAT);
  });

  it("keeps iCCP, the colour profile", () => {
    const r = stripMetadata(png({ text: true, icc: true }))!;
    const s = [...r.bytes].map((c) => String.fromCharCode(c)).join("");
    expect(s).toContain("iCCP");
  });

  it("keeps IHDR and IEND, without which it is not a PNG", () => {
    const r = stripMetadata(png({ text: true }))!;
    const s = [...r.bytes].map((c) => String.fromCharCode(c)).join("");
    expect(s).toContain("IHDR");
    expect(s).toContain("IEND");
  });

  it("is idempotent", () => {
    const once = stripMetadata(png({ text: true, exif: true }))!;
    const twice = stripMetadata(once.bytes)!;
    expect([...twice.bytes]).toEqual([...once.bytes]);
  });
});

describe("refusals", () => {
  it("returns null for a format it cannot strip losslessly", () => {
    // A GIF or WebP could be pushed through a canvas and come back "clean",
    // but re-compressed and, for GIF, re-quantised to a new palette. Handing
    // somebody a visibly degraded file and calling it their photo is worse
    // than saying it is not supported.
    const gif = new Uint8Array([...a("GIF89a"), 10, 0, 10, 0, 0, 0, 0]);
    expect(stripMetadata(gif)).toBeNull();
    expect(stripSupportFor(gif)).toBe("unsupported");
  });

  it("recognises what it can handle", () => {
    expect(stripSupportFor(jpeg({ exif: true }))).toBe("lossless");
    expect(stripSupportFor(png({ text: true }))).toBe("lossless");
  });

  it("does not throw on a truncated file", () => {
    const full = jpeg({ jfif: true, exif: true });
    for (const cut of [4, 10, 30, 60]) {
      expect(() => stripMetadata(full.slice(0, cut))).not.toThrow();
    }
  });
});
