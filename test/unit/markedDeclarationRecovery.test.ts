import { Language, Parser, Query, type Tree } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

const declarations = [
  'MARK struct S w = {0};',
  'MARK Word w = {0};',
  'static MARK Word w = {0};',
  'MARK Word w = {0}, v;',
  'UNUSED Pos tags = {0};',
  'MARK int w = {0};',
  'MARK Word w = 0;',
  'MARK Word *w = {0};',
];
const trailers = [
  ['static const struct S x __read_mostly;', '__read_mostly'],
  ['static volatile struct S x __aligned(8);', 'x'],
  ['static const struct S x __section(".data");', 'x'],
];
const header = `#define MARK
#define UNUSED
#define TYPE(...) __VA_ARGS__
#define ANNOTATE(...)
#define __read_mostly
#define __aligned(...)
#define __section(...)
struct S { int a; };
typedef int Word;
typedef struct S Pos;
`;
const following = 'int after(void) { return 1; }';

test('confines marked initializer and trailing marker recovery to their declarations', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser();
  let query: Query | undefined;
  try {
    parser.setLanguage(language);
    query = new Query(
      language,
      '(declaration type: (struct_specifier) @recovered.type declarator: (_) @recovered.name)'
    );
    for (const [statement, expectedDeclarator] of [
      ...declarations.map((statement) => [statement, undefined] as const),
      ...trailers,
    ]) {
      const local = declarations.includes(statement);
      const text = header + (local ? `int g(void) {\n  ${statement}\n  return 0;\n}\n` : `${statement}\n`) + following;
      let tree: Tree | undefined;
      try {
        tree = parser.parse(text)!;
        const check = (current: Tree, source: string): void => {
          const functions = current.rootNode.descendantsOfType('function_definition');
          expect(functions.map((node) => node.childForFieldName('declarator')?.text)).toEqual(
            local ? ['g(void)', 'after(void)'] : ['after(void)']
          );
          const after = functions.at(-1)!;
          expect([after.text, after.startIndex, after.endIndex, after.hasError]).toEqual([
            following,
            source.indexOf(following),
            source.length,
            false,
          ]);
          if (local) {
            const g = functions[0]!;
            expect(g.startIndex).toBe(source.indexOf('int g(void)'));
            expect(g.childForFieldName('body')?.text).toBe(
              source.slice(source.indexOf('{', g.startIndex), source.indexOf(`\n${following}`))
            );
          } else {
            const declaration = current.rootNode.namedChildren.find((node) => node.type === 'declaration');
            expect(declaration?.childForFieldName('type')?.text).toBe('struct S');
            expect(declaration?.childForFieldName('declarator')?.text).toBe(expectedDeclarator);
            expect(declaration?.endIndex).toBeLessThanOrEqual(after.startIndex);
            expect(
              query!
                .captures(current.rootNode)
                .filter(({ name }) => name === 'recovered.type' || name === 'recovered.name')
                .map(({ node }) => node.text)
            ).toEqual(['struct S', expectedDeclarator]);
          }
        };
        check(tree, text);
        checkCommentInsertion(parser, text, text.indexOf(statement), check);
      } finally {
        tree?.delete();
      }
    }
  } finally {
    query?.delete();
    parser.delete();
  }
});

test('keeps non-type and multi-argument annotations after proved marked types', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser();
  try {
    parser.setLanguage(language);
    for (const type of ['int', 'TYPE(int)', 'struct S']) {
      for (const argument of [
        'struct { int z; }',
        '(int[]){1}',
        '({ int x = 1; x; })',
        '{1, 2}',
        'int, (int[]){1}',
        'arg, {1}',
        '7, 8, {1}',
      ]) {
        const text = `${header}MARK ${type} ANNOTATE(${argument}) f(void);\n${following}`;
        let tree: Tree | undefined;
        try {
          tree = parser.parse(text)!;
          const check = (current: Tree, source: string): void => {
            expect(current.rootNode.hasError).toBe(false);
            const declaration = current.rootNode.namedChildren.find((node) => node.type === 'declaration')!;
            expect(declaration.childForFieldName('type')?.text).toBe(type);
            expect(declaration.childForFieldName('declarator')?.text).toBe('f(void)');
            const attribute = declaration.descendantsOfType('attribute_specifier')[0]!;
            expect(attribute.childForFieldName('name')?.text).toBe('ANNOTATE');
            expect(attribute.childForFieldName('arguments')?.text).toBe(
              source.slice(source.indexOf('(', source.indexOf('ANNOTATE(', header.length)), source.indexOf(' f(void)'))
            );
            expect(current.rootNode.namedChildren.at(-1)?.text).toBe(following);
          };
          check(tree, text);
          checkCommentInsertion(parser, text, text.indexOf('{', header.length), check);
        } finally {
          tree?.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('retains function typedef ownership when array bounds contain braced types', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser();
  try {
    parser.setLanguage(language);
    for (const declaration of [
      'typedef Word F(int x[sizeof(struct { int m; })]);',
      'typedef Word F(int x[sizeof(union { int m; })]);',
      'typedef Word F(int x[sizeof(enum { MEMBER })]);',
      'typedef Word F(int x[(int){1}]);',
      'typedef const Word F(int x[sizeof(struct { int m; })]);',
      'const typedef Word F(int x[sizeof(struct { int m; })]);',
      'MARK typedef Word F(int x[sizeof(struct { int m; })]);',
    ]) {
      const source = header + declaration + '\nF *callback;\n' + following;
      let tree: Tree | undefined;
      try {
        tree = parser.parse(source)!;
        const check = (current: Tree, text: string): void => {
          expect(current.rootNode.hasError).toBe(false);
          const definition = current.rootNode.descendantsOfType('type_definition').at(-1)!;
          expect(definition.childForFieldName('type')?.type).toBe('type_identifier');
          expect(definition.childForFieldName('type')?.text.replaceAll(/\\\r?\n/g, '')).toBe('Word');
          const declarator = definition.childForFieldName('declarator')!;
          expect(declarator.type).toBe('function_declarator');
          expect(declarator.childForFieldName('declarator')?.type).toBe('type_identifier');
          expect(declarator.childForFieldName('declarator')?.text).toBe('F');
          expect(definition.startIndex).toBeGreaterThanOrEqual(header.length);
          expect(definition.endIndex).toBeLessThan(text.indexOf('F *callback;'));
          expect(current.rootNode.namedChildren.at(-1)?.text).toBe(following);
        };
        check(tree, source);
        checkCommentInsertion(parser, source, source.indexOf('{', header.length), check);
      } finally {
        tree?.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('keeps marked nested function declarators with braced parameter bounds', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c.wasm');
  const parser = new Parser();
  try {
    parser.setLanguage(language);
    for (const declaration of [
      'MARK Word (*f(int x[sizeof(struct { int m; })]))(int);',
      'static MARK Word (*f(int x[sizeof(struct { int m; })]))(int);',
      'MARK Word (**f(int x[sizeof(struct { int m; })]))(int);',
      'MARK Word (*(*f(int x[sizeof(struct { int m; })]))[2])(int);',
      'MARK Word (*f(int x[(int){1}]))(int);',
      'MARK Word (*f(int x[sizeof(union { int m; })]))(int);',
      'MARK Word (*f(int x[sizeof(enum { MEMBER })]))(int);',
      'MARK Word (*f(int x[sizeof(struct { int m; })]))(int) { return 0; }',
      'MARK Word (/* comment */ *f(int x[sizeof(struct { int m; })]))(int);',
    ]) {
      const source = header + declaration + '\n' + following;
      let tree: Tree | undefined;
      try {
        tree = parser.parse(source)!;
        const check = (current: Tree, text: string): void => {
          expect(current.rootNode.hasError).toBe(false);
          const node = current.rootNode.namedChildren.find(
            (child) => ['declaration', 'function_definition'].includes(child.type) && child.startIndex >= header.length
          )!;
          expect(node.childForFieldName('type')?.type).toBe('type_identifier');
          expect(node.childForFieldName('type')?.text).toBe('Word');
          expect(node.childForFieldName('declarator')?.type).toBe('function_declarator');
          const declaratorNames = node.descendantsOfType('function_declarator').flatMap((child) => {
            const name = child.childForFieldName('declarator');
            return name?.type === 'identifier' ? [name.text] : [];
          });
          expect(declaratorNames).toEqual(['f']);
          const after = current.rootNode.namedChildren.at(-1)!;
          expect([after.type, after.text, after.startIndex, after.endIndex, after.hasError]).toEqual([
            'function_definition',
            following,
            text.indexOf(following),
            text.length,
            false,
          ]);
        };
        check(tree, source);
        checkCommentInsertion(parser, source, source.indexOf('{', header.length), check);
      } finally {
        tree?.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

function checkCommentInsertion(
  parser: Parser,
  source: string,
  at: number,
  check: (current: Tree, text: string) => void
): void {
  const commented = source.slice(0, at) + '/* edit */' + source.slice(at);
  const tree = parser.parse(commented)!;
  try {
    check(tree, commented);
  } finally {
    tree.delete();
  }
}
