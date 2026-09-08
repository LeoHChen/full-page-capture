import {cleanupExpression} from './cleanup.mjs';

const MAX_DEVICE_DIMENSION = 16384;

export function captureBounds(metrics, dpr = 1) {
  const size = metrics.cssContentSize;
  if (!size) throw new Error('Chrome did not return the page dimensions.');
  const width = Math.ceil(size.width);
  const height = Math.ceil(size.height);
  if (!(width > 0 && height > 0) || !Number.isFinite(width * height)) {
    throw new Error('Invalid page dimensions.');
  }
  if (height > 60000 || width > 16000 || width * height > 60000000) {
    throw new Error('This page is too large for a single capture. Zoom out in Chrome and try again. Infinite feeds may need a shorter page.');
  }
  const pixelRatio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const scale = Math.min(
    1,
    MAX_DEVICE_DIMENSION / (width * pixelRatio),
    MAX_DEVICE_DIMENSION / (height * pixelRatio),
  );
  return {x: 0, y: 0, width, height, scale};
}

function withTimeout(promise, timeoutMs, method) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${method} timed out. Keep the source tab visible and try again.`)),
      timeoutMs,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
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

const eagerImagesExpression = `(${async function () {
  for (const image of document.images) image.loading = 'eager';
  await Promise.race([
    Promise.all([...document.images].filter(image => !image.complete).map(image => new Promise(resolve => {
      image.addEventListener('load', resolve, {once: true});
      image.addEventListener('error', resolve, {once: true});
    }))),
    new Promise(resolve => setTimeout(resolve, 1500)),
  ]);
}})()`;

export async function capturePage(api, tabId, {preload = true, hideFixedBottom = true, smartCleanup = false} = {}) {
  const target = {tabId};
  const hideToken = `fpc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let attached = false;
  let position;
  let cleanupContext;
  let cleanup;
  const command = (method, params = {}, timeoutMs = 30000) => withTimeout(
    api.debugger.sendCommand(target, method, params),
    timeoutMs,
    method,
  );
  try {
    const tab = await api.tabs.get(tabId);
    if (!/^https?:\/\//.test(tab.url || '')) {
      throw new Error('Open a regular http or https webpage first. Chrome settings, Web Store pages, and PDFs may block capture.');
    }
    await api.debugger.attach(target, '1.3');
    attached = true;
    const saved = await command('Runtime.evaluate', {expression: '({x:scrollX,y:scrollY})', returnByValue: true});
    position = saved.result?.value;
    await command('Runtime.evaluate', {expression: "scrollTo({left:0,top:0,behavior:'instant'})"});
    await command('Runtime.evaluate', {
      expression: eagerImagesExpression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (preload) {
      const loaded = await command('Runtime.evaluate', {
        expression: preloadExpression,
        awaitPromise: true,
        returnByValue: true,
        timeout: 22000,
      }, 25000);
      if (loaded.exceptionDetails) throw new Error('Image preparation was interrupted. Try again with image loading unchecked.');
    }
    await command('Runtime.evaluate', {expression: "new Promise(r=>setTimeout(r,250))", awaitPromise: true, timeout: 2000});
    let currentTab = await api.tabs.get(tabId);
    if (currentTab.url !== tab.url) {
      throw new Error('The page navigated during capture. Try again when it has finished loading.');
    }
    if (currentTab.active === false) {
      await api.tabs.update(tabId, {active: true});
      currentTab = await api.tabs.get(tabId);
      if (currentTab.url !== tab.url) {
        throw new Error('The page navigated during capture. Try again when it has finished loading.');
      }
    }
    if (hideFixedBottom || smartCleanup) {
      const {frameTree} = await command('Page.getFrameTree');
      const {executionContextId} = await command('Page.createIsolatedWorld', {
        frameId: frameTree.frame.id,
        worldName: hideToken,
      });
      cleanupContext = executionContextId;
      const result = await command('Runtime.evaluate', {
        expression: cleanupExpression(hideToken, {hideFixedBottom, smartCleanup}),
        contextId: cleanupContext,
        returnByValue: true,
        timeout: 5000,
      });
      if (result.exceptionDetails) throw new Error('Page cleanup was interrupted. Try again with cleanup disabled.');
      cleanup = result.result?.value;
    }
    const ratio = await command('Runtime.evaluate', {
      expression: 'devicePixelRatio',
      returnByValue: true,
    });
    const dpr = Number(ratio.result?.value) || 1;
    const clip = captureBounds(await command('Page.getLayoutMetrics'), dpr);
    const screenshot = await command('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: true,
      clip,
    }, 90000);
    if (!screenshot?.data) throw new Error('Chrome returned an empty screenshot.');
    return {
      data: screenshot.data,
      title: tab.title || 'Full page',
      url: tab.url,
      width: clip.width,
      height: clip.height,
      dpr,
      scale: clip.scale,
      cleanup: smartCleanup ? cleanup : undefined,
      created: Date.now(),
    };
  } finally {
    if (attached) {
      if (cleanupContext !== undefined) {
        await command('Runtime.evaluate', {
          expression: cleanupExpression(hideToken, {}, true),
          contextId: cleanupContext,
          timeout: 2000,
        }, 3000).catch(() => {});
      }
      if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
        await command('Runtime.evaluate', {expression: `scrollTo({left:${position.x},top:${position.y},behavior:'instant'})`}).catch(() => {});
      }
      await api.debugger.detach(target).catch(() => {});
    }
  }
}
