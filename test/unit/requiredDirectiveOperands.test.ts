import { Language, Parser } from '@willbooster/web-tree-sitter';
import { beforeAll, expect, test } from 'vitest';

let language: Language;

beforeAll(async () => {
  await Parser.init();
  language = await Language.load('tree-sitter-c.wasm');
});

test.each(['\n', '\r', '\r\n', '\n\r'])(
  'rejects missing directive operands outside conditional groups with newline %j',
  (newline) => {
    for (const name of ['define', 'undef', 'line', 'include', 'include_next', 'embed', 'ifdef', 'ifndef']) {
      const end = name.startsWith('if') ? '#endif\n' : '';
      for (const gap of ['', ' \t', '/**/', '/* first\nsecond */']) {
        const source = `#${name}${gap}\n#\nint following;\n${end}`.replaceAll('\n', newline);
        withTree(source, (tree) => expect(tree.rootNode.hasError, source).toBe(true));
      }
      withTree(`#${name}`, (tree) => expect(tree.rootNode.hasError).toBe(true));
      const spliced = `#${name.slice(0, 2)}\\\n${name.slice(2)}\nint following;\n${end}`.replaceAll('\n', newline);
      withTree(spliced, (tree) => expect(tree.rootNode.hasError, spliced).toBe(true));
    }
  }
);

test.each([
  ['undef', 'NAME'],
  ['undef', '_Pragma'],
  ['undef', '_Pragma("GCC diagnostic push")'],
  ['line', '200'],
  ['line', '200 "path/*literal*/.h"'],
])('preserves an operand after #%s: %s', (name, operand) => {
  for (const gap of [' ', '/**/', '/* first\nsecond */', '\\\n ']) {
    const source = `#${name}${gap}${operand}\nint following;\n`;
    withTree(source, (tree) => {
      expect(tree.rootNode.hasError, source).toBe(false);
      const call = tree.rootNode.descendantsOfType('preproc_call')[0];
      expect(call?.childForFieldName('directive')?.text).toBe(`#${name}`);
      expect(call?.childForFieldName('argument')?.text).toBe(operand);
      expect(tree.rootNode.namedChildren.at(-1)?.text).toBe('int following;');
    });
  }
  const source = `#${name} ${operand}`;
  withTree(source, (tree) => {
    expect(tree.rootNode.hasError).toBe(false);
    expect(tree.rootNode.endIndex).toBe(source.length);
    expect(tree.rootNode.descendantsOfType('preproc_call')[0]?.childForFieldName('argument')?.text).toBe(operand);
  });
});

test.each([
  ['', 'int following;\n'],
  ['enum E {\n', 'VALUE\n};\n'],
  ['struct S {\n', 'int value;\n};\n'],
  ['void f(void) {\n', 'int following;\n}\n'],
])('preserves ignored directive operands within conditional groups after %j', (prefix, suffix) => {
  const source = `${prefix}#if 0\n#if 1\n#undef\n#endif\n#line\n#endif\n${suffix}`;
  withTree(source, (tree) => {
    expect(tree.rootNode.hasError, source).toBe(false);
    expect(
      tree.rootNode.descendantsOfType('preproc_call').map((node) => node.childForFieldName('directive')?.text)
    ).toEqual(expect.arrayContaining(['#undef', '#line']));
  });
});

test.each(['#define _Pragma', '#define _Pragma(x)', '#define _Pragma (x)', '#undef _Pragma', '#ifdef _Pragma\n#endif'])(
  'accepts _Pragma as the operand of %j',
  (directive) => {
    withTree(`${directive}\nint following;\n`, (tree) => {
      expect(tree.rootNode.hasError).toBe(false);
      expect(tree.rootNode.namedChildren.at(-1)?.text).toBe('int following;');
    });
  }
);

test.each([
  '#include _Pragma("once")',
  '#include_next _Pragma("once")',
  '#embed _Pragma("once")',
  '#line _Pragma("once")',
  '#ifdef _Pragma("once")\n#endif',
  '#ifndef _Pragma("once")\n#endif',
  '#define _Pragma("once")',
  '#define _Pragma ( u8"once" )',
])('rejects a _Pragma operator in place of the operand of %j', (directive) => {
  withTree(`${directive}\nint following;\n`, (tree) => expect(tree.rootNode.hasError).toBe(true));
});

test('accepts an operand after a _Pragma operator', () => {
  withTree('#line _Pragma("once") 5\nint following;\n', (tree) => {
    expect(tree.rootNode.hasError).toBe(false);
    expect(tree.rootNode.namedChildren.at(-1)?.text).toBe('int following;');
  });
});

test('requires operands again after leaving a conditional group', () => {
  withTree('#if 0\n#undef\n#line\n#endif\n#undef\nint following;\n', (tree) => {
    expect(tree.rootNode.hasError).toBe(true);
  });
  for (const prefix of ['/* #if 0 */\n', 'char *text = "#if 0";\n']) {
    withTree(`${prefix}#line\nint following;\n`, (tree) => expect(tree.rootNode.hasError).toBe(true));
  }
});

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
