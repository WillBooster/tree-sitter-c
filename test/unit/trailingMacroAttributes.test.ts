import fs from 'node:fs';
import path from 'node:path';

import { Edit, Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

const wasmPath = path.join(import.meta.dirname, '../../tree-sitter-c.wasm');

test.each([
  ['int *value', '(1)', '*value'],
  ['int value', '1', 'value'],
  ['int *deprecated_value', '"use replacement"', '*deprecated_value'],
  ['int versioned', '7.56.0', 'versioned'],
  ['int empty_slots', ', 1, ,', 'empty_slots'],
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
int run(int value) { return callback(value); }
`;
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(tree.rootNode.descendantsOfType('attribute_specifier')).toHaveLength(0);
    expect(
      tree.rootNode.descendantsOfType('function_declarator').map((node) => node.childForFieldName('declarator')?.text)
    ).toEqual(['create', 'create_int', 'create_void', 'factory', '(*callback)', 'run']);
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

test('preserves annotation name ranges and following captures through an edit and undo', async () => {
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
    const originalCaptures = captures(tree.rootNode);
    expect(originalCaptures.map(([kind, text]) => [kind, text])).toEqual([
      ['type', 'int'],
      ['object', '*value'],
      ['annotation', 'ATTR'],
      ['arguments', '((1))'],
      ['typedef', '(*saved_t)(int)'],
      ['function', 'after(void)'],
    ]);
    const at = source.indexOf('1');
    const text = '/* edit */';
    const editedSource = source.slice(0, at) + text + source.slice(at);
    tree.edit(
      new Edit({
        startIndex: at,
        oldEndIndex: at,
        newEndIndex: at + text.length,
        startPosition: { row: 0, column: at },
        oldEndPosition: { row: 0, column: at },
        newEndPosition: { row: 0, column: at + text.length },
      })
    );
    const incremental = parser.parse(editedSource, tree)!;
    const fresh = parser.parse(editedSource)!;
    try {
      expect(incremental.rootNode.hasError).toBe(false);
      expect(incremental.rootNode.toString()).toBe(fresh.rootNode.toString());
      expect(captures(incremental.rootNode)).toEqual(captures(fresh.rootNode));
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
        expect(undone.rootNode.hasError).toBe(false);
        expect(captures(undone.rootNode)).toEqual(originalCaptures);
      } finally {
        undone.delete();
      }
    } finally {
      incremental.delete();
      fresh.delete();
    }
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
