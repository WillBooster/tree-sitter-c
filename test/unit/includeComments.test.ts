import { Edit, Language, Parser } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test.each([
  ['HEADER EMPTY', '// tail'],
  ['HEADER /* middle */ EMPTY', '/* trailing */', '/* middle */'],
  ['HEADER /* middle\nline */ EMPTY', '/* trailing */', '/* middle\nline */'],
  ['HEADER EMPTY', '/* trailing\nline */'],
  ['HEADER /* middle\nline */ EMPTY', '/* trailing\nline */', '/* middle\nline */'],
  ['HEADER_OF(items) EMPTY', '/* first */ /* second */'],
  ['HEADER \\\n EMPTY', '// tail'],
  ['HEADER', '// tail'],
  ['HEADER_OF(items)', '/* trailing */'],
  ['"items.h"', '/* trailing */'],
  ['<items.h>', '// tail'],
  ['HEADER EMPTY', '_Pragma("GCC diagnostic push")'],
  ['HEADER', '_Pragma("GCC diagnostic push")'],
  ['HEADER _Pragma("GCC diagnostic push") EMPTY', '// tail', '_Pragma("GCC diagnostic push")'],
])(
  'keeps trailing extras outside the include path %s',
  async (operand: string, trailing: string, interior?: string) => {
    await Parser.init();
    const parser = new Parser();
    parser.setLanguage(await Language.load('tree-sitter-c.wasm'));
    const directive = `#include ${operand} ${trailing}\n`;
    const source = `${directive}int values[] = {\n${directive}1,\n};\nint following(void) { return values[0]; }\n`;
    const tree = parser.parse(source)!;
    try {
      expect(tree.rootNode.hasError).toBe(false);
      const includes = tree.rootNode.descendantsOfType('preproc_include');
      expect(includes).toHaveLength(2);
      for (const include of includes) {
        const path = include.childForFieldName('path')!;
        expect(path.text).toBe(operand);
        expect(source.slice(path.endIndex, include.endIndex)).toBe(` ${trailing}\n`);
        expect(include.descendantsOfType(['comment', 'pragma_operator']).map((node) => node.text)).toEqual([
          ...(interior ? [interior] : []),
          ...(trailing === '/* first */ /* second */' ? ['/* first */', '/* second */'] : [trailing]),
        ]);
      }
      expect(tree.rootNode.descendantsOfType('initializer_list')[0]!.namedChildren.at(-1)!.text).toBe('1');
      expect(tree.rootNode.descendantsOfType('function_definition').map((node) => node.text)).toEqual([
        'int following(void) { return values[0]; }',
      ]);
    } finally {
      tree.delete();
      parser.delete();
    }
  }
);

test.each([
  ['FOO', '// c'],
  ['A B', '/* c */'],
  ['A /* middle */ B', '/* trailing */'],
  ['HEADER EMPTY', '_Pragma("GCC diagnostic push")'],
  ['"items.h"', '// c'],
])('retains include paths without a final newline: %s', async (operand, trailing) => {
  await Parser.init();
  const parser = new Parser();
  parser.setLanguage(await Language.load('tree-sitter-c.wasm'));
  const tree = parser.parse(`int previous;\n#include ${operand} ${trailing}`)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(tree.rootNode.namedChildren[0]!.text).toBe('int previous;');
    const includes = tree.rootNode.descendantsOfType('preproc_include');
    expect(includes).toHaveLength(1);
    expect(includes[0]!.childForFieldName('path')!.text).toBe(operand);
    expect(includes[0]!.namedChildren.at(-1)!.text).toBe(trailing);
  } finally {
    tree.delete();
    parser.delete();
  }
});

test.each(['#define VALUE 1', '#undef VALUE', '#pragma once', '#if VALUE\nint value;\n#endif', '#include A B // tail'])(
  'updates preprocessing EOF terminators when a newline is added and removed: %s',
  async (directive) => {
    await Parser.init();
    const parser = new Parser();
    parser.setLanguage(await Language.load('tree-sitter-c.wasm'));
    let source = directive;
    let tree = parser.parse(source)!;
    try {
      expect(tree.rootNode.hasError).toBe(false);
      for (const next of [`${directive}\n`, directive]) {
        tree.edit(
          new Edit({
            startIndex: directive.length,
            oldEndIndex: source.length,
            newEndIndex: next.length,
            startPosition: endPoint(directive),
            oldEndPosition: endPoint(source),
            newEndPosition: endPoint(next),
          })
        );
        const updated = parser.parse(next, tree)!;
        tree.delete();
        tree = updated;
        const fresh = parser.parse(next)!;
        try {
          expect(tree.rootNode.hasError).toBe(false);
          expect(tree.rootNode.toString()).toBe(fresh.rootNode.toString());
          expect(tree.rootNode.endIndex).toBe(next.length);
        } finally {
          fresh.delete();
        }
        source = next;
      }
    } finally {
      tree.delete();
      parser.delete();
    }
  }
);

function endPoint(source: string): { row: number; column: number } {
  const lines = source.split('\n');
  return { row: lines.length - 1, column: lines.at(-1)!.length };
}

test.each([1, 8, 50])('keeps chains of %i trailing pragma operators outside include paths', async (count) => {
  await Parser.init();
  const parser = new Parser();
  parser.setLanguage(await Language.load('tree-sitter-c.wasm'));
  const pragmas = Array.from({ length: count }, () => '_Pragma("GCC diagnostic push")').join(' ');
  const directive = `#include H ${pragmas} // tail\n`;
  const tree = parser.parse(`${directive}int values[] = {\n${directive}1,\n};\nint after;\n`)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    const includes = tree.rootNode.descendantsOfType('preproc_include');
    expect(includes.map((node) => node.childForFieldName('path')!.text)).toEqual(['H', 'H']);
    expect(includes.map((node) => node.descendantsOfType('pragma_operator').length)).toEqual([count, count]);
    expect(tree.rootNode.descendantsOfType('initializer_list')[0]!.namedChildren.at(-1)!.text).toBe('1');
    expect(tree.rootNode.descendantsOfType('declaration').at(-1)!.text).toBe('int after;');
  } finally {
    tree.delete();
    parser.delete();
  }
});
