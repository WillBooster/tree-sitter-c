import fs from 'node:fs';

import { Edit, Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test('preserves type query captures for sized declarations and enum bases', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser();
  parser.setLanguage(language);
  const tree = parser.parse('unsigned char a; unsigned _BitInt(8) b; enum E : unsigned char { A };');
  const query = new Query(
    language,
    '(declaration type: (type_specifier) @type) (enum_specifier underlying_type: (sized_type_specifier) @type)'
  );
  try {
    expect(tree?.rootNode.hasError).toBe(false);
    expect(query.captures(tree!.rootNode).map(({ node }) => node.text)).toEqual([
      'unsigned char',
      'unsigned _BitInt(8)',
      'unsigned char',
    ]);
  } finally {
    query.delete();
    tree?.delete();
    parser.delete();
  }
});

test('preserves declarator supertype queries across old-style signature edits', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser();
  parser.setLanguage(language);
  const signatures = [
    ['int *f(a) int a; ', ['*f(a)']],
    ['int *f(int a) ', ['*f(int a)']],
    ['int **f(a) int a; ', ['**f(a)', '*f(a)']],
    ['int **f(int a) ', ['**f(int a)', '*f(int a)']],
    ['int *const f(a) int a; ', ['*const f(a)']],
    ['int *const f(int a) ', ['*const f(int a)']],
    ['int *f(a) int a; ', ['*f(a)']],
  ] as const;
  const kinds = ['pointer_declarator', 'function_declarator'];
  const qualified = new Query(language, kinds.map((kind) => `(_declarator/${kind}) @${kind}`).join('\n'));
  const plain = new Query(language, kinds.map((kind) => `(${kind}) @${kind}`).join('\n'));
  let prefix: string = signatures[0][0];
  let tree = parser.parse(`${prefix}{ return 0; }`)!;
  const captures = (
    query: Query,
    root: typeof tree.rootNode
  ): { name: string; text: string; start: number; end: number }[] =>
    query
      .captures(root)
      .map(({ name, node }) => ({ name, text: node.text, start: node.startIndex, end: node.endIndex }));
  try {
    for (const [nextPrefix, expectedPointers] of signatures) {
      tree.edit(
        new Edit({
          startIndex: 0,
          oldEndIndex: prefix.length,
          newEndIndex: nextPrefix.length,
          startPosition: { row: 0, column: 0 },
          oldEndPosition: { row: 0, column: prefix.length },
          newEndPosition: { row: 0, column: nextPrefix.length },
        })
      );
      const source = `${nextPrefix}{ return 0; }`;
      const incremental = parser.parse(source, tree)!;
      tree.delete();
      tree = incremental;
      const fresh = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError).toBe(false);
        expect(tree.rootNode.toString()).toBe(fresh.rootNode.toString());
        const result = captures(qualified, tree.rootNode);
        expect(result).toEqual(captures(plain, tree.rootNode));
        expect(result).toEqual(captures(qualified, fresh.rootNode));
        expect(result.filter(({ name }) => name === 'pointer_declarator').map(({ text }) => text)).toEqual(
          expectedPointers
        );
      } finally {
        fresh.delete();
      }
      prefix = nextPrefix;
    }
  } finally {
    qualified.delete();
    plain.delete();
    tree.delete();
    parser.delete();
  }
});

test('keeps control flow after macros followed by ordinary declarations', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser();
  parser.setLanguage(language);
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
  const query = new Query(language, '(function_definition) @function (if_statement) @condition');
  try {
    const captures = query.captures(tree.rootNode);
    expect(captures.filter(({ name }) => name === 'function')).toHaveLength(1);
    expect(captures.filter(({ name }) => name === 'condition').map(({ node }) => node.text)).toEqual([
      'if (count == 1) { p = 0; }',
    ]);
  } finally {
    query.delete();
    tree.delete();
    parser.delete();
  }
});

test('keeps assignments following malformed macro arguments', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser();
  parser.setLanguage(language);
  const source = `void f(void) {
  int test_res;
  test_res = TEST(t_skip(), "test_skip()");
  TEST(check_int(test_res, ==, 1), "skipped test returns 1");
  test_res = TEST(t_skip_todo(), "test_skip() inside TEST_TODO()");
}`;
  const tree = parser.parse(source)!;
  const query = new Query(language, '(assignment_expression) @assignment');
  try {
    expect(tree.rootNode.hasError).toBe(true);
    expect(tree.rootNode.descendantsOfType('expression_statement')).toHaveLength(3);
    expect(query.captures(tree.rootNode).map(({ node }) => node.text)).toEqual([
      'test_res = TEST(t_skip(), "test_skip()")',
      'test_res = TEST(t_skip_todo(), "test_skip() inside TEST_TODO()")',
    ]);
  } finally {
    query.delete();
    tree.delete();
    parser.delete();
  }
});

test('keeps macro-decorated declaration names during recovery', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser();
  parser.setLanguage(language);
  const source = `API_TYPE(Result)
read_value PARAMS((
  CONST Reader *r,
  struct Value *v )) DEPRECATED(V1, "replacement");
int after;
void other(void);`;
  const tree = parser.parse(source)!;
  const query = new Query(
    language,
    '(declaration type: (macro_type_specifier name: (identifier) @macro) declarator: (identifier) @name)'
  );
  try {
    expect(tree.rootNode.hasError).toBe(true);
    expect(query.captures(tree.rootNode).map(({ name, node }) => [name, node.text])).toEqual([
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
    query.delete();
    tree.delete();
    parser.delete();
  }
});

test('keeps known type constructors and keyword captures after marker prefixes', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser().setLanguage(language);
  const keywords = ['typeof', '__typeof', '__typeof__', 'typeof_unqual', '__typeof_unqual', '__typeof_unqual__'];
  const types = [...keywords.map((keyword) => `${keyword}(int)`), '_Atomic(int)', '_BitInt(8)', 'TYPE(int)'];
  const parameter = 'struct { int z; } p';
  const source = `#define MARK\n#define TYPE(...) __VA_ARGS__\n${types.map((type, index) => `MARK const ${type} f${index}(${parameter});`).join('\n')}\nint next;\n`;
  let currentSource = source;
  let tree = parser.parse(source)!;
  const query = new Query(
    language,
    fs.readFileSync(new URL('../../queries/highlights.scm', import.meta.url), 'utf8') +
      '\n(declaration type: (typeof_specifier) @return.type declarator: (function_declarator declarator: (identifier) @return.name))'
  );
  const captures = (root: typeof tree.rootNode): Array<[string, string, number, number]> =>
    query.captures(root).map(({ name, node }) => [name, node.text, node.startIndex, node.endIndex]);
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
    const result = query.captures(tree.rootNode);
    expect(result.filter(({ name }) => name === 'return.type').map(({ node }) => node.text)).toEqual(
      keywords.map((keyword) => `${keyword}(int)`)
    );
    expect(result.filter(({ name }) => name === 'return.name').map(({ node }) => node.text)).toEqual(
      keywords.map((_, index) => `f${index}`)
    );
    expect(
      result.filter(({ name, node }) => name === 'keyword' && keywords.includes(node.text)).map(({ node }) => node.text)
    ).toEqual(keywords);
  };
  try {
    check();
    let oldParameter = parameter;
    for (const nextParameter of ['int p', parameter]) {
      const at = currentSource.indexOf(oldParameter);
      const prefix = currentSource.slice(0, at);
      const row = prefix.split('\n').length - 1;
      const column = at - prefix.lastIndexOf('\n') - 1;
      tree.edit(
        new Edit({
          startIndex: at,
          oldEndIndex: at + oldParameter.length,
          newEndIndex: at + nextParameter.length,
          startPosition: { row, column },
          oldEndPosition: { row, column: column + oldParameter.length },
          newEndPosition: { row, column: column + nextParameter.length },
        })
      );
      currentSource = currentSource.slice(0, at) + nextParameter + currentSource.slice(at + oldParameter.length);
      const incremental = parser.parse(currentSource, tree)!;
      tree.delete();
      tree = incremental;
      const fresh = parser.parse(currentSource)!;
      try {
        check();
        expect(tree.rootNode.toString()).toBe(fresh.rootNode.toString());
        expect(captures(tree.rootNode)).toEqual(captures(fresh.rootNode));
      } finally {
        fresh.delete();
      }
      oldParameter = nextParameter;
    }
  } finally {
    query.delete();
    tree.delete();
    parser.delete();
  }
});

test('preserves compound literal fields and queries across storage-class edits', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser();
  parser.setLanguage(language);
  const source = 'void f(void){(static /* storage */ thread_local int){42}; (constexpr int){7};}';
  let tree = parser.parse(source)!;
  let query: Query | undefined;
  try {
    query = new Query(
      language,
      '(compound_literal_expression storage_class: (storage_class_specifier) @storage) (compound_literal_expression type: (type_descriptor) @type value: (initializer_list) @value) (expression/compound_literal_expression) @expression'
    );
    const snapshot = (root: typeof tree.rootNode): { name: string; text: string; start: number; end: number }[] =>
      query!
        .captures(root)
        .map(({ name, node }) => ({ name, text: node.text, start: node.startIndex, end: node.endIndex }));
    expect(tree.rootNode.hasError).toBe(false);
    expect(
      query
        .captures(tree.rootNode)
        .filter(({ name }) => name === 'storage')
        .map(({ node }) => node.text)
    ).toEqual(['static', 'thread_local']);
    expect(
      query
        .captures(tree.rootNode)
        .filter(({ name }) => name === 'type')
        .map(({ node }) => node.text)
    ).toEqual(['int', 'constexpr int']);
    expect(
      query
        .captures(tree.rootNode)
        .filter(({ name }) => name === 'value')
        .map(({ node }) => node.text)
    ).toEqual(['{42}', '{7}']);
    expect(
      query
        .captures(tree.rootNode)
        .filter(({ name }) => name === 'expression')
        .map(({ node }) => node.text)
    ).toEqual(['(static /* storage */ thread_local int){42}', '(constexpr int){7}']);
    let currentSource = source;
    for (const nextSource of [
      source.replace('static', 'register').replace('thread_local ', ''),
      source.replace('static /* storage */ thread_local ', ''),
      source,
    ]) {
      const startIndex = currentSource.indexOf('(', currentSource.indexOf('{')) + 1;
      const oldEndIndex = currentSource.indexOf('int)', startIndex);
      const newEndIndex = nextSource.indexOf('int)', startIndex);
      tree.edit(
        new Edit({
          startIndex,
          oldEndIndex,
          newEndIndex,
          startPosition: { row: 0, column: startIndex },
          oldEndPosition: { row: 0, column: oldEndIndex },
          newEndPosition: { row: 0, column: newEndIndex },
        })
      );
      const next = parser.parse(nextSource, tree)!;
      tree.delete();
      tree = next;
      const fresh = parser.parse(nextSource)!;
      try {
        expect(tree.rootNode.hasError).toBe(false);
        expect(tree.rootNode.toString()).toBe(fresh.rootNode.toString());
        expect(snapshot(tree.rootNode)).toEqual(snapshot(fresh.rootNode));
      } finally {
        fresh.delete();
      }
      currentSource = nextSource;
    }
  } finally {
    query?.delete();
    tree.delete();
    parser.delete();
  }
});

test('keeps constexpr recovery fields independent of prefix edit history', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser();
  parser.setLanguage(language);
  const source = 'void f(void){(static _Atomic(int)){0};}';
  let tree = parser.parse(source)!;
  let query: Query | undefined;
  try {
    query = new Query(
      language,
      '(compound_literal_expression storage_class: (storage_class_specifier) @storage) (compound_literal_expression type: (type_descriptor) @type) ((type_qualifier) @constexpr (#eq? @constexpr "constexpr"))'
    );
    let currentSource = source;
    for (const nextSource of [source.replace('static', 'constexpr'), source]) {
      const startIndex = source.indexOf('static');
      const oldEndIndex = currentSource.indexOf(' _Atomic');
      const newEndIndex = nextSource.indexOf(' _Atomic');
      tree.edit(
        new Edit({
          startIndex,
          oldEndIndex,
          newEndIndex,
          startPosition: { row: 0, column: startIndex },
          oldEndPosition: { row: 0, column: oldEndIndex },
          newEndPosition: { row: 0, column: newEndIndex },
        })
      );
      const next = parser.parse(nextSource, tree)!;
      tree.delete();
      tree = next;
      const fresh = parser.parse(nextSource)!;
      try {
        expect(tree.rootNode.toString()).toBe(fresh.rootNode.toString());
        const captures = query
          .captures(tree.rootNode)
          .map(({ name, node }) => ({ name, text: node.text, start: node.startIndex, end: node.endIndex }));
        expect(captures).toEqual(
          query
            .captures(fresh.rootNode)
            .map(({ name, node }) => ({ name, text: node.text, start: node.startIndex, end: node.endIndex }))
        );
        if (nextSource.includes('constexpr')) {
          expect(captures.filter(({ name }) => name === 'storage')).toEqual([]);
          expect(captures.filter(({ name }) => name === 'type').map(({ text }) => text)).toEqual([
            'constexpr _Atomic(int)',
          ]);
          expect(captures.filter(({ name }) => name === 'constexpr').map(({ text }) => text)).toEqual(['constexpr']);
        }
      } finally {
        fresh.delete();
      }
      currentSource = nextSource;
    }
  } finally {
    query?.delete();
    tree.delete();
    parser.delete();
  }
});

test('preserves thread_local typedef queries across compound literal role edits', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser();
  parser.setLanguage(language);
  const source = 'typedef int thread_local; void f(void){(thread_local){0};}';
  let tree = parser.parse(source)!;
  let query: Query | undefined;
  try {
    query = new Query(
      language,
      '(compound_literal_expression storage_class: (storage_class_specifier) @storage) (compound_literal_expression type: (type_descriptor) @type value: (initializer_list) @value) (type_specifier/type_identifier) @typedef (expression/compound_literal_expression) @expression'
    );
    const snapshot = (root: typeof tree.rootNode): { name: string; text: string; start: number; end: number }[] =>
      query!
        .captures(root)
        .map(({ name, node }) => ({ name, text: node.text, start: node.startIndex, end: node.endIndex }));
    expect(tree.rootNode.hasError).toBe(false);
    const captures = snapshot(tree.rootNode);
    expect(captures.filter(({ name }) => name === 'storage')).toEqual([]);
    expect(captures.filter(({ name }) => name === 'type').map(({ text }) => text)).toEqual(['thread_local']);
    expect(captures.filter(({ name }) => name === 'typedef').map(({ text }) => text)).toEqual(['thread_local']);
    expect(captures.filter(({ name }) => name === 'value').map(({ text }) => text)).toEqual(['{0}']);
    expect(captures.filter(({ name }) => name === 'expression').map(({ text }) => text)).toEqual(['(thread_local){0}']);
    let currentSource = source;
    for (const nextSource of [
      source.replace('(thread_local)', '(static thread_local int)'),
      source.replace('(thread_local)', '(thread_local *)'),
      source.replace('(thread_local)', '(const thread_local)'),
      source,
    ]) {
      const startIndex = source.indexOf('(thread_local)') + 1;
      const oldEndIndex = currentSource.indexOf('){0}', startIndex);
      const newEndIndex = nextSource.indexOf('){0}', startIndex);
      tree.edit(
        new Edit({
          startIndex,
          oldEndIndex,
          newEndIndex,
          startPosition: { row: 0, column: startIndex },
          oldEndPosition: { row: 0, column: oldEndIndex },
          newEndPosition: { row: 0, column: newEndIndex },
        })
      );
      const next = parser.parse(nextSource, tree)!;
      tree.delete();
      tree = next;
      const fresh = parser.parse(nextSource)!;
      try {
        expect(tree.rootNode.hasError).toBe(false);
        expect(tree.rootNode.toString()).toBe(fresh.rootNode.toString());
        expect(snapshot(tree.rootNode)).toEqual(snapshot(fresh.rootNode));
      } finally {
        fresh.delete();
      }
      currentSource = nextSource;
    }
  } finally {
    query?.delete();
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
