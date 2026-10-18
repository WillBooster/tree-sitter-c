import path from 'node:path';
import { Language, Parser } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

await Parser.init();
const language = await Language.load(path.join(import.meta.dirname, '../../tree-sitter-c.wasm'));

test('keeps labeled statements within every single-statement body inside a case', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const prefix of ['label:', 'while (x)', 'for (;;)', 'if (x)', 'switch (x)', 'do']) {
      for (const attribute of ['', '[[vendor::label]] ']) {
        for (const label of ['case 2:', 'default:']) {
          for (const body of [';', '{}', 'x++;']) {
            const inner = `${attribute}${label} ${body}`;
            const control = `${prefix} ${inner}${prefix === 'do' ? ' while (x);' : ''}`;
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
