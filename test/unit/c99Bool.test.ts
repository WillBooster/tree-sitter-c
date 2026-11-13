import { Language, Parser } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test('parses C99 boolean declarations and abstract types in file and block scopes', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser().setLanguage(language);
  const source = `_Bool (*global)(int);
_Bool check(_Bool value) { return value; }
void f(void) {
  _Bool (*local)(int) = global;
  const _Bool values[2] = {0, 1};
  sizeof(_Bool[4]);
  sizeof(_Bool (*)(int));
}`;
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(
      tree.rootNode.descendantsOfType('declaration').map((node) => node.childForFieldName('declarator')?.text)
    ).toEqual(['(*global)(int)', '(*local)(int) = global', 'values[2] = {0, 1}']);
    expect(
      tree.rootNode.descendantsOfType('sizeof_expression').map((node) => node.childForFieldName('type')?.text)
    ).toEqual(['_Bool[4]', '_Bool (*)(int)']);
    expect(tree.rootNode.descendantsOfType('call_expression')).toHaveLength(0);
  } finally {
    tree.delete();
    parser.delete();
  }
});
