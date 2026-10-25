import fs from 'node:fs';

import { Edit, Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test('keeps enum underlying types and qualifier ranges in their enum context', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser().setLanguage(language);
  const source = fs.readFileSync('test/fixtures/specifierContexts.c', 'utf8');
  const tree = parser.parse(source)!;
  const types = new Query(language, '(enum_specifier underlying_type: (sized_type_specifier) @type)');
  const qualifiers = new Query(language, '(type_qualifier) @qualifier');
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(
      tree.rootNode.descendantsOfType('enum_specifier').map((node) => [
        node.childForFieldName('name')?.text,
        node.childForFieldName('underlying_type')?.text,
        node
          .childForFieldName('body')
          ?.descendantsOfType('enumerator')
          .map((item) => item.text),
      ])
    ).toEqual([
      ['Sized', 'unsigned', ['A']],
      ['Multiple', 'unsigned long', ['B']],
      ['Primitive', 'int', ['C']],
      ['TypeOf', 'typeof(1)', ['D']],
      [undefined, 'unsigned', ['E']],
      ['Prefix', 'unsigned', ['F']],
    ]);
    expect(types.captures(tree.rootNode).map(({ node }) => node.text)).toEqual([
      'unsigned',
      'unsigned long',
      'unsigned',
      'unsigned',
    ]);
    expect(qualifiers.captures(tree.rootNode).map(({ node }) => [node.text, node.startIndex, node.endIndex])).toEqual(
      [...source.matchAll(/\b(?:const|volatile)\b/g)].map((match) => [
        match[0],
        match.index,
        match.index + match[0].length,
      ])
    );
  } finally {
    qualifiers.delete();
    types.delete();
    tree.delete();
    parser.delete();
  }
});

test('keeps storage-prefixed empty declarations, loop initializers, and unnamed bit-fields bounded', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser().setLanguage(language);
  const tags = new Query(language, fs.readFileSync('queries/tags.scm', 'utf8'));
  let source = fs.readFileSync('test/fixtures/specifierContexts.c', 'utf8');
  let tree = parser.parse(source)!;
  try {
    for (const name of [undefined, 'temporary', undefined]) {
      const start = source.indexOf('static long const', source.indexOf('void contexts'));
      const end = source.indexOf(';', start);
      const replacement = name ? `static long const ${name}` : 'static long const';
      const row = source.slice(0, start).split('\n').length - 1;
      const column = start - source.lastIndexOf('\n', start) - 1;
      tree.edit(
        new Edit({
          startIndex: start,
          oldEndIndex: end,
          newEndIndex: start + replacement.length,
          startPosition: { row, column },
          oldEndPosition: { row, column: column + end - start },
          newEndPosition: { row, column: column + replacement.length },
        })
      );
      source = source.slice(0, start) + replacement + source.slice(end);
      const incremental = parser.parse(source, tree)!;
      tree.delete();
      tree = incremental;
      const fresh = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError).toBe(false);
        expect(tree.rootNode.toString()).toBe(fresh.rootNode.toString());
        expect(
          tree.rootNode.descendantsOfType('for_statement').map((node) => {
            const initializer = node.childForFieldName('initializer');
            return [
              initializer?.type,
              initializer?.childForFieldName('type')?.text,
              initializer?.childForFieldName('declarator')?.text,
            ];
          })
        ).toEqual([
          ['declaration', 'long', undefined],
          ['declaration', 'unsigned int', undefined],
          ['declaration', 'long', 'value = 0'],
        ]);
        expect(
          tree.rootNode
            .descendantsOfType('field_declaration')
            .map((node) => [
              node.childForFieldName('type')?.text,
              node.childForFieldName('declarator')?.text,
              node.descendantsOfType('bitfield_clause').map((item) => item.text),
            ])
        ).toEqual([
          ['unsigned', undefined, [': 3']],
          ['unsigned', 'named', [': 2']],
          ['int', 'x', []],
        ]);
        for (const spelling of ['int y;', 'int z;']) {
          const declaration = tree.rootNode.descendantsOfType('declaration').find((node) => node.text === spelling);
          expect([declaration?.startIndex, declaration?.endIndex]).toEqual([
            source.indexOf(spelling),
            source.indexOf(spelling) + spelling.length,
          ]);
        }
        expect(
          tags
            .captures(tree.rootNode)
            .filter(({ name: capture }) => capture === 'definition.function')
            .map(({ node }) => node.text)
        ).toEqual(['parameter(unsigned const)', 'contexts(void)', 'following(void)']);
      } finally {
        fresh.delete();
      }
    }
  } finally {
    tags.delete();
    tree.delete();
    parser.delete();
  }
});
