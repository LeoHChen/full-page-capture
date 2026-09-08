export function captureBounds(metrics) {
  const size = metrics.cssContentSize;
  if (!size) throw new Error('Chrome did not return the page dimensions.');
  const width = Math.ceil(size.width), height = Math.ceil(size.height);
  if (!(width > 0 && height > 0) || !Number.isFinite(width * height)) throw new Error('Invalid page dimensions.');
  if (height > 60000 || width > 16000 || width * height > 60000000) {
    throw new Error('This page is too large for a single capture. Zoom out in Chrome and try again. Infinite feeds may need a shorter page.');
  }
  return {x: 0, y: 0, width, height, scale: 1};
}

// Runs only inside the tab explicitly selected by the user.
const preloadExpression = `(${async function () {
  const until = Date.now() + 18000;
  const initialHeight = document.documentElement.scrollHeight;
  let steps = 0;
  for (let y = 0; y < initialHeight && Date.now() < until && steps < 80; y += Math.max(200, innerHeight * 0.85)) {
    scrollTo({left: 0, top: y, behavior: 'instant'});
    await new Promise(resolve => setTimeout(resolve, 180));
    steps++;
  }
  scrollTo({left: 0, top: 0, behavior: 'instant'});
  await Promise.race([Promise.all([...document.images].filter(i => !i.complete).map(i => new Promise(r => {
    i.addEventListener('load', r, {once:true}); i.addEventListener('error', r, {once:true});
  }))), new Promise(r => setTimeout(r, 1500))]);
  return steps;
}})()`;

export async function capturePage(api, tabId, {preload = false} = {}) {
  const target = {tabId};
  let attached = false, position;
  const command = (method, params = {}) => api.debugger.sendCommand(target, method, params);
  try {
    const tab = await api.tabs.get(tabId);
    if (!/^https?:\/\//.test(tab.url || '')) throw new Error('Open a regular http or https webpage first. Chrome settings, Web Store pages, and PDFs may block capture.');
    await api.debugger.attach(target, '1.3');
    attached = true;
    const saved = await command('Runtime.evaluate', {expression: '({x:scrollX,y:scrollY})', returnByValue: true});
    position = saved.result?.value;
    await command('Runtime.evaluate', {expression: "scrollTo({left:0,top:0,behavior:'instant'})"});
    if (preload) {
      const loaded = await command('Runtime.evaluate', {expression: preloadExpression, awaitPromise: true, returnByValue: true, timeout: 22000});
      if (loaded.exceptionDetails) throw new Error('Image preparation was interrupted. Try again with image loading unchecked.');
    }
    await command('Runtime.evaluate', {expression: "new Promise(r=>setTimeout(r,250))", awaitPromise: true, timeout: 2000});
    if ((await api.tabs.get(tabId)).url !== tab.url) throw new Error('The page navigated during capture. Try again when it has finished loading.');
    const clip = captureBounds(await command('Page.getLayoutMetrics'));
    const screenshot = await command('Page.captureScreenshot', {format: 'png', fromSurface: true, captureBeyondViewport: true, clip});
    if (!screenshot?.data) throw new Error('Chrome returned an empty screenshot.');
    return {data: screenshot.data, title: tab.title || 'Full page', width: clip.width, height: clip.height, created: Date.now()};
  } finally {
    if (attached) {
      if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
        await command('Runtime.evaluate', {expression: `scrollTo({left:${position.x},top:${position.y},behavior:'instant'})`}).catch(() => {});
      }
      await api.debugger.detach(target).catch(() => {});
    }
  }
}
