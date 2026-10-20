import { Edit, Language, Parser, Query, type Node } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

const source = `void build_ui(void) {
  Node *node = ui_node({
    .name = "container",
    .padding = { 10, 20, 30, 40 },
    .children = { { .name = "first" }, { .name = "second" } },
  });
  ui_push_parent(node);
  ui_node({ .name = "item", .padding = { 4, 4, 4, 4 }, });
  int after = 42;
  BODY({ int local = 1; use(local); });
  EMPTY({});
}
void following(void) {}
`;

test('preserves nested braced macro initializers, blocks, and following declarations across edits', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser();
  parser.setLanguage(language);
  let tree = parser.parse(source)!;
  let query: Query | undefined;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    query = new Query(
      language,
      '(call_expression function: (identifier) @call arguments: (argument_list (initializer_list) @initializer)) (declaration declarator: (init_declarator declarator: (identifier) @declaration))'
    );
    expect(
      tree.rootNode.descendantsOfType('function_definition').map((node) => node.childForFieldName('declarator')?.text)
    ).toEqual(['build_ui(void)', 'following(void)']);
    const captures = query.captures(tree.rootNode);
    expect(captures.filter(({ name }) => name === 'call').map(({ node }) => node.text)).toEqual(['ui_node', 'ui_node']);
    const initializers = captures.filter(({ name }) => name === 'initializer').map(({ node }) => node);
    expect(initializers).toHaveLength(2);
    expect(initializers[0]!.descendantsOfType('field_designator').map((node) => node.text)).toEqual([
      '.name',
      '.padding',
      '.children',
      '.name',
      '.name',
    ]);
    expect(initializers[0]!.descendantsOfType('initializer_list').map((node) => node.text)).toContain(
      '{ 10, 20, 30, 40 }'
    );
    expect(captures.filter(({ name }) => name === 'declaration').map(({ node }) => node.text)).toEqual([
      'after',
      'local',
    ]);
    const blocks = tree.rootNode
      .descendantsOfType('call_expression')
      .filter((node) => ['BODY', 'EMPTY'].includes(node.childForFieldName('function')?.text ?? ''));
    expect(blocks.map((node) => node.childForFieldName('arguments')?.namedChildren[0]?.type)).toEqual([
      'compound_statement',
      'compound_statement',
    ]);
    let current = source;
    for (const replacement of ['{ 1, 2 }', '{ { .size = 3 }, { .size = 4 } }', '{ 10, 20, 30, 40 }']) {
      const startIndex = current.indexOf('.padding = ') + '.padding = '.length;
      const oldEndIndex = current.indexOf(',\n    .children', startIndex);
      const next = current.slice(0, startIndex) + replacement + current.slice(oldEndIndex);
      tree.edit(
        new Edit({
          startIndex,
          oldEndIndex,
          newEndIndex: startIndex + replacement.length,
          startPosition: pointAt(current, startIndex),
          oldEndPosition: pointAt(current, oldEndIndex),
          newEndPosition: pointAt(next, startIndex + replacement.length),
        })
      );
      const incremental = parser.parse(next, tree)!;
      tree.delete();
      tree = incremental;
      const fresh = parser.parse(next)!;
      try {
        expect(tree.rootNode.hasError).toBe(false);
        expect(snapshot(tree.rootNode)).toEqual(snapshot(fresh.rootNode));
        expect(query.captures(tree.rootNode).map(({ name, node }) => ({ name, node: snapshot(node) }))).toEqual(
          query.captures(fresh.rootNode).map(({ name, node }) => ({ name, node: snapshot(node) }))
        );
      } finally {
        fresh.delete();
      }
      current = next;
    }
  } finally {
    query?.delete();
    tree.delete();
    parser.delete();
  }
});

test.each(['#pragma mark items', '#include "items.h"', '#undef VALUE'])(
  'preserves initializer and block arguments beginning with %s',
  async (directive) => {
    await Parser.init();
    const language = await Language.load('tree-sitter-c.wasm');
    const parser = new Parser();
    parser.setLanguage(language);
    const source = `int array[] = {
${directive}
1, 2
};
void f(void) {
  values({
${directive}
1, 2
});
  named({
${directive}
.value = 3,
});
  BODY({
${directive}
int local; use(local);
});
  int after;
}
`;
    let tree = parser.parse(source)!;
    let query: Query | undefined;
    try {
      expect(tree.rootNode.hasError).toBe(false);
      query = new Query(
        language,
        '(call_expression function: (identifier) @call arguments: (argument_list (initializer_list) @initializer))'
      );
      expect(
        query
          .captures(tree.rootNode)
          .filter(({ name }) => name === 'call')
          .map(({ node }) => node.text)
      ).toEqual(['values', 'named']);
      const initializers = query
        .captures(tree.rootNode)
        .filter(({ name }) => name === 'initializer')
        .map(({ node }) => node);
      expect(initializers.map((node) => node.namedChildren[0]!.type)).toEqual(
        directive.startsWith('#include') ? ['preproc_include', 'preproc_include'] : ['preproc_call', 'preproc_call']
      );
      if (directive.startsWith('#include')) {
        expect(initializers.map((node) => node.namedChildren[0]!.childForFieldName('path')?.text)).toEqual([
          '"items.h"',
          '"items.h"',
        ]);
      }
      const body = tree.rootNode
        .descendantsOfType('call_expression')
        .find((node) => node.childForFieldName('function')?.text === 'BODY')!;
      expect(body.childForFieldName('arguments')!.namedChildren[0]!.type).toBe('compound_statement');
      const after = tree.rootNode
        .descendantsOfType('declaration')
        .find((node) => node.childForFieldName('declarator')?.text === 'after');
      expect(after?.text).toBe('int after;');
      const startIndex = source.indexOf('1, 2', source.indexOf('values('));
      const next = source.slice(0, startIndex) + '10, 20' + source.slice(startIndex + 4);
      tree.edit(
        new Edit({
          startIndex,
          oldEndIndex: startIndex + 4,
          newEndIndex: startIndex + 6,
          startPosition: pointAt(source, startIndex),
          oldEndPosition: pointAt(source, startIndex + 4),
          newEndPosition: pointAt(next, startIndex + 6),
        })
      );
      const incremental = parser.parse(next, tree)!;
      tree.delete();
      tree = incremental;
      const fresh = parser.parse(next)!;
      try {
        expect(tree.rootNode.hasError).toBe(false);
        expect(snapshot(tree.rootNode)).toEqual(snapshot(fresh.rootNode));
        expect(query.captures(tree.rootNode).map(({ name, node }) => ({ name, node: snapshot(node) }))).toEqual(
          query.captures(fresh.rootNode).map(({ name, node }) => ({ name, node: snapshot(node) }))
        );
      } finally {
        fresh.delete();
      }
    } finally {
      query?.delete();
      tree.delete();
      parser.delete();
    }
  }
);

function pointAt(text: string, index: number): { row: number; column: number } {
  const lines = text.slice(0, index).split('\n');
  return { row: lines.length - 1, column: lines.at(-1)!.length };
}

function snapshot(node: Node): unknown {
  return {
    type: node.type,
    named: node.isNamed,
    extra: node.isExtra,
    missing: node.isMissing,
    error: node.isError,
    start: node.startIndex,
    end: node.endIndex,
    startPosition: node.startPosition,
    endPosition: node.endPosition,
    text: node.text,
    children: node.children.map((child, index) => [node.fieldNameForChild(index), snapshot(child)]),
  };
}
