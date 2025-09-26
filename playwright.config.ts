import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  reporter: [['list']],
  projects: [
    {
      name: 'node',
      use: {
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure'
      }
    }
  ]
});
