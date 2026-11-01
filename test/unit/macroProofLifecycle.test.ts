import path from 'node:path';

import { Language, Parser } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test('keeps marker proof results local to each complete source', async () => {
  await Parser.init();
  const language = await Language.load(path.join(import.meta.dirname, '../../tree-sitter-c.wasm'));
  const parser = new Parser().setLanguage(language);
  const header = '#define A\n#define TYPE(...) __VA_ARGS__\n';
  try {
    for (const valid of [false, true, false, true]) {
      const tail = valid ? 'TYPE(struct { int member; }) value;' : '@;';
      const source = `${header}void outer(void) { ${'A '.repeat(256)}${tail} }\nint following;\n`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(!valid);
        expect(tree.rootNode.namedChildren.at(-1)?.text).toBe('int following;');
        if (valid) {
          const body = tree.rootNode.descendantsOfType('function_definition')[0]?.childForFieldName('body');
          const declaration = body?.descendantsOfType('declaration')[0];
          expect(declaration?.childForFieldName('declarator')?.text).toBe('value');
          expect(declaration?.descendantsOfType('field_declaration')[0]?.childForFieldName('declarator')?.text).toBe(
            'member'
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
