import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from 'vitest';

const root = path.join(import.meta.dirname, '../..');

test('regenerates scanner tables without existing headers or a scanner', { timeout: 60_000 }, async () => {
  await mkdir(path.join(root, '.tmp'), { recursive: true });
  const directory = await mkdtemp(path.join(root, '.tmp/identifier-generation-test-'));
  try {
    await mkdir(path.join(directory, 'script'));
    await mkdir(path.join(directory, 'src/tree_sitter'), { recursive: true });
    for (const file of [
      'script/generateIdentifierRanges.js',
      'src/parser.c',
      'src/grammar.json',
      'src/grammarKeywords.cjs',
      'src/tree_sitter/parser.h',
    ]) {
      await cp(path.join(root, file), path.join(directory, file));
    }
    await writeFile(path.join(directory, 'package.json'), '{"type":"module"}');
    const headers = ['identifier.h', 'keywords.h'];
    const expected = await Promise.all(headers.map((header) => readFile(path.join(root, 'src', header), 'utf8')));
    for (const empty of [false, true]) {
      if (empty) {
        for (const header of headers) await writeFile(path.join(directory, 'src', header), '');
      }
      execFileSync(process.execPath, [path.join(directory, 'script/generateIdentifierRanges.js')]);
      expect(await Promise.all(headers.map((header) => readFile(path.join(directory, 'src', header), 'utf8')))).toEqual(
        expected
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
