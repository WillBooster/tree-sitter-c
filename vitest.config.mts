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
          // test/unit/performance.test.ts times parses in process CPU time, which counts only that test file while
          // each worker is a process of its own; threads would share it with the test files running alongside.
          pool: 'forks',
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
