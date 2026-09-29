import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const BrowserTests = ['test/e2e/browser.test.ts'];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          include: ['test/{unit,e2e}/**/*.test.ts'],
          exclude: BrowserTests,
        },
      },
      {
        test: {
          name: 'browser',
          include: BrowserTests,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
