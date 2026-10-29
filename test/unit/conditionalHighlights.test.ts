import fs from 'node:fs';
import path from 'node:path';

import { Language, Parser, Query, type Tree } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

import treeSitterJson from '../../tree-sitter.json';

const Root = path.join(import.meta.dirname, '../..');
const Source = fs.readFileSync(path.join(Root, 'test/fixtures/conditionalOperators.c'), 'utf8');
await Parser.init();

test('highlights conditional punctuation without capturing other colons', async () => {
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
    const expressions = tree.rootNode.descendantsOfType('conditional_expression');
    expect(
      expressions.map((node) =>
        ['condition', 'consequence', 'alternative'].map((field) => node.childForFieldName(field)?.text)
      )
    ).toEqual([
      ['a', 'b', '(b ? c : a)'],
      ['b', 'c', 'a'],
      ['(a ? b : c)', 'c', 'b'],
      ['a', 'b', 'c'],
      ['a', '(b += 1, c)', 'b'],
    ]);
    const captures = queries[0]!.captures(tree.rootNode);
    for (const expression of expressions) {
      const punctuation = expression.children.filter((node) => ['?', ':'].includes(node.type));
      expect(punctuation.map((node) => [node.type, node.isNamed])).toEqual([
        ['?', false],
        [':', false],
      ]);
      for (const node of punctuation) {
        expect(captures.filter((capture) => capture.name === 'operator' && capture.node.id === node.id)).toHaveLength(
          1
        );
        expect(Source.slice(node.startIndex, node.endIndex)).toBe(node.type);
        expect([node.startPosition, node.endPosition]).toEqual([
          point(Source, node.startIndex),
          point(Source, node.endIndex),
        ]);
      }
    }
    const colons = tree.rootNode.descendantsOfType(':');
    expect(colons.filter((node) => node.parent?.type !== 'conditional_expression')).toHaveLength(5);
    for (const node of colons.filter((node) => node.parent?.type !== 'conditional_expression')) {
      expect(captures.filter((capture) => capture.name === 'operator' && capture.node.id === node.id)).toHaveLength(0);
    }
    const literals = captures.filter(({ name }) => ['string', 'comment'].includes(name));
    expect(literals.map(({ node }) => node.text)).toEqual([
      '"? :"',
      '// ? : remain comment text, not conditional operators.',
    ]);
    for (const { node: literal } of literals) {
      expect(
        captures.filter(
          ({ name, node }) =>
            name === 'operator' && node.startIndex >= literal.startIndex && node.endIndex <= literal.endIndex
        )
      ).toHaveLength(0);
    }
    expect(
      queries[1]!
        .captures(tree.rootNode)
        .filter(({ name }) => name === 'name')
        .map(({ node }) => node.text)
    ).toEqual(['Flags', 'choose', 'main']);
    for (const [after, hasError] of [
      ['selected = a ? longChoice :', false],
      ['selected = a  b :', true],
    ] as const) {
      const source = Source.replace('selected = a ? b :', after);
      const variant = parser.parse(source)!;
      try {
        expect(variant.rootNode.hasError).toBe(hasError);
        if (!hasError) {
          const expression = variant.rootNode.descendantsOfType('conditional_expression')[0]!;
          expect(
            ['condition', 'consequence', 'alternative'].map((field) => expression.childForFieldName(field)?.text)
          ).toEqual(['a', 'longChoice', '(b ? c : a)']);
          for (const node of expression.children.filter((node) => ['?', ':'].includes(node.type))) {
            expect(source.slice(node.startIndex, node.endIndex)).toBe(node.type);
          }
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
