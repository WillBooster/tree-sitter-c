import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { Language, Parser } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const fixture = 'test/fixtures/fieldMacros.h';
const source = fs.readFileSync(path.join(root, fixture), 'utf8');

test('keeps Wasm header declarations after semicolonless field macros', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(path.join(root, 'tree-sitter-c.wasm')));
  const tree = parser.parse(source)!;
  try {
    expect(
      tree.rootNode.descendantsOfType('struct_specifier').map((node) => node.childForFieldName('name')?.text)
    ).toEqual(['Item', 'Buffer', 'Other']);
    expect(tree.rootNode.descendantsOfType('type_definition').map((node) => node.text)).toEqual([
      'typedef struct Buffer {\n  char *data;\n  unsigned long size;\n} Buffer;',
      'typedef int File;',
    ]);
    const conditional = tree.rootNode.descendantsOfType('preproc_ifdef')[0]!;
    expect(conditional.text).toBe(source.trimEnd());
    expect(tree.rootNode.descendantsOfType('ERROR')).toHaveLength(0);
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('keeps native header declarations after semicolonless field macros', { timeout: 300_000 }, () => {
  const result = spawnSync(
    'script/tree-sitter',
    ['query', '--grammar-path', '.', '--captures', 'test/fixtures/fieldMacros.scm', fixture],
    {
      cwd: root,
      env: { ...process.env, TREE_SITTER_LIBDIR: path.join(root, '.tmp/field-macro-recovery-lib') },
      encoding: 'utf8',
      timeout: 300_000,
    }
  );
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain(' - structure, start: (2, 7), end: (2, 11)');
  expect(result.stdout).toContain(' - structure, start: (6, 15), end: (6, 21)');
  expect(result.stdout).toContain(' - structure, start: (12, 7), end: (12, 12)');
  expect(result.stdout).toContain(' - type, start: (9, 2), end: (9, 8)');
  expect(result.stdout).toContain(' - type, start: (10, 12), end: (10, 16)');
  expect(result.stdout).toContain(' - conditional, start: (0, 0), end: (13, 6)');
});
