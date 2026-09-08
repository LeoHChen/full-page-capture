# Full Page Capture

A focused Chrome extension and Codex skill for capturing an entire webpage, with PNG/image and continuous PDF output. No account, server, analytics, remote libraries, or build step.

## Download

Download `full-page-capture-v0.2.zip` from the [v0.2 release](https://github.com/LeoHChen/full-page-capture/releases/tag/v0.2), unzip it, then load the resulting folder in Chrome as described below.

## Install the Chrome extension

1. Keep the `extension` folder somewhere permanent (moving it later breaks the unpacked install).
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the `extension` folder (the one containing `manifest.json`).
5. Pin **Full Page Capture** from Chrome's Extensions menu.

Open an ordinary webpage, click the extension, and choose **Capture full page**. A preview opens when capture finishes. Download **PNG** or **PDF**. PDF is one continuous screenshot page, intended for scrolling and zooming, with image-based text.

**Scroll first to load more images** is enabled by default. It scrolls through the initially loaded document for up to about 18 seconds and waits briefly for images. The extension also asks native lazy-loaded images to load even when this option is off. Preloading can trigger normal website lazy loading and scroll listeners. The extension restores your original scroll position afterward. It does not expand collapsed content or nested scrolling panels.

**Hide bottom-fixed overlays** is also enabled by default. It temporarily hides fixed elements touching the bottom of the viewport, such as chat bars, then restores them after capture. Identifiable consent prompts and dialogs are preserved. Disable it when the fixed control is part of the content you want.

**Clean page: ads, floating items & footer** is optional and off by default. Turn it on to remove likely ad containers and ad frames, floating toolbars and images, and the site's regular footer from both PNG and PDF. Ads and site footers are collapsed before measuring the page, so their space can be removed too. Article and section footers, inline images, main content, dialogs, consent prompts, and large fixed content panels are preserved. Smart cleanup takes precedence over the simpler bottom-overlay setting while enabled.

The preview reports how many containers were removed. Detection uses local page structure and positioning, so unusual markup can be missed or misclassified; turn cleanup off and recapture if needed. It does not block network ads, bypass access barriers, inspect iframe contents or shadow DOM, or continually remove content inserted after preparation. Fixed minimum heights on a site can leave blank space. Original inline styles and scroll position are restored after capture, including screenshot failure. See [the feature plan](docs/smart-cleanup-plan.md) and [issue #1](https://github.com/LeoHChen/full-page-capture/issues/1).

The default keyboard shortcut is `Alt+Shift+P`. You can change it at `chrome://extensions/shortcuts`.

## Permissions and privacy

- `activeTab`: get the title and URL of the tab you invoked the extension on.
- `debugger`: temporarily attach to that tab and use Chrome's native full-page screenshot operation. Chrome displays a debugging banner and a broad permission warning because this API is powerful. This extension attaches only when you press Capture and detaches in cleanup, including failure paths.
- `downloads`: let you choose where to save the image or PDF.

The extension makes no outbound requests. Capture pixels, page title, source URL, dimensions, and device pixel ratio are stored in extension-local IndexedDB. Captures older than 24 hours are removed on browser startup, preview load, or the next successful capture. The preview also provides **Delete capture** for immediate removal. Downloaded files remain where you save them. Removing the extension removes its local capture store.

Some pages, Chrome internal pages, built-in PDF viewers, enterprise-restricted tabs, and the Chrome Web Store can block capture. Close DevTools or stop other browser automation on the same tab if attachment fails. Infinite or virtualized feeds, nested scroll areas, moving video, and interactive canvas apps may not produce a complete static document.

Chrome's compositor cannot reliably read a screenshot dimension above 16,384 device pixels. The extension detects device pixel ratio and scales oversized captures so the complete page remains accurate instead of silently repeating or truncating pixels. The preview reports the CSS dimensions, DPR, output dimensions, and any resolution reduction. Captures are additionally limited to 60 million CSS pixels, 60,000 CSS pixels high, or 16,000 wide. Zooming out can help. PDF conversion may lower resolution further for Chrome's canvas limits and discloses this in the preview.

## Codex skill

The packaged skill is `skill/full-page-screenshot`. Copy it into your Codex skills directory if using it on another machine. For this build, it is also installed in `/Users/dayone/.codex/skills/full-page-screenshot`.

Start a new Codex session if necessary for discovery, then ask:

> Use $full-page-screenshot to capture this entire page and save a PDF.

The skill uses the browser tools available in that Codex session; the Chrome extension is not required. Its PDF converter needs only Node.js 18+. For an existing JPEG:

```sh
node skill/full-page-screenshot/scripts/export-pdf.mjs capture.jpg capture.pdf
```

## Development and validation

The extension is plain Manifest V3 JavaScript with no build step. Unit tests run with Node.js 18+:

```sh
npm test
```

To build the same unpacked extension archive used by releases:

```sh
mkdir -p dist
(cd extension && zip -r ../dist/full-page-capture-v0.2.zip . -x '*.DS_Store')
```

The Chrome integration test uses a temporary profile and a local fixture. With Node 22+ and Chrome installed, run `npm run test:browser`. Set `CHROME_PATH` if Chrome is not at its standard macOS path. This test exercises actual page cleanup and screenshot pixels through a DevTools Protocol shim; it does not install the extension.

See `VERIFICATION.md` for what was checked and which live extension checks remain. No extension has been silently installed or submitted to the Chrome Web Store.

Chrome API references: [chrome.debugger](https://developer.chrome.com/docs/extensions/reference/api/debugger) and [Page.captureScreenshot](https://chromedevtools.github.io/devtools-protocol/1-3/Page/#method-captureScreenshot).
