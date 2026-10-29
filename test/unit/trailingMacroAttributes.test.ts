import fs from 'node:fs';
import path from 'node:path';

import { Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

const wasmPath = path.join(import.meta.dirname, '../../tree-sitter-c.wasm');

test.each([
  ['int *value', '(1)', '*value'],
  ['int value', '1', 'value'],
  ['int *deprecated_value', '"use replacement"', '*deprecated_value'],
  ...['R', 'LR', 'uR', 'UR', 'u8R'].flatMap((prefix) =>
    [prefix, prefix.split('').join('\\\n') + '\\\n'].map((encoding) => [
      'int *raw_value',
      `${encoding}"tag(a " (b) {c})tag"`,
      '*raw_value',
    ])
  ),
  ['int versioned', '7.56.0', 'versioned'],
  ['int empty_slots', ', 1, ,', 'empty_slots'],
  ['int fractional', '.5', 'fractional'],
])(
  'retains the declarator and following declarations after a trailing annotation: %s',
  async (prefix, argument, declarator) => {
    await Parser.init();
    const parser = new Parser().setLanguage(await Language.load(wasmPath));
    const source = `#define ATTR(...)\n${prefix} ATTR(${argument});\ntypedef void (*saved_t)(int);\nint after(void) { return 0; }\n`;
    const tree = parser.parse(source)!;
    try {
      expect(tree.rootNode.hasError).toBe(false);
      const declaration = tree.rootNode.descendantsOfType('declaration')[0]!;
      expect(declaration.childForFieldName('type')?.text).toBe('int');
      expect(declaration.childForFieldName('declarator')?.text).toBe(declarator);
      const attribute = declaration.descendantsOfType('attribute_specifier')[0]!;
      expect(attribute.childForFieldName('name')?.text).toBe('ATTR');
      expect(attribute.childForFieldName('name')?.childCount).toBe(0);
      expect(attribute.childForFieldName('arguments')?.text).toBe(`(${argument})`);
      expect(source.slice(attribute.startIndex, attribute.endIndex)).toBe(`ATTR(${argument})`);
      expect(tree.rootNode.descendantsOfType('type_definition').map((node) => node.text)).toEqual([
        'typedef void (*saved_t)(int);',
      ]);
      expect(tree.rootNode.descendantsOfType('function_definition').map((node) => node.text)).toEqual([
        'int after(void) { return 0; }',
      ]);
    } finally {
      tree.delete();
      parser.delete();
    }
  }
);

test('keeps ordinary function names and parameter types distinct from trailing annotations', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(wasmPath));
  const source = `typedef int options_t;
int *create(options_t *);
int *create_int(int);
int *create_void(void);
int *factory(int (*callback)(int));
int literal_type(typeof(R"(type)") value);
int run(int value) { return callback(value); }
`;
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(tree.rootNode.descendantsOfType('attribute_specifier')).toHaveLength(0);
    expect(
      tree.rootNode.descendantsOfType('function_declarator').map((node) => node.childForFieldName('declarator')?.text)
    ).toEqual(['create', 'create_int', 'create_void', 'factory', '(*callback)', 'literal_type', 'run']);
    expect(tree.rootNode.descendantsOfType('type_identifier').some((node) => node.text === 'options_t')).toBe(true);
    expect(tree.rootNode.descendantsOfType('call_expression').map((node) => node.text)).toEqual(['callback(value)']);
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('retains the complete definition when a trailing macro precedes its body', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(wasmPath));
  const source = `#define BARE
#define ATTR(...)
void *do_stuff(int arg1) BARE ATTR(1) { return 0; }
typedef int saved_t;
int after(void) { return 0; }
`;
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(tree.rootNode.descendantsOfType('function_definition').map((node) => node.text)).toEqual([
      'void *do_stuff(int arg1) BARE ATTR(1) { return 0; }',
      'int after(void) { return 0; }',
    ]);
    expect(tree.rootNode.descendantsOfType('type_definition').map((node) => node.text)).toEqual([
      'typedef int saved_t;',
    ]);
    const definition = tree.rootNode.descendantsOfType('function_definition')[0]!;
    expect(definition.descendantsOfType('parameter_declaration')[0]?.childForFieldName('declarator')?.text).toBe(
      'arg1'
    );
    expect(definition.childForFieldName('body')?.text).toBe('{ return 0; }');
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('keeps parameter-list wrappers available instead of treating them as trailing annotations', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(wasmPath));
  const source = fs.readFileSync(path.join(import.meta.dirname, '../fixtures/wrappedParameterMacros.c'), 'utf8');
  const tree = parser.parse(source)!;
  try {
    expect(
      tree.rootNode
        .descendantsOfType('attribute_specifier')
        .some((node) => node.childForFieldName('name')?.text === 'PARAMS')
    ).toBe(false);
    expect(
      tree.rootNode
        .descendantsOfType('type_definition')
        .some((node) => node.descendantsOfType('type_identifier').some((name) => name.text === 'saved_t'))
    ).toBe(true);
    expect(tree.rootNode.descendantsOfType('function_definition').map((node) => node.text)).toEqual([
      'int after(void) { return 0; }',
    ]);
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('retains the array name when an unsupported bare marker follows it', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(wasmPath));
  const source = '#define HIDDEN\nextern const char messages[] HIDDEN;\nint after(void) { return 0; }\n';
  const tree = parser.parse(source)!;
  try {
    const declaration = tree.rootNode.descendantsOfType('declaration')[0]!;
    expect(declaration.childForFieldName('declarator')?.text).toBe('messages[]');
    expect(declaration.descendantsOfType('array_declarator')[0]?.childForFieldName('declarator')?.text).toBe(
      'messages'
    );
    expect(tree.rootNode.descendantsOfType('function_definition').map((node) => node.text)).toEqual([
      'int after(void) { return 0; }',
    ]);
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('preserves annotation name ranges and following captures', async () => {
  await Parser.init();
  const language = await Language.load(wasmPath);
  const parser = new Parser().setLanguage(language);
  const query = new Query(
    language,
    `
    (attribute_specifier name: (identifier) @annotation arguments: (_) @arguments)
    (declaration type: (_) @type declarator: (_) @object)
    (type_definition declarator: (_) @typedef)
    (function_definition declarator: (_) @function)
  `
  );
  const source =
    'int /* type */ *value ATTR /* note */ ((1));\ntypedef void (*saved_t)(int);\nint after(void) { return 0; }\n';
  const tree = parser.parse(source)!;
  const captures = (root: typeof tree.rootNode): Array<[string, string, number, number]> =>
    query
      .captures(root)
      .map<[string, string, number, number]>(({ name, node }) => [name, node.text, node.startIndex, node.endIndex]);
  try {
    expect(tree.rootNode.hasError).toBe(false);
    const attribute = tree.rootNode.descendantsOfType('attribute_specifier')[0]!;
    const name = attribute.childForFieldName('name')!;
    expect(name.text).toBe('ATTR');
    expect(name.childCount).toBe(0);
    expect(source.slice(name.startIndex, name.endIndex)).toBe('ATTR');
    expect(captures(tree.rootNode).map(([kind, text]) => [kind, text])).toEqual([
      ['type', 'int'],
      ['object', '*value'],
      ['annotation', 'ATTR'],
      ['arguments', '((1))'],
      ['typedef', '(*saved_t)(int)'],
      ['function', 'after(void)'],
    ]);
  } finally {
    tree.delete();
    query.delete();
    parser.delete();
  }
});

test.each(['Δ', String.raw`\u03B1`])('keeps the physical annotation name as an identifier leaf: %s', async (name) => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(wasmPath));
  const source = `#define ${name}(...)\nint *value ${name}((1));\nint after(void) { return 0; }\n`;
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    const annotation = tree.rootNode.descendantsOfType('attribute_specifier')[0]!;
    const identifier = annotation.childForFieldName('name')!;
    expect(identifier.type).toBe('identifier');
    expect(identifier.childCount).toBe(0);
    expect(identifier.text).toBe(name);
    expect(source.slice(identifier.startIndex, identifier.endIndex)).toBe(name);
    expect(tree.rootNode.descendantsOfType('function_definition').map((node) => node.text)).toEqual([
      'int after(void) { return 0; }',
    ]);
  } finally {
    tree.delete();
    parser.delete();
  }
});

test.each([
  ['defined', 'ATTR'],
  ['size_t', 'ATTR'],
  ['value', 'size_t'],
  ['value', 'NULL'],
  ['value', 'offsetof'],
])('accepts contextual words in object and annotation positions: %s %s', async (object, annotation) => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(wasmPath));
  const source = `#define ${annotation}(...)\nint ${object} ${annotation}(1);\nint after(void) { return 0; }\n`;
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    const declaration = tree.rootNode.descendantsOfType('declaration')[0]!;
    expect(declaration.childForFieldName('declarator')?.text).toBe(object);
    const attribute = declaration.descendantsOfType('attribute_specifier')[0]!;
    expect(attribute.childForFieldName('name')?.text).toBe(annotation);
    expect(attribute.childForFieldName('name')?.childCount).toBe(0);
    expect(tree.rootNode.descendantsOfType('function_definition').map((node) => node.text)).toEqual([
      'int after(void) { return 0; }',
    ]);
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('preserves post-type prototypes and pragma extras outside the object annotation route', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(wasmPath));
  const source = `#define ATTR(...)
long int ATTR(1) f(void);
int const ATTR(1) qualified(void);
int volatile ATTR(1) volatile_value(void);
int _Atomic ATTR(1) atomic_value(void);
int extern ATTR(1) external_value(void);
int value _Pragma("pack(1)");
int second _Pragma("a") _Pragma("b");
int after(void) { return 0; }
`;
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(
      tree.rootNode.descendantsOfType('function_declarator').map((node) => node.childForFieldName('declarator')?.text)
    ).toEqual(['f', 'qualified', 'volatile_value', 'atomic_value', 'external_value', 'after']);
    expect(tree.rootNode.descendantsOfType('pragma_operator').map((node) => node.text)).toEqual([
      '_Pragma("pack(1)")',
      '_Pragma("a")',
      '_Pragma("b")',
    ]);
    expect(
      tree.rootNode.descendantsOfType('attribute_specifier').map((node) => node.childForFieldName('name')?.text)
    ).toEqual(['ATTR', 'ATTR', 'ATTR', 'ATTR', 'ATTR']);
    expect(
      tree.rootNode.descendantsOfType('declaration').map((node) => node.childForFieldName('declarator')?.text)
    ).toEqual([
      'f(void)',
      'qualified(void)',
      'volatile_value(void)',
      'atomic_value(void)',
      'external_value(void)',
      'value',
      'second',
    ]);
  } finally {
    tree.delete();
    parser.delete();
  }
});

test.each(['\\\n', '\\\r\n'])(
  'accepts a physical continuation after first and subsequent annotation names: %j',
  async (splice) => {
    await Parser.init();
    const parser = new Parser().setLanguage(await Language.load(wasmPath));
    const source = `#define ATTR(...)\nint *first ATTR${splice}((1));\nint *second ATTR(1) ATTR${splice}((1));\nint after(void) { return 0; }\n`;
    const tree = parser.parse(source)!;
    try {
      expect(tree.rootNode.hasError).toBe(false);
      expect(
        tree.rootNode.descendantsOfType('declaration').map((node) => node.childForFieldName('declarator')?.text)
      ).toEqual(['*first', '*second']);
      expect(tree.rootNode.descendantsOfType('attribute_specifier').map((node) => node.text)).toEqual([
        `ATTR${splice}((1))`,
        'ATTR(1)',
        `ATTR${splice}((1))`,
      ]);
      expect(tree.rootNode.descendantsOfType('function_definition').map((node) => node.text)).toEqual([
        'int after(void) { return 0; }',
      ]);
    } finally {
      tree.delete();
      parser.delete();
    }
  }
);

test('preserves GNU assembly labels and their query fields beside trailing object annotations', async () => {
  await Parser.init();
  const language = await Language.load(wasmPath);
  const parser = new Parser().setLanguage(language);
  const query = new Query(language, '(gnu_asm_expression assembly_code: (string_literal) @assembly)');
  const source = `int foo __asm__("bar");
int *baz asm("qux");
int a2 __asm("x");
int annotated ATTR(.5);
int after(void) { return 0; }
`;
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(query.captures(tree.rootNode).map(({ node }) => node.text)).toEqual(['"bar"', '"qux"', '"x"']);
    expect(tree.rootNode.descendantsOfType('gnu_asm_expression').map((node) => node.text)).toEqual([
      '__asm__("bar")',
      'asm("qux")',
      '__asm("x")',
    ]);
    expect(tree.rootNode.descendantsOfType('attribute_specifier').map((node) => node.text)).toEqual(['ATTR(.5)']);
    expect(tree.rootNode.descendantsOfType('function_definition').map((node) => node.text)).toEqual([
      'int after(void) { return 0; }',
    ]);
  } finally {
    tree.delete();
    query.delete();
    parser.delete();
  }
});

test('preserves sized-type prototypes with arbitrary and contextual type names', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(wasmPath));
  const source = `#define TYPE int
#define size_t int
#define ATTR(...)
unsigned TYPE ATTR(1) f(void);
long size_t ATTR(1) g(void);
unsigned value;
int after(void) { return 0; }
`;
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    const declarations = tree.rootNode.descendantsOfType('declaration');
    expect(declarations.map((node) => node.childForFieldName('type')?.text)).toEqual([
      'unsigned TYPE',
      'long size_t',
      'unsigned',
    ]);
    expect(declarations.map((node) => node.childForFieldName('declarator')?.text)).toEqual([
      'f(void)',
      'g(void)',
      'value',
    ]);
    expect(declarations[0]?.childForFieldName('type')?.childForFieldName('type')?.type).toBe('type_identifier');
    expect(declarations[0]?.childForFieldName('type')?.childForFieldName('type')?.text).toBe('TYPE');
    expect(tree.rootNode.descendantsOfType('attribute_specifier').map((node) => node.text)).toEqual([
      'ATTR(1)',
      'ATTR(1)',
    ]);
    expect(tree.rootNode.descendantsOfType('function_definition').map((node) => node.text)).toEqual([
      'int after(void) { return 0; }',
    ]);
  } finally {
    tree.delete();
    parser.delete();
  }
});
