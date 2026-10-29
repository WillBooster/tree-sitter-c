import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const BrowserTests = ['test/e2e/browser.test.ts'];

export default defineConfig({
  test: {
    // tsconfig.json declares the `vitest/globals` types, so the runner must provide those globals.
    globals: true,
    projects: [
      {
        test: {
          name: 'node',
          globalSetup: 'test/helpers/installCli.ts',
          // Each `Query` construction analyzes the whole parse table (over 25,000 states), which alone can exceed
          // Vitest's 5-second default on slower CI runners such as macOS Intel while tests run in parallel.
          testTimeout: 60_000,
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
