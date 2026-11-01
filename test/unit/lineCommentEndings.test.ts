import { Language, Parser } from '@willbooster/web-tree-sitter';
import { beforeAll, expect, test } from 'vitest';

const newlines = ['\n', '\r', '\r\n', '\n\r'];
let language: Language;

beforeAll(async () => {
  await Parser.init();
  language = await Language.load('tree-sitter-c.wasm');
});

test.each(newlines)('ends a line comment before the next declaration at %j', (newline) => {
  withTree(`int before;${newline}// ignored @${newline}int after;${newline}`, (tree) => {
    expect(tree.rootNode.hasError).toBe(false);
    expect(tree.rootNode.descendantsOfType('comment').map((node) => node.text)).toEqual(['// ignored @']);
    expect(tree.rootNode.descendantsOfType('declaration').map((node) => node.text)).toEqual([
      'int before;',
      'int after;',
    ]);
  });
});

test.each(newlines)('retains declarations after comments in macro-type and pragma arguments at %j', (newline) => {
  for (const prefix of [
    `#define TYPE(...) __VA_ARGS__${newline}TYPE( // ignored @${newline}struct { int member; }) value;${newline}`,
    `_Pragma(// ignored @${newline}"once"// ignored @${newline})${newline}`,
  ]) {
    withTree(`${prefix}int after;${newline}`, (tree) => {
      expect(tree.rootNode.hasError).toBe(false);
      expect(tree.rootNode.namedChildren.at(-1)?.text).toBe('int after;');
      if (prefix.startsWith('#')) {
        expect(tree.rootNode.descendantsOfType('field_declaration')[0]?.childForFieldName('declarator')?.text).toBe(
          'member'
        );
        expect(tree.rootNode.descendantsOfType('declaration')[0]?.childForFieldName('declarator')?.text).toBe('value');
      } else {
        expect(tree.rootNode.descendantsOfType('pragma_operator')[0]?.text).toBe(prefix.trim());
      }
    });
  }
});

test.each(newlines)('recognizes a spliced block-comment terminator in pragma spacing at %j', (newline) => {
  const pragma = `_Pragma(/* ignored *\\${newline}/ "once")`;
  withTree(`${pragma}${newline}int after;${newline}`, (tree) => {
    expect(tree.rootNode.hasError).toBe(false);
    expect(tree.rootNode.descendantsOfType('pragma_operator').map((node) => node.text)).toEqual([pragma]);
    expect(tree.rootNode.namedChildren.at(-1)?.text).toBe('int after;');
  });
});

test.each(newlines)('splices a comment across %j after each trailing backslash run', (newline) => {
  for (const count of [1, 2, 3]) {
    const comment = `// retained ${'\\'.repeat(count)}${newline}int hidden;`;
    withTree(`int before;${newline}${comment}${newline}int after;${newline}`, (tree) => {
      expect(tree.rootNode.hasError).toBe(false);
      expect(tree.rootNode.descendantsOfType('comment').map((node) => node.text)).toEqual([comment]);
      expect(tree.rootNode.descendantsOfType('declaration').map((node) => node.text)).toEqual([
        'int before;',
        'int after;',
      ]);
    });
  }
});

test.each([1, 2, 3])('retains %i trailing backslashes in a comment at EOF', (count) => {
  const comment = `// trailing ${'\\'.repeat(count)}`;
  withTree(`int before;\n${comment}`, (tree) => {
    expect(tree.rootNode.hasError).toBe(false);
    expect(tree.rootNode.descendantsOfType('comment').map((node) => node.text)).toEqual([comment]);
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
