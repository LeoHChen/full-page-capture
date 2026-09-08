# Verification

Checked on September 8, 2026.

## Completed

- 10 Node tests passed: binary PDF offsets and embedded image bytes; one-page dimensions; PDF size limits; invalid images and oversized pages; Unicode and filesystem-safe filenames; target tab and full capture bounds; scroll restoration and detach on success; cleanup after screenshot failure; no detach after failed attachment; rejection of restricted schemes; navigation interruption; preload failure cleanup. Several tests cover more than one assertion.
- The skill passed the bundled skill-creator validator, both in the package and at its installed location.
- The skill converter exported the previous 1,081 × 7,732 pixel WSJ capture. Poppler opened it, reported one PDF page, and rendered it successfully for visual review.
- The extension popup and preview were opened and visually reviewed in the user's Chrome instance through a localhost test harness.
- The preview loaded the full-size PNG fixture from IndexedDB. Its PNG action produced an image/png payload, and its PDF action produced an application/pdf payload with a valid PDF header. Actual-size/fit preview controls were checked.
- Extension JavaScript syntax, manifest JSON, referenced files, and ZIP integrity were checked.

## Scope of these checks

The Chrome UI harness substitutes the downloads API; it validates image/PDF generation without installing the extension or placing test downloads in the user's Downloads folder. Capture orchestration tests substitute Chrome's debugger API. These checks do not establish that an installed extension has successfully attached to a live webpage.

## First installed-extension check

1. Load the `extension` folder unpacked, then open a normal long article with DevTools closed and other browser automation stopped.
2. Scroll partway down, invoke Full Page Capture, and confirm the capture preview opens with the article beginning and footer present. Check that the source tab returns to the original scroll position.
3. Download PNG and PDF. Confirm the chosen files open, the PDF has one continuous page, and neither output is missing the bottom of the article.
4. Try the image-preloading option on a page with lazy-loaded photographs. Confirm the debugging banner disappears afterward.
5. If capture is blocked by Chrome, policy, or another attached debugger, confirm an explanation appears and the source page remains usable.

The extension has not been installed automatically or published to the Chrome Web Store.
