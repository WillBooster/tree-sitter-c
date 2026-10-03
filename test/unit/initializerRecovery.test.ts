import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { expect, test } from 'vitest';

test(
  'keeps the translation unit when an unterminated initializer precedes an outer endif',
  { timeout: 300_000 },
  () => {
    const root = path.resolve(import.meta.dirname, '../..');
    const result = spawnSync(
      'script/tree-sitter',
      ['parse', '--grammar-path', '.', '--no-ranges', 'test/fixtures/initializerRecovery.c'],
      {
        cwd: root,
        env: { ...process.env, TREE_SITTER_LIBDIR: path.join(root, '.tmp/initializer-recovery-lib') },
        encoding: 'utf8',
        timeout: 300_000,
      }
    );
    expect(result.error).toBeUndefined();
    expect([0, 1], result.stderr).toContain(result.status);
    expect(result.stdout, result.stderr).toMatch(/^\(translation_unit\b/);
  }
);
