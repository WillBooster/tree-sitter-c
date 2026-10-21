import { Language, Parser } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test.each([
  ['HEADER EMPTY', '// tail'],
  ['HEADER /* middle */ EMPTY', '/* trailing */', '/* middle */'],
  ['HEADER /* middle\nline */ EMPTY', '/* trailing */', '/* middle\nline */'],
  ['HEADER EMPTY', '/* trailing\nline */'],
  ['HEADER /* middle\nline */ EMPTY', '/* trailing\nline */', '/* middle\nline */'],
  ['HEADER_OF(items) EMPTY', '/* first */ /* second */'],
  ['HEADER \\\n EMPTY', '// tail'],
  ['HEADER', '// tail'],
  ['HEADER_OF(items)', '/* trailing */'],
  ['"items.h"', '/* trailing */'],
  ['<items.h>', '// tail'],
  ['HEADER EMPTY', '_Pragma("GCC diagnostic push")'],
  ['HEADER', '_Pragma("GCC diagnostic push")'],
  ['HEADER _Pragma("GCC diagnostic push") EMPTY', '// tail', '_Pragma("GCC diagnostic push")'],
])(
  'keeps trailing extras outside the include path %s',
  async (operand: string, trailing: string, interior?: string) => {
    await Parser.init();
    const parser = new Parser();
    parser.setLanguage(await Language.load('tree-sitter-c.wasm'));
    const directive = `#include ${operand} ${trailing}\n`;
    const source = `${directive}int values[] = {\n${directive}1,\n};\nint following(void) { return values[0]; }\n`;
    const tree = parser.parse(source)!;
    try {
      expect(tree.rootNode.hasError).toBe(false);
      const includes = tree.rootNode.descendantsOfType('preproc_include');
      expect(includes).toHaveLength(2);
      for (const include of includes) {
        const path = include.childForFieldName('path')!;
        expect(path.text).toBe(operand);
        expect(source.slice(path.endIndex, include.endIndex)).toBe(` ${trailing}\n`);
        expect(include.descendantsOfType(['comment', 'pragma_operator']).map((node) => node.text)).toEqual([
          ...(interior ? [interior] : []),
          ...(trailing === '/* first */ /* second */' ? ['/* first */', '/* second */'] : [trailing]),
        ]);
      }
      expect(tree.rootNode.descendantsOfType('initializer_list')[0]!.namedChildren.at(-1)!.text).toBe('1');
      expect(tree.rootNode.descendantsOfType('function_definition').map((node) => node.text)).toEqual([
        'int following(void) { return values[0]; }',
      ]);
    } finally {
      tree.delete();
      parser.delete();
    }
  }
);
