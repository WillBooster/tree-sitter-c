import fs from 'node:fs';

import { Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test('keeps declarator-free qualifiers within their declarations with and without a declarator', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser().setLanguage(language);
  const qualifiers = new Query(language, '(type_qualifier) @qualifier');
  const tags = new Query(language, fs.readFileSync('queries/tags.scm', 'utf8'));
  const fixture = fs.readFileSync('test/fixtures/qualifierOnlyDeclarations.c', 'utf8');
  try {
    for (const name of [undefined, 'temporary']) {
      const prefix = name ? `long const ${name}` : 'long const';
      const source = prefix + fixture.slice(fixture.indexOf(';'));
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError).toBe(false);
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
        expect(
          tree.rootNode
            .descendantsOfType('declaration')
            .map((node) => [node.childForFieldName('type')?.text, node.childForFieldName('declarator')?.text])
        ).toEqual([...(name ? [['long', name]] : []), ['long', 'named'], ['unsigned', 'next = 1']]);
        if (!name) {
          expect(
            tags
              .captures(tree.rootNode)
              .filter(({ name: capture }) => capture === 'name')
              .map(({ node }) => [node.text, node.startPosition.row, node.endPosition.row])
          ).toEqual([
            ['qualifierOnly', 5, 5],
            ['following', 11, 11],
          ]);
        }
        for (const node of tree.rootNode.descendantsOfType(['sized_type_specifier', 'type_qualifier'])) {
          expect(node.endPosition.row).toBe(node.startPosition.row);
        }
      } finally {
        tree.delete();
      }
    }
  } finally {
    tags.delete();
    qualifiers.delete();
    parser.delete();
  }
});
