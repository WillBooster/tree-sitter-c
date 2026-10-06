import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from 'vitest';

const root = path.join(import.meta.dirname, '../..');

test('regenerates identifier ranges without an existing header or scanner', async () => {
  await mkdir(path.join(root, '.tmp'), { recursive: true });
  const directory = await mkdtemp(path.join(root, '.tmp/identifier-generation-test-'));
  try {
    await mkdir(path.join(directory, 'script'));
    await mkdir(path.join(directory, 'src/tree_sitter'), { recursive: true });
    for (const file of ['script/generateIdentifierRanges.js', 'src/parser.c', 'src/tree_sitter/parser.h']) {
      await cp(path.join(root, file), path.join(directory, file));
    }
    await writeFile(path.join(directory, 'package.json'), '{"type":"module"}');
    const header = path.join(directory, 'src/identifier.h');
    const expected = await readFile(path.join(root, 'src/identifier.h'), 'utf8');
    for (const empty of [false, true]) {
      if (empty) await writeFile(header, '');
      execFileSync(process.execPath, [path.join(directory, 'script/generateIdentifierRanges.js')]);
      expect(await readFile(header, 'utf8')).toBe(expected);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
