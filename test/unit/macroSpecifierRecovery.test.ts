import fs from 'node:fs';

import { Edit, Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

const typeCases: [string, string, string][] = [
  ['char', 'primitive_type', 'char'],
  ['const char', 'primitive_type', 'char'],
  ['volatile char', 'primitive_type', 'char'],
  ['unsigned const int', 'sized_type_specifier', 'unsigned const int'],
  ['int static long', 'sized_type_specifier', 'int static long'],
  ['long const', 'sized_type_specifier', 'long'],
  ['Alias', 'type_identifier', 'Alias'],
  ['Alias const', 'type_identifier', 'Alias'],
];

test.each(typeCases)(
  'retains macro-prefixed %s types, names, and following definitions',
  async (spelling, kind, text) => {
    await Parser.init();
    const language = await Language.load('tree-sitter-c.wasm');
    const parser = new Parser().setLanguage(language);
    const types = new Query(language, '(declaration type: (type_specifier) @type)');
    const highlights = new Query(language, fs.readFileSync('queries/highlights.scm', 'utf8'));
    try {
      for (const defined of [false, true]) {
        for (let count = 1; count <= 6; count++) {
          const names = 'ABCDEF'.split('').slice(0, count);
          const definitions = defined
            ? `#define FOO() extern int availability_marker;\n${names.map((name) => `#define ${name}\n`).join('')}`
            : '';
          const declarationText = `${names.join(' ')} ${spelling} value;`;
          const aliases = spelling.startsWith('Alias') ? 'typedef int Alias;\n' : '';
          const source = `${definitions}${aliases}FOO()\n${declarationText}\nint following(void) { return 0; }\n`;
          const tree = parser.parse(source)!;
          try {
            const declaration = tree.rootNode
              .descendantsOfType('declaration')
              .find((node) => node.text === declarationText);
            expect(declaration, `${defined ? 'defined' : 'unknown'} macros: ${declarationText}`).toBeDefined();
            expect(declaration!.hasError).toBe(false);
            const type = declaration!.childForFieldName('type')!;
            expect([type.type, type.text, type.startIndex, type.endIndex]).toEqual([
              kind,
              text,
              source.indexOf(text, source.indexOf(declarationText)),
              source.indexOf(text, source.indexOf(declarationText)) + text.length,
            ]);
            const name = declaration!.childForFieldName('declarator')!;
            expect([name.type, name.text, name.startIndex, name.endIndex]).toEqual([
              'identifier',
              'value',
              source.indexOf(' value;') + 1,
              source.indexOf(' value;') + 6,
            ]);
            expect(
              declaration!
                .descendantsOfType('macro_specifier')
                .map((node) => [node.childForFieldName('name')?.text, node.startIndex, node.endIndex])
            ).toEqual(
              names.map((marker, index) => [
                marker,
                declaration!.startIndex + index * 2,
                declaration!.startIndex + index * 2 + 1,
              ])
            );
            expect(types.captures(declaration!).map(({ node }) => [node.type, node.text])).toEqual([[kind, text]]);
            expect(
              highlights
                .captures(declaration!)
                .filter(({ node }) => node.id === name.id)
                .map(({ name: capture }) => capture)
            ).toEqual(['variable']);
            const following = tree.rootNode.descendantsOfType('function_definition').at(-1)!;
            expect([following.childForFieldName('declarator')?.text, following.startIndex, following.endIndex]).toEqual(
              ['following(void)', source.indexOf('int following'), source.length - 1]
            );
          } finally {
            tree.delete();
          }
        }
      }
    } finally {
      highlights.delete();
      types.delete();
      parser.delete();
    }
  }
);

test('preserves typedef, opaque, enum, field, cast, and sizeof roles through annotation edits and undo', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser().setLanguage(language);
  const query = new Query(
    language,
    `
(declaration type: (type_specifier) @type declarator: (_) @name)
(type_definition type: (type_specifier) @type declarator: (_) @name)
(field_declaration type: (type_specifier) @type declarator: (_) @name)
(function_definition type: (type_specifier) @type declarator: (_) @name)
(enum_specifier underlying_type: (_) @type)
(type_descriptor type: (type_specifier) @operand.type)
`
  );
  let source = fs.readFileSync('test/fixtures/macroSpecifierRecovery.c', 'utf8');
  let tree = parser.parse(source)!;
  const start = source.indexOf('A B C const char x;');
  const row = source.slice(0, start).split('\n').length - 1;
  try {
    for (const markers of ['A B C', 'A B C D', 'A B C']) {
      const end = source.indexOf(' const char x;', start);
      tree.edit(
        new Edit({
          startIndex: start,
          oldEndIndex: end,
          newEndIndex: start + markers.length,
          startPosition: { row, column: 0 },
          oldEndPosition: { row, column: end - start },
          newEndPosition: { row, column: markers.length },
        })
      );
      source = source.slice(0, start) + markers + source.slice(end);
      const incremental = parser.parse(source, tree)!;
      tree.delete();
      tree = incremental;
      const fresh = parser.parse(source)!;
      try {
        expect(tree.rootNode.toString()).toBe(fresh.rootNode.toString());
        const snapshot = (root: typeof tree.rootNode): [string, string, number, number][] =>
          query
            .captures(root)
            .map<[string, string, number, number]>(({ name, node }) => [
              name,
              node.text,
              node.startIndex,
              node.endIndex,
            ]);
        expect(snapshot(tree.rootNode)).toEqual(snapshot(fresh.rootNode));
        expect(query.captures(tree.rootNode).map(({ name, node }) => [name, node.text])).toEqual([
          ['type', 'char'],
          ['name', 'x'],
          ['type', 'int'],
          ['name', 'Word'],
          ['type', 'Word'],
          ['name', 'Alias'],
          ['type', 'Word'],
          ['name', 'field'],
          ['type', 'struct Opaque'],
          ['name', '*pointer'],
          ['type', 'Alias'],
          ['name', 'variable'],
          ['type', 'Alias'],
          ['name', '*pointer'],
          ['type', 'Alias'],
          ['name', 'function(Word parameter)'],
          ['type', 'Alias'],
          ['name', 'cast(Word parameter)'],
          ['type', 'Alias'],
          ['name', 'index = parameter'],
          ['operand.type', 'Alias'],
          ['operand.type', 'Word'],
          ['type', 'Word'],
        ]);
        const declaration = tree.rootNode.descendantsOfType('declaration')[0]!;
        expect(declaration.hasError).toBe(false);
        expect(declaration.descendantsOfType('macro_specifier').map((node) => node.text)).toEqual(markers.split(' '));
        expect(
          tree.rootNode
            .descendantsOfType('for_statement')[0]!
            .childForFieldName('initializer')
            ?.childForFieldName('type')?.text
        ).toBe('Alias');
        expect(tree.rootNode.descendantsOfType('enum_specifier')[0]!.childForFieldName('underlying_type')?.text).toBe(
          'Word'
        );
      } finally {
        fresh.delete();
      }
    }
  } finally {
    query.delete();
    tree.delete();
    parser.delete();
  }
});
