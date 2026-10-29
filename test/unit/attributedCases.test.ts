import path from 'node:path';

import { Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

await Parser.init();
const language = await Language.load(path.join(import.meta.dirname, '../../tree-sitter-c.wasm'));

test('parses attributed case labels and recovers from a broken declarator', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const [source, hasError] of [
      ['i(x){if(x){case 1:[[a]]e:[[a]];;}e k;}', false],
      ['i x){if(x){case 1:[[a]]e:[[a]];;}e k;}', true],
    ] as const) {
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.endIndex).toBe(source.length);
        expect(tree.rootNode.hasError).toBe(hasError);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('keeps labeled statements within every single-statement body inside a case', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const prefix of ['while (x)', 'for (;;)', 'if (x)', 'switch (x)', 'do']) {
      for (const attribute of ['', '[[vendor::label]] ']) {
        for (const label of ['case 2:', 'default:']) {
          for (const body of [';', '{}', 'x++;']) {
            const inner = `${attribute}${label} ${body}`;
            const control = `${prefix} first: second: ${inner}${prefix === 'do' ? ' while (x);' : ''}`;
            const source = `void f() { switch (x) { case 1: ${control} after(); } }`;
            const tree = parser.parse(source)!;
            try {
              expect(tree.rootNode.hasError, source).toBe(false);
              const cases = tree.rootNode.descendantsOfType('case_statement');
              expect(cases, source).toHaveLength(2);
              expect(cases[1]!.text, source).toBe(inner);
              expect(cases[1]!.namedChildren.filter((node) => node.type === 'attribute_declaration')).toHaveLength(
                attribute ? 1 : 0
              );
              expect(cases[0]!.lastNamedChild!.text, source).toBe('after();');
            } finally {
              tree.delete();
            }
          }
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('preserves preprocessor arguments around leading and trailing comments', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const gap of ['/**/', '/* one */ /* two */', '/* one\ntwo */']) {
      for (const [source, type, field, value] of [
        [`#define M ${gap} x ${gap}\n`, 'preproc_def', 'value', 'x'],
        [`#define F(x) ${gap} x ${gap}\n`, 'preproc_function_def', 'value', 'x'],
        [`#pragma ${gap} once ${gap}\n`, 'preproc_call', 'argument', 'once'],
        [`int a[] = {\n#pragma ${gap} once ${gap}\n1};`, 'preproc_call', 'argument', 'once'],
      ]) {
        const tree = parser.parse(source!)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          const directive = tree.rootNode.descendantsOfType(type!)[0]!;
          expect(directive.childForFieldName(field!)!.text.trim(), source).toBe(value);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('groups cases beneath block labels without extending unbraced control bodies', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const preceding of ['', 'before(); ', 'case 0: a(); break; ', 'case 0:', 'case 0: break; case 2:']) {
      for (const labels of [
        'first:',
        'first: second:',
        '[[a]] first: [[b]] second:',
        '[[a]] [[b]] first:',
        '[[a]] [[b]] first: [[c]] [[d]] second:',
      ]) {
        for (const attribute of ['', '[[vendor::label]] ']) {
          for (const label of ['case 1:', 'default:']) {
            const body = `${attribute}${label} x++; break;`;
            const source = `void f() { switch (x) { ${preceding}${labels} ${body} } }`;
            const tree = parser.parse(source)!;
            try {
              expect(tree.rootNode.hasError, source).toBe(false);
              const caseNode = tree.rootNode.descendantsOfType('case_statement').find((node) => node.text === body)!;
              expect(caseNode.text, source).toBe(body);
              expect(caseNode.lastNamedChild!.type, source).toBe('break_statement');
              expect(caseNode.parent!.type, source).toBe('labeled_statement');
              let container = caseNode.parent!;
              while (['labeled_statement', 'attributed_statement'].includes(container.type))
                container = container.parent!;
              if (preceding.includes('case')) {
                expect(container.type, source).toBe('case_statement');
                expect(container.childForFieldName('value')?.text, source).toBe(
                  preceding.includes('case 2:') ? '2' : '0'
                );
              } else {
                expect(container.type, source).toBe('compound_statement');
              }
            } finally {
              tree.delete();
            }
          }
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('accepts pragma extras before immediate preprocessing newlines', () => {
  const parser = new Parser().setLanguage(language);
  try {
    const pragma = '_Pragma("clang diagnostic push")';
    for (const extra of [pragma, `/**/ ${pragma} /**/`, `${pragma} ${pragma}`]) {
      for (const source of [
        `#if 1 ${extra}\nint x;\n#endif\n`,
        `#if 0\n#elif 1 ${extra}\nint x;\n#endif\n`,
        `#include "a.h" ${extra}\n`,
        `#define X /**/ ${extra}\n`,
        `#define F(x) /**/ ${extra}\n`,
        `#pragma /**/ ${extra}\n`,
        `int a[] = {\n#pragma /**/ ${extra}\n1};`,
      ]) {
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          expect(
            tree.rootNode
              .descendantsOfType(['pragma_operator', 'preproc_arg'])
              .some((node) => node.text.includes(pragma)),
            source
          ).toBe(true);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('retains comments between preprocessing condition operands', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const condition of [
      'defined(A) /* legacy */ && defined(B)',
      'FOO /**/ == 1',
      'A /* gap */ + 1 > 2',
      '(A /* gap */ + 1) == B',
      String.raw`A /* gap */ && \
B`,
    ]) {
      for (const prefix of ['#if', '#if 0\n#elif']) {
        for (const trailing of ['', ' /* tail */', ' _Pragma("once") /* tail */']) {
          const source = `${prefix} ${condition}${trailing}\nint x;\n#endif\n`;
          const tree = parser.parse(source)!;
          try {
            expect(tree.rootNode.hasError, source).toBe(false);
            expect(
              tree.rootNode.descendantsOfType('declaration').map((node) => node.text),
              source
            ).toEqual(['int x;']);
          } finally {
            tree.delete();
          }
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('ends commented preprocessing conditions at each supported line ending', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const newline of ['\n', '\r\n', '\r', '\n\r']) {
      const source = `#if A /* gap */ && B /* tail */${newline}int after;${newline}#endif${newline}`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, JSON.stringify(source)).toBe(false);
        expect(tree.rootNode.descendantsOfType('declaration').map((node) => node.text)).toEqual(['int after;']);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('preserves canonical queries for attributed and labeled statement bodies', () => {
  const parser = new Parser().setLanguage(language);
  const query = new Query(language, '(statement) @statement');
  const source =
    'void f(){ [[a]] c(); l: d(); switch(x){case 1: [[a]] e(); m: g(); label: case 2: h();} while(x) [[a]] i(); }';
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    const captures = query.captures(tree.rootNode).map(({ node }) => node.text);
    for (const body of ['c();', 'd();', 'e();', 'g();', 'i();', 'case 2: h();']) expect(captures).toContain(body);
  } finally {
    tree.delete();
    query.delete();
    parser.delete();
  }
});

test('bounds spliced preprocessing conditions in declaration and initializer contexts', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const condition of [
      'A /* gap */ && B',
      String.raw`A \
 /* gap */ && B`,
    ]) {
      for (const source of [
        `void f(){\n#if ${condition}\na();\n#endif\nafter();}`,
        `enum E{\n#if ${condition}\nA,\n#endif\nafter};`,
        `int a[]={\n#if ${condition}\n1,\n#endif\nafter};`,
      ]) {
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          expect(
            tree.rootNode.descendantsOfType('identifier').some((node) => node.text === 'after'),
            source
          ).toBe(true);
          expect(tree.rootNode.descendantsOfType('preproc_if')).toHaveLength(1);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('keeps consecutive statement attributes in one node across case and control contexts', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const attributes of ['[[a]] [[b]]', '[[a]] [[b]] [[c]]']) {
      for (const prefix of ['', 'first:', 'while (x)', 'if (x)', 'first: while (x)']) {
        for (const context of ['', 'switch (x) { case 1:', 'switch (x) case 1:']) {
          const statement = `${attributes} x++;`;
          const source = `void f() { ${context} ${prefix} ${statement} ${context.includes('{') ? '}' : ''} }`;
          const tree = parser.parse(source)!;
          try {
            expect(tree.rootNode.hasError, source).toBe(false);
            const attributed = tree.rootNode.descendantsOfType('attributed_statement');
            expect(attributed, source).toHaveLength(1);
            expect(attributed[0]!.text, source).toBe(statement);
            expect(
              attributed[0]!.namedChildren.filter((node) => node.type === 'attribute_declaration'),
              source
            ).toHaveLength(attributes.split(' ').length);
            const query = new Query(language, '(statement) @statement');
            try {
              expect(
                query.captures(tree.rootNode).some(({ node }) => node.text === 'x++;'),
                source
              ).toBe(true);
            } finally {
              query.delete();
            }
          } finally {
            tree.delete();
          }
        }
      }
    }
  } finally {
    parser.delete();
  }
});
