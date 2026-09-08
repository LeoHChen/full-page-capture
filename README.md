# Full Page Capture

A focused Chrome extension and Codex skill for capturing an entire webpage, with PNG/image and continuous PDF output. No account, server, analytics, remote libraries, or build step.

## Install the Chrome extension

1. Keep the `extension` folder somewhere permanent (moving it later breaks the unpacked install).
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the `extension` folder (the one containing `manifest.json`).
5. Pin **Full Page Capture** from Chrome's Extensions menu.

Open an ordinary webpage, click the extension, and choose **Capture full page**. A preview opens when capture finishes. Download **PNG** or **PDF**. PDF is one continuous screenshot page, intended for scrolling and zooming, with image-based text.

For pages with missing images below the fold, enable **Scroll first to load more images**. This scrolls through the initially loaded document for up to about 18 seconds and waits briefly for images. It can trigger normal website lazy loading and scroll listeners. The extension restores your original scroll position afterward. It does not expand collapsed content or nested scrolling panels.

## Permissions and privacy

- `activeTab`: get the title and URL of the tab you invoked the extension on.
- `debugger`: temporarily attach to that tab and use Chrome's native full-page screenshot operation. Chrome displays a debugging banner and a broad permission warning because this API is powerful. This extension attaches only when you press Capture and detaches in cleanup, including failure paths.
- `downloads`: let you choose where to save the image or PDF.

The extension makes no outbound requests. Capture pixels and the page title are stored in extension-local IndexedDB. Captures older than 24 hours are removed on the next successful capture; they are not automatically deleted by a timer. Downloaded files remain where you save them. Removing the extension removes its local capture store.

Some pages, Chrome internal pages, built-in PDF viewers, enterprise-restricted tabs, and the Chrome Web Store can block capture. Close DevTools or stop other browser automation on the same tab if attachment fails. Infinite or virtualized feeds, nested scroll areas, moving video, and interactive canvas apps may not produce a complete static document. Capture is limited to 60 million CSS pixels, 60,000 CSS pixels high, or 16,000 wide; oversized pages produce an error rather than being silently truncated. Zooming out can help. PDF conversion may lower resolution for very large captures and discloses this in the preview; the PNG stays at captured resolution.

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
node --test tests/*.test.mjs
```

See `VERIFICATION.md` for what was checked and which live extension checks remain. No extension has been silently installed or submitted to the Chrome Web Store.

Chrome API references: [chrome.debugger](https://developer.chrome.com/docs/extensions/reference/api/debugger) and [Page.captureScreenshot](https://chromedevtools.github.io/devtools-protocol/1-3/Page/#method-captureScreenshot).
