import { Language, Parser } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test('preserves declarations after an unexpanded header macro before typedef', async () => {
  await Parser.init();
  const parser = new Parser();
  parser.setLanguage(await Language.load('tree-sitter-c.wasm'));
  try {
    for (const [declaration, type, declarator] of [
      ['enum { A, B } Level;', 'enum { A, B }', 'Level'],
      ['struct { int value; } Value;', 'struct { int value; }', 'Value'],
      ['union { int value; } Value;', 'union { int value; }', 'Value'],
      ['int Foo;', 'int', 'Foo'],
      ['void (*Fn)(int);', 'void', '(*Fn)(int)'],
      ['unsigned long Wide;', 'unsigned long', 'Wide'],
      ['Existing Alias;', 'Existing', 'Alias'],
    ]) {
      const source = `#ifndef HEADER_H\n#define HEADER_H\nBEGIN_DECLS\ntypedef ${declaration}\nint after(void);\n#endif\n`;
      const tree = parser.parse(source)!;
      try {
        const guard = tree.rootNode.namedChildren[0]!;
        expect(guard.type).toBe('preproc_ifdef');
        const parsed = guard.descendantsOfType('declaration').find((node) => node.text === declaration)!;
        expect(parsed?.hasError).toBe(false);
        expect(parsed?.childForFieldName('type')?.text).toBe(type);
        expect(parsed?.childForFieldName('declarator')?.text).toBe(declarator);
        expect(guard.descendantsOfType('function_declarator').at(-1)?.text).toBe('after(void)');
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('retains legacy implicit-int declaration recovery after qualifiers', async () => {
  await Parser.init();
  const parser = new Parser();
  parser.setLanguage(await Language.load('tree-sitter-c.wasm'));
  try {
    const source = 'const x = 1; volatile y = 2; const z; void f(void) { const local = 3; int after; }';
    const tree = parser.parse(source)!;
    try {
      expect(tree.rootNode.descendantsOfType('ERROR')).toHaveLength(0);
      const declarations = tree.rootNode.descendantsOfType('declaration');
      expect(declarations.map((node) => node.text)).toEqual([
        'const x = 1;',
        'volatile y = 2;',
        'const z;',
        'const local = 3;',
        'int after;',
      ]);
      expect(declarations.map((node) => node.childForFieldName('type')?.text)).toEqual(['x', 'y', 'z', 'local', 'int']);
      expect(tree.rootNode.descendantsOfType('number_literal').map((node) => node.text)).toEqual(['1', '2', '3']);
      expect(tree.rootNode.descendantsOfType('function_definition').at(-1)?.childForFieldName('declarator')?.text).toBe(
        'f(void)'
      );
    } finally {
      tree.delete();
    }
  } finally {
    parser.delete();
  }
});
