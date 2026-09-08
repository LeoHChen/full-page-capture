// Serialized into Chrome's isolated world. Keep all page-side helpers inside.
export function cleanPage(key, options = {}, restore = false) {
  const previous = globalThis[key];
  if (restore) {
    if (!previous) return;
    for (const {element, property, value, priority, originalStyle, appliedStyle} of previous.changes.reverse()) {
      if (element.getAttribute('style') === appliedStyle) {
        if (originalStyle === null) element.removeAttribute('style');
        else element.setAttribute('style', originalStyle);
        continue;
      }
      // Preserve unrelated inline changes the website made during capture.
      if (value) element.style.setProperty(property, value, priority);
      else element.style.removeProperty(property);
      if (originalStyle === null && !element.getAttribute('style')) element.removeAttribute('style');
    }
    delete globalThis[key];
    return;
  }
  if (previous) return previous.counts;
  const state = {changes: [], counts: {ads: 0, floating: 0, footers: 0}};
  // Register state before mutating: even partial failures can be restored.
  globalThis[key] = state;
  const protectedSelector = 'main, article, [role="main"], [role="dialog"], [aria-modal="true"]';
  const barrier = /(?:^|[\s_-])(?:paywall|consent|cookie|gdpr|modal|dialog)(?:$|[\s_-])/i;
  const identity = element => `${element.id} ${element.getAttribute('class') || ''}`;
  const protectedElement = element => {
    if (element.matches(protectedSelector) || element.querySelector(protectedSelector)) return true;
    for (let current = element; current && current !== document.body; current = current.parentElement) {
      if (barrier.test(identity(current)) || current.matches('[role="dialog"], [aria-modal="true"]')) return true;
    }
    return false;
  };
  const adName = /(?:^|[\s_-])(?:ads?|advert|advertisement|advertising|adslot|adunit|adsbygoogle|advertorial)(?:$|[\s_-])/i;
  const adHost = /(?:^|\.)(?:doubleclick\.net|googlesyndication\.com|googleadservices\.com|adnxs\.com|amazon-adsystem\.com)$/i;
  const isAd = element => {
    if (element.matches('[data-ad-slot], [data-ad-unit], [data-ad-client], [data-advertisement]')) return true;
    if (element.matches('div, aside, section, ins, iframe') && adName.test(identity(element))) return true;
    if (/^(?:advertisement|advertising|sponsored advertisement)$/i.test(element.getAttribute('aria-label')?.trim() || '')) return true;
    if (element.tagName !== 'IFRAME') return false;
    try { return adHost.test(new URL(element.getAttribute('src'), document.baseURI).hostname); }
    catch { return false; }
  };
  const isFooter = element => {
    if (element.closest('article, section, aside, nav, figure')) return false;
    return element.matches('footer, [role="contentinfo"]') ||
      /(?:^|[\s_-])(?:site-footer|global-footer|page-footer|sitefooter|globalfooter)(?:$|\s)/i.test(identity(element));
  };
  const isFloating = (element, style, rect) => {
    if (!['fixed', 'sticky'].includes(style.position)) return false;
    const viewportArea = innerWidth * innerHeight;
    // Preserve large fixed backgrounds and application/content panels.
    if (rect.width * rect.height > viewportArea * 0.45 || element.textContent.length > 1200) return false;
    if (style.position === 'sticky' && [style.top, style.bottom, style.left, style.right].every(value => value === 'auto')) return false;
    return element.matches('img, picture, iframe, button, nav, header, aside, [role="toolbar"], [role="navigation"]') ||
      Boolean(element.querySelector('img, picture, button, a, input, video, iframe')) ||
      /(?:^|[\s_-])(?:floating|sticky|toolbar|share|social|chat|widget)(?:$|[\s_-])/i.test(identity(element));
  };
  // Collect decisions before changing layout so geometry is consistent.
  const candidates = [];
  for (const element of document.body?.querySelectorAll('*') || []) {
    if (!(element instanceof HTMLElement) || protectedElement(element)) continue;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    if (!rect.width || !rect.height || style.display === 'none' || style.visibility === 'hidden') continue;
    let category;
    if (options.smartCleanup && isAd(element)) category = 'ads';
    else if (options.smartCleanup && isFooter(element)) category = 'footers';
    else if (options.smartCleanup && isFloating(element, style, rect)) category = 'floating';
    else if (!options.smartCleanup && options.hideFixedBottom && style.position === 'fixed' && rect.bottom >= innerHeight - 1 && rect.top < innerHeight) category = 'floating';
    if (category) candidates.push({element, category});
  }
  const selected = new Set(candidates.map(candidate => candidate.element));
  for (const {element, category} of candidates) {
    let nested = false;
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (selected.has(parent)) { nested = true; break; }
    }
    if (nested) continue;
    const property = category === 'floating' ? 'visibility' : 'display';
    const change = {element, property, value: element.style.getPropertyValue(property),
      priority: element.style.getPropertyPriority(property), originalStyle: element.getAttribute('style')};
    state.changes.push(change);
    element.style.setProperty(property, category === 'floating' ? 'hidden' : 'none', 'important');
    change.appliedStyle = element.getAttribute('style');
    state.counts[category]++;
  }
  return state.counts;
}

export function cleanupExpression(key, options, restore = false) {
  return `(${cleanPage.toString()})(${JSON.stringify(key)}, ${JSON.stringify(options)}, ${restore})`;
}
