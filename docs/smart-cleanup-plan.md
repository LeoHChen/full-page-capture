# Feature request: optional smart capture cleanup

## Problem and intended behavior

Ads, floating toolbars/images, and the site-wide footer can obscure or distract from captured content. Add an unchecked **Clean page: ads, floating items & footer** option to the popup. When enabled, both PNG and PDF should use the cleaned capture. Retain the existing bottom-overlay option for users who only want that behavior.

## Implementation plan

1. Pass the explicit opt-in through popup → background → capture. No new permissions or network services.
2. Run a self-contained cleanup routine in an isolated JavaScript world on the selected page after preloading. Use semantic footer markers, specific ad attributes/container names and known ad iframe hosts, plus computed fixed/sticky positioning and bounded geometry for floating controls/images. Avoid broad substring matches such as `ad` in `header`.
3. Preserve article/section footers, main content, ordinary inline images, large fixed backgrounds, dialogs, consent prompts, and access barriers. Detection is heuristic: unusual site markup can be missed or misclassified. Users can switch cleanup off and recapture.
4. Temporarily collapse identified ads and site footers, and hide floating items. Recalculate page bounds after cleanup so removed footers do not leave the original page height. Store original inline property values and priorities, and restore them on success and failure before restoring scroll and detaching.
5. Record category counts in capture metadata and display a short cleanup summary in the preview.
6. Test classification and restoration in a real browser fixture, plus capture orchestration on success/failure. Document limits, update version to 0.2.0, and provide a downloadable v0.2 archive without replacing v0.1.

## Acceptance criteria

- Cleanup is off by default and has no effect unless explicitly selected.
- Fixture ad slots and known ad frames, floating toolbars/images, and the global footer disappear from the capture; ordinary content and article footers remain.
- Captured dimensions reflect collapsed page content.
- Original inline styles, scroll position, and debugger state are restored, including when the screenshot fails.
- Browser fixture tests verify real computed layout and screenshot output; automated checks describe any remaining installation test.

## Limits

This is local DOM cleanup, not a network ad blocker. It does not inspect iframe contents or shadow DOM, and late insertions after preparation can remain. It does not bypass paywalls or consent, and it does not guarantee detection of every advertisement. A site with fixed minimum heights can retain blank space after removal.
