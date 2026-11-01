import { Language, Parser } from '@willbooster/web-tree-sitter';
import { beforeAll, expect, test } from 'vitest';

let language: Language;

beforeAll(async () => {
  await Parser.init();
  language = await Language.load('tree-sitter-c.wasm');
});

test('validates directives in a large full parse', { timeout: 60_000 }, () => {
  const comment = `/${'*'.repeat(140_000_000)}/\n`;
  const parser = new Parser().setLanguage(language);
  try {
    for (const prefix of ['', 'int before; ']) {
      const source = `${prefix}#define VALUE 1\nint value = VALUE;\n${comment}`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError).toBe(prefix.length > 0);
        expect(tree.rootNode.endIndex).toBe(source.length);
        expect(tree.rootNode.descendantsOfType('comment')).toHaveLength(1);
        if (!prefix) {
          expect(tree.rootNode.descendantsOfType('preproc_def')[0]?.childForFieldName('name')?.text).toBe('VALUE');
          expect(tree.rootNode.descendantsOfType('declaration')[0]?.childForFieldName('declarator')?.text).toBe(
            'value = VALUE'
          );
        }
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});
