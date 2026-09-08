# Changelog

## v0.2 — 2026-09-08

- Add optional **Clean page: ads, floating items & footer** capture cleanup ([#1](https://github.com/LeoHChen/full-page-capture/issues/1)).
- Detect common ad slots/frames, small fixed or sticky controls/images, and site-wide footers; preserve article/section footers and inline content.
- Collapse ads and site footers before measuring screenshot dimensions. Show removal counts in the preview for PNG and PDF captures.
- Apply cleanup in an isolated JavaScript world and restore original styles after success or failure, preserving unrelated style changes made by the page.
- Add real Chrome screenshot pixel tests and cleanup failure/opt-out regression tests.

Installation: unzip `full-page-capture-v0.2.zip`, open `chrome://extensions`, enable Developer mode, and load the extracted folder. To update an existing unpacked installation, replace its files with the new ZIP contents and click Reload. Enable the new cleanup checkbox in the popup before capturing.

Verification: 16 Node tests pass. The Chrome fixture removes 2 ads, 3 floating items, and 1 site footer; height drops from 1,765 to 1,301 pixels. Screenshot pixel checks preserve the article footer and inline image. Styles and scroll position are restored after success and simulated screenshot failure. An installed-extension test on real articles remains a manual check.

## v0.1 — 2026-09-08

- Prevent silent corruption above Chrome's 16,384-device-pixel compositor limit with DPR-aware capture scaling.
- Report CSS size, device pixel ratio, output size, and resolution reduction in the preview.
- Keep the source tab active during capture and bound DevTools Protocol operations with watchdogs.
- Load native lazy images eagerly and enable scroll preloading by default.
- Optionally hide bottom-fixed overlays during capture and restore them during cleanup.
- Validate unsupported pages in the popup before opening an error tab.
- Speed up base64 decoding with `Uint8Array.fromBase64` and a loop fallback.
- Correct PDF physical sizing for DPR, add Unicode title metadata, and keep PDF implementations in sync.
- Add dated, host-aware filenames, capture deletion, startup cleanup, a keyboard shortcut, package metadata, and release hygiene.
