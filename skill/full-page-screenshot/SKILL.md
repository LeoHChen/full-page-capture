---
name: full-page-screenshot
description: Capture a complete webpage from the user's selected browser tab and save an image, with an optional continuous screenshot PDF. Use for requests to screenshot an entire page, save a long webpage, or export a webpage screenshot to PDF.
---

# Full-page screenshot

Capture the rendered page the user can already access, including its photos, typography, and footer. If the user requests a PDF, default to one continuous image-based PDF page without artificial breaks. Keep the source image as a companion deliverable. Do not substitute a summary or browser print layout unless requested.

## Capture

- Use the browser connection and selected-tab rules provided in the current session. Discover the current tab instead of persisting tab IDs or browser instance IDs in this skill. If required, read the tab context first. For browser control use the supplied CUA/browser runtime, not a separate automation connection.
- Read that runtime's screenshot guidance and use its documented full-page screenshot method. Prefer a single full-page capture over stitching viewport images.
- Inspect the result at the top, middle, and bottom. A successful API response does not prove the full content was captured. Look for unloaded images, sticky bars obscuring paragraphs, focus-only skip-navigation overlays, horizontal cropping, or an abruptly cut footer.
- When the visible result has these defects, return to the top, remove keyboard focus using an ordinary click in a harmless blank area, and recapture. If images are missing, scroll through the page using supported UI actions, then return to the top and capture. Bound scrolling on infinite feeds and describe the portion captured. Do not remove paywalls, consent requirements, or access barriers.
- Save the image bytes through the runtime's documented file-output mechanism or a supported filesystem facility. Check file magic: a screenshot API may return JPEG even when its default name suggests PNG. Use the matching extension.
- Preserve the user's original scroll position where the runtime supports it. Keep capture artifacts in the current session's user-facing outputs folder; use a descriptive filename derived from the page title, without URL query strings.

## PDF

Use the bundled dependency-free Node helper for JPEG captures:

```bash
node scripts/export-pdf.mjs /absolute/path/capture.jpg /absolute/path/capture.pdf
```

Resolve `scripts/` relative to this skill's folder. Node.js 18+ is required. The helper embeds the JPEG without resampling and uses one continuous page. It refuses to overwrite an existing PDF; choose a fresh filename when necessary.

For PNG captures, preserve the original PNG and convert a temporary copy to RGB JPEG with an available local image converter (for example ImageMagick with `-background white -alpha remove -alpha off -colorspace sRGB -quality 96`), then pass that copy to the helper. Do not send screenshots to external conversion services. If local conversion is unavailable, deliver the screenshot and state what prevents the PDF export.

Verify the PDF opens and has one page. When Poppler is available, use `pdfinfo` and render with `pdftoppm`; inspect the rendering for missing regions or blank output. The PDF has image-based text, not searchable text. Extremely tall images use smaller page units to remain within conventional PDF page limits while preserving embedded pixels.

## Handoff

Link the finished PDF and image in the final response using the session's supported artifact links. When the user requested a screenshot, show it inline if supported. Mention only material limitations, such as an incomplete feed or a protected page. Do not claim live capture succeeded when only a converter or mock was tested.

## Companion extension

When the user has installed Full Page Capture, they can use its toolbar button, then download PNG or PDF from its preview. Its temporary debugger attachment can conflict with other automation on that tab; finish or release the automation session before asking the user to use the extension. Extension installation is a separate browser action and is not implied by a request merely to take a screenshot.
