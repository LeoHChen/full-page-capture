# Changelog

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
