import path from 'node:path';

import { Language, Parser } from '@willbooster/web-tree-sitter';
import { beforeAll, expect, test } from 'vitest';

const gaps = ['', ' \t\v\f', '/**/', '/* first\nsecond */', '// comment', '\\\r\n/**/'];
const contexts = [
  ['function', 'void f(void) {\n#\nint result;\n}\n', 1, 'function_definition'],
  ['structure', 'struct Fields {\n#\nint field;\n};\n', 1, 'field_declaration'],
  ['enumeration', 'enum Flags {\n#\nFIRST,\n#\nSECOND\n};\n', 2, 'enumerator'],
  ['initializer', 'int values[] = {\n#\n1,\n#\n2\n};\n', 2, 'number_literal'],
  ['conditional', '#if 1\n#\nint result;\n#endif\n', 1, 'preproc_if'],
] as const;

let language: Language;

beforeAll(async () => {
  await Parser.init();
  language = await Language.load(path.join(import.meta.dirname, '../../tree-sitter-c.wasm'));
});

test.each(gaps)('ends an empty directive after %j', (gap) => {
  checkSource(`#${gap}\nint result;\n`, 1, (tree) => {
    expect(tree.rootNode.descendantsOfType('declaration')[0]!.childForFieldName('declarator')?.text).toBe('result');
  });
});

test.each(contexts)('keeps an empty directive inside its %s', (_name, source, count, nodeType) => {
  checkSource(source, count, (tree) => {
    const nodes = tree.rootNode.descendantsOfType(nodeType);
    expect(nodes.length).toBeGreaterThan(0);
    if (nodeType === 'enumerator') {
      expect(nodes.map((node) => node.childForFieldName('name')?.text)).toEqual(['FIRST', 'SECOND']);
    } else if (nodeType === 'number_literal') {
      expect(nodes.map((node) => node.text)).toEqual(['1', '2']);
    } else if (nodeType === 'field_declaration') {
      expect(nodes[0]!.childForFieldName('declarator')?.text).toBe('field');
    } else if (nodeType === 'function_definition') {
      expect(nodes[0]!.childForFieldName('body')?.descendantsOfType('declaration')).toHaveLength(1);
    } else {
      expect(nodes[0]!.childForFieldName('condition')?.text).toBe('1');
    }
  });
});

test.each(['#@\n', '##\n', '#/* unterminated'])('reports an invalid empty-directive candidate %j', (source) => {
  withTree(`${source}\nint following;\n`, (tree) => {
    expect(tree.rootNode.hasError).toBe(true);
  });
});

function checkSource(
  source: string,
  count: number,
  check: (tree: NonNullable<ReturnType<Parser['parse']>>) => void
): void {
  withTree(`${source}int following;\n`, (tree) => {
    expect(tree.rootNode.hasError, source).toBe(false);
    const calls = tree.rootNode.descendantsOfType('preproc_call');
    expect(calls).toHaveLength(count);
    for (const call of calls) {
      expect(call.childForFieldName('directive')?.text).toBe('#');
      expect(call.childForFieldName('argument')?.text).toBeUndefined();
    }
    expect(tree.rootNode.namedChildren.at(-1)?.text).toBe('int following;');
    check(tree);
  });
}

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
