import fs from 'node:fs';

import { Language, Parser } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

import { collectCaptures, hasSupertype } from '../helpers/ast.ts';

test('keeps enum underlying types and qualifier ranges in their enum context', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser().setLanguage(language);
  const source = fs.readFileSync('test/fixtures/specifierContexts.c', 'utf8');
  const tree = parser.parse(source)!;
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
    const underlyingSizedTypes = collectCaptures(tree.rootNode, (node, emit) => {
      if (node.type !== 'enum_specifier') return;
      const underlying = node.childForFieldName('underlying_type');
      if (underlying?.type === 'sized_type_specifier') emit('type', underlying);
    });
    expect(underlyingSizedTypes.map(({ node }) => node.text)).toEqual([
      'unsigned',
      'unsigned long',
      'unsigned',
      'unsigned',
    ]);
    expect(
      tree.rootNode.descendantsOfType('type_qualifier').map((node) => [node.text, node.startIndex, node.endIndex])
    ).toEqual(
      [...source.matchAll(/\b(?:const|volatile)\b/g)].map((match) => [
        match[0],
        match.index,
        match.index + match[0].length,
      ])
    );
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('keeps storage-prefixed empty declarations, loop initializers, and unnamed bit-fields bounded', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser().setLanguage(language);
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
        const expressionInitializers = collectCaptures(tree.rootNode, (node, emit) => {
          if (node.type !== 'for_statement') return;
          const initializer = node.childForFieldName('initializer');
          if (hasSupertype(language, initializer, 'expression')) emit('initializer', initializer);
        });
        expect(expressionInitializers.map(({ node }) => node.text)).toEqual(['n', 'i', 'n + 1', '(n)', 'parameter(y)']);
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
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('preserves initializer field roles for an expression and a qualified empty declaration', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser().setLanguage(language);
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
    parser.delete();
  }
});
