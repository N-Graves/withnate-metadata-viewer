import {
  exifGps,
  exifNumber,
  exifString,
  type ExifData,
  type ExifEntry,
} from "@nasdigitaluk/withnate-tool-core";

export interface Finding {
  label: string;
  value: string;

  sensitive?: boolean;
}

export interface Group {
  title: string;
  findings: Finding[];
}

export interface Location {
  latitude: number;
  longitude: number;

  text: string;
}

export interface Report {
  location: Location | null;

  hasThumbnail: boolean;
  groups: Group[];
  tagCount: number;
}

const MAKE = 0x010f;
const MODEL = 0x0110;
const ORIENTATION = 0x0112;
const SOFTWARE = 0x0131;
const DATE_TIME = 0x0132;
const ARTIST = 0x013b;
const COPYRIGHT = 0x8298;

const EXPOSURE_TIME = 0x829a;
const F_NUMBER = 0x829d;
const ISO = 0x8827;
const DATE_TIME_ORIGINAL = 0x9003;
const DATE_TIME_DIGITIZED = 0x9004;
const FOCAL_LENGTH = 0x920a;
const LENS_MODEL = 0xa434;
const BODY_SERIAL = 0xa431;
const PIXEL_X = 0xa002;
const PIXEL_Y = 0xa003;

const THUMBNAIL_OFFSET = 0x0201;

const ORIENTATIONS: Record<number, string> = {
  1: "Upright",
  2: "Mirrored",
  3: "Rotated 180°",
  4: "Mirrored and rotated 180°",
  5: "Mirrored and rotated 90° anticlockwise",
  6: "Rotated 90° clockwise",
  7: "Mirrored and rotated 90° clockwise",
  8: "Rotated 90° anticlockwise",
};

const formatExposure = (seconds: number): string =>
  seconds >= 1 ? `${Math.round(seconds * 10) / 10} s` : `1/${Math.round(1 / seconds)} s`;

const formatDateTime = (raw: string): string => {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw);
  if (!m) return raw;
  return `${m[3]}/${m[2]}/${m[1]} at ${m[4]}:${m[5]}:${m[6]}`;
};

const dms = (value: number, positive: string, negative: string): string => {
  const hemisphere = value >= 0 ? positive : negative;
  const abs = Math.abs(value);
  const d = Math.floor(abs);
  const m = Math.floor((abs - d) * 60);
  const s = ((abs - d) * 60 - m) * 60;
  return `${d}° ${m}' ${s.toFixed(1)}" ${hemisphere}`;
};

const push = (into: Finding[], label: string, value: string | null, sensitive = false): void => {
  if (value !== null && value.length > 0) into.push({ label, value, ...(sensitive && { sensitive }) });
};

export const buildReport = (data: ExifData | null): Report => {
  if (!data) return { location: null, hasThumbnail: false, groups: [], tagCount: 0 };

  const gps = exifGps(data);
  const location: Location | null = gps
    ? {
        ...gps,
        text: `${dms(gps.latitude, "N", "S")}, ${dms(gps.longitude, "E", "W")}`,
      }
    : null;

  const camera: Finding[] = [];
  push(camera, "Camera make", exifString(data, "image", MAKE));
  push(camera, "Camera model", exifString(data, "image", MODEL));
  push(camera, "Lens", exifString(data, "exif", LENS_MODEL));

  push(camera, "Body serial number", exifString(data, "exif", BODY_SERIAL), true);
  push(camera, "Software", exifString(data, "image", SOFTWARE));

  const when: Finding[] = [];
  for (const [label, ifd, tag] of [
    ["Taken", "exif", DATE_TIME_ORIGINAL],
    ["Digitised", "exif", DATE_TIME_DIGITIZED],
    ["File modified", "image", DATE_TIME],
  ] as const) {
    const raw = exifString(data, ifd, tag);

    if (raw) push(when, label, formatDateTime(raw), true);
  }

  const settings: Finding[] = [];
  const exposure = exifNumber(data, "exif", EXPOSURE_TIME);
  if (exposure !== null && exposure > 0) push(settings, "Shutter", formatExposure(exposure));
  const aperture = exifNumber(data, "exif", F_NUMBER);
  if (aperture !== null) push(settings, "Aperture", `f/${Math.round(aperture * 10) / 10}`);
  const iso = exifNumber(data, "exif", ISO);
  if (iso !== null) push(settings, "ISO", String(Math.round(iso)));
  const focal = exifNumber(data, "exif", FOCAL_LENGTH);
  if (focal !== null) push(settings, "Focal length", `${Math.round(focal)} mm`);

  const picture: Finding[] = [];
  const orientation = exifNumber(data, "image", ORIENTATION);
  if (orientation !== null) push(picture, "Orientation", ORIENTATIONS[orientation] ?? String(orientation));
  const px = exifNumber(data, "exif", PIXEL_X);
  const py = exifNumber(data, "exif", PIXEL_Y);
  if (px !== null && py !== null) push(picture, "Recorded size", `${px} × ${py}`);

  const authorship: Finding[] = [];
  push(authorship, "Artist", exifString(data, "image", ARTIST), true);
  push(authorship, "Copyright", exifString(data, "image", COPYRIGHT));

  const groups: Group[] = [
    { title: "Camera and device", findings: camera },
    { title: "When it was taken", findings: when },
    { title: "Authorship", findings: authorship },
    { title: "Exposure", findings: settings },
    { title: "The picture", findings: picture },
  ].filter((g) => g.findings.length > 0);

  return {
    location,
    hasThumbnail: data.byKey.has(`thumbnail:${THUMBNAIL_OFFSET}`),
    groups,
    tagCount: data.entries.length,
  };
};

export const reportToText = (report: Report, entries: ExifEntry[]): string => {
  const lines: string[] = [];
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

export const describeValue = (e: ExifEntry): string => {
  const v = e.value;
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) {
    if (v.length > 12) return `[${v.length} values]`;
    return v.map((x) => (typeof x === "number" ? String(x) : `${x.numerator}/${x.denominator}`)).join(", ");
  }
  return `${v.numerator}/${v.denominator}`;
};
