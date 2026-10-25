import fs from 'node:fs';

import { Edit, Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test('keeps declarator-free qualifiers within their declarations across declarator edits', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser().setLanguage(language);
  const qualifiers = new Query(language, '(type_qualifier) @qualifier');
  const tags = new Query(language, fs.readFileSync('queries/tags.scm', 'utf8'));
  let source = fs.readFileSync('test/fixtures/qualifierOnlyDeclarations.c', 'utf8');
  let tree = parser.parse(source)!;
  try {
    for (const name of [undefined, 'temporary', undefined]) {
      const end = source.indexOf(';');
      const prefix = name ? `long const ${name}` : 'long const';
      tree.edit(
        new Edit({
          startIndex: 0,
          oldEndIndex: end,
          newEndIndex: prefix.length,
          startPosition: { row: 0, column: 0 },
          oldEndPosition: { row: 0, column: end },
          newEndPosition: { row: 0, column: prefix.length },
        })
      );
      source = prefix + source.slice(end);
      const incremental = parser.parse(source, tree)!;
      tree.delete();
      tree = incremental;
      const fresh = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError).toBe(false);
        expect(tree.rootNode.toString()).toBe(fresh.rootNode.toString());
        const captures = qualifiers
          .captures(tree.rootNode)
          .map(({ node }) => [node.text, node.startIndex, node.endIndex]);
        expect(captures).toEqual(
          [...source.matchAll(/\b(?:const|volatile)\b/g)].map((match) => [
            match[0],
            match.index,
            match.index + match[0].length,
          ])
        );
        expect(captures).toEqual(
          qualifiers.captures(fresh.rootNode).map(({ node }) => [node.text, node.startIndex, node.endIndex])
        );
        expect(
          tree.rootNode
            .descendantsOfType('declaration')
            .map((node) => [node.childForFieldName('type')?.text, node.childForFieldName('declarator')?.text])
        ).toEqual([...(name ? [['long', name]] : []), ['long', 'named'], ['unsigned', 'next = 1']]);
        expect(
          tags
            .captures(tree.rootNode)
            .filter(({ name: capture }) => capture === 'name')
            .map(({ node }) => [node.text, node.startPosition.row, node.endPosition.row])
        ).toEqual([
          ['qualifierOnly', 5, 5],
          ['following', 11, 11],
        ]);
        for (const node of tree.rootNode.descendantsOfType(['sized_type_specifier', 'type_qualifier'])) {
          expect(node.endPosition.row).toBe(node.startPosition.row);
        }
      } finally {
        fresh.delete();
      }
    }
  } finally {
    tags.delete();
    qualifiers.delete();
    tree.delete();
    parser.delete();
  }
});
