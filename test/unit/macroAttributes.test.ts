import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { Edit, Language, Parser, Query } from '@willbooster/web-tree-sitter';
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
extern TYPE(struct { int member; }) braced_type;
TYPE(struct { int member; }) definition(void) { for (;;) {} }
extern TYPE(struct { int member; })
#ifdef FLAG
MARK
#endif
conditional(void) { for (;;) {} }
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
      'TYPE(struct { int member; })',
      'TYPE(struct { int member; })',
      'TYPE(struct { int member; })',
    ]);
    expect(tree.rootNode.descendantsOfType('attribute_specifier')).toHaveLength(0);
    expect(
      tree.rootNode.descendantsOfType('function_definition').map((node) => node.childForFieldName('declarator')?.text)
    ).toEqual(['definition(void)', 'conditional(void)', 'run(int a, int b, int c, int d)']);
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
static inline void discard(Context *UNUSED context) __attribute__((unused)) {}
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
    ).toEqual(['discard(Context *UNUSED context) __attribute__((unused))', 'following(void)']);
    expect(
      tree.rootNode
        .descendantsOfType('declaration')
        .slice(0, 3)
        .map((node) => node.childForFieldName('declarator')?.childForFieldName('declarator')?.text)
    ).toEqual(['guarded', 'commented', 'spliced']);
    expect(tree.rootNode.hasError).toBe(false);
    const pointer = tree.rootNode.descendantsOfType('pointer_declarator')[0]!;
    expect(pointer.childForFieldName('declarator')?.text).toBe('context');
    expect(pointer.descendantsOfType('macro_specifier').map((node) => node.text)).toEqual(['UNUSED']);
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
      'static inline void gnu(Context *UNUSED p) __attribute__((unused)) {}',
      'static inline void short_gnu(Context *UNUSED p) __attribute((unused)) {}',
      'static inline void macro(Context *UNUSED p) OTHER_ATTR(1, "(") {}',
      'static inline void standard(Context *UNUSED p) [[]] {}',
      'static inline __declspec(noinline) void microsoft(Context *UNUSED p) {}',
      'int following(void) { return 0; }',
    ]);
    expect(tree.rootNode.descendantsOfType('declaration').map((node) => node.text)).toContain(
      'int assembler(Context *UNUSED p) __asm__("assembler");'
    );
    expect(tree.rootNode.descendantsOfType('ERROR')).toHaveLength(0);
    const pointers = tree.rootNode.descendantsOfType('pointer_declarator');
    expect(pointers.map((node) => node.childForFieldName('declarator')?.text)).toEqual(
      Array.from({ length: 6 }, () => 'p')
    );
    expect(pointers.flatMap((node) => node.descendantsOfType('macro_specifier').map((marker) => marker.text))).toEqual(
      Array.from({ length: 6 }, () => 'UNUSED')
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

test('keeps conditional statement fragments and nested annotated prototypes', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(wasmPath));
  const source = `#if A
x + 1;
foo(a) + bar;
#if B
extern ATTR(1) int nested(void);
#endif
#endif
int g(void);
`;
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(tree.rootNode.descendantsOfType('expression_statement').map((node) => node.text)).toEqual([
      'x + 1;',
      'foo(a) + bar;',
    ]);
    expect(
      tree.rootNode.descendantsOfType('preproc_if').map((node) => [node.startPosition.row, node.endPosition.row])
    ).toEqual([
      [0, 6],
      [3, 5],
    ]);
    expect(
      tree.rootNode.descendantsOfType('attribute_specifier').map((node) => node.childForFieldName('name')?.text)
    ).toEqual(['ATTR']);
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('retains parenthesized prototype names and following definitions', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(wasmPath));
  const source = fs.readFileSync(path.join(import.meta.dirname, '../fixtures/macroAnnotationRecovery.c'), 'utf8');
  const tree = parser.parse(source)!;
  try {
    const attributes = tree.rootNode
      .descendantsOfType('attribute_specifier')
      .filter((node) => node.childForFieldName('name'));
    expect(attributes.map((node) => node.childForFieldName('name')?.text)).toEqual(['ATTR', 'ATTR', 'ATTR']);
    const declarations = tree.rootNode
      .descendantsOfType('declaration')
      .filter((node) =>
        node.descendantsOfType('attribute_specifier').some((attribute) => attribute.childForFieldName('name'))
      );
    expect(
      declarations.map((node) => node.childForFieldName('declarator')?.descendantsOfType('identifier')[0]?.text)
    ).toEqual(['parenthesized', 'factory', 'nested']);
    const names = tree.rootNode
      .descendantsOfType('function_declarator')
      .map((node) => node.childForFieldName('declarator'))
      .filter((node) => node?.type === 'identifier')
      .map((node) => node?.text);
    expect(names).toEqual(['factory', 'following']);
    expect(tree.rootNode.descendantsOfType('function_definition').map((node) => node.text)).toEqual([
      'int following(void) { return 0; }',
    ]);
  } finally {
    tree.delete();
    parser.delete();
  }
});

test.each(['1 + 2', 'VERSION + 1', '-1', '1 ? 2 : 3', '"a" "b"'])(
  'parses post-type annotation expression %s without losing following functions',
  async (argument) => {
    await Parser.init();
    const parser = new Parser().setLanguage(await Language.load(wasmPath));
    const source = `#define ATTR(x) __attribute__((unused))
int ATTR(${argument}) annotated(void);
int following(void) { return 0; }
`;
    const tree = parser.parse(source)!;
    try {
      expect(tree.rootNode.hasError).toBe(false);
      const attribute = tree.rootNode.descendantsOfType('attribute_specifier')[0];
      expect(attribute?.childForFieldName('name')?.text).toBe('ATTR');
      expect(attribute?.childForFieldName('arguments')?.text).toBe(`(${argument})`);
      expect(
        tree.rootNode.descendantsOfType('function_declarator').map((node) => node.childForFieldName('declarator')?.text)
      ).toEqual(['annotated', 'following']);
      expect(tree.rootNode.descendantsOfType('function_definition').map((node) => node.text)).toEqual([
        'int following(void) { return 0; }',
      ]);
    } finally {
      tree.delete();
      parser.delete();
    }
  }
);

test('keeps fresh declarations after standalone header annotations inside their guard', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(wasmPath));
  const source = `#ifndef HEADER_GUARD
#define HEADER_GUARD
BEGIN_HEADER
SCOPE_NOTE("old", version(10.0, 13.0))
extern void first(const T *arg);
int second(void);
END_HEADER
#endif
`;
  const tree = parser.parse(source)!;
  try {
    const guard = tree.rootNode.namedChildren[0];
    expect(guard?.type).toBe('preproc_ifdef');
    expect(guard?.text).toBe(source.trimEnd());
    expect(guard?.descendantsOfType('declaration').map((node) => node.text)).toEqual([
      'extern void first(const T *arg);',
      'int second(void);',
    ]);
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('retains declarations after annotated tag definitions', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(wasmPath));
  const source = 'enum Kind { A, B } NOTE("old", version(10.0, 10.8)) UNAVAILABLE(platform);\nint after(void);\n';
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.namedChildren.at(-1)?.text).toBe('int after(void);');
    expect(tree.rootNode.namedChildren.at(-1)?.type).toBe('declaration');
    expect(tree.rootNode.descendantsOfType('enum_specifier')[0]?.text).toBe('enum Kind { A, B }');
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('retains both functions around an opaque statement macro with a named type argument', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(wasmPath));
  const source = `int first(void) {
  STATEMENT(a, (unsigned int flags))
  return 0;
}
int after(void) { return 1; }
`;
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.descendantsOfType('function_definition').map((node) => node.text)).toEqual([
      source.slice(0, source.indexOf('int after')).trimEnd(),
      'int after(void) { return 1; }',
    ]);
  } finally {
    tree.delete();
    parser.delete();
  }
});

test.each([
  ['void g_foo(void) DEPRECATED_FOR(g_bar);', 'g_foo'],
  ['int second(Arg) THROWS(Exception);', 'second'],
  ['void third(int, const char *, ...) PRINTF(1, 2);', 'third'],
  ['int fourth(void) ATTR_ZERO();', 'fourth'],
  ['extern ATTR(1) void lead(void) DEPRECATED_FOR(target);', 'lead'],
  ['extern ATTR(1) int declared(Arg) THROWS(Exception);', 'declared'],
  ['int ATTR(2) applied(Arg) THROWS(Exception);', 'applied'],
])('retains the real prototype name in %s', async (prototype, name) => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(wasmPath));
  const source = `typedef int Arg;\n${prototype}\n`;
  const tree = parser.parse(source)!;
  try {
    const names = tree.rootNode
      .descendantsOfType('function_declarator')
      .map((node) => node.childForFieldName('declarator')?.text);
    expect(names).toContain(name);
    expect(
      tree.rootNode
        .descendantsOfType('attribute_specifier')
        .filter((node) => node.childForFieldName('name')?.text === name)
    ).toHaveLength(0);
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('accepts escaped prototype names and return-type tags', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(wasmPath));
  const source = fs.readFileSync(path.join(import.meta.dirname, '../fixtures/macroAnnotationEscapedNames.c'), 'utf8');
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(
      tree.rootNode.descendantsOfType('attribute_specifier').map((node) => node.childForFieldName('name')?.text)
    ).toEqual(['ATTR', 'ATTR', 'ATTR']);
    expect(tree.rootNode.descendantsOfType('function_definition').map((node) => node.text)).toEqual([
      'int following(void) { return 0; }',
    ]);
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('retains structured exception statements inside conditional fragments', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(wasmPath));
  const source = '#if X\n__try { f(); __leave; } __except(1) { }\n#endif\n';
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(tree.rootNode.descendantsOfType('seh_try_statement')).toHaveLength(1);
    expect(tree.rootNode.descendantsOfType('seh_leave_statement')).toHaveLength(1);
    expect(tree.rootNode.namedChildren[0]?.text).toBe(source.trim());
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('ends macro include paths before following calls', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(wasmPath));
  const source = `#include CONFIG_H
MODULE_LICENSE("GPL");
#include OTHER_H
foo(1);
int last(void) { return 0; }
`;
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(tree.rootNode.descendantsOfType('preproc_include').map((node) => node.text)).toEqual([
      '#include CONFIG_H\n',
      '#include OTHER_H\n',
    ]);
    expect(tree.rootNode.descendantsOfType('expression_statement').map((node) => node.text)).toEqual([
      'MODULE_LICENSE("GPL");',
      'foo(1);',
    ]);
    expect(tree.rootNode.descendantsOfType('function_definition').map((node) => node.text)).toEqual([
      'int last(void) { return 0; }',
    ]);
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
        'test/fixtures/bracedMacroAttributes.c',
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
      ...Array.from({ length: 10 }, () => 'ANNOTATE'),
    ]);
    expect(capturedText('prototype')).toEqual([
      'sprintf',
      'vsprintf',
      'snprintf',
      'append',
      'typed',
      'empty_args',
      'array_argument',
      'aggregate_argument',
      'post_type',
      'nested_argument',
      'statement_argument',
      'inline_type',
      'chained',
      'repeated',
    ]);
    expect(capturedText('functionName')).toEqual([
      'following',
      'run',
      'following',
      'last',
      'discard',
      'following',
      'following',
    ]);
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

test.each(['static TYPE(int) name(void);', 'extern TYPE(foo_t) make(int);'])(
  'preserves macro-type prototypes and following definitions: %s',
  async (declaration) => {
    await Parser.init();
    const parser = new Parser().setLanguage(await Language.load(wasmPath));
    const source = `${declaration}\nint following(void) { return 0; }\n`;
    const tree = parser.parse(source)!;
    try {
      expect(tree.rootNode.hasError).toBe(false);
      expect(tree.rootNode.namedChildren[0]!.type).toBe('declaration');
      expect(tree.rootNode.descendantsOfType('macro_type_specifier').map((node) => node.text)).toEqual([
        declaration.includes('foo_t') ? 'TYPE(foo_t)' : 'TYPE(int)',
      ]);
      expect(tree.rootNode.descendantsOfType('attribute_specifier')).toHaveLength(0);
      expect(tree.rootNode.descendantsOfType('function_definition').map((node) => node.text)).toEqual([
        'int following(void) { return 0; }',
      ]);
    } finally {
      tree.delete();
      parser.delete();
    }
  }
);

test('preserves pragma operators before and among function annotations', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(wasmPath));
  const source = `extern _Pragma("GCC diagnostic push") int before(void);
extern _Pragma /* gap */ ( "GCC diagnostic push" ) int trivia(void);
extern ATTR(1) _Pragma("GCC diagnostic push") int after_annotation(void);
extern int _Pragma("GCC diagnostic push") after_type(void);
extern int ATTR(1) _Pragma("GCC diagnostic push") after_both(void);
extern _PragmaName(1) int prefix_name(void);
int following(void) { return 0; }
`;
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(
      tree.rootNode.descendantsOfType('declaration').map((node) => node.childForFieldName('declarator')?.text)
    ).toEqual([
      'before(void)',
      'trivia(void)',
      'after_annotation(void)',
      'after_type(void)',
      'after_both(void)',
      'prefix_name(void)',
    ]);
    expect(tree.rootNode.descendantsOfType('pragma_operator')).toHaveLength(5);
    expect(tree.rootNode.descendantsOfType('pragma_operator')[1]!.text).toBe(
      '_Pragma /* gap */ ( "GCC diagnostic push" )'
    );
    expect(
      tree.rootNode.descendantsOfType('attribute_specifier').map((node) => node.childForFieldName('name')?.text)
    ).toEqual(['ATTR', 'ATTR', '_PragmaName']);
    expect(tree.rootNode.descendantsOfType('function_definition').map((node) => node.text)).toEqual([
      'int following(void) { return 0; }',
    ]);
  } finally {
    tree.delete();
    parser.delete();
  }
});

test.each([
  'static inline FOO("x") unsigned long f(void) BAR(1);',
  'static FOO("x") unsigned long const f(void) BAR(1);',
  '__declspec(dllexport) FOO("x") int const f(void) FOO(1);',
])('preserves annotated prototypes and following definitions with trailing macros: %s', async (declaration) => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(wasmPath));
  const tree = parser.parse(`${declaration}\nint after(void) { return 1; }\n`)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(
      tree.rootNode.descendantsOfType('function_declarator').map((node) => node.childForFieldName('declarator')?.text)
    ).toEqual(['f', 'after']);
    expect(tree.rootNode.descendantsOfType('function_definition').map((node) => node.text)).toEqual([
      'int after(void) { return 1; }',
    ]);
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('preserves function-pointer returns, supported trailing attributes, pragmas, and quoted semicolons', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(wasmPath));
  const source = `extern CHECK("x") int (*factory(void))(int);
extern int CHECK(1) (*post_factory(void))(int);
extern int CHECK(1) const qualified(void);
extern CHECK("x") int with_asm(void) __asm__("symbol");
extern CHECK("x") int with_attribute(void) __attribute__((const));
extern CHECK("x") int with_pragma(void) _Pragma("GCC diagnostic push");
extern CHECK("a;b", ';') int quoted_argument(void);
int following(void) { return 0; }
`;
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(tree.rootNode.descendantsOfType('declaration')).toHaveLength(7);
    expect(tree.rootNode.descendantsOfType('pragma_operator')).toHaveLength(1);
    expect(tree.rootNode.descendantsOfType('function_definition').at(-1)?.text).toBe(
      'int following(void) { return 0; }'
    );
    expect(tree.rootNode.descendantsOfType('argument_list').map((node) => node.text)).toContain(`("a;b", ';')`);
  } finally {
    tree.delete();
    parser.delete();
  }
});

test.each([
  'extern Result *lookup(void);',
  'static Result lookup(void);',
  'inline Result lookup(void);',
  'Result *lookup(void);',
  'Result lookup(void);',
])('parses alias-return prototypes and reparses edits after standalone annotations: %s', async (prototype) => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(wasmPath));
  const source = `${prototype}\nint following(void) { return 0; }\n`;
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    const declaration = tree.rootNode.descendantsOfType('declaration').find((node) => node.text === prototype);
    expect(declaration?.childForFieldName('type')?.text).toBe('Result');
    expect(
      tree.rootNode.descendantsOfType('function_declarator').map((node) => node.childForFieldName('declarator')?.text)
    ).toEqual(['lookup', 'following']);
    const prefix = 'BEGIN\nATTR("x")\n';
    tree.edit(
      new Edit({
        startIndex: 0,
        oldEndIndex: 0,
        newEndIndex: prefix.length,
        startPosition: { row: 0, column: 0 },
        oldEndPosition: { row: 0, column: 0 },
        newEndPosition: { row: 2, column: 0 },
      })
    );
    const edited = prefix + source;
    const incremental = parser.parse(edited, tree)!;
    const fresh = parser.parse(edited)!;
    try {
      expect(fresh.rootNode.hasError).toBe(true);
      expect(incremental.rootNode.toString()).toBe(fresh.rootNode.toString());
      expect(incremental.rootNode.endIndex).toBe(edited.length);
    } finally {
      incremental.delete();
      fresh.delete();
    }
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('preserves brace-free expression and type arguments with quoted braces and semicolons', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(wasmPath));
  const argumentsAndNames = [
    ['WRAP(1, 2)', 'call_argument'],
    ['int (*)(register int)', 'function_type'],
    ['const int *', 'qualified_type'],
    ['int[2]', 'array_type'],
    [`"a;b", ';', "{value} #if", '{', '}', '#'`, 'quoted_argument'],
  ];
  const source = `${argumentsAndNames.map(([argument, name]) => `extern CHECK(${argument}) int ${name}(void);`).join('\n')}
int following(void) { return 0; }
`;
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(tree.rootNode.descendantsOfType('attribute_specifier').map((node) => node.text)).toEqual(
      argumentsAndNames.map(([argument]) => `CHECK(${argument})`)
    );
    expect(tree.rootNode.namedChildren.filter((node) => node.type === 'declaration').map((node) => node.text)).toEqual(
      argumentsAndNames.map(([argument, name]) => `extern CHECK(${argument}) int ${name}(void);`)
    );
    expect(tree.rootNode.descendantsOfType('function_definition').at(-1)?.text).toBe(
      'int following(void) { return 0; }'
    );
  } finally {
    tree.delete();
    parser.delete();
  }
});

const bracedAnnotationArguments = [
  '({ int value = 1; value; })',
  '({ extern int shared; shared; })',
  '({ typedef int Word; Word value = 1; value; })',
  '(/* trivia */ { for (int index = 0; index < 2; index++) {} 1; })',
  'struct Inline { int member; }',
  'struct __attribute__((packed)) Packed { int member; }',
  'union Choice { int member; }',
  'struct __attribute__((aligned(sizeof(struct Inner { int x; })))) Outer { int y; }',
  '(struct Value){ .member = ({ int value = 1; value; }) }',
  '(struct { int member; }){ .member = 1 }',
  '(struct Value){ .member = 1 }',
  '(static int){1}',
  'struct Empty {}',
  'enum Kind { KIND_ONE }',
  'CALL({1, 2})',
  'CALL /* trivia */ ({1, 2})',
];

test.each(bracedAnnotationArguments)(
  'parses braced annotation arguments and retains following declarations: %s',
  async (argument) => {
    await Parser.init();
    const language = await Language.load(wasmPath);
    const parser = new Parser().setLanguage(language);
    const query = new Query(
      language,
      `
(type_definition type: (_) @typedef.type declarator: (_) @typedef.name)
(struct_specifier name: (_) @struct.name)
(field_declaration type: (_) @field.type declarator: (_) @field.name)
(declaration type: (_) @prototype.type declarator: (function_declarator declarator: (_) @prototype.name))
(function_definition type: (_) @function.type declarator: (function_declarator declarator: (_) @function.name))
`
    );
    const trailer = `typedef int saved_t;
struct Saved { saved_t field; };
saved_t declared(void);
saved_t after(void) { return 0; }
`;
    const prefix = `extern CHECK(${argument}) int annotated(void);\n`;
    const source = prefix + trailer;
    const control = parser.parse(trailer)!;
    const tree = parser.parse(source)!;
    const captures = (root: typeof tree.rootNode, offset: number): Array<[string, string, number, number]> =>
      query
        .captures(root)
        .filter(({ node }) => node.startIndex >= offset)
        .map<[string, string, number, number]>(({ name, node }) => [
          name,
          node.text,
          node.startIndex - offset,
          node.endIndex - offset,
        ]);
    try {
      expect(tree.rootNode.hasError).toBe(false);
      const attribute = tree.rootNode
        .descendantsOfType('attribute_specifier')
        .find((node) => node.childForFieldName('name')?.text === 'CHECK');
      expect([attribute?.text, attribute?.startIndex, attribute?.endIndex]).toEqual([
        `CHECK(${argument})`,
        'extern '.length,
        'extern '.length + `CHECK(${argument})`.length,
      ]);
      expect(attribute?.childForFieldName('arguments')?.text).toBe(`(${argument})`);
      const expected = captures(control.rootNode, 0);
      expect(expected.map(([name, text]) => [name, text])).toEqual([
        ['typedef.type', 'int'],
        ['typedef.name', 'saved_t'],
        ['struct.name', 'Saved'],
        ['field.type', 'saved_t'],
        ['field.name', 'field'],
        ['prototype.type', 'saved_t'],
        ['prototype.name', 'declared'],
        ['function.type', 'saved_t'],
        ['function.name', 'after'],
      ]);
      expect(captures(tree.rootNode, prefix.length)).toEqual(expected);
      const at = source.indexOf('{');
      const text = '/* edit */';
      const editedSource = source.slice(0, at) + text + source.slice(at);
      const editedTree = tree.copy();
      editedTree.edit(
        new Edit({
          startIndex: at,
          oldEndIndex: at,
          newEndIndex: at + text.length,
          startPosition: { row: 0, column: at },
          oldEndPosition: { row: 0, column: at },
          newEndPosition: { row: 0, column: at + text.length },
        })
      );
      const incremental = parser.parse(editedSource, editedTree)!;
      const fresh = parser.parse(editedSource)!;
      try {
        expect(incremental.rootNode.toString()).toBe(fresh.rootNode.toString());
        expect(captures(incremental.rootNode, prefix.length + text.length)).toEqual(expected);
        expect(captures(fresh.rootNode, prefix.length + text.length)).toEqual(expected);
        incremental.edit(
          new Edit({
            startIndex: at,
            oldEndIndex: at + text.length,
            newEndIndex: at,
            startPosition: { row: 0, column: at },
            oldEndPosition: { row: 0, column: at + text.length },
            newEndPosition: { row: 0, column: at },
          })
        );
        const undone = parser.parse(source, incremental)!;
        try {
          expect(undone.rootNode.toString()).toBe(tree.rootNode.toString());
          expect(captures(undone.rootNode, prefix.length)).toEqual(expected);
        } finally {
          undone.delete();
        }
      } finally {
        editedTree.delete();
        incremental.delete();
        fresh.delete();
      }
    } finally {
      query.delete();
      control.delete();
      tree.delete();
      parser.delete();
    }
  }
);

test('preserves ordinary compound literals and braced macro initializers', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(wasmPath));
  const source = `#define PACK(...) __VA_ARGS__
struct Pair { int left; int right; };
static struct Pair pair = (struct Pair){1, 2};
int values[] = PACK({3, 4});
int use(void) { return ((struct Pair){5, 6}).left + values[0] + pair.right; }
void empty(void) { (void)({}); }
`;
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(tree.rootNode.descendantsOfType('compound_literal_expression').map((node) => node.text)).toEqual([
      '(struct Pair){1, 2}',
      '(struct Pair){5, 6}',
    ]);
    expect(tree.rootNode.descendantsOfType('call_expression').map((node) => node.text)).toEqual(['PACK({3, 4})']);
    expect(tree.rootNode.descendantsOfType('function_definition').map((node) => node.text)).toEqual([
      'int use(void) { return ((struct Pair){5, 6}).left + values[0] + pair.right; }',
      'void empty(void) { (void)({}); }',
    ]);
    expect(
      tree.rootNode.namedChildren
        .filter((node) => node.type === 'declaration')
        .map((node) => node.childForFieldName('type')?.text)
    ).toEqual(['struct Pair', 'int']);
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('parses braced annotation arguments with public fields and declaration boundaries', async () => {
  await Parser.init();
  const language = await Language.load(wasmPath);
  const parser = new Parser().setLanguage(language);
  const source = fs.readFileSync(path.join(import.meta.dirname, '../fixtures/bracedMacroAttributes.c'), 'utf8');
  const tree = parser.parse(source)!;
  const tags = new Query(language, fs.readFileSync(path.join(import.meta.dirname, '../../queries/tags.scm'), 'utf8'));
  try {
    expect(tree.rootNode.hasError).toBe(false);
    const declarations = tree.rootNode.namedChildren.filter((node) => node.type === 'declaration');
    expect(
      declarations.map((node) => [node.childForFieldName('type')?.text, node.childForFieldName('declarator')?.text])
    ).toEqual([
      ['int', 'array_argument(void)'],
      ['int', 'aggregate_argument(void)'],
      ['int', 'post_type(void)'],
      ['int', 'nested_argument(void)'],
      ['int', 'statement_argument(void)'],
      ['int', 'inline_type(void)'],
      ['int', 'chained(void)'],
      ['int', 'repeated(void)'],
    ]);
    const attributes = tree.rootNode
      .descendantsOfType('attribute_specifier')
      .filter((node) => node.childForFieldName('name')?.text === 'ANNOTATE');
    expect(attributes.map((node) => node.childForFieldName('arguments')?.text)).toEqual([
      '((int[]){1, 2})',
      '((struct Pair){.left = 1, .right = 2})',
      '((Word){1})',
      '(WRAP((int[]){1, 2}), "};#")',
      '(({ int value = 1; value; }))',
      '(struct Inline { int member; })',
      '(1)',
      '((int[]){1, 2})',
      '((int[]){1, 2})',
      '((struct Pair){1, 2})',
    ]);
    for (const attribute of attributes) {
      expect(attribute.text).toBe(source.slice(attribute.startIndex, attribute.endIndex));
      expect(attribute.childForFieldName('name')?.type).toBe('identifier');
      expect(attribute.childForFieldName('arguments')?.type).toBe('argument_list');
    }
    expect(
      tags
        .captures(tree.rootNode)
        .filter(({ name }) => name === 'definition.function')
        .map(({ node }) => node.text)
    ).toEqual([
      'array_argument(void)',
      'aggregate_argument(void)',
      'post_type(void)',
      'nested_argument(void)',
      'statement_argument(void)',
      'inline_type(void)',
      'chained(void)',
      'repeated(void)',
      'following(void)',
    ]);
    expect(tree.rootNode.descendantsOfType('function_definition').map((node) => node.text)).toEqual([
      'int following(void) { return 0; }',
    ]);
  } finally {
    tags.delete();
    tree.delete();
    parser.delete();
  }
});
