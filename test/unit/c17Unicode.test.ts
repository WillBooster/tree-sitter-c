import { Language, Parser } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test('C17 identifiers include Annex D characters beyond XID and retain combining continuations', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load('tree-sitter-c.wasm'));
  const source = 'typedef int ¨;void f(void){¨ 😀=1;int a\u0301=😀;int value；=a\u0301;}';
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(tree.rootNode.descendantsOfType('identifier').map((node) => node.text)).toEqual(
      expect.arrayContaining(['😀', 'a\u0301', 'value；'])
    );
  } finally {
    tree.delete();
  }
  const invalid = parser.parse('int \u0301a;')!;
  try {
    expect(invalid.rootNode.hasError).toBe(true);
  } finally {
    invalid.delete();
    parser.delete();
  }
});
