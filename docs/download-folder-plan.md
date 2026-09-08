# Feature request: configurable default download folder

## Behavior

Save PNG and PDF captures to `screenshots/` under Chrome's configured Downloads directory, normally `~/Downloads/screenshots`, without opening a save dialog by default. Let users save a different subfolder (including nested folders), use the Downloads root by leaving the folder empty, or enable **Ask where to save each file** to choose another location.

## Plan

1. Add a Download settings page reachable from the popup, preview, and Chrome extension options.
2. Persist the folder and ask-before-saving preference in `chrome.storage.local`; default to `screenshots` and no prompt. Add the `storage` permission.
3. Validate relative folder paths before saving: disallow absolute/home paths, traversal, invalid filename characters, and invalid path components. Preserve spaces and Unicode in valid folder names.
4. Read current preferences for every PNG/PDF download, including already-open previews. Prefix the existing safe filename and use `conflictAction: uniquify` to avoid overwriting prior captures. Surface storage/download errors rather than reporting success.
5. Test defaults, saved preferences, both output formats, invalid paths, failures, and the settings UI in Chrome with extension APIs stubbed. Keep test downloads out of the user's Downloads folder.
6. Document Chrome's path restriction and package a downloadable v0.3 release.

## Constraints and acceptance

Chrome's [downloads API](https://developer.chrome.com/docs/extensions/reference/api/downloads#type-DownloadOptions) accepts paths relative to its Downloads directory, not arbitrary absolute paths. If the user changed Chrome's download directory, `screenshots` is relative to that location. Choosing a directory outside it requires the save dialog or changing Chrome's own download location.

- First PNG/PDF downloads request `screenshots/<existing-safe-name>.<format>` with no forced save dialog.
- Settings survive reopening and apply to future downloads from existing previews.
- Invalid settings never reach the download API; failed saves do not overwrite previous preferences.
- User can restore defaults and optionally request the native save dialog.
