import { Language, Parser } from '@willbooster/web-tree-sitter';
import { beforeAll, expect, test } from 'vitest';

let language: Language;

beforeAll(async () => {
  await Parser.init();
  language = await Language.load('tree-sitter-c.wasm');
});

test('validates directives in a large full parse', { timeout: 120_000 }, () => {
  const prefix = '#define VALUE 1\nint value = VALUE;\n/*';
  const bodyLength = 300_000_000;
  const chunk = '*'.repeat(1 << 20);
  const suffix = '/\n';
  const length = prefix.length + bodyLength + suffix.length;
  const parser = new Parser().setLanguage(language);
  try {
    const tree = parser.parse((index) => {
      if (index < prefix.length) return prefix.slice(index);
      const bodyOffset = index - prefix.length;
      if (bodyOffset < bodyLength) return chunk.slice(0, Math.min(chunk.length, bodyLength - bodyOffset));
      return suffix.slice(bodyOffset - bodyLength);
    })!;
    try {
      expect(tree.rootNode.hasError).toBe(false);
      expect(tree.rootNode.endIndex).toBe(length);
      expect(tree.rootNode.descendantsOfType('comment')).toHaveLength(1);
      expect(tree.rootNode.descendantsOfType('preproc_def')[0]?.childForFieldName('name')?.text).toBe('VALUE');
      expect(tree.rootNode.descendantsOfType('declaration')[0]?.childForFieldName('declarator')?.text).toBe(
        'value = VALUE'
      );
    } finally {
      tree.delete();
    }
  } finally {
    parser.delete();
  }
});
