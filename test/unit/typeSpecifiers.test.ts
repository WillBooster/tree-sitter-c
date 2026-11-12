import { Language, type Node, Parser, type Tree } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

import { collectCaptures, hasSupertype } from '../helpers/ast.ts';

test('preserves sized declaration and enum base types', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser().setLanguage(language);
  const tree = parser.parse('unsigned char a; unsigned _BitInt(8) b; enum E : unsigned char { A };');
  try {
    expect(tree?.rootNode.hasError).toBe(false);
    const types = collectCaptures(tree!.rootNode, (node, emit) => {
      if (node.type === 'declaration') {
        const type = node.childForFieldName('type');
        if (hasSupertype(language, type, 'type_specifier')) emit('type', type);
      } else if (node.type === 'enum_specifier') {
        const underlying = node.childForFieldName('underlying_type');
        if (underlying?.type === 'sized_type_specifier') emit('type', underlying);
      }
    });
    expect(types.map(({ node }) => node.text)).toEqual(['unsigned char', 'unsigned _BitInt(8)', 'unsigned char']);
  } finally {
    tree?.delete();
    parser.delete();
  }
});

test('preserves pointer declarators for old-style and prototype signatures', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser().setLanguage(language);
  const signatures = [
    ['int *f(a) int a; ', ['*f(a)']],
    ['int *f(int a) ', ['*f(int a)']],
    ['int **f(a) int a; ', ['**f(a)', '*f(a)']],
    ['int **f(int a) ', ['**f(int a)', '*f(int a)']],
    ['int *const f(a) int a; ', ['*const f(a)']],
    ['int *const f(int a) ', ['*const f(int a)']],
  ] as const;
  try {
    for (const [prefix, expectedPointers] of signatures) {
      const tree = parser.parse(`${prefix}{ return 0; }`)!;
      try {
        expect(tree.rootNode.hasError).toBe(false);
        expect(tree.rootNode.descendantsOfType('pointer_declarator').map((node) => node.text)).toEqual(
          expectedPointers
        );
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('keeps control flow after macros followed by ordinary declarations', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser().setLanguage(language);
  const source = `
#include <stddef.h>
#define BEGIN(...)
#define END(...)
void f(void) {
  BEGIN(setup())
  struct S *p;
  size_t count;
  if (count == 1) { p = 0; }
  END(stop())
}
`;
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.descendantsOfType('function_definition')).toHaveLength(1);
    expect(tree.rootNode.descendantsOfType('if_statement').map((node) => node.text)).toEqual([
      'if (count == 1) { p = 0; }',
    ]);
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('keeps assignments following malformed macro arguments', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser().setLanguage(language);
  const source = `void f(void) {
  int test_res;
  test_res = TEST(t_skip(), "test_skip()");
  TEST(check_int(test_res, ==, 1), "skipped test returns 1");
  test_res = TEST(t_skip_todo(), "test_skip() inside TEST_TODO()");
}`;
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(true);
    expect(tree.rootNode.descendantsOfType('expression_statement')).toHaveLength(3);
    expect(tree.rootNode.descendantsOfType('assignment_expression').map((node) => node.text)).toEqual([
      'test_res = TEST(t_skip(), "test_skip()")',
      'test_res = TEST(t_skip_todo(), "test_skip() inside TEST_TODO()")',
    ]);
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('keeps macro-decorated declaration names during recovery', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser().setLanguage(language);
  const source = `API_TYPE(Result)
read_value PARAMS((
  CONST Reader *r,
  struct Value *v )) DEPRECATED(V1, "replacement");
int after;
void other(void);`;
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(true);
    const captures = collectCaptures(tree.rootNode, (node, emit) => {
      if (node.type !== 'declaration') return;
      const type = node.childForFieldName('type');
      const macroName = type?.type === 'macro_type_specifier' ? type.childForFieldName('name') : undefined;
      const declarator = node.childForFieldName('declarator');
      if (macroName?.type === 'identifier' && declarator?.type === 'identifier') {
        emit('macro', macroName);
        emit('name', declarator);
      }
    });
    expect(captures.map(({ name, node }) => [name, node.text])).toEqual([
      ['macro', 'API_TYPE'],
      ['name', 'read_value'],
    ]);
    expect(
      tree.rootNode.namedChildren
        .filter((node) => node.type === 'declaration')
        .map((node) => node.childForFieldName('declarator')?.text)
        .slice(-2)
    ).toEqual(['after', 'other(void)']);
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('keeps known type constructors after marker prefixes', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser();
  let ownedTree: Tree | undefined;
  try {
    parser.setLanguage(language);
    const keywords = ['typeof', '__typeof', '__typeof__', 'typeof_unqual', '__typeof_unqual', '__typeof_unqual__'];
    const types = [...keywords.map((keyword) => `${keyword}(int)`), '_Atomic(int)', '_BitInt(8)', 'TYPE(int)'];
    const parameter = 'struct { int z; } p';
    const source = `#define MARK\n#define TYPE(...) __VA_ARGS__\n${types.map((type, index) => `MARK const ${type} f${index}(${parameter});`).join('\n')}\nint next;\n`;
    let tree = parser.parse(source)!;
    ownedTree = tree;
    const check = (): void => {
      expect(tree.rootNode.hasError).toBe(false);
      const declarations = tree.rootNode.namedChildren.filter((node) => node.type === 'declaration');
      expect(declarations.map((node) => node.childForFieldName('type')?.type)).toEqual([
        ...keywords.map(() => 'typeof_specifier'),
        'atomic_type_specifier',
        'bit_int_specifier',
        'macro_type_specifier',
        'primitive_type',
      ]);
      expect(declarations.map((node) => node.childForFieldName('type')?.text)).toEqual([...types, 'int']);
      expect(declarations.at(-1)?.text).toBe('int next;');
    };
    check();
    const typeofDeclarations = tree.rootNode.descendantsOfType('declaration').flatMap((node) => {
      const type = node.childForFieldName('type');
      const declarator = node.childForFieldName('declarator');
      const fnName =
        declarator?.type === 'function_declarator' ? declarator.childForFieldName('declarator') : undefined;
      return type?.type === 'typeof_specifier' && fnName?.type === 'identifier'
        ? [{ returnType: type.text, returnName: fnName.text }]
        : [];
    });
    expect(typeofDeclarations.map(({ returnType }) => returnType)).toEqual(
      keywords.map((keyword) => `${keyword}(int)`)
    );
    expect(typeofDeclarations.map(({ returnName }) => returnName)).toEqual(keywords.map((_, index) => `f${index}`));
    tree = parser.parse(source.replaceAll(parameter, 'int p'))!;
    ownedTree.delete();
    ownedTree = tree;
    check();
  } finally {
    ownedTree?.delete();
    parser.delete();
  }
});

test('preserves compound literal fields', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser().setLanguage(language);
  const source = 'void f(void){(static /* storage */ thread_local int){42}; (constexpr int){7};}';
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    const roles = collectCompoundLiteralRoles(tree.rootNode);
    expect(roles.storage).toEqual(['static', 'thread_local']);
    expect(roles.types).toEqual(['int', 'constexpr int']);
    expect(roles.values).toEqual(['{42}', '{7}']);
    for (const variant of [
      source.replace('static', 'register').replace('thread_local ', ''),
      source.replace('static /* storage */ thread_local ', ''),
    ]) {
      const variantTree = parser.parse(variant)!;
      try {
        expect(variantTree.rootNode.hasError).toBe(false);
      } finally {
        variantTree.delete();
      }
    }
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('keeps constexpr recovery fields in compound literals', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser().setLanguage(language);
  const tree = parser.parse('void f(void){(constexpr _Atomic(int)){0};}')!;
  try {
    const roles = collectCompoundLiteralRoles(tree.rootNode);
    expect(roles.storage).toEqual([]);
    expect(roles.types).toEqual(['constexpr _Atomic(int)']);
    expect(
      tree.rootNode
        .descendantsOfType('type_qualifier')
        .filter((node) => node.text === 'constexpr')
        .map((node) => node.text)
    ).toEqual(['constexpr']);
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('preserves thread_local typedef names in compound literal roles', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser().setLanguage(language);
  const source = 'typedef int thread_local; void f(void){(thread_local){0};}';
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    const roles = collectCompoundLiteralRoles(tree.rootNode);
    expect(roles.storage).toEqual([]);
    expect(roles.types).toEqual(['thread_local']);
    expect(roles.values).toEqual(['{0}']);
    for (const variant of [
      source.replace('(thread_local)', '(static thread_local int)'),
      source.replace('(thread_local)', '(thread_local *)'),
      source.replace('(thread_local)', '(const thread_local)'),
    ]) {
      const variantTree = parser.parse(variant)!;
      try {
        expect(variantTree.rootNode.hasError).toBe(false);
      } finally {
        variantTree.delete();
      }
    }
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('keeps multiplication expressions distinct from macro-decorated pointers', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser().setLanguage(language);
  try {
    for (const depth of [0, 1, 2, 24]) {
      const source = `void f(int a, int b, int ${'*'.repeat(depth)}c) { a * b ${'*'.repeat(depth + 1)}c; }`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError).toBe(false);
        const statement = tree.rootNode.descendantsOfType('compound_statement')[0]!.namedChildren[0]!;
        expect(statement.type).toBe('expression_statement');
        expect(statement.descendantsOfType('binary_expression')).toHaveLength(2);
        expect(statement.descendantsOfType('pointer_expression')).toHaveLength(depth);
        expect(statement.descendantsOfType('macro_specifier')).toHaveLength(0);
      } finally {
        tree.delete();
      }
    }
    const tree = parser.parse(`typedef int T;
T *global;
T **deep_global;
void typed(T *parameter) { T *local; T **other; parameter = local; }`)!;
    try {
      expect(tree.rootNode.hasError).toBe(false);
      expect(tree.rootNode.descendantsOfType('declaration').map((node) => node.text)).toEqual([
        'T *global;',
        'T **deep_global;',
        'T *local;',
        'T **other;',
      ]);
      expect(tree.rootNode.descendantsOfType('parameter_declaration')[0]!.childForFieldName('declarator')!.text).toBe(
        '*parameter'
      );
      expect(tree.rootNode.descendantsOfType('assignment_expression').map((node) => node.text)).toEqual([
        'parameter = local',
      ]);
    } finally {
      tree.delete();
    }
  } finally {
    parser.delete();
  }
});

test('keeps prefix markers separate from sized declaration types', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser().setLanguage(language);
  const tree = parser.parse(`#define API
API unsigned long counter;
API long function(void);
API unsigned flag(void);
API signed char byte;`)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    const declarations = tree.rootNode.descendantsOfType('declaration');
    expect(declarations.map((node) => node.childForFieldName('type')!.text)).toEqual([
      'unsigned long',
      'long',
      'unsigned',
      'signed char',
    ]);
    expect(declarations.map((node) => node.descendantsOfType('macro_specifier').map((marker) => marker.text))).toEqual([
      ['API'],
      ['API'],
      ['API'],
      ['API'],
    ]);
    expect(tree.rootNode.descendantsOfType('type_identifier')).toHaveLength(0);
  } finally {
    tree.delete();
    parser.delete();
  }
});

function collectCompoundLiteralRoles(root: Node): { storage: string[]; types: string[]; values: string[] } {
  const literals = root.descendantsOfType('compound_literal_expression');
  return {
    storage: literals.flatMap((node) =>
      node
        .childrenForFieldName('storage_class')
        .filter((child) => child.type === 'storage_class_specifier')
        .map((child) => child.text)
    ),
    types: literals.flatMap((node) => {
      const type = node.childForFieldName('type');
      return type?.type === 'type_descriptor' ? [type.text] : [];
    }),
    values: literals.flatMap((node) => {
      const type = node.childForFieldName('type');
      const value = node.childForFieldName('value');
      return type?.type === 'type_descriptor' && value?.type === 'initializer_list' ? [value.text] : [];
    }),
  };
}
