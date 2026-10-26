import fs from 'node:fs';

import { Edit, Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test('preserves declaration types and names when size and signedness specifiers are interleaved', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser().setLanguage(language);
  const original = fs.readFileSync('test/fixtures/interleavedSpecifiers.c', 'utf8');
  const typeQuery = new Query(language, '(declaration type: (type_specifier) @type)');
  const tags = new Query(language, fs.readFileSync('queries/tags.scm', 'utf8'));
  const highlights = new Query(language, fs.readFileSync('queries/highlights.scm', 'utf8'));
  let source = original;
  let tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(
      tree.rootNode
        .descendantsOfType([
          'declaration',
          'function_definition',
          'field_declaration',
          'type_definition',
          'parameter_declaration',
          'type_descriptor',
        ])
        .map((node) => [node.type, node.childForFieldName('type')?.text, node.childForFieldName('declarator')?.text])
    ).toEqual([
      ['declaration', 'long static int', 'x'],
      ['declaration', 'int static long', 'y'],
      ['declaration', 'signed static char', 'z'],
      ['declaration', 'unsigned const int', 'qualified'],
      ['function_definition', 'int static long inline long', 'function(void)'],
      ['parameter_declaration', 'void', undefined],
      ['field_declaration', 'unsigned const long', 'field'],
      ['type_definition', 'unsigned const long int', 'Alias'],
      ['declaration', 'unsigned static _BitInt(17)', 'bitValue'],
      ['function_definition', 'int', 'after(register unsigned const int argument)'],
      ['parameter_declaration', 'unsigned const int', 'argument'],
      ['declaration', 'unsigned register long', 'local = argument'],
      ['type_descriptor', 'unsigned const long', undefined],
      ['type_descriptor', 'unsigned const long', undefined],
      ['declaration', 'int', 'ordinary'],
      ['declaration', 'long', 'untyped'],
    ]);
    expect(
      tags
        .captures(tree.rootNode)
        .filter(({ name }) => name === 'name')
        .map(({ node }) => node.text)
    ).toEqual(['function', 'Holder', 'Alias', 'after']);
    expect(
      highlights
        .captures(tree.rootNode)
        .filter(({ name }) => name === 'function')
        .map(({ node }) => node.text)
    ).toEqual(['function', 'after']);
    for (const replacement of ['long int', 'int static long', 'long static int']) {
      const end = source.indexOf(' x;');
      tree.edit(
        new Edit({
          startIndex: 0,
          oldEndIndex: end,
          newEndIndex: replacement.length,
          startPosition: { row: 0, column: 0 },
          oldEndPosition: { row: 0, column: end },
          newEndPosition: { row: 0, column: replacement.length },
        })
      );
      source = replacement + source.slice(end);
      const incremental = parser.parse(source, tree)!;
      tree.delete();
      tree = incremental;
      const fresh = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError).toBe(false);
        expect(tree.rootNode.toString()).toBe(fresh.rootNode.toString());
        expect(tree.rootNode.firstNamedChild?.childForFieldName('declarator')?.text).toBe('x');
        expect(typeQuery.captures(tree.rootNode).map(({ node }) => node.text)).toEqual([
          replacement,
          'int static long',
          'signed static char',
          'unsigned const int',
          'unsigned static _BitInt(17)',
          'unsigned register long',
          'int',
          'long',
        ]);
      } finally {
        fresh.delete();
      }
    }
  } finally {
    highlights.delete();
    tags.delete();
    typeQuery.delete();
    tree.delete();
    parser.delete();
  }
});
