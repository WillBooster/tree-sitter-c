import { Language, Parser, Query } from '@willbooster/web-tree-sitter';
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

test('preserves nested braced macro initializers, blocks, and following declarations', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser();
  parser.setLanguage(language);
  const tree = parser.parse(source)!;
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
    for (const padding of ['{ 1, 2 }', '{ { .size = 3 }, { .size = 4 } }']) {
      const variant = parser.parse(source.replace('{ 10, 20, 30, 40 }', padding))!;
      try {
        expect(variant.rootNode.hasError).toBe(false);
      } finally {
        variant.delete();
      }
    }
  } finally {
    query?.delete();
    tree.delete();
    parser.delete();
  }
});

test.each([
  '#pragma mark items',
  '#include "items.h"',
  '#include HEADER EMPTY',
  '#include EMPTY HEADER',
  '#include HEADER_OF(items) EMPTY',
  '#include HEADER_PATH(items.h) EMPTY',
  '#include HEADER /* keep */ EMPTY',
  '#include HEADER \\\n EMPTY',
  '#undef VALUE',
])('preserves initializer and block arguments beginning with %s', async (directive) => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser();
  parser.setLanguage(language);
  const source = `#define HEADER "items.h"
#define HEADER_OF(name) <name.h>
#define HEADER_PATH(name) <name>
#define EMPTY
int array[] = {
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
  const tree = parser.parse(source)!;
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
        directive.slice('#include '.length),
        directive.slice('#include '.length),
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
    const variant = parser.parse(`${source.slice(0, startIndex)}10, 20${source.slice(startIndex + 4)}`)!;
    try {
      expect(variant.rootNode.hasError).toBe(false);
    } finally {
      variant.delete();
    }
  } finally {
    query?.delete();
    tree.delete();
    parser.delete();
  }
});
