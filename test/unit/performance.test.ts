import { expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { generationInputMtime } from '../helpers/generationInputs.js';

import { Language, Parser } from '@willbooster/web-tree-sitter';

const Root = path.join(import.meta.dirname, '../..');
// The Wasm build is the one the package ships.
const WasmPath = path.join(Root, 'tree-sitter-c.wasm');
await Parser.init();
const parser = new Parser();
parser.setLanguage(await Language.load(WasmPath));

// The tests load the existing Wasm build, so a check against a stale one would miss an edit that restores the slowdown.
test('uses a Wasm build built from the current parser', () => {
  const sources = [
    'grammar.js',
    'src/parser.c',
    'src/scanner.c',
    'src/tree_sitter/parser.h',
    'src/pragma.h',
    'src/identifier.h',
    'src/keywords.h',
    'src/functionMacro.h',
    'src/conditionalMacro.h',
  ].map((name) => fs.statSync(path.join(Root, name)).mtimeMs);
  expect(
    Math.max(generationInputMtime(Root), ...sources) > fs.statSync(WasmPath).mtimeMs,
    'generation inputs or src/ changed after the Wasm build was built; run `bun run build/ci`'
  ).toBe(false);
});

test('keeps nested ordinary calls approximately linear', { timeout: 60_000 }, () => {
  const small = nestedCallSource(200);
  const large = nestedCallSource(2000);
  parseAverageCpuTime(large);
  let smallFastest = Infinity;
  let largeFastest = Infinity;
  for (let run = 0; run < 5; run++) {
    smallFastest = Math.min(smallFastest, parseAverageCpuTime(small));
    largeFastest = Math.min(largeFastest, parseAverageCpuTime(large));
  }
  expect(largeFastest / smallFastest).toBeLessThan(18);
});

test.each(['leading', 'post-type', 'trailing', 'object'])(
  'keeps flat %s annotation chains approximately linear',
  { timeout: 60_000 },
  (placement) => {
    const source = (count: number): string => {
      const attributes = Array.from({ length: count }, (_, index) => `A${index}(1)`).join(' ');
      if (placement === 'leading') return `extern ${attributes} int f(void);`;
      if (placement === 'post-type') return `int ${attributes} f(void);`;
      return placement === 'object' ? `int value ${attributes};` : `int f(void) ${attributes};`;
    };
    const small = source(100);
    const large = source(1000);
    const expectedError = placement === 'trailing';
    parseAverageCpuTime(large, expectedError);
    let smallFastest = Infinity;
    let largeFastest = Infinity;
    for (let run = 0; run < 5; run++) {
      smallFastest = Math.min(smallFastest, parseAverageCpuTime(small, expectedError));
      largeFastest = Math.min(largeFastest, parseAverageCpuTime(large, expectedError));
    }
    expect(largeFastest / smallFastest).toBeLessThan(18);
  }
);

// Use thread CPU time: wall time includes competing tests, while process CPU time includes the engine's background
// Wasm compilation and garbage collection. A tenfold input takes about 10x locally; 18 leaves a margin while excluding
// growth faster than roughly n^1.25, without depending on a machine's absolute speed.
test('recovers from an error on each line in linear time', { timeout: 60_000 }, () => {
  const small = '$ a\n'.repeat(2000);
  const large = '$ a\n'.repeat(20_000);
  parseCpuTime(large);
  parseCpuTime(large);
  let smallFastest = Infinity;
  let largeFastest = Infinity;
  for (let run = 0; run < 5; run++) {
    smallFastest = Math.min(smallFastest, parseCpuTime(small));
    largeFastest = Math.min(largeFastest, parseCpuTime(large));
  }
  expect(largeFastest / smallFastest).toBeLessThan(18);
});

test('keeps attributed switch statement parsing approximately linear', { timeout: 60_000 }, () => {
  const small = attributedSwitchSource(200);
  const large = attributedSwitchSource(1000);
  parseCpuTime(large, false);
  let smallFastest = Infinity;
  let largeFastest = Infinity;
  for (let run = 0; run < 5; run++) {
    smallFastest = Math.min(smallFastest, parseCpuTime(small, false));
    largeFastest = Math.min(largeFastest, parseCpuTime(large, false));
  }
  expect(largeFastest / smallFastest).toBeLessThan(10);
});

test.each([
  ['ordinary declarations', 'int x[2] ', ';'],
  ['field declarations', 'struct T { int x[2] ', '; };'],
  ['typedef declarations', 'typedef int X[2] ', ';'],
])(
  'keeps consecutive declarator attributes approximately linear in %s',
  { timeout: 60_000 },
  (_name, prefix, suffix) => {
    const small = `${prefix}${'[[a]] '.repeat(200)}${suffix}`;
    const large = `${prefix}${'[[a]] '.repeat(1000)}${suffix}`;
    parseAverageCpuTime(large);
    let smallFastest = Infinity;
    let largeFastest = Infinity;
    for (let run = 0; run < 5; run++) {
      smallFastest = Math.min(smallFastest, parseAverageCpuTime(small));
      largeFastest = Math.min(largeFastest, parseAverageCpuTime(large));
    }
    expect(largeFastest / smallFastest).toBeLessThan(10);
  }
);

test.each([
  'int\n',
  'int value ATTR(\n',
  'int *value ATTR(((\n',
  'int value ATTR((1)\n',
  'extern FOO("a" int f(void);\n',
  'extern FOO({ "a" int f(void);\n}\n',
  'extern FOO((struct T){ "a" int f(void);\n}\n',
  'extern FOO(({ int value; value;\n})\n',
  'extern FOO(({ int value; value;\n}\n',
  'const FOO(({ int value; value;\n})\n',
  '__declspec(dllexport) FOO(({ int value; value;\n})\n',
  'extern FOO(({}\n',
  'extern FOO({}\n',
  'extern FOO(,{}\n',
  'extern FOO((int){1}\n',
  'extern FOO((struct T){}\n',
  'extern FOO("a" int f(void)\n',
  'extern FOO(1) int f(void)\n',
  '#if FLAG\nextern FOO("a" int f(void)\n#endif\n',
])('keeps unbalanced annotation recovery approximately linear: %s', { timeout: 60_000 }, (line) => {
  const small = line.repeat(100);
  const large = line.repeat(1000);
  parseAverageCpuTime(large, true);
  let smallFastest = Infinity;
  let largeFastest = Infinity;
  for (let run = 0; run < 5; run++) {
    smallFastest = Math.min(smallFastest, parseAverageCpuTime(small, true));
    largeFastest = Math.min(largeFastest, parseAverageCpuTime(large, true));
  }
  expect(largeFastest / smallFastest).toBeLessThan(18);
});

function attributedSwitchSource(count: number): string {
  return `void f(int x){switch(x){${Array.from({ length: count }, (_, index) => `case ${index}: [[a]] x++; break;`).join('')}}}`;
}

function parseCpuTime(source: string, expectedError = true): number {
  const start = process.threadCpuUsage();
  const tree = parser.parse(source);
  const { system, user } = process.threadCpuUsage(start);
  if (!tree) throw new Error('The parser returned no tree');
  const { hasError } = tree.rootNode;
  tree.delete();
  expect(hasError).toBe(expectedError);
  return system + user;
}

// Linux CPU accounting can report zero for a short parse. Accumulate enough CPU time before normalizing per parse.
function parseAverageCpuTime(source: string, expectedError = false): number {
  const start = process.threadCpuUsage();
  let parses = 0;
  let elapsed = 0;
  do {
    const tree = parser.parse(source);
    if (!tree) throw new Error('The parser returned no tree');
    const { hasError } = tree.rootNode;
    tree.delete();
    expect(hasError).toBe(expectedError);
    parses++;
    const { system, user } = process.threadCpuUsage(start);
    elapsed = system + user;
  } while (elapsed < 20_000);
  return elapsed / parses;
}

function nestedCallSource(depth: number): string {
  return `int call(int); void run(void) { ${'call('.repeat(depth)}0${')'.repeat(depth)}; }`;
}
