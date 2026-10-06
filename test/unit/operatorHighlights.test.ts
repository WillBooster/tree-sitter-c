import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from 'vitest';

import { Edit, Language, Parser, Query, type Node, type Tree } from '@willbooster/web-tree-sitter';

import treeSitterJson from '../../tree-sitter.json';

const Root = path.join(import.meta.dirname, '../..');
const Source = fs.readFileSync(path.join(Root, 'test/fixtures/standardOperators.c'), 'utf8');
await Parser.init();

test('highlights canonical operators while preserving literals and edited query ranges', async () => {
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
    ]);
    expect(operations).toHaveLength(29);
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
      '"/= %= *= <<= >>= &= |= ^= / % <= >= << >> | ^ ~ !"',
    ]);
    expect(captures.filter(({ name }) => name === 'comment').map(({ node }) => node.text)).toEqual([
      '// /= %= *= <<= >>= &= |= ^= / % <= >= << >> | ^ ~ ! remain comment text.',
    ]);
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
    ).toEqual(['calculate', 'main']);

    let source = Source;
    for (const [before, after] of [
      ['a /= b', 'a >>= b'],
      ['a >>= b', 'a /= b'],
    ] as const) {
      const start = source.indexOf(before) + 2;
      const oldOperator = before.slice(2, -2);
      const replacement = after.slice(2, -2);
      expect(start).toBeGreaterThanOrEqual(2);
      const next = source.slice(0, start) + replacement + source.slice(start + oldOperator.length);
      tree.edit(
        new Edit({
          startIndex: start,
          oldEndIndex: start + oldOperator.length,
          newEndIndex: start + replacement.length,
          startPosition: point(source, start),
          oldEndPosition: point(source, start + oldOperator.length),
          newEndPosition: point(next, start + replacement.length),
        })
      );
      let incremental: Tree | undefined;
      let fresh: Tree | undefined;
      try {
        incremental = parser.parse(next, tree)!;
        fresh = parser.parse(next)!;
        expect(incremental.rootNode.hasError).toBe(false);
        expect(snapshot(incremental.rootNode)).toEqual(snapshot(fresh.rootNode));
        for (const query of queries) {
          expect(query.captures(incremental.rootNode).map(({ name, node }) => [name, snapshot(node)])).toEqual(
            query.captures(fresh.rootNode).map(({ name, node }) => [name, snapshot(node)])
          );
        }
        const changed = incremental.rootNode.descendantsOfType('assignment_expression')[0]!;
        const operator = changed.childForFieldName('operator')!;
        expect(changed.childForFieldName('left')?.text).toBe('a');
        expect(changed.childForFieldName('right')?.text).toBe('b');
        expect([operator.type, operator.text, operator.startIndex, operator.endIndex]).toEqual([
          replacement,
          replacement,
          start,
          start + replacement.length,
        ]);
        expect(
          highlights
            .captures(incremental.rootNode)
            .filter(({ name, node }) => name === 'operator' && node.id === operator.id)
        ).toHaveLength(1);
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
