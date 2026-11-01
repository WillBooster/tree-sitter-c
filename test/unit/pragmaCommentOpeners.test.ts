import { Language, Parser } from '@willbooster/web-tree-sitter';
import { beforeAll, expect, test } from 'vitest';

let language: Language;

beforeAll(async () => {
  await Parser.init();
  language = await Language.load('tree-sitter-c.wasm');
});

test.each(['\n', '\r', '\r\n', '\n\r'])('recognizes spliced pragma comment openers at %j', (newline) => {
  for (const comment of [`/\\${newline}/ ignored${newline}`, `/\\${newline}* ignored */`]) {
    for (const pragma of [`_Pragma${comment}("once")`, `_Pragma(${comment}"once")`, `_Pragma("once"${comment})`]) {
      withTree(`${pragma}${newline}int following;${newline}`, (tree) => {
        expect(tree.rootNode.hasError, pragma).toBe(false);
        expect(tree.rootNode.descendantsOfType('pragma_operator').map((node) => node.text)).toEqual([pragma]);
        expect(tree.rootNode.namedChildren.at(-1)?.text).toBe('int following;');
      });
    }
  }
});

test.each(['\n', '\r', '\r\n', '\n\r'])('keeps consecutive splices inside a pragma comment opener at %j', (newline) => {
  for (const delimiter of ['/', '*']) {
    const comment =
      delimiter === '/'
        ? `/${`\\${newline}`.repeat(3)}/ ignored${newline}`
        : `/${`\\${newline}`.repeat(3)}* ignored */`;
    const pragma = `_Pragma(${comment}"once")`;
    withTree(`${pragma}${newline}int following;${newline}`, (tree) => {
      expect(tree.rootNode.hasError).toBe(false);
      expect(tree.rootNode.descendantsOfType('pragma_operator')[0]?.text).toBe(pragma);
      expect(tree.rootNode.namedChildren.at(-1)?.text).toBe('int following;');
    });
  }
});

test.each([String.raw`/\* ignored */`, String.raw`/\x* ignored */`, '/\\\n* unfinished', '/\\\n/ ignored'])(
  'reports an error for malformed or unfinished pragma spacing %j',
  (comment) => {
    withTree(`_Pragma(${comment}"once")\nint following;\n`, (tree) => {
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
