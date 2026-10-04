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
