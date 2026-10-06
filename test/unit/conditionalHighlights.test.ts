import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from 'vitest';

import { Edit, Language, Parser, Query, type Node, type Tree } from '@willbooster/web-tree-sitter';

import treeSitterJson from '../../tree-sitter.json';

const Root = path.join(import.meta.dirname, '../..');
const Source = fs.readFileSync(path.join(Root, 'test/fixtures/conditionalOperators.c'), 'utf8');
await Parser.init();

test('highlights conditional punctuation without capturing other colons and preserves edited queries', async () => {
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

    let source = Source;
    for (const [before, after, hasError] of [
      ['selected = a ? b :', 'selected = a ? longChoice :', false],
      ['selected = a ? longChoice :', 'selected = a ? b :', false],
      ['selected = a ? b :', 'selected = a  b :', true],
      ['selected = a  b :', 'selected = a ? b :', false],
    ] as const) {
      const start = source.indexOf(before);
      expect(start).toBeGreaterThanOrEqual(0);
      const next = source.slice(0, start) + after + source.slice(start + before.length);
      tree.edit(
        new Edit({
          startIndex: start,
          oldEndIndex: start + before.length,
          newEndIndex: start + after.length,
          startPosition: point(source, start),
          oldEndPosition: point(source, start + before.length),
          newEndPosition: point(next, start + after.length),
        })
      );
      let incremental: Tree | undefined;
      let fresh: Tree | undefined;
      try {
        incremental = parser.parse(next, tree)!;
        fresh = parser.parse(next)!;
        expect(incremental.rootNode.hasError).toBe(hasError);
        expect(snapshot(incremental.rootNode)).toEqual(snapshot(fresh.rootNode));
        for (const query of queries) {
          expect(query.captures(incremental.rootNode).map(({ name, node }) => [name, snapshot(node)])).toEqual(
            query.captures(fresh.rootNode).map(({ name, node }) => [name, snapshot(node)])
          );
        }
        if (!hasError) {
          const expression = incremental.rootNode.descendantsOfType('conditional_expression')[0]!;
          expect(expression.childForFieldName('condition')?.text).toBe('a');
          expect(expression.childForFieldName('consequence')?.text).toBe(
            after.includes('longChoice') ? 'longChoice' : 'b'
          );
          expect(expression.childForFieldName('alternative')?.text).toBe('(b ? c : a)');
          for (const node of expression.children.filter((node) => ['?', ':'].includes(node.type))) {
            expect(
              queries[0]!
                .captures(incremental.rootNode)
                .filter((capture) => capture.name === 'operator' && capture.node.id === node.id)
            ).toHaveLength(1);
            expect(next.slice(node.startIndex, node.endIndex)).toBe(node.type);
          }
        }
        tree.delete();
        tree = incremental;
        incremental = undefined;
        source = next;
      } finally {
        incremental?.delete();
        fresh?.delete();
      }
    }
    expect(source).toBe(Source);
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

function snapshot(node: Node): unknown {
  return {
    type: node.type,
    named: node.isNamed,
    extra: node.isExtra,
    missing: node.isMissing,
    error: node.hasError,
    start: node.startIndex,
    end: node.endIndex,
    startPosition: node.startPosition,
    endPosition: node.endPosition,
    children: node.children.map((child, index) => [node.fieldNameForChild(index), snapshot(child)]),
  };
}
