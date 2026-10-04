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

test('distinguishes digit separators from adjacent character literals at macro boundaries', async () => {
  await Parser.init();
  const parser = new Parser();
  parser.setLanguage(await Language.load('tree-sitter-c.wasm'));
  try {
    for (const token of [
      "1'000'/*'",
      "1'000'//'",
      String.raw`1'000'\\'`,
      String.raw`1'000'\''`,
      "1'000'+'",
      "1'000'0",
      "1'000'e",
      String.raw`1'000'\u00e9'`,
      "1'000'é'",
    ]) {
      for (const newline of ['\n', '\r\n', '\r']) {
        for (let position = 1; position < token.length; position++) {
          const value = `${token.slice(0, position)}\\${newline}${token.slice(position)}`;
          for (const prefix of ['', '_Pragma("once") ']) {
            const tree = parser.parse(
              `#define M ${prefix}${value} /*tail*/\nvoid first(void) {}\n/*other*/ void second(void) {}\n`
            )!;
            try {
              expect(tree.rootNode.hasError, JSON.stringify(prefix + value)).toBe(false);
              const macro = tree.rootNode.namedChildren[0]!;
              expect(macro.childForFieldName('value')?.text).toBe(`${prefix}${value} `);
              expect(macro.namedChildren.filter((node) => node.type === 'comment').map((node) => node.text)).toEqual([
                '/*tail*/',
              ]);
              expect(
                tree.rootNode.namedChildren
                  .filter((node) => node.type === 'function_definition')
                  .map((node) => node.text)
              ).toEqual(['void first(void) {}', 'void second(void) {}']);
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

test('retains trailing comments with spliced delimiters in the macro value', async () => {
  await Parser.init();
  const parser = new Parser();
  parser.setLanguage(await Language.load('tree-sitter-c.wasm'));
  try {
    for (const newline of ['\n', '\r\n', '\r']) {
      for (const comment of [`/\\${newline}*c*/`, `/*c*\\${newline}/`, `/\\${newline}*c*\\${newline}/`]) {
        for (const prefix of ['a ', '_Pragma("once") a ', 'a /*previous*/ ']) {
          const value = prefix + comment;
          const tree = parser.parse(`#define M ${value} /*tail*/\nint after;\n`)!;
          try {
            expect(tree.rootNode.hasError, JSON.stringify(value)).toBe(false);
            const [macro, declaration] = tree.rootNode.namedChildren;
            assert.ok(macro && declaration);
            expect(macro.childForFieldName('value')?.text).toBe(`${value} `);
            expect(macro.namedChildren.filter((node) => node.type === 'comment').map((node) => node.text)).toEqual([
              '/*tail*/',
            ]);
            expect(declaration.text).toBe('int after;');
          } finally {
            tree.delete();
          }
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('preserves leading and slash-adjacent escaped identifiers across every splice position', async () => {
  await Parser.init();
  const parser = new Parser();
  parser.setLanguage(await Language.load('tree-sitter-c.wasm'));
  try {
    for (const token of [
      String.raw`\u00e91'a/*'`,
      String.raw`\U000000e91'a/*'`,
      String.raw`\u{e9}1'a/*'`,
      String.raw`\N{LATIN SMALL LETTER E WITH ACUTE}1'a/*'`,
    ]) {
      for (const newline of ['\n', '\r\n', '\r']) {
        for (let position = 0; position < token.length; position++) {
          for (const prefix of ['', '/', '_Pragma("once") ', '_Pragma("once") /']) {
            const spliced = position === 0 ? token : `${token.slice(0, position)}\\${newline}${token.slice(position)}`;
            const value = prefix + spliced;
            const tree = parser.parse(
              `#define M ${value} /*tail*/\nvoid after(void) {}\n/*other*/ void second(void) {}\n`
            )!;
            try {
              expect(tree.rootNode.hasError, JSON.stringify(value)).toBe(false);
              const macro = tree.rootNode.namedChildren[0]!;
              expect(macro.childForFieldName('value')?.text).toBe(`${value} `);
              expect(macro.namedChildren.filter((node) => node.type === 'comment').map((node) => node.text)).toEqual([
                '/*tail*/',
              ]);
              expect(
                tree.rootNode.namedChildren
                  .filter((node) => node.type === 'function_definition')
                  .map((node) => node.text)
              ).toEqual(['void after(void) {}', 'void second(void) {}']);
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
