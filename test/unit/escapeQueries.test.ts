import { Edit, Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test('preserves valid escape queries and separates invalid escapes across edits', async () => {
  await Parser.init();
  const parser = new Parser();
  const language = await Language.load('tree-sitter-c.wasm');
  parser.setLanguage(language);
  const source = String.raw`void f(void) { const char *valid = "\x00000000a\749\1234\0\07\377\n\e\E\u00e9\U0001F600\x{41}\o{101}\u{1F600}\N{LATIN SMALL LETTER A}"; int good = '\x00000000a'; const char *invalid = "\q\8\9\x\u12\U1234567"; int bad = '\q'; }`;
  const query = new Query(
    language,
    `
    (string_literal (escape_sequence) @valid)
    (expression/char_literal (escape_sequence) @valid)
    (string_literal (invalid_escape_sequence) @invalid)
    (expression/char_literal (invalid_escape_sequence) @invalid)
  `
  );
  let tree = parser.parse(source)!;
  const captures = (root: typeof tree.rootNode): { name: string; text: string; start: number; end: number }[] =>
    query
      .captures(root)
      .map(({ name, node }) => ({ name, text: node.text, start: node.startIndex, end: node.endIndex }));
  try {
    expect(tree.rootNode.hasError).toBe(false);
    const initial = captures(tree.rootNode);
    expect(initial.filter(({ name }) => name === 'valid').map(({ text }) => text)).toEqual([
      String.raw`\x00000000a`,
      String.raw`\74`,
      String.raw`\123`,
      String.raw`\0`,
      String.raw`\07`,
      String.raw`\377`,
      String.raw`\n`,
      String.raw`\e`,
      String.raw`\E`,
      String.raw`\u00e9`,
      String.raw`\U0001F600`,
      String.raw`\x{41}`,
      String.raw`\o{101}`,
      String.raw`\u{1F600}`,
      String.raw`\N{LATIN SMALL LETTER A}`,
      String.raw`\x00000000a`,
    ]);
    expect(initial.filter(({ name }) => name === 'invalid').map(({ text }) => text)).toEqual([
      String.raw`\q`,
      String.raw`\8`,
      String.raw`\9`,
      String.raw`\x`,
      String.raw`\u12`,
      String.raw`\U1234567`,
      String.raw`\q`,
    ]);
    const startIndex = source.indexOf(String.raw`\q`);
    for (const replacement of [String.raw`\n`, String.raw`\q`]) {
      tree.edit(
        new Edit({
          startIndex,
          oldEndIndex: startIndex + 2,
          newEndIndex: startIndex + 2,
          startPosition: { row: 0, column: startIndex },
          oldEndPosition: { row: 0, column: startIndex + 2 },
          newEndPosition: { row: 0, column: startIndex + 2 },
        })
      );
      const nextSource = source.slice(0, startIndex) + replacement + source.slice(startIndex + 2);
      const next = parser.parse(nextSource, tree)!;
      tree.delete();
      tree = next;
      const fresh = parser.parse(nextSource)!;
      try {
        expect(tree.rootNode.hasError).toBe(false);
        expect(tree.rootNode.toString()).toBe(fresh.rootNode.toString());
        const result = captures(tree.rootNode);
        expect(result).toEqual(captures(fresh.rootNode));
        expect(result.find(({ start }) => start === startIndex)?.name).toBe(
          replacement === String.raw`\n` ? 'valid' : 'invalid'
        );
      } finally {
        fresh.delete();
      }
    }
  } finally {
    query.delete();
    tree.delete();
    parser.delete();
  }
});
