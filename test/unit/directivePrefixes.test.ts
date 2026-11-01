import { Language, Parser } from '@willbooster/web-tree-sitter';
import { beforeAll, expect, test } from 'vitest';

const gaps = [
  ['ordinary spacing', ' '],
  ['a compact comment', '/**/'],
  ['separated comments', ' /* first */ \t/* second */ '],
  ['adjacent comments', '/**//* second**/'],
  ['a multiline comment', '/* first\nsecond */'],
  ['horizontal whitespace', ' \t\v\f'],
  ['a spliced line', '\\\r\n\t/**/'],
] as const;

let language: Language;

beforeAll(async () => {
  await Parser.init();
  language = await Language.load('tree-sitter-c.wasm');
});

test.each(gaps)('retains macro ownership after %s in a directive prefix', (_description, gap) => {
  const source = `#${gap}define VALUE 7\n#${gap}define GROUP/**/(VALUE)\n#${gap}define APPLY(x) ((x)+GROUP)\nint result = APPLY(1);\n`;
  withTree(source, (tree) => {
    expect(tree.rootNode.hasError, source).toBe(false);
    expect(
      tree.rootNode
        .descendantsOfType('preproc_def')
        .map((node) => ['name', 'value'].map((field) => node.childForFieldName(field)?.text))
    ).toEqual([
      ['VALUE', '7'],
      ['GROUP', '(VALUE)'],
    ]);
    const functions = tree.rootNode.descendantsOfType('preproc_function_def');
    expect(functions).toHaveLength(1);
    expect(['name', 'parameters', 'value'].map((field) => functions[0]!.childForFieldName(field)?.text)).toEqual([
      'APPLY',
      '(x)',
      '((x)+GROUP)',
    ]);
    expect(tree.rootNode.descendantsOfType('declaration').map((node) => node.text)).toEqual(['int result = APPLY(1);']);
  });
});

test.each(gaps)('binds include, conditional and generic directives after %s', (_description, gap) => {
  const source = `#${gap}include <stddef.h>\n#${gap}pragma GCC diagnostic push\n#define ENABLED 1\n#${gap}if ENABLED\nint first;\n#${gap}elif 0\nint second;\n#${gap}else\nint third;\n#${gap}endif\n#${gap}undef ENABLED\n#${gap}line 200\n#${gap}pragma GCC diagnostic pop\nsize_t following;\n`;
  withTree(source, (tree) => {
    expect(tree.rootNode.hasError, source).toBe(false);
    expect(
      tree.rootNode.descendantsOfType('preproc_include').map((node) => node.childForFieldName('path')?.text)
    ).toEqual(['<stddef.h>']);
    expect(
      tree.rootNode.descendantsOfType('preproc_if').map((node) => node.childForFieldName('condition')?.text)
    ).toEqual(['ENABLED']);
    expect(
      tree.rootNode.descendantsOfType('preproc_elif').map((node) => node.childForFieldName('condition')?.text)
    ).toEqual(['0']);
    expect(tree.rootNode.descendantsOfType('preproc_else')).toHaveLength(1);
    expect(
      tree.rootNode.descendantsOfType('preproc_call').map((node) => node.childForFieldName('directive')?.text)
    ).toEqual([`#${gap}pragma`, `#${gap}undef`, `#${gap}line`, `#${gap}pragma`]);
    expect(tree.rootNode.descendantsOfType('declaration').at(-1)?.text).toBe('size_t following;');
  });
});

test.each(gaps)('recognizes conditional declaration markers after %s', (_description, gap) => {
  const source = `#define ENABLED 1\n#define MARKER __attribute__((unused))\n#${gap}ifdef ENABLED\nMARKER\n#${gap}endif\nint value;\n`;
  withTree(source, (tree) => {
    expect(tree.rootNode.hasError, source).toBe(false);
    const declarations = tree.rootNode.descendantsOfType('declaration');
    expect(declarations).toHaveLength(1);
    expect(declarations[0]!.childForFieldName('type')?.text).toBe('int');
    expect(declarations[0]!.childForFieldName('declarator')?.text).toBe('value');
    expect(declarations[0]!.descendantsOfType('macro_specifier').map((node) => node.text)).toEqual(['MARKER']);
  });
});

test.each(['\n', '\r\n', '// line comment\n', '/* unterminated'])(
  'reports errors across an unfinished directive prefix %j',
  (gap) => {
    withTree(`#${gap}define VALUE 1\nint result = VALUE;\n`, (tree) => {
      expect(tree.rootNode.hasError).toBe(true);
    });
  }
);

function withTree(source: string, check: (tree: NonNullable<ReturnType<Parser['parse']>>) => void): void {
  const parser = new Parser().setLanguage(language);
  const tree = parser.parse(source)!;
  try {
    check(tree);
  } finally {
    tree.delete();
    parser.delete();
  }
}
