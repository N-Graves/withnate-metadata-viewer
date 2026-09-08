/*! withnate-metadata-viewer v0.1.0 - MIT
 * https://github.com/N-Graves/withnate-metadata-viewer#readme
 * Runs entirely in the browser. No network requests, no storage.
 */
"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key2, value) => key2 in obj ? __defProp(obj, key2, { enumerable: true, configurable: true, writable: true, value }) : obj[key2] = value;
  var __publicField = (obj, key2, value) => __defNormalProp(obj, typeof key2 !== "symbol" ? key2 + "" : key2, value);

  // node_modules/@nasdigitaluk/withnate-tool-core/dist/sniff.js
  var startsWith = (bytes, sig, offset = 0) => {
    if (bytes.length < offset + sig.length)
      return false;
    for (let i = 0; i < sig.length; i += 1) {
      if (bytes[offset + i] !== sig[i])
        return false;
    }
    return true;
  };
  var PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];
  var JPEG_SIG = [255, 216, 255];
  var GIF87_SIG = [71, 73, 70, 56, 55, 97];
  var GIF89_SIG = [71, 73, 70, 56, 57, 97];
  var RIFF_SIG = [82, 73, 70, 70];
  var WEBP_SIG = [87, 69, 66, 80];
  var HEADER_BYTES = 64 * 1024;
  var sniffFormat = (bytes) => {
    if (startsWith(bytes, PNG_SIG))
      return "png";
    if (startsWith(bytes, JPEG_SIG))
      return "jpeg";
    if (startsWith(bytes, GIF87_SIG) || startsWith(bytes, GIF89_SIG))
      return "gif";
    if (startsWith(bytes, RIFF_SIG) && startsWith(bytes, WEBP_SIG, 8))
      return "webp";
    return null;
  };

  // node_modules/@nasdigitaluk/withnate-tool-core/dist/exif.js
  var TYPE_SIZE = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];
  var key = (ifd, tag) => `${ifd}:${tag}`;
  var ascii = (b, at2, s) => {
    for (let i = 0; i < s.length; i += 1)
      if (b[at2 + i] !== s.charCodeAt(i))
        return false;
    return true;
  };
  var be32 = (b, i) => (b[i] << 24 | b[i + 1] << 16 | b[i + 2] << 8 | b[i + 3]) >>> 0;
  var le32At = (b, i) => (b[i] | b[i + 1] << 8 | b[i + 2] << 16 | b[i + 3] << 24) >>> 0;
  var findTiffBlock = (bytes) => {
    const format = sniffFormat(bytes);
    if (format === "jpeg") {
      let p = 2;
      while (p + 4 <= bytes.length) {
        if (bytes[p] !== 255) {
          p += 1;
          continue;
        }
        const marker = bytes[p + 1];
        if (marker === 216 || marker >= 208 && marker <= 217 || marker === 1) {
          p += 2;
          continue;
        }
        const len = bytes[p + 2] << 8 | bytes[p + 3];
        if (len < 2)
          return null;
        if (marker === 225 && ascii(bytes, p + 4, "Exif\0\0")) {
          return bytes.subarray(p + 10, p + 2 + len);
        }
        if (marker === 218)
          return null;
        p = p + 2 + len;
      }
      return null;
    }
    if (format === "png") {
      let p = 8;
      while (p + 8 <= bytes.length) {
        const len = be32(bytes, p);
        if (ascii(bytes, p + 4, "eXIf"))
          return bytes.subarray(p + 8, p + 8 + len);
        if (ascii(bytes, p + 4, "IDAT") || ascii(bytes, p + 4, "IEND"))
          return null;
        p += 12 + len;
      }
      return null;
    }
    if (format === "webp") {
      let p = 12;
      while (p + 8 <= bytes.length) {
        const len = le32At(bytes, p + 4);
        if (ascii(bytes, p, "EXIF")) {
          const start = ascii(bytes, p + 8, "Exif\0\0") ? p + 14 : p + 8;
          return bytes.subarray(start, p + 8 + len);
        }
        p += 8 + len + len % 2;
      }
      return null;
    }
    return null;
  };
  var Reader = class {
    constructor(b, little) {
      __publicField(this, "b");
      __publicField(this, "little");
      this.b = b;
      this.little = little;
    }
    u16(i) {
      const a = this.b[i];
      const c = this.b[i + 1];
      if (a === void 0 || c === void 0)
        throw new RangeError("past the end");
      return this.little ? a | c << 8 : a << 8 | c;
    }
    u32(i) {
      const v = this.little ? le32At(this.b, i) : be32(this.b, i);
      if (!Number.isFinite(v))
        throw new RangeError("past the end");
      return v;
    }
    i32(i) {
      return this.u32(i) | 0;
    }
    byte(i) {
      const v = this.b[i];
      if (v === void 0)
        throw new RangeError("past the end");
      return v;
    }
  };
  var readValue = (r, block, type, count, offset) => {
    if (type === 2) {
      let s = "";
      for (let i = 0; i < count; i += 1) {
        const c = block[offset + i];
        if (c === void 0 || c === 0)
          break;
        s += String.fromCharCode(c);
      }
      return s.trim();
    }
    const one = (i) => {
      const at2 = offset + i * TYPE_SIZE[type];
      switch (type) {
        case 1:
        case 7:
          return r.byte(at2);
        case 3:
          return r.u16(at2);
        case 4:
          return r.u32(at2);
        case 9:
          return r.i32(at2);
        case 5:
          return { numerator: r.u32(at2), denominator: r.u32(at2 + 4) };
        case 10:
          return { numerator: r.i32(at2), denominator: r.i32(at2 + 4) };
        default:
          return 0;
      }
    };
    if (count === 1)
      return one(0);
    const out = [];
    for (let i = 0; i < count; i += 1)
      out.push(one(i));
    return out;
  };
  var IFD_EXIF_POINTER = 34665;
  var IFD_GPS_POINTER = 34853;
  var readIfd = (r, block, start, ifd, entries, seen, depth) => {
    if (depth > 4 || seen.has(start) || start + 2 > block.length)
      return 0;
    seen.add(start);
    const count = r.u16(start);
    let p = start + 2;
    for (let i = 0; i < count; i += 1, p += 12) {
      if (p + 12 > block.length)
        break;
      const tag = r.u16(p);
      const type = r.u16(p + 2);
      const n = r.u32(p + 4);
      const size = TYPE_SIZE[type] ?? 0;
      if (size === 0 || n === 0)
        continue;
      const bytesNeeded = size * n;
      const valueAt = bytesNeeded <= 4 ? p + 8 : r.u32(p + 8);
      if (valueAt + bytesNeeded > block.length)
        continue;
      if (tag === IFD_EXIF_POINTER || tag === IFD_GPS_POINTER) {
        const target = bytesNeeded <= 4 ? r.u32(p + 8) : valueAt;
        readIfd(r, block, target, tag === IFD_EXIF_POINTER ? "exif" : "gps", entries, seen, depth + 1);
        continue;
      }
      try {
        entries.push({ tag, ifd, type, count: n, value: readValue(r, block, type, n, valueAt) });
      } catch {
      }
    }
    return p + 4 <= block.length ? r.u32(p) : 0;
  };
  var parseExif = (bytes) => {
    try {
      const block = findTiffBlock(bytes);
      if (!block || block.length < 8)
        return null;
      const order = block[0] === 73 && block[1] === 73 ? "little" : block[0] === 77 && block[1] === 77 ? "big" : null;
      if (!order)
        return null;
      const r = new Reader(block, order === "little");
      if (r.u16(2) !== 42)
        return null;
      const entries = [];
      const seen = /* @__PURE__ */ new Set();
      const next = readIfd(r, block, r.u32(4), "image", entries, seen, 0);
      if (next > 0)
        readIfd(r, block, next, "thumbnail", entries, seen, 1);
      const byKey = /* @__PURE__ */ new Map();
      for (const e of entries)
        byKey.set(key(e.ifd, e.tag), e);
      return { byteOrder: order, entries, byKey };
    } catch {
      return null;
    }
  };
  var ratioValue = (v) => {
    if (typeof v === "number")
      return v;
    if (typeof v === "object" && v !== null && "numerator" in v) {
      return v.denominator === 0 ? null : v.numerator / v.denominator;
    }
    return null;
  };
  var exifNumber = (data, ifd, tag) => {
    const e = data.byKey.get(key(ifd, tag));
    return e ? ratioValue(e.value) : null;
  };
  var exifString = (data, ifd, tag) => {
    const e = data.byKey.get(key(ifd, tag));
    return e && typeof e.value === "string" && e.value.length > 0 ? e.value : null;
  };
  var TAG_X_RESOLUTION = 282;
  var TAG_Y_RESOLUTION = 283;
  var TAG_RESOLUTION_UNIT = 296;
  var exifResolution = (data) => {
    const x = exifNumber(data, "image", TAG_X_RESOLUTION);
    const y = exifNumber(data, "image", TAG_Y_RESOLUTION);
    if (x === null || y === null || x <= 0 || y <= 0)
      return null;
    const unit = exifNumber(data, "image", TAG_RESOLUTION_UNIT) ?? 2;
    if (unit === 2)
      return { x, y };
    if (unit === 3)
      return { x: x * 2.54, y: y * 2.54 };
    return null;
  };
  var TAG_GPS_LAT_REF = 1;
  var TAG_GPS_LAT = 2;
  var TAG_GPS_LON_REF = 3;
  var TAG_GPS_LON = 4;
  var dmsToDegrees = (v) => {
    if (!Array.isArray(v) || v.length < 3)
      return null;
    const parts = v.map((p) => ratioValue(p));
    if (parts.some((p) => p === null))
      return null;
    const [d, m, s] = parts;
    return d + m / 60 + s / 3600;
  };
  var exifGps = (data) => {
    const lat = data.byKey.get(key("gps", TAG_GPS_LAT));
    const lon = data.byKey.get(key("gps", TAG_GPS_LON));
    if (!lat || !lon)
      return null;
    const latDeg = dmsToDegrees(lat.value);
    const lonDeg = dmsToDegrees(lon.value);
    if (latDeg === null || lonDeg === null)
      return null;
    const latRef = exifString(data, "gps", TAG_GPS_LAT_REF) ?? "N";
    const lonRef = exifString(data, "gps", TAG_GPS_LON_REF) ?? "E";
    return {
      latitude: latRef.toUpperCase().startsWith("S") ? -latDeg : latDeg,
      longitude: lonRef.toUpperCase().startsWith("W") ? -lonDeg : lonDeg
    };
  };

  // node_modules/@nasdigitaluk/withnate-tool-core/dist/dimensions.js
  var MM_PER_INCH = 25.4;
  var MM_PER_METRE = 1e3;
  var at = (b, i) => {
    const v = b[i];
    if (v === void 0)
      throw new RangeError(`byte ${i} is past the end of the buffer`);
    return v;
  };
  var be16 = (b, i) => at(b, i) << 8 | at(b, i + 1);
  var le16 = (b, i) => at(b, i) | at(b, i + 1) << 8;
  var le24 = (b, i) => at(b, i) | at(b, i + 1) << 8 | at(b, i + 2) << 16;
  var be322 = (b, i) => (at(b, i) << 24 | at(b, i + 1) << 16 | at(b, i + 2) << 8 | at(b, i + 3)) >>> 0;
  var asciiAt = (b, i, s) => {
    for (let k = 0; k < s.length; k += 1) {
      if (b[i + k] !== s.charCodeAt(k))
        return false;
    }
    return true;
  };
  var measurePng = (b) => {
    const width = be322(b, 16);
    const height = be322(b, 20);
    let density = null;
    let p = 8;
    while (p + 8 <= b.length) {
      const len = be322(b, p);
      const type = p + 4;
      if (asciiAt(b, type, "IDAT") || asciiAt(b, type, "IEND"))
        break;
      if (asciiAt(b, type, "pHYs") && len === 9 && p + 8 + 9 <= b.length) {
        const d = p + 8;
        const unit = at(b, d + 8);
        if (unit === 1) {
          density = {
            x: be322(b, d) * MM_PER_INCH / MM_PER_METRE,
            y: be322(b, d + 4) * MM_PER_INCH / MM_PER_METRE,
            source: "png-phys"
          };
        }
        break;
      }
      p += 12 + len;
    }
    return { format: "png", width, height, density };
  };
  var isSof = (m) => m >= 192 && m <= 195 || m >= 197 && m <= 199 || m >= 201 && m <= 203 || m >= 205 && m <= 207;
  var measureJpeg = (b) => {
    let density = null;
    let p = 2;
    while (p + 4 <= b.length) {
      if (at(b, p) !== 255) {
        p += 1;
        continue;
      }
      const marker = at(b, p + 1);
      if (marker === 255) {
        p += 1;
        continue;
      }
      if (marker === 216 || marker >= 208 && marker <= 217 || marker === 1) {
        p += 2;
        continue;
      }
      const len = be16(b, p + 2);
      if (len < 2)
        break;
      const payload = p + 4;
      if (isSof(marker)) {
        return { format: "jpeg", height: be16(b, payload + 1), width: be16(b, payload + 3), density };
      }
      if (marker === 224 && asciiAt(b, payload, "JFIF\0")) {
        const units = at(b, payload + 7);
        const x = be16(b, payload + 8);
        const y = be16(b, payload + 10);
        if (units === 1 && x > 0 && y > 0)
          density = { x, y, source: "jfif" };
        else if (units === 2 && x > 0 && y > 0) {
          density = { x: x * MM_PER_INCH / 10, y: y * MM_PER_INCH / 10, source: "jfif" };
        }
      }
      if (marker === 218)
        break;
      p = payload + len - 2;
    }
    throw new RangeError("no start-of-frame segment found");
  };
  var measureGif = (b) => ({
    format: "gif",
    width: le16(b, 6),
    height: le16(b, 8),
    density: null
    // GIF has no density field at all.
  });
  var measureWebp = (b) => {
    const fourcc = String.fromCharCode(at(b, 12), at(b, 13), at(b, 14), at(b, 15));
    const data = 20;
    if (fourcc === "VP8X") {
      return {
        format: "webp",
        width: le24(b, data + 4) + 1,
        height: le24(b, data + 7) + 1,
        density: null
      };
    }
    if (fourcc === "VP8 ") {
      return {
        format: "webp",
        width: le16(b, data + 6) & 16383,
        height: le16(b, data + 8) & 16383,
        density: null
      };
    }
    if (fourcc === "VP8L") {
      if (at(b, data) !== 47)
        throw new RangeError("VP8L signature byte missing");
      const bits = at(b, data + 1) | at(b, data + 2) << 8 | at(b, data + 3) << 16 | at(b, data + 4) << 24;
      return {
        format: "webp",
        width: (bits & 16383) + 1,
        height: (bits >>> 14 & 16383) + 1,
        density: null
      };
    }
    throw new RangeError(`unrecognised WebP chunk "${fourcc}"`);
  };
  var measureImage = (bytes) => {
    const format = sniffFormat(bytes);
    if (format === null)
      return null;
    try {
      const m = format === "png" ? measurePng(bytes) : format === "jpeg" ? measureJpeg(bytes) : format === "gif" ? measureGif(bytes) : measureWebp(bytes);
      if (!Number.isFinite(m.width) || !Number.isFinite(m.height) || m.width < 1 || m.height < 1) {
        return null;
      }
      if (m.density === null) {
        const exif = parseExif(bytes);
        const res = exif ? exifResolution(exif) : null;
        if (res)
          m.density = { x: res.x, y: res.y, source: "exif" };
      }
      return m;
    } catch {
      return null;
    }
  };

  // node_modules/@nasdigitaluk/withnate-tool-core/dist/intake.js
  var DEFAULT_DRAGGING_CLASS = "is-dragging";
  var humanBytes = (n) => n >= 1024 * 1024 ? `${Math.round(n / (1024 * 1024))}MB` : `${Math.round(n / 1024)}KB`;
  var attachIntake = (root, opts) => {
    const draggingClass = opts.draggingClass ?? DEFAULT_DRAGGING_CLASS;
    const input = root.querySelector('input[type="file"]');
    const accept = (file) => {
      if (!file)
        return;
      if (opts.maxBytes && file.size > opts.maxBytes) {
        opts.onReject?.(`That file is ${humanBytes(file.size)}. The limit here is ${humanBytes(opts.maxBytes)}.`);
        return;
      }
      if (file.size === 0) {
        opts.onReject?.("That file is empty.");
        return;
      }
      opts.onFile(file);
    };
    const onDragEnter = (e) => {
      e.preventDefault();
      root.classList.add(draggingClass);
    };
    const onDragOver = (e) => {
      e.preventDefault();
      if (e.dataTransfer)
        e.dataTransfer.dropEffect = "copy";
    };
    const onDragLeave = (e) => {
      if (e.relatedTarget instanceof Node && root.contains(e.relatedTarget))
        return;
      root.classList.remove(draggingClass);
    };
    const onDrop = (e) => {
      e.preventDefault();
      root.classList.remove(draggingClass);
      accept(e.dataTransfer?.files?.[0]);
    };
    const onChange = () => {
      accept(input?.files?.[0]);
      if (input)
        input.value = "";
    };
    const onPaste = (e) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.kind === "file");
      const file = item?.getAsFile();
      if (file) {
        e.preventDefault();
        accept(file);
      }
    };
    root.addEventListener("dragenter", onDragEnter);
    root.addEventListener("dragover", onDragOver);
    root.addEventListener("dragleave", onDragLeave);
    root.addEventListener("drop", onDrop);
    input?.addEventListener("change", onChange);
    document.addEventListener("paste", onPaste);
    return () => {
      root.removeEventListener("dragenter", onDragEnter);
      root.removeEventListener("dragover", onDragOver);
      root.removeEventListener("dragleave", onDragLeave);
      root.removeEventListener("drop", onDrop);
      input?.removeEventListener("change", onChange);
      document.removeEventListener("paste", onPaste);
      root.classList.remove(draggingClass);
    };
  };

  // node_modules/@nasdigitaluk/withnate-tool-core/dist/mount.js
  var getWn = () => {
    const w = globalThis;
    return w.WN ?? null;
  };
  var mount = (selector, init) => {
    const run = () => {
      const root = document.querySelector(selector);
      if (!root)
        return;
      const wn = getWn();
      const reduced = wn?.reduced ?? (typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)").matches : true);
      init({ root, wn, reduced });
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run, { once: true });
    } else {
      run();
    }
  };

  // src/report.ts
  var MAKE = 271;
  var MODEL = 272;
  var ORIENTATION = 274;
  var SOFTWARE = 305;
  var DATE_TIME = 306;
  var ARTIST = 315;
  var COPYRIGHT = 33432;
  var EXPOSURE_TIME = 33434;
  var F_NUMBER = 33437;
  var ISO = 34855;
  var DATE_TIME_ORIGINAL = 36867;
  var DATE_TIME_DIGITIZED = 36868;
  var FOCAL_LENGTH = 37386;
  var LENS_MODEL = 42036;
  var BODY_SERIAL = 42033;
  var PIXEL_X = 40962;
  var PIXEL_Y = 40963;
  var THUMBNAIL_OFFSET = 513;
  var ORIENTATIONS = {
    1: "Upright",
    2: "Mirrored",
    3: "Rotated 180\xB0",
    4: "Mirrored and rotated 180\xB0",
    5: "Mirrored and rotated 90\xB0 anticlockwise",
    6: "Rotated 90\xB0 clockwise",
    7: "Mirrored and rotated 90\xB0 clockwise",
    8: "Rotated 90\xB0 anticlockwise"
  };
  var formatExposure = (seconds) => seconds >= 1 ? `${Math.round(seconds * 10) / 10} s` : `1/${Math.round(1 / seconds)} s`;
  var formatDateTime = (raw) => {
    const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw);
    if (!m) return raw;
    return `${m[3]}/${m[2]}/${m[1]} at ${m[4]}:${m[5]}:${m[6]}`;
  };
  var dms = (value, positive, negative) => {
    const hemisphere = value >= 0 ? positive : negative;
    const abs = Math.abs(value);
    const d = Math.floor(abs);
    const m = Math.floor((abs - d) * 60);
    const s = ((abs - d) * 60 - m) * 60;
    return `${d}\xB0 ${m}' ${s.toFixed(1)}" ${hemisphere}`;
  };
  var push = (into, label, value, sensitive = false) => {
    if (value !== null && value.length > 0) into.push({ label, value, ...sensitive && { sensitive } });
  };
  var buildReport = (data) => {
    if (!data) return { location: null, hasThumbnail: false, groups: [], tagCount: 0 };
    const gps = exifGps(data);
    const location = gps ? {
      ...gps,
      text: `${dms(gps.latitude, "N", "S")}, ${dms(gps.longitude, "E", "W")}`
    } : null;
    const camera = [];
    push(camera, "Camera make", exifString(data, "image", MAKE));
    push(camera, "Camera model", exifString(data, "image", MODEL));
    push(camera, "Lens", exifString(data, "exif", LENS_MODEL));
    push(camera, "Body serial number", exifString(data, "exif", BODY_SERIAL), true);
    push(camera, "Software", exifString(data, "image", SOFTWARE));
    const when = [];
    for (const [label, ifd, tag] of [
      ["Taken", "exif", DATE_TIME_ORIGINAL],
      ["Digitised", "exif", DATE_TIME_DIGITIZED],
      ["File modified", "image", DATE_TIME]
    ]) {
      const raw = exifString(data, ifd, tag);
      if (raw) push(when, label, formatDateTime(raw), true);
    }
    const settings = [];
    const exposure = exifNumber(data, "exif", EXPOSURE_TIME);
    if (exposure !== null && exposure > 0) push(settings, "Shutter", formatExposure(exposure));
    const aperture = exifNumber(data, "exif", F_NUMBER);
    if (aperture !== null) push(settings, "Aperture", `f/${Math.round(aperture * 10) / 10}`);
    const iso = exifNumber(data, "exif", ISO);
    if (iso !== null) push(settings, "ISO", String(Math.round(iso)));
    const focal = exifNumber(data, "exif", FOCAL_LENGTH);
    if (focal !== null) push(settings, "Focal length", `${Math.round(focal)} mm`);
    const picture = [];
    const orientation = exifNumber(data, "image", ORIENTATION);
    if (orientation !== null) push(picture, "Orientation", ORIENTATIONS[orientation] ?? String(orientation));
    const px = exifNumber(data, "exif", PIXEL_X);
    const py = exifNumber(data, "exif", PIXEL_Y);
    if (px !== null && py !== null) push(picture, "Recorded size", `${px} \xD7 ${py}`);
    const authorship = [];
    push(authorship, "Artist", exifString(data, "image", ARTIST), true);
    push(authorship, "Copyright", exifString(data, "image", COPYRIGHT));
    const groups = [
      { title: "Camera and device", findings: camera },
      { title: "When it was taken", findings: when },
      { title: "Authorship", findings: authorship },
      { title: "Exposure", findings: settings },
      { title: "The picture", findings: picture }
    ].filter((g) => g.findings.length > 0);
    return {
      location,
      hasThumbnail: data.byKey.has(`thumbnail:${THUMBNAIL_OFFSET}`),
      groups,
      tagCount: data.entries.length
    };
  };
  var reportToText = (report, entries) => {
    const lines = [];
    if (report.location) {
      lines.push(`Location: ${report.location.text}`);
      lines.push(`Coordinates: ${report.location.latitude}, ${report.location.longitude}`);
      lines.push("");
    }
    for (const g of report.groups) {
      lines.push(g.title);
      for (const f of g.findings) lines.push(`  ${f.label}: ${f.value}`);
      lines.push("");
    }
    lines.push(`Raw tags (${entries.length})`);
    for (const e of entries) {
      lines.push(`  ${e.ifd}:0x${e.tag.toString(16).padStart(4, "0")} = ${describeValue(e)}`);
    }
    return lines.join("\n");
  };
  var describeValue = (e) => {
    const v = e.value;
    if (typeof v === "string") return v;
    if (typeof v === "number") return String(v);
    if (Array.isArray(v)) {
      if (v.length > 12) return `[${v.length} values]`;
      return v.map((x) => typeof x === "number" ? String(x) : `${x.numerator}/${x.denominator}`).join(", ");
    }
    return `${v.numerator}/${v.denominator}`;
  };

  // src/strip.ts
  var ascii2 = (b, at2, s) => {
    for (let i = 0; i < s.length; i += 1) if (b[at2 + i] !== s.charCodeAt(i)) return false;
    return true;
  };
  var JPEG_STRIP = {
    225: "Exif and XMP (camera, timestamps, GPS)",
    237: "Photoshop / IPTC block (author, caption)",
    254: "Embedded comment"
  };
  var assemble = (bytes, keep) => {
    let total = 0;
    for (const [s, e] of keep) total += e - s;
    const out = new Uint8Array(total);
    let at2 = 0;
    for (const [s, e] of keep) {
      out.set(bytes.subarray(s, e), at2);
      at2 += e - s;
    }
    return out;
  };
  var stripJpeg = (bytes) => {
    const keep = [[0, 2]];
    const removed = [];
    let p = 2;
    while (p + 4 <= bytes.length) {
      if (bytes[p] !== 255) {
        p += 1;
        continue;
      }
      const marker = bytes[p + 1];
      if (marker === 216 || marker >= 208 && marker <= 217 || marker === 1) {
        keep.push([p, p + 2]);
        p += 2;
        continue;
      }
      const len = bytes[p + 2] << 8 | bytes[p + 3];
      if (len < 2) break;
      const end = p + 2 + len;
      if (marker === 218) {
        keep.push([p, bytes.length]);
        p = bytes.length;
        break;
      }
      const label = JPEG_STRIP[marker];
      if (label !== void 0) {
        if (!removed.includes(label)) removed.push(label);
      } else {
        keep.push([p, Math.min(end, bytes.length)]);
      }
      p = end;
    }
    const out = assemble(bytes, keep);
    return { bytes: out, removed, bytesSaved: bytes.length - out.length };
  };
  var PNG_STRIP = {
    tEXt: "Text comments",
    zTXt: "Compressed text comments",
    iTXt: "International text comments (often XMP)",
    eXIf: "Exif (camera, timestamps, GPS)",
    tIME: "Last-modified timestamp"
  };
  var be323 = (b, i) => (b[i] << 24 | b[i + 1] << 16 | b[i + 2] << 8 | b[i + 3]) >>> 0;
  var stripPng = (bytes) => {
    const keep = [[0, 8]];
    const removed = [];
    let p = 8;
    while (p + 8 <= bytes.length) {
      const len = be323(bytes, p);
      const total = 12 + len;
      let name = "";
      for (let i = 0; i < 4; i += 1) name += String.fromCharCode(bytes[p + 4 + i]);
      const label = PNG_STRIP[name];
      if (label !== void 0) {
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
  var stripSupportFor = (bytes) => {
    if (bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "lossless";
    if (bytes.length > 8 && ascii2(bytes, 0, "\x89PNG")) return "lossless";
    return "unsupported";
  };
  var stripMetadata = (bytes) => {
    if (bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
      return stripJpeg(bytes);
    }
    if (bytes.length > 8 && ascii2(bytes, 0, "\x89PNG")) return stripPng(bytes);
    return null;
  };

  // src/index.ts
  var h = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === false) continue;
      if (k === "class") n.className = String(v);
      else if (v === true) n.setAttribute(k, "");
      else n.setAttribute(k, String(v));
    }
    for (const c of kids) if (c !== null) n.append(typeof c === "string" ? document.createTextNode(c) : c);
    return n;
  };
  var headline = (report, hasAny) => {
    if (report.location) {
      return h(
        "div",
        { class: "mv-alert mv-alert-strong glass" },
        h("p", { class: "eyebrow" }, "Found in this photo"),
        h("h2", {}, "This photo says where it was taken."),
        h("p", { class: "mv-coords" }, report.location.text),
        h("p", { class: "mv-coords mv-decimal" }, `${report.location.latitude.toFixed(6)}, ${report.location.longitude.toFixed(6)}`),
        h(
          "p",
          { class: "mv-note" },
          "That is accurate to within a few metres. If this was taken at home, sharing it shares your address \u2014 which is the single thing in here most worth removing before you post."
        )
      );
    }
    return h(
      "div",
      { class: "mv-alert glass" },
      h("p", { class: "eyebrow" }, "Found in this photo"),
      h("h2", {}, hasAny ? "No location, but it is not empty." : "Nothing hidden in this one."),
      h(
        "p",
        { class: "mv-note" },
        hasAny ? "No GPS coordinates. There is still camera and timing information below, which identifies the device rather than the place." : "No camera, timestamps or location. Either it was stripped already, or it was made by software that writes none."
      )
    );
  };
  var findingsBlock = (report) => h(
    "div",
    { class: "mv-groups" },
    ...report.groups.map(
      (g) => h(
        "section",
        { class: "mv-group" },
        h("h3", { class: "mv-group-h" }, g.title),
        ...g.findings.map(
          (f) => h(
            "div",
            { class: `mv-row${f.sensitive ? " mv-sensitive" : ""}` },
            h("span", { class: "mv-k" }, f.label),
            h("span", { class: "mv-v" }, f.value)
          )
        )
      )
    )
  );
  var rawTable = (data) => {
    const rows = data.entries.map(
      (e) => h(
        "tr",
        {},
        h("td", {}, e.ifd),
        h("td", {}, `0x${e.tag.toString(16).padStart(4, "0")}`),
        h("td", {}, describeValue(e))
      )
    );
    const details = h("details", { class: "mv-raw" });
    details.append(
      h("summary", {}, `Every tag (${data.entries.length})`),
      h(
        "div",
        { class: "mv-raw-wrap" },
        h(
          "table",
          { class: "mv-table" },
          h("thead", {}, h("tr", {}, h("th", {}, "Where"), h("th", {}, "Tag"), h("th", {}, "Value"))),
          h("tbody", {}, ...rows)
        )
      )
    );
    return details;
  };
  mount("[data-mv]", ({ root }) => {
    const intake = root.querySelector("[data-mv-intake]");
    const results = root.querySelector("[data-mv-results]");
    const errorOut = root.querySelector("[data-mv-error]");
    const actions = root.querySelector("[data-mv-actions]");
    const copyBtn = root.querySelector("[data-mv-copy]");
    const stripLink = root.querySelector("[data-mv-strip]");
    const stripNote = root.querySelector("[data-mv-strip-note]");
    if (!intake || !results) return;
    let objectUrl = null;
    let currentText = "";
    const showError = (m) => {
      if (errorOut) errorOut.textContent = m;
      results.replaceChildren();
      if (actions) actions.hidden = true;
    };
    attachIntake(intake, {
      onReject: showError,
      onFile: (file) => {
        if (errorOut) errorOut.textContent = "";
        void (async () => {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const measured = measureImage(bytes);
          if (!measured) {
            showError("That file could not be read as a PNG, JPEG, GIF or WebP.");
            return;
          }
          const data = parseExif(bytes);
          const report = buildReport(data);
          currentText = data ? reportToText(report, data.entries) : "No metadata found.";
          const blocks = [headline(report, report.tagCount > 0)];
          if (report.hasThumbnail) {
            blocks.push(
              h(
                "div",
                { class: "mv-alert glass" },
                h("h3", { class: "mv-group-h" }, "There is an embedded preview"),
                h(
                  "p",
                  { class: "mv-note" },
                  "Cameras save a small copy inside the file. It is generated when the photo is taken, so if the picture was cropped afterwards the preview can still show the original, wider frame. Stripping removes it."
                )
              )
            );
          }
          if (report.groups.length > 0) blocks.push(findingsBlock(report));
          if (data) blocks.push(rawTable(data));
          results.replaceChildren(...blocks);
          if (actions) actions.hidden = false;
          if (copyBtn) copyBtn.hidden = report.tagCount === 0;
          if (stripLink && stripNote) {
            const support = stripSupportFor(bytes);
            const stripped = support === "lossless" ? stripMetadata(bytes) : null;
            if (stripped && stripped.removed.length > 0) {
              if (objectUrl) URL.revokeObjectURL(objectUrl);
              objectUrl = URL.createObjectURL(
                new Blob([stripped.bytes], {
                  type: measured.format === "png" ? "image/png" : "image/jpeg"
                })
              );
              stripLink.href = objectUrl;
              stripLink.download = file.name.replace(/(\.[^.]+)?$/, "-clean$1");
              stripLink.hidden = false;
              stripNote.textContent = `Removes ${stripped.removed.join(", ").toLowerCase()}. The picture itself is copied across untouched \u2014 this is not a re-encode, so nothing is lost.`;
            } else {
              stripLink.hidden = true;
              stripNote.textContent = support === "unsupported" ? "Stripping is only offered for JPEG and PNG. Other formats would have to be re-compressed, and handing you a visibly worse picture would be the wrong trade." : "There is nothing to remove from this one.";
            }
          }
        })().catch(() => showError("That file could not be opened. It may be damaged."));
      }
    });
    copyBtn?.addEventListener("click", () => {
      void navigator.clipboard?.writeText(currentText).then(
        () => {
          copyBtn.textContent = "Copied";
          setTimeout(() => {
            copyBtn.textContent = "Copy everything";
          }, 1600);
        },
        () => {
          if (errorOut) errorOut.textContent = "The browser would not give access to the clipboard.";
        }
      );
    });
  });
})();
