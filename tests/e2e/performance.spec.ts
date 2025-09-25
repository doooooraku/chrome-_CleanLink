import { test, expect } from '@playwright/test';
import { serveDist } from './utils';

test('cleanUrl processes 100 links under 200ms in browser', async ({ page }) => {
  await serveDist(page);
  await page.goto('http://cleanlink.local/src/ui/popup/index.html');
  const duration = await page.evaluate(async () => {
    const module = await import('/src/libs/rules.ts');
    const cleanUrl = module.cleanUrl as (input: string) => unknown;
    const links = Array.from({ length: 100 }, (_, index) => `https://example.com/?utm_source=test${index}&id=${index}`);
    const start = performance.now();
    links.forEach((link) => cleanUrl(link));
    return performance.now() - start;
  });
  expect(duration).toBeLessThan(200);
});
