import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { serveDist, setupChromeMocks, waitForCleanLinkReady, blockExternal, VHOST } from './utils';
import type { CleanLinkResponse } from '../../src/types/messages';

const HISTORY_URL = `${VHOST}/src/ui/history/index.html`;

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
  await blockExternal(page);
  await serveDist(page);
  await setupChromeMocks(page, {
    handlers: {
      FETCH_HISTORY: () => historyPayload
    }
  });

  await page.goto(HISTORY_URL, { waitUntil: 'networkidle' });
  await waitForCleanLinkReady(page, 'table tbody tr');

  await expect(page.locator('table tbody tr')).toHaveCount(1, { timeout: 15_000 });
  await page.getByRole('button', { name: 'Copy original' }).click();
  await expect(page.locator('.toast')).toContainText('Copied!');

  const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
  const seriousOrWorse = accessibilityScanResults.violations.filter((violation) =>
    ['serious', 'critical'].includes(violation.impact ?? '')
  );
  expect(seriousOrWorse).toEqual([]);
});
