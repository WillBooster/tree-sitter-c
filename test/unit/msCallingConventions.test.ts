import fs from 'node:fs';

import { Edit, Language, Parser, Query, type Node } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test('keeps pointer calling-convention captures independent of surrounding declarations', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser().setLanguage(language);
  const query = new Query(language, '(pointer_declarator (ms_call_modifier) @calling_convention)');
  const prototype = 'int __stdcall *f(void);';
  const definition = 'int __stdcall *f(void) { return 0; }';
  const surrounding = 'typedef int __stdcall *Callback(void); struct Holder { int __stdcall *(*factory)(void); };';
  try {
    for (const source of [
      prototype,
      'typedef void(__stdcall *fp)();',
      definition,
      `${prototype}\n${definition}`,
      `${prototype}\n${definition}\n${surrounding}`,
      `${surrounding}\n${prototype}\n${definition}`,
      'int __stdcall **f(void); int __stdcall **f(void) { return 0; }',
    ]) {
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        const expectedModifiers = [...source.matchAll(/__stdcall/g)].map((match) => [
          match[0],
          match.index,
          match.index + match[0].length,
        ]);
        expect(
          query.captures(tree.rootNode).map(({ node }) => [node.text, node.startIndex, node.endIndex]),
          source
        ).toEqual(expectedModifiers);
      } finally {
        tree.delete();
      }
    }
  } finally {
    query.delete();
    parser.delete();
  }
});

test.each(['__cdecl', '__clrcall', '__stdcall', '__fastcall', '__thiscall', '__vectorcall'])(
  'keeps %s before parenthesized callback and abstract declarators',
  async (convention) => {
    await Parser.init();
    const language = await Language.load('tree-sitter-c.wasm');
    const parser = new Parser().setLanguage(language);
    const source = fs.readFileSync('test/fixtures/msBeforeParentheses.c', 'utf8').replaceAll('__stdcall', convention);
    const query = new Query(
      language,
      `
      (parenthesized_declarator (ms_call_modifier) @convention)
      (abstract_parenthesized_declarator (ms_call_modifier) @convention)
    `
    );
    const tree = parser.parse(source)!;
    try {
      expect(tree.rootNode.hasError, source).toBe(false);
      expect(query.captures(tree.rootNode).map(({ node }) => [node.text, node.startIndex, node.endIndex])).toEqual(
        [...source.matchAll(new RegExp(convention, 'g'))].map((match) => [
          match[0],
          match.index,
          match.index + match[0].length,
        ])
      );
      expect(
        tree.rootNode.descendantsOfType('type_definition').map((node) => node.childForFieldName('declarator')?.text)
      ).toEqual([`${convention} (*Callback)(int)`, `${convention} (*CallbackArray[2])(int)`]);
      expect(tree.rootNode.descendantsOfType('field_identifier').map((node) => node.text)).toEqual(['callback']);
      expect(tree.rootNode.descendantsOfType('identifier').map((node) => node.text)).toEqual([
        'consume',
        'cb',
        'nested',
        'factory',
        'size',
        'convert',
        'prototype',
        'defined',
        'object',
        'after',
      ]);
    } finally {
      tree.delete();
      query.delete();
      parser.delete();
    }
  }
);

test.each(['__cdecl', '__clrcall', '__stdcall', '__fastcall', '__thiscall', '__vectorcall'])(
  'keeps %s after pointer stars across declaration and signature edits',
  async (convention) => {
    await Parser.init();
    const language = await Language.load('tree-sitter-c.wasm');
    const parser = new Parser().setLanguage(language);
    const original = fs.readFileSync('test/fixtures/msPostStar.c', 'utf8').replaceAll('__stdcall', convention);
    const queries = ['highlights', 'tags'].map(
      (name) => new Query(language, fs.readFileSync(`queries/${name}.scm`, 'utf8'))
    );
    const modifierQuery = new Query(language, '(ms_call_modifier) @convention');
    let source = original;
    let tree = parser.parse(source)!;
    try {
      for (const replacement of [convention === '__cdecl' ? '__stdcall' : '__cdecl', convention]) {
        expect(tree.rootNode.hasError, source).toBe(false);
        expect(
          modifierQuery.captures(tree.rootNode).map(({ node }) => [node.text, node.startIndex, node.endIndex])
        ).toEqual(
          [...source.matchAll(/__\w+/g)].map((match) => [match[0], match.index, match.index + match[0].length])
        );
        expect(
          tree.rootNode.descendantsOfType('type_definition').map((node) =>
            node
              .childForFieldName('declarator')
              ?.descendantsOfType('type_identifier')
              .map((child) => child.text)
          )
        ).toEqual([['Callback'], ['CallbackPointer'], ['InnerCallback']]);
        expect(tree.rootNode.descendantsOfType('field_identifier').map((node) => node.text)).toEqual([
          'factory',
          'callback',
        ]);
        expect(tree.rootNode.descendantsOfType('identifier').map((node) => node.text)).toEqual([
          'declared',
          'defined',
          'consume',
          'callback',
          'size',
          'convert',
          'qualified',
          'reversed',
          'nested',
          'old',
          'a',
          'a',
          'pointerConsume',
          'cb',
          'abstractSize',
          'abstractConvert',
          'after',
        ]);
        expect(
          tree.rootNode
            .descendantsOfType('function_definition')
            .map((node) => [node.text, node.startIndex, node.endIndex])
        ).toEqual(
          [
            `int * ${convention} defined(void) { return 0; }`,
            `int size(void) { return sizeof(int * ${convention} (*)(void)); }`,
            `void convert(void) { (void)(int * ${convention} (*)(void))0; }`,
            `int * ${convention} old(a) int a; { return 0; }`,
            `int abstractSize(void) { return sizeof(int (* ${convention})(void)); }`,
            `void abstractConvert(void) { (void)(int (* ${convention})(void))0; }`,
            'int after(void) { return 0; }',
          ].map((text) => [text, source.indexOf(text), source.indexOf(text) + text.length])
        );
        const startIndex = source.indexOf('__');
        const previous = source.slice(startIndex).match(/^__\w+/)![0];
        tree.edit(
          new Edit({
            startIndex,
            oldEndIndex: startIndex + previous.length,
            newEndIndex: startIndex + replacement.length,
            startPosition: { row: 0, column: startIndex },
            oldEndPosition: { row: 0, column: startIndex + previous.length },
            newEndPosition: { row: 0, column: startIndex + replacement.length },
          })
        );
        source = source.slice(0, startIndex) + replacement + source.slice(startIndex + previous.length);
        const incremental = parser.parse(source, tree)!;
        const fresh = parser.parse(source)!;
        try {
          expect(incremental.rootNode.hasError, source).toBe(false);
          expect(treeMetadata(incremental.rootNode)).toEqual(treeMetadata(fresh.rootNode));
          for (const query of queries) {
            const captures = (root: Node): unknown =>
              query
                .captures(root)
                .map(({ name, node }) => [
                  name,
                  node.text,
                  node.startIndex,
                  node.endIndex,
                  node.startPosition,
                  node.endPosition,
                ]);
            expect(captures(incremental.rootNode)).toEqual(captures(fresh.rootNode));
          }
        } finally {
          fresh.delete();
        }
        tree.delete();
        tree = incremental;
      }
      expect(source).toBe(original);
    } finally {
      tree.delete();
      modifierQuery.delete();
      for (const query of queries) query.delete();
      parser.delete();
    }
  }
);

function treeMetadata(node: Node): unknown {
  return [
    node.type,
    node.isNamed,
    node.isMissing,
    node.isError,
    node.hasError,
    node.isExtra,
    node.startIndex,
    node.endIndex,
    node.startPosition,
    node.endPosition,
    node.children.map((child, index) => [node.fieldNameForChild(index), treeMetadata(child)]),
  ];
}
