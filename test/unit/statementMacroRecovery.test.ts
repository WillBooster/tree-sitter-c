import fs from 'node:fs';
import path from 'node:path';

import { Language, Parser, type Tree } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

import { hasSupertype } from '../helpers/ast.ts';
import { parseNativeFiles } from '../helpers/nativeParse.ts';

const root = path.resolve(import.meta.dirname, '../..');
const fixture = 'test/fixtures/statementMacros.c';
const source = fs.readFileSync(path.join(root, fixture), 'utf8');

test('keeps Wasm function and conditional ranges after statement-like macros', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(path.join(root, 'tree-sitter-c.wasm')));
  const tree = parser.parse(source)!;
  try {
    expect(
      tree.rootNode.descendantsOfType('function_definition').map((node) => [node.startPosition, node.endPosition])
    ).toEqual([
      [
        { row: 0, column: 0 },
        { row: 10, column: 1 },
      ],
      [
        { row: 11, column: 0 },
        { row: 19, column: 1 },
      ],
    ]);
    expect(tree.rootNode.descendantsOfType('compound_statement')).toHaveLength(3);
    const directive = tree.rootNode.descendantsOfType('preproc_ifdef')[0]!;
    expect(directive.text).toBe('#ifdef USE_SSL\n  struct peer origin;\n#endif');
    expect([directive.startIndex, directive.endIndex]).toEqual([
      source.indexOf('#ifdef'),
      source.indexOf('#endif') + '#endif'.length,
    ]);
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('keeps native function and conditional ranges after statement-like macros', { timeout: 300_000 }, () => {
  const rootNode = parseNativeFiles(root, path.join(root, '.tmp/statement-macro-recovery-lib'), [fixture])[0]!
    .rootNode!;
  expect(
    rootNode.descendantsOfType('function_definition').map((node) => [node.startPosition, node.endPosition])
  ).toEqual([
    [
      { row: 0, column: 0 },
      { row: 10, column: 1 },
    ],
    [
      { row: 11, column: 0 },
      { row: 19, column: 1 },
    ],
  ]);
  const conditionals = rootNode.descendantsOfType('preproc_ifdef');
  expect(conditionals.map((node) => [node.startPosition, node.endPosition])).toContainEqual([
    { row: 15, column: 0 },
    { row: 17, column: 6 },
  ]);
  expect(rootNode.descendantsOfType('compound_statement')).toHaveLength(3);
});

test.each(['}', 'GENERATE(a)\nGENERATE(b)\nGENERATE(c)\n#define BOUNDARY 1'])(
  'retains ordinary declarations in following bodies after %s',
  async (prefix) => {
    await Parser.init();
    const language = await Language.load(path.join(root, 'tree-sitter-c.wasm'));
    const parser = new Parser().setLanguage(language);
    const body = `int f(void) {
const T* const a0 = x+y;
F fn = call(x,y);
T const answer = MIN(x,y);
T const other = x ? y : z;
}
int following(void){return 0;}
`;
    const fullSource = `${prefix}\n${body}`;
    const tree = parser.parse(fullSource)!;
    const check = (current: Tree, text: string): void => {
      const functions = current.rootNode.descendantsOfType('function_definition');
      const block = functions
        .find((node) => node.childForFieldName('declarator')?.text === 'f(void)')!
        .childForFieldName('body')!;
      expect(block.hasError).toBe(false);
      expect(block.namedChildren.map((node) => node.type)).toEqual(Array.from({ length: 4 }, () => 'declaration'));
      expect(block.namedChildren.map((node) => node.childForFieldName('type')?.text)).toEqual(['T', 'F', 'T', 'T']);
      expect(block.namedChildren.map((node) => node.childForFieldName('declarator')?.text)).toEqual([
        '* const a0 = x+y',
        'fn = call(x,y)',
        'answer = MIN(x,y)',
        'other = x ? y : z',
      ]);
      expect(
        block
          .descendantsOfType('declaration')
          .filter((node) => node.childForFieldName('declarator')?.isNamed)
          .map((node) => node.childForFieldName('type'))
          .filter((type) => hasSupertype(language, type, 'type_specifier'))
          .map((type) => type.text)
      ).toEqual(['T', 'F', 'T', 'T']);
      const following = functions.at(-1)!;
      expect([following.text, following.startIndex, following.endIndex]).toEqual([
        'int following(void){return 0;}',
        text.indexOf('int following'),
        text.length - 1,
      ]);
    };
    try {
      check(tree, fullSource);
      const fresh = parser.parse(body)!;
      try {
        check(fresh, body);
        expect(fresh.rootNode.hasError).toBe(false);
      } finally {
        fresh.delete();
      }
    } finally {
      tree.delete();
      parser.delete();
    }
  }
);
