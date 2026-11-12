import { Language, type Node, Parser } from '@willbooster/web-tree-sitter';
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
  const parser = new Parser().setLanguage(language);
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(
      tree.rootNode.descendantsOfType('function_definition').map((node) => node.childForFieldName('declarator')?.text)
    ).toEqual(['build_ui(void)', 'following(void)']);
    const matches = findInitializerCalls(tree.rootNode);
    expect(matches.map(({ call }) => call.text)).toEqual(['ui_node', 'ui_node']);
    const initializers = matches.map(({ initializer }) => initializer);
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
    const initializedDeclarations = tree.rootNode.descendantsOfType('declaration').flatMap((declaration) =>
      declaration.childrenForFieldName('declarator').flatMap((declarator) => {
        if (declarator.type !== 'init_declarator') return [];
        const name = declarator.childForFieldName('declarator');
        return name?.type === 'identifier' ? [name.text] : [];
      })
    );
    expect(initializedDeclarations).toEqual(['after', 'local']);
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
  const parser = new Parser().setLanguage(language);
  const directiveSource = `#define HEADER "items.h"
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
  const tree = parser.parse(directiveSource)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    const matches = findInitializerCalls(tree.rootNode);
    expect(matches.map(({ call }) => call.text)).toEqual(['values', 'named']);
    const initializers = matches.map(({ initializer }) => initializer);
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
    const startIndex = directiveSource.indexOf('1, 2', directiveSource.indexOf('values('));
    const variant = parser.parse(
      `${directiveSource.slice(0, startIndex)}10, 20${directiveSource.slice(startIndex + 4)}`
    )!;
    try {
      expect(variant.rootNode.hasError).toBe(false);
    } finally {
      variant.delete();
    }
  } finally {
    tree.delete();
    parser.delete();
  }
});

function findInitializerCalls(root: Node): Array<{ call: Node; initializer: Node }> {
  return root.descendantsOfType('call_expression').flatMap((expression) => {
    const call = expression.childForFieldName('function');
    const args = expression.childForFieldName('arguments');
    if (call?.type !== 'identifier' || args?.type !== 'argument_list') return [];
    return args.namedChildren
      .filter((child) => child.type === 'initializer_list')
      .map((initializer) => ({ call, initializer }));
  });
}
