import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { serveDist, setupChromeMocks, waitForCleanLinkReady, blockExternal, VHOST } from './utils';
import type { CleanLinkMessage, CleanLinkResponse } from '../../src/types/messages';
import type { Settings } from '../../src/libs/storage';

const OPTIONS_URL = `${VHOST}/src/ui/options/index.html`;

test('Options page updates settings, site rules, and license', async ({ page }) => {
  const sentMessages: CleanLinkMessage['kind'][] = [];

  await blockExternal(page);
  await serveDist(page);
  await setupChromeMocks(page, {
    storage: {
      settings: { autoCleanDefault: false, expandShort: false } satisfies Settings,
      license: { code: 'OLD', status: 'invalid', lastChecked: Date.now() },
      siteOverrides: { 'skip.me': 'skip' }
    },
    handlers: {
      UPDATE_SETTINGS: (payload) => ({ ok: true, data: payload.payload ?? {} } as CleanLinkResponse),
      UPDATE_SITE_OVERRIDE: () => ({ ok: true } as CleanLinkResponse),
      CLEAR_HISTORY: () => ({ ok: true } as CleanLinkResponse),
      VERIFY_LICENSE: () => ({
        ok: true,
        data: { code: 'VALID', status: 'valid', lastChecked: Date.now() }
      } as CleanLinkResponse)
    },
    onMessage: (kind) => sentMessages.push(kind)
  });

  await page.goto(OPTIONS_URL, { waitUntil: 'networkidle' });
  await waitForCleanLinkReady(page, 'input[type="checkbox"]');

  const autoClean = page.getByRole('checkbox', { name: /Auto-clean pages by default/i });
  const expandShort = page.getByRole('checkbox', { name: /Expand short URLs/i });

  await expect(autoClean).toBeVisible();
  await expect(expandShort).toBeVisible();

  await autoClean.check();
  await expandShort.check();

  await page.getByPlaceholder('example.com').fill('news.example.com');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'Remove' }).first().click();

  await page.getByRole('button', { name: 'Delete history' }).click();
  await page.getByPlaceholder('Enter license code').fill('VALID');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.locator('.toast')).toContainText('License verified');

  const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
  const seriousOrWorse = accessibilityScanResults.violations.filter((violation) =>
    ['serious', 'critical'].includes(violation.impact ?? '')
  );
  expect(seriousOrWorse).toEqual([]);

  expect(sentMessages).toEqual([
    'UPDATE_SETTINGS',
    'UPDATE_SETTINGS',
    'UPDATE_SITE_OVERRIDE',
    'UPDATE_SITE_OVERRIDE',
    'CLEAR_HISTORY',
    'VERIFY_LICENSE'
  ]);
});
