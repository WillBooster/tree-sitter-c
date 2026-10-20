import fs from 'node:fs';

import { Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test('exposes uppercase TRUE and FALSE names as identifiers in expressions', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser().setLanguage(language);
  const source = `int consume(int value);
int evaluate(int TRUE, int FALSE) {
  int result = consume(TRUE) + FALSE;
  TRUE = result;
  return TRUE ? FALSE : result;
}
bool truth(void) { return true; }
bool falsity(void) { return false; }`;
  const tree = parser.parse(source)!;
  const identifiers = new Query(language, '(identifier) @identifier');
  const highlights = new Query(language, fs.readFileSync('queries/highlights.scm', 'utf8'));
  const expectedNames = [...source.matchAll(/\b(?:TRUE|FALSE)\b/g)].map((match) => [
    match[0],
    match.index,
    match.index + match[0].length,
  ]);
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(
      tree.rootNode
        .descendantsOfType('assignment_expression')
        .map((node) => [node.childForFieldName('left')?.text, node.childForFieldName('right')?.text])
    ).toEqual([['TRUE', 'result']]);
    expect(
      identifiers
        .captures(tree.rootNode)
        .filter(({ node }) => node.text === 'TRUE' || node.text === 'FALSE')
        .map(({ node }) => [node.text, node.startIndex, node.endIndex])
    ).toEqual(expectedNames);
    expect(
      highlights
        .captures(tree.rootNode)
        .filter(({ name, node }) => name === 'constant' && (node.text === 'TRUE' || node.text === 'FALSE'))
        .map(({ node }) => [node.text, node.startIndex, node.endIndex])
    ).toEqual(expectedNames);
    expect(tree.rootNode.descendantsOfType('true').map((node) => node.text)).toEqual(['true']);
    expect(tree.rootNode.descendantsOfType('false').map((node) => node.text)).toEqual(['false']);
  } finally {
    identifiers.delete();
    highlights.delete();
    tree.delete();
    parser.delete();
  }
});
