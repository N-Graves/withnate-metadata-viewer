import { describe, expect, it } from "vitest";
import { JPEG_KEEP, JPEG_STRIP, stripMetadata } from "../src/strip.js";

describe("the strip list and the keep list", () => {

  it("never name the same marker", () => {
    const both = Object.keys(JPEG_STRIP)
      .map(Number)
      .filter((m) => JPEG_KEEP.has(m));
    expect(both).toEqual([]);
  });

  it("keeps the two segments whose removal would change the picture", () => {

    expect(JPEG_KEEP.has(0xe0)).toBe(true);
    expect(JPEG_KEEP.has(0xe2)).toBe(true);
  });
});

describe("assembling the output", () => {
  const scan = Uint8Array.from({ length: 200_000 }, (_, i) => (i * 7 + 3) & 0xff);

  const jpeg = (): Uint8Array => {

    const app1 = [0xff, 0xe1, 0x00, 0x0e, ...[..."Exif\0\0"].map((c) => c.charCodeAt(0)), 1, 2, 3, 4, 5, 6];
    const sos = [0xff, 0xda, 0x00, 0x08, 1, 1, 0, 0, 0x3f, 0];
    return Uint8Array.from([0xff, 0xd8, ...app1, ...sos, ...scan]);
  };

  it("copies a large scan through byte for byte", () => {
    const source = jpeg();
    const result = stripMetadata(source)!;
    expect(result.removed).toContain("Exif and XMP (camera, timestamps, GPS)");

    const tail = result.bytes.subarray(result.bytes.length - scan.length);
    expect(tail).toEqual(scan);
    expect(result.bytesSaved).toBe(source.length - result.bytes.length);
    expect(result.bytesSaved).toBeGreaterThan(0);
  });

  it("returns a real Uint8Array sized exactly to what it kept", () => {
    const result = stripMetadata(jpeg())!;
    expect(result.bytes).toBeInstanceOf(Uint8Array);
    expect(result.bytes.byteLength).toBe(result.bytes.length);
  });
});
