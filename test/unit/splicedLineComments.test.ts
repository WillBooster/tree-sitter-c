import { Language, Parser } from '@willbooster/web-tree-sitter';
import { beforeAll, expect, test } from 'vitest';

const openings = ['//', '/\\\n/', '/\\\r\n/', '/\\\r/', '/\\\n\r/', '/\\\n\\\r\n/'];

let language: Language;

beforeAll(async () => {
  await Parser.init();
  language = await Language.load('tree-sitter-c.wasm');
});

test.each(openings)('retains declarations around a line-comment opener %j', (opening) => {
  const comment = `${opening} ignored @ broken */`;
  withTree(`int before;\n${comment}\nint after;\n`, (tree) => {
    expect(tree.rootNode.hasError).toBe(false);
    expect(tree.rootNode.descendantsOfType('comment').map((node) => node.text)).toEqual([comment]);
    expect(tree.rootNode.descendantsOfType('declaration').map((node) => node.text)).toEqual([
      'int before;',
      'int after;',
    ]);
  });
});

test.each(openings)(
  'retains the macro argument and following declaration across a line-comment opener %j',
  (opening) => {
    withTree(`#define VALUE 7 ${opening} ignored @ broken */\nint result = VALUE;\n`, (tree) => {
      expect(tree.rootNode.hasError).toBe(false);
      const macros = tree.rootNode.descendantsOfType('preproc_def');
      expect(macros).toHaveLength(1);
      expect(macros[0]!.childForFieldName('name')?.text).toBe('VALUE');
      expect(macros[0]!.childForFieldName('value')?.text).toBe(`7 ${opening} ignored @ broken */`);
      expect(tree.rootNode.descendantsOfType('declaration').map((node) => node.text)).toEqual(['int result = VALUE;']);
    });
  }
);

test.each(openings.slice(1))('keeps a spliced slash pair inside a string %j', (opening) => {
  withTree(`const char *value = "${opening}";\nint after;\n`, (tree) => {
    expect(tree.rootNode.hasError).toBe(false);
    expect(tree.rootNode.descendantsOfType('string_literal').map((node) => node.text)).toEqual([`"${opening}"`]);
    expect(tree.rootNode.descendantsOfType('comment')).toHaveLength(0);
    expect(tree.rootNode.descendantsOfType('declaration').at(-1)?.text).toBe('int after;');
  });
});

test.each(['\n', ' \n', String.raw`\x`])('does not treat a slash pair separated by %j as a line comment', (gap) => {
  withTree(`int before;\n/${gap}/ ignored @ broken\nint after;\n`, (tree) => {
    expect(tree.rootNode.hasError).toBe(true);
  });
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
