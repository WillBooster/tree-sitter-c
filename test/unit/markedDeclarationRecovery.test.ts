import fs from 'node:fs';

import { Edit, Language, Parser, Query, type Tree } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

const declarations = [
  'MARK struct S w = {0};',
  'MARK Word w = {0};',
  'static MARK Word w = {0};',
  'MARK Word w = {0}, v;',
  'UNUSED Pos tags = {0};',
  'MARK int w = {0};',
  'MARK Word w = 0;',
  'MARK Word *w = {0};',
];
const trailers = [
  ['static const struct S x __read_mostly;', '__read_mostly'],
  ['static volatile struct S x __aligned(8);', 'x'],
  ['static const struct S x __section(".data");', 'x'],
];
const header = `#define MARK
#define UNUSED
#define TYPE(...) __VA_ARGS__
#define ANNOTATE(...)
#define __read_mostly
#define __aligned(...)
#define __section(...)
struct S { int a; };
typedef int Word;
typedef struct S Pos;
`;
const following = 'int after(void) { return 1; }';
const tags = fs.readFileSync(new URL('../../queries/tags.scm', import.meta.url), 'utf8');

test('confines marked initializer and trailing marker recovery to their declarations', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser();
  let query: Query | undefined;
  try {
    parser.setLanguage(language);
    query = new Query(
      language,
      tags +
        '\n(declaration type: (struct_specifier) @recovered.type declarator: (_) @recovered.name)\n(function_definition body: (compound_statement) @recovered.body)'
    );
    for (const [statement, expectedDeclarator] of [
      ...declarations.map((statement) => [statement, undefined] as const),
      ...trailers,
    ]) {
      const local = declarations.includes(statement);
      const text = header + (local ? `int g(void) {\n  ${statement}\n  return 0;\n}\n` : `${statement}\n`) + following;
      let tree: Tree | undefined;
      try {
        tree = parser.parse(text)!;
        const check = (current: Tree, source: string): void => {
          const functions = current.rootNode.descendantsOfType('function_definition');
          expect(functions.map((node) => node.childForFieldName('declarator')?.text)).toEqual(
            local ? ['g(void)', 'after(void)'] : ['after(void)']
          );
          const after = functions.at(-1)!;
          expect([after.text, after.startIndex, after.endIndex, after.hasError]).toEqual([
            following,
            source.indexOf(following),
            source.length,
            false,
          ]);
          if (local) {
            const g = functions[0]!;
            expect(g.startIndex).toBe(source.indexOf('int g(void)'));
            expect(g.childForFieldName('body')?.text).toBe(
              source.slice(source.indexOf('{', g.startIndex), source.indexOf(`\n${following}`))
            );
          } else {
            const declaration = current.rootNode.namedChildren.find((node) => node.type === 'declaration');
            expect(declaration?.childForFieldName('type')?.text).toBe('struct S');
            expect(declaration?.childForFieldName('declarator')?.text).toBe(expectedDeclarator);
            expect(declaration?.endIndex).toBeLessThanOrEqual(after.startIndex);
            expect(
              query!
                .captures(current.rootNode)
                .filter(({ name }) => name === 'recovered.type' || name === 'recovered.name')
                .map(({ node }) => node.text)
            ).toEqual(['struct S', expectedDeclarator]);
          }
        };
        check(tree, text);
        verifyCommentEdit(parser, tree, query, text, text.indexOf(statement), check);
      } finally {
        tree?.delete();
      }
    }
  } finally {
    query?.delete();
    parser.delete();
  }
});

test('keeps non-type and multi-argument annotations after proved marked types', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser();
  let query: Query | undefined;
  try {
    parser.setLanguage(language);
    query = new Query(
      language,
      tags +
        '\n' +
        fs.readFileSync(new URL('../../queries/highlights.scm', import.meta.url), 'utf8') +
        '\n(declaration type: (_) @annotated.type declarator: (_) @annotated.name)\n(attribute_specifier name: (_) @annotation.name arguments: (_) @annotation.arguments)'
    );
    for (const type of ['int', 'TYPE(int)', 'struct S']) {
      for (const argument of [
        'struct { int z; }',
        '(int[]){1}',
        '({ int x = 1; x; })',
        '{1, 2}',
        'int, (int[]){1}',
        'arg, {1}',
        '7, 8, {1}',
      ]) {
        const text = `${header}MARK ${type} ANNOTATE(${argument}) f(void);\n${following}`;
        let tree: Tree | undefined;
        try {
          tree = parser.parse(text)!;
          const check = (current: Tree, source: string): void => {
            expect(current.rootNode.hasError).toBe(false);
            const declaration = current.rootNode.namedChildren.find((node) => node.type === 'declaration')!;
            expect(declaration.childForFieldName('type')?.text).toBe(type);
            expect(declaration.childForFieldName('declarator')?.text).toBe('f(void)');
            const attribute = declaration.descendantsOfType('attribute_specifier')[0]!;
            expect(attribute.childForFieldName('name')?.text).toBe('ANNOTATE');
            expect(attribute.childForFieldName('arguments')?.text).toBe(
              source.slice(source.indexOf('(', source.indexOf('ANNOTATE(', header.length)), source.indexOf(' f(void)'))
            );
            expect(current.rootNode.namedChildren.at(-1)?.text).toBe(following);
          };
          check(tree, text);
          verifyCommentEdit(parser, tree, query, text, text.indexOf('{', header.length), check);
        } finally {
          tree?.delete();
        }
      }
    }
  } finally {
    query?.delete();
    parser.delete();
  }
});

function verifyCommentEdit(
  parser: Parser,
  tree: Tree,
  query: Query,
  source: string,
  at: number,
  check: (current: Tree, text: string) => void
): void {
  const cache = tree.copy();
  let incremental: Tree | undefined;
  let fresh: Tree | undefined;
  const insertion = '/* edit */';
  const row = source.slice(0, at).split('\n').length - 1;
  const column = at - source.lastIndexOf('\n', at - 1) - 1;
  const edited = source.slice(0, at) + insertion + source.slice(at);
  const captures = (current: Tree): Array<[string, string, number, number]> =>
    query.captures(current.rootNode).map(({ name, node }) => [name, node.text, node.startIndex, node.endIndex]);
  try {
    cache.edit(
      new Edit({
        startIndex: at,
        oldEndIndex: at,
        newEndIndex: at + insertion.length,
        startPosition: { row, column },
        oldEndPosition: { row, column },
        newEndPosition: { row, column: column + insertion.length },
      })
    );
    incremental = parser.parse(edited, cache)!;
    fresh = parser.parse(edited)!;
    check(incremental, edited);
    check(fresh, edited);
    expect(incremental.rootNode.toString()).toBe(fresh.rootNode.toString());
    expect(captures(incremental)).toEqual(captures(fresh));
  } finally {
    fresh?.delete();
    incremental?.delete();
    cache.delete();
  }
}
