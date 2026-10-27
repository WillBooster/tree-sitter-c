import { Edit, Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test('follows parenthesized declarator fields through nested declarations and edits', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser().setLanguage(language);
  const kinds = ['parenthesized_declarator', 'abstract_parenthesized_declarator'];
  const query = new Query(language, kinds.map((kind) => `(${kind} declarator: (_) @inner)`).join('\n'));
  const source =
    'typedef int (*Callback)(void);\nstruct S { int (*field)(void); };\nint (*value)(void);\nvoid f(void) { (void)sizeof(int (*)(void)); }\n';
  let tree = parser.parse(source)!;
  try {
    for (const depth of [1, 4, 12]) {
      const name = 'value';
      const replacement = '('.repeat(depth) + name + ')'.repeat(depth);
      const start = source.indexOf(name);
      const next = source.slice(0, start) + replacement + source.slice(start + name.length);
      tree.edit(
        new Edit({
          startIndex: start,
          oldEndIndex: start + name.length,
          newEndIndex: start + replacement.length,
          startPosition: { row: 2, column: 6 },
          oldEndPosition: { row: 2, column: 11 },
          newEndPosition: { row: 2, column: 6 + replacement.length },
        })
      );
      const edited = parser.parse(next, tree)!;
      const fresh = parser.parse(next)!;
      try {
        expect(edited.rootNode.hasError).toBe(false);
        expect(edited.rootNode.toString()).toBe(fresh.rootNode.toString());
        for (const result of [edited, fresh]) {
          const nodes = result.rootNode.descendantsOfType(kinds);
          expect(new Set(nodes.map((node) => node.type))).toEqual(new Set(kinds));
          expect(query.captures(result.rootNode).map(({ node }) => node.text)).toEqual(
            nodes.map((node) => node.childForFieldName('declarator')!.text)
          );
          for (const node of nodes) {
            const child = node.childForFieldName('declarator')!;
            expect(child).toBeDefined();
            expect(next.slice(child.startIndex, child.endIndex)).toBe(child.text);
          }
          let declarator = result.rootNode.descendantsOfType('declaration')[0]!.childForFieldName('declarator')!;
          while (declarator.childForFieldName('declarator')) declarator = declarator.childForFieldName('declarator')!;
          expect(declarator.text).toBe(name);
        }
      } finally {
        edited.delete();
        fresh.delete();
      }
      tree.delete();
      tree = parser.parse(source)!;
    }
  } finally {
    tree.delete();
    query.delete();
    parser.delete();
  }
});
