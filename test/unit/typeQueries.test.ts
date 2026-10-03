import { Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test('preserves type query captures for sized declarations and enum bases', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser();
  parser.setLanguage(language);
  const tree = parser.parse('unsigned char a; unsigned _BitInt(8) b; enum E : unsigned char { A };');
  const query = new Query(
    language,
    '(declaration type: (type_specifier) @type) (enum_specifier underlying_type: (sized_type_specifier) @type)'
  );
  try {
    expect(tree?.rootNode.hasError).toBe(false);
    expect(query.captures(tree!.rootNode).map(({ node }) => node.text)).toEqual([
      'unsigned char',
      'unsigned _BitInt(8)',
      'unsigned char',
    ]);
  } finally {
    query.delete();
    tree?.delete();
    parser.delete();
  }
});
