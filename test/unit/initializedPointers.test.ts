import fs from 'node:fs';

import { Language, type Node, Parser, Query } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

const declaratorKinds = ['parenthesized_declarator', 'pointer_declarator'];

test('keeps initialized parenthesized pointers as declarations alongside calls and assignments', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser().setLanguage(language);
  const source = fs.readFileSync('test/fixtures/initializedPointers.c', 'utf8');
  const tree = parser.parse(source)!;
  const plain = new Query(language, declaratorKinds.map((kind) => `(${kind}) @${kind}`).join('\n'));
  const qualified = new Query(language, declaratorKinds.map((kind) => `(_declarator/${kind}) @${kind}`).join('\n'));
  try {
    expect(tree.rootNode.hasError).toBe(false);
    const body = tree.rootNode.descendantsOfType('function_definition')[0]!.childForFieldName('body')!;
    const declarations = body.namedChildren.filter((node) => node.type === 'declaration');
    expect(declarations.map((node) => node.text)).toEqual([
      'Scalar (*pointer) = in;',
      'Scalar (((*nested))) = in;',
      'Scalar *(*pointerToPointer) = &pointer;',
      'Scalar (*const qualified) = in;',
      'Scalar (*p) = in, (*q) = in;',
    ]);
    for (const declaration of declarations) expect(declaration.childForFieldName('type')!.text).toBe('Scalar');
    const initializers = body.descendantsOfType('init_declarator');
    expect(initializers.map((node) => node.childForFieldName('declarator')!.text)).toEqual([
      '(*pointer)',
      '(((*nested)))',
      '*(*pointerToPointer)',
      '(*const qualified)',
      '(*p)',
      '(*q)',
    ]);
    expect(initializers.map((node) => node.childForFieldName('value')!.text)).toEqual([
      'in',
      'in',
      '&pointer',
      'in',
      'in',
      'in',
    ]);
    expect(captures(qualified, body)).toEqual(captures(plain, body));
    expect(body.descendantsOfType('assignment_expression').map((node) => node.text)).toEqual([
      '(*pointer) = 1',
      '(holder->value) = in',
      'holder->value[0] = 2',
      '*get() = 3',
      'selectValue(*pointer)[0] = 4',
      'selectHolder(*pointer)->value = in',
      'SLOT(pointer) = 5',
      'SLOT(pointer) += 1',
    ]);
    expect(body.descendantsOfType('call_expression').map((node) => node.text)).toEqual([
      'get()',
      'selectValue(*pointer)',
      'selectHolder(*pointer)',
      'SLOT(pointer)',
      'SLOT(pointer)',
      'consume((*pointer))',
      'consume(*get())',
      'get()',
    ]);
    for (const { node } of qualified.captures(body)) {
      expect(source.slice(node.startIndex, node.endIndex)).toBe(node.text);
      const before = source.slice(0, node.startIndex).split('\n');
      expect(node.startPosition).toEqual({ row: before.length - 1, column: before.at(-1)!.length });
    }
  } finally {
    qualified.delete();
    plain.delete();
    tree.delete();
    parser.delete();
  }
});

test('keeps declaration fields around initialized and parenthesized pointer statements', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load('tree-sitter-c.wasm'));
  try {
    for (const statement of [
      'Scalar (*pointer) = in;',
      'Scalar (((*pointer))) = in;',
      'Scalar (*const pointer) = in;',
      'Scalar (*pointer);',
      'consume(*pointer);',
      '(*pointer) = *in;',
    ]) {
      const tree = parser.parse(`typedef double Scalar;\nvoid f(Scalar *in) {\n  ${statement}\n  int after;\n}\n`)!;
      try {
        expect(tree.rootNode.hasError, statement).toBe(false);
        expect(tree.rootNode.descendantsOfType('init_declarator').length).toBe(
          statement.startsWith('Scalar') && statement.includes('=') ? 1 : 0
        );
        expect(tree.rootNode.descendantsOfType('declaration').at(-1)!.text).toBe('int after;');
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

function captures(query: Query, root: Node): unknown[] {
  return query
    .captures(root)
    .map(({ name, node }) => [name, node.text, node.startIndex, node.endIndex, node.startPosition, node.endPosition]);
}
