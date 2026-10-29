import fs from 'node:fs';

import { Language, Parser, Query } from '@willbooster/web-tree-sitter';
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
  const fixture = fs.readFileSync('test/fixtures/specifierContexts.c', 'utf8');
  const start = fixture.indexOf('static long const', fixture.indexOf('void contexts'));
  try {
    for (const name of [undefined, 'temporary']) {
      const replacement = name ? `static long const ${name}` : 'static long const';
      const source = fixture.slice(0, start) + replacement + fixture.slice(fixture.indexOf(';', start));
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError).toBe(false);
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
        tree.delete();
      }
    }
  } finally {
    expressions.delete();
    highlights.delete();
    tags.delete();
    parser.delete();
  }
});

test('preserves initializer field roles for an expression and a qualified empty declaration', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser().setLanguage(language);
  const expressions = new Query(language, '(for_statement initializer: (expression) @initializer)');
  const fixture = fs.readFileSync('test/fixtures/specifierContexts.c', 'utf8');
  const start = fixture.indexOf('for (n;') + 'for ('.length;
  try {
    for (const replacement of ['n', 'long const']) {
      const tree = parser.parse(fixture.slice(0, start) + replacement + fixture.slice(fixture.indexOf(';', start)))!;
      try {
        expect(tree.rootNode.hasError).toBe(false);
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
        expect(
          tree.rootNode.descendantsOfType('function_definition').at(-1)?.childForFieldName('declarator')?.text
        ).toBe('following(void)');
      } finally {
        tree.delete();
      }
    }
  } finally {
    expressions.delete();
    parser.delete();
  }
});
