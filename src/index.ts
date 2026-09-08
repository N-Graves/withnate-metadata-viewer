/**
 * Metadata viewer - entry point.
 *
 * Leads with the finding rather than the table. The important tag is almost
 * always the same one and almost nobody knows it is there.
 *
 * Nothing is uploaded and nothing is stored, which matters more here than
 * anywhere else in this set: uploading a file to find out whether it discloses
 * your home address would rather defeat the point.
 */

import {
  attachIntake,
  measureImage,
  mount,
  parseExif,
  readHeaderBytes,
  type ExifData,
} from "@nasdigitaluk/withnate-tool-core";
import { buildReport, describeValue, reportToText, type Report } from "./report.js";
import { stripMetadata, stripSupportFor } from "./strip.js";

type Attrs = Record<string, string | boolean | number>;

const h = (tag: string, attrs: Attrs = {}, ...kids: Array<Node | string | null>): HTMLElement => {
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

const headline = (report: Report, hasAny: boolean): HTMLElement => {
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
        "That is accurate to within a few metres. If this was taken at home, sharing it shares your address — which is the single thing in here most worth removing before you post.",
      ),
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
      hasAny
        ? "No GPS coordinates. There is still camera and timing information below, which identifies the device rather than the place."
        : "No camera, timestamps or location. Either it was stripped already, or it was made by software that writes none.",
    ),
  );
};

const findingsBlock = (report: Report): HTMLElement =>
  h(
    "div",
    { class: "mv-groups" },
    ...report.groups.map((g) =>
      h(
        "section",
        { class: "mv-group" },
        h("h3", { class: "mv-group-h" }, g.title),
        ...g.findings.map((f) =>
          h(
            "div",
            { class: `mv-row${f.sensitive ? " mv-sensitive" : ""}` },
            h("span", { class: "mv-k" }, f.label),
            h("span", { class: "mv-v" }, f.value),
          ),
        ),
      ),
    ),
  );

const rawTable = (data: ExifData): HTMLElement => {
  const rows = data.entries.map((e) =>
    h(
      "tr",
      {},
      h("td", {}, e.ifd),
      h("td", {}, `0x${e.tag.toString(16).padStart(4, "0")}`),
      h("td", {}, describeValue(e)),
    ),
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
        h("tbody", {}, ...rows),
      ),
    ),
  );
  return details;
};

mount("[data-mv]", ({ root }) => {
  const intake = root.querySelector<HTMLElement>("[data-mv-intake]");
  const results = root.querySelector<HTMLElement>("[data-mv-results]");
  const errorOut = root.querySelector<HTMLElement>("[data-mv-error]");
  const actions = root.querySelector<HTMLElement>("[data-mv-actions]");
  const copyBtn = root.querySelector<HTMLButtonElement>("[data-mv-copy]");
  const stripLink = root.querySelector<HTMLAnchorElement>("[data-mv-strip]");
  const stripNote = root.querySelector<HTMLElement>("[data-mv-strip-note]");
  if (!intake || !results) return;

  let objectUrl: string | null = null;
  let currentText = "";

  const showError = (m: string): void => {
    if (errorOut) errorOut.textContent = m;
    results.replaceChildren();
    if (actions) actions.hidden = true;
  };

  attachIntake(intake, {
    onReject: showError,
    onFile: (file) => {
      if (errorOut) errorOut.textContent = "";
      void (async () => {
        // The whole file, not just the header: stripping needs every byte, and
        // metadata can sit anywhere before the image data.
        const bytes = new Uint8Array(await file.arrayBuffer());
        const measured = measureImage(bytes);
        if (!measured) {
          showError("That file could not be read as a PNG, JPEG, GIF or WebP.");
          return;
        }

        const data = parseExif(bytes);
        const report = buildReport(data);
        currentText = data ? reportToText(report, data.entries) : "No metadata found.";

        const blocks: Node[] = [headline(report, report.tagCount > 0)];
        if (report.hasThumbnail) {
          blocks.push(
            h(
              "div",
              { class: "mv-alert glass" },
              h("h3", { class: "mv-group-h" }, "There is an embedded preview"),
              h(
                "p",
                { class: "mv-note" },
                "Cameras save a small copy inside the file. It is generated when the photo is taken, so if the picture was cropped afterwards the preview can still show the original, wider frame. Stripping removes it.",
              ),
            ),
          );
        }
        if (report.groups.length > 0) blocks.push(findingsBlock(report));
        if (data) blocks.push(rawTable(data));
        results.replaceChildren(...blocks);

        if (actions) actions.hidden = false;
        if (copyBtn) copyBtn.hidden = report.tagCount === 0;

        // Stripping
        if (stripLink && stripNote) {
          const support = stripSupportFor(bytes);
          const stripped = support === "lossless" ? stripMetadata(bytes) : null;
          if (stripped && stripped.removed.length > 0) {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            objectUrl = URL.createObjectURL(new Blob([stripped.bytes.slice()], { type: file.type }));
            stripLink.href = objectUrl;
            stripLink.download = file.name.replace(/(\.[^.]+)?$/, "-clean$1");
            stripLink.hidden = false;
            stripNote.textContent = `Removes ${stripped.removed.join(", ").toLowerCase()}. The picture itself is copied across untouched — this is not a re-encode, so nothing is lost.`;
          } else {
            stripLink.hidden = true;
            stripNote.textContent =
              support === "unsupported"
                ? "Stripping is only offered for JPEG and PNG. Other formats would have to be re-compressed, and handing you a visibly worse picture would be the wrong trade."
                : "There is nothing to remove from this one.";
          }
        }
      })().catch(() => showError("That file could not be opened. It may be damaged."));
    },
  });

  copyBtn?.addEventListener("click", () => {
    void navigator.clipboard?.writeText(currentText).then(
      () => {
        copyBtn.textContent = "Copied";
        // Restored rather than left, so the button does not permanently read
        // as though a copy is still in progress.
        setTimeout(() => {
          copyBtn.textContent = "Copy everything";
        }, 1600);
      },
      () => {
        if (errorOut) errorOut.textContent = "The browser would not give access to the clipboard.";
      },
    );
  });
});
