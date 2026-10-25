import fs from 'node:fs';

import { Edit, Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test('keeps type-name fields and supertype captures separate from declaration storage classes', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser().setLanguage(language);
  const source = fs.readFileSync('test/fixtures/typeNameContexts.c', 'utf8');
  const tree = parser.parse(source)!;
  const qualified = new Query(language, '(type_specifier/sized_type_specifier) @type');
  const plain = new Query(language, '(sized_type_specifier) @type');
  try {
    expect(tree.rootNode.hasError).toBe(false);
    const snapshot = (query: Query): [string, number, number][] =>
      query.captures(tree.rootNode).map(({ node }) => [node.text, node.startIndex, node.endIndex]);
    const enumType = tree.rootNode.descendantsOfType('enum_specifier')[0]!.childForFieldName('underlying_type')!;
    expect(snapshot(qualified)).toEqual(snapshot(plain).filter(([, start]) => start !== enumType.startIndex));
    expect(
      tree.rootNode.descendantsOfType('type_descriptor').map((node) => node.childForFieldName('type')?.text)
    ).toEqual([
      'unsigned long',
      'int const long',
      'unsigned const long',
      'int const long',
      'unsigned const long',
      'int long',
      'int const long',
    ]);
    expect(tree.rootNode.descendantsOfType('storage_class_specifier').map((node) => node.text)).toEqual([
      'static',
      'static',
      'register',
      'register',
    ]);
    expect(
      tree.rootNode
        .descendantsOfType('field_declaration')
        .map((node) => [node.childForFieldName('type')?.text, node.childForFieldName('declarator')?.text])
    ).toEqual([['int const long', 'member']]);
    expect(
      tree.rootNode
        .descendantsOfType('parameter_declaration')
        .map((node) => [node.childForFieldName('type')?.text, node.childForFieldName('declarator')?.text])
    ).toContainEqual(['int register long', 'argument']);
  } finally {
    plain.delete();
    qualified.delete();
    tree.delete();
    parser.delete();
  }
});

test('reports storage classes in type names and restores bounded trees after edit and undo', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser().setLanguage(language);
  const query = new Query(language, '(type_specifier/sized_type_specifier) @type');
  const contexts = [
    (type: string) => `void f(void) { (${type})1; }`,
    (type: string) => `void f(void) { sizeof(${type}); }`,
    (type: string) => `_Atomic(${type}) value;`,
    (type: string) => `void f(void) { (${type}){1}; }`,
    (type: string) => `void f(void) { _Alignof(${type}); }`,
    (type: string) => `void f(void) { _Generic(1, ${type}: 1, default: 0); }`,
    (type: string) => `typeof(${type}) value;`,
    (type: string) => `enum E : ${type} { A };`,
    (type: string) => `struct S { ${type} member; };`,
  ];
  try {
    for (const context of contexts) {
      let source = `${context('int const long')}\nint following(void) { return 0; }\n`;
      let tree = parser.parse(source)!;
      const start = source.indexOf('const');
      const baseline = tree.rootNode.toString();
      const captures = query.captures(tree.rootNode).map(({ node }) => [node.text, node.startIndex, node.endIndex]);
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        for (const replacement of ['static', 'const']) {
          const end = start + (replacement === 'static' ? 'const'.length : 'static'.length);
          tree.edit(
            new Edit({
              startIndex: start,
              oldEndIndex: end,
              newEndIndex: start + replacement.length,
              startPosition: { row: 0, column: start },
              oldEndPosition: { row: 0, column: end },
              newEndPosition: { row: 0, column: start + replacement.length },
            })
          );
          source = source.slice(0, start) + replacement + source.slice(end);
          const next = parser.parse(source, tree)!;
          tree.delete();
          tree = next;
          const fresh = parser.parse(source)!;
          try {
            expect(tree.rootNode.hasError, source).toBe(replacement === 'static');
            expect(tree.rootNode.toString()).toBe(fresh.rootNode.toString());
            const following = tree.rootNode.descendantsOfType('function_definition').at(-1)!;
            expect([following.text, following.startIndex, following.endIndex]).toEqual([
              'int following(void) { return 0; }',
              source.indexOf('int following'),
              source.indexOf('int following') + 'int following(void) { return 0; }'.length,
            ]);
            if (replacement === 'const') {
              expect(tree.rootNode.toString()).toBe(baseline);
              expect(
                query.captures(tree.rootNode).map(({ node }) => [node.text, node.startIndex, node.endIndex])
              ).toEqual(captures);
            }
          } finally {
            fresh.delete();
          }
        }
      } finally {
        tree.delete();
      }
    }
  } finally {
    query.delete();
    parser.delete();
  }
});

test('keeps trailing storage in empty declarations before the next declaration', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser().setLanguage(language);
  const types = [
    'long static',
    'int static',
    'unsigned static',
    'const int static',
    'unsigned const static',
    'long static int volatile',
  ];
  try {
    for (const type of types) {
      for (const block of [false, true]) {
        const source = `${block ? 'void f(void) { ' : ''}${type};\nint after;${block ? ' }' : ''}\nint following(void) { return 0; }`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          const after = tree.rootNode.descendantsOfType('declaration').find((node) => node.text === 'int after;')!;
          expect([
            after.childForFieldName('type')?.text,
            after.childForFieldName('declarator')?.text,
            after.startIndex,
            after.endIndex,
          ]).toEqual(['int', 'after', source.indexOf('int after;'), source.indexOf('int after;') + 10]);
          expect(
            tree.rootNode.descendantsOfType('function_definition').at(-1)?.childForFieldName('declarator')?.text
          ).toBe('following(void)');
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('keeps compound-literal storage outside primitive and bit-precise type operands', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser().setLanguage(language);
  const types = new Query(language, '(type_descriptor type: (type_specifier/sized_type_specifier) @type)');
  try {
    for (const spelling of ['int long', 'unsigned _BitInt(17)']) {
      const source = `void f(void) { (static ${spelling}){1}; }`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError).toBe(false);
        const literal = tree.rootNode.descendantsOfType('compound_literal_expression')[0]!;
        const descriptor = literal.childForFieldName('type')!;
        expect(literal.childForFieldName('storage_class')?.text).toBe('static');
        expect(descriptor.descendantsOfType('storage_class_specifier')).toEqual([]);
        expect(descriptor.childForFieldName('type')?.text).toBe(spelling);
        expect(types.captures(tree.rootNode).map(({ node }) => [node.text, node.startIndex, node.endIndex])).toEqual([
          [spelling, source.indexOf(spelling), source.indexOf(spelling) + spelling.length],
        ]);
      } finally {
        tree.delete();
      }
    }
  } finally {
    types.delete();
    parser.delete();
  }
});
