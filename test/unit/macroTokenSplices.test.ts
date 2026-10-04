import assert from 'node:assert/strict';
import path from 'node:path';

import { Language, Parser } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

await Parser.init();
const language = await Language.load(path.join(import.meta.dirname, '../../tree-sitter-c.wasm'));

test('preserves macro values and trailing comments across every Unicode escape splice position', () => {
  const parser = createParser();
  try {
    for (const token of [
      String.raw`1\u00e9'0`,
      String.raw`1\U000000e9'0`,
      String.raw`1\u{e9}'0`,
      String.raw`1\N{LATIN SMALL LETTER E WITH ACUTE}'0`,
    ]) {
      for (const newline of ['\n', '\r\n', '\r', '\n\r']) {
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

test('distinguishes digit separators from adjacent character literals at macro boundaries', () => {
  const parser = createParser();
  try {
    for (const token of [
      "1'000'/*'",
      "1'000'//'",
      String.raw`1'000'\\'`,
      String.raw`1'000'\''`,
      "1'000'+'",
      "1'$'",
      "1'000'$'",
      "1'000'0",
      "1'000'e",
      String.raw`1'000'\u00e9'`,
      "1'000'é'",
    ]) {
      for (const newline of ['\n', '\r\n', '\r', '\n\r']) {
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

test('retains trailing comments with spliced delimiters in the macro value', () => {
  const parser = createParser();
  try {
    for (const newline of ['\n', '\r\n', '\r', '\n\r']) {
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

test('preserves leading and slash-adjacent escaped identifiers across every splice position', () => {
  const parser = createParser();
  try {
    for (const token of [
      String.raw`\u00e91'a/*'`,
      String.raw`\U000000e91'a/*'`,
      String.raw`\u{e9}1'a/*'`,
      String.raw`\N{LATIN SMALL LETTER E WITH ACUTE}1'a/*'`,
    ]) {
      for (const newline of ['\n', '\r\n', '\r', '\n\r']) {
        for (let position = 0; position < token.length; position++) {
          for (const prefix of [
            '',
            '/',
            '\\',
            '/\\',
            String.raw`\\`,
            String.raw`/\\`,
            '1\\',
            String.raw`1\\`,
            '_Pragma("once") ',
            '_Pragma("once") /',
          ]) {
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

test('keeps LFCR splices inside ordinary, quoted and commented macro values', () => {
  const parser = createParser();
  try {
    const splice = '\\\n\r';
    for (const value of [`1 ${splice}+ 2`, `"a${splice}b"`, `1 // comment${splice}continued`]) {
      const tree = parser.parse(`#define M ${value}\nint after;\n`)!;
      try {
        expect(tree.rootNode.hasError, JSON.stringify(value)).toBe(false);
        const [macro, declaration] = tree.rootNode.namedChildren;
        expect(macro?.type).toBe('preproc_def');
        expect(macro?.childForFieldName('value')?.text).toBe(value);
        expect(declaration?.type).toBe('declaration');
        expect(declaration?.text).toBe('int after;');
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('retains leading backslash runs immediately before trailing block comments', () => {
  const parser = createParser();
  try {
    for (const count of [1, 2, 3, 8]) {
      const value = '\\'.repeat(count);
      for (const prefix of ['', '\\\n', '\\\r\n', '\\\r', '\\\n\r']) {
        const tree = parser.parse(`#define M ${prefix}${value}/*tail*/\nvoid first(void) {}\nint second;\n`)!;
        try {
          expect(tree.rootNode.hasError, JSON.stringify(prefix + value)).toBe(false);
          const [macro, first, second] = tree.rootNode.namedChildren;
          expect(macro?.type).toBe('preproc_def');
          expect(macro?.childForFieldName('value')?.text).toBe(value);
          expect(macro?.namedChildren.filter((node) => node.type === 'comment').map((node) => node.text)).toEqual([
            '/*tail*/',
          ]);
          expect(first?.text).toBe('void first(void) {}');
          expect(second?.text).toBe('int second;');
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('preserves macro token boundaries around Unicode punctuation and identifiers', () => {
  const parser = createParser();
  try {
    for (const token of [
      ...['©', '±', '×', '÷', '☃', '😀', '\u0301', '\u200D'].map((mark) => `${mark}1'000`),
      ...['©', '±', '×', '÷', '☃', '😀', '·', '′'].map((mark) => `x${mark}1'0'`),
      ...['é', '変数', '𐐀', 'a\u0301', 'a\u200D', '$'].map((name) => `${name}1'a/*'`),
    ]) {
      for (const prefix of ['', '_Pragma("once") ']) {
        for (const splice of ['', '\\\n', '\\\r\n', '\\\r', '\\\n\r']) {
          // oxlint-disable-next-line typescript/no-misused-spread -- The scanner consumes code points, not graphemes.
          const [first, ...rest] = [...token];
          const value = `${prefix}${first}${splice}${rest.join('')}`;
          const tree = parser.parse(`#define M ${value} /*tail*/\nint after;\n`)!;
          try {
            expect(tree.rootNode.hasError, JSON.stringify(value)).toBe(false);
            const [macro, declaration] = tree.rootNode.namedChildren;
            expect(macro?.childForFieldName('value')?.text).toBe(`${value} `);
            expect(macro?.namedChildren.filter((node) => node.type === 'comment').map((node) => node.text)).toEqual([
              '/*tail*/',
            ]);
            expect(declaration?.type).toBe('declaration');
            expect(declaration?.text).toBe('int after;');
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

test('preserves directive arguments and trailing comments across whitespace and line endings', () => {
  const parser = createParser();
  try {
    for (const directive of ['#define M', '#pragma', '#error', '#warning', '#line']) {
      for (const value of [
        'mark /*inside*/ Section',
        '"/*literal*/" /*inside*/ tail',
        "mark don't",
        'mark "title',
        'mark "title /*inner*/ continued',
        'mark "title /*inner\n*/ continued',
        'mark "balanced /*opaque*/"',
        'mark "/*opaque*/ //literal"',
        'mark "title /\\\n*split*/',
        'mark "title /*split*\\\n/',
      ]) {
        for (const padding of ['  ', '\t', '\u00A0', '\u3000']) {
          for (const newline of ['\n', '\r\n', '\r', '\n\r']) {
            const source = `${directive} ${value} /*tail*/${padding}${newline}int after;${newline}`;
            const tree = parser.parse(source)!;
            try {
              expect(tree.rootNode.hasError, JSON.stringify(source)).toBe(false);
              const [call, declaration] = tree.rootNode.namedChildren;
              expect(call?.type).toBe(directive === '#define M' ? 'preproc_def' : 'preproc_call');
              expect(call?.childForFieldName(directive === '#define M' ? 'value' : 'argument')?.text).toBe(`${value} `);
              expect(call?.descendantsOfType('comment').map((node) => node.text)).toEqual(['/*tail*/']);
              expect(declaration?.type).toBe('declaration');
              expect(declaration?.text).toBe('int after;');
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

test('keeps block markers inert in unmatched directive quote line comments', () => {
  const parser = createParser();
  try {
    for (const newline of ['\n', '\r\n', '\r', '\n\r']) {
      for (const continuation of ['', `\\${newline}continued /* inert`]) {
        const value = `mark "title // /* inert${continuation}`;
        const tree = parser.parse(`#pragma ${value}${newline}int after; /*other*/ int second;${newline}`)!;
        try {
          expect(tree.rootNode.hasError).toBe(false);
          expect(tree.rootNode.namedChildren[0]?.childForFieldName('argument')?.text).toBe(value);
          expect(
            tree.rootNode.namedChildren.filter((node) => node.type === 'declaration').map((node) => node.text)
          ).toEqual(['int after;', 'int second;']);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('preserves trailing macro comments after unmatched quotes containing line markers', () => {
  const parser = createParser();
  try {
    for (const quote of ['"', "'"]) {
      for (const newline of ['\n', '\r\n', '\r', '\n\r']) {
        for (const middle of ['// c', '// c /*inner*/ continued', `/\\${newline}/ c`]) {
          const value = `mark ${quote}title ${middle} `;
          const tree = parser.parse(`#define M ${value}/*tail*/${newline}int after;${newline}`)!;
          try {
            expect(tree.rootNode.hasError).toBe(false);
            const [macro, declaration] = tree.rootNode.namedChildren;
            expect(macro?.childForFieldName('value')?.text).toBe(value);
            expect(macro?.descendantsOfType('comment').map((node) => node.text)).toEqual(['/*tail*/']);
            expect(declaration?.text).toBe('int after;');
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

test('preserves declarations and trailing comments after quotes cross physical newlines', () => {
  const parser = createParser();
  try {
    for (const newline of ['\n', '\r\n', '\r', '\n\r']) {
      const comment = `/* see${newline}   John's notes */`;
      const tree = parser.parse(`#define X don't ${comment}${newline}int after;${newline}`)!;
      try {
        expect(tree.rootNode.hasError).toBe(false);
        const [macro, declaration] = tree.rootNode.namedChildren;
        expect(macro?.childForFieldName('value')?.text).toBe("don't ");
        expect(macro?.descendantsOfType('comment').map((node) => node.text)).toEqual([comment]);
        expect(declaration?.text).toBe('int after;');
      } finally {
        tree.delete();
      }
    }
    for (const newline of ['\n', '\r\n', '\n\r']) {
      const broken = parser.parse(
        `#define OPEN "/*${newline}int x = 1;${newline}const char *s = "hi";${newline}int y;${newline}`
      )!;
      try {
        expect(broken.rootNode.hasError).toBe(true);
        expect(
          broken.rootNode.namedChildren.filter((node) => node.type === 'declaration').map((node) => node.text)
        ).toEqual(['int x = 1;', 'const char *s = "hi";', 'int y;']);
      } finally {
        broken.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

function createParser(): Parser {
  const parser = new Parser();
  parser.setLanguage(language);
  return parser;
}
