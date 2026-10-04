import assert from 'node:assert/strict';

import { Language, Parser } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test('preserves macro values and trailing comments across every Unicode escape splice position', async () => {
  await Parser.init();
  const parser = new Parser();
  parser.setLanguage(await Language.load('tree-sitter-c.wasm'));
  try {
    for (const token of [
      String.raw`1\u00e9'0`,
      String.raw`1\U000000e9'0`,
      String.raw`1\u{e9}'0`,
      String.raw`1\N{LATIN SMALL LETTER E WITH ACUTE}'0`,
    ]) {
      for (const newline of ['\n', '\r\n', '\r']) {
        for (let position = 1; position < token.length; position++) {
          const spliced = `${token.slice(0, position)}\\${newline}${token.slice(position)}`;
          for (const prefix of ['', '_Pragma("once") ']) {
            const value = prefix + spliced;
            const tree = parser.parse(`#define M ${value} /*tail*/\nint after;\n`)!;
            try {
              expect(tree.rootNode.hasError, JSON.stringify(value)).toBe(false);
              const [macro, declaration] = tree.rootNode.namedChildren;
              assert.ok(macro && declaration);
              expect(macro.type).toBe('preproc_def');
              expect(macro.childForFieldName('value')?.text).toBe(`${value} `);
              expect(macro.namedChildren.filter((node) => node.type === 'comment').map((node) => node.text)).toEqual([
                '/*tail*/',
              ]);
              expect(declaration.type).toBe('declaration');
              expect(declaration.text).toBe('int after;');
            } finally {
              tree.delete();
            }
          }
        }
      }
    }
  } finally {
    parser.delete();
  }
});
