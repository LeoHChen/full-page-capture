# Full Page Capture — review and verification

Reviewed 2026-09-08 against Chrome 152.0.7977.77 (macOS, Apple Silicon, Liquid Retina XDR display, DPR 2) and Node 26.8.1.

## Verdict

The extension is well built: small, dependency-free, strict CSP, sender-validated messaging, debugger attached only to the chosen tab and detached on every path, sanitized filenames, a correct hand-written PDF writer, and honest documentation. Unit tests (10) pass. The preview page, PNG download, and PDF generation work end to end with real capture data.

One defect is serious enough to fix before relying on it: **any capture taller than 16,384 device pixels is silently corrupted** below that row. On a Retina Mac that is every page taller than about 8,192 CSS pixels, and the bottom of the image is replaced by a repeat of the page top. The README's promise that oversized pages "produce an error rather than being silently truncated" is not true in practice. The fix is straightforward and was verified below (tiled clips are pixel-identical and slightly faster).

## How this was verified

Chrome 137+ ignores `--load-extension` in branded builds, so the extension itself was not installed. Instead, the extension's real `capturePage()` from `extension/capture.mjs` was executed unmodified against a real headless and headful Chrome 152 through a shim that maps `chrome.debugger` / `chrome.tabs` onto raw Chrome DevTools Protocol calls. Output PNGs were analysed pixel by pixel (ImageMagick). The real `preview.html` + `preview.mjs` + `store.mjs` + `pdf.mjs` were exercised in Chrome with IndexedDB seeded from those captures and only `chrome.downloads` stubbed; PDFs were validated with `pdfinfo` and rendered with `pdftoppm`.

Test pages: a synthetic article (sticky header, `100vh` hero, 12 sections with `loading="lazy"` images served with 400 ms delay, IntersectionObserver reveal-on-scroll boxes, footer, `position:fixed` bottom bar), gradient "tall" pages of chosen heights with a 100 px red marker at the bottom, and a nested-scroller page.

## Findings

### Critical

**1. Captures taller than 16,384 device pixels are silently wrong.**
Chrome's GPU compositor readback is limited to 16,384 px per dimension. `Page.captureScreenshot` still returns a PNG of the requested size, but rows from 16,384 onward contain the top of the page again (texture wrap), not the real content. The `captureBounds` limits (60,000 tall / 16,000 wide / 60 M area, all in CSS px) do not prevent this, and the PDF faithfully reproduces the corrupted image.

| Page height (CSS px) | DPR | Device px tall | Result |
|---|---|---|---|
| 16,384 | 1 | 16,384 | correct, footer marker present |
| 16,385 | 1 | 16,385 | row 16,384 wrong |
| 16,500 – 40,000 | 1 | 16,500 – 40,000 | bottom wrong, PNG dimensions "correct" |
| 42,000 | 1 | 60.5 M px | friendly "too large" error (only case the cap catches) |
| 8,000 | 2 (headful, real display) | 16,000 | correct |
| 8,500 | 2 (headful, real display) | 17,000 | bottom wrong |
| 8,373 (article) | 2 | 16,746 | rows 16,384–16,745 show sticky header + hero instead of footer |
| 16,500 / 20,000 | 1, `--disable-gpu` | | correct → confirms GPU texture limit as the cause |

Verified fixes (same page, DPR 1, 20,000 px tall):

| Approach | Bottom marker present |
|---|---|
| current: one clip, `scale: 1` | no |
| `clip.y` tiles (10,000 + 10,000; or 16,000 + 4,000), `captureBeyondViewport: true` | yes |
| one clip with `clip.scale = 16384 / deviceHeight` (downscaled) | yes |
| `Emulation.setDeviceMetricsOverride` to full height (old Puppeteer approach) | no (same limit) |

Stitching three tiles of the DPR-2 article (8,192 + 8,192 + 362 device px) reproduced the single capture with **0 differing pixels** in the first 16,384 rows, correct footer below, no repeated fixed bar, and took 549 ms versus 778 ms for the single shot.

Recommended fix, in two steps:

- Quick (a few lines, verified): read `devicePixelRatio` via `Runtime.evaluate`, then set `clip.scale = Math.min(1, 16384 / (height * dpr), 16384 / (width * dpr))`. Complete captures immediately, at reduced resolution only for very tall pages. Show the effective scale in the preview.
- Proper: capture tiles of at most 8,192 or 16,384 device px via `clip.y`/`clip.height` (all with `captureBeyondViewport: true`). Store tiles as separate blobs. Display them stacked in the preview (one `<img>` per tile, no stitching needed). Stitch with `OffscreenCanvas`/canvas only when the user downloads PNG. For PDF, place one JPEG XObject per tile on the single tall page (`/Im0 … /ImN` at vertical offsets), which needs no stitching at all and keeps peak memory low. Replace the CSS-pixel caps with a device-pixel budget.

### Important

**2. Bottom-fixed elements render one viewport-height from the top, not at the bottom.**
With `captureBeyondViewport`, `position: fixed` boxes are laid out against the original viewport (813 px in the test). The fixed bottom bar appeared once at rows 763–812, i.e. across the hero, and never at the bottom. Cookie banners, chat bubbles, and app bars will do this on real sites. Good news from the same test: `100vh` is not stretched (hero stayed 813 px), and the sticky header appears once at the top. Suggested enhancement: an option (default on) that temporarily sets `visibility: hidden` on elements whose computed position is `fixed` and whose bounding box touches the bottom of the viewport, restoring them in `finally`.

**3. Capturing a tab that is not visible stalls or fails.**
If the user switches tabs during capture (likely during the 18 s preload), the screenshot waits for a frame the hidden tab never produces. Observed: headful Chrome succeeded after 41 s; headless at DPR 2 failed after 196 s with "Unable to capture screenshot". During that time the debugger banner and the "…" badge stay up. Fix: check `tab.active` right before `Page.captureScreenshot` and call `chrome.tabs.update(tabId, {active: true})` (no extra permission needed), or fail fast with a clear message.

**4. The `timeout` parameter on `Runtime.evaluate` does not bound `awaitPromise`.**
Measured: a 3 s promise with `timeout: 500` still took 3,003 ms and resolved normally; only synchronous execution is terminated (a busy loop was killed at ~300 ms). The preload's own 18 s + 1.5 s limits are what currently protect you, and a page that monkey-patches `setTimeout` could hang the capture with the debugger attached. Add a `Promise.race` watchdog around every `sendCommand` (generous, e.g. 60–90 s for the screenshot); detaching in `finally` cancels the pending command.

**5. Base64 decode in the service worker is ~30× slower than necessary.**
`Uint8Array.from(atob(data), c => c.charCodeAt(0))` iterates the string through the iterator protocol with a callback per byte. Measured on a 40 MB payload: current 3,133 ms; plain `for` loop with `charCodeAt` 108 ms; `Uint8Array.fromBase64` (Chrome 140+) 13 ms. Use `Uint8Array.fromBase64` when present and fall back to the loop; or raise `minimum_chrome_version`. `fetch('data:…')` is not an option because `connect-src 'none'` blocks it.

**6. Popup does not validate the page before handing off.**
For a `chrome://` page, a PDF viewer, or the Web Store, the popup reports success, closes, and the user gets a new error tab. The popup already has `tab.url` (activeTab), so run the `https?://` check there and show the message inline without closing.

**7. Default output misses lazy content unless the preload option is on.**
Without preload only 2 of 12 lazy images (those inside Chrome's lazy-load distance) rendered and 0 of 12 reveal-on-scroll boxes; with preload 12/12 and 12/12. Consider defaulting the option on, auto-enabling it when `img[loading=lazy]` exists, and adding a cheap always-on step that sets `img.loading = 'eager'` and awaits `decode()` with a bound, which handles native lazy images without scrolling.

**8. Record the device pixel ratio.**
Captures are in device pixels (2,880 wide for a 1,440 CSS px page on Retina). The preview shows only device pixels, and the PDF page ends up at 2× the CSS size in points (2,160 pt wide for a 1,440 px page). Store `dpr` with the shot, show "1,440 × 8,373 CSS px @2×", and use `0.75 / dpr` for the PDF unit scale.

### Nice to have

**9. Storage and privacy.** Captured pixels stay in IndexedDB for at least 24 h and are only swept on the next successful capture; the preview never deletes anything. Add a "Delete this capture" button, sweep on preview load and `chrome.runtime.onStartup`, and consider deleting a capture once downloaded.

**10. Duplicate `pdf.mjs`.** `extension/pdf.mjs` and `skill/full-page-screenshot/scripts/pdf.mjs` are identical today and will drift. Add a test asserting byte equality, or generate one from the other.

**11. `.DS_Store` files** are inside `extension/` and `skill/`; remove them and add a `.gitignore` before packaging or zipping.

**12. Filenames.** Include the date and host (`example.com — Title — 2026-09-08 10-48.png`) to avoid collisions; make `saveAs` a setting for users who want one-click downloads.

**13. PDF metadata.** Add an `/Info` dictionary with `/Title` (UTF-16BE with BOM for non-Latin titles), and a binary comment line (`%âãÏÓ`) after the header as the spec recommends. The Blob for the PDF can be built from parts (`new Blob([head, jpegBlob, tail])`) to avoid copying the JPEG bytes twice.

**14. Invocation.** Add a `commands` entry (`_execute_action`) for a keyboard shortcut and optionally a context-menu item (`contextMenus` carries no permission warning); both still grant `activeTab`.

**15. Documentation.** Correct the README: the real limit is 16,384 device pixels per dimension (≈8,192 CSS px tall on Retina) until tiling lands; mention the fixed-element placement; note the color-profile behaviour below. Update VERIFICATION.md with these results.

**16. Style.** `preview.mjs` packs several statements per line; running Prettier would make future maintenance and diffs easier. A minimal `package.json` with `"type": "module"` and a `test` script would help too.

### Confirmed working (no action)

- Scroll position restored (1,234 → 0 → 1,234) on success and failure paths; debugger detached in every scenario; restricted URLs rejected before attach; navigation mid-capture detected.
- `100vh` not stretched; sticky header rendered once; nested scroll containers capture viewport only (documented).
- Preview: status text, dimensions, PNG download byte-identical to the capture, PDF valid single page (`pdfinfo`), "resolution reduced" note appears when the image exceeds 40 M px, `safeFilename` produced `Harness Article — “Quotes” & 台湾- test-page-.pdf`.
- Colour: on this P3 display, headful captures carry an embedded ICC profile (`iCCP` chunk) so viewers show correct colours, and the canvas step in the PDF path converts back to sRGB (rendered PDF: 253,0,0 for pure red). Tools that ignore ICC profiles will show slightly duller colours in the PNG; `--force-color-profile=srgb` is the only way to change that and is out of the extension's control.
- Security: no remote code, `connect-src 'none'`, message sender checked against the popup URL, page-controlled values (title, scroll position) are validated or rendered as text only.

## Suggested order of work

1. Quick `clip.scale` fix + DPR recording + README correction (small, verified).
2. Watchdog around CDP commands + activate-tab check.
3. `Uint8Array.fromBase64` with loop fallback.
4. Popup-side URL validation; preload default/eager-image step.
5. Tiled capture with per-tile PDF images (removes the height limit properly).
6. Fixed-element hiding option; storage cleanup; the hygiene items.

## Remaining step only you can do

Load the `extension` folder unpacked in your Chrome, open a long article (taller than ~8,000 px), capture with and without preload, and confirm the debugging banner disappears and the bottom of the article is present. Until item 1 ships, expect the bottom of very long pages to be wrong on this Mac.
