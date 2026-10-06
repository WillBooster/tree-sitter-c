import path from 'node:path';

import { Edit, Language, Parser, type Point, Query } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

await Parser.init();
const language = await Language.load(path.join(import.meta.dirname, '../../tree-sitter-c.wasm'));

test('bounds unbraced switch bodies without changing grouped cases', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  const query = new Query(language, '(switch_statement body: (_) @body)');
  try {
    for (const body of [
      'case 0: ;',
      'case 0: case 1: x++;',
      'default: x--;',
      'label: case 0: x++;',
      'case 0: if (x) case 1: x++; else x--;',
      'case 0: while (x) case 1: x--;',
      'case 0: do case 1: x--; while (x);',
      'case 0: for (; x; x--) case 1: ;',
      'case 0: [[likely]] x++;',
      'x++;',
      '{ case 0: x++; x++; break; default: break; }',
    ]) {
      const tree = parser.parse(`int f(int x) { switch (x) ${body} x += 2; return x; }`)!;
      try {
        expect(tree.rootNode.hasError, body).toBe(false);
        const statements = tree.rootNode.firstNamedChild!.childForFieldName('body')!.namedChildren;
        expect(statements.map((node) => node.type)).toEqual([
          'switch_statement',
          'expression_statement',
          'return_statement',
        ]);
        expect(statements[0]!.childForFieldName('body')?.text).toBe(body);
        expect(statements[1]!.text).toBe('x += 2;');
        expect(query.captures(tree.rootNode).map(({ node }) => node.text)).toEqual([body]);
        if (body.startsWith('{')) {
          expect(statements[0]!.descendantsOfType('case_statement')[0]!.namedChildren.map((node) => node.type)).toEqual(
            ['number_literal', 'expression_statement', 'expression_statement', 'break_statement']
          );
        }
      } finally {
        tree.delete();
      }
    }
  } finally {
    query.delete();
    parser.delete();
  }
});

test.each(['case 0:', 'default:', 'case 0: case 1:'])('accepts trailing C23 switch label %s', (body) => {
  const parser = new Parser();
  parser.setLanguage(language);
  const tree = parser.parse(`void f(int x) { switch (x) ${body} }`)!;
  try {
    expect(tree.rootNode.hasError, body).toBe(false);
    const node = tree.rootNode.descendantsOfType('switch_statement')[0]!;
    expect(node.childForFieldName('body')?.text).toBe(body);
    expect(node.descendantsOfType('expression_statement')).toHaveLength(0);
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('keeps conditionally compiled case statements inside the switch', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const conditional of [
      '#if 1\nx++;\n#endif',
      '#ifdef ENABLE\nx++;\n#else\nx--;\n#endif',
      '#if A\n#if B\nx++;\n#endif\n#endif',
      '#ifdef ENABLE\nx++; x--;\n#else\nx--; x++;\n#endif',
      '#if A\nx++;\n#if B\nx--;\n#endif\n#endif',
      '#if A\nx++; case 1: x--;\n#endif',
    ]) {
      const source = `int f(int x) { switch (x) case 0:\n${conditional}\nreturn x; }`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        const statements = tree.rootNode.firstNamedChild!.childForFieldName('body')!.namedChildren;
        expect(
          statements.map((n) => n.type),
          source
        ).toEqual(['switch_statement', 'return_statement']);
        expect(statements[0]!.childForFieldName('body')?.text, source).toBe(`case 0:\n${conditional}`);
        expect(statements[0]!.descendantsOfType('update_expression').length, source).toBeGreaterThan(0);
        expect(statements[1]!.text, source).toBe('return x;');
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('keeps switch recovery and body captures consistent after directive edits', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  const query = new Query(language, '(switch_statement body: (_) @body)');
  const cases = [
    ['{switch(x){f\ny+;}return;}', 'switch(x)'],
    [
      'int f(int x, int y){ switch (x) { case 0:\n#ifdef E\nx++;\n#else\nx--;\n#endif\ny++;\n}\nreturn x; }\n',
      'switch (x) ',
    ],
  ];
  try {
    for (const [original, marker] of cases) {
      let source = original!;
      const offset = source.indexOf(marker!) + marker!.length;
      let tree = parser.parse(source)!;
      try {
        for (const insert of [true, false, true, false]) {
          const oldEnd = offset + (insert ? 0 : 6);
          const replacement = insert ? '#else\n' : '';
          const next = source.slice(0, offset) + replacement + source.slice(oldEnd);
          tree.edit(
            new Edit({
              startIndex: offset,
              oldEndIndex: oldEnd,
              newEndIndex: offset + replacement.length,
              startPosition: positionAt(source, offset),
              oldEndPosition: positionAt(source, oldEnd),
              newEndPosition: positionAt(next, offset + replacement.length),
            })
          );
          const incremental = parser.parse(next, tree)!;
          tree.delete();
          tree = incremental;
          const fresh = parser.parse(next)!;
          try {
            expect(tree.rootNode.toString()).toBe(fresh.rootNode.toString());
            expect(tree.rootNode.hasError).toBe(fresh.rootNode.hasError);
            const bodies = (parsed: typeof tree): { text: string; start: Point; end: Point }[] =>
              query.captures(parsed.rootNode).map(({ node }) => ({
                text: node.text,
                start: node.startPosition,
                end: node.endPosition,
              }));
            expect(bodies(tree)).toEqual(bodies(fresh));
            if (insert) expect(bodies(tree).some(({ text }) => text.startsWith('{'))).toBe(true);
          } finally {
            fresh.delete();
          }
          source = next;
        }
      } finally {
        tree.delete();
      }
    }
  } finally {
    query.delete();
    parser.delete();
  }
});

function positionAt(source: string, offset: number): Point {
  const lines = source.slice(0, offset).split('\n');
  return { row: lines.length - 1, column: lines.at(-1)!.length };
}
