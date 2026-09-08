# withnate-metadata-viewer

See everything hidden inside a photo — camera, timestamps, settings, and where it was taken — and
strip it out before you share it.

**Runs entirely in the browser. The photo never leaves your device**, which matters more here than
anywhere else in this set: uploading a file to find out whether it discloses your home address would
rather defeat the point.

MIT licensed. Status: **not built yet** — see the roadmap below.

## The finding, not the dump

Most EXIF viewers print a table of ninety fields and leave you to spot the important one. The
important one is almost always the same: **a photo taken at home carries GPS coordinates accurate to
a few metres, and most people have no idea it is there.**

So this leads with what was found and what it means, and puts the full table underneath for anyone
who wants it. Copy as text, download as JSON, or strip the lot and save a clean copy — which is
arguably the more useful half of the tool.

## What it will read

- GPS coordinates, and a plain statement of what they reveal
- Camera make, model and serial number
- Timestamps, including the ones that survive a "clear metadata" in other software
- Lens, exposure, ISO, focus distance
- Software that touched the file, and any embedded thumbnail — which can preserve an *earlier* crop
  of the image and is a genuine leak in its own right
- Colour profile and declared print density

## Where it fits

This closes a known gap in [`withnate-tool-core`](https://github.com/N-Graves/withnate-tool-core):
the core reads JPEG density from the JFIF segment only, not from Exif `XResolution`, so a photo
straight off a phone currently reports no density at all. The Exif parsing written here gets
extracted back into the core, and the print and frame checker gains the number for free.

## Honest about stripping

Removing metadata in the browser means re-encoding, and re-encoding a JPEG is lossy — the stripped
copy is not bit-identical to the original minus the tags. For PNG the metadata chunks can be dropped
without touching the pixel data, so that one is exact. The interface will say which you are getting
rather than implying both are the same operation.

## Built on

[`@nasdigitaluk/withnate-tool-core`](https://github.com/N-Graves/withnate-tool-core).

## Licence

MIT.
