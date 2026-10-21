import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { Language, Parser } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

const wasmPath = path.join(import.meta.dirname, '../../tree-sitter-c.wasm');

test('parses function-like declaration modifiers and retains following declarations', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(wasmPath));
  const source = fs.readFileSync(path.join(import.meta.dirname, '../fixtures/macroAttributes.c'), 'utf8');
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    const declarations = tree.rootNode.namedChildren.filter((node) => node.type === 'declaration');
    expect(declarations.map((node) => node.childForFieldName('type')?.text)).toEqual([
      'int',
      'int',
      'int',
      'result_t',
      'int',
      'int',
    ]);
    expect(
      declarations.map((node) => node.childForFieldName('declarator')?.childForFieldName('declarator')?.text)
    ).toEqual(['sprintf', 'vsprintf', 'snprintf', 'append', 'typed', 'empty_args']);
    const attributes = tree.rootNode.descendantsOfType('attribute_specifier');
    expect(attributes.map((node) => node.childForFieldName('name')?.text)).toEqual([
      '__printf',
      '__printf',
      '__printf',
      'DEPRECATED',
      'CHECK_TYPES',
      'EMPTY',
    ]);
    expect(attributes.map((node) => node.childForFieldName('arguments')?.text)).toEqual([
      '(2, 3)',
      '(2, 0)',
      '(3, 4)',
      '(7.56.0, "Use append")',
      '(int, int (*)(int), (1 + 2), "comma,inside", WRAP(1, 2))',
      '(, 1, ,)',
    ]);
    expect(tree.rootNode.descendantsOfType('type_definition').map((node) => node.text)).toEqual([
      'typedef size_t (*callback_t)(void *arg, const char *buf, size_t len);',
    ]);
    expect(tree.rootNode.descendantsOfType('function_definition').map((node) => node.text)).toEqual([
      'int following(void) { return 0; }',
    ]);
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('keeps macro type specifiers and ordinary calls distinct from declaration modifiers', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(wasmPath));
  const source = `TYPE(int) global;
struct Holder { TYPE(int) field; };
void consume(TYPE(int));
void run(int a, int b, int c, int d) {
  callback(1, 2);
  compare(a < b, c > d);
}`;
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(tree.rootNode.descendantsOfType('macro_type_specifier').map((node) => node.text)).toEqual([
      'TYPE(int)',
      'TYPE(int)',
    ]);
    expect(tree.rootNode.descendantsOfType('attribute_specifier')).toHaveLength(0);
    expect(tree.rootNode.descendantsOfType('call_expression').map((node) => node.text)).toEqual([
      'callback(1, 2)',
      'compare(a < b, c > d)',
    ]);
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('recognizes physical modifier calls across trivia while preserving identifier leaves and keyword operators', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(wasmPath));
  const source = String.raw`extern Δ /* metadata */ (1) int greek(void);
extern \u03B1 \
(2) int escaped(void);
extern ATTR // metadata
(3) int commented(void);
extern L(4) int large(void);
extern U(5) int wide(void);
extern u8(6) int utf8(void);
extern ATTR(7) int int𐐀(void);
extern ATTR(8) int α(void);
#undef L
#undef U
#undef u8
int L(int);
int U(int);
int u8(int);
int plain(int value) {
  return sizeof(int) + _Alignof(int) + callback(value) + L(value) + U(value) + u8(value);
}`;
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    const attributes = tree.rootNode.descendantsOfType('attribute_specifier');
    expect(attributes.map((node) => node.childForFieldName('name')?.text)).toEqual([
      'Δ',
      String.raw`\u03B1`,
      'ATTR',
      'L',
      'U',
      'u8',
      'ATTR',
      'ATTR',
    ]);
    expect(attributes.map((node) => node.childForFieldName('arguments')?.text)).toEqual([
      '(1)',
      '(2)',
      '(3)',
      '(4)',
      '(5)',
      '(6)',
      '(7)',
      '(8)',
    ]);
    expect(tree.rootNode.descendantsOfType('sizeof_expression').map((node) => node.text)).toEqual(['sizeof(int)']);
    expect(tree.rootNode.descendantsOfType('alignof_expression').map((node) => node.text)).toEqual(['_Alignof(int)']);
    expect(tree.rootNode.descendantsOfType('call_expression').map((node) => node.text)).toEqual([
      'callback(value)',
      'L(value)',
      'U(value)',
      'u8(value)',
    ]);
    const identifiers = tree.rootNode.descendantsOfType('identifier');
    expect(identifiers.filter((node) => node.text === 'callback')).toHaveLength(1);
    expect(identifiers.every((node) => node.childCount === 0)).toBe(true);
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('retains function boundaries after macro-generated case labels', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(wasmPath));
  const source = fs.readFileSync(path.join(import.meta.dirname, '../fixtures/statementMacroCases.c'), 'utf8');
  const tree = parser.parse(source)!;
  try {
    const functions = tree.rootNode.descendantsOfType('function_definition');
    expect(functions.map((node) => node.childForFieldName('declarator')?.text)).toEqual([
      'run(void)',
      'following(void)',
      'last(void)',
    ]);
    expect(functions.map((node) => [node.startPosition, node.endPosition])).toEqual([
      [
        { row: 1, column: 0 },
        { row: 11, column: 1 },
      ],
      [
        { row: 12, column: 0 },
        { row: 12, column: 31 },
      ],
      [
        { row: 13, column: 0 },
        { row: 13, column: 26 },
      ],
    ]);
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('balances physical annotation arguments and retains definitions with trailing attributes', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(wasmPath));
  const source = String.raw`extern META(')', "(", 1'000, (1 + (2)), WRAP(1, 2), /* ) */ 3) __attribute__((unused)) int guarded(void);
extern META(1, // ) \
continued comment
2) int commented(void);
extern META("escaped \" )", '\\', \
3) int spliced(void);
#define UNUSED __attribute__((unused))
typedef struct Context Context;
static inline void discard(Context *context UNUSED) __attribute__((unused)) {}
int following(void) { return 0; }
`;
  const tree = parser.parse(source)!;
  try {
    const modifiers = tree.rootNode
      .descendantsOfType('attribute_specifier')
      .filter((node) => node.childForFieldName('name'));
    expect(modifiers.map((node) => node.childForFieldName('name')?.text)).toEqual(['META', 'META', 'META']);
    expect(
      tree.rootNode.descendantsOfType('function_definition').map((node) => node.childForFieldName('declarator')?.text)
    ).toEqual(['discard(Context *context UNUSED) __attribute__((unused))', 'following(void)']);
    expect(
      tree.rootNode
        .descendantsOfType('declaration')
        .slice(0, 3)
        .map((node) => node.childForFieldName('declarator')?.childForFieldName('declarator')?.text)
    ).toEqual(['guarded', 'commented', 'spliced']);
    expect(tree.rootNode.descendantsOfType('ERROR').map((node) => node.text)).toEqual(['UNUSED']);
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('retains function and asm declaration boundaries with trailing attribute groups', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(wasmPath));
  const source = fs.readFileSync(path.join(import.meta.dirname, '../fixtures/macroTrailingAttributes.c'), 'utf8');
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.descendantsOfType('function_definition').map((node) => node.text)).toEqual([
      'static inline void gnu(Context *p UNUSED) __attribute__((unused)) {}',
      'static inline void short_gnu(Context *p UNUSED) __attribute((unused)) {}',
      'static inline void macro(Context *p UNUSED) OTHER_ATTR(1, "(") {}',
      'static inline void standard(Context *p UNUSED) [[]] {}',
      'static inline __declspec(noinline) void microsoft(Context *p UNUSED) {}',
      'int following(void) { return 0; }',
    ]);
    expect(tree.rootNode.descendantsOfType('declaration').map((node) => node.text)).toContain(
      'int assembler(Context *p UNUSED) __asm__("assembler");'
    );
    expect(tree.rootNode.descendantsOfType('ERROR').map((node) => node.text)).toEqual(
      Array.from({ length: 6 }, () => 'p')
    );
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('retains following definitions after standalone macro-generated functions', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(wasmPath));
  const source = fs.readFileSync(path.join(import.meta.dirname, '../fixtures/macroGeneratedFunctions.c'), 'utf8');
  const tree = parser.parse(source)!;
  try {
    expect(
      tree.rootNode.descendantsOfType('function_definition').map((node) => node.childForFieldName('declarator')?.text)
    ).toEqual(['following(void)', 'enabled(void)', '*pointer(void)', 'last(void)']);
    expect(tree.rootNode.descendantsOfType('function_definition').at(-1)?.text).toBe(
      'int last(void) { return enabled(); }'
    );
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('keeps native modifier captures and following function ranges', { timeout: 300_000 }, () => {
  const root = path.join(import.meta.dirname, '../..');
  fs.mkdirSync(path.join(root, '.tmp'), { recursive: true });
  const libraryDirectory = fs.mkdtempSync(path.join(root, '.tmp/macro-modifier-native-'));
  try {
    const result = spawnSync(
      'script/tree-sitter',
      [
        'query',
        '--grammar-path',
        '.',
        '--captures',
        'test/fixtures/macroAttributes.scm',
        'test/fixtures/macroAttributes.c',
        'test/fixtures/statementMacroCases.c',
        'test/fixtures/macroParameterDefinition.c',
      ],
      {
        cwd: root,
        env: { ...process.env, TREE_SITTER_LIBDIR: libraryDirectory },
        encoding: 'utf8',
        timeout: 300_000,
      }
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    const captures = [...result.stdout.matchAll(/ - (\w+),[^\n]*text: `([^`]*)`/g)];
    const capturedText = (name: string): (string | undefined)[] =>
      captures.filter((match) => match[1] === name).map((match) => match[2]);
    expect(capturedText('modifier')).toEqual([
      '__printf',
      '__printf',
      '__printf',
      'DEPRECATED',
      'CHECK_TYPES',
      'EMPTY',
    ]);
    expect(capturedText('prototype')).toEqual(['sprintf', 'vsprintf', 'snprintf', 'append', 'typed', 'empty_args']);
    expect(capturedText('functionName')).toEqual(['following', 'run', 'following', 'last', 'discard', 'following']);
    expect(result.stdout).toContain(' - function, start: (1, 0), end: (11, 1)');
    expect(result.stdout).toContain(' - function, start: (12, 0), end: (12, 31)');
    expect(result.stdout).toContain(' - function, start: (13, 0), end: (13, 26)');
    expect(result.stdout).toContain(' - function, start: (2, 0), end: (2, 54)');
  } finally {
    fs.rmSync(libraryDirectory, { recursive: true, force: true });
  }
});

test('retains definitions with opaque parameter annotations', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(wasmPath));
  const source = fs.readFileSync(path.join(import.meta.dirname, '../fixtures/macroParameterDefinition.c'), 'utf8');
  const tree = parser.parse(source)!;
  try {
    const definitions = tree.rootNode.descendantsOfType('function_definition');
    expect(definitions.map((node) => node.childForFieldName('declarator')?.text)).toEqual([
      'discard(Context *context UNUSED)',
      'following(void)',
    ]);
    expect(definitions.map((node) => node.text)).toEqual([
      'static inline void discard(Context *context UNUSED) {}',
      'int following(void) { return 0; }',
    ]);
  } finally {
    tree.delete();
    parser.delete();
  }
});
