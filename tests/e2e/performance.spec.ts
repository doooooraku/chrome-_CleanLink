import { test, expect } from '@playwright/test';
import { serveDist, waitForCleanLinkReady, blockExternal, VHOST } from './utils';
import { resolveAssetContaining } from './utils.asset';

const POPUP_URL = `${VHOST}/src/ui/popup/index.html`;

test('cleanUrl processes 100 links under 200ms in browser', async ({ page }) => {
  await blockExternal(page);
  await serveDist(page);
  await page.goto(POPUP_URL, { waitUntil: 'networkidle' });
  await waitForCleanLinkReady(page);

  const rulesModuleUrl = await resolveAssetContaining('rules');

  const duration = await page.evaluate(async (moduleUrl) => {
    const module = await import(moduleUrl);
    const cleanUrl =
      (module.cleanUrl ?? module.c ?? module.default?.cleanUrl) as ((input: string) => unknown) | undefined;
    if (typeof cleanUrl !== 'function') {
      throw new Error('cleanUrl export missing');
    }
    const links = Array.from({ length: 100 }, (_, index) => `https://example.com/?utm_source=test${index}&id=${index}`);
    const start = performance.now();
    links.forEach((link) => cleanUrl(link));
    return performance.now() - start;
  }, rulesModuleUrl);

  expect(duration).toBeLessThan(200);
});
