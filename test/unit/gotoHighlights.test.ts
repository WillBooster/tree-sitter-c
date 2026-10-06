import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from 'vitest';

import { Edit, Language, Parser, Query, type Node, type Tree } from '@willbooster/web-tree-sitter';

import treeSitterJson from '../../tree-sitter.json';

const Root = path.join(import.meta.dirname, '../..');
const Source = fs.readFileSync(path.join(Root, 'test/fixtures/gotoStatements.c'), 'utf8');
await Parser.init();

test('highlights goto keywords with canonical labels and preserves edited query ownership', async () => {
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
    const statements = tree.rootNode.descendantsOfType('goto_statement');
    expect(statements.map((node) => node.childForFieldName('label')?.text)).toEqual(['done', 'retry']);
    const definitions = tree.rootNode.descendantsOfType('labeled_statement');
    expect(definitions.map((node) => node.childForFieldName('label')?.text)).toEqual(['retry', 'done']);
    const captures = queries[0]!.captures(tree.rootNode);
    for (const statement of statements) {
      const keyword = statement.children.find((node) => node.type === 'goto')!;
      expect(keyword.isNamed).toBe(false);
      expect(keyword.parent?.type).toBe('goto_statement');
      expect(captures.filter((capture) => capture.name === 'keyword' && capture.node.id === keyword.id)).toHaveLength(
        1
      );
      expect(Source.slice(keyword.startIndex, keyword.endIndex)).toBe('goto');
      expect([keyword.startPosition, keyword.endPosition]).toEqual([
        point(Source, keyword.startIndex),
        point(Source, keyword.endIndex),
      ]);
    }
    for (const owner of [...statements, ...definitions]) {
      const label = owner.childForFieldName('label')!;
      expect(label.type).toBe('statement_identifier');
      expect(captures.filter((capture) => capture.name === 'label' && capture.node.id === label.id)).toHaveLength(1);
      expect(captures.filter((capture) => capture.name === 'keyword' && capture.node.id === label.id)).toHaveLength(0);
      expect(Source.slice(label.startIndex, label.endIndex)).toBe(label.text);
      expect([label.startPosition, label.endPosition]).toEqual([
        point(Source, label.startIndex),
        point(Source, label.endIndex),
      ]);
    }
    const literals = captures.filter(({ name }) => ['string', 'comment'].includes(name));
    expect(literals.map(({ node }) => node.text)).toEqual([
      '"goto done retry"',
      '// goto done and goto retry remain comment text.',
    ]);
    for (const { node: literal } of literals) {
      expect(
        captures.filter(
          ({ name, node }) =>
            name === 'keyword' && node.startIndex >= literal.startIndex && node.endIndex <= literal.endIndex
        )
      ).toHaveLength(0);
    }
    const identifiers = tree.rootNode.descendantsOfType('identifier').filter((node) => node.text === 'gotoCount');
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
    ).toEqual(['travel', 'main']);

    let source = Source;
    for (const [oldLabel, newLabel, malformed] of [
      ['done', 'longDone', false],
      ['longDone', 'done', false],
      ['done', 'done', true],
      ['done', 'done', false],
    ] as const) {
      const start = source.indexOf(`goto ${oldLabel}`, source.indexOf('retry:'));
      const oldEnd = source.indexOf(`${oldLabel}:`, start) + oldLabel.length;
      expect(start).toBeGreaterThanOrEqual(0);
      expect(oldEnd).toBeGreaterThan(start);
      const before = source.slice(start, oldEnd);
      let replacement = before.replaceAll(oldLabel, newLabel);
      replacement = malformed
        ? replacement.replace(`goto ${newLabel};`, `goto ${newLabel}`)
        : replacement.replace(`goto ${newLabel}\n`, `goto ${newLabel};\n`);
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
          expect(
            incremental.rootNode
              .descendantsOfType('goto_statement')
              .map((node) => node.childForFieldName('label')?.text)
          ).toEqual([newLabel, 'retry']);
          for (const node of incremental.rootNode.descendantsOfType('goto')) {
            expect(
              queries[0]!
                .captures(incremental.rootNode)
                .filter((capture) => capture.name === 'keyword' && capture.node.id === node.id)
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
