import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { Language, Parser } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const fixture = 'test/fixtures/statementMacros.c';
const source = fs.readFileSync(path.join(root, fixture), 'utf8');

test('keeps Wasm function and conditional ranges after statement-like macros', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(path.join(root, 'tree-sitter-c.wasm')));
  const tree = parser.parse(source)!;
  try {
    expect(
      tree.rootNode.descendantsOfType('function_definition').map((node) => [node.startPosition, node.endPosition])
    ).toEqual([
      [
        { row: 0, column: 0 },
        { row: 10, column: 1 },
      ],
      [
        { row: 11, column: 0 },
        { row: 19, column: 1 },
      ],
    ]);
    expect(tree.rootNode.descendantsOfType('compound_statement')).toHaveLength(3);
    const directive = tree.rootNode.descendantsOfType('preproc_ifdef')[0]!;
    expect(directive.text).toBe('#ifdef USE_SSL\n  struct peer origin;\n#endif');
    expect([directive.startIndex, directive.endIndex]).toEqual([
      source.indexOf('#ifdef'),
      source.indexOf('#endif') + '#endif'.length,
    ]);
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('keeps native function and conditional ranges after statement-like macros', { timeout: 300_000 }, () => {
  const result = spawnSync(
    'script/tree-sitter',
    ['query', '--grammar-path', '.', '--captures', 'test/fixtures/statementMacros.scm', fixture],
    {
      cwd: root,
      env: { ...process.env, TREE_SITTER_LIBDIR: path.join(root, '.tmp/statement-macro-recovery-lib') },
      encoding: 'utf8',
      timeout: 300_000,
    }
  );
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain(' - function, start: (0, 0), end: (10, 1)');
  expect(result.stdout).toContain(' - function, start: (11, 0), end: (19, 1)');
  expect(result.stdout).toContain(' - conditional, start: (15, 0), end: (17, 6)');
  expect(result.stdout.match(/ - block,/g)).toHaveLength(3);
});
