import { expect } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

import { testCommand } from './run.js';

// `tree-sitter test` reads highlight tests only from test/highlight, where the repository layout allows no
// directory, so it runs on a grammar directory that links the grammar and test/fixtures/highlight instead.
const Root = path.join(import.meta.dir, '../..');
const GrammarDir = '.tmp/highlight-test';
fs.rmSync(path.join(Root, GrammarDir), { force: true, recursive: true });
fs.mkdirSync(path.join(Root, GrammarDir, 'test'), { recursive: true });
for (const name of ['grammar.js', 'tree-sitter.json', 'src', 'queries']) {
  fs.symlinkSync(path.join(Root, name), path.join(Root, GrammarDir, name));
}
fs.symlinkSync(path.join(Root, 'test/fixtures/highlight'), path.join(Root, GrammarDir, 'test/highlight'));

testCommand(
  'highlights test/fixtures/highlight as asserted',
  ['bun', 'run', 'tree-sitter', 'test', '--grammar-path', GrammarDir],
  300_000,
  // The CLI exits zero when it finds no highlight tests.
  { check: (output) => expect(output).toContain('syntax highlighting:') }
);
