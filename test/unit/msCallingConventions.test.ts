import { Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test('keeps pointer calling-convention captures independent of surrounding declarations', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser().setLanguage(language);
  const query = new Query(language, '(pointer_declarator (ms_call_modifier) @calling_convention)');
  const prototype = 'int __stdcall *f(void);';
  const definition = 'int __stdcall *f(void) { return 0; }';
  const surrounding = 'typedef int __stdcall *Callback(void); struct Holder { int __stdcall *(*factory)(void); };';
  try {
    for (const source of [
      prototype,
      'typedef void(__stdcall *fp)();',
      definition,
      `${prototype}\n${definition}`,
      `${prototype}\n${definition}\n${surrounding}`,
      `${surrounding}\n${prototype}\n${definition}`,
      'int __stdcall **f(void); int __stdcall **f(void) { return 0; }',
    ]) {
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        const modifiers = tree.rootNode.descendantsOfType('ms_call_modifier');
        expect(modifiers.length).toBeGreaterThan(0);
        expect(
          query.captures(tree.rootNode).map(({ node }) => [node.text, node.startIndex, node.endIndex]),
          source
        ).toEqual(modifiers.map((node) => [node.text, node.startIndex, node.endIndex]));
        for (const modifier of modifiers) {
          expect(modifier.text).toBe(source.slice(modifier.startIndex, modifier.endIndex));
        }
      } finally {
        tree.delete();
      }
    }
  } finally {
    query.delete();
    parser.delete();
  }
});
