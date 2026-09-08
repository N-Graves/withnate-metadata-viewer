# withnate-metadata-viewer

See everything hidden inside a photo — camera, timestamps, settings, and where it was taken — and
strip it out before you share it.

**Runs entirely in the browser. The photo never leaves your device**, which matters more here than
anywhere else: uploading a file to find out whether it discloses your home address would rather
defeat the point.

MIT licensed.

## The finding, not the dump

Most Exif viewers print ninety rows and leave you to spot the important one. **The important one is
almost always the same, and almost nobody knows it is there:** a photograph taken at home carries the
address to within a few metres.

So this leads with what was found and what it means, and puts the full table underneath for anyone
who wants it. Copy as text, or download a clean copy.

It also flags the **embedded preview** when there is one. Cameras save a small copy inside the file,
generated when the photo is taken — so if the picture was cropped afterwards, the preview can still
show the original, wider frame. That is a genuine leak in its own right and it is invisible in every
viewer that only lists tags.

## Stripping is lossless, and that took finding

⚠️ **This corrects what an earlier draft of this file claimed.** The obvious way to strip a JPEG in a
browser is to draw it to a canvas and export it again — and that throws away the original compression
and replaces it with a second generation of loss. The "clean copy" comes back visibly worse than the
file it came from, for no reason connected to privacy.

That is not necessary. Both JPEG and PNG keep metadata in **discrete blocks alongside** the
compressed image data, so the metadata can be cut out and the image data copied across untouched.

**Proved on a real browser-encoded JPEG, not asserted:** a 4,546-byte file with a 158-byte Exif block
spliced in came back at exactly 4,546 bytes after stripping, still decoding at 320 × 240, with the
decoded pixels **bit-for-bit identical** to the original.

### What is kept, which is the half that is easy to get wrong

- **The ICC colour profile** (JPEG `APP2`, PNG `iCCP`). Strip that and the picture genuinely changes
  colour on a wide-gamut screen — a visible defect introduced by a privacy tool.
- **JFIF** (`APP0`), which carries the print density, identifies nobody, and whose removal changes
  what size the file claims to print at.
- Quantisation tables, Huffman tables and the frame header, without which it will not decode at all.

### What is removed

| | |
|---|---|
| JPEG `APP1` | Exif and XMP — camera, timestamps, serial number, GPS |
| JPEG `APP13` | Photoshop / IPTC — author, caption |
| JPEG `COM` | Embedded comment |
| PNG `tEXt` `zTXt` `iTXt` | Text comments, often XMP |
| PNG `eXIf` | Exif |
| PNG `tIME` | Last-modified timestamp |

### Why GIF and WebP are refused rather than handled

Both could be pushed through a canvas and come back "clean" — re-compressed, and for GIF re-quantised
to a new palette. **Handing somebody a visibly degraded file and calling it their photo with the
metadata removed is worse than saying it is not supported.**

## Where the Exif parsing lives

**Not here.** It went into
[`@nasdigitaluk/withnate-tool-core`](https://github.com/N-Graves/withnate-tool-core) at v0.2.0,
because it closed a gap that library had documented since it was written: JPEG density came from JFIF
only, so a photo straight off a phone reported no declared density and the print & frame checker had
nothing to explain. Two consumers and a pure byte parser is exactly what belongs in the core.

This repo holds the presentation, the stripping, and the judgement about what is worth alarming
somebody over.

## Honest limits

- **No third-party map.** The coordinates are shown and made easy to select, and there is no link out
  to a mapping service, because the site refuses third-party requests of any kind — and sending the
  coordinates of somebody's house to a third party in order to show them where their house is would
  be a poor joke.
- **Nothing here can prove a file is clean.** It reports what it could parse. A format-specific block
  this does not know about, or metadata inside the image data itself, would not show up.
- **Stripping does not touch the pixels**, and pixels can carry information too — a reflection, a
  street sign, a school uniform. This removes what the file says, not what the picture shows.

## Integration

Plain IIFE, does nothing unless the page contains `data-mv`. Copy `dist/metadata-viewer.js` and
`dist/metadata-viewer.css` into the site's assets. `demo/index.html` is the working contract.

| Attribute | Required | What it is |
|---|---|---|
| `data-mv` | yes | The root. Absent, the script does nothing. |
| `data-mv-intake` | yes | Drop target, containing an `<input type="file">` which is found, not created. |
| `data-mv-results` | yes | Where the findings are written. |
| `data-mv-error` | no | Refusals. Give it `role="status"`. |
| `data-mv-actions` | no | Wrapper for the buttons. Give it `hidden`. |
| `data-mv-copy` | no | Button. Copies everything as text. |
| `data-mv-strip` | no | Anchor. Given an `href` and `download` when there is something to remove. |
| `data-mv-strip-note` | no | Says what stripping would remove, or why it is not offered. |

The stylesheet defines only `.mv-` classes, enforced by a smoke check.

## Structured data

`demo/index.html` carries a static JSON-LD `WebApplication` block. Verified against the site's own
tooling rather than assumed: `scripts/check.mjs` fails a page with a second inline `<script>` but
**explicitly exempts `type="application/ld+json"`**, and `scripts/seo.mjs` fails the build on a block
that does not parse or carries no `@type`. No rating, no review count.

## Security posture

Nothing is uploaded, stored or transmitted — which for a tool that exists to show people what their
photos are leaking is the only architecture that would be honest. Beyond that:

- **The download's MIME type comes from the sniffed bytes, never from `file.type`.** That field is
  whatever the file claimed to be, and a `blob:` URL inherits this page's origin — so letting an
  uploaded file name its own type is a route to a same-origin document rendered from bytes somebody
  else chose. Confirmed in a browser: a file declaring `text/html` still produces an `image/jpeg`
  blob.
- **Everything is `createElement` and `textContent`.** No `innerHTML` anywhere. This matters more
  here than in the other tools, because **every value on the page comes out of the file** — an Exif
  Artist or Software field is attacker-controlled text, and it is rendered as text throughout.
- The parser itself is the shared core's, which caps entry counts, component counts and block size,
  and treats every offset in an Exif block as attacker-chosen.
- **No byte cap on the intake, and that is a decision rather than an omission.** This tool genuinely
  needs the whole file — it is byte surgery on the container — and the largest print master in this
  business is 292MB. The change that makes those tractable is that the strip no longer accumulates
  bytes one at a time (see below); the working set is now about twice the file rather than several
  times it.

## The strip no longer copies byte by byte

Both strippers built their output by pushing individual bytes into a JavaScript array and converting
at the end. A JPEG's entropy-coded scan is nearly the whole file, so that cost several times the
file in memory before the result existed — on a 292MB master, ruinously.

They now collect the ranges to keep and copy them once with `Uint8Array.set`. **Proven in a browser
rather than assumed:** a real 1,414,723-byte photo strips to 1,414,516 bytes, and **1,410,898 bytes
of scan data from `SOS` to the end are byte-for-byte identical.** The surviving markers are APP2 (the
ICC profile), APP14 (Adobe's colour transform), the quantisation and Huffman tables and the frame —
so the two segments whose removal would visibly change the picture both came through, while APP1 and
APP13 went.

## Testing

```bash
npm run lint    # tsc --noEmit
npm test        # 20 tests
npm run smoke   # 20 checks against the built bundle
npm run demo    # serves demo/ on :4176
```

The strip tests assert on bytes: that the scan data after `SOS` is unchanged, that the colour profile
and the decode tables survive, and that stripping an already-clean file changes nothing at all.

## Licence

MIT.
