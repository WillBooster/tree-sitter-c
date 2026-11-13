import { Language, Parser } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test('postfix updates bind inside unary operators and preserve explicit parentheses', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load('tree-sitter-c.wasm'));
  const source = 'void f(void){-x++;!x--;~x++;+x++;- -x++;-s.x++;-p->x--;(-x)++;*p++;p++->x;}';
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    const expressions = tree.rootNode.descendantsOfType('expression_statement').map((node) => node.firstNamedChild!);
    expect(expressions.slice(0, 7).map((node) => node.type)).toEqual(
      Array.from({ length: 7 }, () => 'unary_expression')
    );
    expect(expressions[0]?.childForFieldName('argument')?.type).toBe('update_expression');
    expect(expressions[4]?.childForFieldName('argument')?.childForFieldName('argument')?.type).toBe(
      'update_expression'
    );
    expect(expressions[5]?.descendantsOfType('update_expression')[0]?.childForFieldName('argument')?.type).toBe(
      'field_expression'
    );
    expect(expressions[7]?.childForFieldName('argument')?.type).toBe('parenthesized_expression');
    expect(expressions[8]?.childForFieldName('argument')?.type).toBe('update_expression');
    expect(expressions[9]?.childForFieldName('argument')?.type).toBe('update_expression');
  } finally {
    tree.delete();
    parser.delete();
  }
});
