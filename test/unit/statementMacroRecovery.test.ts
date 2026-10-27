import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { Edit, Language, Parser, Query, type Tree } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

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
  const result = spawnSync(
    'script/tree-sitter',
    ['query', '--grammar-path', '.', '--captures', 'test/fixtures/statementMacros.scm', fixture],
    {
      cwd: root,
      env: { ...process.env, TREE_SITTER_LIBDIR: path.join(root, '.tmp/statement-macro-recovery-lib') },
      encoding: 'utf8',
      timeout: 300_000,
    }
  );
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain(' - function, start: (0, 0), end: (10, 1)');
  expect(result.stdout).toContain(' - function, start: (11, 0), end: (19, 1)');
  expect(result.stdout).toContain(' - conditional, start: (15, 0), end: (17, 6)');
  expect(result.stdout.match(/ - block,/g)).toHaveLength(3);
});

test.each(['}', 'GENERATE(a)\nGENERATE(b)\nGENERATE(c)\n#define BOUNDARY 1'])(
  'retains ordinary declarations in following bodies after %s',
  async (prefix) => {
    await Parser.init();
    const language = await Language.load(path.join(root, 'tree-sitter-c.wasm'));
    const parser = new Parser().setLanguage(language);
    const query = new Query(
      language,
      `(declaration type: (type_specifier) @recovery.type declarator: (_) @recovery.name)
${fs.readFileSync(path.join(root, 'queries/tags.scm'), 'utf8')}
${fs.readFileSync(path.join(root, 'queries/highlights.scm'), 'utf8')}`
    );
    const body = `int f(void) {
const T* const a0 = x+y;
F fn = call(x,y);
T const answer = MIN(x,y);
T const other = x ? y : z;
}
int following(void){return 0;}
`;
    const source = `${prefix}\n${body}`;
    const tree = parser.parse(source)!;
    const captures = (current: Tree): Array<[string, string, number, number]> =>
      query.captures(current.rootNode).map(({ name, node }) => [name, node.text, node.startIndex, node.endIndex]);
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
        query
          .captures(block)
          .filter(({ name }) => name === 'recovery.type')
          .map(({ node }) => node.text)
      ).toEqual(['T', 'F', 'T', 'T']);
      const following = functions.at(-1)!;
      expect([following.text, following.startIndex, following.endIndex]).toEqual([
        'int following(void){return 0;}',
        text.indexOf('int following'),
        text.length - 1,
      ]);
    };
    try {
      check(tree, source);
      const cache = tree.copy();
      cache.edit(
        new Edit({
          startIndex: 0,
          oldEndIndex: prefix.length + 1,
          newEndIndex: 0,
          startPosition: { row: 0, column: 0 },
          oldEndPosition: { row: prefix.split('\n').length, column: 0 },
          newEndPosition: { row: 0, column: 0 },
        })
      );
      const incremental = parser.parse(body, cache)!;
      const fresh = parser.parse(body)!;
      try {
        check(incremental, body);
        expect(incremental.rootNode.hasError).toBe(false);
        expect(incremental.rootNode.toString()).toBe(fresh.rootNode.toString());
        expect(captures(incremental)).toEqual(captures(fresh));
      } finally {
        cache.delete();
        incremental.delete();
        fresh.delete();
      }
    } finally {
      query.delete();
      tree.delete();
      parser.delete();
    }
  }
);
