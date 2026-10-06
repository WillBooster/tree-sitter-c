import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from 'vitest';

import { Edit, Language, Parser, Query, type Node, type Tree } from '@willbooster/web-tree-sitter';

import treeSitterJson from '../../tree-sitter.json';

const Root = path.join(import.meta.dirname, '../..');
const Source = fs.readFileSync(path.join(Root, 'test/fixtures/genericSelections.c'), 'utf8');
await Parser.init();

test('highlights nested generic selections and preserves edited query ownership', async () => {
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

    let source = Source;
    for (const [oldInput, newExpression, malformed] of [
      ['value,', 'value + 1', false],
      ['value + 1,', 'value', false],
      ['value,', 'value', true],
      ['value', 'value', false],
    ] as const) {
      const start = source.indexOf('_Generic(') + '_Generic('.length;
      const oldEnd = source.indexOf(' int:', start);
      expect(source.slice(start, oldEnd)).toBe(oldInput);
      const replacement = `${newExpression}${malformed ? '' : ','}`;
      const next = source.slice(0, start) + replacement + source.slice(oldEnd);
      tree.edit(
        new Edit({
          startIndex: start,
          oldEndIndex: oldEnd,
          newEndIndex: start + replacement.length,
          startPosition: point(source, start),
          oldEndPosition: point(source, oldEnd),
          newEndPosition: point(next, start + replacement.length),
        })
      );
      let incremental: Tree | undefined;
      let fresh: Tree | undefined;
      try {
        incremental = parser.parse(next, tree)!;
        fresh = parser.parse(next)!;
        expect(incremental.rootNode.hasError).toBe(malformed);
        expect(snapshot(incremental.rootNode)).toEqual(snapshot(fresh.rootNode));
        for (const query of queries)
          expect(query.captures(incremental.rootNode).map(({ name, node }) => [name, snapshot(node)])).toEqual(
            query.captures(fresh.rootNode).map(({ name, node }) => [name, snapshot(node)])
          );
        if (!malformed) {
          const editedSelections = incremental.rootNode.descendantsOfType('generic_expression');
          expect(editedSelections).toHaveLength(3);
          expect(editedSelections[0]!.namedChildren[0]!.text).toBe(newExpression);
          for (const selection of editedSelections) {
            const keyword = selection.children[0]!;
            expect(
              queries[0]!
                .captures(incremental.rootNode)
                .filter((capture) => capture.name === 'keyword' && capture.node.id === keyword.id)
            ).toHaveLength(1);
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
