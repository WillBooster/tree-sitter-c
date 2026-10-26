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
  const highlights = new Query(language, fs.readFileSync('queries/highlights.scm', 'utf8'));
  const expressions = new Query(language, '(for_statement initializer: (expression) @initializer)');
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
        const loops = tree.rootNode.descendantsOfType('for_statement');
        expect(loops.map((node) => node.childForFieldName('initializer')?.type)).toEqual([
          'declaration',
          'declaration',
          'declaration',
          'identifier',
          'identifier',
          'binary_expression',
          'parenthesized_expression',
          'call_expression',
        ]);
        expect(
          loops.slice(0, 3).map((node) => {
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
        expect(expressions.captures(tree.rootNode).map(({ node }) => node.text)).toEqual([
          'n',
          'i',
          'n + 1',
          '(n)',
          'parameter(y)',
        ]);
        for (const identifier of ['n', 'i']) {
          const index = source.indexOf(`for (${identifier};`) + 'for ('.length;
          expect(
            highlights
              .captures(tree.rootNode)
              .filter(({ node }) => node.startIndex === index && node.endIndex === index + identifier.length)
              .map(({ name: capture }) => capture)
          ).toEqual(['variable']);
        }
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
    expressions.delete();
    highlights.delete();
    tags.delete();
    tree.delete();
    parser.delete();
  }
});

test('preserves initializer field roles when an expression becomes a qualified empty declaration and back', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser().setLanguage(language);
  const expressions = new Query(language, '(for_statement initializer: (expression) @initializer)');
  let source = fs.readFileSync('test/fixtures/specifierContexts.c', 'utf8');
  let tree = parser.parse(source)!;
  const start = source.indexOf('for (n;') + 'for ('.length;
  const row = source.slice(0, start).split('\n').length - 1;
  const column = start - source.lastIndexOf('\n', start) - 1;
  try {
    for (const replacement of ['n', 'long const', 'n']) {
      const end = source.indexOf(';', start);
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
        const initializer = tree.rootNode.descendantsOfType('for_statement')[3]!.childForFieldName('initializer')!;
        if (replacement === 'n') {
          expect([initializer.type, initializer.text, initializer.startIndex, initializer.endIndex]).toEqual([
            'identifier',
            'n',
            start,
            start + 1,
          ]);
        } else {
          expect([
            initializer.type,
            initializer.childForFieldName('type')?.text,
            initializer.childForFieldName('declarator')?.text,
          ]).toEqual(['declaration', 'long', undefined]);
        }
        const snapshot = (root: typeof tree.rootNode): [string, number, number][] =>
          expressions.captures(root).map(({ node }) => [node.text, node.startIndex, node.endIndex]);
        expect(snapshot(tree.rootNode)).toEqual(snapshot(fresh.rootNode));
        expect(
          tree.rootNode.descendantsOfType('function_definition').at(-1)?.childForFieldName('declarator')?.text
        ).toBe('following(void)');
      } finally {
        fresh.delete();
      }
    }
  } finally {
    expressions.delete();
    tree.delete();
    parser.delete();
  }
});
