import fs from 'node:fs';

import { Language, Parser, Query } from '@willbooster/web-tree-sitter';
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
  'keeps %s after pointer stars in declarations and signatures',
  async (convention) => {
    await Parser.init();
    const language = await Language.load('tree-sitter-c.wasm');
    const parser = new Parser().setLanguage(language);
    const original = fs.readFileSync('test/fixtures/msPostStar.c', 'utf8').replaceAll('__stdcall', convention);
    const modifierQuery = new Query(language, '(ms_call_modifier) @convention');
    const startIndex = original.indexOf('__');
    const replacement = convention === '__cdecl' ? '__stdcall' : '__cdecl';
    const replaced =
      original.slice(0, startIndex) +
      replacement +
      original.slice(startIndex + original.slice(startIndex).match(/^__\w+/)![0].length);
    try {
      for (const source of [original, replaced]) {
        const tree = parser.parse(source)!;
        try {
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
        } finally {
          tree.delete();
        }
      }
    } finally {
      modifierQuery.delete();
      parser.delete();
    }
  }
);
