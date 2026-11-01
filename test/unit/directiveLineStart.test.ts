import { Language, Parser } from '@willbooster/web-tree-sitter';
import { beforeAll, expect, test } from 'vitest';

const directives = [
  '#define VALUE 1\n',
  '#/**/define VALUE 1\n',
  '#pragma unknown\n',
  '#if 1\nint value;\n#endif\n',
  '#ifdef VALUE\nint value;\n#endif\n',
];
const prefixes = ['', ' \t\v\f', '/**/', '/* first\nsecond */', '\\\n', ' \\\r\n/**/'];
const gaps = [' ', '/**/', '\\\n', '/* first\nsecond */', ' \\\r\n/**/'];
let language: Language;

beforeAll(async () => {
  await Parser.init();
  language = await Language.load('tree-sitter-c.wasm');
});

test.each(directives)('recognizes a directive after leading logical whitespace: %j', (directive) => {
  for (const prefix of prefixes) {
    const source = `${prefix}${directive}int following;\n`;
    withTree(source, (tree) => {
      expect(tree.rootNode.hasError, source).toBe(false);
      expect(tree.rootNode.descendantsOfType('declaration').at(-1)?.text).toBe('int following;');
      const keyword = tree.rootNode.descendantsOfType(['#define', 'preproc_directive', '#if', '#ifdef'])[0];
      expect(keyword?.startIndex, source).toBe(prefix.length);
      expect(keyword?.text, source).toBe(directive.slice(0, directive.indexOf(' ')));
    });
  }
});

test.each(directives)('rejects a directive after a token on the same logical line: %j', (directive) => {
  for (const gap of gaps) {
    withTree(`int before;${gap}${directive}int following;\n`, (tree) => {
      expect(tree.rootNode.hasError).toBe(true);
    });
  }
});

test.each(['\n', '\r', '\r\n', '\n\r'])('starts directives after a physical newline %j', (newline) => {
  const source = `int before;${newline}/* leading */#define VALUE 1${newline}int following = VALUE;${newline}`;
  withTree(source, (tree) => {
    expect(tree.rootNode.hasError).toBe(false);
    expect(tree.rootNode.descendantsOfType('preproc_def')[0]?.childForFieldName('name')?.text).toBe('VALUE');
    expect(tree.rootNode.descendantsOfType('declaration').map((node) => node.text)).toEqual([
      'int before;',
      'int following = VALUE;',
    ]);
  });
  withTree(`int before;\\${newline}#define VALUE 1${newline}int following;${newline}`, (tree) => {
    expect(tree.rootNode.hasError).toBe(true);
  });
});

test('does not let the conditional-marker path accept a midline directive', () => {
  withTree(
    '#define MARKER __attribute__((unused))\nint before; #ifdef ENABLED\nMARKER\n#endif\nint value;\n',
    (tree) => {
      expect(tree.rootNode.hasError).toBe(true);
    }
  );
});

test('rebuilds directive positions for independent full parses', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const prefix of ['            ', 'int before; ', '            ']) {
      const source = `${prefix}#define VALUE 1\nint following;\n`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError).toBe(prefix.startsWith('int'));
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
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
