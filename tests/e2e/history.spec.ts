import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { serveDist, setupChromeMocks } from './utils';
import type { CleanLinkResponse } from '../../src/types/messages';

const historyPayload = {
  ok: true,
  data: [
    {
      id: 'history-1',
      time: Date.now(),
      original: 'https://example.com/?utm_source=mail',
      cleaned: 'https://example.com/',
      final: 'https://example.com/',
      expanded: false,
      notes: 'removed-utm',
      site: 'example.com'
    }
  ]
} satisfies CleanLinkResponse;

test('History view copies links and passes axe audit', async ({ page }) => {
  await serveDist(page);
  await setupChromeMocks(page, {
    handlers: {
      FETCH_HISTORY: () => historyPayload
    }
  });

  await page.goto('http://cleanlink.local/src/ui/history/index.html');

  await expect(page.locator('table tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'Copy original' }).click();
  await expect(page.locator('.toast')).toContainText('Copied!');

  const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
  expect(accessibilityScanResults.violations).toEqual([]);
});
