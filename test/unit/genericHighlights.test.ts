import fs from 'node:fs';
import path from 'node:path';

import { Language, Parser, Query, type Tree } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

import treeSitterJson from '../../tree-sitter.json';

const Root = path.join(import.meta.dirname, '../..');
const Source = fs.readFileSync(path.join(Root, 'test/fixtures/genericSelections.c'), 'utf8');
await Parser.init();

test('highlights nested generic selections', async () => {
  const parser = new Parser();
  const queries: Query[] = [];
  let tree: Tree | undefined;
  try {
    const language = await Language.load(path.join(Root, 'tree-sitter-c.wasm'));
    parser.setLanguage(language);
    const grammar = treeSitterJson.grammars[0]!;
    for (const kind of ['highlights', 'tags'] as const) {
      const files = [(grammar as Partial<Record<typeof kind, string | string[]>>)[kind] ?? []].flat();
      queries.push(new Query(language, files.map((file) => fs.readFileSync(path.join(Root, file), 'utf8')).join('\n')));
    }
    tree = parser.parse(Source)!;
    expect(tree.rootNode.hasError).toBe(false);
    const selections = tree.rootNode.descendantsOfType('generic_expression');
    expect(selections.map((node) => node.namedChildren.map((child) => [child.type, child.text]))).toEqual([
      [
        ['identifier', 'value'],
        ['type_descriptor', 'int'],
        ['identifier', 'value'],
        ['type_descriptor', 'default'],
        ['number_literal', '0'],
      ],
      [
        ['identifier', 'value'],
        ['type_descriptor', 'int'],
        ['generic_expression', '_Generic(decimal, double: value + 1, default: 0)'],
        ['type_descriptor', 'default'],
        ['number_literal', '0'],
      ],
      [
        ['identifier', 'decimal'],
        ['type_descriptor', 'double'],
        ['binary_expression', 'value + 1'],
        ['type_descriptor', 'default'],
        ['number_literal', '0'],
      ],
    ]);
    const captures = queries[0]!.captures(tree.rootNode);
    for (const selection of selections) {
      const keyword = selection.children[0]!;
      expect([keyword.type, keyword.isNamed, keyword.parent?.type]).toEqual(['_Generic', false, 'generic_expression']);
      expect(selection.children.map((child, index) => selection.fieldNameForChild(index) ?? undefined)).toEqual(
        selection.children.map(() => {})
      );
      expect(captures.filter((capture) => capture.name === 'keyword' && capture.node.id === keyword.id)).toHaveLength(
        1
      );
      expect(Source.slice(keyword.startIndex, keyword.endIndex)).toBe('_Generic');
      expect([keyword.startPosition, keyword.endPosition]).toEqual([
        point(Source, keyword.startIndex),
        point(Source, keyword.endIndex),
      ]);
    }
    const literals = captures.filter(({ name }) => ['string', 'comment'].includes(name));
    expect(literals.map(({ node }) => node.text)).toEqual([
      '"_Generic(value, int: 1, default: 0)"',
      '// _Generic(value, int: 1, default: 0) remains comment text.',
    ]);
    for (const { node: literal } of literals) {
      expect(
        captures.filter(
          ({ name, node }) =>
            name === 'keyword' && node.startIndex >= literal.startIndex && node.endIndex <= literal.endIndex
        )
      ).toHaveLength(0);
    }
    const identifiers = tree.rootNode.descendantsOfType('identifier').filter((node) => node.text === '_GenericCount');
    expect(identifiers).toHaveLength(2);
    for (const node of identifiers) {
      expect(captures.filter((capture) => capture.name === 'keyword' && capture.node.id === node.id)).toHaveLength(0);
      expect(captures.filter((capture) => capture.name === 'variable' && capture.node.id === node.id)).toHaveLength(1);
    }
    expect(
      queries[1]!
        .captures(tree.rootNode)
        .filter(({ name }) => name === 'name')
        .map(({ node }) => node.text)
    ).toEqual(['choose', 'main']);
    for (const [input, malformed] of [
      ['value + 1,', false],
      ['value', true],
    ] as const) {
      const variant = parser.parse(Source.replace('_Generic(value,', `_Generic(${input}`))!;
      try {
        expect(variant.rootNode.hasError).toBe(malformed);
        if (!malformed) {
          const editedSelections = variant.rootNode.descendantsOfType('generic_expression');
          expect(editedSelections).toHaveLength(3);
          expect(editedSelections[0]!.namedChildren[0]!.text).toBe('value + 1');
        }
      } finally {
        variant.delete();
      }
    }
  } finally {
    tree?.delete();
    for (const query of queries) query.delete();
    parser.delete();
  }
});

function point(source: string, index: number): { row: number; column: number } {
  const prefix = source.slice(0, index);
  return { row: prefix.split('\n').length - 1, column: prefix.length - prefix.lastIndexOf('\n') - 1 };
}
