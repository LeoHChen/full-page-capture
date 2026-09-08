# Verification

Checked on September 8, 2026.

## Completed for v0.1

- Node tests cover binary PDF offsets and embedded image bytes; one-page dimensions; DPR-aware PDF sizing; Unicode metadata; PDF size limits; invalid images and oversized bounds; the 16,384-device-pixel capture scale; dated host filenames; fast base64 decoding; source-tab activation; scroll restoration and detach on success; cleanup after screenshot failure; no detach after failed attachment; rejection of restricted schemes; navigation interruption; preload failure cleanup; and byte equality between the extension and skill PDF writers.
- Manifest `0.1.0` parses, all referenced extension files exist, JavaScript syntax checks pass, and the release ZIP contains `manifest.json` at its root with no `.DS_Store` files.
- The critical tall-page corruption path is prevented by setting `clip.scale` from the captured page dimensions and actual device pixel ratio. No output dimension can exceed Chrome's 16,384-device-pixel compositor boundary.
- Capture commands have extension-context watchdogs, the selected tab is reactivated immediately before the screenshot when needed, and cleanup still restores page state and detaches the debugger.
- Native lazy images are eagerly requested, optional scrolling is enabled by default, and bottom-fixed overlays can be temporarily hidden and restored.
- The preview reports CSS dimensions, DPR, output pixels, and scaling; PDF physical dimensions account for DPR; PDF metadata includes the page title; stale captures are swept on startup and preview; and the current capture can be deleted immediately.
- The skill passed the bundled skill-creator validator, both in the package and at its installed location.
- The skill converter exported the previous 1,081 × 7,732 pixel WSJ capture. Poppler opened it, reported one PDF page, and rendered it successfully for visual review.
- The extension popup and preview were opened and visually reviewed in the user's Chrome instance through a localhost test harness.
- The preview loaded the full-size PNG fixture from IndexedDB. Its PNG action produced an image/png payload, and its PDF action produced an application/pdf payload with a valid PDF header. Actual-size/fit preview controls were checked.
- Extension JavaScript syntax, manifest JSON, referenced files, and ZIP integrity were checked.

## Earlier end-to-end checks

The original review exercised the extension's capture, preview, PNG, and PDF code against Chrome 152 through a DevTools Protocol shim and analysed output pixels with ImageMagick. That review demonstrated the 16,384-device-pixel compositor defect and independently verified the scaling approach used in v0.1. The Chrome UI harness substitutes the downloads API, and automated orchestration tests substitute Chrome's debugger API. These checks do not establish that this packaged release has been installed successfully in the user's Chrome profile.

## First installed-extension check

1. Unzip the release and load its folder unpacked, then open a normal long article with DevTools closed and other browser automation stopped.
2. Scroll partway down, invoke Full Page Capture, and confirm the capture preview opens with the article beginning and footer present. Check that the source tab returns to the original scroll position.
3. Download PNG and PDF. Confirm the chosen files open, the PDF has one continuous page, and neither output is missing the bottom of the article.
4. Try the image-preloading option on a page with lazy-loaded photographs. Confirm the debugging banner disappears afterward.
5. If capture is blocked by Chrome, policy, or another attached debugger, confirm an explanation appears and the source page remains usable.

The extension has not been installed automatically or published to the Chrome Web Store.
