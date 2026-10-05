import fs from 'node:fs';
import path from 'node:path';

import { Edit, Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

await Parser.init();
const language = await Language.load(path.join(import.meta.dirname, '../../tree-sitter-c.wasm'));

test('preserves macro name adjacency across comments and line splices', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const name of [
      'M',
      'int',
      '$name',
      '_name',
      'a0',
      'é',
      '変数',
      'á',
      String.raw`\u00e9`,
      String.raw`\U000000e9`,
    ]) {
      for (const splice of ['', '\\\n', '\\\r\n', '\\\r', '\\\n\r']) {
        for (const separator of ['', ' ', '/**/', '/*one\ntwo*/', '/**/\t/**/']) {
          const source = `#define ${name}${splice}${separator}(x) x\nint after;\n`;
          const tree = parser.parse(source)!;
          try {
            expect(tree.rootNode.hasError, JSON.stringify(source)).toBe(false);
            const [macro, declaration] = tree.rootNode.namedChildren;
            expect(macro?.childForFieldName('name')?.text).toBe(name);
            expect(declaration?.text).toBe('int after;');
            if (separator) {
              expect(macro?.type).toBe('preproc_def');
              expect(macro?.childForFieldName('parameters')).toBeNull();
              expect(macro?.childForFieldName('value')?.text).toBe('(x) x');
            } else {
              expect(macro?.type).toBe('preproc_function_def');
              expect(macro?.childForFieldName('parameters')?.text).toBe('(x)');
              expect(macro?.childForFieldName('value')?.text).toBe('x');
            }
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

test('retains function-like names after leading splices and comments', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const newline of ['\n', '\r\n', '\r', '\n\r']) {
      const splice = `\\${newline}`;
      for (const prefix of [splice, `/**/${splice}`, `${splice} ${splice}\t`, `${splice}/**/`]) {
        for (const name of ['M', String.raw`\u00e9`, String.raw`\U000000e9`]) {
          const source = `#define ${prefix}${name}(x) x\nint after;\n`;
          const tree = parser.parse(source)!;
          try {
            expect(tree.rootNode.hasError, JSON.stringify(source)).toBe(false);
            const [macro, declaration] = tree.rootNode.namedChildren;
            expect(macro?.type).toBe('preproc_function_def');
            expect(macro?.childForFieldName('name')?.text).toBe(name);
            expect(macro?.childForFieldName('parameters')?.text).toBe('(x)');
            expect(macro?.childForFieldName('value')?.text).toBe('x');
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

test('updates macro classification and query captures after adjacency edits', () => {
  const parser = new Parser().setLanguage(language);
  const query = new Query(language, fs.readFileSync('queries/highlights.scm', 'utf8'));
  const prefix = '#define M';
  const suffix = '(x) x\nint after;\n';
  let gap = '';
  let tree = parser.parse(prefix + suffix)!;
  const captures = (root: typeof tree.rootNode): unknown[] =>
    query
      .captures(root)
      .map(({ name, node }) => ({ name, text: node.text, start: node.startIndex, end: node.endIndex }));
  try {
    for (const nextGap of ['/**/', '', '\\\n', '\\\n/**/', '\\\r/**/', '\\\r', ' ', '', '/**/\\\n', '']) {
      tree.edit(
        new Edit({
          startIndex: prefix.length,
          oldEndIndex: prefix.length + gap.length,
          newEndIndex: prefix.length + nextGap.length,
          startPosition: point(prefix),
          oldEndPosition: point(prefix + gap),
          newEndPosition: point(prefix + nextGap),
        })
      );
      const source = prefix + nextGap + suffix;
      const next = parser.parse(source, tree)!;
      tree.delete();
      tree = next;
      const fresh = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, JSON.stringify(nextGap)).toBe(false);
        expect(tree.rootNode.toString()).toBe(fresh.rootNode.toString());
        expect(captures(tree.rootNode)).toEqual(captures(fresh.rootNode));
        expect(query.captures(tree.rootNode).some(({ node }) => node.text === 'M')).toBe(true);
      } finally {
        fresh.delete();
      }
      gap = nextGap;
    }
  } finally {
    tree.delete();
    query.delete();
    parser.delete();
  }
});

function point(text: string): { row: number; column: number } {
  const lines = text.split('\n');
  return { row: lines.length - 1, column: lines.at(-1)!.length };
}
