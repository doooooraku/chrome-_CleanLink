import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { serveDist, setupChromeMocks } from './utils';
import type { CleanLinkMessage, CleanLinkResponse } from '../../src/types/messages';
import type { Settings } from '../../src/libs/storage';

test('Options page updates settings, site rules, and license', async ({ page }) => {
  const sentMessages: CleanLinkMessage['kind'][] = [];

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

  await page.goto('http://cleanlink.local/src/ui/options/index.html');

  await page.getByRole('checkbox', { name: 'Auto-clean pages by default' }).check();
  await page.getByRole('checkbox', { name: 'Expand short URLs (requires permission)' }).check();

  await page.getByPlaceholder('example.com').fill('news.example.com');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'Remove' }).first().click();

  await page.getByRole('button', { name: 'Delete history' }).click();
  await page.getByPlaceholder('Enter license code').fill('VALID');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.locator('.toast')).toContainText('License verified');

  const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
  expect(accessibilityScanResults.violations).toEqual([]);

  expect(sentMessages).toEqual([
    'UPDATE_SETTINGS',
    'UPDATE_SETTINGS',
    'UPDATE_SITE_OVERRIDE',
    'UPDATE_SITE_OVERRIDE',
    'CLEAR_HISTORY',
    'VERIFY_LICENSE'
  ]);
});
