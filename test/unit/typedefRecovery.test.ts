import { Language, Parser } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test('preserves declarations after an unexpanded header macro before typedef', async () => {
  await Parser.init();
  const parser = new Parser();
  parser.setLanguage(await Language.load('tree-sitter-c.wasm'));
  try {
    for (const declaration of ['enum { A, B } Level;', 'struct { int value; } Value;', 'union { int value; } Value;']) {
      const source = `#ifndef HEADER_H\n#define HEADER_H\nBEGIN_DECLS\ntypedef ${declaration}\nint after(void);\n#endif\n`;
      const tree = parser.parse(source)!;
      try {
        const guard = tree.rootNode.namedChildren[0]!;
        expect(guard.type).toBe('preproc_ifdef');
        const kind = declaration.split(' ')[0]!;
        const specifier = guard.descendantsOfType(`${kind}_specifier`)[0]!;
        expect(specifier?.hasError).toBe(false);
        expect(specifier?.text).toBe(declaration.slice(0, declaration.lastIndexOf(' ')));
        expect(guard.descendantsOfType('function_declarator').map((node) => node.text)).toEqual(['after(void)']);
        expect(
          guard.descendantsOfType(kind === 'enum' ? 'enumerator' : 'field_declaration').map((node) => node.text)
        ).toEqual(kind === 'enum' ? ['A', 'B'] : ['int value;']);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});
