import fs from 'node:fs';
import path from 'node:path';

import { Language, Parser, Query, type Tree } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

import treeSitterJson from '../../tree-sitter.json';

const Root = path.join(import.meta.dirname, '../..');
const Source = fs.readFileSync(path.join(Root, 'test/fixtures/standardOperators.c'), 'utf8');
await Parser.init();

test('highlights canonical operators while preserving literals', async () => {
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
    const highlights = queries[0]!;
    const captures = highlights.captures(tree.rootNode);
    const operations = tree.rootNode.descendantsOfType([
      'assignment_expression',
      'binary_expression',
      'unary_expression',
      'field_expression',
    ]);
    expect(operations).toHaveLength(32);
    for (const operation of operations) {
      const operator = operation.childForFieldName('operator')!;
      expect(operator).toBeDefined();
      expect(operator.isNamed).toBe(false);
      const captured = captures.filter(({ name, node }) => name === 'operator' && node.id === operator.id);
      expect(captured).toHaveLength(1);
      expect([captured[0]!.node.type, captured[0]!.node.text]).toEqual([operator.type, operator.text]);
      expect([captured[0]!.node.startIndex, captured[0]!.node.endIndex]).toEqual([
        operator.startIndex,
        operator.endIndex,
      ]);
      expect([operator.startPosition, operator.endPosition]).toEqual([
        point(Source, operator.startIndex),
        point(Source, operator.endIndex),
      ]);
      expect(Source.slice(operator.startIndex, operator.endIndex)).toBe(operator.text);
    }
    expect(captures.filter(({ name }) => name === 'string').map(({ node }) => node.text)).toEqual([
      '"/= %= *= <<= >>= &= |= ^= / % <= >= << >> | ^ ~ ! . ->"',
    ]);
    expect(captures.filter(({ name }) => name === 'comment').map(({ node }) => node.text)).toEqual([
      '// /= %= *= <<= >>= &= |= ^= / % <= >= << >> | ^ ~ ! . -> remain comment text.',
    ]);
    const designators = tree.rootNode.descendantsOfType('field_designator');
    expect(designators).toHaveLength(2);
    for (const designator of designators) {
      const dot = designator.firstChild!;
      expect(captures.filter(({ name, node }) => name === 'delimiter' && node.id === dot.id)).toHaveLength(1);
      expect(captures.filter(({ name, node }) => name === 'operator' && node.id === dot.id)).toHaveLength(0);
    }
    const operatorCaptures = captures.filter(({ name }) => name === 'operator');
    expect(operatorCaptures.every(({ node }) => !node.isNamed)).toBe(true);
    for (const { node: literal } of captures.filter(({ name }) => ['string', 'comment'].includes(name))) {
      expect(
        operatorCaptures.filter(
          ({ node }) => node.startIndex >= literal.startIndex && node.endIndex <= literal.endIndex
        )
      ).toHaveLength(0);
    }
    expect(
      queries[1]!
        .captures(tree.rootNode)
        .filter(({ name }) => name === 'name')
        .map(({ node }) => node.text)
    ).toEqual(['Value', 'calculate', 'main']);
    const start = Source.indexOf('a /= b') + 2;
    const variant = parser.parse(`${Source.slice(0, start)}>>=${Source.slice(start + 2)}`)!;
    try {
      expect(variant.rootNode.hasError).toBe(false);
      const changed = variant.rootNode.descendantsOfType('assignment_expression')[0]!;
      const operator = changed.childForFieldName('operator')!;
      expect(changed.childForFieldName('left')?.text).toBe('a');
      expect(changed.childForFieldName('right')?.text).toBe('b');
      expect([operator.type, operator.startIndex, operator.endIndex]).toEqual(['>>=', start, start + 3]);
    } finally {
      variant.delete();
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
